%%%-------------------------------------------------------------------
%%% @doc 全文检索：bitcask（BM25 + jieba 分词）做纯索引，主数据仍在 Mnesia。
%%%
%%% 一个 gen_server 持有 cask 句柄，所有读写都经它串行化。索引是可丢弃的：
%%% 启动时目录为空就从 Mnesia 全量重建，`reindex/0' 随时可以重来。
%%%
%%% 文档：
%%%   task:<ID>   text = title + description + labels   fields title / labels   meta {project, kind=task, status}
%%%   fb:<ID>     text = content                        meta {project, kind=feedback, task}
%%%
%%% jieba 对拉丁词大小写敏感，入库与查询统一小写。
%%%
%%% 过滤（项目 / 类型）按 key 前缀在 Erlang 侧做——key 本身就编码了类型与项目
%%% （`task:BOS-1` / `fb:BOS-1#1`）。原因：加权检索走 `search_fields/3`，它没有
%%% meta filter 参数（只有 `search_text/4` 有）；单人规模 K 放大一点就够。
%%% meta 仍随文档写入（bitcask 6.4.1 起重开后 meta 也能正确恢复），以后要换成
%%% 引擎侧过滤随时可以。
%%%-------------------------------------------------------------------
-module(bosun_search).
-behaviour(gen_server).

-include("bosun.hrl").

-export([start_link/0, start_link/1, search/2, index_task/1, index_feedback/1, remove_feedback/1,
         reindex/0, reset/0, sync/0, status/0]).
-export([init/1, handle_call/3, handle_cast/2, terminate/2]).

-record(st, {dir :: string(), h :: term()}).

-type hit() :: #{type := task | feedback, id := binary(), task_id := binary(), score := float()}.
-export_type([hit/0]).

%%====================================================================
%% API
%%====================================================================

start_link() ->
    Dir = case application:get_env(bosun_core, search_dir) of
              {ok, D} -> D;
              undefined -> filename:join(bosun_store:data_dir(), "search")
          end,
    start_link(Dir).

start_link(Dir) ->
    gen_server:start_link({local, ?MODULE}, ?MODULE, Dir, []).

%% @doc BM25 检索。Opts: #{project => binary(), kinds => [task | feedback], limit => pos_integer()}
%% 返回按分数降序的命中；feedback 命中带所属 task_id，调用方决定怎么聚合。
-spec search(binary(), map()) -> {ok, [hit()]} | {error, term()}.
search(Query0, Opts) ->
    case normalize(Query0) of
        <<>> -> {ok, []};
        Query -> call({search, Query, Opts})
    end.

%% @doc 任务 map（bosun_json:task_full/summary 的输出）入索引；异步，索引失败只记日志。
-spec index_task(map()) -> ok.
index_task(Task) -> gen_server:cast(?MODULE, {index, task_doc(Task)}).

-spec index_feedback(map()) -> ok.
index_feedback(F) -> gen_server:cast(?MODULE, {index, feedback_doc(F)}).

%% @doc 作废的 feedback 从索引里摘掉（旧文本不该再命中）。
-spec remove_feedback(binary()) -> ok.
remove_feedback(Id) -> gen_server:cast(?MODULE, {remove, <<"fb:", Id/binary>>}).

%% @doc 清空并从 Mnesia 全量重建。
-spec reindex() -> {ok, non_neg_integer()} | {error, term()}.
reindex() -> call(reindex).

%% @doc 测试用：清空索引。
-spec reset() -> ok.
reset() -> call(reset).

%% @doc 等待此前所有异步索引请求处理完（gen_server 按序处理，一次 call 即屏障）。
-spec sync() -> ok | {error, term()}.
sync() -> call(sync).

-spec status() -> map().
status() -> call(status).

call(Msg) ->
    try gen_server:call(?MODULE, Msg, 30000)
    catch exit:{noproc, _} -> {error, search_unavailable}
    end.

%%====================================================================
%% gen_server
%%====================================================================

