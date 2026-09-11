%%%-------------------------------------------------------------------
%%% @doc /api/v1/projects[/:key]
%%%-------------------------------------------------------------------
-module(bosun_web_projects_h).

-export([init/2]).

-import(bosun_web_api, [reply/3, reply_result/3, with_body/2, query_map/1, method_not_allowed/2]).

init(Req0, State) ->
    Method = cowboy_req:method(Req0),
    Key = cowboy_req:binding(key, Req0),
    Req = handle(Method, Key, Req0),
    {ok, Req, State}.

handle(<<"GET">>, undefined, Req) ->
    Q = query_map(Req),
    Inc = bosun_util:to_bool(maps:get(<<"archived">>, Q, false), false),
    {ok, Ps} = bosun_project:list(#{include_archived => Inc}),
    reply(200, #{<<"projects">> => Ps}, Req);
handle(<<"POST">>, undefined, Req) ->
    with_body(Req, fun(Body, Req1) -> reply_result(201, bosun_project:create(Body), Req1) end);
handle(<<"GET">>, Key, Req) ->
    reply_result(200, bosun_project:get(Key), Req);
handle(<<"PATCH">>, Key, Req) ->
    with_body(Req, fun(Body, Req1) -> reply_result(200, bosun_project:update(Key, Body), Req1) end);
handle(_, undefined, Req) ->
    method_not_allowed(Req, <<"GET, POST">>);
handle(_, _, Req) ->
    method_not_allowed(Req, <<"GET, PATCH">>).
