%%%-------------------------------------------------------------------
%%% @doc 认证入口的限流策略（designs/13-org-auth.md §4.4）。计数在 `bosun_rate_limit'，这里只定「谁、多少、多久」。
%%%
%%% 登录——只数**失败**，成功清零；到上限后连正确的密码也拒（429），窗口过了自动恢复：
%%%   同一来源 IP + 同一邮箱   10 次 / 15 分钟   挡对着一个账号猜密码
%%%   同一来源 IP             50 次 / 15 分钟   挡一个来源换着账号猜
%%%   同一邮箱（不分来源）     100 次 / 1 小时    挡分布式猜一个账号；放得宽，免得别人随手把你锁在外面
%%% 发注册验证码——每次请求都数：
%%%   同一来源 IP              5 次 / 1 小时     挡拿本站去轰炸别人的邮箱（单个邮箱另有 60 秒间隔）
%%% 改密——当前密码输错：
%%%   同一用户                10 次 / 15 分钟
%%%
%%% 上限可在 `{bosun_web, [{rate_limits, #{login_ip_email => {10, 900000}, ...}}]}' 里改；
%%% `{rate_limits, off}' 整个关掉。
%%%
%%% 来源 IP 缺省取 TCP 对端。前面有反向代理时对端永远是代理，所有人共用一个额度——这时要设
%%% `{trust_proxy, true}'（或 BOSUN_TRUST_PROXY=true），改取 X-Forwarded-For **最右边**一项
%%% （那是代理自己看到的对端，客户端伪造不了；左边的都是客户端可以随便写的）。
%%% 没有代理却开了它，等于让客户端自报 IP，别开。
%%%-------------------------------------------------------------------
-module(bosun_web_limits).

-export([client_ip/1, login_check/2, login_failed/2, login_ok/2, code_hit/1,
         password_check/1, password_failed/1, password_ok/1]).

-define(MIN, 60 * 1000).
-define(DEFAULTS, #{login_ip_email => {10, 15 * ?MIN},
                    login_ip       => {50, 15 * ?MIN},
                    login_email    => {100, 60 * ?MIN},
                    code_ip        => {5, 60 * ?MIN},
                    password_user  => {10, 15 * ?MIN}}).

%% @doc 登录前：任何一个桶满了就拒，不去算密码。
-spec login_check(inet:ip_address(), term()) -> ok | {error, term()}.
login_check(Ip, Email0) ->
    Email = email_key(Email0),
    first_error([check(login_ip_email, {Ip, Email}), check(login_ip, Ip), check(login_email, Email)]).

-spec login_failed(inet:ip_address(), term()) -> ok.
login_failed(Ip, Email0) ->
    Email = email_key(Email0),
    _ = hit(login_ip_email, {Ip, Email}),
    _ = hit(login_ip, Ip),
    _ = hit(login_email, Email),
    ok.

%% 成功只清「这个来源 + 这个邮箱」：别让一次成功的登录把同来源猜别的账号的计数也洗掉
-spec login_ok(inet:ip_address(), term()) -> ok.
login_ok(Ip, Email0) ->
    bosun_rate_limit:reset(login_ip_email, {Ip, email_key(Email0)}).

-spec code_hit(inet:ip_address()) -> ok | {error, term()}.
code_hit(Ip) -> hit(code_ip, Ip).

-spec password_check(binary()) -> ok | {error, term()}.
password_check(UserId) -> check(password_user, UserId).

-spec password_failed(binary()) -> ok.
password_failed(UserId) -> _ = hit(password_user, UserId), ok.

-spec password_ok(binary()) -> ok.
password_ok(UserId) -> bosun_rate_limit:reset(password_user, UserId).

%% @doc 请求的来源 IP（见模块头）。
-spec client_ip(cowboy_req:req()) -> inet:ip_address().
client_ip(Req) ->
    {Peer, _Port} = cowboy_req:peer(Req),
    case trust_proxy() of
        false -> Peer;
        true ->
            case cowboy_req:header(<<"x-forwarded-for">>, Req) of
                undefined -> Peer;
                Xff ->
                    Last = string:trim(lists:last(binary:split(Xff, <<",">>, [global]))),
                    case inet:parse_address(binary_to_list(Last)) of
                        {ok, Ip} -> Ip;
                        {error, _} -> Peer
                    end
            end
    end.

%%====================================================================

trust_proxy() ->
    case os:getenv("BOSUN_TRUST_PROXY") of
        "true" -> true;
        "1" -> true;
        _ -> application:get_env(bosun_web, trust_proxy, false) =:= true
    end.

limit(Bucket) ->
    case application:get_env(bosun_web, rate_limits, #{}) of
        off -> off;
        Overrides when is_map(Overrides) -> maps:get(Bucket, Overrides, maps:get(Bucket, ?DEFAULTS));
        _ -> maps:get(Bucket, ?DEFAULTS)
    end.

hit(Bucket, Key) ->
    case limit(Bucket) of
        {Limit, Window} -> bosun_rate_limit:hit(Bucket, Key, Limit, Window);
        _ -> ok
    end.

check(Bucket, Key) ->
    case limit(Bucket) of
        {Limit, Window} -> bosun_rate_limit:check(Bucket, Key, Limit, Window);
        _ -> ok
    end.

first_error([]) -> ok;
first_error([ok | Rest]) -> first_error(Rest);
first_error([{error, _} = E | _]) -> E.

%% 邮箱当 key：小写去空白，截到 254 字节（不合法的邮箱也照样数，只是别让它撑大表）
email_key(Email) when is_binary(Email) ->
    E = string:lowercase(string:trim(Email)),
    binary:part(E, 0, min(byte_size(E), 254));
email_key(_) -> <<>>.