init(Dir) ->
    process_flag(trap_exit, true),
    ok = filelib:ensure_path(Dir),
    case open(Dir) of
        {ok, H} ->
            St = #st{dir = Dir, h = H},
            case bitcask:is_empty_estimate(H) of
                true ->
                    {ok, N} = do_reindex(St),
                    logger:notice("bosun_search: built index from mnesia (~b docs)", [N]);
                false -> ok
            end,
            {ok, St};
        {error, Reason} ->
            {stop, {search_open_failed, Reason}}
    end.

handle_call({search, Query, Opts}, _From, #st{h = H} = St) ->
    {reply, do_search(H, Query, Opts), St};
handle_call(reindex, _From, St) ->
    {reply, do_reindex(St), St};
handle_call(reset, _From, #st{h = H} = St) ->
    lists:foreach(fun(K) -> bitcask:delete(H, K) end, keys(H)),
    {reply, ok, St};
handle_call(sync, _From, St) ->
    {reply, ok, St};
handle_call(status, _From, #st{dir = Dir, h = H} = St) ->
    {reply, #{dir => Dir, docs => length(keys(H))}, St};
handle_call(_Msg, _From, St) ->
    {reply, {error, unknown_call}, St}.

handle_cast({index, {Key, Doc}}, #st{h = H} = St) ->
    case bitcask:put(H, Key, Doc) of
        ok -> ok;
        {error, R} -> logger:warning("bosun_search: index ~s failed: ~p", [Key, R])
    end,
    {noreply, St};
handle_cast({remove, Key}, #st{h = H} = St) ->
    _ = bitcask:delete(H, Key),
    {noreply, St};
handle_cast(_Msg, St) ->
    {noreply, St}.

terminate(_Reason, #st{h = H}) ->
    catch bitcask:close(H),
    ok.

%%====================================================================
%% 内部
%%====================================================================

open(Dir) ->
    _ = application:ensure_all_started(bitcask),
    case bitcask:open(Dir, [read_write, {analyzer, jieba}, {enable_stop_words, true}]) of
        {error, Reason} -> {error, Reason};
        H -> {ok, H}
    end.

keys(H) ->
    case bitcask:list_keys(H) of
        L when is_list(L) -> L;
        _ -> []
    end.

do_reindex(#st{h = H}) ->
    lists:foreach(fun(K) -> bitcask:delete(H, K) end, keys(H)),
    Tasks = mnesia:dirty_select(task, [{'_', [], ['$_']}]),
    Fbs = mnesia:dirty_select(feedback, [{'_', [], ['$_']}]),
    Docs = [task_doc(bosun_json:task_full(T, [])) || T <- Tasks]
        ++ [feedback_doc(bosun_json:feedback_to_map(F)) || F <- Fbs, F#feedback.superseded_by =:= undefined],
    lists:foreach(fun({K, D}) -> ok = bitcask:put(H, K, D) end, Docs),
    {ok, length(Docs)}.

do_search(H, Query, Opts) ->
    Limit = maps:get(limit, Opts, 20),
    Kinds = maps:get(kinds, Opts, [task, feedback]),
    Project = case maps:get(project, Opts, undefined) of
                  undefined -> undefined;
                  P -> bosun_id:normalize_key(P)
              end,
    %% 过滤在结果集上做，所以多取一些：单人规模文档总量小，K 直接放大
    K = max(Limit * 10, 200),
    %% 空白分隔的多个词按 AND 处理（各词分别检索后按 key 求交，分数相加）；
    %% 单个词（含不带空格的中文串）交给 jieba 自己切
    Words = [W || W <- binary:split(Query, [<<" ">>, <<"\t">>, <<"\n">>], [global]), W =/= <<>>],
    Res = case Words of
              [_] -> search_word(H, Query, K);
              _ -> intersect([search_word(H, W, K * 2) || W <- Words])
          end,
    case Res of
        {ok, Hits} ->
            Kept = [Hit || Hit <- Hits, key_matches(Hit, Project, Kinds)],
            {ok, lists:sublist([to_hit(Hit) || Hit <- Kept], Limit)};
        {error, _} = E -> E
    end.

%% 一个词同时打默认字段与 title / labels 字段：标签命中权重 ×8、标题 ×3，
%% 正文 / feedback 只在默认字段里 ×1（bitcask `field:term^boost` 语法，各子句分数相加）。
search_word(H, Word0, K) ->
    Word = binary:replace(Word0, [<<":">>, <<"^">>], <<>>, [global]),
    Expr = <<Word/binary, " title:", Word/binary, "^3 labels:", Word/binary, "^8">>,
    case Word =:= <<>> orelse bitcask:search_fields(H, Expr, K) of
        true -> {ok, []};
        {ok, []} -> prefix_fallback(H, Word, K);
        Other -> Other
    end.

%% 单个拉丁词没命中时按前缀再试一次（"crea" → create）
prefix_fallback(H, Word, K) ->
    case re:run(Word, "^[a-z0-9_]+$", [{capture, none}]) of
        match -> bitcask:search_wildcard(H, <<Word/binary, "*">>, K);
        nomatch -> {ok, []}
    end.

intersect(Results) ->
    case [E || {error, _} = E <- Results] of
        [E | _] -> E;
        [] ->
            Lists = [L || {ok, L} <- Results],
            Maps = [maps:from_list([{Key, {Ord, Score}} || {Key, Ord, Score} <- L]) || L <- Lists],
            Common = lists:foldl(fun(M, Acc) -> maps:with(maps:keys(M), Acc) end, hd(Maps), tl(Maps)),
            Summed = [{Key, Ord, lists:sum([element(2, maps:get(Key, M)) || M <- Maps])}
                      || {Key, {Ord, _}} <- maps:to_list(Common)],
            {ok, lists:sort(fun({_, _, A}, {_, _, B}) -> A >= B end, Summed)}
    end.

key_matches({Key, _, _}, Project, Kinds) ->
    {Type, Id} = id_of(Key),
    lists:member(Type, Kinds)
    andalso (Project =:= undefined orelse project_of(Id) =:= Project).

to_hit({Key, _Ord, Score}) ->
    {Type, Id} = id_of(Key),
    TaskId = case Type of
                 task -> Id;
                 feedback -> hd(binary:split(Id, <<"#">>))
             end,
    #{type => Type, id => Id, task_id => TaskId, score => Score}.

id_of(<<"task:", Id/binary>>) -> {task, Id};
id_of(<<"fb:", Id/binary>>) -> {feedback, Id}.

project_of(Id) -> hd(binary:split(Id, <<"-">>)).

task_doc(#{<<"id">> := Id, <<"project_key">> := Project, <<"title">> := Title} = T) ->
    Desc = maps:get(<<"description">>, T, <<>>),
    Labels = iolist_to_binary(lists:join(<<" ">>, maps:get(<<"labels">>, T, []))),
    Text = normalize(<<Title/binary, "\n", Desc/binary, "\n", Labels/binary>>),
    Meta = bitcask:encode_meta(#{<<"project">> => Project, <<"kind">> => <<"task">>,
                                 <<"status">> => maps:get(<<"status">>, T, <<>>)}),
    {<<"task:", Id/binary>>,
     #{text => Text,
       fields => #{<<"title">> => normalize(Title), <<"labels">> => normalize(Labels)},
       meta => Meta}}.

feedback_doc(#{<<"id">> := Id, <<"task_id">> := TaskId, <<"content">> := Content}) ->
    Meta = bitcask:encode_meta(#{<<"project">> => project_of(TaskId), <<"kind">> => <<"feedback">>,
                                 <<"task">> => TaskId}),
    {<<"fb:", Id/binary>>, #{text => normalize(Content), meta => Meta}}.

normalize(Bin) when is_binary(Bin) ->
    string:lowercase(string:trim(Bin));
normalize(Other) ->
    normalize(bosun_util:to_binary(Other)).
