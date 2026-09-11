%%%-------------------------------------------------------------------
%%% @doc 起真实 cowboy，用 httpc 打 REST 与 MCP（Streamable HTTP）。
%%%-------------------------------------------------------------------
-module(bosun_web_SUITE).

-include_lib("common_test/include/ct.hrl").
-include_lib("stdlib/include/assert.hrl").

-export([all/0, init_per_suite/1, end_per_suite/1, init_per_testcase/2, end_per_testcase/2]).
-export([rest_chain/1, rest_errors/1, static_fallback/1, mcp_end_to_end/1]).

all() -> [rest_chain, rest_errors, static_fallback, mcp_end_to_end].

init_per_suite(Config) ->
    application:load(bosun_core),
    application:set_env(bosun_core, data_dir, ?config(priv_dir, Config)),
    application:load(bosun_web),
    application:set_env(bosun_web, port, 0),
    application:set_env(bosun_web, static_dir, ?config(priv_dir, Config)),
    {ok, _} = application:ensure_all_started(bosun_web),
    {ok, _} = application:ensure_all_started(inets),
    Port = bosun_web_sup:port(),
    [{base, "http://127.0.0.1:" ++ integer_to_list(Port)} | Config].

end_per_suite(_Config) ->
    application:stop(bosun_web),
    ok.

init_per_testcase(_, Config) ->
    ok = bosun_store:reset_tables(),
    ok = bosun_search:reset(),
    Config.

end_per_testcase(_, _Config) -> ok.

%%====================================================================
%% 用例
%%====================================================================

