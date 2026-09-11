%%%-------------------------------------------------------------------
%%% @doc BQL 查询与保存的筛选器（designs/09-bql.md）。
%%%-------------------------------------------------------------------
-module(bosun_mcp_query_tools).

-export([tools/0, bql_doc/0]).

-import(bosun_mcp, [reply/1, obj/1, str/1, int/1]).

-define(BQL_DOC, <<"# BQL - Bosun Query Language\n\n"
    "JQL-like language to filter tasks across projects.\n\n"
    "```\n"
    "project = BOS AND status IN (NEW, IN_PROGRESS) AND labels = backend\n"
    "  AND text ~ \"mcp create\" AND updated >= -7d\n"
    "ORDER BY priority DESC, updated DESC\n"
    "```\n\n"
    "Fields: project (key) | id | status | priority | labels (label) | created_by (creator, reporter, requester) | assignee | kind (task, epic) | epic (parent epic id) | blocked (true/false) | depends_on / blocks / replaces / replaced_by (task id) | "
    "title | description | text (BM25 over title+description+labels+feedback) | feedback (BM25 over feedback only) | "
    "created | updated | question (true = last feedback is an unanswered question) | feedback_count\n\n"
    "Operators: = != ~ !~ > >= < <= | IN (a, b) | NOT IN (a, b) | IS EMPTY | IS NOT EMPTY | AND OR NOT | parentheses | "
    "ORDER BY field [ASC|DESC], ...\n\n"
    "- `~` is full-text (text, feedback) or substring (title, description, id, labels, created_by); "
    "= on labels means \"has this label\".\n"
    "- Dates: 2026-09-01, 2026-09-01T10:00, now, relative -7d -2w -12h -30m.\n"
    "- Values may be bare words or double-quoted strings; keywords and field names are case-insensitive.\n"
    "- Without ORDER BY: relevance when a text/feedback condition is present, otherwise updated DESC.\n"
    "- Statuses: NEW, IN_PROGRESS, DONE, VERIFIED, REJECTED (requirement refused), CANCELLED (no longer needed). Closed = VERIFIED, REJECTED, CANCELLED.\n"
    "- Empty query = all tasks.\n">>).

bql_doc() -> ?BQL_DOC.

tools() ->
    [query_tasks(), list_filters(), save_filter(), delete_filter()].

query_tasks() ->
    Schema = (obj([
        {bql, str(<<"BQL query, e.g. `project = BOS AND status = NEW ORDER BY updated DESC`. Read resource bosun://bql for the full reference.">>)},
        {limit, int(<<"Max results (default 100, max 500)">>)},
        {offset, int(<<"Skip this many results">>)}
    ]))#{required => [<<"bql">>]},
    beamai_mcp_types:make_tool(
        <<"query_tasks">>,
        <<"Run a BQL query (JQL-like) across all projects and return matching task summaries with total count. Supports status/priority/labels/creator/date conditions, full-text `text ~`, boolean logic and ORDER BY. Syntax errors come back as readable messages.">>,
        Schema,
        fun(#{<<"bql">> := Q} = Args) -> reply(bosun_bql:query(Q, maps:with([<<"limit">>, <<"offset">>], Args)));
           (_) -> {error, <<"invalid bql: missing">>}
        end).

list_filters() ->
    beamai_mcp_types:make_tool(
        <<"list_filters">>,
        <<"List saved BQL filters (id, name, query). Run one with query_tasks using its query.">>,
        obj([]),
        fun(_) -> {ok, Fs} = bosun_filter:list(), reply({ok, #{<<"filters">> => Fs}}) end).

save_filter() ->
    Schema = (obj([
        {name, str(<<"Filter name">>)},
        {bql, str(<<"BQL query to save">>)},
        {filter_id, str(<<"Existing filter id to update (omit to create)">>)}
    ]))#{required => [<<"name">>, <<"bql">>]},
    beamai_mcp_types:make_tool(
        <<"save_filter">>,
        <<"Create or update a saved BQL filter. The query is validated first.">>,
        Schema,
        fun(#{<<"name">> := Name, <<"bql">> := Q} = Args) ->
                Input = #{<<"name">> => Name, <<"query">> => Q},
                case maps:get(<<"filter_id">>, Args, undefined) of
                    undefined -> reply(bosun_filter:create(Input));
                    Id -> reply(bosun_filter:update(Id, Input))
                end;
           (_) -> {error, <<"invalid arguments: name and bql are required">>}
        end).

delete_filter() ->
    Schema = (obj([{filter_id, str(<<"Filter id, e.g. f3">>)}]))#{required => [<<"filter_id">>]},
    beamai_mcp_types:make_tool(
        <<"delete_filter">>,
        <<"Delete a saved filter.">>,
        Schema,
        fun(#{<<"filter_id">> := Id}) ->
                case bosun_filter:delete(Id) of
                    ok -> reply({ok, #{<<"deleted">> => Id}});
                    E -> reply(E)
                end;
           (_) -> {error, <<"invalid filter_id: missing">>}
        end).
