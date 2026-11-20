%%%-------------------------------------------------------------------
%%% @doc 发邮件。配置了 SMTP relay 就用 gen_smtp 同步发；没配置（缺省）走**日志模式**：
%%% 邮件正文打到 logger（notice），开发 / 自用时从服务端日志里拿验证码。
%%%
%%% 配置：`{bosun_core, [{smtp, [{relay, "smtp.x.com"}, {port, 587}, {username, "u"},
%%% {password, "p"}, {from, "bosun@x.com"}, {tls, if_available}]}]}'；
%%% 环境变量 BOSUN_SMTP_RELAY / PORT / USERNAME / PASSWORD / FROM 优先（有 RELAY 即 SMTP 模式）。
%%%-------------------------------------------------------------------
-module(bosun_mailer).

-export([mode/0, send/3, config/0]).

-spec mode() -> smtp | log.
mode() ->
    case proplists:get_value(relay, config()) of
        undefined -> log;
        _ -> smtp
    end.

%% @doc 发一封纯文本邮件。日志模式永远 ok。
-spec send(binary(), binary(), binary()) -> ok | {error, term()}.
send(To, Subject, Text) ->
    case mode() of
        log ->
            logger:notice("bosun_mailer [log mode] to=~s subject=~s~n~s", [To, Subject, Text]),
            ok;
        smtp ->
            Cfg = config(),
            From = bosun_util:to_binary(proplists:get_value(from, Cfg, "bosun@localhost")),
            Msg = message(From, To, Subject, Text),
            Opts = [{K, V} || {K, V} <- Cfg, lists:member(K, [relay, port, username, password, tls, ssl, auth, hostname, retries])],
            case gen_smtp_client:send_blocking({From, [To], Msg}, Opts) of
                Receipt when is_binary(Receipt) -> ok;
                {error, Type, Detail} -> {error, {smtp, Type, Detail}};
                {error, Reason} -> {error, {smtp, Reason}}
            end
    end.

%% @doc 生效的 SMTP 配置（应用 env 与环境变量合并）。
-spec config() -> [{atom(), term()}].
config() ->
    Base = application:get_env(bosun_core, smtp, []),
    Env = lists:filtermap(fun({Var, Key, Conv}) ->
        case os:getenv(Var) of
            false -> false;
            "" -> false;
            V -> {true, {Key, Conv(V)}}
        end
    end, [{"BOSUN_SMTP_RELAY", relay, fun(V) -> V end},
          {"BOSUN_SMTP_PORT", port, fun list_to_integer/1},
          {"BOSUN_SMTP_USERNAME", username, fun(V) -> V end},
          {"BOSUN_SMTP_PASSWORD", password, fun(V) -> V end},
          {"BOSUN_SMTP_FROM", from, fun(V) -> V end}]),
    Merged = lists:foldl(fun({K, V}, Acc) -> lists:keystore(K, 1, Acc, {K, V}) end, Base, Env),
    case proplists:is_defined(username, Merged) andalso not proplists:is_defined(auth, Merged) of
        true -> [{auth, always}, {tls, if_available} | Merged];
        false -> Merged
    end.

message(From, To, Subject, Text) ->
    iolist_to_binary([
        "From: ", From, "\r\n",
        "To: ", To, "\r\n",
        "Subject: =?UTF-8?B?", base64:encode(Subject), "?=\r\n",
        "MIME-Version: 1.0\r\n",
        "Content-Type: text/plain; charset=utf-8\r\n",
        "Content-Transfer-Encoding: base64\r\n",
        "\r\n",
        wrap76(base64:encode(Text))
    ]).

wrap76(<<Line:76/binary, Rest/binary>>) -> [Line, "\r\n" | wrap76(Rest)];
wrap76(Rest) -> [Rest, "\r\n"].
