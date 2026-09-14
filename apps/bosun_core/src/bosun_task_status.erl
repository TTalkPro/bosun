%%%-------------------------------------------------------------------
%%% @doc 任务状态机。设计见 designs/03-task-status.md。
%%%
%%%  NEW ──▶ IN_PROGRESS ──▶ DONE ──▶ VERIFIED
%%%   │  ▲         │  ▲        │          │
%%%   │  │         │  └────────┴──────────┘   (打回 / 重开)
%%%   ▼  │         ▼
%%%  REJECTED ◀────┤                          (执行方拒绝需求；REJECTED ──▶ NEW 重新提交)
%%%  CANCELLED ◀───┘                          (不做了：过时 / 不需要；CANCELLED ──▶ NEW 恢复)
%%%
%%%  步骤迁移会在同一事务里级联同步所属 Epic（全部完成 → 自动 DONE；步骤重开 → 回 IN_PROGRESS）。
%%%-------------------------------------------------------------------
-module(bosun_task_status).

-include("bosun.hrl").

-export([parse/1, to_binary/1, all/0, allowed/2, next_statuses/1, transition/3]).

-type status() :: new | in_progress | done | verified | rejected | cancelled.
-export_type([status/0]).

-spec all() -> [status()].
all() -> [new, in_progress, done, verified, rejected, cancelled].

%% @doc 解析对外字符串，容忍大小写 / 空格 / 连字符。
-spec parse(term()) -> {ok, status()} | {error, {invalid, status, binary()}}.
parse(S) when is_atom(S) ->
    case lists:member(S, all()) of
        true -> {ok, S};
        false -> parse(atom_to_binary(S, utf8))
    end;
parse(Bin0) ->
    Bin = string:uppercase(bosun_util:trim(Bin0)),
    Norm = binary:replace(binary:replace(Bin, <<" ">>, <<"_">>, [global]), <<"-">>, <<"_">>, [global]),
    case Norm of
        <<"NEW">> -> {ok, new};
        <<"IN_PROGRESS">> -> {ok, in_progress};
        <<"INPROGRESS">> -> {ok, in_progress};
        <<"DONE">> -> {ok, done};
        <<"VERIFIED">> -> {ok, verified};
        <<"REJECTED">> -> {ok, rejected};
        <<"REJECT">> -> {ok, rejected};
        <<"CANCELLED">> -> {ok, cancelled};
        <<"CANCELED">> -> {ok, cancelled};
        <<"CANCEL">> -> {ok, cancelled};
        _ -> {error, {invalid, status, <<"expected one of NEW, IN_PROGRESS, DONE, VERIFIED, REJECTED, CANCELLED">>}}
    end.

-spec to_binary(status()) -> binary().
to_binary(new) -> <<"NEW">>;
to_binary(in_progress) -> <<"IN_PROGRESS">>;
to_binary(done) -> <<"DONE">>;
to_binary(verified) -> <<"VERIFIED">>;
to_binary(rejected) -> <<"REJECTED">>;
to_binary(cancelled) -> <<"CANCELLED">>.

%% @doc 迁移表。
-spec allowed(status(), status()) -> boolean().
allowed(new,         in_progress) -> true;
allowed(in_progress, done)        -> true;
allowed(done,        verified)    -> true;
allowed(done,        in_progress) -> true;
allowed(verified,    in_progress) -> true;
%% 执行方认为需求不合理：在开始前或进行中拒绝；提出方修改需求后重新提交回 NEW
allowed(new,         rejected)    -> true;
allowed(in_progress, rejected)    -> true;
allowed(rejected,    new)         -> true;
%% 不做了（过时 / 不需要，不是需求不对）：开始前或进行中都可撤销；又需要了恢复回 NEW
allowed(new,         cancelled)   -> true;
allowed(in_progress, cancelled)   -> true;
allowed(cancelled,   new)         -> true;
allowed(_, _)                     -> false.

-spec next_statuses(status()) -> [status()].
next_statuses(From) ->
    [To || To <- all(), allowed(From, To)].

