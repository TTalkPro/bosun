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
                       ++ bosun_mcp_milestone_tools:tools()
                       ++ bosun_mcp_feedback_tools:tools()
                       ++ bosun_mcp_query_tools:tools()].

%% 工具 / 资源 / 提示都在会话进程里执行：调用前把该会话绑定的主体（API key 的主人）设成
%% 数据作用域，并检查 key 的 scopes。系统作用域（纯领域测试 / shell）保持原行为。
scoped(#mcp_tool{handler = Handler} = Tool) ->
    Name = Tool#mcp_tool.name,
    Tool#mcp_tool{handler = fun(Args) ->
        P = bosun_identity:principal(),
        bosun_scope:set(P),
        case {authorize_tool(Name, P), actor_override(Name, Args, P)} of
            {ok, ok} -> Handler(Args);
            {Error, _} when Error =/= ok -> Error;
            {_, Error} when Error =/= ok -> Error
        end
    end};
scoped(#mcp_resource{handler = Handler} = Res) ->
    Res#mcp_resource{handler = fun() ->
        P = bosun_identity:principal(),
        bosun_scope:set(P),
        case authorize_tool(<<"resource">>, P) of
            ok -> Handler();
            Error -> Error
        end
    end};
scoped(#mcp_prompt{handler = Handler} = Prompt) ->
    Prompt#mcp_prompt{handler = fun(Args) ->
        P = bosun_identity:principal(),
        bosun_scope:set(P),
        case authorize_tool(<<"resource">>, P) of
            ok -> Handler(Args);
            Error -> Error
        end
    end}.

%% Key scope 模型：read 是所有可见性入口，write 覆盖任务协作，manage 覆盖项目与 filter。
authorize_tool(_Name, undefined) -> ok;
authorize_tool(Name, P) ->
    Scope = case Name of
        <<"identify">> -> none;
        <<"whoami">> -> none;
        <<"list_actors">> -> <<"read">>;
        <<"list_projects">> -> <<"read">>;
        <<"get_project">> -> <<"read">>;
        <<"create_project">> -> <<"manage">>;
        <<"update_project">> -> <<"manage">>;
        <<"list_tasks">> -> <<"read">>;
        <<"search_tasks">> -> <<"read">>;
        <<"get_task">> -> <<"read">>;
        <<"create_task">> -> <<"write">>;
        <<"update_task">> -> <<"write">>;
        <<"transition_task">> -> <<"write">>;
        <<"link_tasks">> -> <<"write">>;
        <<"unlink_tasks">> -> <<"write">>;
        %% milestone（14）：看 = read；把任务排进 / 移出 = 任务协作（write）；milestone 本身 = manage
        <<"list_milestones">> -> <<"read">>;
        <<"get_milestone">> -> <<"read">>;
        <<"assign_milestone">> -> <<"write">>;
        <<"create_milestone">> -> <<"manage">>;
        <<"update_milestone">> -> <<"manage">>;
        <<"transition_milestone">> -> <<"manage">>;
        <<"add_feedback">> -> <<"write">>;
        <<"update_feedback">> -> <<"write">>;
        <<"list_feedback">> -> <<"read">>;
        <<"query_tasks">> -> <<"read">>;
        <<"list_filters">> -> <<"read">>;
        <<"save_filter">> -> <<"manage">>;
        <<"delete_filter">> -> <<"manage">>;
        _ -> <<"read">>
    end,
    case Scope =:= none orelse principal_has_scope(Scope, P) of
        true -> ok;
        false -> {error, error_to_text({forbidden_scope, Scope})}
    end.

