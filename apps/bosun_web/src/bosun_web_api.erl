%%%-------------------------------------------------------------------
%%% @doc REST 公共件：JSON 读写、领域错误 → HTTP 映射、查询参数。
%%%
%%% 也是 `/api/[...]' 的兜底 handler（404 JSON）。
%%%-------------------------------------------------------------------
-module(bosun_web_api).

-export([init/2]).
-export([read_json/1, read_json/2, reply/3, reply_result/3, reply_error/2, error_to_http/1,
         query_map/1, with_body/2, with_body/3, method_not_allowed/2]).

%% 请求体上限：普通接口 8MB（markdown 描述绰绰有余），整库导入单独放到 256MB
-define(MAX_BODY, 8 * 1024 * 1024).

%% 兜底：/api 下没匹配的路径
init(Req, State) ->
    {ok, reply_error(Req, not_found), State}.

%% @doc 读取并解析 JSON body。空 body 视为 #{}。
-spec read_json(cowboy_req:req()) -> {ok, map(), cowboy_req:req()} | {error, term(), cowboy_req:req()}.
read_json(Req0) -> read_json(Req0, ?MAX_BODY).

%% @doc 同上，body 总长超过 Max 字节回 `{too_large, Max}'（413）。以前逐块累加没有总上限，
%% 任何 JSON 接口（包括不用登录的登录 / 注册）都能被一个超大 body 撑爆内存。
-spec read_json(cowboy_req:req(), pos_integer()) -> {ok, map(), cowboy_req:req()} | {error, term(), cowboy_req:req()}.
read_json(Req0, Max) ->
    case too_large(Req0, Max) orelse read_all(Req0, Max, []) of
        true -> {error, {too_large, Max}, Req0};
        {error, too_large, Req} -> {error, {too_large, Max}, Req};
        {ok, <<>>, Req} -> {ok, #{}, Req};
        {ok, Body, Req} ->
            case bosun_json:decode(Body) of
                {ok, Map} when is_map(Map) -> {ok, Map, Req};
                {ok, _} -> {error, {invalid, body, <<"expected a JSON object">>}, Req};
                {error, invalid_json} -> {error, {invalid, body, <<"malformed JSON">>}, Req}
            end
    end.

%% 声明了 content-length 的直接按声明拒绝，不用读
too_large(Req, Max) ->
    case cowboy_req:body_length(Req) of
        Len when is_integer(Len) -> Len > Max;
        undefined -> false
    end.

read_all(Req0, Left, Acc) ->
    case cowboy_req:read_body(Req0, #{length => 8 * 1024 * 1024, period => 30000}) of
        {_, Data, Req} when byte_size(Data) > Left -> {error, too_large, Req};
        {ok, Data, Req} -> {ok, iolist_to_binary(lists:reverse([Data | Acc])), Req};
        {more, Data, Req} -> read_all(Req, Left - byte_size(Data), [Data | Acc])
    end.

%% @doc 读 body 后交给 Fun(Map, Req)；解析失败直接回 400。
with_body(Req0, Fun) -> with_body(Req0, ?MAX_BODY, Fun).

with_body(Req0, Max, Fun) ->
    case read_json(Req0, Max) of
        {ok, Map, Req} -> Fun(Map, Req);
        {error, Reason, Req} -> reply_error(Req, Reason)
    end.

-spec reply(integer(), term(), cowboy_req:req()) -> cowboy_req:req().
reply(Status, Body, Req) ->
    cowboy_req:reply(Status, #{<<"content-type">> => <<"application/json; charset=utf-8">>},
                     bosun_json:encode(Body), Req).

%% @doc `{ok, V}' → Status + V；`{error, R}' → 映射。
reply_result(OkStatus, {ok, Value}, Req) -> reply(OkStatus, Value, Req);
reply_result(_OkStatus, {error, Reason}, Req) -> reply_error(Req, Reason).

-spec reply_error(cowboy_req:req(), term()) -> cowboy_req:req().
reply_error(Req, {too_many_requests, Secs} = Reason) ->
    {Status, Body} = error_to_http(Reason),
    reply(Status, Body, cowboy_req:set_resp_header(<<"retry-after">>, integer_to_binary(Secs), Req));
reply_error(Req, Reason) ->
    {Status, Body} = error_to_http(Reason),
    reply(Status, Body, Req).

%% @doc 领域错误 → {HTTP 状态, 错误体}
-spec error_to_http(term()) -> {integer(), map()}.
error_to_http(not_found) ->
    {404, #{<<"error">> => <<"not_found">>, <<"message">> => <<"not found">>}};
error_to_http({project, not_found}) ->
    {404, #{<<"error">> => <<"not_found">>, <<"message">> => <<"project not found">>}};
error_to_http({project, archived}) ->
    {409, #{<<"error">> => <<"archived">>, <<"message">> => <<"project is archived">>}};
error_to_http({forbidden, Author}) ->
    {403, #{<<"error">> => <<"forbidden">>, <<"message">> => <<"only the author (", Author/binary, ") can edit this feedback">>,
            <<"detail">> => #{<<"author">> => Author}}};
error_to_http({superseded, By}) ->
    {409, #{<<"error">> => <<"superseded">>, <<"message">> => <<"already revised; edit ", By/binary, " instead">>,
            <<"detail">> => #{<<"superseded_by">> => By}}};
error_to_http({conflict, active_exists, Other}) ->
    {409, #{<<"error">> => <<"active_exists">>,
            <<"message">> => <<"the project already has an active milestone (", Other/binary, "); pause or release it first">>,
            <<"detail">> => #{<<"milestone">> => Other}}};
error_to_http({milestone_state, Status, Action}) ->
    {409, #{<<"error">> => <<"invalid_state">>,
            <<"message">> => <<"cannot ", (atom_to_binary(Action, utf8))/binary, " a ",
                               (atom_to_binary(Status, utf8))/binary, " milestone">>,
            <<"detail">> => #{<<"status">> => atom_to_binary(Status, utf8), <<"action">> => atom_to_binary(Action, utf8)}}};
error_to_http(not_empty) ->
    {409, #{<<"error">> => <<"not_empty">>, <<"message">> => <<"the milestone still has tasks; move them out first">>}};
error_to_http({conflict, Field}) ->
    {409, #{<<"error">> => <<"conflict">>, <<"field">> => bosun_util:to_binary(Field),
            <<"message">> => <<(bosun_util:to_binary(Field))/binary, " already exists">>}};
error_to_http({invalid, Field, Why}) ->
    {400, #{<<"error">> => <<"invalid">>, <<"field">> => bosun_util:to_binary(Field),
            <<"message">> => <<"invalid ", (bosun_util:to_binary(Field))/binary, ": ",
                               (bosun_util:to_binary(Why))/binary>>}};
error_to_http({invalid_transition, From, To}) ->
    Allowed = [bosun_task_status:to_binary(S) || S <- bosun_task_status:next_statuses(From)],
    {409, #{<<"error">> => <<"invalid_transition">>,
            <<"message">> => bosun_mcp:error_to_text({invalid_transition, From, To}),
            <<"detail">> => #{<<"from">> => bosun_task_status:to_binary(From),
                              <<"to">> => bosun_task_status:to_binary(To),
                              <<"allowed">> => Allowed}}};
error_to_http({self_verify_requires_tests, Assignee}) ->
    {409, #{<<"error">> => <<"self_verify_requires_tests">>,
            <<"message">> => bosun_mcp:error_to_text({self_verify_requires_tests, Assignee}),
            <<"detail">> => #{<<"assignee">> => Assignee}}};
error_to_http({blocked, Blockers}) ->
    {409, #{<<"error">> => <<"blocked">>,
            <<"message">> => bosun_mcp:error_to_text({blocked, Blockers}),
            <<"detail">> => #{<<"blockers">> => Blockers}}};
error_to_http({cycle, Path}) ->
    {409, #{<<"error">> => <<"cycle">>,
            <<"message">> => bosun_mcp:error_to_text({cycle, Path}),
            <<"detail">> => #{<<"path">> => Path}}};
error_to_http(epic_children_incomplete) ->
    {409, #{<<"error">> => <<"epic_children_incomplete">>,
            <<"message">> => bosun_mcp:error_to_text(epic_children_incomplete)}};
%% 认证（13）
error_to_http(unauthorized) ->
    {401, #{<<"error">> => <<"unauthorized">>, <<"message">> => <<"authentication required">>}};
error_to_http(forbidden_role) ->
    {403, #{<<"error">> => <<"forbidden">>, <<"message">> => <<"organization admin only">>}};
error_to_http({forbidden_scope, What}) ->
    {403, #{<<"error">> => <<"forbidden_scope">>, <<"message">> => <<"missing required scope: ", What/binary>>}};
error_to_http(forbidden_actor_override) ->
    {403, #{<<"error">> => <<"forbidden_actor_override">>, <<"message">> => <<"this API key cannot override actor or author">>}};
error_to_http(invalid_credentials) ->
    {401, #{<<"error">> => <<"invalid_credentials">>, <<"message">> => <<"wrong email or password">>}};
error_to_http(user_disabled) ->
    {403, #{<<"error">> => <<"user_disabled">>, <<"message">> => <<"this account is disabled">>}};
error_to_http(code_expired) ->
    {400, #{<<"error">> => <<"code_expired">>, <<"field">> => <<"code">>,
            <<"message">> => <<"verification code expired or not requested; request a new one">>}};
error_to_http(code_mismatch) ->
    {400, #{<<"error">> => <<"code_mismatch">>, <<"field">> => <<"code">>, <<"message">> => <<"wrong verification code">>}};
error_to_http({too_many_requests, Secs}) ->
    {429, #{<<"error">> => <<"too_many_requests">>,
            <<"message">> => <<"too many attempts; retry in ", (integer_to_binary(Secs))/binary, " seconds">>,
            <<"detail">> => #{<<"retry_after">> => Secs}}};
error_to_http({mail_failed, Why}) ->
    logger:error("bosun_mailer failed: ~p", [Why]),
    {502, #{<<"error">> => <<"mail_failed">>, <<"message">> => <<"could not send the verification email">>}};
error_to_http(last_admin) ->
    {409, #{<<"error">> => <<"last_admin">>, <<"message">> => <<"the organization must keep at least one active admin">>}};
error_to_http({too_large, Max}) ->
    {413, #{<<"error">> => <<"too_large">>,
            <<"message">> => <<"request body too large (max ", (integer_to_binary(Max div (1024 * 1024)))/binary, " MB)">>}};
error_to_http(search_unavailable) ->
    {503, #{<<"error">> => <<"search_unavailable">>, <<"message">> => <<"search index is not available">>}};
error_to_http(method_not_allowed) ->
    {405, #{<<"error">> => <<"method_not_allowed">>, <<"message">> => <<"method not allowed">>}};
error_to_http(Other) ->
    logger:error("unhandled domain error: ~p", [Other]),
    {500, #{<<"error">> => <<"internal">>, <<"message">> => <<"internal error">>}}.

%% @doc 查询串 → map（binary 键，重复键保留最后一个）。
-spec query_map(cowboy_req:req()) -> map().
query_map(Req) ->
    maps:from_list([{K, V} || {K, V} <- cowboy_req:parse_qs(Req), V =/= true]).

method_not_allowed(Req, Allow) ->
    {Status, Body} = error_to_http(method_not_allowed),
    cowboy_req:reply(Status, #{<<"content-type">> => <<"application/json; charset=utf-8">>,
                               <<"allow">> => Allow},
                     bosun_json:encode(Body), Req).