%% @doc 执行迁移。
%% Opts: #{actor, actor_kind, comment, commits => [binary()], tests => map() | undefined}
%% - 从 NEW 领取（→ IN_PROGRESS）的人成为 assignee（执行方）；打回 / 重开不改执行方，除非还没有人领
%% - 有未满足的 depends_on 时不能从 NEW 开始：{blocked, [Ids]}
%% - assignee 自己验收（VERIFIED）必须有测试证据：本次 tests.passed = true，或最近一次 DONE 带 tests.passed = true
-spec transition(term(), term(), map()) -> {ok, map()} | {error, term()}.
transition(TaskId0, To0, Opts) ->
    case {bosun_id:parse_task_id(TaskId0), parse(To0)} of
        {{ok, TaskId, _, _}, {ok, To}} ->
            Actor = case bosun_util:get_bin(actor, Opts, <<>>) of
                        <<>> -> <<"user">>;
                        A -> A
                    end,
            Comment = case bosun_util:get_opt_bin(comment, Opts) of
                          <<>> -> undefined;
                          C -> C
                      end,
            ok = bosun_actor:touch(Actor, bosun_actor:parse_kind(maps:get(actor_kind, Opts, undefined))),
            case {parse_commits(maps:get(commits, Opts, [])), parse_tests(maps:get(tests, Opts, undefined))} of
                {{error, _} = E, _} -> E;
                {_, {error, _} = E} -> E;
                {{ok, Commits}, {ok, Tests}} ->
                    case bosun_store:transaction(fun() ->
                        case bosun_task:read_in_tx(TaskId, write) of
                            [] -> bosun_store:abort(not_found);
                            [#task{status = From} = T] ->
                                case allowed(From, To) of
                                    false -> bosun_store:abort({invalid_transition, From, To});
                                    true ->
                                        check_self_verify(To, Actor, T, Tests),
                                        check_blocked(From, To, TaskId),
                                        Now = bosun_util:now_ms(),
                                        Entry = #{from => From, to => To, actor => Actor,
                                                  comment => Comment, at => Now,
                                                  commits => Commits, tests => Tests},
                                        T1 = T#task{status = To,
                                                    history = [Entry | T#task.history],
                                                    updated_at = Now,
                                                    assignee = case {From, To, T#task.assignee} of
                                                                   {new, in_progress, _} -> Actor;
                                                                   {_, in_progress, undefined} -> Actor;
                                                                   {_, _, Keep} -> Keep
                                                               end},
                                        ok = mnesia:write(T1),
                                        Touched = sync_epic_in_tx(T1, Actor, Now),
                                        {bosun_json:task_full(T1, bosun_feedback:read_in_tx(TaskId)), Touched}
                                end
                        end
                    end) of
                        {ok, {Json, Touched}} ->
                            reindex_epic(Touched),
                            bosun_task:indexed({ok, Json});
                        {error, _} = E -> E
                    end
            end;
        {{error, _} = E, _} -> E;
        {_, {error, _} = E} -> E
    end.

%%====================================================================
%% Epic 自动流转
%%====================================================================

%% 步骤迁移后同步所属 Epic（同一事务内，见 designs/03 §自动流转）：
%% - 全部步骤 DONE / VERIFIED / CANCELLED 且至少一个 DONE / VERIFIED → Epic 自动 → DONE
%% - DONE / VERIFIED 的 Epic 因步骤重开不再满足上一条 → 自动回 IN_PROGRESS
%% CANCELLED / REJECTED 的 Epic 不碰。用 index_read（而非 bosun_task:children/1 的脏读）
%% 才能看到本事务刚写入的状态。返回被改动的 Epic id（没动则 undefined），供提交后重建索引。
-spec sync_epic_in_tx(#task{}, binary(), integer()) -> undefined | binary().
sync_epic_in_tx(#task{epic = undefined}, _Actor, _Now) -> undefined;
sync_epic_in_tx(#task{epic = EpicId}, Actor, Now) ->
    case mnesia:read(task, EpicId, write) of
        [#task{status = From} = Epic] when From =:= new; From =:= in_progress;
                                           From =:= done; From =:= verified ->
            Complete = epic_complete(mnesia:index_read(task, EpicId, #task.epic)),
            WasDone = From =:= done orelse From =:= verified,
            case {Complete, WasDone} of
                {true, false} ->
                    Entry = auto_entry(From, done, Actor, <<"all steps completed (auto)">>, Now),
                    ok = mnesia:write(Epic#task{status = done,
                                                history = [Entry | Epic#task.history],
                                                updated_at = Now}),
                    EpicId;
                {false, true} ->
                    Entry = auto_entry(From, in_progress, Actor, <<"step reopened (auto)">>, Now),
                    ok = mnesia:write(Epic#task{status = in_progress,
                                                history = [Entry | Epic#task.history],
                                                updated_at = Now}),
                    EpicId;
                _ -> undefined
            end;
        _ -> undefined
    end.

%% 全部步骤完成：没有 NEW / IN_PROGRESS / REJECTED 的步骤，且至少一个 DONE / VERIFIED
epic_complete([]) -> false;
epic_complete(Kids) ->
    lists:all(fun(#task{status = S}) -> S =:= done orelse S =:= verified orelse S =:= cancelled end, Kids)
    andalso lists:any(fun(#task{status = S}) -> S =:= done orelse S =:= verified end, Kids).

auto_entry(From, To, Actor, Comment, Now) ->
    #{from => From, to => To, actor => Actor, comment => Comment, at => Now,
      commits => [], tests => undefined}.

%% Epic 在同一事务里被级联改了状态，提交后重建它的搜索索引（索引里带 status 元数据）
reindex_epic(undefined) -> ok;
reindex_epic(EpicId) ->
    case bosun_task:get(EpicId) of
        {ok, Epic} -> bosun_search:index_task(Epic);
        _ -> ok
    end.

%%====================================================================
%% 完成证据
%%====================================================================

%% commits：git 提交 hash 列表（也接受逗号分隔串）；只做形状清理，不校验是否真存在
parse_commits(undefined) -> {ok, []};
parse_commits(null) -> {ok, []};
parse_commits(Bin) when is_binary(Bin) -> parse_commits(binary:split(Bin, [<<",">>, <<" ">>], [global]));
parse_commits(List) when is_list(List) ->
    Cleaned = [bosun_util:trim(C) || C <- List],
    case lists:all(fun(C) -> re:run(C, "^[0-9a-fA-F]{7,64}$", [{capture, none}]) =:= match end,
                   [C || C <- Cleaned, C =/= <<>>]) of
        true -> {ok, [C || C <- Cleaned, C =/= <<>>]};
        false -> {error, {invalid, commits, <<"expected git commit hashes (7-64 hex chars)">>}}
    end;
parse_commits(_) -> {error, {invalid, commits, <<"expected a list of git commit hashes">>}}.

%% tests：#{command, passed, summary}，passed 必填
parse_tests(undefined) -> {ok, undefined};
parse_tests(null) -> {ok, undefined};
parse_tests(Map) when is_map(Map) ->
    case bosun_util:to_bool(maps:get(<<"passed">>, Map, maps:get(passed, Map, undefined)), undefined) of
        undefined -> {error, {invalid, tests, <<"tests.passed (true/false) is required">>}};
        Passed ->
            {ok, #{command => bosun_util:get_bin(<<"command">>, Map, bosun_util:get_bin(command, Map, <<>>)),
                   passed => Passed,
                   summary => bosun_util:get_bin(<<"summary">>, Map, bosun_util:get_bin(summary, Map, <<>>))}}
    end;
parse_tests(_) -> {error, {invalid, tests, <<"expected an object {command, passed, summary}">>}}.

%% 执行方验收自己：本次或最近一次 DONE 必须带通过的测试
%% 有未满足的依赖时不能开始（NEW → IN_PROGRESS）；打回 / 重开不拦
check_blocked(new, in_progress, TaskId) ->
    case bosun_link:blockers(TaskId) of
        [] -> ok;
        Blockers -> bosun_store:abort({blocked, Blockers})
    end;
check_blocked(_, _, _) -> ok.

check_self_verify(verified, Actor, #task{assignee = Actor} = T, Tests) ->
    case tests_passed(Tests) orelse tests_passed(last_done_tests(T#task.history)) of
        true -> ok;
        false -> bosun_store:abort({self_verify_requires_tests, Actor})
    end;
check_self_verify(_, _, _, _) -> ok.

tests_passed(#{passed := true}) -> true;
tests_passed(_) -> false.

last_done_tests(History) ->
    case [maps:get(tests, H, undefined) || #{to := done} = H <- History] of
        [Tests | _] -> Tests;   %% history 倒序，第一个就是最近一次 DONE
        [] -> undefined
    end.
