%%%-------------------------------------------------------------------
%%% @doc Milestone（发布范围）MCP 工具（designs/14-milestone.md §4.4）。
%%%
%%% 读：list_milestones / get_milestone；排期（任务协作，write）：assign_milestone；
%%% 管理（manage）：create_milestone / update_milestone / transition_milestone（开始 / 暂停 / 重开 / 发布）。
%%% 单个任务的归属也可以直接 create_task / update_task 带 milestone。
%%%-------------------------------------------------------------------
-module(bosun_mcp_milestone_tools).

-export([tools/0]).

-import(bosun_mcp, [reply/1, obj/1, str/1, arr/1, enum/2, bool/1, actor/1]).

tools() ->
    [list_milestones(), get_milestone(), create_milestone(), update_milestone(), transition_milestone(), assign_milestone()].

list_milestones() ->
    Schema = (obj([
        {project_key, str(<<"Project key, e.g. BOS">>)},
        {include_released, bool(<<"Also list released milestones (default false: only active and planning)">>)}
    ]))#{required => [<<"project_key">>]},
    beamai_mcp_types:make_tool(
        <<"list_milestones">>,
        <<"List a project's milestones (release scopes): the active one first, then planning ones by target date. "
          "Each has id (e.g. BOS-M3), name (e.g. 0.1.4), status (planning / active / released), start / target dates and "
          "counts {scope, done, verified, pending_verify, open, in_progress, epics, percent}. "
          "A project has at most one active milestone - that is the current release; pick work from it first.">>,
        Schema,
        fun(#{<<"project_key">> := Key} = Args) ->
                case bosun_milestone:list(Key) of
                    {ok, Ms} ->
                        Keep = bosun_util:to_bool(maps:get(<<"include_released">>, Args, false), false),
                        reply({ok, #{<<"milestones">> => [M || #{<<"status">> := S} = M <- Ms, Keep orelse S =/= <<"released">>]}});
                    E -> reply(E)
                end;
           (_) -> {error, <<"invalid project_key: missing">>}
        end).

get_milestone() ->
    Schema = (obj([{milestone_id, str(<<"Milestone id, e.g. BOS-M3 (case-insensitive)">>)}]))#{required => [<<"milestone_id">>]},
    beamai_mcp_types:make_tool(
        <<"get_milestone">>,
        <<"Get one milestone: dates, counts, the release `summary` once released (delivered / pending_verify / carried_over task ids and release notes), "
          "and `changes` - every time a task was moved in or out (who, when, why). "
          "List its tasks with list_tasks(project_key, milestone=<id>).">>,
        Schema,
        fun(#{<<"milestone_id">> := Id}) -> reply(bosun_milestone:get(Id));
           (_) -> {error, <<"invalid milestone_id: missing">>}
        end).

create_milestone() ->
    Schema = (obj([
        {project_key, str(<<"Project key">>)},
        {name, str(<<"Name, unique within the project - usually a version like 0.1.4">>)},
        {description, str(<<"Markdown goal / scope (optional)">>)},
        {start_date, str(<<"YYYY-MM-DD (optional; burndown starts here)">>)},
        {target_date, str(<<"YYYY-MM-DD (optional)">>)}
    ]))#{required => [<<"project_key">>, <<"name">>]},
    beamai_mcp_types:make_tool(
        <<"create_milestone">>,
        <<"Create a milestone in status planning. Put tasks into it with assign_milestone / update_task(milestone=...), "
          "then start it with transition_milestone(action=activate).">>,
        Schema,
        fun(#{<<"project_key">> := Key} = Args) ->
                reply(bosun_milestone:create(Key, (maps:remove(<<"project_key">>, Args))#{<<"actor">> => actor(Args)}));
           (_) -> {error, <<"invalid project_key: missing">>}
        end).

update_milestone() ->
    Schema = (obj([
        {milestone_id, str(<<"Milestone id, e.g. BOS-M3">>)},
        {name, str(<<"New name">>)},
        {description, str(<<"New markdown description">>)},
        {start_date, str(<<"YYYY-MM-DD; empty string clears">>)},
        {target_date, str(<<"YYYY-MM-DD; empty string clears">>)}
    ]))#{required => [<<"milestone_id">>]},
    beamai_mcp_types:make_tool(
        <<"update_milestone">>,
        <<"Rename a milestone or change its description / dates. Status changes go through transition_milestone.">>,
        Schema,
        fun(#{<<"milestone_id">> := Id} = Args) -> reply(bosun_milestone:update(Id, maps:remove(<<"milestone_id">>, Args)));
           (_) -> {error, <<"invalid milestone_id: missing">>}
        end).

transition_milestone() ->
    Schema = (obj([
        {milestone_id, str(<<"Milestone id, e.g. BOS-M3">>)},
        {action, enum([<<"activate">>, <<"pause">>, <<"reopen">>, <<"release">>],
                      <<"activate: planning -> active (only one active per project). pause: active -> planning. "
                        "release: active -> released. reopen: released -> active.">>)},
        {carry_over, str(<<"release only: where unfinished (NEW / IN_PROGRESS) tasks go - another planning or active milestone (id or name), "
                           "or \"backlog\" (default). DONE-but-not-verified tasks stay and count as delivered.">>)},
        {notes, str(<<"release only: release notes (markdown) stored in the release summary">>)}
    ]))#{required => [<<"milestone_id">>, <<"action">>]},
    beamai_mcp_types:make_tool(
        <<"transition_milestone">>,
        <<"Change a milestone's status. Releasing snapshots what was delivered, pending verification and carried over; "
          "each carried task gets an entry in its milestone_log.">>,
        Schema,
        fun(#{<<"milestone_id">> := Id, <<"action">> := Action} = Args) ->
                Opts = (maps:with([<<"carry_over">>, <<"notes">>], Args))#{<<"actor">> => actor(Args)},
                reply(case Action of
                          <<"activate">> -> bosun_milestone:activate(Id, Opts);
                          <<"pause">> -> bosun_milestone:pause(Id, Opts);
                          <<"reopen">> -> bosun_milestone:reopen(Id, Opts);
                          <<"release">> -> bosun_milestone:release(Id, Opts);
                          _ -> {error, {invalid, action, <<"expected activate, pause, reopen or release">>}}
                      end);
           (_) -> {error, <<"invalid arguments: milestone_id and action are required">>}
        end).

assign_milestone() ->
    Schema = (obj([
        {project_key, str(<<"Project key the tasks belong to">>)},
        {task_ids, arr(<<"Task ids, e.g. [\"BOS-12\", \"BOS-15\"]">>)},
        {milestone, str(<<"Milestone id or name, \"active\" for the current one, or empty string to move back to the backlog">>)},
        {comment, str(<<"Why (recommended when moving tasks out of a milestone, e.g. \"not in this release\"); stored in each task's milestone_log">>)}
    ]))#{required => [<<"project_key">>, <<"task_ids">>, <<"milestone">>]},
    beamai_mcp_types:make_tool(
        <<"assign_milestone">>,
        <<"Put several tasks into a milestone (or back to the backlog) in one call. Each task is checked on its own; "
          "the result lists `updated` ids and `failed` [{id, reason}]. An epic's unfinished steps follow it. "
          "Released milestones cannot receive tasks.">>,
        Schema,
        fun(#{<<"project_key">> := Key, <<"task_ids">> := Ids, <<"milestone">> := M} = Args) ->
                reply(bosun_milestone:assign(Key, Ids, M, actor(Args), maps:get(<<"comment">>, Args, undefined)));
           (_) -> {error, <<"invalid arguments: project_key, task_ids and milestone are required">>}
        end).
