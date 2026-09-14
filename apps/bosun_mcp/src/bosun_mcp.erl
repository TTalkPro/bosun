%%%-------------------------------------------------------------------
%%% @doc MCP 门面：汇总工具 / 资源 / 提示，并定义领域结果 → MCP 返回的翻译。
%%% 设计见 designs/05-mcp-server.md。
%%%-------------------------------------------------------------------
-module(bosun_mcp).

-include_lib("beamai_mcp/include/beamai_mcp.hrl").

-export([tools/0, resources/0, prompts/0, server_info/0, cowboy_config/0]).
-export([reply/1, error_to_text/1, actor/1, actor_kind/1, obj/1, str/1, arr/1, enum/2, bool/1, int/1, nested/2]).

%%====================================================================
%% 目录
%%====================================================================

-spec tools() -> [tuple()].
tools() ->
    [scoped(T) || T <- bosun_mcp_identity_tools:tools()
                       ++ bosun_mcp_project_tools:tools()
                       ++ bosun_mcp_task_tools:tools()
                       ++ bosun_mcp_feedback_tools:tools()
                       ++ bosun_mcp_query_tools:tools()].

%% 工具 / 资源 / 提示都在会话进程里执行：调用前把该会话绑定的主体（API key 的主人）设成数据作用域
scoped(#mcp_tool{handler = Handler} = Tool) ->
    Tool#mcp_tool{handler = fun(Args) -> bosun_scope:set(bosun_identity:principal()), Handler(Args) end};
scoped(#mcp_resource{handler = Handler} = Res) ->
    Res#mcp_resource{handler = fun() -> bosun_scope:set(bosun_identity:principal()), Handler() end};
scoped(#mcp_prompt{handler = Handler} = Prompt) ->
    Prompt#mcp_prompt{handler = fun(Args) -> bosun_scope:set(bosun_identity:principal()), Handler(Args) end}.

-spec resources() -> [tuple()].
resources() ->
    [scoped(R) || R <- resources0()].

resources0() ->
    [beamai_mcp_types:make_resource(
         <<"bosun://projects">>, <<"projects">>, undefined,
         <<"All active (non-archived) projects as JSON">>, <<"application/json">>,
         fun() ->
             {ok, Ps} = bosun_project:list(#{}),
             {ok, bosun_json:encode(#{<<"projects">> => Ps})}
         end),
     beamai_mcp_types:make_resource(
         <<"bosun://bql">>, <<"bql">>, undefined,
         <<"BQL (Bosun Query Language) reference: fields, operators, examples">>, <<"text/markdown">>,
         fun() -> {ok, bosun_mcp_query_tools:bql_doc()} end),
     beamai_mcp_types:make_resource(
         <<"bosun://workflow">>, <<"workflow">>, undefined,
         <<"Task status workflow and the recommended agent procedure">>, <<"text/markdown">>,
         fun() -> bosun_workflow:doc(en) end)].

-spec prompts() -> [tuple()].
prompts() ->
    [scoped(P) || P <- prompts0()].

prompts0() ->
    [beamai_mcp_types:make_prompt(
         <<"work_on_task">>,
         <<"Load a task's full context and the workflow instructions to start working on it">>,
         [beamai_mcp_types:make_prompt_arg(<<"task_id">>, <<"Task id, e.g. BOS-12">>, true)],
         fun(Args) ->
             case bosun_task:get(maps:get(<<"task_id">>, Args, <<>>)) of
                 {ok, Task} ->
                     {ok, Doc} = bosun_workflow:doc(en),
                     Text = <<"You are working on the following Bosun task.\n\n",
                              "```json\n", (bosun_json:encode(Task))/binary, "\n```\n\n",
                              Doc/binary,
                              "\nStart by moving the task to IN_PROGRESS, then do the work.">>,
                     {ok, [#{<<"role">> => <<"user">>,
                             <<"content">> => #{<<"type">> => <<"text">>, <<"text">> => Text}}]};
                 {error, R} -> {error, error_to_text(R)}
             end
         end)].

-spec server_info() -> map().
server_info() ->
    Vsn = case application:get_key(bosun_mcp, vsn) of
              {ok, V} -> bosun_util:to_binary(V);
              undefined -> <<"dev">>
          end,
    #{<<"name">> => <<"bosun">>, <<"version">> => Vsn}.

%% @doc 直接塞给 beamai_mcp_cowboy_handler 的初始状态。
-spec cowboy_config() -> map().
cowboy_config() ->
    #{tools => tools(), resources => resources(), prompts => prompts(),
      server_info => server_info()}.

%%====================================================================
%% 结果翻译
%%====================================================================

%% @doc 领域结果 → 工具返回。成功给 JSON 文本；失败给面向 Agent 的一句话。
-spec reply({ok, term()} | {error, term()}) -> {ok, [map()]} | {error, binary()}.
reply({ok, Value}) -> {ok, [beamai_mcp_types:text_content(bosun_json:encode(with_identity_notice(Value)))]};
reply({error, Reason}) -> {error, error_to_text(Reason)}.

%% 会话没 identify（比如服务重启后客户端静默重连）时，在写结果里带一句提醒，
%% 免得 Agent 一直用 agent-xxxx 这种自动名干活而不自知。
with_identity_notice(Value) when is_map(Value) ->
    case bosun_identity:lookup(self()) of
        {ok, #{explicit := true}} -> Value;
        _ ->
            Name = maps:get(name, bosun_identity:current()),
            Value#{<<"_notice">> => <<"this session is not identified; acting as ", Name/binary,
                                      ". Call identify(name, kind, project) first (again after a server restart).">>}
    end;
with_identity_notice(Value) -> Value.

-spec error_to_text(term()) -> binary().
error_to_text(not_found) ->
    <<"not found; use list_projects / list_tasks to discover valid keys and ids">>;
error_to_text({project, not_found}) ->
    <<"project not found; use list_projects to see available project keys">>;
error_to_text({project, archived}) ->
    <<"project is archived; tasks cannot be created in it (update_project archived=false to reopen)">>;
error_to_text({forbidden, Author}) ->
    <<"only the original author (", Author/binary, ") can revise this feedback; add a new feedback instead">>;
error_to_text({superseded, By}) ->
    <<"this feedback was already revised; edit the latest version ", By/binary, " instead">>;
error_to_text({self_verify_requires_tests, Assignee}) ->
    <<"the assignee (", Assignee/binary, ") may verify their own work only after running the tests: "
      "pass tests={command, passed: true, summary} on the DONE transition or on this VERIFIED call, "
      "or ask the requester to verify">>;
error_to_text({blocked, Blockers}) ->
    <<"task is blocked by unfinished dependencies: ", (iolist_to_binary(lists:join(<<", ">>, Blockers)))/binary,
      "; finish (DONE / VERIFIED) those first, or unlink_tasks if the dependency is wrong">>;
error_to_text({cycle, Path}) ->
    <<"dependency cycle: ", (iolist_to_binary(lists:join(<<" -> ">>, Path)))/binary>>;
error_to_text(search_unavailable) ->
    <<"search index is not available; use list_tasks with query instead">>;
error_to_text({conflict, key}) ->
    <<"project key already exists; pick another key or use get_project">>;
error_to_text({invalid, Field, Why}) ->
    <<"invalid ", (bosun_util:to_binary(Field))/binary, ": ", (bosun_util:to_binary(Why))/binary>>;
error_to_text({invalid_transition, From, To}) ->
    Allowed = [bosun_task_status:to_binary(S) || S <- bosun_task_status:next_statuses(From)],
    AllowedTxt = case Allowed of
                     [] -> <<"none">>;
                     _ -> iolist_to_binary(lists:join(<<", ">>, Allowed))
                 end,
    <<"cannot move task from ", (bosun_task_status:to_binary(From))/binary,
      " to ", (bosun_task_status:to_binary(To))/binary,
      "; allowed next statuses: ", AllowedTxt/binary>>;
error_to_text(Other) ->
    iolist_to_binary(io_lib:format("~p", [Other])).

%% @doc 操作者：工具参数 `actor' / `author' > 会话身份（identify）> 自动名。
-spec actor(map()) -> binary().
actor(Args) ->
    case bosun_util:get_bin(<<"actor">>, Args, bosun_util:get_bin(<<"author">>, Args, <<>>)) of
        <<>> -> maps:get(name, bosun_identity:current());
        A -> A
    end.

%% @doc 操作者类型：显式给了 actor 参数时不猜（交给 actor 表按名字）；否则用会话身份的 kind。
-spec actor_kind(map()) -> binary() | undefined.
actor_kind(Args) ->
    case bosun_util:get_bin(<<"actor">>, Args, bosun_util:get_bin(<<"author">>, Args, <<>>)) of
        <<>> -> atom_to_binary(maps:get(kind, bosun_identity:current()), utf8);
        _ -> undefined
    end.

%%====================================================================
%% JSON Schema 小助手
%%====================================================================

obj(Props) -> #{type => object, properties => maps:from_list(Props)}.
%% 嵌套对象 schema（给 tests 用）
nested(Props, Desc) -> (obj(Props))#{description => Desc}.
str(Desc) -> #{type => string, description => Desc}.
arr(Desc) -> #{type => array, items => #{type => string}, description => Desc}.
enum(Values, Desc) -> #{type => string, enum => Values, description => Desc}.
bool(Desc) -> #{type => boolean, description => Desc}.
int(Desc) -> #{type => integer, description => Desc}.
