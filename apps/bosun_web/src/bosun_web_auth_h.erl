%%%-------------------------------------------------------------------
%%% @doc /api/v1/auth/*：注册（发码 / 建组织）、登录、登出、当前用户、改密。
%%% 设计见 designs/13-org-auth.md §4.2。
%%%-------------------------------------------------------------------
-module(bosun_web_auth_h).

-export([init/2]).

-import(bosun_web_api, [reply/3, reply_result/3, reply_error/2, with_body/2, method_not_allowed/2]).

init(Req0, #{mode := Mode} = State) ->
    Req = handle(Mode, cowboy_req:method(Req0), Req0),
    {ok, Req, State}.

%% 注册第一步：发验证码
handle(code, <<"POST">>, Req) ->
    with_body(Req, fun(Body, Req1) ->
        reply_result(202, bosun_org:request_code(maps:get(<<"email">>, Body, <<>>)), Req1)
    end);
handle(code, _, Req) -> method_not_allowed(Req, <<"POST">>);

%% 注册第二步：建组织 + 管理员，顺手登录
handle(register, <<"POST">>, Req) ->
    with_body(Req, fun(Body, Req1) ->
        case bosun_org:register(Body) of
            {ok, #{<<"user">> := #{<<"id">> := Uid}} = Res} ->
                {ok, Token} = bosun_session:create(Uid),
                reply(201, Res, bosun_web_auth:set_session_cookie(Token, Req1));
            {error, R} -> reply_error(Req1, R)
        end
    end);
handle(register, _, Req) -> method_not_allowed(Req, <<"POST">>);

handle(login, <<"POST">>, Req) ->
    with_body(Req, fun(Body, Req1) ->
        case bosun_user:authenticate(maps:get(<<"email">>, Body, <<>>), maps:get(<<"password">>, Body, <<>>)) of
            {ok, #{<<"id">> := Uid, <<"org_id">> := OrgId} = User} ->
                {ok, Token} = bosun_session:create(Uid),
                {ok, Org} = bosun_org:get(OrgId),
                reply(200, #{<<"user">> => User, <<"org">> => Org}, bosun_web_auth:set_session_cookie(Token, Req1));
            {error, R} -> reply_error(Req1, R)
        end
    end);
handle(login, _, Req) -> method_not_allowed(Req, <<"POST">>);

handle(logout, <<"POST">>, Req) ->
    case cowboy_req:parse_cookies(Req) of
        Cookies ->
            case lists:keyfind(bosun_web_auth:cookie_name(), 1, Cookies) of
                {_, Token} -> ok = bosun_session:delete(Token);
                false -> ok
            end
    end,
    cowboy_req:reply(204, #{}, <<>>, bosun_web_auth:clear_session_cookie(Req));
handle(logout, _, Req) -> method_not_allowed(Req, <<"POST">>);

handle(me, <<"GET">>, Req) ->
    #{user_id := Uid, org_id := OrgId, via := Via} = bosun_web_auth:principal(Req),
    {ok, User} = bosun_user:get(Uid),
    {ok, Org} = bosun_org:get(OrgId),
    reply(200, #{<<"user">> => User, <<"org">> => Org, <<"via">> => atom_to_binary(Via, utf8)}, Req);
handle(me, _, Req) -> method_not_allowed(Req, <<"GET">>);

handle(password, <<"POST">>, Req) ->
    #{user_id := Uid} = bosun_web_auth:principal(Req),
    with_body(Req, fun(Body, Req1) ->
        case bosun_user:change_password(Uid, maps:get(<<"current">>, Body, <<>>), maps:get(<<"new">>, Body, <<>>)) of
            ok -> cowboy_req:reply(204, #{}, <<>>, Req1);
            {error, R} -> reply_error(Req1, R)
        end
    end);
handle(password, _, Req) -> method_not_allowed(Req, <<"POST">>).
