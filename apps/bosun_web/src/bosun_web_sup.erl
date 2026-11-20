%%%-------------------------------------------------------------------
%%% @doc 起 cowboy 监听。listener 由 ranch 自己监督，这里只负责在启动时
%%% 把它拉起来；supervisor 没有子进程。
%%%-------------------------------------------------------------------
-module(bosun_web_sup).
-behaviour(supervisor).

-export([start_link/0, init/1, port/0]).

start_link() ->
    supervisor:start_link({local, ?MODULE}, ?MODULE, []).

init([]) ->
    %% 环境变量优先：BOSUN_HTTP_IP / BOSUN_HTTP_PORT（release 部署时不用改 sys.config）
    Ip = env_ip(application:get_env(bosun_web, ip, {127,0,0,1})),
    Port = env_int("BOSUN_HTTP_PORT", application:get_env(bosun_web, port, 4000)),
    Dispatch = bosun_web_router:dispatch(),
    {ok, _} = cowboy:start_clear(bosun_http,
                                 [{ip, Ip}, {port, Port}],
                                 #{env => #{dispatch => Dispatch},
                                   middlewares => bosun_web_router:middlewares()}),
    logger:notice("bosun listening on http://~s:~b (REST /api/v1, MCP /mcp)",
                  [inet:ntoa(Ip), port()]),
    {ok, {#{strategy => one_for_one, intensity => 5, period => 10}, []}}.

env_ip(Default) ->
    case os:getenv("BOSUN_HTTP_IP") of
        false -> Default;
        "" -> Default;
        Str ->
            case inet:parse_address(Str) of
                {ok, Ip} -> Ip;
                {error, _} -> logger:warning("BOSUN_HTTP_IP=~s is not an IP, using default", [Str]), Default
            end
    end.

env_int(Var, Default) ->
    case os:getenv(Var) of
        false -> Default;
        "" -> Default;
        Str ->
            try list_to_integer(Str)
            catch error:badarg -> logger:warning("~s=~s is not a number, using default", [Var, Str]), Default
            end
    end.

%% @doc 实际监听端口（配置 0 时由系统分配，测试用）。
-spec port() -> inet:port_number().
port() ->
    ranch:get_port(bosun_http).
