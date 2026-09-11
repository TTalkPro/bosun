%%%-------------------------------------------------------------------
%%% @doc bosun_core 应用入口：初始化 Mnesia 后起 supervisor。
%%%-------------------------------------------------------------------
-module(bosun_core_app).
-behaviour(application).

-export([start/2, stop/1]).

start(_Type, _Args) ->
    ok = bosun_store:init(),
    case bosun_actor:backfill() of
        0 -> ok;
        N -> logger:notice("bosun_actor: backfilled ~b actors from history", [N])
    end,
    bosun_core_sup:start_link().

stop(_State) ->
    ok.
