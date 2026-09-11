%%%-------------------------------------------------------------------
%%% @doc REST 公共件：JSON 读写、领域错误 → HTTP 映射、查询参数。
%%%
%%% 也是 `/api/[...]' 的兜底 handler（404 JSON）。
%%%-------------------------------------------------------------------
-module(bosun_web_api).

-export([init/2]).
-export([read_json/1, reply/3, reply_result/3, reply_error/2, error_to_http/1,
         query_map/1, with_body/2, method_not_allowed/2]).

%% 兜底：/api 下没匹配的路径
init(Req, not_found) ->
    {ok, reply_error(Req, not_found), not_found}.

%% @doc 读取并解析 JSON body。空 body 视为 #{}。
-spec read_json(cowboy_req:req()) -> {ok, map(), cowboy_req:req()} | {error, term(), cowboy_req:req()}.
read_json(Req0) ->
    %% 导入整库 JSON 可能很大：一次读完，上限 256MB
    {ok, Body, Req} = read_all(Req0, <<>>),
    case Body of
        <<>> -> {ok, #{}, Req};
        _ ->
            case bosun_json:decode(Body) of
                {ok, Map} when is_map(Map) -> {ok, Map, Req};
                {ok, _} -> {error, {invalid, body, <<"expected a JSON object">>}, Req};
                {error, invalid_json} -> {error, {invalid, body, <<"malformed JSON">>}, Req}
            end
    end.

read_all(Req0, Acc) ->
    case cowboy_req:read_body(Req0, #{length => 268435456, period => 30000}) of
        {ok, Data, Req} -> {ok, <<Acc/binary, Data/binary>>, Req};
        {more, Data, Req} -> read_all(Req, <<Acc/binary, Data/binary>>)
    end.

%% @doc 读 body 后交给 Fun(Map, Req)；解析失败直接回 400。
with_body(Req0, Fun) ->
    case read_json(Req0) of
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
