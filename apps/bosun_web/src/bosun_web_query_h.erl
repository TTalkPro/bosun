%%%-------------------------------------------------------------------
%%% @doc BQL 查询与保存的筛选器
%%%   GET  /api/v1/query?q=&limit=&offset=
%%%   GET/POST /api/v1/filters · GET/PATCH/DELETE /api/v1/filters/:id · GET /api/v1/filters/:id/run
%%%-------------------------------------------------------------------
-module(bosun_web_query_h).

-export([init/2]).

-import(bosun_web_api, [reply/3, reply_result/3, with_body/2, query_map/1, method_not_allowed/2]).

init(Req0, #{mode := Mode} = State) ->
    Req = handle(Mode, cowboy_req:method(Req0), Req0),
    {ok, Req, State}.

handle(query, <<"GET">>, Req) ->
    Q = query_map(Req),
    reply_result(200, bosun_bql:query(maps:get(<<"q">>, Q, <<>>), Q), Req);
handle(query, _, Req) ->
    method_not_allowed(Req, <<"GET">>);

handle(filters, <<"GET">>, Req) ->
    {ok, Fs} = bosun_filter:list(),
    reply(200, #{<<"filters">> => Fs, <<"fields">> => bosun_bql:fields()}, Req);
handle(filters, <<"POST">>, Req) ->
    with_body(Req, fun(Body, Req1) -> reply_result(201, bosun_filter:create(Body), Req1) end);
handle(filters, _, Req) ->
    method_not_allowed(Req, <<"GET, POST">>);

handle(filter, <<"GET">>, Req) ->
    reply_result(200, bosun_filter:get(cowboy_req:binding(id, Req)), Req);
handle(filter, <<"PATCH">>, Req) ->
    Id = cowboy_req:binding(id, Req),
    with_body(Req, fun(Body, Req1) -> reply_result(200, bosun_filter:update(Id, Body), Req1) end);
handle(filter, <<"DELETE">>, Req) ->
    case bosun_filter:delete(cowboy_req:binding(id, Req)) of
        ok -> cowboy_req:reply(204, #{}, <<>>, Req);
        {error, R} -> bosun_web_api:reply_error(Req, R)
    end;
handle(filter, _, Req) ->
    method_not_allowed(Req, <<"GET, PATCH, DELETE">>);

handle(run, <<"GET">>, Req) ->
    reply_result(200, bosun_filter:run(cowboy_req:binding(id, Req), query_map(Req)), Req);
handle(run, _, Req) ->
    method_not_allowed(Req, <<"GET">>).
