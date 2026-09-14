%%%-------------------------------------------------------------------
%%% @doc 任务关联：`replaces'（A 替代 B）与 `depends_on'（A 依赖 B）。设计见 designs/12-link.md。
%%%
%%% - replaces：建链时 B 若在 NEW / IN_PROGRESS 自动置 CANCELLED（历史备注 replaced by A）
%%% - depends_on：B 不在 DONE / VERIFIED 时 A 视为 blocked，A 不能从 NEW 开始；不能成环
%%% - 链可删（不是审计记录）；同一 {From, To, Type} 只一条
%%%-------------------------------------------------------------------
-module(bosun_link).

-include("bosun.hrl").

-export([add/4, remove/3, of_task/1, blockers/1, blocked/1, parse_type/1, type_to_binary/1]).
-export([links_json/1, all/0, write_in_tx/1]).

-type link_type() :: replaces | depends_on.
-export_type([link_type/0]).

-spec parse_type(term()) -> {ok, link_type()} | {error, term()}.
parse_type(T) when is_atom(T) -> parse_type(atom_to_binary(T, utf8));
parse_type(Bin) when is_binary(Bin) ->
    case string:lowercase(bosun_util:trim(Bin)) of
        <<"replaces">> -> {ok, replaces};
        <<"replace">> -> {ok, replaces};
        <<"depends_on">> -> {ok, depends_on};
        <<"depends-on">> -> {ok, depends_on};
        <<"depends">> -> {ok, depends_on};
        _ -> {error, {invalid, type, <<"expected replaces or depends_on">>}}
    end;
parse_type(_) -> {error, {invalid, type, <<"expected replaces or depends_on">>}}.

-spec type_to_binary(link_type()) -> binary().
type_to_binary(T) -> atom_to_binary(T, utf8).

%% @doc 建链。Opts: #{actor, actor_kind}。返回 From 的任务详情。
-spec add(term(), term(), term(), map()) -> {ok, map()} | {error, term()}.
add(From0, To0, Type0, Opts) ->
    case {bosun_id:parse_task_id(From0), bosun_id:parse_task_id(To0), parse_type(Type0)} of
        {{ok, From, _, _}, {ok, To, _, _}, {ok, Type}} when From =:= To ->
            {error, {invalid, to, <<"a task cannot be linked to itself">>}};
        {{ok, From, _, _}, {ok, To, _, _}, {ok, Type}} ->
            Actor = case bosun_util:get_bin(actor, Opts, <<>>) of <<>> -> <<"user">>; A -> A end,
            ok = bosun_actor:touch(Actor, bosun_actor:parse_kind(maps:get(actor_kind, Opts, undefined))),
            Res = bosun_store:transaction(fun() ->
                [_] = read_or_abort(From, from),
                [ToTask] = read_or_abort(To, to),
                Type =:= depends_on andalso check_cycle(From, To),
                Now = bosun_util:now_ms(),
                ok = mnesia:write(#link{key = {From, To, Type}, from = From, to = To, type = Type,
                                        actor = Actor, created_at = Now}),
                Type =:= replaces andalso cancel_replaced(ToTask, From, Actor, Now),
                ok
            end),
            after_commit(Res, From, To);
        {{error, _}, _, _} -> {error, {invalid, from, <<"expected a task id like BOS-12">>}};
        {_, {error, _}, _} -> {error, {invalid, to, <<"expected a task id like BOS-12">>}};
        {_, _, {error, _} = E} -> E
    end.

%% @doc 删链。返回 From 的任务详情。
-spec remove(term(), term(), term()) -> {ok, map()} | {error, term()}.
remove(From0, To0, Type0) ->
    case {bosun_id:parse_task_id(From0), bosun_id:parse_task_id(To0), parse_type(Type0)} of
        {{ok, From, _, _}, {ok, To, _, _}, {ok, Type}} ->
            Res = bosun_store:transaction(fun() ->
                case mnesia:read(link, {From, To, Type}, write) of
                    [] -> bosun_store:abort(not_found);
                    [_] ->
                        ok = mnesia:delete({link, {From, To, Type}}),
                        [_] = read_or_abort(From, from),
                        ok
                end
            end),
            after_commit(Res, From, To);
        {{error, _}, _, _} -> {error, {invalid, from, <<"expected a task id like BOS-12">>}};
        {_, {error, _}, _} -> {error, {invalid, to, <<"expected a task id like BOS-12">>}};
        {_, _, {error, _} = E} -> E
    end.

