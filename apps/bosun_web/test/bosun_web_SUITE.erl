%%%-------------------------------------------------------------------
%%% @doc 起真实 cowboy，用 httpc 打 REST 与 MCP（Streamable HTTP）。
%%%-------------------------------------------------------------------
-module(bosun_web_SUITE).

-include_lib("common_test/include/ct.hrl").
-include_lib("stdlib/include/assert.hrl").

-export([all/0, init_per_suite/1, end_per_suite/1, init_per_testcase/2, end_per_testcase/2]).
-export([rest_chain/1, rest_errors/1, static_fallback/1, mcp_end_to_end/1, auth_flow/1, org_isolation/1]).

all() -> [rest_chain, rest_errors, static_fallback, mcp_end_to_end, auth_flow, org_isolation].

init_per_suite(Config) ->
    %% 同一 VM 里先跑过 eunit（bosun_test_env）会留下独立的 bosun_search / bosun_identity，
    %% 不停掉的话 supervisor 起不来（already_started）
    lists:foreach(fun stop_stray/1, [bosun_search, bosun_identity]),
    %% eunit 起的 mnesia 用的是缺省目录（cwd），停掉让 bosun_store:init 按 data_dir 重来
    _ = application:stop(mnesia),
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

%% 每个用例：清库，注册组织 Acme（管理员 Alice），拿到登录 Cookie
init_per_testcase(_, Config) ->
    ok = bosun_store:reset_tables(),
    ok = bosun_search:reset(),
    Base = ?config(base, Config),
    {Cookie, Org, User} = register_org(Base, <<"Acme">>, <<"alice@acme.io">>, <<"Alice">>),
    [{cookie, Cookie}, {org, Org}, {user, User} | Config].

end_per_testcase(_, _Config) -> ok.

%%====================================================================
%% 用例
%%====================================================================