principal_has_scope(_Scope, #{scopes := undefined}) -> true;
principal_has_scope(Scope, #{scopes := Scopes}) when is_list(Scopes) ->
    lists:member(<<"*">>, Scopes) orelse lists:member(Scope, Scopes).

%% 已绑定 API key 的会话不能再用 actor / author 冒名；系统作用域保留脚本兼容。
actor_override(Name, Args, undefined) ->
    _ = Name,
    _ = Args,
    ok;
actor_override(<<"identify">>, _Args, _P) -> ok;
actor_override(_Name, Args, _P) ->
    case maps:is_key(<<"actor">>, Args) orelse maps:is_key(<<"author">>, Args) of
        true -> {error, error_to_text(forbidden_actor_override)};
        false -> ok
    end.

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
                              (milestone_hint(Task))/binary,
                              "```json\n", (bosun_json:encode(Task))/binary, "\n```\n\n",
                              Doc/binary,
                              "\nStart by moving the task to IN_PROGRESS, then do the work.">>,
                     {ok, [#{<<"role">> => <<"user">>,
                             <<"content">> => #{<<"type">> => <<"text">>, <<"text">> => Text}}]};
                 {error, R} -> {error, error_to_text(R)}
             end
         end)].

%% 提示词里一句话交代任务在哪次发布里：在当前进行中的就照常做；不在的话提醒先看当前 milestone
milestone_hint(#{<<"project_key">> := Key} = Task) ->
    Active = case bosun_milestone:active(Key) of
                 {ok, A} -> A;
                 none -> undefined
             end,
    case {maps:get(<<"milestone">>, Task, undefined), Active} of
        {M, M} when M =/= undefined ->
            <<"It belongs to the active milestone ", (name(M))/binary, " (the current release).\n\n">>;
        {undefined, undefined} -> <<>>;
        {undefined, _} ->
            <<"It is not scheduled in any milestone; the current release is ", (name(Active))/binary,
              ". Prefer tasks of the active milestone unless you were asked to do this one.\n\n">>;
        {M, _} ->
            <<"It belongs to milestone ", (name(M))/binary, ", which is not the active one.\n\n">>
    end;
milestone_hint(_) -> <<>>.

name(Id) ->
    case bosun_milestone:name_of(Id) of
        undefined -> Id;
        N -> <<N/binary, " (", Id/binary, ")">>
    end.

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
error_to_text({conflict, active_exists, Other}) ->
    <<"the project already has an active milestone (", Other/binary,
      "); release or pause it first (transition_milestone), or put the tasks into that one">>;
error_to_text({milestone_state, Status, Action}) ->
    <<"cannot ", (atom_to_binary(Action, utf8))/binary, " a ", (atom_to_binary(Status, utf8))/binary,
      " milestone; activate: planning -> active, pause: active -> planning, release: active -> released, reopen: released -> active">>;
error_to_text({unfinished, Ids}) ->
    <<"cannot release: ", (integer_to_binary(length(Ids)))/binary, " task(s) are not finished (",
      (iolist_to_binary(lists:join(<<", ">>, Ids)))/binary,
      "); finish them (transition_task to DONE) or move them out (assign_milestone to another milestone, or \"\" for the backlog) first">>;
error_to_text(not_empty) ->
    <<"the milestone still has tasks; move them out (assign_milestone with milestone=\"\") before deleting">>;
error_to_text({conflict, name}) ->
    <<"a milestone with this name already exists in the project; use list_milestones">>;
error_to_text({invalid, milestone, Why}) ->
    <<"invalid milestone: ", (bosun_util:to_binary(Why))/binary,
      "; list_milestones shows the planning / active ones you can use (or pass \"\" for the backlog)">>;
error_to_text({conflict, key}) ->
    <<"project key already exists; pick another key or use get_project">>;
error_to_text({invalid, Field, Why}) ->
    <<"invalid ", (bosun_util:to_binary(Field))/binary, ": ", (bosun_util:to_binary(Why))/binary>>;
error_to_text({forbidden_scope, Scope}) ->
    <<"forbidden_scope: this API key lacks the ", Scope/binary,
      " scope; create another key with the required permission">>;
error_to_text(forbidden_actor_override) ->
    <<"forbidden_actor_override: this API key cannot pass actor or author; call identify once and omit those arguments">>;
error_to_text({invalid_transition, From, To}) ->
    Allowed = [bosun_task_status:to_binary(S) || S <- bosun_task_status:next_statuses(From)],
    AllowedTxt = case Allowed of
                     [] -> <<"none">>;
                     _ -> iolist_to_binary(lists:join(<<", ">>, Allowed))
                 end,
    <<"cannot move task from ", (bosun_task_status:to_binary(From))/binary,
      " to ", (bosun_task_status:to_binary(To))/binary,
      "; allowed next statuses: ", AllowedTxt/binary>>;
error_to_text(epic_children_incomplete) ->
    <<"epic_children_incomplete: all active steps must be DONE or VERIFIED before the epic can be completed; "
      "cancelled steps are excluded">>;
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
