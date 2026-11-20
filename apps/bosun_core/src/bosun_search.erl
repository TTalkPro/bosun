%%%-------------------------------------------------------------------
%%% @doc 全文检索：bitcask（BM25 + jieba 分词）做纯索引，主数据仍在 Mnesia。
%%%
%%% 写（入索引 / 摘除 / 重建）经一个 gen_server 串行；**读不经过它**：当前句柄发布在
%%% persistent_term 里，`search/2' 在调用进程里直接查（bitcask 句柄可并发读），
%%% 所以检索之间互不排队，也不会被重建挡住。索引是可丢弃的：启动时为空就从 Mnesia
%%% 全量重建，`reindex/0' 随时可以重来。
%%%
%%% 目录布局：`<search_dir>/gen-<N>/' 一代一个 bitcask 目录。重建是「在 gen-<N+1> 里建好
%%% → 发布新句柄 → 关旧句柄、删旧目录」，重建期间读一直落在旧的那一代上。
%%%
%%% 定时 merge：bitcask 是追加写，任务每改一次就多一篇、旧的那篇一直占着盘。写进程按
%%% `search_merge_interval'（缺省 6 小时）看一眼各数据文件的死字节，够多就把当前写文件
%%% 封口、让引擎把死数据合并掉（旁车 merge，不占写锁，读写都不停）。`merge/0' 可手动触发。
%%%
%%% 文档：
%%%   task:<ID>   text = title + description + labels   fields title / labels   meta {v, org, project, kind=task, status}
%%%   fb:<ID>     text = content                        meta {v, org, project, kind=feedback, task}
%%%
%%% `org' 取自项目的 org_id（孤儿项目为 null）；项目改组织（`bosun_org:adopt_orphans/1'）后要 reindex。
%%% `v' 是索引格式版本（?SCHEMA）：启动时抽一篇文档看版本，不对就**删掉索引目录**从 Mnesia
%%% 全量重建（bitcask 8.1.0 改了默认字段的盘上标识，旧版本写的封存段不能沿用，逐 key 删不干净）。
%%% 索引目录打不开（损坏 / 版本不兼容）同样删掉重建一次——索引是派生数据，不该拦住启动。
%%%
%%% jieba 对拉丁词大小写敏感，入库与查询统一小写。
%%%
%%% 过滤（组织 / 项目 / 类型）按 meta 下推给引擎：`search_fields_attributed/4`、`search_wildcard/4`
%%% 带 meta filter（bitcask 6.7.1 起），引擎会补取到 K 条，不再需要 Erlang 侧放大 K 再裁。
%%%
%%% 排序：引擎分数（默认字段 + title^3 + labels^8 相加）再乘「命中字段」系数（labels ×8、
%%% title ×3，取大者）。bitcask 10 的命名字段子分数量级比默认字段小一截，只靠引擎内的
%%% boost 相加压不过正文里的词频，所以用 `search_fields_attributed' 回报的命中字段显式加权。
%%%-------------------------------------------------------------------
-module(bosun_search).
-behaviour(gen_server).

-include("bosun.hrl").

-export([start_link/0, start_link/1, search/2, index_task/1, index_feedback/1, remove_feedback/1,
         reindex/0, merge/0, merge/1, reset/0, sync/0, status/0]).
-export([init/1, handle_call/3, handle_cast/2, handle_info/2, terminate/2]).

-record(st, {root :: string(), gen :: pos_integer(), h :: term()}).

%% 当前句柄：{Handle, 这一代的目录}
-define(HANDLE, {?MODULE, handle}).

%% 索引格式版本；meta 结构变了、或引擎升级后旧索引不能沿用，就加一，旧索引启动时自动重建。
%% 3：bitcask 6.7.1 → 10.0.0（8.1.0 起默认字段哨兵变了，旧封存段要重建）
-define(SCHEMA, 3).

%% 命中字段的排序系数（见模块头「排序」）
-define(BOOST_LABELS, 8).
-define(BOOST_TITLE, 3).

