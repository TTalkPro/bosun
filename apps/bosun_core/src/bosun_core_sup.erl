%%%-------------------------------------------------------------------
%%% @doc bosun_core 顶层 supervisor：全文索引 bosun_search 与限流计数表 bosun_rate_limit。
%%%-------------------------------------------------------------------
-module(bosun_core_sup).
-behaviour(supervisor).

-export([start_link/0, init/1]).

start_link() ->
    supervisor:start_link({local, ?MODULE}, ?MODULE, []).

init([]) ->
    Children = [#{id => bosun_search, start => {bosun_search, start_link, []},
                  restart => permanent, shutdown => 5000, type => worker},
                #{id => bosun_rate_limit, start => {bosun_rate_limit, start_link, []},
                  restart => permanent, shutdown => 1000, type => worker}],
    {ok, {#{strategy => one_for_one, intensity => 5, period => 10}, Children}}.
