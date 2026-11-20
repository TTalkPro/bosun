%%%-------------------------------------------------------------------
%%% @doc 当前用户的 API key：GET/POST /api/v1/keys · DELETE /api/v1/keys/:id（撤销）
%%%      · POST /api/v1/keys/:id/rotate（轮换）。路由 opts 的 mode 区分三条路径——
%%% 以前只看有没有 :id，`POST /keys/:id' 也会轮换、`DELETE /keys/:id/rotate' 也会撤销。
%%%-------------------------------------------------------------------
-module(bosun_web_keys_h).

-export([init/2]).

-import(bosun_web_api, [reply/3, reply_result/3, reply_error/2, with_body/2, method_not_allowed/2]).

init(Req0, State) ->
    #{user_id := Uid} = bosun_web_auth:principal(Req0),
    Mode = maps:get(mode, State, keys),
    Req = handle(Mode, cowboy_req:method(Req0), cowboy_req:binding(id, Req0), Uid, Req0),
    {ok, Req, State}.

handle(keys, <<"GET">>, _, Uid, Req) ->
    {ok, Ks} = bosun_api_key:list(Uid),
    reply(200, #{<<"keys">> => Ks}, Req);
handle(keys, <<"POST">>, _, Uid, Req) ->
    with_body(Req, fun(Body, Req1) ->
        Input = maps:with([<<"scopes">>, <<"project_keys">>, <<"expires_at">>], Body),
        reply_result(201, bosun_api_key:create(Uid, maps:get(<<"name">>, Body, <<>>), Input), Req1)
    end);
handle(keys, _, _, _, Req) ->
    method_not_allowed(Req, <<"GET, POST">>);
handle(rotate, <<"POST">>, Id, Uid, Req) ->
    case bosun_api_key:rotate(Uid, Id) of
        {ok, _} = OK -> reply_result(201, OK, Req);
        {error, R} -> reply_error(Req, R)
    end;
handle(rotate, _, _, _, Req) ->
    method_not_allowed(Req, <<"POST">>);
handle(key, <<"DELETE">>, Id, Uid, Req) ->
    case bosun_api_key:revoke(Uid, Id) of
        {ok, _} -> cowboy_req:reply(204, #{}, <<>>, Req);
        {error, R} -> reply_error(Req, R)
    end;
handle(key, _, _, _, Req) ->
    method_not_allowed(Req, <<"DELETE">>).
