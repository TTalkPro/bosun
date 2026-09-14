%%%-------------------------------------------------------------------
%%% @doc 认证中间件（cowboy_router 之后、cowboy_handler 之前）。设计见 designs/13-org-auth.md §4.1。
%%%
%%% 按路由 handler opts 里的 `auth' 决定：
%%%   public   不查（注册 / 登录 / workflow.md / 静态文件）
%%%   api_key  只认 `Authorization: Bearer <key>'（/mcp）；带 mcp-session-id 时把主体绑到会话
%%%   admin    Cookie 或 Bearer，且 role = admin，否则 403
%%%   缺省     Cookie 会话或 Bearer key
%%% 通过后 `bosun_scope:set(P)'（本请求进程），并放进 Req 的 `bosun_principal'。
%%%-------------------------------------------------------------------
-module(bosun_web_auth).
-behaviour(cowboy_middleware).

-export([execute/2]).
-export([principal/1, actor_fields/1, set_session_cookie/2, clear_session_cookie/1, cookie_name/0]).

-define(COOKIE, <<"bosun_session">>).

execute(Req, #{handler_opts := Opts} = Env) ->
    bosun_scope:clear(),
    case auth_mode(Opts) of
        public -> {ok, Req, Env};
        Mode ->
            case authenticate(Mode, Req) of
                {ok, P} when Mode =:= admin, map_get(role, P) =/= admin ->
                    {stop, reply_error(Req, forbidden_role)};
                {ok, P} ->
                    ok = bosun_scope:set(P),
                    Mode =:= api_key andalso bind_mcp_session(Req, P),
                    {ok, Req#{bosun_principal => P}, Env};
                {error, Reason} ->
                    {stop, reply_unauthorized(Req, Mode, Reason)}
            end
    end;
execute(Req, Env) ->
    {ok, Req, Env}.

auth_mode(Opts) when is_map(Opts) -> maps:get(auth, Opts, session);
auth_mode(_) -> session.

authenticate(api_key, Req) ->
    case bearer(Req) of
        undefined -> {error, missing_key};
        Key -> bosun_api_key:authenticate(Key)
    end;
authenticate(_, Req) ->
    case bearer(Req) of
        undefined ->
            case session_token(Req) of
                undefined -> {error, missing_session};
                Token -> bosun_session:lookup(Token)
            end;
        Key -> bosun_api_key:authenticate(Key)
    end.

bearer(Req) ->
    case cowboy_req:header(<<"authorization">>, Req) of
        undefined -> undefined;
        <<S:7/binary, Rest/binary>> ->
            case string:lowercase(S) of
                <<"bearer ">> ->
                    case bosun_util:trim(Rest) of
                        <<>> -> undefined;
                        Key -> Key
                    end;
                _ -> undefined
            end;
        _ -> undefined
    end.

session_token(Req) ->
    try cowboy_req:parse_cookies(Req) of
        Cookies ->
            case lists:keyfind(?COOKIE, 1, Cookies) of
                {_, V} when V =/= <<>> -> V;
                _ -> undefined
            end
    catch
        _:_ -> undefined
    end.

%% MCP 工具在会话进程里执行；把主体绑到那个进程，工具调用前从它取作用域
bind_mcp_session(Req, P) ->
    case cowboy_req:header(<<"mcp-session-id">>, Req) of
        undefined -> ok;
        Sid ->
            case beamai_mcp_session_registry:lookup(Sid) of
                {ok, Pid} -> bosun_identity:bind(Pid, P);
                {error, _} -> ok
            end
    end.

reply_unauthorized(Req, Mode, Reason) ->
    {Status, Body} = bosun_web_api:error_to_http(unauthorized),
    Headers0 = #{<<"content-type">> => <<"application/json; charset=utf-8">>},
    Headers = case Mode of
                  api_key -> Headers0#{<<"www-authenticate">> => <<"Bearer realm=\"bosun\"">>};
                  _ -> Headers0
              end,
    Msg = case Reason of
              missing_key -> <<"missing API key: send Authorization: Bearer <key> (create one on the Account page)">>;
              missing_session -> <<"not logged in">>;
              _ -> <<"invalid or expired credentials">>
          end,
    cowboy_req:reply(Status, Headers, bosun_json:encode(Body#{<<"message">> => Msg}), Req).

reply_error(Req, Reason) ->
    bosun_web_api:reply_error(Req, Reason).

%%====================================================================
%% 给 handler 用
%%====================================================================

-spec principal(cowboy_req:req()) -> bosun_scope:principal().
principal(Req) -> maps:get(bosun_principal, Req).

%% @doc 写操作的署名：主体的显示名，kind 人。REST 不再采信 body 里的 actor / author。
-spec actor_fields(cowboy_req:req()) -> #{actor := binary(), actor_kind := binary()}.
actor_fields(Req) ->
    #{name := Name} = principal(Req),
    #{actor => Name, actor_kind => <<"human">>}.

-spec cookie_name() -> binary().
cookie_name() -> ?COOKIE.

-spec set_session_cookie(binary(), cowboy_req:req()) -> cowboy_req:req().
set_session_cookie(Token, Req) ->
    cowboy_req:set_resp_cookie(?COOKIE, Token, Req, cookie_opts(bosun_session:ttl_seconds())).

-spec clear_session_cookie(cowboy_req:req()) -> cowboy_req:req().
clear_session_cookie(Req) ->
    cowboy_req:set_resp_cookie(?COOKIE, <<>>, Req, cookie_opts(0)).

cookie_opts(MaxAge) ->
    Secure = case os:getenv("BOSUN_COOKIE_SECURE") of
                 "true" -> true;
                 "1" -> true;
                 _ -> application:get_env(bosun_web, cookie_secure, false)
             end,
    #{http_only => true, same_site => lax, path => <<"/">>, max_age => MaxAge, secure => Secure}.
