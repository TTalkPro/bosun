%%%-------------------------------------------------------------------
%%% @doc 项目相关 MCP 工具（designs/01-project.md §5）。
%%%-------------------------------------------------------------------
-module(bosun_mcp_project_tools).

-export([tools/0]).

-import(bosun_mcp, [reply/1, obj/1, str/1, bool/1]).

tools() ->
    [list_projects(), get_project(), create_project(), update_project()].

list_projects() ->
    Schema = obj([{include_archived, bool(<<"Include archived projects (default false)">>)}]),
    beamai_mcp_types:make_tool(
        <<"list_projects">>,
        <<"List projects. Each project has a short uppercase `key` that prefixes its task ids (key BOS -> tasks BOS-1, BOS-2, ...).">>,
        Schema,
        fun(Args) ->
            Inc = bosun_util:to_bool(maps:get(<<"include_archived">>, Args, false), false),
            {ok, Ps} = bosun_project:list(#{include_archived => Inc}),
            reply({ok, #{<<"projects">> => Ps}})
        end).

get_project() ->
    Schema = (obj([{key, str(<<"Project key, e.g. BOS (case-insensitive)">>)}]))#{required => [<<"key">>]},
    beamai_mcp_types:make_tool(
        <<"get_project">>,
        <<"Get one project by key: name, markdown description, task_count, archived flag.">>,
        Schema,
        fun(#{<<"key">> := Key}) -> reply(bosun_project:get(Key));
           (_) -> {error, <<"invalid key: missing">>}
        end).

create_project() ->
    Schema = (obj([
        {key, str(<<"2-10 chars: uppercase letters/digits, must start with a letter. Becomes the task id prefix. Lowercase input is uppercased.">>)},
        {name, str(<<"Display name">>)},
        {description, str(<<"Markdown description (optional)">>)}
    ]))#{required => [<<"key">>, <<"name">>]},
    beamai_mcp_types:make_tool(
        <<"create_project">>,
        <<"Create a new project. `key` becomes the prefix of every task id in it (key BOS -> BOS-1). Keys cannot be changed later.">>,
        Schema,
        fun(Args) -> reply(bosun_project:create(Args)) end).

update_project() ->
    Schema = (obj([
        {key, str(<<"Project key">>)},
        {name, str(<<"New display name">>)},
        {description, str(<<"New markdown description">>)},
        {archived, bool(<<"Archive (true) or reopen (false). Archived projects cannot receive new tasks.">>)}
    ]))#{required => [<<"key">>]},
    beamai_mcp_types:make_tool(
        <<"update_project">>,
        <<"Update a project's name, description or archived flag. The key itself cannot change.">>,
        Schema,
        fun(#{<<"key">> := Key} = Args) -> reply(bosun_project:update(Key, maps:remove(<<"key">>, Args)));
           (_) -> {error, <<"invalid key: missing">>}
        end).
