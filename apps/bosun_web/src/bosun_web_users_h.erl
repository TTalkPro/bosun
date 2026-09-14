%%%-------------------------------------------------------------------
%%% @doc 组织用户管理（admin）：GET/POST /api/v1/users · PATCH /api/v1/users/:id
%%%-------------------------------------------------------------------
-module(bosun_web_users_h).

-export([init/2]).

-import(bosun_web_api, [reply/3, reply_result/3, with_body/2, method_not_allowed/2]).

init(Req0, State) ->
    #{org_id := OrgId} = bosun_web_auth:principal(Req0),
    Req = handle(cowboy_req:method(Req0), cowboy_req:binding(id, Req0), OrgId, Req0),
    {ok, Req, State}.

handle(<<"GET">>, undefined, OrgId, Req) ->
    {ok, Us} = bosun_user:list(OrgId),
    reply(200, #{<<"users">> => Us}, Req);
handle(<<"POST">>, undefined, OrgId, Req) ->
    with_body(Req, fun(Body, Req1) ->
        case bosun_user:create(OrgId, Body) of
            {ok, #{<<"name">> := Name, <<"id">> := Uid} = U} ->
                ok = bosun_actor:touch(Name, human, #{org_id => OrgId, user_id => Uid}),
                reply(201, U, Req1);
            E -> reply_result(201, E, Req1)
        end
    end);
handle(_, undefined, _, Req) ->
    method_not_allowed(Req, <<"GET, POST">>);
handle(<<"GET">>, Id, OrgId, Req) ->
    reply_result(200, bosun_user:get_in_org(OrgId, Id), Req);
handle(<<"PATCH">>, Id, OrgId, Req) ->
    with_body(Req, fun(Body, Req1) -> reply_result(200, bosun_user:update(OrgId, Id, Body), Req1) end);
handle(_, _, _, Req) ->
    method_not_allowed(Req, <<"GET, PATCH">>).
