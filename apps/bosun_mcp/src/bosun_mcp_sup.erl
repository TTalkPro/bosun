%%%-------------------------------------------------------------------
%%% @doc 只有一个子进程：bosun_identity（会话身份表的宿主）。
%%%-------------------------------------------------------------------
-module(bosun_mcp_sup).
-behaviour(supervisor).

-export([start_link/0, init/1]).

start_link() ->
    supervisor:start_link({local, ?MODULE}, ?MODULE, []).

init([]) ->
    Children = [#{id => bosun_identity, start => {bosun_identity, start_link, []},
                  restart => permanent, shutdown => 5000, type => worker}],
    {ok, {#{strategy => one_for_one, intensity => 5, period => 10}, Children}}.