%% @doc 一个任务的全部链（出 + 入）。
-spec of_task(binary()) -> [#link{}].
of_task(TaskId) ->
    mnesia:dirty_index_read(link, TaskId, #link.from) ++ mnesia:dirty_index_read(link, TaskId, #link.to).

%% @doc 未满足的依赖：本任务 depends_on 的、还没 DONE / VERIFIED 的任务 id。
-spec blockers(binary()) -> [binary()].
blockers(TaskId) ->
    [L#link.to || #link{type = depends_on} = L <- mnesia:dirty_index_read(link, TaskId, #link.from),
                  not satisfied(L#link.to)].

-spec blocked(binary()) -> boolean().
blocked(TaskId) -> blockers(TaskId) =/= [].

%% @doc 详情用：[#{type, direction, task, title, status, kind}]，出链在前。
-spec links_json(binary()) -> [map()].
links_json(TaskId) ->
    Out = [entry(L, out, L#link.to) || L <- mnesia:dirty_index_read(link, TaskId, #link.from)],
    In = [entry(L, in, L#link.from) || L <- mnesia:dirty_index_read(link, TaskId, #link.to)],
    Key = fun(E) -> {case maps:get(<<"direction">>, E) of <<"out">> -> 0; _ -> 1 end,
                     maps:get(<<"type">>, E), maps:get(<<"task">>, E)} end,
    lists:sort(fun(A, B) -> Key(A) =< Key(B) end, Out ++ In).

%% @doc 备份用：全部链。
-spec all() -> [#link{}].
all() -> mnesia:dirty_select(link, [{'_', [], ['$_']}]).

%% @doc 备份导入用：事务内直接写。
-spec write_in_tx(#link{}) -> ok.
write_in_tx(#link{} = L) -> mnesia:write(L).

%%====================================================================

entry(#link{type = Type, actor = Actor, created_at = At}, Dir, Other) ->
    Base = #{<<"type">> => type_to_binary(Type), <<"direction">> => atom_to_binary(Dir, utf8),
             <<"task">> => Other, <<"actor">> => Actor, <<"created_at">> => bosun_json:iso8601(At)},
    case mnesia:dirty_read(task, Other) of
        [#task{title = Title, status = S} = T] ->
            Base#{<<"title">> => Title, <<"status">> => bosun_task_status:to_binary(S),
                  <<"kind">> => atom_to_binary(bosun_task:kind_of(T), utf8)};
        [] ->
            Base#{<<"title">> => undefined, <<"status">> => undefined, <<"kind">> => undefined}
    end.

satisfied(TaskId) ->
    case mnesia:dirty_read(task, TaskId) of
        [#task{status = S}] -> S =:= done orelse S =:= verified;
        [] -> true   %% 对端没了（导入残留）就不拦
    end.

read_or_abort(Id, Field) ->
    case bosun_task:read_in_tx(Id, read) of
        [] -> bosun_store:abort({invalid, Field, <<Id/binary, " not found">>});
        [T] -> [T]
    end.

%% From depends_on To：若沿 depends_on 从 To 能走到 From，就成环
check_cycle(From, To) ->
    case path(To, From, [To], #{}) of
        false -> ok;
        {true, Path} -> bosun_store:abort({cycle, [From | lists:reverse(Path)] ++ [From]})
    end.

path(Cur, Target, Path, Seen) ->
    Next = [L#link.to || #link{type = depends_on} = L <- mnesia:index_read(link, Cur, #link.from)],
    case lists:member(Target, Next) of
        true -> {true, Path};
        false ->
            lists:foldl(fun(_, {true, _} = Found) -> Found;
                           (N, false) ->
                               case maps:is_key(N, Seen) of
                                   true -> false;
                                   false -> path(N, Target, [N | Path], Seen#{N => true})
                               end
                        end, false, Next)
    end.

cancel_replaced(#task{status = S} = T, By, Actor, Now) when S =:= new; S =:= in_progress ->
    Entry = #{from => S, to => cancelled, actor => Actor,
              comment => <<"replaced by ", By/binary>>, at => Now, commits => [], tests => undefined},
    ok = mnesia:write(T#task{status = cancelled, history = [Entry | T#task.history], updated_at = Now});
cancel_replaced(_, _, _, _) -> ok.

%% blocked / links 是脏读派生的，事务里看不到自己的写，所以提交后再取详情；
%% 对端可能被撤销，顺手重建两边的索引
after_commit({ok, ok}, From, To) ->
    case bosun_task:get(To) of
        {ok, ToTask} -> bosun_search:index_task(ToTask);
        _ -> ok
    end,
    bosun_task:indexed(bosun_task:get(From));
after_commit({error, _} = E, _, _) -> E.
