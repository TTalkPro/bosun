%%%-------------------------------------------------------------------
%%% @doc Feedback 相关 MCP 工具（designs/04-feedback.md §6）。
%%%-------------------------------------------------------------------
-module(bosun_mcp_feedback_tools).

-export([tools/0]).

-import(bosun_mcp, [reply/1, obj/1, str/1, enum/2, actor/1, actor_kind/1]).

-define(KINDS, [<<"comment">>, <<"review">>, <<"question">>, <<"answer">>]).

tools() ->
    [add_feedback(), update_feedback(), list_feedback()].

add_feedback() ->
    Schema = (obj([
        {task_id, str(<<"Task id, e.g. BOS-12">>)},
        {content, str(<<"Markdown text">>)},
        {kind, enum(?KINDS, <<"comment (default): general note; review: human acceptance notes; question: you need a human decision - do not mark the task DONE; answer: reply to a question">>)},
        {author, str(<<"Override the session identity for this call (normally omit; call identify once instead). Only this author can later revise the entry.">>)}
    ]))#{required => [<<"task_id">>, <<"content">>]},
    beamai_mcp_types:make_tool(
        <<"add_feedback">>,
        <<"Append a feedback entry (markdown) to a task. Feedback is immutable (never deleted; authors may revise their own with update_feedback, which appends a new version). When you finish work, add a comment describing what you did and which files changed, then transition_task to DONE. Use kind=question when you need a decision from the requester; kind=review when you verify or reject someone else's work.">>,
        Schema,
        fun(#{<<"task_id">> := Id} = Args) ->
                reply(bosun_feedback:add(Id, Args#{<<"author">> => actor(Args), <<"author_kind">> => actor_kind(Args)}));
           (_) -> {error, <<"invalid arguments: task_id and content are required">>}
        end).

update_feedback() ->
    Schema = (obj([
        {feedback_id, str(<<"Feedback id, e.g. BOS-12#3">>)},
        {content, str(<<"New markdown text (replaces the whole entry)">>)},
        {kind, enum(?KINDS, <<"New kind (optional)">>)},
        {author, str(<<"Must equal the entry's original author (defaults to the session identity)">>)}
    ]))#{required => [<<"feedback_id">>]},
    beamai_mcp_types:make_tool(
        <<"update_feedback">>,
        <<"Revise one of your own feedback entries: a new entry is appended (with `supersedes` pointing at the old id) and the old one is marked superseded. Returns the new entry. Entries written by someone else cannot be revised - add a new feedback instead. Deletion is not supported.">>,
        Schema,
        fun(#{<<"feedback_id">> := Id} = Args) ->
                Input = maps:with([<<"content">>, <<"kind">>], Args),
                reply(bosun_feedback:revise(Id, Input#{<<"actor">> => actor(Args), <<"actor_kind">> => actor_kind(Args)}));
           (_) -> {error, <<"invalid feedback_id: missing">>}
        end).

list_feedback() ->
    Schema = (obj([{task_id, str(<<"Task id, e.g. BOS-12">>)}]))#{required => [<<"task_id">>]},
    beamai_mcp_types:make_tool(
        <<"list_feedback">>,
        <<"List all feedback entries of a task in chronological order, including superseded (revised) versions marked status=superseded. get_task already includes them; use this to refresh only the feedback.">>,
        Schema,
        fun(#{<<"task_id">> := Id}) ->
                case bosun_feedback:list(Id) of
                    {ok, Fs} -> reply({ok, #{<<"task_id">> => bosun_id:normalize_key(Id), <<"feedback">> => Fs}});
                    E -> reply(E)
                end;
           (_) -> {error, <<"invalid task_id: missing">>}
        end).
