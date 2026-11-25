-module(bosun_milestone_tests).

-include_lib("eunit/include/eunit.hrl").

milestone_test_() ->
    {foreach, fun bosun_test_env:setup/0, fun(_) -> ok end, [
        fun(_) -> {"create, ids, names, dates, order", fun create_and_list/0} end,
        fun(_) -> {"one active per project; pause / reopen", fun states/0} end,
        fun(_) -> {"task membership rules", fun membership/0} end,
        fun(_) -> {"list filter by milestone / backlog / active", fun list_filter/0} end,
        fun(_) -> {"epic in milestone: open steps follow, new steps inherit", fun epic_cascade/0} end,
        fun(_) -> {"change log and milestone changes", fun change_log/0} end,
        fun(_) -> {"release: refused while unfinished, verifies DONE, snapshot", fun release/0} end,
        fun(_) -> {"release with an epic", fun epic_release/0} end,
        fun(_) -> {"delete only empty planning", fun delete/0} end,
        fun(_) -> {"batch assign", fun batch_assign/0} end,
        fun(_) -> {"BQL milestone fields", fun bql/0} end,
        fun(_) -> {"backup v3 round trip", fun backup_round_trip/0} end,
        fun(_) -> {"backup merge keeps milestone_seq and one active", fun backup_merge_rules/0} end,
        fun(_) -> {"stats: counts and burndown replayed from the log", fun stats_burndown/0} end
    ]}.

%%--------------------------------------------------------------------

