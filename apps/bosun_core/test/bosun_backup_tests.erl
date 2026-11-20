-module(bosun_backup_tests).

-include_lib("eunit/include/eunit.hrl").

backup_test_() ->
    {foreach, fun bosun_test_env:setup/0, fun(_) -> ok end, [
        fun(_) -> {"round trip", fun round_trip/0} end,
        fun(_) -> {"bad input", fun bad_input/0} end,
        fun(_) -> {"merge never moves sequences backwards", fun merge_keeps_sequences/0} end,
        fun(_) -> {"malformed records rejected", fun malformed_records/0} end
    ]}.

seed() ->
    {ok, _} = bosun_project:create(#{<<"key">> => <<"BK">>, <<"name">> => <<"backup">>, <<"description">> => <<"# d">>}),
    {ok, _} = bosun_task:create(<<"BK">>, #{<<"title">> => <<"一号"/utf8>>, <<"labels">> => [<<"a">>], <<"priority">> => <<"high">>, <<"actor">> => <<"keel">>}),
    {ok, _} = bosun_task:create(<<"BK">>, #{<<"title">> => <<"two">>}),
    {ok, _} = bosun_task:create(<<"BK">>, #{<<"title">> => <<"goal">>, <<"kind">> => <<"epic">>}),
    {ok, _} = bosun_task:update(<<"BK-2">>, #{<<"epic">> => <<"BK-3">>}),
    {ok, _} = bosun_link:add(<<"BK-2">>, <<"BK-1">>, <<"depends_on">>, #{actor => <<"keel">>}),
    {ok, _} = bosun_task_status:transition(<<"BK-1">>, <<"IN_PROGRESS">>, #{actor => <<"keel">>, comment => <<"go">>}),
    {ok, _} = bosun_feedback:add(<<"BK-1">>, #{<<"content">> => <<"first">>, <<"author">> => <<"keel">>}),
    {ok, _} = bosun_feedback:revise(<<"BK-1#1">>, #{<<"content">> => <<"first, revised">>, <<"actor">> => <<"keel">>}),
    {ok, _} = bosun_filter:create(#{<<"name">> => <<"mine">>, <<"query">> => <<"status = new">>}),
    ok = bosun_search:sync().

snapshot() ->
    {ok, P} = bosun_project:get(<<"BK">>),
    {ok, T1} = bosun_task:get(<<"BK-1">>),
    {ok, T2} = bosun_task:get(<<"BK-2">>),
    {ok, T3} = bosun_task:get(<<"BK-3">>),
    {ok, Fs} = bosun_filter:list(),
    {P, T1, T2, T3, Fs}.

round_trip() ->
    seed(),
    Before = snapshot(),
    {ok, Map} = bosun_backup:export(),
    ?assertEqual(<<"bosun-export">>, maps:get(<<"format">>, Map)),
    ?assertEqual(1, length(maps:get(<<"projects">>, Map))),
    ?assertEqual(3, length(maps:get(<<"tasks">>, Map))),
    ?assertEqual(2, length(maps:get(<<"feedback">>, Map))),
    ?assertEqual(1, length(maps:get(<<"filters">>, Map))),
    ?assertMatch([#{<<"from">> := <<"BK-2">>, <<"to">> := <<"BK-1">>, <<"type">> := <<"depends_on">>}], maps:get(<<"links">>, Map)),
    ?assertMatch(#{<<"filter">> := 1}, maps:get(<<"counters">>, Map)),
    {ok, Decoded} = bosun_json:decode(bosun_json:encode(Map)),
    ok = bosun_store:reset_tables(),
    ?assertEqual({error, not_found}, bosun_task:get(<<"BK-1">>)),
    {ok, Summary} = bosun_backup:import(Decoded, #{mode => replace}),
    ?assertMatch(#{<<"tasks">> := 3, <<"feedback">> := 2, <<"projects">> := 1, <<"filters">> := 1}, Summary),
    ?assertEqual(Before, snapshot()),
    ?assertEqual(true, bosun_link:blocked(<<"BK-2">>)),
    {ok, #{<<"id">> := <<"BK-4">>}} = bosun_task:create(<<"BK">>, #{<<"title">> => <<"four">>}),
    {ok, #{<<"id">> := <<"f2">>}} = bosun_filter:create(#{<<"name">> => <<"n">>, <<"query">> => <<>>}),
    {ok, #{<<"id">> := <<"BK-1#3">>}} = bosun_feedback:add(<<"BK-1">>, #{<<"content">> => <<"x">>}),
    ok = bosun_search:sync(),
    {ok, #{<<"hits">> := [#{<<"task">> := #{<<"id">> := <<"BK-1">>}}]}} = bosun_task:search(<<"revised">>, #{}),
    {ok, Map2} = bosun_backup:export(),
    ok = bosun_store:reset_tables(),
    {ok, _} = bosun_project:create(#{<<"key">> => <<"OTHER">>, <<"name">> => <<"o">>}),
    {ok, _} = bosun_backup:import(Map2, #{mode => merge}),
    {ok, Ps} = bosun_project:list(#{}),
    ?assertEqual([<<"BK">>, <<"OTHER">>], lists:sort([maps:get(<<"key">>, X) || X <- Ps])),
    Path = "/tmp/bosun_backup_test.json",
    ok = bosun_backup:export_file(Path),
    {ok, _} = bosun_backup:import_file(Path, #{mode => replace}),
    {ok, #{<<"tasks">> := Ts}} = bosun_task:list(<<"BK">>, #{}),
    ?assertEqual(4, length(Ts)).

%% merge 一个旧导出：项目 / 任务的序号不能回退，否则新建的任务、反馈会和已有的撞号并覆盖
merge_keeps_sequences() ->
    seed(),
    {ok, Old} = bosun_backup:export(),
    {ok, #{<<"id">> := <<"BK-4">>}} = bosun_task:create(<<"BK">>, #{<<"title">> => <<"after the export">>}),
    {ok, #{<<"id">> := <<"BK-1#3">>}} = bosun_feedback:add(<<"BK-1">>, #{<<"content">> => <<"after the export">>}),
    {ok, _} = bosun_backup:import(Old, #{mode => merge}),
    {ok, #{<<"title">> := <<"after the export">>}} = bosun_task:get(<<"BK-4">>),
    {ok, #{<<"id">> := <<"BK-5">>}} = bosun_task:create(<<"BK">>, #{<<"title">> => <<"next">>}),
    {ok, #{<<"title">> := <<"after the export">>}} = bosun_task:get(<<"BK-4">>),
    {ok, #{<<"id">> := <<"BK-1#4">>}} = bosun_feedback:add(<<"BK-1">>, #{<<"content">> => <<"next">>}),
    {ok, #{<<"content">> := <<"after the export">>}} = bosun_feedback:get(<<"BK-1#3">>),
    %% 文件里的序号比实际任务小（手改过 / 旧 bug 留下的）：按实际最大序号修正
    Low = Old#{<<"projects">> := [P#{<<"task_seq">> := 0} || P <- maps:get(<<"projects">>, Old)],
               <<"tasks">> := [T#{<<"feedback_seq">> := 0} || T <- maps:get(<<"tasks">>, Old)]},
    ok = bosun_store:reset_tables(),
    {ok, _} = bosun_backup:import(Low, #{mode => replace}),
    {ok, #{<<"id">> := <<"BK-4">>}} = bosun_task:create(<<"BK">>, #{<<"title">> => <<"four">>}),
    {ok, #{<<"id">> := <<"BK-1#3">>}} = bosun_feedback:add(<<"BK-1">>, #{<<"content">> => <<"three">>}),
    %% 只带反馈、挂到库里已有的任务上：任务的 feedback_seq 也跟着走
    Only = #{<<"format">> => <<"bosun-export">>, <<"version">> => 2,
             <<"feedback">> => [#{<<"id">> => <<"BK-2#7">>, <<"task_id">> => <<"BK-2">>, <<"seq">> => 7, <<"content">> => <<"late">>}]},
    {ok, _} = bosun_backup:import(Only, #{mode => merge}),
    {ok, #{<<"id">> := <<"BK-2#8">>}} = bosun_feedback:add(<<"BK-2">>, #{<<"content">> => <<"eight">>}).

%% 字段类型 / id 自洽性不对的记录整批拒绝，什么都不写
malformed_records() ->
    {ok, _} = bosun_project:create(#{<<"key">> => <<"MF">>, <<"name">> => <<"m">>}),
    Base = #{<<"format">> => <<"bosun-export">>, <<"version">> => 2},
    T = #{<<"id">> => <<"MF-1">>, <<"project_key">> => <<"MF">>, <<"seq">> => 1, <<"title">> => <<"t">>},
    Reject = fun(Data) ->
        ?assertMatch({error, {invalid, data, _}}, bosun_backup:import(maps:merge(Base, Data), #{})),
        ?assertEqual({error, not_found}, bosun_task:get(<<"MF-1">>))
    end,
    Reject(#{<<"tasks">> => [T#{<<"labels">> => <<"not-a-list">>}]}),
    Reject(#{<<"tasks">> => [T#{<<"title">> := 42}]}),
    Reject(#{<<"tasks">> => [T#{<<"seq">> := 2}]}),                          %% id 与 seq 不符
    Reject(#{<<"tasks">> => [T#{<<"project_key">> := <<"ZZ">>}]}),           %% id 与项目不符
    Reject(#{<<"tasks">> => [T#{<<"history">> => [#{<<"to">> => <<"NEW">>, <<"at">> => <<"yesterday">>}]}]}),
    Reject(#{<<"tasks">> => [T#{<<"epic">> => <<"not an id">>}]}),
    Reject(#{<<"tasks">> => <<"oops">>}),
    Reject(#{<<"tasks">> => [T], <<"feedback">> => [#{<<"id">> => <<"MF-1#2">>, <<"task_id">> => <<"MF-1">>, <<"seq">> => 1, <<"content">> => <<"x">>}]}),
    Reject(#{<<"tasks">> => [T], <<"feedback">> => [#{<<"id">> => <<"MF-9#1">>, <<"task_id">> => <<"MF-9">>, <<"seq">> => 1, <<"content">> => <<"x">>}]}),
    Reject(#{<<"tasks">> => [T], <<"projects">> => [#{<<"key">> => <<"bad key">>, <<"name">> => <<"x">>}]}),
    Reject(#{<<"tasks">> => [T], <<"projects">> => [#{<<"key">> => <<"MF">>, <<"name">> => <<"x">>, <<"task_seq">> => -1}]}),
    Reject(#{<<"tasks">> => [T], <<"links">> => [#{<<"from">> => <<"MF-1">>, <<"to">> => <<"nope">>, <<"type">> => <<"depends_on">>}]}),
    %% 任务指向一个既不在文件里、库里也没有的项目
    ?assertMatch({error, {invalid, data, <<"refers to unknown project NOPE">>}},
                 bosun_backup:import(Base#{<<"tasks">> => [#{<<"id">> => <<"NOPE-1">>, <<"project_key">> => <<"NOPE">>, <<"seq">> => 1, <<"title">> => <<"t">>}]}, #{})),
    %% 合法的照常进
    {ok, _} = bosun_backup:import(Base#{<<"tasks">> => [T]}, #{}),
    {ok, #{<<"title">> := <<"t">>}} = bosun_task:get(<<"MF-1">>),
    {ok, #{<<"task_count">> := 1}} = bosun_project:get(<<"MF">>).

bad_input() ->
    ?assertMatch({error, {invalid, data, _}}, bosun_backup:import(#{<<"format">> => <<"x">>}, #{})),
    ?assertMatch({error, {invalid, data, _}}, bosun_backup:import(#{<<"format">> => <<"bosun-export">>, <<"version">> => 99}, #{})),
    ?assertMatch({error, {invalid, data, _}}, bosun_backup:import(#{}, #{})),
    Bad = #{<<"format">> => <<"bosun-export">>, <<"version">> => 2,
            <<"tasks">> => [#{<<"id">> => <<"XX-1">>, <<"project_key">> => <<"XX">>, <<"seq">> => 1, <<"title">> => <<"t">>, <<"status">> => <<"bogus">>}]},
    ?assertMatch({error, {invalid, data, <<"bad status bogus">>}}, bosun_backup:import(Bad, #{})),
    ?assertEqual({error, not_found}, bosun_task:get(<<"XX-1">>)).
