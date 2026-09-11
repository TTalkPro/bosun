-module(bosun_bql_tests).

-include_lib("eunit/include/eunit.hrl").

bql_test_() ->
    {foreach, fun bosun_test_env:setup/0, fun(_) -> ok end, [
        fun(_) -> {"parse", fun parse/0} end,
        fun(_) -> {"parse errors", fun parse_errors/0} end,
        fun(_) -> {"query", fun query/0} end,
        fun(_) -> {"saved filters", fun saved_filters/0} end
    ]}.

parse() ->
    {ok, #{where := W, order := O}} = bosun_bql:parse(
        <<"project = bos AND (status in (new, \"in progress\") OR priority >= high) and not labels ~ back "
          "and text ~ \"创建 任务\" and updated >= -7d order by priority desc, updated"/utf8>>),
    ?assertMatch({'and', {'and', {'and', {'and', {c, project, eq, <<"BOS">>},
                                          {'or', {c, status, in, [new, in_progress]}, {c, priority, gte, high}}},
                                   {'not', {c, labels, match, <<"back">>}}},
                            {c, text, match, _}},
                     {c, updated, gte, _}}, W),
    ?assertEqual([{priority, desc}, {updated, asc}], O),
    {ok, #{where := true, order := [{created, desc}]}} = bosun_bql:parse(<<"ORDER BY created DESC">>),
    {ok, #{where := true, order := []}} = bosun_bql:parse(<<"  ">>),
    {ok, #{where := {c, labels, empty, true}}} = bosun_bql:parse(<<"labels is empty">>),
    {ok, #{where := {'not', {c, feedback, empty, true}}}} = bosun_bql:parse(<<"feedback IS NOT EMPTY">>),
    {ok, #{where := {c, status, not_in, [done, verified]}}} = bosun_bql:parse(<<"status not in (DONE, VERIFIED)">>),
    {ok, #{where := {c, created_by, eq, <<"keel">>}}} = bosun_bql:parse(<<"reporter = Keel">>),
    {ok, #{where := {c, question, eq, true}}} = bosun_bql:parse(<<"question = true">>),
    ?assert(lists:member(<<"labels">>, bosun_bql:fields())).

parse_errors() ->
    Err = fun(Q) -> {error, {invalid, query, M}} = bosun_bql:parse(Q), M end,
    ?assertMatch(<<"unknown field 'foo'">>, Err(<<"foo = 1">>)),
    ?assertMatch(<<"invalid status", _/binary>>, Err(<<"status = closed">>)),
    ?assertMatch(<<"expected ')'">>, Err(<<"(status = new">>)),
    ?assertMatch(<<"unterminated string">>, Err(<<"title ~ \"abc">>)),
    ?assertMatch(<<"operator ~ not supported for status">>, Err(<<"status ~ new">>)),
    ?assertMatch(<<"operator > not supported for project">>, Err(<<"project > BOS">>)),
    ?assertMatch(<<"invalid date", _/binary>>, Err(<<"created > yesterday">>)),
    ?assertMatch(<<"unexpected token", _/binary>>, Err(<<"status = new new">>)),
    ?assertMatch(<<"expected an operator", _/binary>>, Err(<<"status">>)),
    ?assertMatch(<<"unknown field 'nope' in ORDER BY">>, Err(<<"order by nope">>)).

query() ->
    {ok, _} = bosun_project:create(#{<<"key">> => <<"BQ">>, <<"name">> => <<"q">>}),
    {ok, _} = bosun_project:create(#{<<"key">> => <<"OT">>, <<"name">> => <<"o">>}),
    {ok, _} = bosun_task:create(<<"BQ">>, #{<<"title">> => <<"实现 MCP 创建任务"/utf8>>, <<"labels">> => [<<"backend">>, <<"mcp">>], <<"priority">> => <<"high">>, <<"actor">> => <<"coxswain">>}),
    {ok, _} = bosun_task:create(<<"BQ">>, #{<<"title">> => <<"Write docs">>, <<"labels">> => [<<"docs">>]}),
    {ok, _} = bosun_task:create(<<"BQ">>, #{<<"title">> => <<"Health endpoint">>, <<"priority">> => <<"low">>}),
    {ok, _} = bosun_task:create(<<"OT">>, #{<<"title">> => <<"Other backend thing">>, <<"labels">> => [<<"Backend">>]}),
    {ok, _} = bosun_task_status:transition(<<"BQ-2">>, <<"IN_PROGRESS">>, #{}),
    {ok, _} = bosun_task_status:transition(<<"BQ-2">>, <<"DONE">>, #{}),
    {ok, _} = bosun_feedback:add(<<"BQ-3">>, #{<<"content">> => <<"which port?">>, <<"kind">> => <<"question">>, <<"author">> => <<"keel">>}),
    {ok, _} = bosun_task:create(<<"OT">>, #{<<"title">> => <<"big goal">>, <<"kind">> => <<"epic">>}),
    {ok, _} = bosun_task:update(<<"BQ-3">>, #{<<"epic">> => <<"OT-2">>}),
    ok = bosun_search:sync(),
    Ids = fun(Q) -> {ok, #{<<"tasks">> := Ts}} = bosun_bql:query(Q, #{}), [maps:get(<<"id">>, T) || T <- Ts] end,
    %% kind / epic
    ?assertEqual([<<"OT-2">>], Ids(<<"kind = epic">>)),
    ?assertEqual([<<"BQ-3">>], Ids(<<"epic = ot-2">>)),
    ?assertEqual([<<"BQ-3">>], Ids(<<"parent in (OT-2)">>)),
    ?assertEqual(4, length(Ids(<<"epic is empty">>))),
    ?assertEqual(4, length(Ids(<<"type = task">>))),
    ?assertMatch({error, {invalid, query, _}}, bosun_bql:query(<<"kind = story">>, #{})),
    ?assertEqual([<<"BQ-1">>], Ids(<<"project = bq AND labels = Backend AND priority = high">>)),
    ?assertEqual([<<"BQ-1">>, <<"OT-1">>], lists:sort(Ids(<<"labels in (backend)">>))),
    ?assertEqual([<<"BQ-1">>, <<"BQ-3">>], Ids(<<"project = BQ and status = new order by priority desc">>)),
    ?assertEqual([<<"BQ-3">>, <<"BQ-1">>], Ids(<<"project = BQ and status = new order by priority asc">>)),
    ?assertEqual([<<"BQ-2">>], Ids(<<"status not in (new) and project = BQ">>)),
    ?assertEqual([<<"BQ-3">>], Ids(<<"question = true">>)),
    ?assertEqual([<<"BQ-3">>], Ids(<<"feedback ~ port">>)),
    ?assertEqual([<<"BQ-3">>], Ids(<<"feedback_count >= 1">>)),
    ?assertEqual([<<"BQ-1">>], Ids(<<"text ~ \"创建任务\""/utf8>>)),
    ?assertEqual([<<"BQ-1">>], Ids(<<"reporter = coxswain">>)),
    ?assertEqual([<<"BQ-1">>], Ids(<<"requester = coxswain">>)),
    %% assignee：BQ-2 被 user 领过（IN_PROGRESS），其余为空
    ?assertEqual([<<"BQ-2">>], Ids(<<"assignee = user">>)),
    ?assertEqual([<<"BQ-2">>], Ids(<<"assignee ~ use">>)),
    ?assertEqual(4, length(Ids(<<"assignee is empty">>))),
    ?assertEqual([<<"BQ-2">>], Ids(<<"assignee is not empty order by assignee">>)),
    ?assertEqual([<<"BQ-3">>], Ids(<<"project = BQ and labels is empty">>)),
    ?assertEqual([<<"BQ-2">>], Ids(<<"title ~ docs">>)),
    ?assertEqual([<<"BQ-3">>, <<"BQ-2">>, <<"BQ-1">>], Ids(<<"project = BQ and created >= -1h order by id desc">>)),
    ?assertEqual([], Ids(<<"created < 2020-01-01">>)),
    ?assertEqual(5, length(Ids(<<"created >= 2020-01-01T00:00">>))),
    ?assertEqual([<<"BQ-1">>, <<"OT-1">>], lists:sort(Ids(<<"(labels = backend or labels = mcp) and not status = done">>))),
    ?assertEqual([<<"OT-2">>], Ids(<<"project = OT and status = new and kind = epic">>)),
    {ok, #{<<"order">> := [#{<<"field">> := <<"score">>}]}} = bosun_bql:query(<<"text ~ backend">>, #{}),
    {ok, #{<<"order">> := [#{<<"field">> := <<"updated">>, <<"dir">> := <<"desc">>}]}} = bosun_bql:query(<<"status = new">>, #{}),
    {ok, #{<<"tasks">> := [_], <<"total">> := 3}} = bosun_bql:query(<<"project = BQ">>, #{<<"limit">> => 1, <<"offset">> => 2}),
    ?assertMatch({error, {invalid, query, _}}, bosun_bql:query(<<"bogus = 1">>, #{})),
    %% links / blocked：BQ-1 依赖 BQ-2（DONE，已满足）与 OT-1（NEW，未满足）；OT-2 替代 BQ-3
    {ok, _} = bosun_link:add(<<"BQ-1">>, <<"BQ-2">>, <<"depends_on">>, #{}),
    {ok, _} = bosun_link:add(<<"BQ-1">>, <<"OT-1">>, <<"depends_on">>, #{}),
    {ok, _} = bosun_link:add(<<"OT-2">>, <<"BQ-3">>, <<"replaces">>, #{}),
    ?assertEqual([<<"BQ-1">>], Ids(<<"blocked = true">>)),
    ?assertEqual(4, length(Ids(<<"blocked = false">>))),
    ?assertEqual([<<"BQ-1">>], Ids(<<"depends_on = ot-1">>)),
    ?assertEqual([<<"BQ-1">>], Ids(<<"depends_on in (BQ-2, XX-9)">>)),
    ?assertEqual([<<"BQ-2">>, <<"OT-1">>], lists:sort(Ids(<<"blocks is not empty">>))),
    ?assertEqual([<<"OT-2">>], Ids(<<"replaces = BQ-3">>)),
    ?assertEqual([<<"BQ-3">>], Ids(<<"replaced_by = OT-2">>)),
    ?assertEqual([<<"BQ-3">>], Ids(<<"status = cancelled">>)),
    ?assertMatch({error, {invalid, query, _}}, bosun_bql:query(<<"blocked = maybe">>, #{})),
    ?assertMatch({error, {invalid, query, _}}, bosun_bql:query(<<"depends_on ~ x">>, #{})).

saved_filters() ->
    {ok, _} = bosun_project:create(#{<<"key">> => <<"SF">>, <<"name">> => <<"s">>}),
    {ok, _} = bosun_task:create(<<"SF">>, #{<<"title">> => <<"a">>}),
    {ok, F} = bosun_filter:create(#{<<"name">> => <<"我的新任务"/utf8>>, <<"query">> => <<"status = new">>}),
    ?assertMatch(<<"f", _/binary>>, maps:get(<<"id">>, F)),
    ?assertMatch({error, {invalid, query, _}}, bosun_filter:create(#{<<"name">> => <<"x">>, <<"query">> => <<"foo = 1">>})),
    ?assertMatch({error, {invalid, name, _}}, bosun_filter:create(#{<<"query">> => <<"status = new">>})),
    {ok, [_]} = bosun_filter:list(),
    Id = maps:get(<<"id">>, F),
    {ok, #{<<"tasks">> := [_], <<"filter">> := #{<<"id">> := Id}}} = bosun_filter:run(Id, #{}),
    {ok, U} = bosun_filter:update(Id, #{<<"query">> => <<"status = done">>}),
    ?assertEqual(<<"status = done">>, maps:get(<<"query">>, U)),
    ?assertEqual(<<"我的新任务"/utf8>>, maps:get(<<"name">>, U)),
    {ok, #{<<"tasks">> := []}} = bosun_filter:run(Id, #{}),
    ?assertMatch({error, {invalid, query, _}}, bosun_filter:update(Id, #{<<"query">> => <<"(">>})),
    ok = bosun_filter:delete(Id),
    ?assertEqual({error, not_found}, bosun_filter:delete(Id)),
    ?assertEqual({error, not_found}, bosun_filter:run(Id, #{})),
    {ok, []} = bosun_filter:list().
