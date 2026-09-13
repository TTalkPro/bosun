-module(bosun_core_tests).

-include_lib("eunit/include/eunit.hrl").

setup() ->
    ok = bosun_test_env:setup().

teardown(_) -> ok.

core_test_() ->
    Tests = [
        {"id parsing", fun id_parsing/0},
        {"project create & key rules", fun project_create_and_key_rules/0},
        {"project conflict & update", fun project_conflict_and_update/0},
        {"task sequence per project", fun task_sequence_per_project/0},
        {"task list filters", fun task_list_filters/0},
        {"task update ignores status", fun task_update_ignores_status/0},
        {"status transition table", fun status_transition_table/0},
        {"status transition flow", fun status_transition_flow/0},
        {"feedback append & revise", fun feedback_append/0},
        {"archived project rejects tasks", fun archived_project_rejects_tasks/0},
        {"concurrent task creation", fun concurrent_task_creation/0},
        {"full-text search", fun full_text_search/0},
        {"actor registry", fun actor_registry/0},
        {"workflow doc", fun workflow_doc/0},
        {"roles, commits, tests & self-verify", fun roles_and_evidence/0},
        {"epics", fun epics/0},
        {"epic auto flow", fun epic_auto_flow/0},
        {"links", fun links/0}
    ],
    {foreach, fun setup/0, fun teardown/1,
     [fun(_) -> {Name, F} end || {Name, F} <- Tests]}.

id_parsing() ->
    ?assertEqual({ok, <<"BOS-12">>, <<"BOS">>, 12}, bosun_id:parse_task_id(<<"bos-12">>)),
    ?assertEqual({ok, <<"BOS-12">>, <<"BOS">>, 12}, bosun_id:parse_task_id(<<" BOS-12 ">>)),
    ?assertMatch({error, {invalid, id, _}}, bosun_id:parse_task_id(<<"BOS-012">>)),
    ?assertMatch({error, {invalid, id, _}}, bosun_id:parse_task_id(<<"BOS-">>)),
    ?assertMatch({error, {invalid, id, _}}, bosun_id:parse_task_id(<<"BOS-12#1">>)),
    ?assertMatch({error, {invalid, id, _}}, bosun_id:parse_task_id(<<"1BOS-12">>)),
    ?assertEqual({ok, <<"BOS-12#3">>, <<"BOS-12">>, 3}, bosun_id:parse_feedback_id(<<"bos-12#3">>)),
    ?assertMatch({error, _}, bosun_id:parse_feedback_id(<<"BOS-12#">>)),
    ?assertMatch({error, _}, bosun_id:parse_feedback_id(<<"BOS-12#0">>)),
    ?assertMatch({error, _}, bosun_id:parse_feedback_id(<<"BOS-12">>)),
    ?assertEqual({ok, <<"AB">>}, bosun_id:validate_key(<<"ab">>)),
    ?assertMatch({error, _}, bosun_id:validate_key(<<"A">>)),
    ?assertMatch({error, _}, bosun_id:validate_key(<<"1AB">>)),
    ?assertMatch({error, _}, bosun_id:validate_key(<<"ABCDEFGHIJK">>)),
    ?assertMatch({error, _}, bosun_id:validate_key(<<"A-B">>)).