project(Key) ->
    {ok, _} = bosun_project:create(#{<<"key">> => Key, <<"name">> => Key}).

ms(Key, Name) -> ms(Key, Name, #{}).
ms(Key, Name, Extra) ->
    {ok, M} = bosun_milestone:create(Key, Extra#{<<"name">> => Name, <<"actor">> => <<"david">>}),
    maps:get(<<"id">>, M).

task(Key, Title) -> task(Key, Title, #{}).
task(Key, Title, Extra) ->
    {ok, T} = bosun_task:create(Key, Extra#{<<"title">> => Title, <<"actor">> => <<"david">>}),
    maps:get(<<"id">>, T).

ms_of(TaskId) ->
    {ok, T} = bosun_task:get(TaskId),
    maps:get(<<"milestone">>, T).

move(TaskId, To) ->
    {ok, _} = bosun_task_status:transition(TaskId, To, #{actor => <<"keel">>}).

status(Id) ->
    {ok, M} = bosun_milestone:get(Id),
    maps:get(<<"status">>, M).

%%--------------------------------------------------------------------

create_and_list() ->
    project(<<"MS">>),
    ?assertEqual(<<"MS-M1">>, ms(<<"MS">>, <<"0.1">>, #{<<"target_date">> => <<"2026-12-20">>})),
    ?assertEqual(<<"MS-M2">>, ms(<<"MS">>, <<"0.2">>, #{<<"target_date">> => <<"2026-12-10">>})),
    ?assertEqual(<<"MS-M3">>, ms(<<"MS">>, <<"later">>)),
    %% 名称项目内唯一
    ?assertEqual({error, {conflict, name}}, bosun_milestone:create(<<"MS">>, #{<<"name">> => <<"0.1">>})),
    ?assertMatch({error, {invalid, name, _}}, bosun_milestone:create(<<"MS">>, #{<<"name">> => <<" ">>})),
    %% 日期
    ?assertMatch({error, {invalid, <<"target_date">>, _}}, bosun_milestone:create(<<"MS">>, #{<<"name">> => <<"x">>, <<"target_date">> => <<"2026-02-30">>})),
    ?assertMatch({error, {invalid, <<"start_date">>, _}}, bosun_milestone:create(<<"MS">>, #{<<"name">> => <<"x">>, <<"start_date">> => <<"12/01">>})),
    ?assertMatch({error, {invalid, target_date, _}},
                 bosun_milestone:create(<<"MS">>, #{<<"name">> => <<"x">>, <<"start_date">> => <<"2026-12-02">>, <<"target_date">> => <<"2026-12-01">>})),
    ?assertEqual({error, {project, not_found}}, bosun_milestone:create(<<"NOPE">>, #{<<"name">> => <<"x">>})),
    %% 别的项目序号从 1 开始
    project(<<"OT">>),
    ?assertEqual(<<"OT-M1">>, ms(<<"OT">>, <<"0.1">>)),
    %% 排序：进行中 → 规划中（目标日期早的在前，没日期的最后）
    {ok, _} = bosun_milestone:activate(<<"MS-M3">>, #{}),
    {ok, L} = bosun_milestone:list(<<"MS">>),
    ?assertEqual([<<"MS-M3">>, <<"MS-M2">>, <<"MS-M1">>], [maps:get(<<"id">>, M) || M <- L]),
    %% 改名 / 清空日期
    {ok, U} = bosun_milestone:update(<<"ms-m1">>, #{<<"name">> => <<"0.1.0">>, <<"target_date">> => <<>>}),
    ?assertEqual({<<"0.1.0">>, undefined}, {maps:get(<<"name">>, U), maps:get(<<"target_date">>, U)}),
    ?assertEqual({error, {conflict, name}}, bosun_milestone:update(<<"MS-M1">>, #{<<"name">> => <<"0.2">>})),
    ?assertEqual({error, not_found}, bosun_milestone:get(<<"MS-M9">>)),
    ?assertEqual({error, not_found}, bosun_milestone:get(<<"MS-9">>)).

states() ->
    project(<<"ST">>),
    A = ms(<<"ST">>, <<"a">>), B = ms(<<"ST">>, <<"b">>),
    {ok, _} = bosun_milestone:activate(A, #{}),
    ?assertEqual({error, {conflict, active_exists, A}}, bosun_milestone:activate(B, #{})),
    ?assertEqual({error, {milestone_state, active, activate}}, bosun_milestone:activate(A, #{})),
    ?assertEqual({ok, A}, bosun_milestone:active(<<"ST">>)),
    {ok, _} = bosun_milestone:pause(A, #{}),
    ?assertEqual(none, bosun_milestone:active(<<"ST">>)),
    ?assertEqual({error, {milestone_state, planning, release}}, bosun_milestone:release(A, #{})),
    {ok, _} = bosun_milestone:activate(B, #{}),
    {ok, R} = bosun_milestone:release(B, #{}),
    ?assertEqual(<<"released">>, maps:get(<<"status">>, R)),
    ?assertNotEqual(undefined, maps:get(<<"released_at">>, R)),
    {ok, _} = bosun_milestone:activate(A, #{}),
    ?assertEqual({error, {conflict, active_exists, A}}, bosun_milestone:reopen(B, #{})),
    {ok, _} = bosun_milestone:pause(A, #{}),
    {ok, _} = bosun_milestone:reopen(B, #{}),
    ?assertEqual(<<"active">>, status(B)).

membership() ->
    project(<<"MB">>), project(<<"OX">>),
    M1 = ms(<<"MB">>, <<"0.1">>), M2 = ms(<<"MB">>, <<"0.2">>),
    Other = ms(<<"OX">>, <<"0.1">>),
    %% 建单时指定：id / 名称都行
    T1 = task(<<"MB">>, <<"t1">>, #{<<"milestone">> => M1}),
    T2 = task(<<"MB">>, <<"t2">>, #{<<"milestone">> => <<"0.2">>}),
    ?assertEqual(M1, ms_of(T1)),
    ?assertEqual(M2, ms_of(T2)),
    {ok, Full} = bosun_task:get(T1),
    ?assertEqual(<<"0.1">>, maps:get(<<"milestone_name">>, Full)),
    %% 别的项目的 milestone / 不存在的 / 没有进行中时的 active
    ?assertMatch({error, {invalid, milestone, _}}, bosun_task:update(T1, #{<<"milestone">> => Other})),
    ?assertMatch({error, {invalid, milestone, _}}, bosun_task:update(T1, #{<<"milestone">> => <<"9.9">>})),
    ?assertMatch({error, {invalid, milestone, _}}, bosun_task:update(T1, #{<<"milestone">> => <<"active">>})),
    {ok, _} = bosun_milestone:activate(M2, #{}),
    {ok, _} = bosun_task:update(T1, #{<<"milestone">> => <<"active">>}),
    ?assertEqual(M2, ms_of(T1)),
    %% 移出
    {ok, _} = bosun_task:update(T1, #{<<"milestone">> => <<>>}),
    ?assertEqual(undefined, ms_of(T1)),
    %% 已发布的不能加进去，但能从里面移出（发布前 T2 得先做完）
    move(T2, <<"IN_PROGRESS">>), move(T2, <<"DONE">>),
    {ok, _} = bosun_milestone:release(M2, #{}),
    ?assertMatch({error, {invalid, milestone, _}}, bosun_task:update(T1, #{<<"milestone">> => M2})),
    {ok, _} = bosun_task:update(T2, #{<<"milestone">> => M1}),
    ?assertEqual(M1, ms_of(T2)),
    %% Epic 也可以进（14 D5 修订）
    E = task(<<"MB">>, <<"goal">>, #{<<"kind">> => <<"epic">>, <<"milestone">> => M1}),
    ?assertEqual(M1, ms_of(E)).

list_filter() ->
    project(<<"LF">>),
    M1 = ms(<<"LF">>, <<"0.1">>),
    _ = task(<<"LF">>, <<"in">>, #{<<"milestone">> => M1}),
    _ = task(<<"LF">>, <<"out">>),
    Titles = fun(F) -> {ok, #{<<"tasks">> := Ts}} = bosun_task:list(<<"LF">>, F), [maps:get(<<"title">>, T) || T <- Ts] end,
    ?assertEqual([<<"in">>], Titles(#{<<"milestone">> => M1})),
    ?assertEqual([<<"in">>], Titles(#{<<"milestone">> => <<"0.1">>})),
    ?assertEqual([<<"out">>], Titles(#{<<"milestone">> => <<"backlog">>})),
    %% 没有进行中：active 什么都不匹配（不是报错）
    ?assertEqual([], Titles(#{<<"milestone">> => <<"active">>})),
    {ok, _} = bosun_milestone:activate(M1, #{}),
    ?assertEqual([<<"in">>], Titles(#{<<"milestone">> => <<"active">>})),
    ?assertEqual(2, length(Titles(#{}))),
    ?assertMatch({error, {invalid, milestone, _}}, bosun_task:list(<<"LF">>, #{<<"milestone">> => <<"nope">>})).

epic_cascade() ->
    project(<<"EC">>),
    M1 = ms(<<"EC">>, <<"0.1">>), M2 = ms(<<"EC">>, <<"0.2">>),
    E = task(<<"EC">>, <<"goal">>, #{<<"kind">> => <<"epic">>}),
    S1 = task(<<"EC">>, <<"open step">>, #{<<"epic">> => E}),
    S2 = task(<<"EC">>, <<"done step">>, #{<<"epic">> => E}),
    S3 = task(<<"EC">>, <<"later step">>, #{<<"epic">> => E, <<"milestone">> => M2}),
    move(S2, <<"IN_PROGRESS">>), move(S2, <<"DONE">>),
    %% Epic 进 0.1：没排期的、没做完的步骤跟着进；做完的不动；明确排在 0.2 的不动
    {ok, _} = bosun_task:update(E, #{<<"milestone">> => M1}),
    ?assertEqual(M1, ms_of(S1)),
    ?assertEqual(undefined, ms_of(S2)),
    ?assertEqual(M2, ms_of(S3)),
    %% 新步骤继承 Epic 的
    S4 = task(<<"EC">>, <<"new step">>, #{<<"epic">> => E}),
    ?assertEqual(M1, ms_of(S4)),
    {ok, #{<<"milestone_log">> := [#{<<"comment">> := Inherit}]}} = bosun_task:get(S4),
    ?assertEqual(<<"跟随 Epic "/utf8, E/binary>>, Inherit),
    %% Epic 改到 0.2：原来跟它在 0.1 的没做完的一起走
    {ok, _} = bosun_task:update(E, #{<<"milestone">> => M2}),
    ?assertEqual({M2, M2}, {ms_of(S1), ms_of(S4)}),
    %% 进度口径：Epic 不进范围计数，单独数
    {ok, #{<<"counts">> := C}} = bosun_milestone:get(M2),
    ?assertEqual({3, 1}, {maps:get(<<"scope">>, C), maps:get(<<"epics">>, C)}).

change_log() ->
    project(<<"CL">>),
    M1 = ms(<<"CL">>, <<"0.1">>), M2 = ms(<<"CL">>, <<"0.2">>),
    T = task(<<"CL">>, <<"t">>, #{<<"milestone">> => M1}),
    {ok, _} = bosun_task:update(T, #{<<"milestone">> => M2, <<"milestone_comment">> => <<"这次来不及"/utf8>>, <<"actor">> => <<"alice">>}),
    {ok, Full} = bosun_task:get(T),
    [In, Out] = maps:get(<<"milestone_log">>, Full),
    ?assertMatch(#{<<"from">> := undefined, <<"to">> := M1, <<"to_name">> := <<"0.1">>}, In),
    ?assertMatch(#{<<"from">> := M1, <<"to">> := M2, <<"actor">> := <<"alice">>, <<"comment">> := <<"这次来不及"/utf8>>}, Out),
    %% 没变就不记
    {ok, _} = bosun_task:update(T, #{<<"milestone">> => M2}),
    {ok, Full2} = bosun_task:get(T),
    ?assertEqual(2, length(maps:get(<<"milestone_log">>, Full2))),
    %% milestone 详情的范围变更：0.1 有进有出，0.2 只有进
    {ok, #{<<"changes">> := C1}} = bosun_milestone:get(M1),
    ?assertEqual([<<"in">>, <<"out">>], [maps:get(<<"direction">>, C) || C <- C1]),
    ?assertMatch([_, #{<<"to_name">> := <<"0.2">>, <<"task">> := T}], C1),
    {ok, #{<<"changes">> := C2}} = bosun_milestone:get(M2),
    ?assertEqual([<<"in">>], [maps:get(<<"direction">>, C) || C <- C2]).

release() ->
    project(<<"RL">>),
    M1 = ms(<<"RL">>, <<"0.1">>), M2 = ms(<<"RL">>, <<"0.2">>),
    New = task(<<"RL">>, <<"new">>, #{<<"milestone">> => M1}),
    Doing = task(<<"RL">>, <<"doing">>, #{<<"milestone">> => M1}),
    Done = task(<<"RL">>, <<"done">>, #{<<"milestone">> => M1}),
    Verified = task(<<"RL">>, <<"verified">>, #{<<"milestone">> => M1}),
    Cancelled = task(<<"RL">>, <<"cancelled">>, #{<<"milestone">> => M1}),
    move(Doing, <<"IN_PROGRESS">>),
    move(Done, <<"IN_PROGRESS">>), move(Done, <<"DONE">>),
    move(Verified, <<"IN_PROGRESS">>), move(Verified, <<"DONE">>),
    {ok, _} = bosun_task_status:transition(Verified, <<"VERIFIED">>, #{actor => <<"bob">>}),
    move(Cancelled, <<"CANCELLED">>),
    {ok, _} = bosun_milestone:activate(M1, #{}),
    {ok, #{<<"counts">> := C}} = bosun_milestone:get(M1),
    ?assertEqual(#{<<"scope">> => 4, <<"done">> => 2, <<"verified">> => 1, <<"pending_verify">> => 1,
                   <<"open">> => 2, <<"cancelled">> => 1, <<"percent">> => 50},
                 maps:with([<<"scope">>, <<"done">>, <<"verified">>, <<"pending_verify">>, <<"open">>, <<"cancelled">>, <<"percent">>], C)),
    %% 还有没做完的：拒绝发布，列出是哪些
    {error, {unfinished, Open}} = bosun_milestone:release(M1, #{}),
    ?assertEqual(lists:sort([New, Doing]), lists:sort(Open)),
    ?assertEqual(<<"active">>, status(M1)),
    %% 先完成 / 先移出（一个做完，一个挪到 0.2）
    move(Doing, <<"DONE">>),
    {ok, _} = bosun_task:update(New, #{<<"milestone">> => M2, <<"milestone_comment">> => <<"下一版"/utf8>>}),
    {ok, R} = bosun_milestone:release(M1, #{<<"notes">> => <<"- done">>, <<"actor">> => <<"david">>}),
    S = maps:get(<<"summary">>, R),
    %% 发布即验收：已完成的都变成已验收，历史记一条
    ?assertEqual(lists:sort([Done, Doing]), lists:sort(maps:get(<<"verified_on_release">>, S))),
    ?assertEqual(lists:sort([Doing, Done, Verified]), lists:sort(maps:get(<<"delivered">>, S))),
    ?assertMatch(#{<<"delivered">> := 3, <<"verified_on_release">> := 2, <<"cancelled">> := 1}, maps:get(<<"counts">>, S)),
    ?assertEqual(<<"- done">>, maps:get(<<"notes">>, S)),
    {ok, #{<<"status">> := <<"VERIFIED">>, <<"history">> := [#{<<"from">> := <<"DONE">>, <<"actor">> := <<"david">>,
                                                               <<"comment">> := <<"随 0.1 发布验收"/utf8>>} | _]}} = bosun_task:get(Done),
    {ok, #{<<"status">> := <<"CANCELLED">>}} = bosun_task:get(Cancelled),
    ?assertEqual({M2, M1, M1, M1}, {ms_of(New), ms_of(Done), ms_of(Verified), ms_of(Cancelled)}),
    %% 执行方自己做的也照样验收（发布就是验收，不要求测试证据）
    {ok, _} = bosun_milestone:activate(M2, #{}),
    Self = task(<<"RL">>, <<"self">>, #{<<"milestone">> => M2}),
    {ok, _} = bosun_task_status:transition(Self, <<"IN_PROGRESS">>, #{actor => <<"david">>}),
    {ok, _} = bosun_task_status:transition(Self, <<"DONE">>, #{actor => <<"david">>}),
    {ok, _} = bosun_task:update(New, #{<<"milestone">> => <<>>}),
    {ok, #{<<"summary">> := #{<<"verified_on_release">> := [Self]}}} = bosun_milestone:release(M2, #{<<"actor">> => <<"david">>}),
    {ok, #{<<"status">> := <<"VERIFIED">>}} = bosun_task:get(Self).

epic_release() ->
    %% Epic 在里面：步骤都做完了 Epic 自动 DONE，发布时一起验收；Epic 没做完也挡发布
    project(<<"ER">>),
    M1 = ms(<<"ER">>, <<"0.1">>),
    E = task(<<"ER">>, <<"goal">>, #{<<"kind">> => <<"epic">>, <<"milestone">> => M1}),
    S1 = task(<<"ER">>, <<"s1">>, #{<<"epic">> => E}),
    {ok, _} = bosun_milestone:activate(M1, #{}),
    {error, {unfinished, Open}} = bosun_milestone:release(M1, #{}),
    ?assertEqual(lists:sort([E, S1]), lists:sort(Open)),
    move(S1, <<"IN_PROGRESS">>), move(S1, <<"DONE">>),
    {ok, #{<<"status">> := <<"DONE">>}} = bosun_task:get(E),
    {ok, #{<<"summary">> := #{<<"epics">> := [E], <<"verified_on_release">> := Ver}}} = bosun_milestone:release(M1, #{}),
    ?assertEqual(lists:sort([E, S1]), lists:sort(Ver)),
    {ok, #{<<"status">> := <<"VERIFIED">>}} = bosun_task:get(E).

delete() ->
    project(<<"DL">>),
    M1 = ms(<<"DL">>, <<"0.1">>), M2 = ms(<<"DL">>, <<"0.2">>),
    T = task(<<"DL">>, <<"t">>, #{<<"milestone">> => M1}),
    ?assertEqual({error, not_empty}, bosun_milestone:delete(M1)),
    {ok, _} = bosun_task:update(T, #{<<"milestone">> => <<>>}),
    ?assertEqual(ok, bosun_milestone:delete(M1)),
    ?assertEqual({error, not_found}, bosun_milestone:get(M1)),
    {ok, _} = bosun_milestone:activate(M2, #{}),
    ?assertEqual({error, {milestone_state, active, delete}}, bosun_milestone:delete(M2)),
    %% 删掉的序号不复用
    ?assertEqual(<<"DL-M3">>, ms(<<"DL">>, <<"0.3">>)).

batch_assign() ->
    project(<<"BA">>), project(<<"BX">>),
    M1 = ms(<<"BA">>, <<"0.1">>),
    A = task(<<"BA">>, <<"a">>), B = task(<<"BA">>, <<"b">>), X = task(<<"BX">>, <<"x">>),
    {ok, R} = bosun_milestone:assign(<<"BA">>, [A, string:lowercase(B), X, <<"BA-99">>], M1, <<"david">>),
    ?assertEqual([A, B], maps:get(<<"updated">>, R)),
    ?assertEqual([X, <<"BA-99">>], [maps:get(<<"id">>, F) || F <- maps:get(<<"failed">>, R)]),
    ?assertEqual({M1, M1}, {ms_of(A), ms_of(B)}),
    {ok, R2} = bosun_milestone:assign(<<"BA">>, [A], <<>>, <<"david">>),
    ?assertEqual([A], maps:get(<<"updated">>, R2)),
    ?assertEqual(undefined, ms_of(A)).

bql() ->
    project(<<"BQ">>),
    M1 = ms(<<"BQ">>, <<"0.1.4">>), _M2 = ms(<<"BQ">>, <<"0.2">>),
    _ = task(<<"BQ">>, <<"in">>, #{<<"milestone">> => M1}),
    _ = task(<<"BQ">>, <<"later">>, #{<<"milestone">> => <<"0.2">>}),
    _ = task(<<"BQ">>, <<"none">>),
    Q = fun(S) -> {ok, #{<<"tasks">> := Ts}} = bosun_bql:query(S, #{}), lists:sort([maps:get(<<"title">>, T) || T <- Ts]) end,
    ?assertEqual([<<"in">>], Q(<<"milestone = \"0.1.4\"">>)),
    ?assertEqual([<<"in">>], Q(<<"fixversion = bq-m1">>)),
    ?assertEqual([<<"in">>, <<"later">>], Q(<<"milestone IN (\"0.1.4\", \"0.2\")">>)),
    ?assertEqual([<<"none">>], Q(<<"milestone IS EMPTY">>)),
    ?assertEqual([<<"later">>, <<"none">>], Q(<<"milestone != \"0.1.4\"">>)),
    ?assertEqual([], Q(<<"milestone = active">>)),
    {ok, _} = bosun_milestone:activate(M1, #{}),
    ?assertEqual([<<"in">>], Q(<<"milestone = active">>)),
    ?assertEqual([<<"in">>], Q(<<"milestone_status = active">>)),
    ?assertEqual([<<"later">>, <<"none">>], Q(<<"milestone_status != active">>)),
    ?assertMatch({error, {invalid, query, _}}, bosun_bql:query(<<"milestone_status = soon">>, #{})),
    ?assertMatch({error, {invalid, query, _}}, bosun_bql:query(<<"milestone ~ x">>, #{})).

backup_round_trip() ->
    project(<<"BK">>),
    M1 = ms(<<"BK">>, <<"0.1">>, #{<<"target_date">> => <<"2026-12-31">>}),
    E = task(<<"BK">>, <<"goal">>, #{<<"kind">> => <<"epic">>, <<"milestone">> => M1}),
    T = task(<<"BK">>, <<"t">>, #{<<"epic">> => E}),
    {ok, _} = bosun_milestone:activate(M1, #{}),
    move(T, <<"IN_PROGRESS">>), move(T, <<"DONE">>),
    {ok, _} = bosun_milestone:release(M1, #{<<"notes">> => <<"n">>}),
    _ = ms(<<"BK">>, <<"0.2">>),
    {ok, _} = bosun_task:update(T, #{<<"milestone">> => <<"0.2">>}),
    {ok, Before1} = bosun_milestone:get(M1),
    {ok, BeforeT} = bosun_task:get(T),
    {ok, Map} = bosun_backup:export(),
    ?assertEqual(3, maps:get(<<"version">>, Map)),
    ?assertEqual(2, length(maps:get(<<"milestones">>, Map))),
    %% 走一遍 JSON（导入吃的是解码后的 map）
    {ok, Decoded} = bosun_json:decode(bosun_json:encode(Map)),
    {ok, Res} = bosun_backup:import(Decoded, #{mode => replace}),
    ?assertEqual(2, maps:get(<<"milestones">>, Res)),
    {ok, After1} = bosun_milestone:get(M1),
    {ok, AfterT} = bosun_task:get(T),
    ?assertEqual(maps:without([<<"counts">>, <<"changes">>], Before1), maps:without([<<"counts">>, <<"changes">>], After1)),
    ?assertEqual(maps:get(<<"milestone_log">>, BeforeT), maps:get(<<"milestone_log">>, AfterT)),
    ?assertEqual(<<"BK-M3">>, ms(<<"BK">>, <<"0.3">>)),
    %% v2 文件照样能导（没有 milestones）
    V2 = maps:without([<<"milestones">>], Decoded#{<<"version">> => 2}),
    ?assertMatch({ok, _}, bosun_backup:import(V2#{<<"tasks">> => [maps:remove(<<"milestone">>, X) || X <- maps:get(<<"tasks">>, V2)]},
                                              #{mode => merge, dry_run => true})).

backup_merge_rules() ->
    project(<<"MG">>),
    M1 = ms(<<"MG">>, <<"0.1">>),
    {ok, _} = bosun_milestone:activate(M1, #{}),
    {ok, Map0} = bosun_backup:export(),
    {ok, Map} = bosun_json:decode(bosun_json:encode(Map0)),
    %% 库里又建了两个（序号到 3），再 merge 旧导出：序号不回退
    _ = ms(<<"MG">>, <<"0.2">>), _ = ms(<<"MG">>, <<"0.3">>),
    {ok, _} = bosun_backup:import(Map, #{mode => merge}),
    ?assertEqual(<<"MG-M4">>, ms(<<"MG">>, <<"0.4">>)),
    %% 文件里另一个 active 会让项目有两个进行中：拒绝
    {ok, _} = bosun_milestone:pause(M1, #{}),
    {ok, _} = bosun_milestone:activate(<<"MG-M2">>, #{}),
    ?assertMatch({error, {invalid, data, _}}, bosun_backup:import(Map, #{mode => merge})),
    %% 任务挂了别的项目的 milestone：拒绝
    [P] = maps:get(<<"projects">>, Map),
    Bad = Map#{<<"tasks">> => [#{<<"id">> => <<"MG-9">>, <<"project_key">> => <<"MG">>, <<"seq">> => 9,
                                 <<"title">> => <<"x">>, <<"milestone">> => <<"ZZ-M1">>}],
               <<"projects">> => [P], <<"milestones">> => []},
    ?assertMatch({error, {invalid, data, _}}, bosun_backup:import(Bad, #{mode => merge})).

stats_burndown() ->
    project(<<"SB">>),
    Target = list_to_binary(calendar:system_time_to_rfc3339(erlang:system_time(second) + 3 * 86400, [{unit, second}, {offset, "Z"}])),
    TargetDate = binary:part(Target, 0, 10),
    M1 = ms(<<"SB">>, <<"0.1">>, #{<<"target_date">> => TargetDate}),
    M2 = ms(<<"SB">>, <<"0.2">>),
    E = task(<<"SB">>, <<"goal">>, #{<<"kind">> => <<"epic">>, <<"milestone">> => M1}),
    A = task(<<"SB">>, <<"a">>, #{<<"milestone">> => M1}),
    _B = task(<<"SB">>, <<"b">>, #{<<"milestone">> => M1}),
    C = task(<<"SB">>, <<"c">>, #{<<"milestone">> => M1}),
    move(A, <<"IN_PROGRESS">>), move(A, <<"DONE">>),
    {ok, _} = bosun_task:update(C, #{<<"milestone">> => M2}),
    ?assertEqual({error, not_found}, bosun_stats:milestone(<<"SB-M9">>, #{})),
    {ok, S} = bosun_stats:milestone(M1, #{}),
    %% 计数：现在在里面的（含 Epic）
    #{<<"projects">> := #{<<"SB">> := Counts}, <<"daily">> := Daily, <<"range">> := #{<<"today">> := Today}} = S,
    ?assertEqual({3, 1}, {maps:get(<<"total">>, Counts), maps:get(<<"epics">>, Counts)}),
    %% 今天：3 个步骤移入（Epic 不计），1 个完成；C 移出了不算剩余 → 剩 B
    [TodayRow] = [D || #{<<"date">> := Dt} = D <- Daily, Dt =:= Today],
    ?assertEqual(#{<<"created">> => 3, <<"completed">> => 1, <<"remaining">> => 1},
                 maps:with([<<"created">>, <<"completed">>, <<"remaining">>], TodayRow)),
    %% 目标日期在三天后：最后一行是目标日，今天以后的 remaining 为 null
    ?assertEqual(TargetDate, maps:get(<<"date">>, lists:last(Daily))),
    ?assertEqual(null, maps:get(<<"remaining">>, lists:last(Daily))),
    %% 0.2：C 今天移入
    {ok, #{<<"daily">> := D2}} = bosun_stats:milestone(M2, #{}),
    ?assertEqual(1, lists:sum([N || #{<<"created">> := N} <- D2])),
    _ = E.
