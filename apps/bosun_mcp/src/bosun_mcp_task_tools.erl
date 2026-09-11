%%%-------------------------------------------------------------------
%%% @doc 任务、检索与状态相关 MCP 工具（designs/02、03、08）。
%%%-------------------------------------------------------------------
-module(bosun_mcp_task_tools).

-export([tools/0]).

-import(bosun_mcp, [reply/1, obj/1, str/1, arr/1, enum/2, int/1, bool/1, nested/2, actor/1, actor_kind/1]).

-define(STATUSES, [<<"NEW">>, <<"IN_PROGRESS">>, <<"DONE">>, <<"VERIFIED">>, <<"REJECTED">>, <<"CANCELLED">>]).
-define(PRIORITIES, [<<"low">>, <<"medium">>, <<"high">>]).

tools() ->
    [list_tasks(), search_tasks(), get_task(), create_task(), update_task(), transition_task(), link_tasks(), unlink_tasks()].

list_tasks() ->
    Schema = (obj([
        {project_key, str(<<"Project key, e.g. BOS">>)},
        {status, arr(<<"Only these statuses (NEW, IN_PROGRESS, DONE, VERIFIED, REJECTED, CANCELLED). Default: all.">>)},
        {label, str(<<"Only tasks carrying this label">>)},
        {kind, enum([<<"task">>, <<"epic">>], <<"Only tasks or only epics. Default: both.">>)},
        {epic, str(<<"Only the steps of this epic (epic task id, e.g. BOS-11)">>)},
        {query, str(<<"Full-text (BM25) match on title / description / labels / feedback, plus id substring">>)},
        {limit, int(<<"Max results (default 100, max 500)">>)},
        {offset, int(<<"Skip this many results (pagination)">>)}
    ]))#{required => [<<"project_key">>]},
    beamai_mcp_types:make_tool(
        <<"list_tasks">>,
        <<"List tasks of a project as summaries (id, title, status, priority, labels, feedback_count, open_question), newest first. Use get_task for the description, history and feedback of one task.">>,
        Schema,
        fun(#{<<"project_key">> := Key} = Args) ->
                Filter = maps:with([<<"status">>, <<"label">>, <<"kind">>, <<"epic">>, <<"limit">>, <<"offset">>], Args),
                Filter1 = case maps:get(<<"query">>, Args, undefined) of
                              undefined -> Filter;
                              Q -> Filter#{<<"q">> => Q}
                          end,
                reply(bosun_task:list(Key, Filter1));
           (_) -> {error, <<"invalid project_key: missing">>}
        end).

search_tasks() ->
    Schema = (obj([
        {query, str(<<"Free text (Chinese or English). Several words are ANDed. Matches title, description, labels and feedback.">>)},
        {project_key, str(<<"Restrict to one project (optional)">>)},
        {limit, int(<<"Max results (default 20, max 100)">>)}
    ]))#{required => [<<"query">>]},
    beamai_mcp_types:make_tool(
        <<"search_tasks">>,
        <<"Full-text search (BM25) across all projects: title, description, labels and feedback. Returns task summaries ranked by relevance; when the match was inside a feedback entry, `feedback` carries its id and a snippet.">>,
        Schema,
        fun(#{<<"query">> := Q} = Args) ->
                Opts = maps:with([<<"limit">>], Args),
                Opts1 = case maps:get(<<"project_key">>, Args, undefined) of
                            undefined -> Opts;
                            P -> Opts#{<<"project">> => P}
                        end,
                reply(bosun_task:search(Q, Opts1));
           (_) -> {error, <<"invalid query: missing">>}
        end).

get_task() ->
    Schema = (obj([{task_id, str(<<"Task id, e.g. BOS-12 (case-insensitive)">>)}]))#{required => [<<"task_id">>]},
    beamai_mcp_types:make_tool(
        <<"get_task">>,
        <<"Get full details of a task: title, markdown description, status, priority, labels, assignee, epic, `links` (replaces / depends_on, both directions), `blocked`, status history and all feedback entries. For an epic also `children` (its steps) and `progress`. Use list_tasks to discover ids.">>,
        Schema,
        fun(#{<<"task_id">> := Id}) -> reply(bosun_task:get(Id));
           (_) -> {error, <<"invalid task_id: missing">>}
        end).

create_task() ->
    Schema = (obj([
        {project_key, str(<<"Project key the task belongs to">>)},
        {title, str(<<"Short title">>)},
        {description, str(<<"Markdown body (optional)">>)},
        {priority, enum(?PRIORITIES, <<"Default medium">>)},
        {labels, arr(<<"Free-form labels">>)},
        {assignee, str(<<"Pre-assign an executor (e.g. another project's agent name). Whoever actually moves it to IN_PROGRESS becomes the assignee.">>)},
        {kind, enum([<<"task">>, <<"epic">>], <<"task (default) or epic. An epic is a goal whose steps are the tasks that point to it via `epic`; it has its own status, feedback and a derived progress.">>)},
        {epic, str(<<"Epic this task is a step of (epic task id, may be in another project). Not allowed when kind=epic.">>)},
        {actor, str(<<"Override the session identity for this call (normally omit; call identify once instead)">>)}
    ]))#{required => [<<"project_key">>, <<"title">>]},
    beamai_mcp_types:make_tool(
        <<"create_task">>,
        <<"Create a task (or an epic with kind=epic) in a project. The id (e.g. BOS-13) is assigned automatically from the project key and returned. New tasks start in status NEW. Pass `epic` to make the task a step of an epic.">>,
        Schema,
        fun(#{<<"project_key">> := Key} = Args) ->
                reply(bosun_task:create(Key, Args#{<<"actor">> => actor(Args), <<"actor_kind">> => actor_kind(Args)}));
           (_) -> {error, <<"invalid project_key: missing">>}
        end).

update_task() ->
    Schema = (obj([
        {task_id, str(<<"Task id, e.g. BOS-12">>)},
        {title, str(<<"New title">>)},
        {description, str(<<"New markdown body (replaces the whole description)">>)},
        {priority, enum(?PRIORITIES, <<"New priority">>)},
        {labels, arr(<<"New label list (replaces existing labels)">>)},
        {assignee, str(<<"Re-assign the executor (empty string clears)">>)},
        {epic, str(<<"Move the task under this epic (empty string detaches). kind itself cannot be changed.">>)}
    ]))#{required => [<<"task_id">>]},
    beamai_mcp_types:make_tool(
        <<"update_task">>,
        <<"Update title, description, priority, labels, assignee or epic of a task. Status is NOT changed here - use transition_task.">>,
        Schema,
        fun(#{<<"task_id">> := Id} = Args) -> reply(bosun_task:update(Id, maps:remove(<<"task_id">>, Args)));
           (_) -> {error, <<"invalid task_id: missing">>}
        end).

transition_task() ->
    Schema = (obj([
        {task_id, str(<<"Task id, e.g. BOS-12">>)},
        {to, enum(?STATUSES, <<"Target status">>)},
        {comment, str(<<"Short note stored in the task history (recommended when rejecting/reopening)">>)},
        {commits, arr(<<"Git commit hashes produced by this work. REQUIRED when moving to DONE: pass [] if there was no commit and say why in a feedback.">>)},
        {tests, nested([
            {command, str(<<"What was run, e.g. \"rebar3 eunit && rebar3 ct\"">>)},
            {passed, bool(<<"Did all tests pass">>)},
            {summary, str(<<"Short result, e.g. \"27 eunit + 4 ct passed\"">>)}
        ], <<"Test evidence. Give it on DONE. The assignee may VERIFY their own task only with tests.passed=true here or on the last DONE.">>)},
        {actor, str(<<"Override the session identity for this call (normally omit; call identify once instead)">>)}
    ]))#{required => [<<"task_id">>, <<"to">>]},
    beamai_mcp_types:make_tool(
        <<"transition_task">>,
        <<"Move a task to a new status. Allowed: NEW->IN_PROGRESS (you become the assignee), IN_PROGRESS->DONE (give commits + tests), DONE->VERIFIED (the requester accepts; the assignee may self-verify only with passing tests recorded), DONE->IN_PROGRESS (requester sends it back), VERIFIED->IN_PROGRESS (reopen), NEW/IN_PROGRESS->REJECTED (assignee refuses the requirement; add a review feedback first), REJECTED->NEW (requester resubmits), NEW/IN_PROGRESS->CANCELLED (no longer needed or obsolete - not a rejection; say why in a comment feedback), CANCELLED->NEW (needed again). The requester can be a human or another project's agent.">>,
        Schema,
        fun(#{<<"task_id">> := Id, <<"to">> := To} = Args) ->
                Opts = #{actor => actor(Args), actor_kind => actor_kind(Args),
                         comment => maps:get(<<"comment">>, Args, undefined),
                         commits => maps:get(<<"commits">>, Args, []),
                         tests => maps:get(<<"tests">>, Args, undefined)},
                reply(bosun_task_status:transition(Id, To, Opts));
           (_) -> {error, <<"invalid arguments: task_id and to are required">>}
        end).

%% 关联：replaces（A 替代 B，B 自动撤销）/ depends_on（A 依赖 B，B 未完成 A 不能开始）
link_tasks() ->
    Schema = (obj([
        {from, str(<<"Task id of the source (the one that replaces / depends on the other), e.g. KEEL-7">>)},
        {to, str(<<"Task id of the target, may be in another project">>)},
        {type, enum([<<"replaces">>, <<"depends_on">>],
                    <<"replaces: `from` supersedes `to`; `to` is auto-CANCELLED if still NEW / IN_PROGRESS. "
                      "depends_on: `from` cannot start until `to` is DONE or VERIFIED (it shows as blocked).">>)},
        {actor, str(<<"Override the session identity for this call (normally omit)">>)}
    ]))#{required => [<<"from">>, <<"to">>, <<"type">>]},
    beamai_mcp_types:make_tool(
        <<"link_tasks">>,
        <<"Link two tasks: `from replaces to` (to is superseded and auto-cancelled while still open) or `from depends_on to` (from is blocked until to is DONE / VERIFIED; cycles are rejected). Returns the `from` task with its `links`.">>,
        Schema,
        fun(#{<<"from">> := From, <<"to">> := To, <<"type">> := Type} = Args) ->
                reply(bosun_link:add(From, To, Type, #{actor => actor(Args), actor_kind => actor_kind(Args)}));
           (_) -> {error, <<"invalid link: from, to and type are required">>}
        end).

unlink_tasks() ->
    Schema = (obj([
        {from, str(<<"Source task id">>)},
        {to, str(<<"Target task id">>)},
        {type, enum([<<"replaces">>, <<"depends_on">>], <<"Link type to remove">>)}
    ]))#{required => [<<"from">>, <<"to">>, <<"type">>]},
    beamai_mcp_types:make_tool(
        <<"unlink_tasks">>,
        <<"Remove a link created by link_tasks. Does not change any status (a task cancelled by `replaces` stays cancelled; move it back to NEW if needed).">>,
        Schema,
        fun(#{<<"from">> := From, <<"to">> := To, <<"type">> := Type}) -> reply(bosun_link:remove(From, To, Type));
           (_) -> {error, <<"invalid link: from, to and type are required">>}
        end).