rest_chain(Config) ->
    Base = ?config(base, Config),
    {201, P} = req(post, Base, "/api/v1/projects", #{<<"key">> => <<"web">>, <<"name">> => <<"Web">>}),
    ?assertEqual(<<"WEB">>, maps:get(<<"key">>, P)),
    {200, #{<<"projects">> := [_]}} = req(get, Base, "/api/v1/projects"),
    {200, _} = req(patch, Base, "/api/v1/projects/WEB", #{<<"description">> => <<"# hi">>}),
    {200, #{<<"description">> := <<"# hi">>}} = req(get, Base, "/api/v1/projects/web"),

    {201, T} = req(post, Base, "/api/v1/projects/WEB/tasks",
                   #{<<"title">> => <<"first">>, <<"labels">> => [<<"ui">>]}),
    ?assertEqual(<<"WEB-1">>, maps:get(<<"id">>, T)),
    {201, _} = req(post, Base, "/api/v1/projects/WEB/tasks", #{<<"title">> => <<"second">>}),
    {200, #{<<"tasks">> := [_, _], <<"total">> := 2}} = req(get, Base, "/api/v1/projects/WEB/tasks"),
    {200, #{<<"tasks">> := [#{<<"id">> := <<"WEB-1">>}], <<"total">> := 1}} =
        req(get, Base, "/api/v1/projects/WEB/tasks?label=ui&status=NEW,IN_PROGRESS"),
    {200, #{<<"title">> := <<"first">>, <<"feedback">> := []}} = req(get, Base, "/api/v1/tasks/web-1"),
    %% epic：建 Epic、挂步骤、按 kind / epic 过滤、详情带 children + progress
    {201, #{<<"id">> := <<"WEB-3">>, <<"kind">> := <<"epic">>}} =
        req(post, Base, "/api/v1/projects/WEB/tasks", #{<<"title">> => <<"goal">>, <<"kind">> => <<"epic">>}),
    {200, #{<<"epic">> := <<"WEB-3">>, <<"epic_title">> := <<"goal">>}} =
        req(patch, Base, "/api/v1/tasks/WEB-2", #{<<"epic">> => <<"web-3">>}),
    {200, #{<<"tasks">> := [#{<<"id">> := <<"WEB-3">>}], <<"total">> := 1}} = req(get, Base, "/api/v1/projects/WEB/tasks?kind=epic"),
    {200, #{<<"tasks">> := [#{<<"id">> := <<"WEB-2">>}], <<"total">> := 1}} = req(get, Base, "/api/v1/projects/WEB/tasks?epic=WEB-3"),
    {200, #{<<"children">> := [#{<<"id">> := <<"WEB-2">>}], <<"progress">> := #{<<"total">> := 1, <<"done">> := 0}}} =
        req(get, Base, "/api/v1/tasks/WEB-3"),
    {400, #{<<"error">> := <<"invalid">>, <<"field">> := <<"epic">>}} =
        req(patch, Base, "/api/v1/tasks/WEB-1", #{<<"epic">> => <<"WEB-1">>}),
    {200, #{<<"epic">> := null}} = req(patch, Base, "/api/v1/tasks/WEB-2", #{<<"epic">> => <<>>}),
    %% links：依赖阻塞开始（409 blocked）、成环 409、删链
    {201, #{<<"blocked">> := true, <<"links">> := [#{<<"type">> := <<"depends_on">>, <<"task">> := <<"WEB-1">>}]}} =
        req(post, Base, "/api/v1/tasks/WEB-2/links", #{<<"to">> => <<"web-1">>, <<"type">> => <<"depends_on">>}),
    {409, #{<<"error">> := <<"blocked">>, <<"detail">> := #{<<"blockers">> := [<<"WEB-1">>]}}} =
        req(post, Base, "/api/v1/tasks/WEB-2/transition", #{<<"to">> => <<"IN_PROGRESS">>}),
    {409, #{<<"error">> := <<"cycle">>, <<"detail">> := #{<<"path">> := [<<"WEB-1">>, <<"WEB-2">>, <<"WEB-1">>]}}} =
        req(post, Base, "/api/v1/tasks/WEB-1/links", #{<<"to">> => <<"WEB-2">>, <<"type">> => <<"depends_on">>}),
    {400, #{<<"field">> := <<"type">>}} = req(post, Base, "/api/v1/tasks/WEB-1/links", #{<<"to">> => <<"WEB-2">>, <<"type">> => <<"related">>}),
    {200, #{<<"blocked">> := false, <<"links">> := []}} = req(delete, Base, "/api/v1/tasks/WEB-2/links/depends_on/WEB-1"),
    {404, _} = req(delete, Base, "/api/v1/tasks/WEB-2/links/depends_on/WEB-1"),
    {200, #{<<"title">> := <<"renamed">>, <<"status">> := <<"NEW">>}} =
        req(patch, Base, "/api/v1/tasks/WEB-1", #{<<"title">> => <<"renamed">>, <<"status">> => <<"DONE">>}),

    {200, #{<<"status">> := <<"IN_PROGRESS">>}} =
        req(post, Base, "/api/v1/tasks/WEB-1/transition", #{<<"to">> => <<"IN_PROGRESS">>}),
    {201, F} = req(post, Base, "/api/v1/tasks/WEB-1/feedback",
                   #{<<"content">> => <<"looks good">>, <<"kind">> => <<"review">>}),
    ?assertEqual(<<"WEB-1#1">>, maps:get(<<"id">>, F)),
    ?assertEqual(<<"user">>, maps:get(<<"author">>, F)),
    {200, #{<<"feedback">> := [_]}} = req(get, Base, "/api/v1/tasks/WEB-1/feedback"),
    {200, #{<<"status">> := <<"DONE">>, <<"assignee">> := <<"user">>, <<"commits">> := [<<"abc1234">>],
            <<"history">> := [#{<<"comment">> := <<"done">>, <<"commits">> := [<<"abc1234">>], <<"tests">> := #{<<"passed">> := true}} | _]}} =
        req(post, Base, "/api/v1/tasks/WEB-1/transition", #{<<"to">> => <<"DONE">>, <<"comment">> => <<"done">>,
                                                            <<"commits">> => [<<"abc1234">>], <<"tests">> => #{<<"command">> => <<"pnpm test">>, <<"passed">> => true, <<"summary">> => <<"7 passed">>}}),
    {200, #{<<"feedback_count">> := 1}} = req(get, Base, "/api/v1/tasks/WEB-1"),
    %% 全文检索：标题与 feedback 都能命中
    ok = bosun_search:sync(),
    {200, #{<<"hits">> := [#{<<"task">> := #{<<"id">> := <<"WEB-2">>}}]}} = req(get, Base, "/api/v1/search?q=second"),
    {200, #{<<"hits">> := [#{<<"task">> := #{<<"id">> := <<"WEB-1">>}, <<"matched">> := <<"feedback">>,
                            <<"feedback">> := #{<<"id">> := <<"WEB-1#1">>}}]}} = req(get, Base, "/api/v1/search?q=looks%20good&project=web"),
    {200, #{<<"hits">> := []}} = req(get, Base, "/api/v1/search?q="),
    %% BQL 与保存的筛选器
    {200, #{<<"tasks">> := [#{<<"id">> := <<"WEB-1">>}], <<"total">> := 1}} =
        req(get, Base, "/api/v1/query?q=project%20%3D%20web%20and%20status%20%3D%20done"),
    {400, #{<<"field">> := <<"query">>}} = req(get, Base, "/api/v1/query?q=bogus%20%3D%201"),
    {201, #{<<"id">> := FId}} = req(post, Base, "/api/v1/filters", #{<<"name">> => <<"done">>, <<"query">> => <<"status = done">>}),
    {200, #{<<"filters">> := [_], <<"fields">> := Fields}} = req(get, Base, "/api/v1/filters"),
    ?assert(lists:member(<<"status">>, Fields)),
    {200, #{<<"tasks">> := [_], <<"filter">> := #{<<"id">> := FId}}} = req(get, Base, "/api/v1/filters/" ++ binary_to_list(FId) ++ "/run"),
    {200, #{<<"name">> := <<"renamed">>}} = req(patch, Base, "/api/v1/filters/" ++ binary_to_list(FId), #{<<"name">> => <<"renamed">>}),
    {204, _} = req(delete, Base, "/api/v1/filters/" ++ binary_to_list(FId)),
    {404, _} = req(get, Base, "/api/v1/filters/" ++ binary_to_list(FId)),
    %% 导出 / 导入
    {ok, {{_, 200, _}, EH, ExportBody}} = httpc:request(get, {Base ++ "/api/v1/export", []}, [], [{body_format, binary}]),
    ?assertMatch("attachment" ++ _, proplists:get_value("content-disposition", EH)),
    #{<<"format">> := <<"bosun-export">>, <<"tasks">> := [_, _, _]} = json:decode(ExportBody),
    ok = bosun_store:reset_tables(),
    {200, #{<<"tasks">> := 3, <<"mode">> := <<"replace">>}} = req_raw(post, Base, "/api/v1/import?mode=replace", ExportBody),
    {200, #{<<"id">> := <<"WEB-1">>}} = req(get, Base, "/api/v1/tasks/WEB-1"),
    {400, #{<<"field">> := <<"data">>}} = req(post, Base, "/api/v1/import", #{<<"format">> => <<"nope">>}),
    %% 修订自己的 feedback；别人的 403；已作废 409
    {201, #{<<"id">> := <<"WEB-1#2">>, <<"content">> := <<"looks great">>, <<"supersedes">> := <<"WEB-1#1">>}} =
        req(patch, Base, "/api/v1/tasks/WEB-1/feedback/1", #{<<"content">> => <<"looks great">>}),
    {409, #{<<"error">> := <<"superseded">>}} =
        req(patch, Base, "/api/v1/tasks/WEB-1/feedback/1", #{<<"content">> => <<"again">>}),
    {200, #{<<"feedback">> := [#{<<"status">> := <<"superseded">>}, #{<<"status">> := <<"active">>}]}} =
        req(get, Base, "/api/v1/tasks/WEB-1/feedback"),
    {403, #{<<"error">> := <<"forbidden">>}} =
        req(patch, Base, "/api/v1/tasks/WEB-1/feedback/2", #{<<"content">> => <<"hijack">>, <<"actor">> => <<"keel">>}),
    {404, _} = req(patch, Base, "/api/v1/tasks/WEB-1/feedback/9", #{<<"content">> => <<"x">>}),
    {405, _} = req(delete, Base, "/api/v1/tasks/WEB-1/feedback/1"),
    ok.

rest_errors(Config) ->
    Base = ?config(base, Config),
    {400, #{<<"error">> := <<"invalid">>, <<"field">> := <<"key">>}} =
        req(post, Base, "/api/v1/projects", #{<<"key">> => <<"x">>, <<"name">> => <<"n">>}),
    {201, _} = req(post, Base, "/api/v1/projects", #{<<"key">> => <<"ERR">>, <<"name">> => <<"n">>}),
    {409, #{<<"error">> := <<"conflict">>}} =
        req(post, Base, "/api/v1/projects", #{<<"key">> => <<"ERR">>, <<"name">> => <<"n">>}),
    {404, #{<<"error">> := <<"not_found">>}} = req(get, Base, "/api/v1/projects/NOPE"),
    {404, #{<<"error">> := <<"not_found">>}} = req(get, Base, "/api/v1/projects/NOPE/tasks"),
    {404, #{<<"error">> := <<"not_found">>}} = req(get, Base, "/api/v1/tasks/ERR-1"),
    {400, #{<<"error">> := <<"invalid">>, <<"field">> := <<"id">>}} = req(get, Base, "/api/v1/tasks/garbage"),
    {400, #{<<"field">> := <<"body">>}} = req_raw(post, Base, "/api/v1/projects", <<"{not json">>),
    {201, _} = req(post, Base, "/api/v1/projects/ERR/tasks", #{<<"title">> => <<"t">>}),
    {409, #{<<"error">> := <<"invalid_transition">>, <<"detail">> := #{<<"allowed">> := [<<"IN_PROGRESS">>, <<"REJECTED">>, <<"CANCELLED">>]}}} =
        req(post, Base, "/api/v1/tasks/ERR-1/transition", #{<<"to">> => <<"DONE">>}),
    {400, #{<<"field">> := <<"status">>}} =
        req(post, Base, "/api/v1/tasks/ERR-1/transition", #{<<"to">> => <<"nope">>}),
    %% 自验收没有测试证据 → 409
    {200, _} = req(post, Base, "/api/v1/tasks/ERR-1/transition", #{<<"to">> => <<"IN_PROGRESS">>, <<"actor">> => <<"keel/a">>}),
    {200, _} = req(post, Base, "/api/v1/tasks/ERR-1/transition", #{<<"to">> => <<"DONE">>, <<"actor">> => <<"keel/a">>}),
    {409, #{<<"error">> := <<"self_verify_requires_tests">>, <<"detail">> := #{<<"assignee">> := <<"keel/a">>}}} =
        req(post, Base, "/api/v1/tasks/ERR-1/transition", #{<<"to">> => <<"VERIFIED">>, <<"actor">> => <<"keel/a">>}),
    {200, #{<<"status">> := <<"VERIFIED">>}} =
        req(post, Base, "/api/v1/tasks/ERR-1/transition", #{<<"to">> => <<"VERIFIED">>, <<"actor">> => <<"user">>}),
    {200, _} = req(post, Base, "/api/v1/tasks/ERR-1/transition", #{<<"to">> => <<"IN_PROGRESS">>, <<"actor">> => <<"keel/a">>}),
    {200, _} = req(patch, Base, "/api/v1/projects/ERR", #{<<"archived">> => true}),
    {409, #{<<"error">> := <<"archived">>}} = req(post, Base, "/api/v1/projects/ERR/tasks", #{<<"title">> => <<"t">>}),
    {404, #{<<"error">> := <<"not_found">>}} = req(get, Base, "/api/v1/nothing/here"),
    {405, _} = req(delete, Base, "/api/v1/projects/ERR"),
    ok.

static_fallback(Config) ->
    Base = ?config(base, Config),
    Dir = ?config(priv_dir, Config),
    {ok, {{_, 404, _}, _, _}} = httpc:request(get, {Base ++ "/tasks/X-1", []}, [], []),
    ok = file:write_file(filename:join(Dir, "index.html"), <<"<html>bosun</html>">>),
    ok = filelib:ensure_dir(filename:join([Dir, "assets", "x"])),
    ok = file:write_file(filename:join([Dir, "assets", "app.js"]), <<"console.log(1)">>),
    {ok, {{_, 200, _}, H1, <<"<html>bosun</html>">>}} =
        httpc:request(get, {Base ++ "/tasks/X-1", []}, [], [{body_format, binary}]),
    ?assertEqual("text/html", proplists:get_value("content-type", H1)),
    {ok, {{_, 200, _}, H2, <<"console.log(1)">>}} =
        httpc:request(get, {Base ++ "/assets/app.js", []}, [], [{body_format, binary}]),
    ?assertMatch("public" ++ _, proplists:get_value("cache-control", H2)),
    {ok, {{_, 200, _}, _, <<"<html>bosun</html>">>}} =
        httpc:request(get, {Base ++ "/assets/../index.html", []}, [], [{body_format, binary}]),
    ok.

mcp_end_to_end(Config) ->
    Url = ?config(base, Config) ++ "/mcp",
    {200, Hdrs, InitBody} = mcp_post(Url, [], rpc(1, <<"initialize">>,
        #{<<"protocolVersion">> => <<"2025-03-26">>, <<"capabilities">> => #{},
          <<"clientInfo">> => #{<<"name">> => <<"ct">>, <<"version">> => <<"1">>}})),
    Sid = proplists:get_value("mcp-session-id", Hdrs),
    ?assertNotEqual(undefined, Sid),
    ?assertMatch(#{<<"result">> := #{<<"serverInfo">> := #{<<"name">> := <<"bosun">>}}}, json:decode(InitBody)),
    S = [{"mcp-session-id", Sid}],

    {200, _, ListBody} = mcp_post(Url, S, rpc(2, <<"tools/list">>, #{})),
    #{<<"result">> := #{<<"tools">> := Tools}} = json:decode(ListBody),
    ?assertEqual(22, length(Tools)),
    ?assert(lists:member(<<"transition_task">>, [maps:get(<<"name">>, T) || T <- Tools])),

    {ok, #{<<"name">> := <<"e2e/ct">>, <<"identified">> := true}} = call(Url, S, 30, <<"identify">>, #{<<"name">> => <<"e2e/ct">>, <<"project">> => <<"E2E">>}),
    {ok, P} = call(Url, S, 3, <<"create_project">>, #{<<"key">> => <<"E2E">>, <<"name">> => <<"e2e">>}),
    ?assertEqual(<<"E2E">>, maps:get(<<"key">>, P)),
    {ok, T} = call(Url, S, 4, <<"create_task">>, #{<<"project_key">> => <<"e2e">>, <<"title">> => <<"via mcp">>}),
    ?assertEqual(<<"E2E-1">>, maps:get(<<"id">>, T)),
    {ok, _} = call(Url, S, 5, <<"transition_task">>, #{<<"task_id">> => <<"E2E-1">>, <<"to">> => <<"IN_PROGRESS">>}),
    {ok, F} = call(Url, S, 6, <<"add_feedback">>, #{<<"task_id">> => <<"E2E-1">>, <<"content">> => <<"working on it">>}),
    ?assertEqual(<<"e2e/ct">>, maps:get(<<"author">>, F)),
    ?assertEqual(<<"e2e/ct">>, maps:get(<<"created_by">>, T)),
    {200, #{<<"actors">> := ActorList}} = req(get, ?config(base, Config), "/api/v1/actors"),
    {ok, {{_, 200, _}, WfHeaders, WfZh}} =
        httpc:request(get, {?config(base, Config) ++ "/api/v1/workflow.md", []}, [], [{body_format, binary}]),
    "text/markdown; charset=utf-8" = proplists:get_value("content-type", WfHeaders),
    {ok, WfZh} = bosun_workflow:doc(zh),
    {ok, {{_, 200, _}, _, WfEn}} =
        httpc:request(get, {?config(base, Config) ++ "/api/v1/workflow.md?lang=en", []}, [], [{body_format, binary}]),
    {ok, WfEn} = bosun_workflow:doc(en),
    {400, #{<<"error">> := <<"invalid">>, <<"field">> := <<"lang">>}} =
        req(get, ?config(base, Config), "/api/v1/workflow.md?lang=fr"),
    ?assertMatch([_ | _], [A || #{<<"name">> := <<"e2e/ct">>, <<"kind">> := <<"agent">>, <<"project">> := <<"E2E">>} = A <- ActorList]),
    {ok, Done} = call(Url, S, 7, <<"transition_task">>, #{<<"task_id">> => <<"E2E-1">>, <<"to">> => <<"DONE">>, <<"comment">> => <<"finished">>}),
    ?assertEqual(<<"DONE">>, maps:get(<<"status">>, Done)),
    {ok, Full} = call(Url, S, 8, <<"get_task">>, #{<<"task_id">> => <<"e2e-1">>}),
    ?assertEqual(1, length(maps:get(<<"feedback">>, Full))),
    ?assertEqual(3, length(maps:get(<<"history">>, Full))),
    {error, Text} = call(Url, S, 9, <<"transition_task">>, #{<<"task_id">> => <<"E2E-1">>, <<"to">> => <<"NEW">>}),
    ?assertEqual(<<"cannot move task from DONE to NEW; allowed next statuses: IN_PROGRESS, VERIFIED">>, Text),

    {200, #{<<"status">> := <<"DONE">>}} = req(get, ?config(base, Config), "/api/v1/tasks/E2E-1"),

    {200, _, ResBody} = mcp_post(Url, S, rpc(10, <<"resources/read">>, #{<<"uri">> => <<"bosun://projects">>})),
    #{<<"result">> := #{<<"contents">> := [#{<<"text">> := ResText}]}} = json:decode(ResBody),
    ?assertMatch(#{<<"projects">> := [#{<<"key">> := <<"E2E">>}]}, json:decode(ResText)),
    {200, _, PromptBody} = mcp_post(Url, S, rpc(11, <<"prompts/get">>,
        #{<<"name">> => <<"work_on_task">>, <<"arguments">> => #{<<"task_id">> => <<"E2E-1">>}})),
    #{<<"result">> := #{<<"messages">> := [#{<<"role">> := <<"user">>}]}} = json:decode(PromptBody),
    ok.

%%====================================================================
%% 辅助
%%====================================================================

req(Method, Base, Path) ->
    req_raw(Method, Base, Path, <<>>).

req(Method, Base, Path, Body) ->
    req_raw(Method, Base, Path, bosun_json:encode(Body)).

req_raw(Method, Base, Path, Body) ->
    Url = Base ++ Path,
    Request = case Method of
                  get -> {Url, []};
                  delete -> {Url, []};
                  _ -> {Url, [], "application/json", Body}
              end,
    {ok, {{_, Status, _}, _, RespBody}} = httpc:request(Method, Request, [], [{body_format, binary}]),
    Decoded = case RespBody of
                  <<>> -> #{};
                  _ -> json:decode(RespBody)
              end,
    {Status, Decoded}.

rpc(Id, Method, Params) ->
    bosun_json:encode(#{<<"jsonrpc">> => <<"2.0">>, <<"id">> => Id,
                        <<"method">> => Method, <<"params">> => Params}).

mcp_post(Url, Headers, Body) ->
    {ok, {{_, Status, _}, RespHeaders, RespBody}} =
        httpc:request(post, {Url, Headers, "application/json", Body}, [], [{body_format, binary}]),
    {Status, RespHeaders, RespBody}.

call(Url, S, Id, Name, Args) ->
    {200, _, Body} = mcp_post(Url, S, rpc(Id, <<"tools/call">>, #{<<"name">> => Name, <<"arguments">> => Args})),
    #{<<"result">> := #{<<"content">> := [#{<<"text">> := Text}], <<"isError">> := IsError}} = json:decode(Body),
    case IsError of
        false -> {ok, json:decode(Text)};
        true -> {error, Text}
    end.
