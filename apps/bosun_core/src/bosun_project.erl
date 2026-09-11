%%%-------------------------------------------------------------------
%%% @doc 项目：创建 / 查询 / 更新 / 任务序号分配。设计见 designs/01-project.md。
%%%-------------------------------------------------------------------
-module(bosun_project).

-include("bosun.hrl").

-export([create/1, get/1, list/1, update/2, next_task_seq/1]).

%% 事务内使用（bosun_task 在同一事务里分配序号）
-export([next_task_seq_in_tx/1]).

%% @doc 创建项目。
%% Input: #{<<"key">>, <<"name">>, <<"description">> (可选)}
-spec create(map()) -> {ok, map()} | {error, term()}.
create(Input) when is_map(Input) ->
    case validate_new(Input) of
        {ok, Key, Name, Desc} ->
            Now = bosun_util:now_ms(),
            Rec = #project{key = Key, name = Name, description = Desc,
                           task_seq = 0, archived = false,
                           created_at = Now, updated_at = Now},
            bosun_store:transaction(fun() ->
                case mnesia:read(project, Key, write) of
                    [] -> ok = mnesia:write(Rec), bosun_json:project_to_map(Rec);
                    [_] -> bosun_store:abort({conflict, key})
                end
            end);
        {error, _} = E -> E
    end.

-spec get(term()) -> {ok, map()} | {error, not_found | {invalid, key, binary()}}.
get(Key0) ->
    case bosun_id:validate_key(Key0) of
        {ok, Key} ->
            case mnesia:dirty_read(project, Key) of
                [P] -> {ok, bosun_json:project_to_map(P)};
                [] -> {error, not_found}
            end;
        {error, _} -> {error, not_found}
    end.

%% @doc 列表，按 created_at 升序。Opts: #{include_archived => boolean()}
-spec list(map()) -> {ok, [map()]}.
list(Opts) ->
    IncludeArchived = maps:get(include_archived, Opts, false),
    All = mnesia:dirty_select(project, [{'_', [], ['$_']}]),
    Filtered = [P || P <- All, IncludeArchived orelse not P#project.archived],
    Sorted = lists:sort(fun(A, B) -> A#project.created_at =< B#project.created_at end, Filtered),
    {ok, [bosun_json:project_to_map(P) || P <- Sorted]}.

%% @doc 修改 name / description / archived；其他键忽略。
-spec update(term(), map()) -> {ok, map()} | {error, term()}.
update(Key0, Input) when is_map(Input) ->
    case bosun_id:validate_key(Key0) of
        {ok, Key} ->
            bosun_store:transaction(fun() ->
                case mnesia:read(project, Key, write) of
                    [] -> bosun_store:abort(not_found);
                    [P0] ->
                        P1 = apply_updates(P0, Input),
                        P2 = P1#project{updated_at = bosun_util:now_ms()},
                        ok = mnesia:write(P2),
                        bosun_json:project_to_map(P2)
                end
            end);
        {error, _} -> {error, not_found}
    end.

%% @doc 独立事务分配下一个任务序号（主要供测试；bosun_task 用事务内版本）。
-spec next_task_seq(term()) -> {ok, pos_integer()} | {error, not_found | archived}.
next_task_seq(Key0) ->
    case bosun_id:validate_key(Key0) of
        {ok, Key} -> bosun_store:transaction(fun() -> next_task_seq_in_tx(Key) end);
        {error, _} -> {error, not_found}
    end.

%% @doc 必须在 mnesia 事务内调用。失败以 abort 抛出 not_found / archived。
-spec next_task_seq_in_tx(binary()) -> pos_integer().
next_task_seq_in_tx(Key) ->
    case mnesia:read(project, Key, write) of
        [] -> bosun_store:abort(not_found);
        [#project{archived = true}] -> bosun_store:abort(archived);
        [P] ->
            Seq = P#project.task_seq + 1,
            ok = mnesia:write(P#project{task_seq = Seq, updated_at = bosun_util:now_ms()}),
            Seq
    end.

%%====================================================================
%% 内部
%%====================================================================

validate_new(Input) ->
    case bosun_id:validate_key(maps:get(<<"key">>, Input, <<>>)) of
        {ok, Key} ->
            case bosun_util:get_bin(<<"name">>, Input, <<>>) of
                <<>> -> {error, {invalid, name, <<"must not be empty">>}};
                Name -> {ok, Key, Name, bosun_util:get_bin(<<"description">>, Input, <<>>)}
            end;
        {error, _} = E -> E
    end.

apply_updates(P, Input) ->
    maps:fold(fun
        (<<"name">>, V, Acc) ->
            case bosun_util:trim(V) of
                <<>> -> bosun_store:abort({invalid, name, <<"must not be empty">>});
                Name -> Acc#project{name = Name}
            end;
        (<<"description">>, V, Acc) -> Acc#project{description = bosun_util:trim(V)};
        (<<"archived">>, V, Acc) -> Acc#project{archived = bosun_util:to_bool(V, Acc#project.archived)};
        (_, _, Acc) -> Acc
    end, P, Input).