project_create_and_key_rules() ->
    {ok, P} = bosun_project:create(#{<<"key">> => <<"bos">>, <<"name">> => <<"Bosun">>}),
    ?assertEqual(<<"BOS">>, maps:get(<<"key">>, P)),
    ?assertEqual(0, maps:get(<<"task_count">>, P)),
    ?assertEqual(false, maps:get(<<"archived">>, P)),
    ?assertMatch({error, {invalid, key, _}}, bosun_project:create(#{<<"key">> => <<"x">>, <<"name">> => <<"n">>})),
    ?assertMatch({error, {invalid, name, _}}, bosun_project:create(#{<<"key">> => <<"OK">>, <<"name">> => <<"  ">>})),
    {ok, Got} = bosun_project:get(<<"bos">>),
    ?assertEqual(<<"Bosun">>, maps:get(<<"name">>, Got)),
    ?assertEqual({error, not_found}, bosun_project:get(<<"NOPE">>)),
    ?assertEqual({error, not_found}, bosun_project:get(<<"bad key">>)).

project_conflict_and_update() ->
    {ok, _} = bosun_project:create(#{<<"key">> => <<"BOS">>, <<"name">> => <<"Bosun">>}),
    ?assertEqual({error, {conflict, key}}, bosun_project:create(#{<<"key">> => <<"bos">>, <<"name">> => <<"Dup">>})),
    {ok, U} = bosun_project:update(<<"BOS">>, #{<<"name">> => <<"Renamed">>, <<"key">> => <<"XXX">>, <<"archived">> => true}),
    ?assertEqual(<<"BOS">>, maps:get(<<"key">>, U)),
    ?assertEqual(<<"Renamed">>, maps:get(<<"name">>, U)),
    ?assertEqual(true, maps:get(<<"archived">>, U)),
    {ok, Visible} = bosun_project:list(#{}),
    ?assertEqual([], Visible),
    {ok, All} = bosun_project:list(#{include_archived => true}),
    ?assertEqual(1, length(All)),
    ?assertEqual({error, not_found}, bosun_project:update(<<"NOPE">>, #{<<"name">> => <<"x">>})).

task_sequence_per_project() ->
    {ok, _} = bosun_project:create(#{<<"key">> => <<"AAA">>, <<"name">> => <<"a">>}),
    {ok, _} = bosun_project:create(#{<<"key">> => <<"BBB">>, <<"name">> => <<"b">>}),
    {ok, T1} = bosun_task:create(<<"aaa">>, #{<<"title">> => <<"first">>}),
    {ok, T2} = bosun_task:create(<<"AAA">>, #{<<"title">> => <<"second">>, <<"priority">> => <<"HIGH">>,
                                              <<"labels">> => [<<"x">>, <<" x ">>, <<"y">>, <<>>]}),
    {ok, T3} = bosun_task:create(<<"BBB">>, #{<<"title">> => <<"other">>}),
    ?assertEqual(<<"AAA-1">>, maps:get(<<"id">>, T1)),
    ?assertEqual(<<"AAA-2">>, maps:get(<<"id">>, T2)),
    ?assertEqual(<<"BBB-1">>, maps:get(<<"id">>, T3)),
    ?assertEqual(<<"NEW">>, maps:get(<<"status">>, T1)),
    ?assertEqual(<<"high">>, maps:get(<<"priority">>, T2)),
    ?assertEqual([<<"x">>, <<"y">>], maps:get(<<"labels">>, T2)),
    ?assertEqual(<<"user">>, maps:get(<<"created_by">>, T1)),
    ?assertMatch([#{<<"from">> := undefined, <<"to">> := <<"NEW">>, <<"actor">> := <<"user">>}],
                 maps:get(<<"history">>, T1)),
    {ok, P} = bosun_project:get(<<"AAA">>),
    ?assertEqual(2, maps:get(<<"task_count">>, P)),
    {ok, Got} = bosun_task:get(<<"aaa-2">>),
    ?assertEqual(<<"second">>, maps:get(<<"title">>, Got)),
    ?assertEqual([], maps:get(<<"feedback">>, Got)),
    ?assertEqual({error, not_found}, bosun_task:get(<<"AAA-99">>)),
    ?assertMatch({error, {invalid, id, _}}, bosun_task:get(<<"garbage">>)),
    ?assertMatch({error, {invalid, title, _}}, bosun_task:create(<<"AAA">>, #{<<"title">> => <<"">>})),
    ?assertMatch({error, {invalid, priority, _}}, bosun_task:create(<<"AAA">>, #{<<"title">> => <<"t">>, <<"priority">> => <<"urgent">>})),
    ?assertEqual({error, {project, not_found}}, bosun_task:create(<<"ZZZ">>, #{<<"title">> => <<"t">>})),
    {ok, Found} = bosun_task:find_by_ids([<<"AAA-1">>, <<"nope">>, <<"AAA-42">>, <<"bbb-1">>]),
    ?assertEqual([<<"AAA-1">>, <<"BBB-1">>], [maps:get(<<"id">>, F) || F <- Found]).

task_list_filters() ->
    {ok, _} = bosun_project:create(#{<<"key">> => <<"LST">>, <<"name">> => <<"l">>}),
    lists:foreach(fun(N) ->
        {ok, _} = bosun_task:create(<<"LST">>, #{<<"title">> => <<"Task ", (integer_to_binary(N))/binary>>,
                                                 <<"labels">> => case N rem 2 of 0 -> [<<"even">>]; _ -> [] end})
    end, lists:seq(1, 7)),
    {ok, _} = bosun_task_status:transition(<<"LST-1">>, <<"in progress">>, #{}),
    ok = bosun_search:sync(),
    {ok, #{<<"tasks">> := All, <<"total">> := 7}} = bosun_task:list(<<"lst">>, #{}),
    ?assertEqual([<<"LST-7">>, <<"LST-6">>, <<"LST-5">>, <<"LST-4">>, <<"LST-3">>, <<"LST-2">>, <<"LST-1">>],
                 [maps:get(<<"id">>, T) || T <- All]),
    ?assertNot(maps:is_key(<<"description">>, hd(All))),
    {ok, #{<<"tasks">> := InProg, <<"total">> := 1}} = bosun_task:list(<<"LST">>, #{<<"status">> => <<"IN_PROGRESS">>}),
    ?assertEqual(<<"LST-1">>, maps:get(<<"id">>, hd(InProg))),
    {ok, #{<<"total">> := 7}} = bosun_task:list(<<"LST">>, #{<<"status">> => [<<"new">>, <<"in_progress">>]}),
    {ok, #{<<"total">> := 3}} = bosun_task:list(<<"LST">>, #{<<"label">> => <<"even">>}),
    {ok, #{<<"total">> := 1}} = bosun_task:list(<<"LST">>, #{<<"q">> => <<"task 3">>}),
    {ok, #{<<"total">> := 1}} = bosun_task:list(<<"LST">>, #{<<"q">> => <<"lst-4">>}),
    {ok, #{<<"tasks">> := Page, <<"total">> := 7}} = bosun_task:list(<<"LST">>, #{<<"limit">> => 2, <<"offset">> => <<"2">>}),
    ?assertEqual([<<"LST-5">>, <<"LST-4">>], [maps:get(<<"id">>, T) || T <- Page]),
    {ok, #{<<"tasks">> := []}} = bosun_task:list(<<"LST">>, #{<<"offset">> => 100}),
    ?assertMatch({error, {invalid, status, _}}, bosun_task:list(<<"LST">>, #{<<"status">> => <<"bogus">>})),
    ?assertEqual({error, {project, not_found}}, bosun_task:list(<<"NOPE">>, #{})).

task_update_ignores_status() ->
    {ok, _} = bosun_project:create(#{<<"key">> => <<"UPD">>, <<"name">> => <<"u">>}),
    {ok, _} = bosun_task:create(<<"UPD">>, #{<<"title">> => <<"t">>}),
    {ok, U} = bosun_task:update(<<"upd-1">>, #{<<"title">> => <<"new title">>, <<"status">> => <<"DONE">>,
                                                <<"description">> => <<"# hi">>, <<"priority">> => <<"low">>,
                                                <<"labels">> => <<"a, b">>}),
    ?assertEqual(<<"new title">>, maps:get(<<"title">>, U)),
    ?assertEqual(<<"NEW">>, maps:get(<<"status">>, U)),
    ?assertEqual(<<"# hi">>, maps:get(<<"description">>, U)),
    ?assertEqual(<<"low">>, maps:get(<<"priority">>, U)),
    ?assertEqual([<<"a">>, <<"b">>], maps:get(<<"labels">>, U)),
    ?assertMatch({error, {invalid, title, _}}, bosun_task:update(<<"UPD-1">>, #{<<"title">> => <<" ">>})),
    ?assertEqual({error, not_found}, bosun_task:update(<<"UPD-9">>, #{<<"title">> => <<"x">>})).

status_transition_table() ->
    Expected = [{new, in_progress}, {in_progress, done}, {done, verified},
                {done, in_progress}, {verified, in_progress},
                {new, rejected}, {in_progress, rejected}, {rejected, new},
                {new, cancelled}, {in_progress, cancelled}, {cancelled, new}],
    All = bosun_task_status:all(),
    lists:foreach(fun(F) ->
        lists:foreach(fun(T) ->
            ?assertEqual(lists:member({F, T}, Expected), bosun_task_status:allowed(F, T))
        end, All)
    end, All),
    ?assertEqual([in_progress, rejected, cancelled], bosun_task_status:next_statuses(new)),
    ?assertEqual([new], bosun_task_status:next_statuses(cancelled)),
    ?assertEqual({ok, cancelled}, bosun_task_status:parse(<<"canceled">>)),
    ?assertEqual(<<"CANCELLED">>, bosun_task_status:to_binary(cancelled)),
    ?assertEqual([in_progress, verified], bosun_task_status:next_statuses(done)),
    ?assertEqual([new], bosun_task_status:next_statuses(rejected)),
    ?assertEqual({ok, rejected}, bosun_task_status:parse(<<"reject">>)),
    ?assertEqual({ok, in_progress}, bosun_task_status:parse(<<"In-Progress">>)),
    ?assertEqual({ok, in_progress}, bosun_task_status:parse(<<"in progress">>)),
    ?assertEqual({ok, done}, bosun_task_status:parse(<<"DONE ">>)),
    ?assertEqual({ok, done}, bosun_task_status:parse(done)),
    ?assertMatch({error, {invalid, status, _}}, bosun_task_status:parse(<<"closed">>)).

status_transition_flow() ->
    {ok, _} = bosun_project:create(#{<<"key">> => <<"FLW">>, <<"name">> => <<"f">>}),
    {ok, _} = bosun_task:create(<<"FLW">>, #{<<"title">> => <<"t">>}),
    ?assertEqual({error, {invalid_transition, new, done}},
                 bosun_task_status:transition(<<"FLW-1">>, <<"DONE">>, #{})),
    {ok, T1} = bosun_task_status:transition(<<"flw-1">>, <<"IN_PROGRESS">>, #{actor => <<"agent">>}),
    ?assertEqual(<<"IN_PROGRESS">>, maps:get(<<"status">>, T1)),
    {ok, T2} = bosun_task_status:transition(<<"FLW-1">>, <<"DONE">>, #{actor => <<"agent">>, comment => <<"did it">>}),
    {ok, T3} = bosun_task_status:transition(<<"FLW-1">>, <<"IN_PROGRESS">>, #{comment => <<"rejected">>}),
    {ok, T4} = bosun_task_status:transition(<<"FLW-1">>, <<"DONE">>, #{actor => <<"agent">>}),
    %% user 打回没有夺走执行方；agent 自己验收要带测试证据，user（第三方）验收不用
    ?assertEqual(<<"agent">>, maps:get(<<"assignee">>, T4)),
    ?assertEqual({error, {self_verify_requires_tests, <<"agent">>}},
                 bosun_task_status:transition(<<"FLW-1">>, <<"VERIFIED">>, #{actor => <<"agent">>})),
    {ok, T5} = bosun_task_status:transition(<<"FLW-1">>, <<"VERIFIED">>, #{}),
    ?assertEqual(<<"VERIFIED">>, maps:get(<<"status">>, T5)),
    History = maps:get(<<"history">>, T5),
    ?assertEqual(6, length(History)),
    ?assertMatch(#{<<"from">> := <<"DONE">>, <<"to">> := <<"VERIFIED">>, <<"actor">> := <<"user">>}, hd(History)),
    ?assertMatch(#{<<"from">> := <<"IN_PROGRESS">>, <<"to">> := <<"DONE">>, <<"comment">> := <<"did it">>},
                 hd(maps:get(<<"history">>, T2))),
    ?assertMatch(#{<<"comment">> := <<"rejected">>}, hd(maps:get(<<"history">>, T3))),
    ?assertEqual({error, {invalid_transition, verified, verified}},
                 bosun_task_status:transition(<<"FLW-1">>, <<"VERIFIED">>, #{})),
    ?assertEqual({error, not_found}, bosun_task_status:transition(<<"FLW-2">>, <<"IN_PROGRESS">>, #{})),
    %% 执行方拒绝 → 提出方重新提交
    {ok, _} = bosun_task:create(<<"FLW">>, #{<<"title">> => <<"bad idea">>, <<"actor">> => <<"coxswain">>}),
    {ok, R1} = bosun_task_status:transition(<<"FLW-2">>, <<"REJECTED">>, #{actor => <<"keel">>, comment => <<"see FLW-2#1">>}),
    ?assertEqual(<<"REJECTED">>, maps:get(<<"status">>, R1)),
    ?assertEqual(<<"coxswain">>, maps:get(<<"created_by">>, R1)),
    ?assertEqual({error, {invalid_transition, rejected, in_progress}},
                 bosun_task_status:transition(<<"FLW-2">>, <<"IN_PROGRESS">>, #{})),
    {ok, R2} = bosun_task_status:transition(<<"FLW-2">>, <<"NEW">>, #{actor => <<"coxswain">>}),
    ?assertEqual(<<"NEW">>, maps:get(<<"status">>, R2)),
    {ok, R3} = bosun_task_status:transition(<<"FLW-2">>, <<"IN_PROGRESS">>, #{actor => <<"keel">>}),
    {ok, R4} = bosun_task_status:transition(<<"FLW-2">>, <<"REJECTED">>, #{actor => <<"keel">>}),
    ?assertEqual(<<"IN_PROGRESS">>, maps:get(<<"status">>, R3)),
    ?assertEqual(<<"REJECTED">>, maps:get(<<"status">>, R4)),
    ?assertMatch({error, {invalid, status, _}}, bosun_task_status:transition(<<"FLW-1">>, <<"nope">>, #{})),
    %% 撤销：进行中不做了，assignee 保留；恢复回 NEW；做完的不能撤销
    {ok, _} = bosun_task:create(<<"FLW">>, #{<<"title">> => <<"obsolete">>, <<"actor">> => <<"coxswain">>}),
    {ok, _} = bosun_task_status:transition(<<"FLW-3">>, <<"IN_PROGRESS">>, #{actor => <<"keel">>}),
    {ok, C1} = bosun_task_status:transition(<<"FLW-3">>, <<"CANCELLED">>, #{actor => <<"coxswain">>, comment => <<"superseded by FLW-9">>}),
    ?assertEqual(<<"CANCELLED">>, maps:get(<<"status">>, C1)),
    ?assertEqual(<<"keel">>, maps:get(<<"assignee">>, C1)),
    ?assertEqual({error, {invalid_transition, cancelled, in_progress}},
                 bosun_task_status:transition(<<"FLW-3">>, <<"IN_PROGRESS">>, #{})),
    {ok, C2} = bosun_task_status:transition(<<"FLW-3">>, <<"NEW">>, #{actor => <<"coxswain">>}),
    ?assertEqual(<<"NEW">>, maps:get(<<"status">>, C2)),
    ?assertEqual({error, {invalid_transition, verified, cancelled}},
                 bosun_task_status:transition(<<"FLW-1">>, <<"CANCELLED">>, #{})),
    %% 打回 / 重开不改执行方：keel 领取并完成，coxswain 打回后 assignee 仍是 keel
    {ok, _} = bosun_task:create(<<"FLW">>, #{<<"title">> => <<"keep assignee">>, <<"actor">> => <<"coxswain">>}),
    {ok, _} = bosun_task_status:transition(<<"FLW-4">>, <<"IN_PROGRESS">>, #{actor => <<"keel">>}),
    {ok, _} = bosun_task_status:transition(<<"FLW-4">>, <<"DONE">>, #{actor => <<"keel">>}),
    {ok, K1} = bosun_task_status:transition(<<"FLW-4">>, <<"IN_PROGRESS">>, #{actor => <<"coxswain">>, comment => <<"not yet">>}),
    ?assertEqual(<<"keel">>, maps:get(<<"assignee">>, K1)).

feedback_append() ->
    {ok, _} = bosun_project:create(#{<<"key">> => <<"FBK">>, <<"name">> => <<"f">>}),
    {ok, T0} = bosun_task:create(<<"FBK">>, #{<<"title">> => <<"t">>}),
    {ok, _} = bosun_task:create(<<"FBK">>, #{<<"title">> => <<"t2">>}),
    {ok, F1} = bosun_feedback:add(<<"fbk-1">>, #{<<"content">> => <<"hello">>}),
    ?assertEqual(<<"FBK-1#1">>, maps:get(<<"id">>, F1)),
    ?assertEqual(<<"user">>, maps:get(<<"author">>, F1)),
    ?assertEqual(<<"comment">>, maps:get(<<"kind">>, F1)),
    {ok, F2} = bosun_feedback:add(<<"FBK-1">>, #{<<"content">> => <<"why?">>, <<"kind">> => <<"QUESTION">>, <<"author">> => <<"agent">>}),
    ?assertEqual(<<"FBK-1#2">>, maps:get(<<"id">>, F2)),
    {ok, F3} = bosun_feedback:add(<<"FBK-2">>, #{<<"content">> => <<"other task">>}),
    ?assertEqual(<<"FBK-2#1">>, maps:get(<<"id">>, F3)),
    {ok, List} = bosun_feedback:list(<<"FBK-1">>),
    ?assertEqual([<<"FBK-1#1">>, <<"FBK-1#2">>], [maps:get(<<"id">>, F) || F <- List]),
    {ok, T1} = bosun_task:get(<<"FBK-1">>),
    ?assertEqual(2, maps:get(<<"feedback_count">>, T1)),
    ?assertEqual(true, maps:get(<<"open_question">>, T1)),
    ?assertEqual(2, length(maps:get(<<"feedback">>, T1))),
    ?assert(maps:get(<<"updated_at">>, T1) >= maps:get(<<"updated_at">>, T0)),
    {ok, _} = bosun_feedback:add(<<"FBK-1">>, #{<<"content">> => <<"because">>, <<"kind">> => <<"answer">>}),
    {ok, T2} = bosun_task:get(<<"FBK-1">>),
    ?assertEqual(false, maps:get(<<"open_question">>, T2)),
    {ok, G} = bosun_feedback:get(<<"fbk-1#2">>),
    ?assertEqual(<<"why?">>, maps:get(<<"content">>, G)),
    ?assertEqual(<<"active">>, maps:get(<<"status">>, G)),
    %% 修订 = 追加新条 + 旧条作废；只有原作者能改；不能删
    ?assertEqual({error, {forbidden, <<"agent">>}},
                 bosun_feedback:revise(<<"FBK-1#2">>, #{<<"content">> => <<"x">>, <<"actor">> => <<"user">>})),
    {ok, R} = bosun_feedback:revise(<<"fbk-1#2">>, #{<<"content">> => <<"why exactly?">>, <<"kind">> => <<"comment">>, <<"actor">> => <<"agent">>}),
    ?assertEqual(<<"FBK-1#4">>, maps:get(<<"id">>, R)),
    ?assertEqual(<<"FBK-1#2">>, maps:get(<<"supersedes">>, R)),
    ?assertEqual(<<"active">>, maps:get(<<"status">>, R)),
    ?assertEqual(<<"why exactly?">>, maps:get(<<"content">>, R)),
    {ok, Old} = bosun_feedback:get(<<"FBK-1#2">>),
    ?assertEqual(<<"superseded">>, maps:get(<<"status">>, Old)),
    ?assertEqual(<<"FBK-1#4">>, maps:get(<<"superseded_by">>, Old)),
    ?assertEqual(<<"why?">>, maps:get(<<"content">>, Old)),
    ?assertEqual({error, {superseded, <<"FBK-1#4">>}},
                 bosun_feedback:revise(<<"FBK-1#2">>, #{<<"content">> => <<"again">>, <<"actor">> => <<"agent">>})),
    ?assertMatch({error, {invalid, content, _}},
                 bosun_feedback:revise(<<"FBK-1#4">>, #{<<"content">> => <<" ">>, <<"actor">> => <<"agent">>})),
    ?assertEqual({error, not_found}, bosun_feedback:revise(<<"FBK-1#9">>, #{<<"content">> => <<"x">>, <<"actor">> => <<"agent">>})),
    {ok, All} = bosun_feedback:list(<<"FBK-1">>),
    ?assertEqual(4, length(All)),
    ?assertEqual(3, bosun_feedback:count(<<"FBK-1">>)),
    {ok, T3} = bosun_task:get(<<"FBK-1">>),
    ?assertEqual(3, maps:get(<<"feedback_count">>, T3)),
    ?assertEqual(false, maps:get(<<"open_question">>, T3)),
    ?assertMatch({error, {invalid, content, _}}, bosun_feedback:add(<<"FBK-1">>, #{<<"content">> => <<"  ">>})),
    ?assertMatch({error, {invalid, kind, _}}, bosun_feedback:add(<<"FBK-1">>, #{<<"content">> => <<"x">>, <<"kind">> => <<"rant">>})),
    ?assertEqual({error, not_found}, bosun_feedback:add(<<"FBK-9">>, #{<<"content">> => <<"x">>})),
    ?assertEqual({error, not_found}, bosun_feedback:list(<<"FBK-9">>)),
    {ok, #{<<"tasks">> := [S2, S1]}} = bosun_task:list(<<"FBK">>, #{}),
    ?assertEqual(3, maps:get(<<"feedback_count">>, S1)),
    ?assertEqual(1, maps:get(<<"feedback_count">>, S2)).

archived_project_rejects_tasks() ->
    {ok, _} = bosun_project:create(#{<<"key">> => <<"ARC">>, <<"name">> => <<"a">>}),
    {ok, _} = bosun_task:create(<<"ARC">>, #{<<"title">> => <<"before">>}),
    {ok, _} = bosun_project:update(<<"ARC">>, #{<<"archived">> => true}),
    ?assertEqual({error, {project, archived}}, bosun_task:create(<<"ARC">>, #{<<"title">> => <<"after">>})),
    ?assertEqual({error, archived}, bosun_project:next_task_seq(<<"ARC">>)),
    {ok, _} = bosun_task_status:transition(<<"ARC-1">>, <<"IN_PROGRESS">>, #{}),
    {ok, _} = bosun_feedback:add(<<"ARC-1">>, #{<<"content">> => <<"still works">>}).

concurrent_task_creation() ->
    {ok, _} = bosun_project:create(#{<<"key">> => <<"CON">>, <<"name">> => <<"c">>}),
    Parent = self(),
    N = 50,
    lists:foreach(fun(I) ->
        spawn_link(fun() ->
            R = bosun_task:create(<<"CON">>, #{<<"title">> => <<"t", (integer_to_binary(I))/binary>>}),
            Parent ! {done, R}
        end)
    end, lists:seq(1, N)),
    Ids = [begin receive {done, {ok, T}} -> maps:get(<<"id">>, T) end end || _ <- lists:seq(1, N)],
    ?assertEqual(N, length(lists:usort(Ids))),
    Seqs = lists:sort([S || Id <- Ids, {ok, _, _, S} <- [bosun_id:parse_task_id(Id)]]),
    ?assertEqual(lists:seq(1, N), Seqs),
    {ok, P} = bosun_project:get(<<"CON">>),
    ?assertEqual(N, maps:get(<<"task_count">>, P)).

full_text_search() ->
    {ok, _} = bosun_project:create(#{<<"key">> => <<"SRC">>, <<"name">> => <<"s">>}),
    {ok, _} = bosun_project:create(#{<<"key">> => <<"OTH">>, <<"name">> => <<"o">>}),
    {ok, _} = bosun_task:create(<<"SRC">>, #{<<"title">> => <<"实现 MCP create_task"/utf8>>,
                                             <<"description">> => <<"需要让 Agent 通过 MCP 创建任务"/utf8>>,
                                             <<"labels">> => [<<"backend">>]}),
    {ok, _} = bosun_task:create(<<"SRC">>, #{<<"title">> => <<"Add health endpoint">>,
                                             <<"description">> => <<"Expose GET /health for the load balancer">>}),
    {ok, _} = bosun_task:create(<<"SRC">>, #{<<"title">> => <<"Write docs">>}),
    {ok, _} = bosun_task:create(<<"OTH">>, #{<<"title">> => <<"health check in other project">>}),
    {ok, _} = bosun_feedback:add(<<"SRC-3">>, #{<<"content">> => <<"文档里要提到 health endpoint 的超时设置"/utf8>>, <<"author">> => <<"keel">>}),
    ok = bosun_search:sync(),
    {ok, #{<<"hits">> := H1}} = bosun_task:search(<<"创建任务"/utf8>>, #{}),
    ?assertEqual([<<"SRC-1">>], [maps:get(<<"id">>, maps:get(<<"task">>, H)) || H <- H1]),
    {ok, #{<<"hits">> := H2}} = bosun_task:search(<<"HEALTH">>, #{}),
    Ids2 = [maps:get(<<"id">>, maps:get(<<"task">>, H)) || H <- H2],
    ?assertEqual([<<"OTH-1">>, <<"SRC-2">>, <<"SRC-3">>], lists:sort(Ids2)),
    [FbHit] = [H || #{<<"matched">> := <<"feedback">>} = H <- H2],
    ?assertMatch(#{<<"id">> := <<"SRC-3#1">>, <<"snippet">> := _}, maps:get(<<"feedback">>, FbHit)),
    {ok, #{<<"hits">> := H3}} = bosun_task:search(<<"health">>, #{<<"project">> => <<"oth">>}),
    ?assertEqual([<<"OTH-1">>], [maps:get(<<"id">>, maps:get(<<"task">>, H)) || H <- H3]),
    {ok, #{<<"hits">> := H4}} = bosun_task:search(<<"heal">>, #{<<"project">> => <<"SRC">>}),
    ?assert(length(H4) >= 1),
    %% 标签也进索引，且标签命中排在正文命中前面（fields 加权）
    {ok, _} = bosun_task:create(<<"SRC">>, #{<<"title">> => <<"Talk to the platform team">>, <<"description">> => <<"backend backend backend">>}),
    ok = bosun_search:sync(),
    {ok, #{<<"hits">> := [#{<<"task">> := #{<<"id">> := <<"SRC-1">>}}, #{<<"task">> := #{<<"id">> := <<"SRC-4">>}}]}} = bosun_task:search(<<"backend">>, #{}),
    {ok, #{<<"tasks">> := L1}} = bosun_task:list(<<"SRC">>, #{<<"q">> => <<"health">>}),
    ?assertEqual([<<"SRC-2">>, <<"SRC-3">>], [maps:get(<<"id">>, T) || T <- L1]),
    {ok, #{<<"tasks">> := L2, <<"total">> := 4}} = bosun_task:list(<<"SRC">>, #{<<"q">> => <<"src-">>}),
    ?assertEqual(4, length(L2)),
    {ok, _} = bosun_task:update(<<"SRC-3">>, #{<<"title">> => <<"Write the manual">>}),
    {ok, _} = bosun_task_status:transition(<<"SRC-2">>, <<"IN_PROGRESS">>, #{}),
    ok = bosun_search:sync(),
    {ok, #{<<"hits">> := []}} = bosun_task:search(<<"docs">>, #{}),
    {ok, #{<<"hits">> := [#{<<"task">> := #{<<"id">> := <<"SRC-3">>, <<"status">> := <<"NEW">>}}]}} = bosun_task:search(<<"manual">>, #{}),
    {ok, #{<<"hits">> := [#{<<"task">> := #{<<"status">> := <<"IN_PROGRESS">>}} | _]}} = bosun_task:search(<<"balancer">>, #{}),
    ?assertEqual({ok, #{<<"hits">> => []}}, bosun_task:search(<<"  ">>, #{})),
    {ok, N} = bosun_search:reindex(),
    ?assertEqual(6, N),
    {ok, #{<<"hits">> := [_]}} = bosun_task:search(<<"manual">>, #{}).

workflow_doc() ->
    {ok, Zh} = bosun_workflow:doc(),
    {ok, En} = bosun_workflow:doc(<<"en">>),
    ?assertNotEqual(Zh, En),
    ?assertMatch({_, _}, binary:match(Zh, <<"self_verify_requires_tests">>)),
    ?assertMatch({_, _}, binary:match(En, <<"self_verify_requires_tests">>)),
    ?assertMatch({error, {invalid, lang, _}}, bosun_workflow:doc(<<"fr">>)),
    %% priv 里的副本必须等于仓库 docs/ 的原件（pre_hook 拷贝）
    Root = filename:join([code:lib_dir(bosun_core), "..", "..", ".."]),
    case file:read_file(filename:join([Root, "docs", "AGENT-WORKFLOW.md"])) of
        {ok, Src} -> ?assertEqual(Src, Zh);
        {error, enoent} -> ok
    end.

actor_registry() ->
    {ok, _} = bosun_project:create(#{<<"key">> => <<"ACT">>, <<"name">> => <<"a">>}),
    %% 写操作自动登记；REST 不给 kind 时按名字猜：user → human，其余 agent
    {ok, T} = bosun_task:create(<<"ACT">>, #{<<"title">> => <<"t">>, <<"actor">> => <<"user">>}),
    ?assertEqual(<<"human">>, maps:get(<<"created_by_kind">>, T)),
    {ok, T2} = bosun_task:create(<<"ACT">>, #{<<"title">> => <<"t2">>, <<"actor">> => <<"keel/wt1">>, <<"actor_kind">> => <<"agent">>}),
    ?assertEqual(<<"agent">>, maps:get(<<"created_by_kind">>, T2)),
    {ok, _} = bosun_task_status:transition(<<"ACT-2">>, <<"IN_PROGRESS">>, #{actor => <<"keel/wt1">>, actor_kind => <<"agent">>}),
    {ok, _} = bosun_feedback:add(<<"ACT-2">>, #{<<"content">> => <<"hi">>, <<"author">> => <<"coxswain">>, <<"author_kind">> => <<"agent">>}),
    {ok, As} = bosun_actor:list(),
    Names = lists:sort([maps:get(<<"name">>, A) || A <- As]),
    ?assertEqual([<<"coxswain">>, <<"keel/wt1">>, <<"user">>], Names),
    {ok, K} = bosun_actor:get(<<"keel/wt1">>),
    ?assertEqual(<<"agent">>, maps:get(<<"kind">>, K)),
    ?assertEqual(human, bosun_actor:kind_of(<<"user">>)),
    ?assertEqual(agent, bosun_actor:kind_of(<<"never-seen">>)),
    %% upsert 保留原 kind，更新 last_seen 与 project
    ok = bosun_actor:touch(<<"keel/wt1">>, undefined, #{project => <<"keel">>, worktree => <<"~/wt1">>}),
    {ok, K2} = bosun_actor:get(<<"keel/wt1">>),
    ?assertEqual(<<"agent">>, maps:get(<<"kind">>, K2)),
    ?assertEqual(<<"KEEL">>, maps:get(<<"project">>, K2)),
    ?assertEqual(<<"~/wt1">>, maps:get(<<"worktree">>, K2)),
    ?assert(maps:get(<<"last_seen">>, K2) >= maps:get(<<"first_seen">>, K2)),
    %% 显式 kind 可以改
    ok = bosun_actor:touch(<<"coxswain">>, human),
    ?assertEqual(human, bosun_actor:kind_of(<<"coxswain">>)),
    %% 空名字忽略
    ok = bosun_actor:touch(<<"  ">>, agent),
    ?assertEqual({error, not_found}, bosun_actor:get(<<>>)).

roles_and_evidence() ->
    {ok, _} = bosun_project:create(#{<<"key">> => <<"ROL">>, <<"name">> => <<"r">>}),
    %% requester = coxswain 建单并预派 keel/wt1
    {ok, T0} = bosun_task:create(<<"ROL">>, #{<<"title">> => <<"do it">>, <<"actor">> => <<"coxswain">>, <<"assignee">> => <<"keel/wt1">>}),
    ?assertEqual(<<"coxswain">>, maps:get(<<"created_by">>, T0)),
    ?assertEqual(<<"keel/wt1">>, maps:get(<<"assignee">>, T0)),
    ?assertEqual([], maps:get(<<"commits">>, T0)),
    %% 实际领取者成为 assignee（覆盖预派）
    {ok, T1} = bosun_task_status:transition(<<"ROL-1">>, <<"IN_PROGRESS">>, #{actor => <<"keel/wt2">>}),
    ?assertEqual(<<"keel/wt2">>, maps:get(<<"assignee">>, T1)),
    %% DONE 带 commits，不带 tests
    {ok, T2} = bosun_task_status:transition(<<"ROL-1">>, <<"DONE">>, #{actor => <<"keel/wt2">>, commits => [<<"abc1234">>, <<"DEADBEEF00">>]}),
    ?assertEqual([<<"abc1234">>, <<"DEADBEEF00">>], maps:get(<<"commits">>, T2)),
    ?assertMatch(#{<<"commits">> := [<<"abc1234">>, <<"DEADBEEF00">>], <<"tests">> := undefined}, hd(maps:get(<<"history">>, T2))),
    %% 执行方自验收：没有测试证据 → 拒
    ?assertEqual({error, {self_verify_requires_tests, <<"keel/wt2">>}},
                 bosun_task_status:transition(<<"ROL-1">>, <<"VERIFIED">>, #{actor => <<"keel/wt2">>})),
    %% 本次带 tests.passed=false 也拒
    ?assertEqual({error, {self_verify_requires_tests, <<"keel/wt2">>}},
                 bosun_task_status:transition(<<"ROL-1">>, <<"VERIFIED">>, #{actor => <<"keel/wt2">>, tests => #{<<"passed">> => false, <<"command">> => <<"make test">>}})),
    %% 本次带 tests.passed=true → 通过；history 里记下
    {ok, T3} = bosun_task_status:transition(<<"ROL-1">>, <<"VERIFIED">>, #{actor => <<"keel/wt2">>, tests => #{<<"command">> => <<"rebar3 eunit">>, <<"passed">> => true, <<"summary">> => <<"27 passed">>}}),
    ?assertEqual(<<"VERIFIED">>, maps:get(<<"status">>, T3)),
    ?assertMatch(#{<<"tests">> := #{<<"command">> := <<"rebar3 eunit">>, <<"passed">> := true, <<"summary">> := <<"27 passed">>}}, hd(maps:get(<<"history">>, T3))),
    %% 重开 → 再 DONE 时带 tests.passed=true → 之后自验收无需再带
    {ok, _} = bosun_task_status:transition(<<"ROL-1">>, <<"IN_PROGRESS">>, #{actor => <<"keel/wt2">>}),
    {ok, _} = bosun_task_status:transition(<<"ROL-1">>, <<"DONE">>, #{actor => <<"keel/wt2">>, commits => <<"1111111, 2222222">>, tests => #{<<"passed">> => true}}),
    {ok, T4} = bosun_task_status:transition(<<"ROL-1">>, <<"VERIFIED">>, #{actor => <<"keel/wt2">>}),
    ?assertEqual(<<"VERIFIED">>, maps:get(<<"status">>, T4)),
    %% 聚合去重、按时间
    ?assertEqual([<<"abc1234">>, <<"DEADBEEF00">>, <<"1111111">>, <<"2222222">>], maps:get(<<"commits">>, T4)),
    %% 非 assignee（requester / 第三方）验收不需要 tests
    {ok, _} = bosun_task_status:transition(<<"ROL-1">>, <<"IN_PROGRESS">>, #{actor => <<"keel/wt2">>}),
    {ok, _} = bosun_task_status:transition(<<"ROL-1">>, <<"DONE">>, #{actor => <<"keel/wt2">>}),
    {ok, T5} = bosun_task_status:transition(<<"ROL-1">>, <<"VERIFIED">>, #{actor => <<"coxswain">>}),
    ?assertEqual(<<"VERIFIED">>, maps:get(<<"status">>, T5)),
    %% 坏输入
    ?assertMatch({error, {invalid, commits, _}}, bosun_task_status:transition(<<"ROL-1">>, <<"IN_PROGRESS">>, #{commits => [<<"not-a-hash!">>]})),
    ?assertMatch({error, {invalid, tests, _}}, bosun_task_status:transition(<<"ROL-1">>, <<"IN_PROGRESS">>, #{tests => #{<<"command">> => <<"x">>}})),
    %% update 可改派 / 清空 assignee
    {ok, U1} = bosun_task:update(<<"ROL-1">>, #{<<"assignee">> => <<"keel/wt9">>}),
    ?assertEqual(<<"keel/wt9">>, maps:get(<<"assignee">>, U1)),
    {ok, U2} = bosun_task:update(<<"ROL-1">>, #{<<"assignee">> => <<"">>}),
    ?assertEqual(undefined, maps:get(<<"assignee">>, U2)).

epics() ->
    {ok, _} = bosun_project:create(#{<<"key">> => <<"EP">>, <<"name">> => <<"e">>}),
    {ok, _} = bosun_project:create(#{<<"key">> => <<"EQ">>, <<"name">> => <<"q">>}),
    {ok, E} = bosun_task:create(<<"EP">>, #{<<"title">> => <<"switch search to bitcask">>, <<"kind">> => <<"epic">>}),
    ?assertEqual(<<"epic">>, maps:get(<<"kind">>, E)),
    ?assertEqual(undefined, maps:get(<<"epic">>, E)),
    ?assertMatch(#{<<"total">> := 0, <<"done">> := 0}, maps:get(<<"progress">>, E)),
    ?assertEqual([], maps:get(<<"children">>, E)),
    %% 普通任务缺省 kind = task，无 progress；挂到 Epic（含跨项目、id 大小写）
    {ok, T1} = bosun_task:create(<<"EP">>, #{<<"title">> => <<"index feedback">>, <<"epic">> => <<"ep-1">>}),
    ?assertEqual(<<"task">>, maps:get(<<"kind">>, T1)),
    ?assertEqual(undefined, maps:get(<<"progress">>, T1)),
    ?assertEqual(<<"EP-1">>, maps:get(<<"epic">>, T1)),
    ?assertEqual(<<"switch search to bitcask">>, maps:get(<<"epic_title">>, T1)),
    {ok, _} = bosun_task:create(<<"EQ">>, #{<<"title">> => <<"cross project step">>, <<"epic">> => <<"EP-1">>}),
    {ok, T3} = bosun_task:create(<<"EP">>, #{<<"title">> => <<"loose">>}),
    ?assertEqual(undefined, maps:get(<<"epic">>, T3)),
    %% 校验
    ?assertMatch({error, {invalid, epic, _}}, bosun_task:create(<<"EP">>, #{<<"title">> => <<"x">>, <<"epic">> => <<"EP-2">>})),
    ?assertMatch({error, {invalid, epic, _}}, bosun_task:create(<<"EP">>, #{<<"title">> => <<"x">>, <<"epic">> => <<"EP-99">>})),
    ?assertMatch({error, {invalid, epic, _}}, bosun_task:create(<<"EP">>, #{<<"title">> => <<"x">>, <<"kind">> => <<"epic">>, <<"epic">> => <<"EP-1">>})),
    ?assertMatch({error, {invalid, kind, _}}, bosun_task:create(<<"EP">>, #{<<"title">> => <<"x">>, <<"kind">> => <<"story">>})),
    ?assertMatch({error, {invalid, epic, _}}, bosun_task:update(<<"EP-1">>, #{<<"epic">> => <<"EP-1">>})),
    %% update 挂 / 摘；kind 不可改
    {ok, U1} = bosun_task:update(<<"EP-3">>, #{<<"epic">> => <<"EP-1">>, <<"kind">> => <<"epic">>}),
    ?assertEqual(<<"EP-1">>, maps:get(<<"epic">>, U1)),
    ?assertEqual(<<"task">>, maps:get(<<"kind">>, U1)),
    {ok, U2} = bosun_task:update(<<"EP-3">>, #{<<"epic">> => <<>>}),
    ?assertEqual(undefined, maps:get(<<"epic">>, U2)),
    %% 进度与 children
    {ok, _} = bosun_task_status:transition(<<"EP-2">>, <<"IN_PROGRESS">>, #{actor => <<"a">>}),
    {ok, _} = bosun_task_status:transition(<<"EP-2">>, <<"DONE">>, #{actor => <<"a">>}),
    {ok, _} = bosun_task_status:transition(<<"EP-2">>, <<"VERIFIED">>, #{actor => <<"b">>}),
    {ok, E2} = bosun_task:get(<<"EP-1">>),
    ?assertMatch(#{<<"total">> := 2, <<"done">> := 1, <<"by_status">> := #{<<"VERIFIED">> := 1, <<"NEW">> := 1}}, maps:get(<<"progress">>, E2)),
    ?assertEqual([<<"EP-2">>, <<"EQ-1">>], [maps:get(<<"id">>, C) || C <- maps:get(<<"children">>, E2)]),
    %% 列表过滤
    {ok, #{<<"tasks">> := [#{<<"id">> := <<"EP-1">>}]}} = bosun_task:list(<<"EP">>, #{<<"kind">> => <<"epic">>}),
    {ok, #{<<"total">> := 2}} = bosun_task:list(<<"EP">>, #{<<"kind">> => <<"task">>}),
    {ok, #{<<"tasks">> := [#{<<"id">> := <<"EP-2">>}]}} = bosun_task:list(<<"EP">>, #{<<"epic">> => <<"ep-1">>}),
    ?assertMatch({error, {invalid, kind, _}}, bosun_task:list(<<"EP">>, #{<<"kind">> => <<"bug">>})).

epic_auto_flow() ->
    {ok, _} = bosun_project:create(#{<<"key">> => <<"EA">>, <<"name">> => <<"a">>}),
    {ok, _} = bosun_project:create(#{<<"key">> => <<"EB">>, <<"name">> => <<"b">>}),
    {ok, _} = bosun_task:create(<<"EA">>, #{<<"title">> => <<"ship it">>, <<"kind">> => <<"epic">>}),
    {ok, _} = bosun_task:create(<<"EA">>, #{<<"title">> => <<"step 1">>, <<"epic">> => <<"EA-1">>}),
    {ok, _} = bosun_task:create(<<"EA">>, #{<<"title">> => <<"step 2">>, <<"epic">> => <<"EA-1">>}),
    %% 步骤到 DONE 就计入进度（不再等验收）
    {ok, _} = bosun_task_status:transition(<<"EA-2">>, <<"IN_PROGRESS">>, #{actor => <<"a">>}),
    {ok, _} = bosun_task_status:transition(<<"EA-2">>, <<"DONE">>, #{actor => <<"a">>}),
    {ok, P1} = bosun_task:get(<<"EA-1">>),
    ?assertMatch(#{<<"total">> := 2, <<"done">> := 1,
                   <<"by_status">> := #{<<"DONE">> := 1, <<"NEW">> := 1}}, maps:get(<<"progress">>, P1)),
    ?assertEqual(<<"NEW">>, maps:get(<<"status">>, P1)),
    %% 步骤全部完成（Epic 还在 NEW）→ Epic 自动 → DONE
    {ok, _} = bosun_task_status:transition(<<"EA-3">>, <<"IN_PROGRESS">>, #{actor => <<"a">>}),
    {ok, _} = bosun_task_status:transition(<<"EA-3">>, <<"DONE">>, #{actor => <<"a">>}),
    {ok, P2} = bosun_task:get(<<"EA-1">>),
    ?assertEqual(<<"DONE">>, maps:get(<<"status">>, P2)),
    [AutoDone | _] = maps:get(<<"history">>, P2),
    ?assertEqual(<<"DONE">>, maps:get(<<"to">>, AutoDone)),
    ?assertEqual(<<"NEW">>, maps:get(<<"from">>, AutoDone)),
    ?assertEqual(<<"all steps completed (auto)">>, maps:get(<<"comment">>, AutoDone)),
    ?assertEqual(<<"a">>, maps:get(<<"actor">>, AutoDone)),
    %% 步骤打回 → Epic 自动回 IN_PROGRESS
    {ok, _} = bosun_task_status:transition(<<"EA-3">>, <<"IN_PROGRESS">>, #{actor => <<"b">>}),
    {ok, P3} = bosun_task:get(<<"EA-1">>),
    ?assertEqual(<<"IN_PROGRESS">>, maps:get(<<"status">>, P3)),
    [AutoReopen | _] = maps:get(<<"history">>, P3),
    ?assertEqual(<<"IN_PROGRESS">>, maps:get(<<"to">>, AutoReopen)),
    ?assertEqual(<<"DONE">>, maps:get(<<"from">>, AutoReopen)),
    ?assertEqual(<<"step reopened (auto)">>, maps:get(<<"comment">>, AutoReopen)),
    %% CANCELLED 的步骤不阻塞完成：step 2 撤销后剩一个 DONE → Epic 再次自动 DONE
    {ok, _} = bosun_task_status:transition(<<"EA-3">>, <<"CANCELLED">>, #{actor => <<"b">>}),
    {ok, P4} = bosun_task:get(<<"EA-1">>),
    ?assertEqual(<<"DONE">>, maps:get(<<"status">>, P4)),
    ?assertMatch(#{<<"total">> := 2, <<"done">> := 1}, maps:get(<<"progress">>, P4)),
    %% CANCELLED 的 Epic 不参与自动流转
    {ok, _} = bosun_task:create(<<"EA">>, #{<<"title">> => <<"later">>, <<"kind">> => <<"epic">>}),
    {ok, _} = bosun_task:create(<<"EA">>, #{<<"title">> => <<"step">>, <<"epic">> => <<"EA-4">>}),
    {ok, _} = bosun_task_status:transition(<<"EA-4">>, <<"CANCELLED">>, #{actor => <<"a">>}),
    {ok, _} = bosun_task_status:transition(<<"EA-5">>, <<"IN_PROGRESS">>, #{actor => <<"a">>}),
    {ok, _} = bosun_task_status:transition(<<"EA-5">>, <<"DONE">>, #{actor => <<"a">>}),
    {ok, P5} = bosun_task:get(<<"EA-4">>),
    ?assertEqual(<<"CANCELLED">>, maps:get(<<"status">>, P5)),
    %% 跨项目步骤同样触发：EA 的任务挂到 EB 的 Epic 上
    {ok, _} = bosun_task:create(<<"EB">>, #{<<"title">> => <<"cross epic">>, <<"kind">> => <<"epic">>}),
    {ok, _} = bosun_task:create(<<"EA">>, #{<<"title">> => <<"far step">>, <<"epic">> => <<"EB-1">>}),
    {ok, _} = bosun_task_status:transition(<<"EA-6">>, <<"IN_PROGRESS">>, #{actor => <<"a">>}),
    {ok, _} = bosun_task_status:transition(<<"EA-6">>, <<"DONE">>, #{actor => <<"a">>}),
    {ok, P6} = bosun_task:get(<<"EB-1">>),
    ?assertEqual(<<"DONE">>, maps:get(<<"status">>, P6)).

links() ->
    {ok, _} = bosun_project:create(#{<<"key">> => <<"LN">>, <<"name">> => <<"l">>}),
    {ok, _} = bosun_project:create(#{<<"key">> => <<"LO">>, <<"name">> => <<"o">>}),
    {ok, _} = bosun_task:create(<<"LN">>, #{<<"title">> => <<"schema">>}),
    {ok, _} = bosun_task:create(<<"LN">>, #{<<"title">> => <<"api on top of schema">>}),
    {ok, _} = bosun_task:create(<<"LO">>, #{<<"title">> => <<"ui on top of api">>}),
    {ok, _} = bosun_task:create(<<"LN">>, #{<<"title">> => <<"old approach">>, <<"actor">> => <<"coxswain">>}),
    %% 校验
    ?assertMatch({error, {invalid, to, _}}, bosun_link:add(<<"LN-1">>, <<"LN-1">>, <<"depends_on">>, #{})),
    ?assertMatch({error, {invalid, to, _}}, bosun_link:add(<<"LN-1">>, <<"LN-99">>, <<"depends_on">>, #{})),
    ?assertMatch({error, {invalid, from, _}}, bosun_link:add(<<"LN-99">>, <<"LN-1">>, <<"depends_on">>, #{})),
    ?assertMatch({error, {invalid, type, _}}, bosun_link:add(<<"LN-1">>, <<"LN-2">>, <<"related">>, #{})),
    ?assertMatch({error, {invalid, from, _}}, bosun_link:add(<<"nope">>, <<"LN-1">>, <<"depends_on">>, #{})),
    %% 依赖链 LO-1 -> LN-2 -> LN-1（跨项目、id 小写）
    {ok, A} = bosun_link:add(<<"ln-2">>, <<"ln-1">>, <<"depends_on">>, #{actor => <<"keel">>}),
    ?assertEqual(true, maps:get(<<"blocked">>, A)),
    ?assertMatch([#{<<"type">> := <<"depends_on">>, <<"direction">> := <<"out">>, <<"task">> := <<"LN-1">>,
                   <<"title">> := <<"schema">>, <<"status">> := <<"NEW">>, <<"actor">> := <<"keel">>}], maps:get(<<"links">>, A)),
    {ok, B} = bosun_link:add(<<"LO-1">>, <<"LN-2">>, <<"depends">>, #{}),
    ?assertEqual(true, maps:get(<<"blocked">>, B)),
    %% 重复建链幂等；成环拒绝（直接 / 间接）
    {ok, _} = bosun_link:add(<<"LN-2">>, <<"LN-1">>, <<"depends_on">>, #{}),
    ?assertEqual(2, length(bosun_link:of_task(<<"LN-2">>))),
    ?assertEqual({error, {cycle, [<<"LN-1">>, <<"LN-2">>, <<"LN-1">>]}}, bosun_link:add(<<"LN-1">>, <<"LN-2">>, <<"depends_on">>, #{})),
    ?assertEqual({error, {cycle, [<<"LN-1">>, <<"LO-1">>, <<"LN-2">>, <<"LN-1">>]}}, bosun_link:add(<<"LN-1">>, <<"LO-1">>, <<"depends_on">>, #{})),
    %% 被阻塞不能开始；依赖 DONE 后可以；打回不受阻塞影响
    ?assertEqual({error, {blocked, [<<"LN-1">>]}}, bosun_task_status:transition(<<"LN-2">>, <<"IN_PROGRESS">>, #{})),
    {ok, _} = bosun_task_status:transition(<<"LN-1">>, <<"IN_PROGRESS">>, #{}),
    ?assertEqual({error, {blocked, [<<"LN-1">>]}}, bosun_task_status:transition(<<"LN-2">>, <<"IN_PROGRESS">>, #{})),
    {ok, _} = bosun_task_status:transition(<<"LN-1">>, <<"DONE">>, #{}),
    {ok, S1} = bosun_task_status:transition(<<"LN-2">>, <<"IN_PROGRESS">>, #{}),
    ?assertEqual(false, maps:get(<<"blocked">>, S1)),
    {ok, _} = bosun_task_status:transition(<<"LN-2">>, <<"DONE">>, #{}),
    %% 同一对可以有不同类型（LO-1 depends_on LN-2 之外再 LO-1 replaces LN-2）；对端 DONE 只记链不撤销
    {ok, _} = bosun_link:add(<<"LO-1">>, <<"LN-2">>, <<"replaces">>, #{}),
    ?assertEqual(false, bosun_link:blocked(<<"LN-2">>)),
    %% 入链视角：LN-1 被 LN-2 依赖
    {ok, L1} = bosun_task:get(<<"LN-1">>),
    ?assertMatch([#{<<"direction">> := <<"in">>, <<"type">> := <<"depends_on">>, <<"task">> := <<"LN-2">>}], maps:get(<<"links">>, L1)),
    %% replaces：对端 NEW / IN_PROGRESS 自动撤销并记历史；DONE 的只记链
    {ok, R} = bosun_link:add(<<"LO-1">>, <<"LN-3">>, <<"replaces">>, #{actor => <<"keel">>}),
    ?assertMatch([#{<<"type">> := <<"replaces">>, <<"task">> := <<"LN-3">>, <<"status">> := <<"CANCELLED">>}],
                 [L || #{<<"task">> := <<"LN-3">>} = L <- maps:get(<<"links">>, R)]),
    {ok, Old} = bosun_task:get(<<"LN-3">>),
    ?assertEqual(<<"CANCELLED">>, maps:get(<<"status">>, Old)),
    ?assertMatch(#{<<"to">> := <<"CANCELLED">>, <<"actor">> := <<"keel">>, <<"comment">> := <<"replaced by LO-1">>}, hd(maps:get(<<"history">>, Old))),
    {ok, #{<<"status">> := <<"DONE">>}} = bosun_task:get(<<"LN-2">>),
    %% 删链
    {ok, D} = bosun_link:remove(<<"LO-1">>, <<"LN-3">>, <<"replaces">>),
    ?assertEqual(false, lists:any(fun(L) -> maps:get(<<"task">>, L) =:= <<"LN-3">> end, maps:get(<<"links">>, D))),
    ?assertEqual({error, not_found}, bosun_link:remove(<<"LO-1">>, <<"LN-3">>, <<"replaces">>)),
    {ok, #{<<"status">> := <<"CANCELLED">>}} = bosun_task:get(<<"LN-3">>).
