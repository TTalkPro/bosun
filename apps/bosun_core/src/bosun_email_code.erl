%%%-------------------------------------------------------------------
%%% @doc 注册邮箱验证码：生成 / 发送 / 校验 / 限流。
%%%
%%% 一个邮箱同时只有一条：60 秒内不重发；15 分钟过期；错 5 次作废；用掉即删。
%%%-------------------------------------------------------------------
-module(bosun_email_code).

-include("bosun.hrl").

-export([request/1, verify/2, consume/1, validate_email/1, peek/1]).

-define(TTL_MS, 15 * 60 * 1000).
-define(RESEND_MS, 60 * 1000).
-define(MAX_ATTEMPTS, 5).

%% @doc 邮箱格式：有且仅有一个 @，两边非空，域名带点，不含空白，≤ 254；统一小写。
-spec validate_email(term()) -> {ok, binary()} | {error, {invalid, email, binary()}}.
validate_email(Email0) ->
    Email = string:lowercase(bosun_util:trim(Email0)),
    Ok = byte_size(Email) > 0 andalso byte_size(Email) =< 254 andalso
         re:run(Email, <<"^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$">>, [{capture, none}, unicode]) =:= match,
    case Ok of
        true -> {ok, Email};
        false -> {error, {invalid, email, <<"must look like name@example.com">>}}
    end.

%% @doc 生成并发送验证码。返回 #{<<"delivery">> => smtp | log, <<"expires_in">> => 秒}。
-spec request(term()) -> {ok, map()} | {error, term()}.
request(Email0) ->
    case validate_email(Email0) of
        {ok, Email} ->
            Now = bosun_util:now_ms(),
            case mnesia:dirty_read(email_code, Email) of
                [#email_code{sent_at = Sent}] when Now - Sent < ?RESEND_MS ->
                    {error, {too_many_requests, (?RESEND_MS - (Now - Sent)) div 1000 + 1}};
                _ ->
                    Code = gen_code(),
                    Rec = #email_code{email = Email, code = Code, purpose = register,
                                      expires_at = Now + ?TTL_MS, attempts = 0, sent_at = Now},
                    ok = mnesia:dirty_write(Rec),
                    Text = <<"Your Bosun verification code is: ", Code/binary,
                             "\n\nIt expires in 15 minutes. If you did not request it, ignore this email.\n">>,
                    case bosun_mailer:send(Email, <<"Bosun 注册验证码 / verification code"/utf8>>, Text) of
                        ok ->
                            {ok, #{<<"email">> => Email,
                                   <<"delivery">> => atom_to_binary(bosun_mailer:mode(), utf8),
                                   <<"expires_in">> => ?TTL_MS div 1000}};
                        {error, R} ->
                            mnesia:dirty_delete(email_code, Email),
                            {error, {mail_failed, R}}
                    end
            end;
        {error, _} = E -> E
    end.

%% @doc 校验但不消费（注册事务里先 verify，成功后 consume）。
-spec verify(binary(), term()) -> ok | {error, code_expired | code_mismatch | {invalid, code, binary()}}.
verify(Email, Code0) ->
    Code = bosun_util:trim(Code0),
    Now = bosun_util:now_ms(),
    case mnesia:dirty_read(email_code, Email) of
        [] -> {error, code_expired};
        [#email_code{expires_at = Exp}] when Exp < Now ->
            mnesia:dirty_delete(email_code, Email),
            {error, code_expired};
        [#email_code{attempts = A}] when A >= ?MAX_ATTEMPTS ->
            mnesia:dirty_delete(email_code, Email),
            {error, code_expired};
        [#email_code{code = Code}] -> ok;
        [R] ->
            ok = mnesia:dirty_write(R#email_code{attempts = R#email_code.attempts + 1}),
            {error, code_mismatch}
    end.

-spec consume(binary()) -> ok.
consume(Email) ->
    mnesia:dirty_delete(email_code, Email).

%% @doc 只给测试：看当前验证码。
-spec peek(binary()) -> {ok, binary()} | error.
peek(Email0) ->
    case mnesia:dirty_read(email_code, string:lowercase(bosun_util:trim(Email0))) of
        [#email_code{code = C}] -> {ok, C};
        [] -> error
    end.

gen_code() ->
    <<N:32>> = crypto:strong_rand_bytes(4),
    iolist_to_binary(io_lib:format("~6..0B", [N rem 1000000])).
