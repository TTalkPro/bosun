%%%-------------------------------------------------------------------
%%% @doc GET /api/v1/actors —— 出现过的操作者（人 / Agent）
%%%-------------------------------------------------------------------
-module(bosun_web_actors_h).

-export([init/2]).

-import(bosun_web_api, [reply/3, method_not_allowed/2]).

init(Req0, State) ->
    Req = case cowboy_req:method(Req0) of
              <<"GET">> ->
                  {ok, As} = bosun_actor:list(),
                  reply(200, #{<<"actors">> => As}, Req0);
              _ -> method_not_allowed(Req0, <<"GET">>)
          end,
    {ok, Req, State}.
