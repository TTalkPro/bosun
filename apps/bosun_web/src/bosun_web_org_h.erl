%%%-------------------------------------------------------------------
%%% @doc GET /api/v1/org（所有成员）· PATCH /api/v1/org {name}（admin）
%%%-------------------------------------------------------------------
-module(bosun_web_org_h).

-export([init/2]).

-import(bosun_web_api, [reply_result/3, reply_error/2, with_body/2, method_not_allowed/2]).

init(Req0, State) ->
    #{org_id := OrgId, role := Role} = bosun_web_auth:principal(Req0),
    Req = case cowboy_req:method(Req0) of
              <<"GET">> -> reply_result(200, bosun_org:get(OrgId), Req0);
              <<"PATCH">> when Role =/= admin -> reply_error(Req0, forbidden_role);
              <<"PATCH">> ->
                  with_body(Req0, fun(Body, Req1) -> reply_result(200, bosun_org:update(OrgId, Body), Req1) end);
              _ -> method_not_allowed(Req0, <<"GET, PATCH">>)
          end,
    {ok, Req, State}.
