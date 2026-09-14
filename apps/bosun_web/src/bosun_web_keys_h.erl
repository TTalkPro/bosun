%%%-------------------------------------------------------------------
%%% @doc 当前用户的 API key：GET/POST /api/v1/keys · DELETE /api/v1/keys/:id（撤销）
%%%-------------------------------------------------------------------
-module(bosun_web_keys_h).

-export([init/2]).

-import(bosun_web_api, [reply/3, reply_result/3, reply_error/2, with_body/2, method_not_allowed/2]).

init(Req0, State) ->
    #{user_id := Uid} = bosun_web_auth:principal(Req0),
    Req = handle(cowboy_req:method(Req0), cowboy_req:binding(id, Req0), Uid, Req0),
    {ok, Req, State}.

handle(<<"GET">>, undefined, Uid, Req) ->
    {ok, Ks} = bosun_api_key:list(Uid),
    reply(200, #{<<"keys">> => Ks}, Req);
handle(<<"POST">>, undefined, Uid, Req) ->
    with_body(Req, fun(Body, Req1) -> reply_result(201, bosun_api_key:create(Uid, maps:get(<<"name">>, Body, <<>>)), Req1) end);
handle(_, undefined, _, Req) ->
    method_not_allowed(Req, <<"GET, POST">>);
handle(<<"DELETE">>, Id, Uid, Req) ->
    case bosun_api_key:revoke(Uid, Id) of
        {ok, _} -> cowboy_req:reply(204, #{}, <<>>, Req);
        {error, R} -> reply_error(Req, R)
    end;
handle(_, _, _, Req) ->
    method_not_allowed(Req, <<"DELETE">>).
