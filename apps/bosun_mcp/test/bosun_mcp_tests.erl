-module(bosun_mcp_tests).

-include_lib("eunit/include/eunit.hrl").
-include_lib("beamai_mcp/include/beamai_mcp.hrl").

setup() -> ok = bosun_test_env:setup().

mcp_test_() ->
    Tests = [
        {"catalog", fun catalog/0},
        {"project tools", fun project_tools/0},
        {"task tools", fun task_tools/0},
        {"transition & feedback tools", fun transition_and_feedback/0},
        {"error texts", fun error_texts/0},
        {"resources & prompt", fun resources_and_prompt/0},
        {"query & filters", fun query_and_filters/0},
        {"epics", fun epics/0},
        {"links", fun links/0},
        {"session identity", fun session_identity/0},
        {"bound user & org scope", fun bound_user_scope/0}
    ],
    {foreach, fun setup/0, fun(_) -> ok end,
     [fun(_) -> T end || T <- Tests]}.

%% 直接调用 handler；返回 {ok, Map} 或 {error, Text}
call(Name, Args) ->
    [Tool] = [T || #mcp_tool{name = N} = T <- bosun_mcp:tools(), N =:= Name],
    case (Tool#mcp_tool.handler)(Args) of
        {ok, [#{<<"text">> := Json}]} -> {ok, json:decode(Json)};
        {ok, [#{text := Json}]} -> {ok, json:decode(Json)};
        {error, Text} when is_binary(Text) -> {error, Text}
    end.

catalog() ->
    Names = [N || #mcp_tool{name = N} <- bosun_mcp:tools()],
    ?assertEqual([<<"identify">>, <<"whoami">>, <<"list_actors">>,
                  <<"list_projects">>, <<"get_project">>, <<"create_project">>, <<"update_project">>,
                  <<"list_tasks">>, <<"search_tasks">>, <<"get_task">>, <<"create_task">>, <<"update_task">>, <<"transition_task">>,
                  <<"link_tasks">>, <<"unlink_tasks">>,
                  <<"add_feedback">>, <<"update_feedback">>, <<"list_feedback">>,
                  <<"query_tasks">>, <<"list_filters">>, <<"save_filter">>, <<"delete_filter">>], Names),
    lists:foreach(fun(T) -> _ = bosun_json:encode(beamai_mcp_types:tool_to_map(T)) end, bosun_mcp:tools()),
    ?assertEqual(3, length(bosun_mcp:resources())),
    ?assertEqual(1, length(bosun_mcp:prompts())).

project_tools() ->
    {ok, P} = call(<<"create_project">>, #{<<"key">> => <<"mcp">>, <<"name">> => <<"Via MCP">>}),
    ?assertEqual(<<"MCP">>, maps:get(<<"key">>, P)),
    {error, T1} = call(<<"create_project">>, #{<<"key">> => <<"MCP">>, <<"name">> => <<"dup">>}),
    ?assertEqual(<<"project key already exists; pick another key or use get_project">>, T1),
    {error, T2} = call(<<"create_project">>, #{<<"key">> => <<"MCP">>}),
    ?assertMatch(<<"invalid name: ", _/binary>>, T2),
    {ok, #{<<"projects">> := [_]}} = call(<<"list_projects">>, #{}),
    {ok, U} = call(<<"update_project">>, #{<<"key">> => <<"MCP">>, <<"archived">> => true}),
    ?assertEqual(true, maps:get(<<"archived">>, U)),
    {ok, #{<<"projects">> := []}} = call(<<"list_projects">>, #{}),
    {ok, #{<<"projects">> := [_]}} = call(<<"list_projects">>, #{<<"include_archived">> => true}),
    {ok, G} = call(<<"get_project">>, #{<<"key">> => <<"mcp">>}),
    ?assertEqual(<<"Via MCP">>, maps:get(<<"name">>, G)),
    {error, T3} = call(<<"get_project">>, #{<<"key">> => <<"NOPE">>}),
    ?assertMatch(<<"not found", _/binary>>, T3).

task_tools() ->
    {ok, _} = call(<<"create_project">>, #{<<"key">> => <<"TT">>, <<"name">> => <<"t">>}),
    {ok, T} = call(<<"create_task">>, #{<<"project_key">> => <<"tt">>, <<"title">> => <<"do it">>,
                                        <<"labels">> => [<<"a">>], <<"priority">> => <<"high">>}),
    ?assertEqual(<<"TT-1">>, maps:get(<<"id">>, T)),
    ?assertMatch([#{<<"actor">> := <<"agent-", _/binary>>}], maps:get(<<"history">>, T)),
    {ok, _} = call(<<"create_task">>, #{<<"project_key">> => <<"TT">>, <<"title">> => <<"second">>}),
    {ok, #{<<"tasks">> := Tasks, <<"total">> := 2}} = call(<<"list_tasks">>, #{<<"project_key">> => <<"TT">>}),
    ?assertEqual([<<"TT-2">>, <<"TT-1">>], [maps:get(<<"id">>, X) || X <- Tasks]),
    ok = bosun_search:sync(),
    {ok, #{<<"total">> := 1}} = call(<<"list_tasks">>, #{<<"project_key">> => <<"TT">>, <<"query">> => <<"second">>}),
    {ok, #{<<"hits">> := [#{<<"task">> := #{<<"id">> := <<"TT-2">>}, <<"matched">> := <<"task">>}]}} =
        call(<<"search_tasks">>, #{<<"query">> => <<"second">>}),
    {ok, #{<<"hits">> := []}} = call(<<"search_tasks">>, #{<<"query">> => <<"second">>, <<"project_key">> => <<"NOPE">>}),
    {ok, #{<<"total">> := 1}} = call(<<"list_tasks">>, #{<<"project_key">> => <<"TT">>, <<"label">> => <<"a">>}),
    {ok, G} = call(<<"get_task">>, #{<<"task_id">> => <<"tt-1">>}),
    ?assertEqual(<<"do it">>, maps:get(<<"title">>, G)),
    ?assertEqual([], maps:get(<<"feedback">>, G)),
    {ok, U} = call(<<"update_task">>, #{<<"task_id">> => <<"TT-1">>, <<"title">> => <<"renamed">>, <<"description">> => <<"body">>}),
    ?assertEqual(<<"renamed">>, maps:get(<<"title">>, U)),
    ?assertEqual(<<"body">>, maps:get(<<"description">>, U)),
    {error, E1} = call(<<"create_task">>, #{<<"project_key">> => <<"ZZ">>, <<"title">> => <<"x">>}),
    ?assertMatch(<<"project not found", _/binary>>, E1),
    {error, E2} = call(<<"get_task">>, #{<<"task_id">> => <<"TT-9">>}),
    ?assertMatch(<<"not found", _/binary>>, E2),
    {error, E3} = call(<<"get_task">>, #{<<"task_id">> => <<"junk">>}),
    ?assertMatch(<<"invalid id: ", _/binary>>, E3).

transition_and_feedback() ->
    {ok, _} = call(<<"create_project">>, #{<<"key">> => <<"TF">>, <<"name">> => <<"t">>}),
    {ok, _} = call(<<"create_task">>, #{<<"project_key">> => <<"TF">>, <<"title">> => <<"x">>}),
    {error, E1} = call(<<"transition_task">>, #{<<"task_id">> => <<"TF-1">>, <<"to">> => <<"DONE">>}),
    ?assertEqual(<<"cannot move task from NEW to DONE; allowed next statuses: IN_PROGRESS, REJECTED, CANCELLED">>, E1),
    {ok, T1} = call(<<"transition_task">>, #{<<"task_id">> => <<"TF-1">>, <<"to">> => <<"in progress">>}),
    ?assertEqual(<<"IN_PROGRESS">>, maps:get(<<"status">>, T1)),
    {ok, F} = call(<<"add_feedback">>, #{<<"task_id">> => <<"tf-1">>, <<"content">> => <<"need input">>, <<"kind">> => <<"question">>}),
    ?assertEqual(<<"TF-1#1">>, maps:get(<<"id">>, F)),
    ?assertMatch(<<"agent-", _/binary>>, maps:get(<<"author">>, F)),
    {ok, #{<<"task_id">> := <<"TF-1">>, <<"feedback">> := [_]}} = call(<<"list_feedback">>, #{<<"task_id">> => <<"TF-1">>}),
    {ok, T2} = call(<<"transition_task">>, #{<<"task_id">> => <<"TF-1">>, <<"to">> => <<"DONE">>, <<"comment">> => <<"ok">>, <<"actor">> => <<"claude">>}),
    ?assertMatch(#{<<"actor">> := <<"claude">>, <<"comment">> := <<"ok">>}, hd(maps:get(<<"history">>, T2))),
    ?assertEqual(true, maps:get(<<"open_question">>, T2)),
    {error, E2} = call(<<"add_feedback">>, #{<<"task_id">> => <<"TF-1">>, <<"content">> => <<"">>}),
    ?assertMatch(<<"invalid content: ", _/binary>>, E2),
    {error, E3} = call(<<"transition_task">>, #{<<"task_id">> => <<"TF-1">>, <<"to">> => <<"CLOSED">>}),
    ?assertMatch(<<"invalid status: ", _/binary>>, E3),
    {error, E4} = call(<<"transition_task">>, #{<<"task_id">> => <<"TF-1">>}),
    ?assertMatch(<<"invalid arguments: ", _/binary>>, E4),
    {error, E5} = call(<<"update_feedback">>, #{<<"feedback_id">> => <<"TF-1#1">>, <<"content">> => <<"x">>, <<"author">> => <<"coxswain">>}),
    ?assertMatch(<<"only the original author (agent-", _/binary>>, E5),
    {ok, U} = call(<<"update_feedback">>, #{<<"feedback_id">> => <<"tf-1#1">>, <<"content">> => <<"need input: which db?">>}),
    ?assertEqual(<<"need input: which db?">>, maps:get(<<"content">>, U)),
    ?assertEqual(<<"TF-1#2">>, maps:get(<<"id">>, U)),
    ?assertEqual(<<"TF-1#1">>, maps:get(<<"supersedes">>, U)),
    {ok, #{<<"feedback">> := [#{<<"id">> := <<"TF-1#1">>, <<"status">> := <<"superseded">>}, #{<<"id">> := <<"TF-1#2">>, <<"status">> := <<"active">>}]}} =
        call(<<"list_feedback">>, #{<<"task_id">> => <<"TF-1">>}),
    {error, E7} = call(<<"update_feedback">>, #{<<"feedback_id">> => <<"tf-1#1">>, <<"content">> => <<"again">>}),
    ?assertMatch(<<"this feedback was already revised", _/binary>>, E7),
    %% 跨项目：keel 拒绝 coxswain 提的需求
    {ok, T3} = call(<<"create_task">>, #{<<"project_key">> => <<"TF">>, <<"title">> => <<"do X">>, <<"actor">> => <<"coxswain">>}),
    ?assertEqual(<<"coxswain">>, maps:get(<<"created_by">>, T3)),
    {ok, _} = call(<<"add_feedback">>, #{<<"task_id">> => <<"TF-2">>, <<"content">> => <<"X conflicts with Y">>, <<"kind">> => <<"review">>, <<"author">> => <<"keel">>}),
    {ok, T4} = call(<<"transition_task">>, #{<<"task_id">> => <<"TF-2">>, <<"to">> => <<"REJECTED">>, <<"actor">> => <<"keel">>, <<"comment">> => <<"see TF-2#1">>}),
    ?assertEqual(<<"REJECTED">>, maps:get(<<"status">>, T4)),
    {error, E6} = call(<<"transition_task">>, #{<<"task_id">> => <<"TF-2">>, <<"to">> => <<"DONE">>}),
    ?assertEqual(<<"cannot move task from REJECTED to DONE; allowed next statuses: NEW">>, E6),
    %% 完成证据 + 自验收规则（通过 MCP 参数）
    {ok, T5} = call(<<"create_task">>, #{<<"project_key">> => <<"TF">>, <<"title">> => <<"evidence">>, <<"actor">> => <<"coxswain">>}),
    {ok, T6} = call(<<"transition_task">>, #{<<"task_id">> => maps:get(<<"id">>, T5), <<"to">> => <<"IN_PROGRESS">>, <<"actor">> => <<"keel/x">>}),
    ?assertEqual(<<"keel/x">>, maps:get(<<"assignee">>, T6)),
    {ok, T7} = call(<<"transition_task">>, #{<<"task_id">> => <<"TF-3">>, <<"to">> => <<"DONE">>, <<"actor">> => <<"keel/x">>,
                                            <<"commits">> => [<<"abc1234">>], <<"tests">> => #{<<"command">> => <<"make test">>, <<"passed">> => true, <<"summary">> => <<"ok">>}}),
    ?assertEqual([<<"abc1234">>], maps:get(<<"commits">>, T7)),
    {ok, T8} = call(<<"transition_task">>, #{<<"task_id">> => <<"TF-3">>, <<"to">> => <<"VERIFIED">>, <<"actor">> => <<"keel/x">>}),
    ?assertEqual(<<"VERIFIED">>, maps:get(<<"status">>, T8)),
    {ok, _} = call(<<"transition_task">>, #{<<"task_id">> => <<"TF-3">>, <<"to">> => <<"IN_PROGRESS">>, <<"actor">> => <<"keel/x">>}),
    {ok, _} = call(<<"transition_task">>, #{<<"task_id">> => <<"TF-3">>, <<"to">> => <<"DONE">>, <<"actor">> => <<"keel/x">>}),
    {error, E8} = call(<<"transition_task">>, #{<<"task_id">> => <<"TF-3">>, <<"to">> => <<"VERIFIED">>, <<"actor">> => <<"keel/x">>}),
    ?assertMatch(<<"the assignee (keel/x) may verify their own work only after running the tests", _/binary>>, E8),
    {error, E9} = call(<<"transition_task">>, #{<<"task_id">> => <<"TF-3">>, <<"to">> => <<"VERIFIED">>, <<"actor">> => <<"keel/x">>, <<"commits">> => [<<"zzz">>]}),
    ?assertMatch(<<"invalid commits", _/binary>>, E9),
    %% 撤销：不做了，不是拒绝
    {ok, T4b} = call(<<"create_task">>, #{<<"project_key">> => <<"TF">>, <<"title">> => <<"obsolete">>, <<"actor">> => <<"coxswain">>}),
    {ok, T4c} = call(<<"transition_task">>, #{<<"task_id">> => maps:get(<<"id">>, T4b), <<"to">> => <<"CANCELLED">>, <<"actor">> => <<"coxswain">>, <<"comment">> => <<"no longer needed">>}),
    ?assertEqual(<<"CANCELLED">>, maps:get(<<"status">>, T4c)),
    {ok, #{<<"tasks">> := [#{<<"status">> := <<"CANCELLED">>}]}} = call(<<"query_tasks">>, #{<<"bql">> => <<"project = TF AND status = CANCELLED">>}).

error_texts() ->
    ?assertEqual(<<"cannot move task from VERIFIED to DONE; allowed next statuses: IN_PROGRESS">>,
                 bosun_mcp:error_to_text({invalid_transition, verified, done})),
    ?assertEqual(<<"invalid key: bad">>, bosun_mcp:error_to_text({invalid, key, <<"bad">>})),
    ?assertMatch(<<"project is archived", _/binary>>, bosun_mcp:error_to_text({project, archived})),
    ?assertEqual(<<"{something,other}">>, bosun_mcp:error_to_text({something, other})).

resources_and_prompt() ->
    {ok, _} = call(<<"create_project">>, #{<<"key">> => <<"RP">>, <<"name">> => <<"r">>}),
    {ok, _} = call(<<"create_task">>, #{<<"project_key">> => <<"RP">>, <<"title">> => <<"x">>}),
    [Projects, _Bql, Workflow] = bosun_mcp:resources(),
    {ok, Json} = (Projects#mcp_resource.handler)(),
    ?assertMatch(#{<<"projects">> := [#{<<"key">> := <<"RP">>}]}, json:decode(Json)),
    {ok, Md} = (Workflow#mcp_resource.handler)(),
    ?assertMatch({_, _}, binary:match(Md, <<"IN_PROGRESS">>)),
    ?assertMatch({_, _}, binary:match(Md, <<"REJECTED">>)),
    ?assertEqual(bosun_workflow:doc(en), {ok, Md}),
    [Prompt] = bosun_mcp:prompts(),
    {ok, [#{<<"role">> := <<"user">>, <<"content">> := #{<<"text">> := Text}}]} =
        (Prompt#mcp_prompt.handler)(#{<<"task_id">> => <<"rp-1">>}),
    ?assertMatch({_, _}, binary:match(Text, <<"\"id\":\"RP-1\"">>)),
    ?assertMatch({_, _}, binary:match(Text, <<"self_verify_requires_tests">>)),
    {error, _} = (Prompt#mcp_prompt.handler)(#{<<"task_id">> => <<"RP-9">>}).

query_and_filters() ->
    {ok, _} = call(<<"create_project">>, #{<<"key">> => <<"QF">>, <<"name">> => <<"q">>}),
    {ok, _} = call(<<"create_task">>, #{<<"project_key">> => <<"QF">>, <<"title">> => <<"one">>, <<"labels">> => [<<"x">>]}),
    {ok, _} = call(<<"create_task">>, #{<<"project_key">> => <<"QF">>, <<"title">> => <<"two">>}),
    {ok, #{<<"tasks">> := [#{<<"id">> := <<"QF-1">>}], <<"total">> := 1}} =
        call(<<"query_tasks">>, #{<<"bql">> => <<"project = qf and labels = x">>}),
    {error, E} = call(<<"query_tasks">>, #{<<"bql">> => <<"nope = 1">>}),
    ?assertEqual(<<"invalid query: unknown field 'nope'">>, E),
    {ok, F} = call(<<"save_filter">>, #{<<"name">> => <<"mine">>, <<"bql">> => <<"status = new">>}),
    Id = maps:get(<<"id">>, F),
    {ok, #{<<"filters">> := [#{<<"id">> := Id}]}} = call(<<"list_filters">>, #{}),
    {ok, #{<<"query">> := <<"status = done">>}} = call(<<"save_filter">>, #{<<"name">> => <<"mine">>, <<"bql">> => <<"status = done">>, <<"filter_id">> => Id}),
    {ok, #{<<"deleted">> := Id}} = call(<<"delete_filter">>, #{<<"filter_id">> => Id}),
    {error, _} = call(<<"delete_filter">>, #{<<"filter_id">> => Id}).

%% 在独立进程里跑一段「会话」（tool handler 以 self() 区分会话）
in_session(Fun) ->
    Parent = self(),
    Pid = spawn_link(fun() -> Parent ! {self(), Fun()} end),
    receive {Pid, R} -> R after 5000 -> error(timeout) end.

session_identity() ->
    {ok, _} = call(<<"create_project">>, #{<<"key">> => <<"ID">>, <<"name">> => <<"i">>}),
    %% 两个会话各自 identify，互不影响
    {ok, T1} = in_session(fun() ->
        {ok, Me} = call(<<"identify">>, #{<<"name">> => <<"keel/wt1">>, <<"project">> => <<"keel">>, <<"worktree">> => <<"~/wt1">>}),
        ?assertMatch(#{<<"name">> := <<"keel/wt1">>, <<"kind">> := <<"agent">>, <<"project">> := <<"KEEL">>, <<"identified">> := true}, Me),
        {ok, #{<<"name">> := <<"keel/wt1">>}} = call(<<"whoami">>, #{}),
        call(<<"create_task">>, #{<<"project_key">> => <<"ID">>, <<"title">> => <<"from wt1">>})
    end),
    ?assertEqual(<<"keel/wt1">>, maps:get(<<"created_by">>, T1)),
    ?assertEqual(<<"agent">>, maps:get(<<"created_by_kind">>, T1)),
    {ok, T2} = in_session(fun() ->
        {ok, _} = call(<<"identify">>, #{<<"name">> => <<"keel/wt2">>, <<"kind">> => <<"agent">>}),
        call(<<"create_task">>, #{<<"project_key">> => <<"ID">>, <<"title">> => <<"from wt2">>})
    end),
    ?assertEqual(<<"keel/wt2">>, maps:get(<<"created_by">>, T2)),
    ?assertEqual(error, maps:find(<<"_notice">>, T2)),
    %% 没 identify 的会话：自动名，且同一会话内稳定、不同会话不同
    {A1, A2} = in_session(fun() ->
        {ok, #{<<"name">> := N1, <<"identified">> := false}} = call(<<"whoami">>, #{}),
        {ok, T} = call(<<"create_task">>, #{<<"project_key">> => <<"ID">>, <<"title">> => <<"anon">>}),
        ?assertMatch(<<"this session is not identified", _/binary>>, maps:get(<<"_notice">>, T)),
        {N1, maps:get(<<"created_by">>, T)}
    end),
    ?assertEqual(A1, A2),
    ?assertMatch(<<"agent-", _/binary>>, A1),
    {ok, #{<<"name">> := A3}} = in_session(fun() -> call(<<"whoami">>, #{}) end),
    ?assertNotEqual(A1, A3),
    %% 显式 actor 参数仍然优先
    {ok, T4} = in_session(fun() ->
        {ok, _} = call(<<"identify">>, #{<<"name">> => <<"keel/wt3">>}),
        call(<<"create_task">>, #{<<"project_key">> => <<"ID">>, <<"title">> => <<"on behalf">>, <<"actor">> => <<"coxswain">>})
    end),
    ?assertEqual(<<"coxswain">>, maps:get(<<"created_by">>, T4)),
    %% 人类身份
    {ok, T5} = in_session(fun() ->
        {ok, _} = call(<<"identify">>, #{<<"name">> => <<"david">>, <<"kind">> => <<"human">>}),
        call(<<"create_task">>, #{<<"project_key">> => <<"ID">>, <<"title">> => <<"human">>})
    end),
    ?assertEqual(<<"human">>, maps:get(<<"created_by_kind">>, T5)),
    {ok, #{<<"actors">> := Actors}} = call(<<"list_actors">>, #{}),
    ?assert(lists:member(<<"keel/wt1">>, [maps:get(<<"name">>, A) || A <- Actors])),
    {error, E} = call(<<"identify">>, #{<<"name">> => <<" ">>}),
    ?assertMatch(<<"invalid name", _/binary>>, E).

%% 会话绑了 API key 的主人（bosun_web_auth 每个请求做的事）：whoami 带 user，
%% 工具只看该组织的数据；identify 不覆盖 user
bound_user_scope() ->
    {A, B} = {register_org(<<"Acme">>, <<"alice@acme.io">>, <<"Alice">>),
              register_org(<<"Beta">>, <<"bob@beta.io">>, <<"Bob">>)},
    {ok, #{<<"key">> := <<"ACM">>}} = in_session(fun() ->
        bosun_identity:bind(self(), A),
        {ok, #{<<"identified">> := false, <<"user">> := #{<<"name">> := <<"Alice">>, <<"email">> := <<"alice@acme.io">>}}} = call(<<"whoami">>, #{}),
        {ok, #{<<"identified">> := true, <<"name">> := <<"acme/wt">>, <<"user">> := #{<<"name">> := <<"Alice">>}}} =
            call(<<"identify">>, #{<<"name">> => <<"acme/wt">>}),
        {ok, #{<<"key">> := <<"ACM">>}} = call(<<"create_project">>, #{<<"key">> => <<"ACM">>, <<"name">> => <<"Acme">>}),
        {ok, #{<<"created_by">> := <<"acme/wt">>}} = call(<<"create_task">>, #{<<"project_key">> => <<"ACM">>, <<"title">> => <<"secret">>}),
        %% Agent 记在 key 主人名下
        {ok, #{<<"actors">> := As}} = call(<<"list_actors">>, #{}),
        ?assertMatch([_], [x || #{<<"name">> := <<"acme/wt">>, <<"user_id">> := U} <- As, U =:= maps:get(user_id, A)]),
        call(<<"get_project">>, #{<<"key">> => <<"ACM">>})
    end),
    in_session(fun() ->
        bosun_identity:bind(self(), B),
        {ok, #{<<"projects">> := []}} = call(<<"list_projects">>, #{}),
        {error, E1} = call(<<"get_task">>, #{<<"task_id">> => <<"ACM-1">>}),
        ?assertMatch(<<"not found", _/binary>>, E1),
        {error, E2} = call(<<"create_task">>, #{<<"project_key">> => <<"ACM">>, <<"title">> => <<"x">>}),
        ?assertMatch(<<"project not found", _/binary>>, E2),
        {ok, #{<<"tasks">> := []}} = call(<<"query_tasks">>, #{<<"bql">> => <<"project = ACM">>}),
        {error, E3} = call(<<"create_project">>, #{<<"key">> => <<"ACM">>, <<"name">> => <<"mine">>}),
        ?assertMatch(<<"project key already exists", _/binary>>, E3),
        %% 资源也按组织
        [Res | _] = bosun_mcp:resources(),
        {ok, Json} = (element(#mcp_resource.handler, Res))(),
        ?assertMatch(#{<<"projects">> := []}, json:decode(Json))
    end),
    ok.

register_org(OrgName, Email, Name) ->
    {ok, _} = bosun_org:request_code(Email),
    {ok, Code} = bosun_email_code:peek(Email),
    {ok, #{<<"user">> := #{<<"id">> := Uid}}} =
        bosun_org:register(#{<<"org_name">> => OrgName, <<"email">> => Email, <<"code">> => Code,
                             <<"name">> => Name, <<"password">> => <<"secret123">>}),
    {ok, P} = bosun_user:principal(Uid, #{via => api_key}),
    P.

epics() ->
    {ok, _} = call(<<"create_project">>, #{<<"key">> => <<"EM">>, <<"name">> => <<"e">>}),
    {ok, #{<<"id">> := <<"EM-1">>, <<"kind">> := <<"epic">>}} =
        call(<<"create_task">>, #{<<"project_key">> => <<"EM">>, <<"title">> => <<"goal">>, <<"kind">> => <<"epic">>}),
    {ok, #{<<"epic">> := <<"EM-1">>}} =
        call(<<"create_task">>, #{<<"project_key">> => <<"EM">>, <<"title">> => <<"step">>, <<"epic">> => <<"EM-1">>}),
    {ok, #{<<"kind">> := <<"task">>, <<"epic">> := null}} =
        call(<<"create_task">>, #{<<"project_key">> => <<"EM">>, <<"title">> => <<"loose">>}),
    {ok, #{<<"children">> := [#{<<"id">> := <<"EM-2">>}], <<"progress">> := #{<<"total">> := 1}}} =
        call(<<"get_task">>, #{<<"task_id">> => <<"EM-1">>}),
    {ok, #{<<"tasks">> := [#{<<"id">> := <<"EM-2">>}]}} = call(<<"list_tasks">>, #{<<"project_key">> => <<"EM">>, <<"epic">> => <<"EM-1">>}),
    {ok, #{<<"tasks">> := [#{<<"id">> := <<"EM-1">>}]}} = call(<<"list_tasks">>, #{<<"project_key">> => <<"EM">>, <<"kind">> => <<"epic">>}),
    {ok, #{<<"epic">> := <<"EM-1">>}} = call(<<"update_task">>, #{<<"task_id">> => <<"EM-3">>, <<"epic">> => <<"EM-1">>}),
    {error, E} = call(<<"create_task">>, #{<<"project_key">> => <<"EM">>, <<"title">> => <<"x">>, <<"epic">> => <<"EM-2">>}),
    ?assertEqual(<<"invalid epic: EM-2 is not an epic">>, E).

links() ->
    {ok, _} = call(<<"create_project">>, #{<<"key">> => <<"LK">>, <<"name">> => <<"l">>}),
    {ok, _} = call(<<"create_task">>, #{<<"project_key">> => <<"LK">>, <<"title">> => <<"base">>}),
    {ok, _} = call(<<"create_task">>, #{<<"project_key">> => <<"LK">>, <<"title">> => <<"needs base">>}),
    {ok, _} = call(<<"create_task">>, #{<<"project_key">> => <<"LK">>, <<"title">> => <<"old">>}),
    {ok, #{<<"blocked">> := true, <<"links">> := [#{<<"type">> := <<"depends_on">>, <<"direction">> := <<"out">>, <<"task">> := <<"LK-1">>, <<"title">> := <<"base">>}]}} =
        call(<<"link_tasks">>, #{<<"from">> => <<"LK-2">>, <<"to">> => <<"LK-1">>, <<"type">> => <<"depends_on">>}),
    {error, E1} = call(<<"transition_task">>, #{<<"task_id">> => <<"LK-2">>, <<"to">> => <<"IN_PROGRESS">>}),
    ?assertMatch(<<"task is blocked by unfinished dependencies: LK-1", _/binary>>, E1),
    {error, E2} = call(<<"link_tasks">>, #{<<"from">> => <<"LK-1">>, <<"to">> => <<"LK-2">>, <<"type">> => <<"depends_on">>}),
    ?assertEqual(<<"dependency cycle: LK-1 -> LK-2 -> LK-1">>, E2),
    {ok, #{<<"links">> := [#{<<"type">> := <<"depends_on">>, <<"task">> := <<"LK-1">>},
                           #{<<"type">> := <<"replaces">>, <<"task">> := <<"LK-3">>, <<"status">> := <<"CANCELLED">>}]}} =
        call(<<"link_tasks">>, #{<<"from">> => <<"LK-2">>, <<"to">> => <<"LK-3">>, <<"type">> => <<"replaces">>}),
    {ok, #{<<"links">> := [#{<<"direction">> := <<"in">>, <<"type">> := <<"replaces">>, <<"task">> := <<"LK-2">>}]}} =
        call(<<"get_task">>, #{<<"task_id">> => <<"LK-3">>}),
    {ok, #{<<"blocked">> := false, <<"links">> := [_]}} =
        call(<<"unlink_tasks">>, #{<<"from">> => <<"LK-2">>, <<"to">> => <<"LK-1">>, <<"type">> => <<"depends_on">>}),
    {error, E3} = call(<<"unlink_tasks">>, #{<<"from">> => <<"LK-2">>, <<"to">> => <<"LK-1">>, <<"type">> => <<"depends_on">>}),
    ?assertMatch(<<"not found", _/binary>>, E3),
    {ok, #{<<"tasks">> := [#{<<"id">> := <<"LK-2">>}]}} = call(<<"query_tasks">>, #{<<"bql">> => <<"replaces = LK-3">>}).