rest_chain(Config) ->
    Base = ?config(base, Config),
    {201, P} = req(post, Config, "/api/v1/projects", #{<<"key">> => <<"web">>, <<"name">> => <<"Web">>}),
    ?assertEqual(<<"WEB">>, maps:get(<<"key">>, P)),
    {200, #{<<"projects">> := [_]}} = req(get, Config, "/api/v1/projects"),
    {200, _} = req(patch, Config, "/api/v1/projects/WEB", #{<<"description">> => <<"# hi">>}),
    {200, #{<<"description">> := <<"# hi">>}} = req(get, Config, "/api/v1/projects/web"),

    {201, T} = req(post, Config, "/api/v1/projects/WEB/tasks",
                   #{<<"title">> => <<"first">>, <<"labels">> => [<<"ui">>]}),
    ?assertEqual(<<"WEB-1">>, maps:get(<<"id">>, T)),
    {201, _} = req(post, Config, "/api/v1/projects/WEB/tasks", #{<<"title">> => <<"second">>}),
    {200, #{<<"tasks">> := [_, _], <<"total">> := 2}} = req(get, Config, "/api/v1/projects/WEB/tasks"),
    {200, #{<<"tasks">> := [#{<<"id">> := <<"WEB-1">>}], <<"total">> := 1}} =
        req(get, Config, "/api/v1/projects/WEB/tasks?label=ui&status=NEW,IN_PROGRESS"),
    {200, #{<<"title">> := <<"first">>, <<"feedback">> := []}} = req(get, Config, "/api/v1/tasks/web-1"),
    %% epic：建 Epic、挂步骤、按 kind / epic 过滤、详情带 children + progress
    {201, #{<<"id">> := <<"WEB-3">>, <<"kind">> := <<"epic">>}} =
        req(post, Config, "/api/v1/projects/WEB/tasks", #{<<"title">> => <<"goal">>, <<"kind">> => <<"epic">>}),
    {200, #{<<"epic">> := <<"WEB-3">>, <<"epic_title">> := <<"goal">>}} =
        req(patch, Config, "/api/v1/tasks/WEB-2", #{<<"epic">> => <<"web-3">>}),
    {200, #{<<"tasks">> := [#{<<"id">> := <<"WEB-3">>}], <<"total">> := 1}} = req(get, Config, "/api/v1/projects/WEB/tasks?kind=epic"),
    {200, #{<<"tasks">> := [#{<<"id">> := <<"WEB-2">>}], <<"total">> := 1}} = req(get, Config, "/api/v1/projects/WEB/tasks?epic=WEB-3"),
    {200, #{<<"children">> := [#{<<"id">> := <<"WEB-2">>}], <<"progress">> := #{<<"total">> := 1, <<"done">> := 0}}} =
        req(get, Config, "/api/v1/tasks/WEB-3"),
    {400, #{<<"error">> := <<"invalid">>, <<"field">> := <<"epic">>}} =
        req(patch, Config, "/api/v1/tasks/WEB-1", #{<<"epic">> => <<"WEB-1">>}),
    {200, #{<<"epic">> := null}} = req(patch, Config, "/api/v1/tasks/WEB-2", #{<<"epic">> => <<>>}),
    %% links：依赖阻塞开始（409 blocked）、成环 409、删链
    {201, #{<<"blocked">> := true, <<"links">> := [#{<<"type">> := <<"depends_on">>, <<"task">> := <<"WEB-1">>}]}} =
        req(post, Config, "/api/v1/tasks/WEB-2/links", #{<<"to">> => <<"web-1">>, <<"type">> => <<"depends_on">>}),
    {409, #{<<"error">> := <<"blocked">>, <<"detail">> := #{<<"blockers">> := [<<"WEB-1">>]}}} =
        req(post, Config, "/api/v1/tasks/WEB-2/transition", #{<<"to">> => <<"IN_PROGRESS">>}),
    {409, #{<<"error">> := <<"cycle">>, <<"detail">> := #{<<"path">> := [<<"WEB-1">>, <<"WEB-2">>, <<"WEB-1">>]}}} =
        req(post, Config, "/api/v1/tasks/WEB-1/links", #{<<"to">> => <<"WEB-2">>, <<"type">> => <<"depends_on">>}),
    {400, #{<<"field">> := <<"type">>}} = req(post, Config, "/api/v1/tasks/WEB-1/links", #{<<"to">> => <<"WEB-2">>, <<"type">> => <<"related">>}),
    {200, #{<<"blocked">> := false, <<"links">> := []}} = req(delete, Config, "/api/v1/tasks/WEB-2/links/depends_on/WEB-1"),
    {404, _} = req(delete, Config, "/api/v1/tasks/WEB-2/links/depends_on/WEB-1"),
    {200, #{<<"title">> := <<"renamed">>, <<"status">> := <<"NEW">>}} =
        req(patch, Config, "/api/v1/tasks/WEB-1", #{<<"title">> => <<"renamed">>, <<"status">> => <<"DONE">>}),

    {200, #{<<"status">> := <<"IN_PROGRESS">>}} =
        req(post, Config, "/api/v1/tasks/WEB-1/transition", #{<<"to">> => <<"IN_PROGRESS">>}),
    {201, F} = req(post, Config, "/api/v1/tasks/WEB-1/feedback",
                   #{<<"content">> => <<"looks good">>, <<"kind">> => <<"review">>}),
    ?assertEqual(<<"WEB-1#1">>, maps:get(<<"id">>, F)),
    ?assertEqual(<<"Alice">>, maps:get(<<"author">>, F)),
    {200, #{<<"feedback">> := [_]}} = req(get, Config, "/api/v1/tasks/WEB-1/feedback"),
    {200, #{<<"status">> := <<"DONE">>, <<"assignee">> := <<"Alice">>, <<"commits">> := [<<"abc1234">>],
            <<"history">> := [#{<<"comment">> := <<"done">>, <<"commits">> := [<<"abc1234">>], <<"tests">> := #{<<"passed">> := true}} | _]}} =
        req(post, Config, "/api/v1/tasks/WEB-1/transition", #{<<"to">> => <<"DONE">>, <<"comment">> => <<"done">>,
                                                            <<"commits">> => [<<"abc1234">>], <<"tests">> => #{<<"command">> => <<"pnpm test">>, <<"passed">> => true, <<"summary">> => <<"7 passed">>}}),
    {200, #{<<"feedback_count">> := 1}} = req(get, Config, "/api/v1/tasks/WEB-1"),
    %% 全文检索：标题与 feedback 都能命中
    ok = bosun_search:sync(),
    {200, #{<<"hits">> := [#{<<"task">> := #{<<"id">> := <<"WEB-2">>}}]}} = req(get, Config, "/api/v1/search?q=second"),
    {200, #{<<"hits">> := [#{<<"task">> := #{<<"id">> := <<"WEB-1">>}, <<"matched">> := <<"feedback">>,
                            <<"feedback">> := #{<<"id">> := <<"WEB-1#1">>}}]}} = req(get, Config, "/api/v1/search?q=looks%20good&project=web"),
    {200, #{<<"hits">> := []}} = req(get, Config, "/api/v1/search?q="),
    %% BQL 与保存的筛选器
    {200, #{<<"tasks">> := [#{<<"id">> := <<"WEB-1">>}], <<"total">> := 1}} =
        req(get, Config, "/api/v1/query?q=project%20%3D%20web%20and%20status%20%3D%20done"),
    {400, #{<<"field">> := <<"query">>}} = req(get, Config, "/api/v1/query?q=bogus%20%3D%201"),
    {201, #{<<"id">> := FId}} = req(post, Config, "/api/v1/filters", #{<<"name">> => <<"done">>, <<"query">> => <<"status = done">>}),
    {200, #{<<"filters">> := [_], <<"fields">> := Fields}} = req(get, Config, "/api/v1/filters"),
    ?assert(lists:member(<<"status">>, Fields)),
    {200, #{<<"tasks">> := [_], <<"filter">> := #{<<"id">> := FId}}} = req(get, Config, "/api/v1/filters/" ++ binary_to_list(FId) ++ "/run"),
    {200, #{<<"name">> := <<"renamed">>}} = req(patch, Config, "/api/v1/filters/" ++ binary_to_list(FId), #{<<"name">> => <<"renamed">>}),
    {204, _} = req(delete, Config, "/api/v1/filters/" ++ binary_to_list(FId)),
    {404, _} = req(get, Config, "/api/v1/filters/" ++ binary_to_list(FId)),
    %% 导出 / 导入
    {ok, {{_, 200, _}, EH, ExportBody}} = httpc:request(get, {Base ++ "/api/v1/export", [cookie_header(Config)]}, [], [{body_format, binary}]),
    ?assertMatch("attachment" ++ _, proplists:get_value("content-disposition", EH)),
    #{<<"format">> := <<"bosun-export">>, <<"tasks">> := [_, _, _]} = json:decode(ExportBody),
    {200, #{<<"tasks">> := 3, <<"mode">> := <<"replace">>}} = req_raw(post, Config, "/api/v1/import?mode=replace", ExportBody),
    {200, #{<<"id">> := <<"WEB-1">>}} = req(get, Config, "/api/v1/tasks/WEB-1"),
    {400, #{<<"field">> := <<"data">>}} = req(post, Config, "/api/v1/import", #{<<"format">> => <<"nope">>}),
    %% 修订自己的 feedback；别人的 403；已作废 409
    {201, #{<<"id">> := <<"WEB-1#2">>, <<"content">> := <<"looks great">>, <<"supersedes">> := <<"WEB-1#1">>}} =
        req(patch, Config, "/api/v1/tasks/WEB-1/feedback/1", #{<<"content">> => <<"looks great">>}),
    {409, #{<<"error">> := <<"superseded">>}} =
        req(patch, Config, "/api/v1/tasks/WEB-1/feedback/1", #{<<"content">> => <<"again">>}),
    {200, #{<<"feedback">> := [#{<<"status">> := <<"superseded">>}, #{<<"status">> := <<"active">>}]}} =
        req(get, Config, "/api/v1/tasks/WEB-1/feedback"),
    Bob = as_user(Config, <<"bob@acme.io">>, <<"Bob">>),
    {403, #{<<"error">> := <<"forbidden">>}} =
        req(patch, Bob, "/api/v1/tasks/WEB-1/feedback/2", #{<<"content">> => <<"hijack">>}),
    {404, _} = req(patch, Config, "/api/v1/tasks/WEB-1/feedback/9", #{<<"content">> => <<"x">>}),
    {405, _} = req(delete, Config, "/api/v1/tasks/WEB-1/feedback/1"),
    ok.

rest_errors(Config) ->
    Base = ?config(base, Config),
    {400, #{<<"error">> := <<"invalid">>, <<"field">> := <<"key">>}} =
        req(post, Config, "/api/v1/projects", #{<<"key">> => <<"x">>, <<"name">> => <<"n">>}),
    {201, _} = req(post, Config, "/api/v1/projects", #{<<"key">> => <<"ERR">>, <<"name">> => <<"n">>}),
    {409, #{<<"error">> := <<"conflict">>}} =
        req(post, Config, "/api/v1/projects", #{<<"key">> => <<"ERR">>, <<"name">> => <<"n">>}),
    {404, #{<<"error">> := <<"not_found">>}} = req(get, Config, "/api/v1/projects/NOPE"),
    {404, #{<<"error">> := <<"not_found">>}} = req(get, Config, "/api/v1/projects/NOPE/tasks"),
    {404, #{<<"error">> := <<"not_found">>}} = req(get, Config, "/api/v1/tasks/ERR-1"),
    {400, #{<<"error">> := <<"invalid">>, <<"field">> := <<"id">>}} = req(get, Config, "/api/v1/tasks/garbage"),
    {400, #{<<"field">> := <<"body">>}} = req_raw(post, Config, "/api/v1/projects", <<"{not json">>),
    {201, _} = req(post, Config, "/api/v1/projects/ERR/tasks", #{<<"title">> => <<"t">>}),
    {409, #{<<"error">> := <<"invalid_transition">>, <<"detail">> := #{<<"allowed">> := [<<"IN_PROGRESS">>, <<"REJECTED">>, <<"CANCELLED">>]}}} =
        req(post, Config, "/api/v1/tasks/ERR-1/transition", #{<<"to">> => <<"DONE">>}),
    {400, #{<<"field">> := <<"status">>}} =
        req(post, Config, "/api/v1/tasks/ERR-1/transition", #{<<"to">> => <<"nope">>}),
    %% 自验收没有测试证据 → 409；body 里的 actor 不再采信，署名永远是登录用户
    {200, #{<<"assignee">> := <<"Alice">>}} = req(post, Config, "/api/v1/tasks/ERR-1/transition", #{<<"to">> => <<"IN_PROGRESS">>, <<"actor">> => <<"keel/a">>}),
    {200, _} = req(post, Config, "/api/v1/tasks/ERR-1/transition", #{<<"to">> => <<"DONE">>}),
    {409, #{<<"error">> := <<"self_verify_requires_tests">>, <<"detail">> := #{<<"assignee">> := <<"Alice">>}}} =
        req(post, Config, "/api/v1/tasks/ERR-1/transition", #{<<"to">> => <<"VERIFIED">>}),
    Bob = as_user(Config, <<"bob@acme.io">>, <<"Bob">>),
    {200, #{<<"status">> := <<"VERIFIED">>, <<"history">> := [#{<<"actor">> := <<"Bob">>} | _]}} =
        req(post, Bob, "/api/v1/tasks/ERR-1/transition", #{<<"to">> => <<"VERIFIED">>}),
    {200, _} = req(post, Config, "/api/v1/tasks/ERR-1/transition", #{<<"to">> => <<"IN_PROGRESS">>}),
    {200, _} = req(patch, Config, "/api/v1/projects/ERR", #{<<"archived">> => true}),
    {409, #{<<"error">> := <<"archived">>}} = req(post, Config, "/api/v1/projects/ERR/tasks", #{<<"title">> => <<"t">>}),
    {404, #{<<"error">> := <<"not_found">>}} = req(get, Config, "/api/v1/nothing/here"),
    {405, _} = req(delete, Config, "/api/v1/projects/ERR"),
    %% 成员不能导出 / 管用户
    {403, #{<<"error">> := <<"forbidden">>}} = req(get, Bob, "/api/v1/export"),
    {403, #{<<"error">> := <<"forbidden">>}} = req(get, Bob, "/api/v1/users"),
    {403, #{<<"error">> := <<"forbidden">>}} = req(patch, Bob, "/api/v1/org", #{<<"name">> => <<"x">>}),
    {200, #{<<"name">> := <<"Acme">>}} = req(get, Bob, "/api/v1/org"),
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
    Init = rpc(1, <<"initialize">>,
        #{<<"protocolVersion">> => <<"2025-03-26">>, <<"capabilities">> => #{},
          <<"clientInfo">> => #{<<"name">> => <<"ct">>, <<"version">> => <<"1">>}}),
    %% 没有 key / 错的 key → 401 + WWW-Authenticate
    {401, H401, _} = mcp_post(Url, [], Init),
    ?assertMatch("Bearer" ++ _, proplists:get_value("www-authenticate", H401)),
    {401, _, _} = mcp_post(Url, [{"authorization", "Bearer bsk_nope"}], Init),
    %% 用 Cookie 也不行：/mcp 只认 key
    {401, _, _} = mcp_post(Url, [cookie_header(Config)], Init),
    {201, #{<<"key">> := Key, <<"id">> := KeyId}} = req(post, Config, "/api/v1/keys", #{<<"name">> => <<"ct">>}),
    Auth = {"authorization", "Bearer " ++ binary_to_list(Key)},
    {200, Hdrs, InitBody} = mcp_post(Url, [Auth], Init),
    Sid = proplists:get_value("mcp-session-id", Hdrs),
    ?assertNotEqual(undefined, Sid),
    ?assertMatch(#{<<"result">> := #{<<"serverInfo">> := #{<<"name">> := <<"bosun">>}}}, json:decode(InitBody)),
    S = [{"mcp-session-id", Sid}, Auth],

    {200, _, ListBody} = mcp_post(Url, S, rpc(2, <<"tools/list">>, #{})),
    #{<<"result">> := #{<<"tools">> := Tools}} = json:decode(ListBody),
    ?assertEqual(22, length(Tools)),
    ?assert(lists:member(<<"transition_task">>, [maps:get(<<"name">>, T) || T <- Tools])),

    %% 还没 identify 也已经知道是谁的 key
    {ok, #{<<"identified">> := false, <<"user">> := #{<<"name">> := <<"Alice">>, <<"email">> := <<"alice@acme.io">>}}} = call(Url, S, 29, <<"whoami">>, #{}),
    {ok, #{<<"name">> := <<"e2e/ct">>, <<"identified">> := true, <<"user">> := #{<<"name">> := <<"Alice">>}}} =
        call(Url, S, 30, <<"identify">>, #{<<"name">> => <<"e2e/ct">>, <<"project">> => <<"E2E">>}),
    {ok, P} = call(Url, S, 3, <<"create_project">>, #{<<"key">> => <<"E2E">>, <<"name">> => <<"e2e">>}),
    ?assertEqual(<<"E2E">>, maps:get(<<"key">>, P)),
    {ok, T} = call(Url, S, 4, <<"create_task">>, #{<<"project_key">> => <<"e2e">>, <<"title">> => <<"via mcp">>}),
    ?assertEqual(<<"E2E-1">>, maps:get(<<"id">>, T)),
    {ok, _} = call(Url, S, 5, <<"transition_task">>, #{<<"task_id">> => <<"E2E-1">>, <<"to">> => <<"IN_PROGRESS">>}),
    {ok, F} = call(Url, S, 6, <<"add_feedback">>, #{<<"task_id">> => <<"E2E-1">>, <<"content">> => <<"working on it">>}),
    ?assertEqual(<<"e2e/ct">>, maps:get(<<"author">>, F)),
    ?assertEqual(<<"e2e/ct">>, maps:get(<<"created_by">>, T)),
    {200, #{<<"actors">> := ActorList}} = req(get, Config, "/api/v1/actors"),
    {ok, {{_, 200, _}, WfHeaders, WfZh}} =
        httpc:request(get, {?config(base, Config) ++ "/api/v1/workflow.md", []}, [], [{body_format, binary}]),
    "text/markdown; charset=utf-8" = proplists:get_value("content-type", WfHeaders),
    {ok, WfZh} = bosun_workflow:doc(zh),
    {ok, {{_, 200, _}, _, WfEn}} =
        httpc:request(get, {?config(base, Config) ++ "/api/v1/workflow.md?lang=en", []}, [], [{body_format, binary}]),
    {ok, WfEn} = bosun_workflow:doc(en),
    {400, #{<<"error">> := <<"invalid">>, <<"field">> := <<"lang">>}} =
        req(get, Config, "/api/v1/workflow.md?lang=fr"),
    #{<<"id">> := AliceId} = ?config(user, Config),
    ?assertMatch([_ | _], [A || #{<<"name">> := <<"e2e/ct">>, <<"kind">> := <<"agent">>, <<"project">> := <<"E2E">>, <<"user_id">> := Uid} = A <- ActorList, Uid =:= AliceId]),
    {ok, Done} = call(Url, S, 7, <<"transition_task">>, #{<<"task_id">> => <<"E2E-1">>, <<"to">> => <<"DONE">>, <<"comment">> => <<"finished">>}),
    ?assertEqual(<<"DONE">>, maps:get(<<"status">>, Done)),
    {ok, Full} = call(Url, S, 8, <<"get_task">>, #{<<"task_id">> => <<"e2e-1">>}),
    ?assertEqual(1, length(maps:get(<<"feedback">>, Full))),
    ?assertEqual(3, length(maps:get(<<"history">>, Full))),
    {error, Text} = call(Url, S, 9, <<"transition_task">>, #{<<"task_id">> => <<"E2E-1">>, <<"to">> => <<"NEW">>}),
    ?assertEqual(<<"cannot move task from DONE to NEW; allowed next statuses: IN_PROGRESS, VERIFIED">>, Text),

    {200, #{<<"status">> := <<"DONE">>}} = req(get, Config, "/api/v1/tasks/E2E-1"),

    {200, _, ResBody} = mcp_post(Url, S, rpc(10, <<"resources/read">>, #{<<"uri">> => <<"bosun://projects">>})),
    #{<<"result">> := #{<<"contents">> := [#{<<"text">> := ResText}]}} = json:decode(ResBody),
    ?assertMatch(#{<<"projects">> := [#{<<"key">> := <<"E2E">>}]}, json:decode(ResText)),
    {200, _, PromptBody} = mcp_post(Url, S, rpc(11, <<"prompts/get">>,
        #{<<"name">> => <<"work_on_task">>, <<"arguments">> => #{<<"task_id">> => <<"E2E-1">>}})),
    #{<<"result">> := #{<<"messages">> := [#{<<"role">> := <<"user">>}]}} = json:decode(PromptBody),
    %% 撤销 key：同一会话下一个请求就 401
    {204, _} = req(delete, Config, "/api/v1/keys/" ++ binary_to_list(KeyId)),
    {401, _, _} = mcp_post(Url, S, rpc(12, <<"tools/list">>, #{})),
    ok.

%% 注册 / 登录 / 登出 / me / 改密 / 用户管理 / key
auth_flow(Config) ->
    Base = ?config(base, Config),
    %% 未登录：401；公开端点照常
    {401, #{<<"error">> := <<"unauthorized">>}} = req(get, [{base, Base}], "/api/v1/projects"),
    {401, _} = req(get, [{base, Base}], "/api/v1/auth/me"),
    {ok, {{_, 200, _}, _, _}} = httpc:request(get, {Base ++ "/api/v1/workflow.md", []}, [], []),
    %% me
    {200, #{<<"user">> := #{<<"name">> := <<"Alice">>, <<"role">> := <<"admin">>}, <<"org">> := #{<<"name">> := <<"Acme">>}, <<"via">> := <<"session">>}} =
        req(get, Config, "/api/v1/auth/me"),
    %% 注册校验：坏邮箱 400、重发 429、错码 400、同邮箱 409
    {400, #{<<"field">> := <<"email">>}} = req(post, Config, "/api/v1/auth/register/code", #{<<"email">> => <<"nope">>}),
    {202, #{<<"delivery">> := <<"log">>}} = req(post, Config, "/api/v1/auth/register/code", #{<<"email">> => <<"x@y.io">>}),
    {429, #{<<"error">> := <<"too_many_requests">>}} = req(post, Config, "/api/v1/auth/register/code", #{<<"email">> => <<"x@y.io">>}),
    {ok, Code} = bosun_email_code:peek(<<"x@y.io">>),
    Reg = #{<<"org_name">> => <<"Xorg">>, <<"email">> => <<"x@y.io">>, <<"name">> => <<"Xavier">>, <<"password">> => <<"password1">>},
    {400, #{<<"error">> := <<"code_mismatch">>}} = req(post, Config, "/api/v1/auth/register", Reg#{<<"code">> => <<"000000">>}),
    {400, #{<<"error">> := <<"code_expired">>}} = req(post, Config, "/api/v1/auth/register", Reg#{<<"code">> => <<"1">>, <<"email">> => <<"never@y.io">>}),
    {201, #{<<"org">> := #{<<"name">> := <<"Xorg">>}, <<"user">> := #{<<"role">> := <<"admin">>}}} =
        req(post, Config, "/api/v1/auth/register", Reg#{<<"code">> => Code}),
    {202, _} = req(post, Config, "/api/v1/auth/register/code", #{<<"email">> => <<"alice@acme.io">>}),
    {ok, Code2} = bosun_email_code:peek(<<"alice@acme.io">>),
    {409, #{<<"error">> := <<"conflict">>, <<"field">> := <<"email">>}} =
        req(post, Config, "/api/v1/auth/register", Reg#{<<"code">> => Code2, <<"email">> => <<"alice@acme.io">>}),
    %% 登录：错密码 401、停用 403、成功拿 cookie
    {401, #{<<"error">> := <<"invalid_credentials">>}} = req(post, [{base, Base}], "/api/v1/auth/login", #{<<"email">> => <<"alice@acme.io">>, <<"password">> => <<"wrong">>}),
    {ok, {{_, 200, _}, LH, _}} = httpc:request(post, {Base ++ "/api/v1/auth/login", [], "application/json",
                                                       bosun_json:encode(#{<<"email">> => <<"ALICE@acme.io">>, <<"password">> => <<"secret123">>})},
                                               [], [{body_format, binary}]),
    ?assertMatch("bosun_session=" ++ _, proplists:get_value("set-cookie", LH)),
    ?assert(string:find(proplists:get_value("set-cookie", LH), "HttpOnly") =/= nomatch),
    %% 用户管理（admin）
    {201, #{<<"id">> := BobId, <<"role">> := <<"member">>}} =
        req(post, Config, "/api/v1/users", #{<<"email">> => <<"bob@acme.io">>, <<"name">> => <<"Bob">>, <<"password">> => <<"bobsecret">>}),
    {409, #{<<"field">> := <<"email">>}} =
        req(post, Config, "/api/v1/users", #{<<"email">> => <<"bob@acme.io">>, <<"name">> => <<"B2">>, <<"password">> => <<"bobsecret">>}),
    {200, #{<<"users">> := [_, _]}} = req(get, Config, "/api/v1/users"),
    #{<<"id">> := AliceId} = ?config(user, Config),
    {409, #{<<"error">> := <<"last_admin">>}} = req(patch, Config, "/api/v1/users/" ++ binary_to_list(AliceId), #{<<"role">> => <<"member">>}),
    {200, #{<<"status">> := <<"disabled">>}} = req(patch, Config, "/api/v1/users/" ++ binary_to_list(BobId), #{<<"status">> => <<"disabled">>}),
    {403, #{<<"error">> := <<"user_disabled">>}} = req(post, [{base, Base}], "/api/v1/auth/login", #{<<"email">> => <<"bob@acme.io">>, <<"password">> => <<"bobsecret">>}),
    {200, _} = req(patch, Config, "/api/v1/users/" ++ binary_to_list(BobId), #{<<"status">> => <<"active">>, <<"password">> => <<"reset1234">>}),
    Bob = login(Base, <<"bob@acme.io">>, <<"reset1234">>),
    {200, #{<<"user">> := #{<<"name">> := <<"Bob">>, <<"role">> := <<"member">>}}} = req(get, Bob, "/api/v1/auth/me"),
    %% 改密：错当前密码 401，成功后旧 cookie 仍有效、新密码可登录
    {401, _} = req(post, Bob, "/api/v1/auth/password", #{<<"current">> => <<"wrong">>, <<"new">> => <<"newpass123">>}),
    {400, #{<<"field">> := <<"password">>}} = req(post, Bob, "/api/v1/auth/password", #{<<"current">> => <<"reset1234">>, <<"new">> => <<"x">>}),
    {204, _} = req(post, Bob, "/api/v1/auth/password", #{<<"current">> => <<"reset1234">>, <<"new">> => <<"newpass123">>}),
    _ = login(Base, <<"bob@acme.io">>, <<"newpass123">>),
    %% key：建、列（无明文）、用 Bearer 打 REST、撤销
    {201, #{<<"key">> := Key, <<"id">> := Kid, <<"prefix">> := Prefix}} = req(post, Bob, "/api/v1/keys", #{<<"name">> => <<"laptop">>}),
    ?assertMatch(<<"bsk_", _/binary>>, Key),
    {200, #{<<"keys">> := [#{<<"id">> := Kid, <<"prefix">> := Prefix, <<"status">> := <<"active">>} = K]}} = req(get, Bob, "/api/v1/keys"),
    ?assertNot(maps:is_key(<<"key">>, K)),
    Bearer = [{base, Base}, {auth, {"authorization", "Bearer " ++ binary_to_list(Key)}}],
    {200, #{<<"via">> := <<"api_key">>, <<"user">> := #{<<"name">> := <<"Bob">>}}} = req(get, Bearer, "/api/v1/auth/me"),
    {404, _} = req(delete, Config, "/api/v1/keys/" ++ binary_to_list(Kid)),   %% 别人的 key 撤不了
    {204, _} = req(delete, Bob, "/api/v1/keys/" ++ binary_to_list(Kid)),
    {401, _} = req(get, Bearer, "/api/v1/auth/me"),
    %% 登出：cookie 失效
    {204, _} = req(post, Bob, "/api/v1/auth/logout"),
    {401, _} = req(get, Bob, "/api/v1/auth/me"),
    ok.

%% 两个组织互相看不到
org_isolation(Config) ->
    Base = ?config(base, Config),
    {201, _} = req(post, Config, "/api/v1/projects", #{<<"key">> => <<"ACM">>, <<"name">> => <<"Acme">>}),
    {201, _} = req(post, Config, "/api/v1/projects/ACM/tasks", #{<<"title">> => <<"alpha secret">>}),
    {201, _} = req(post, Config, "/api/v1/filters", #{<<"name">> => <<"mine">>, <<"query">> => <<"project = ACM">>}),
    ok = bosun_search:sync(),
    {Beta, _, _} = register_org(Base, <<"Beta">>, <<"root@beta.io">>, <<"Root">>),
    B = [{base, Base}, {cookie, Beta}],
    {200, #{<<"projects">> := []}} = req(get, B, "/api/v1/projects"),
    {404, _} = req(get, B, "/api/v1/projects/ACM"),
    {404, _} = req(get, B, "/api/v1/projects/ACM/tasks"),
    {404, _} = req(get, B, "/api/v1/tasks/ACM-1"),
    {404, _} = req(patch, B, "/api/v1/tasks/ACM-1", #{<<"title">> => <<"x">>}),
    {404, _} = req(post, B, "/api/v1/tasks/ACM-1/transition", #{<<"to">> => <<"IN_PROGRESS">>}),
    {404, _} = req(post, B, "/api/v1/tasks/ACM-1/feedback", #{<<"content">> => <<"hi">>}),
    {200, #{<<"hits">> := []}} = req(get, B, "/api/v1/search?q=secret"),
    {200, #{<<"total">> := 0}} = req(get, B, "/api/v1/query?q=project%20%3D%20ACM"),
    {200, #{<<"filters">> := []}} = req(get, B, "/api/v1/filters"),
    {200, #{<<"actors">> := Actors}} = req(get, B, "/api/v1/actors"),
    ?assertEqual([<<"Root">>], [N || #{<<"name">> := N} <- Actors]),
    {409, #{<<"error">> := <<"conflict">>}} = req(post, B, "/api/v1/projects", #{<<"key">> => <<"ACM">>, <<"name">> => <<"B's">>}),
    {201, _} = req(post, B, "/api/v1/projects", #{<<"key">> => <<"BET">>, <<"name">> => <<"Beta">>}),
    {200, #{<<"projects">> := [#{<<"key">> := <<"BET">>}]}} = req(get, B, "/api/v1/projects"),
    {200, #{<<"projects">> := [#{<<"key">> := <<"ACM">>}]}} = req(get, Config, "/api/v1/projects"),
    {200, #{<<"hits">> := [_]}} = req(get, Config, "/api/v1/search?q=secret"),
    %% 导出只有本组织
    {ok, {{_, 200, _}, _, ExportBody}} = httpc:request(get, {Base ++ "/api/v1/export", [{"cookie", "bosun_session=" ++ Beta}]}, [], [{body_format, binary}]),
    #{<<"projects">> := [#{<<"key">> := <<"BET">>}], <<"tasks">> := []} = json:decode(ExportBody),
    ok.

%%====================================================================
%% 辅助
%%====================================================================

stop_stray(Name) ->
    case whereis(Name) of
        undefined -> ok;
        Pid ->
            Ref = monitor(process, Pid),
            exit(Pid, shutdown),
            receive {'DOWN', Ref, process, Pid, _} -> ok after 5000 -> exit(Pid, kill) end
    end.

%% 注册组织并登录：返回 {CookieValue, Org, User}
register_org(Base, OrgName, Email, Name) ->
    {202, _} = req(post, [{base, Base}], "/api/v1/auth/register/code", #{<<"email">> => Email}),
    {ok, Code} = bosun_email_code:peek(Email),
    {ok, {{_, 201, _}, H, Body}} =
        httpc:request(post, {Base ++ "/api/v1/auth/register", [], "application/json",
                             bosun_json:encode(#{<<"org_name">> => OrgName, <<"email">> => Email, <<"code">> => Code,
                                                 <<"name">> => Name, <<"password">> => <<"secret123">>})},
                      [], [{body_format, binary}]),
    #{<<"org">> := Org, <<"user">> := User} = json:decode(Body),
    {cookie_value(H), Org, User}.

%% 管理员建一个成员并登录，返回可直接给 req 用的 Config
as_user(Config, Email, Name) ->
    {201, _} = req(post, Config, "/api/v1/users", #{<<"email">> => Email, <<"name">> => Name, <<"password">> => <<"secret123">>}),
    login(?config(base, Config), Email, <<"secret123">>).

login(Base, Email, Password) ->
    {ok, {{_, 200, _}, H, _}} =
        httpc:request(post, {Base ++ "/api/v1/auth/login", [], "application/json",
                             bosun_json:encode(#{<<"email">> => Email, <<"password">> => Password})},
                      [], [{body_format, binary}]),
    [{base, Base}, {cookie, cookie_value(H)}].

cookie_value(Headers) ->
    "bosun_session=" ++ Rest = proplists:get_value("set-cookie", Headers),
    hd(string:split(Rest, ";")).

cookie_header(Config) ->
    {"cookie", "bosun_session=" ++ ?config(cookie, Config)}.

%% 请求头：Config 里有 auth 用它，有 cookie 用 cookie，都没有就裸奔
auth_headers(Config) ->
    case {proplists:get_value(auth, Config), proplists:get_value(cookie, Config)} of
        {undefined, undefined} -> [];
        {undefined, _} -> [cookie_header(Config)];
        {Auth, _} -> [Auth]
    end.

req(Method, Config, Path) ->
    req_raw(Method, Config, Path, <<>>).

req(Method, Config, Path, Body) ->
    req_raw(Method, Config, Path, bosun_json:encode(Body)).

req_raw(Method, Config, Path, Body) ->
    Url = ?config(base, Config) ++ Path,
    Headers = auth_headers(Config),
    Request = case Method of
                  get -> {Url, Headers};
                  delete -> {Url, Headers};
                  _ -> {Url, Headers, "application/json", Body}
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