%% 定时 merge 的缺省值（应用 env `search_merge_interval' / `search_merge_min_dead_bytes' 可改）：
%% 多久看一次；死字节超过这么多、且占到全部数据的一半以上才动手
-define(MERGE_INTERVAL_MS, 6 * 60 * 60 * 1000).
-define(MERGE_MIN_DEAD_BYTES, 1024 * 1024).
-define(MERGE_MIN_DEAD_PERCENT, 50).
%% 动手时并哪些文件：碎片率到这个数的，外加所有小文件（顺手归拢，免得每次封口留一个小文件）
-define(MERGE_FILE_FRAG_PERCENT, 40).
-define(MERGE_SMALL_FILE_BYTES, 10 * 1024 * 1024).

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

%% @doc BM25 检索。Opts: #{org => binary() | undefined, project => binary(),
%% kinds => [task | feedback], limit => pos_integer()}
%% `org' 缺省取调用进程的当前组织（bosun_scope），系统作用域下不按组织过滤。
%% 返回按分数降序的命中；feedback 命中带所属 task_id，调用方决定怎么聚合。
-spec search(binary(), map()) -> {ok, [hit()]} | {error, term()}.
search(Query0, Opts) ->
    case normalize(Query0) of
        <<>> -> {ok, []};
        Query ->
            Opts1 = maps:merge(#{org => bosun_scope:org_id()}, Opts),
            read(fun(H, _Dir) -> do_search(H, Query, Opts1) end)
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

%% @doc 现在就看一眼要不要 merge（规则同定时那次）。`force' 不看死字节多少，有能并的就并。
%% 返回回收了多少字节；不需要合并是 `{ok, not_needed}'。
-spec merge() -> {ok, not_needed | #{reclaimed := integer(), files := non_neg_integer()}} | {error, term()}.
merge() -> merge(auto).

-spec merge(auto | force) -> {ok, not_needed | #{reclaimed := integer(), files := non_neg_integer()}} | {error, term()}.
merge(Mode) when Mode =:= auto; Mode =:= force ->
    try gen_server:call(?MODULE, {merge, Mode}, 300000)
    catch exit:{noproc, _} -> {error, search_unavailable}
    end.

%% @doc 测试用：清空索引。
-spec reset() -> ok.
reset() -> call(reset).

%% @doc 等待此前所有异步索引请求处理完（gen_server 按序处理，一次 call 即屏障）。
-spec sync() -> ok | {error, term()}.
sync() -> call(sync).

-spec status() -> map() | {error, search_unavailable}.
status() -> read(fun(H, Dir) -> #{dir => Dir, docs => length(keys(H))} end).

%% 在调用进程里用当前句柄读。重建换代时旧句柄会被关掉（对已关句柄的调用是 badarg）：
%% 新句柄先发布、旧句柄后关，所以重取一次就是新的。
read(Fun) -> read(Fun, 2).

read(Fun, Tries) ->
    case persistent_term:get(?HANDLE, undefined) of
        undefined -> {error, search_unavailable};
        {H, Dir} ->
            try Fun(H, Dir)
            catch
                error:badarg when Tries > 1 -> read(Fun, Tries - 1);
                error:badarg -> {error, search_unavailable}
            end
    end.

call(Msg) ->
    try gen_server:call(?MODULE, Msg, 30000)
    catch exit:{noproc, _} -> {error, search_unavailable}
    end.

%%====================================================================
%% gen_server
%%====================================================================

init(Root) ->
    process_flag(trap_exit, true),
    %% 上一个进程要是被 kill 的（没走 terminate），它发布的句柄还占着目录的写锁
    unpublish(),
    case open_current(Root) of
        {ok, Gen, H, Rebuild} ->
            case Rebuild orelse bitcask:is_empty_estimate(H) of
                true ->
                    {ok, N} = fill(H),
                    logger:notice("bosun_search: built index from mnesia (~b docs)", [N]);
                false -> ok
            end,
            publish(H, gen_dir(Root, Gen)),
            schedule_merge(),
            {ok, #st{root = Root, gen = Gen, h = H}};
        {error, Reason} ->
            {stop, {search_open_failed, Reason}}
    end.

handle_call(reindex, _From, St) ->
    case do_reindex(St) of
        {ok, N, St1} -> {reply, {ok, N}, St1};
        %% 新的一代没建成：旧的那一代原样继续服务
        {error, Reason} -> {reply, {error, {reindex_failed, Reason}}, St}
    end;
handle_call({merge, Mode}, _From, St) ->
    {reply, do_merge(St, Mode), St};
handle_call(reset, _From, #st{h = H} = St) ->
    lists:foreach(fun(K) -> bitcask:delete(H, K) end, keys(H)),
    {reply, ok, St};
handle_call(sync, _From, St) ->
    {reply, ok, St};
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

handle_info(merge_tick, St) ->
    _ = do_merge(St, auto),
    schedule_merge(),
    {noreply, St};
handle_info(_Msg, St) ->
    {noreply, St}.

terminate(_Reason, _St) ->
    unpublish().

publish(H, Dir) ->
    persistent_term:put(?HANDLE, {H, Dir}).

%% 撤下并关闭当前发布的句柄（没有就什么都不做）
unpublish() ->
    case persistent_term:get(?HANDLE, undefined) of
        undefined -> ok;
        {H, _Dir} ->
            _ = persistent_term:erase(?HANDLE),
            catch bitcask:close(H),
            ok
    end.

%%====================================================================
%% 内部
%%====================================================================

analyzer_opts() -> [{analyzer, jieba}, {enable_stop_words, true}].

open(Dir) ->
    _ = application:ensure_all_started(bitcask),
    ok = filelib:ensure_path(Dir),
    try bitcask:open(Dir, [read_write | analyzer_opts()]) of
        {error, Reason} -> {error, Reason};
        H -> {ok, H}
    catch
        Class:Reason -> {error, {Class, Reason}}
    end.

gen_dir(Root, Gen) -> filename:join(Root, "gen-" ++ integer_to_list(Gen)).

%% 现有的各代，升序
gens(Root) ->
    case file:list_dir(Root) of
        {ok, Names} -> lists:sort([list_to_integer(D) || "gen-" ++ D <- Names, D =/= [], lists:all(fun(C) -> C >= $0 andalso C =< $9 end, D)]);
        {error, _} -> []
    end.

%% 打开最新的一代；打不开或格式版本不对就丢掉、另起一代。返回 {ok, Gen, H, 要不要全量灌}。
open_current(Root) ->
    case prepare_root(Root) of
        ok ->
            case lists:reverse(gens(Root)) of
                [] -> new_gen(Root, 1);
                [Gen | Older] ->
                    %% 重建到一半被打断留下的旧代
                    lists:foreach(fun(G) -> file:del_dir_r(gen_dir(Root, G)) end, Older),
                    case open(gen_dir(Root, Gen)) of
                        {ok, H} ->
                            case stale(H) of
                                false -> {ok, Gen, H, false};
                                true ->
                                    logger:notice("bosun_search: index format is stale, rebuilding ~ts", [Root]),
                                    catch bitcask:close(H),
                                    _ = file:del_dir_r(gen_dir(Root, Gen)),
                                    new_gen(Root, Gen + 1)
                            end;
                        {error, Reason} ->
                            logger:warning("bosun_search: cannot open ~ts (~p), rebuilding from mnesia",
                                           [gen_dir(Root, Gen), Reason]),
                            _ = file:del_dir_r(gen_dir(Root, Gen)),
                            new_gen(Root, Gen + 1)
                    end
            end;
        {error, _} = E -> E
    end.

new_gen(Root, Gen) ->
    Dir = gen_dir(Root, Gen),
    _ = file:del_dir_r(Dir),
    case open(Dir) of
        {ok, H} -> {ok, Gen, H, true};
        {error, _} = E -> E
    end.

%% 旧布局（bitcask 文件直接放在 search_dir 下，分代之前的版本写的）：整个清掉重来。
%% 只在根目录里确实有 bitcask 文件时才删；别的文件一概不碰（search_dir 配错也不会误删）。
prepare_root(Root) ->
    ok = filelib:ensure_path(Root),
    case file:list_dir(Root) of
        {ok, Names} ->
            case lists:any(fun is_cask_file/1, Names) of
                true ->
                    logger:notice("bosun_search: index layout is stale, rebuilding ~ts", [Root]),
                    case file:del_dir_r(Root) of
                        ok -> filelib:ensure_path(Root);
                        {error, R} -> {error, {wipe_failed, R}}
                    end;
                false -> ok
            end;
        {error, R} -> {error, {list_failed, R}}
    end.

is_cask_file("bitcask.meta") -> true;
is_cask_file("bitcask.write.lock") -> true;
is_cask_file(Name) -> lists:suffix(".bitcask.data", Name).

%% 抽一篇文档看 meta 里的格式版本
stale(H) ->
    case keys(H) of
        [] -> false;
        [K | _] ->
            try bitcask:get(H, K) of
                {ok, #{meta := Meta}} when is_binary(Meta), Meta =/= <<>> ->
                    maps:get(<<"v">>, bitcask:decode_meta(Meta), undefined) =/= ?SCHEMA;
                _ -> true
            catch
                _:_ -> true
            end
    end.

keys(H) ->
    case bitcask:list_keys(H) of
        L when is_list(L) -> L;
        _ -> []
    end.

%% 全量重建：在下一代目录里建好、发布，再关掉并删除旧的一代。重建期间读照常落在旧代上；
%% 排在后面的写请求（邮箱里的 index / remove）等重建完落到新代，不丢。
%% 不逐 key 删再写：这里从不 merge，那样数据文件只增不减，旧格式的段也清不掉。
do_reindex(#st{root = Root, gen = Gen, h = Old} = St) ->
    case new_gen(Root, Gen + 1) of
        {ok, Gen1, H1, _} ->
            try fill(H1) of
                {ok, N} ->
                    publish(H1, gen_dir(Root, Gen1)),
                    catch bitcask:close(Old),
                    _ = file:del_dir_r(gen_dir(Root, Gen)),
                    {ok, N, St#st{gen = Gen1, h = H1}}
            catch
                Class:Reason ->
                    logger:error("bosun_search: reindex failed: ~p:~p", [Class, Reason]),
                    catch bitcask:close(H1),
                    _ = file:del_dir_r(gen_dir(Root, Gen1)),
                    {error, Reason}
            end;
        {error, Reason} ->
            logger:error("bosun_search: reindex failed: ~p", [Reason]),
            {error, Reason}
    end.

%%--------------------------------------------------------------------
%% 定时 merge
%%--------------------------------------------------------------------

schedule_merge() ->
    case application:get_env(bosun_core, search_merge_interval, ?MERGE_INTERVAL_MS) of
        Ms when is_integer(Ms), Ms > 0 -> erlang:send_after(Ms, self(), merge_tick), ok;
        _ -> ok   %% off / 0：不定时，只能手动 merge/0
    end.

%% 各数据文件的 {死字节, 总字节} 之和（含正在写的那个文件）
dead_bytes(H) ->
    case bitcask:status(H) of
        {_Keys, Files} when is_list(Files) ->
            lists:foldl(fun({_File, _Frag, Dead, Total}, {D, T}) -> {D + Dead, T + Total};
                           (_, Acc) -> Acc
                        end, {0, 0}, Files);
        _ -> {0, 0}
    end.

worth_merging(_H, force) -> true;
worth_merging(H, auto) ->
    MinDead = application:get_env(bosun_core, search_merge_min_dead_bytes, ?MERGE_MIN_DEAD_BYTES),
    {Dead, Total} = dead_bytes(H),
    Dead >= MinDead andalso Dead * 100 >= Total * ?MERGE_MIN_DEAD_PERCENT.

%% 引擎只合并已经封口的文件，而死数据多半就在正在写的那个里（单文件 2 GB 才自动换），
%% 所以先 close_write_file 把它封口（下一次写自动开新文件），再挑文件。
%%
%% 挑哪些文件自己按 `status' 定，不问 `needs_merge'：它用的是开库 / 上次合并时的统计，
%% 本次打开之后才变成死数据的文件它看不见（bitcask 10.0.0 实测：文件 96% 是死的仍返回 false，
%% 重开库才认）——照它说的做，长时间不重启的服务就永远不合并。
do_merge(#st{root = Root, gen = Gen, h = H}, Mode) ->
    Dir = gen_dir(Root, Gen),
    try
        case worth_merging(H, Mode) of
            false -> {ok, not_needed};
            true ->
                {Before, _} = dead_bytes(H),
                ok = bitcask:close_write_file(H),
                case {merge_candidates(H), merge_opts()} of
                    {[], _} -> {ok, not_needed};
                    {_, {error, Reason}} ->
                        logger:warning("bosun_search: merge skipped: ~p", [Reason]),
                        {error, Reason};
                    {Files, {ok, Opts}} ->
                        T0 = erlang:monotonic_time(millisecond),
                        case bitcask:merge(Dir, Opts, Files) of
                            ok ->
                                {After, _} = dead_bytes(H),
                                logger:notice("bosun_search: merged ~b file(s), reclaimed ~b bytes in ~b ms",
                                              [length(Files), Before - After, erlang:monotonic_time(millisecond) - T0]),
                                {ok, #{reclaimed => Before - After, files => length(Files)}};
                            {error, Reason} ->
                                logger:warning("bosun_search: merge failed: ~p", [Reason]),
                                {error, Reason}
                        end
                end
        end
    catch
        Class:Why ->
            logger:warning("bosun_search: merge failed: ~p:~p", [Class, Why]),
            {error, Why}
    end.

%% 封口之后所有文件都可并。有死数据的文件一个都没有就不动；否则并掉碎片率高的和所有小文件。
merge_candidates(H) ->
    case bitcask:status(H) of
        {_Keys, Files} when is_list(Files) ->
            case [F || {F, _Frag, Dead, _Total} <- Files, Dead > 0] of
                [] -> [];
                _ -> [F || {F, Frag, _Dead, Total} <- Files,
                           Frag >= ?MERGE_FILE_FRAG_PERCENT orelse Total < ?MERGE_SMALL_FILE_BYTES]
            end;
        _ -> []
    end.

%% merge 是另开一个只做合并的句柄，分词选项要和开库时一致。
%% ⚠️ `bitcask:open' 会替 jieba 补上缺省词典目录，`bitcask:merge' 不会（bitcask 10.0.0）——
%% 不显式给 dict_path 的话 cppjieba 找不到词典直接 abort，整个节点跟着没。所以这里自己给，
%% 并且先确认词典真的在；路径必须是 binary。
merge_opts() ->
    case code:priv_dir(bitcask) of
        {error, _} -> {error, no_jieba_dict};
        Priv ->
            Dict = filename:join(Priv, "dict"),
            case filelib:is_regular(filename:join(Dict, "jieba.dict.utf8")) of
                true -> {ok, [{dict_path, unicode:characters_to_binary(Dict)} | analyzer_opts()]};
                false -> {error, {no_jieba_dict, Dict}}
            end
    end.

fill(H) ->
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
    Filter = filter(maps:get(org, Opts, undefined), Project, Kinds),
    %% search_fields 多个 boost 组时是逐字段取 top-K 再求和的近似，留点余量
    K = max(Limit * 2, 50),
    %% 空白分隔的多个词按 AND 处理（各词分别检索后按 key 求交，分数相加）；
    %% 单个词（含不带空格的中文串）交给 jieba 自己切。求交要各词的命中有交集，K 再放大
    Words = [W || W <- binary:split(Query, [<<" ">>, <<"\t">>, <<"\n">>], [global]), W =/= <<>>],
    Res = case Words of
              [_] -> search_word(H, Query, K, Filter);
              _ -> intersect([search_word(H, W, K * 8, Filter) || W <- Words])
          end,
    case Res of
        {ok, Hits} -> {ok, lists:sublist(lists:filtermap(fun to_hit/1, Hits), Limit)};
        {error, _} = E -> E
    end.

%% meta filter：org eq、project eq、kind in；都不限时传 undefined
filter(Org, Project, Kinds) ->
    Conds = [#{key => <<"org">>, op => eq, value => Org} || Org =/= undefined]
        ++ [#{key => <<"project">>, op => eq, value => Project} || Project =/= undefined]
        ++ [#{key => <<"kind">>, op => in, values => [atom_to_binary(Kd) || Kd <- Kinds]}
            || lists:usort(Kinds) =/= [feedback, task]],
    case Conds of
        [] -> undefined;
        _ -> Conds
    end.

%% 一个词同时打默认字段与 title / labels 字段（bitcask `field:term^boost` 语法，各子句分数相加），
%% 再按命中字段乘系数：命中标签 ×8、命中标题 ×3，正文 / feedback ×1。
search_word(H, Word0, K, Filter) ->
    Word = binary:replace(Word0, [<<":">>, <<"^">>], <<>>, [global]),
    Expr = <<Word/binary, " title:", Word/binary, "^", (integer_to_binary(?BOOST_TITLE))/binary,
             " labels:", Word/binary, "^", (integer_to_binary(?BOOST_LABELS))/binary>>,
    case Word =:= <<>> orelse bitcask:search_fields_attributed(H, Expr, K, Filter) of
        true -> {ok, []};
        {ok, []} -> prefix_fallback(H, Word, K, Filter);
        {ok, Hits} -> {ok, by_score([{Key, Ord, Score * field_boost(Fields)} || {Key, Ord, Score, Fields} <- Hits])};
        Other -> Other
    end.

field_boost(Fields) ->
    case {lists:member(<<"labels">>, Fields), lists:member(<<"title">>, Fields)} of
        {true, _} -> ?BOOST_LABELS;
        {false, true} -> ?BOOST_TITLE;
        {false, false} -> 1
    end.

%% 分数降序；同分保持引擎给的先后（lists:sort 稳定）
by_score(Hits) ->
    lists:sort(fun({_, _, A}, {_, _, B}) -> A >= B end, Hits).

%% 单个拉丁词没命中时按前缀再试一次（"crea" → create）
prefix_fallback(H, Word, K, Filter) ->
    case re:run(Word, "^[a-z0-9_]+$", [{capture, none}]) of
        match -> bitcask:search_wildcard(H, <<Word/binary, "*">>, K, Filter);
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
            {ok, by_score(Summed)}
    end.

%% 不认识的 key（不是本模块写的）直接跳过
to_hit({<<"task:", Id/binary>>, _Ord, Score}) ->
    {true, #{type => task, id => Id, task_id => Id, score => Score}};
to_hit({<<"fb:", Id/binary>>, _Ord, Score}) ->
    {true, #{type => feedback, id => Id, task_id => hd(binary:split(Id, <<"#">>)), score => Score}};
to_hit(_) ->
    false.

project_of(Id) -> hd(binary:split(Id, <<"-">>)).

task_doc(#{<<"id">> := Id, <<"project_key">> := Project, <<"title">> := Title} = T) ->
    Desc = maps:get(<<"description">>, T, <<>>),
    Labels = iolist_to_binary(lists:join(<<" ">>, maps:get(<<"labels">>, T, []))),
    Text = normalize(<<Title/binary, "\n", Desc/binary, "\n", Labels/binary>>),
    Meta = bitcask:encode_meta(#{<<"v">> => ?SCHEMA, <<"org">> => org_of(Project),
                                 <<"project">> => Project, <<"kind">> => <<"task">>,
                                 <<"status">> => maps:get(<<"status">>, T, <<>>)}),
    {<<"task:", Id/binary>>,
     #{text => Text,
       fields => #{<<"title">> => normalize(Title), <<"labels">> => normalize(Labels)},
       meta => Meta}}.

feedback_doc(#{<<"id">> := Id, <<"task_id">> := TaskId, <<"content">> := Content}) ->
    Project = project_of(TaskId),
    Meta = bitcask:encode_meta(#{<<"v">> => ?SCHEMA, <<"org">> => org_of(Project),
                                 <<"project">> => Project, <<"kind">> => <<"feedback">>,
                                 <<"task">> => TaskId}),
    {<<"fb:", Id/binary>>, #{text => normalize(Content), meta => Meta}}.

%% 项目所属组织；孤儿项目 / 项目不存在 → undefined（meta 里是 null，任何组织都过滤不到）
org_of(Project) ->
    case mnesia:dirty_read(project, Project) of
        [#project{org_id = Org}] -> Org;
        [] -> undefined
    end.

normalize(Bin) when is_binary(Bin) ->
    string:lowercase(string:trim(Bin));
normalize(Other) ->
    normalize(bosun_util:to_binary(Other)).
