%%%-------------------------------------------------------------------
%%% @doc 会话身份工具：identify / whoami / list_actors（designs/11-identity.md）。
%%%-------------------------------------------------------------------
-module(bosun_mcp_identity_tools).

-export([tools/0]).

-import(bosun_mcp, [reply/1, obj/1, str/1, enum/2]).

tools() ->
    [identify(), whoami(), list_actors()].

identify() ->
    Schema = (obj([
        {name, str(<<"Your stable identity for this session, e.g. \"keel/feature-search\" (<project key>/<worktree or purpose>). Different worktrees of the same project must use different names.">>)},
        {kind, enum([<<"agent">>, <<"human">>], <<"agent (default) or human">>)},
        {project, str(<<"Project key you are working in (optional)">>)},
        {worktree, str(<<"Worktree path or branch, for humans reading the history (optional)">>)}
    ]))#{required => [<<"name">>]},
    beamai_mcp_types:make_tool(
        <<"identify">>,
        <<"Call once at the start of a session to tell Bosun who you are. Every later write (create_task, transition_task, add_feedback, ...) is recorded under this name unless you pass actor/author explicitly. Without identify you get an auto-generated name like agent-1a2b3c.">>,
        Schema,
        fun(Args) ->
            case bosun_identity:identify(Args) of
                {ok, Id} -> reply({ok, bosun_identity:to_map(Id)});
                E -> reply(E)
            end
        end).

whoami() ->
    beamai_mcp_types:make_tool(
        <<"whoami">>,
        <<"Return the identity Bosun currently uses for this session (name, kind, project, worktree, and whether it was set via identify).">>,
        obj([]),
        fun(_) -> reply({ok, bosun_identity:to_map(bosun_identity:current())}) end).

list_actors() ->
    beamai_mcp_types:make_tool(
        <<"list_actors">>,
        <<"List every actor (human or agent) that has ever written to Bosun: name, kind, project, worktree, first/last seen. Useful to find who the requester of a task is or which agents are active.">>,
        obj([]),
        fun(_) -> {ok, As} = bosun_actor:list(), reply({ok, #{<<"actors">> => As}}) end).
