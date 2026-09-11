-module(bosun_web_app).
-behaviour(application).

-export([start/2, stop/1]).

start(_Type, _Args) ->
    bosun_web_sup:start_link().

stop(_State) ->
    ok = cowboy:stop_listener(bosun_http).
