%%%-------------------------------------------------------------------
%%% @doc GET /api/v1/search?q=&project=&limit=  —— 跨项目全文检索（BM25）
%%%-------------------------------------------------------------------
-module(bosun_web_search_h).

-export([init/2]).

-import(bosun_web_api, [reply_result/3, query_map/1, method_not_allowed/2]).

init(Req0, State) ->
    Req = case cowboy_req:method(Req0) of
              <<"GET">> ->
                  Q = query_map(Req0),
                  reply_result(200, bosun_task:search(maps:get(<<"q">>, Q, <<>>), Q), Req0);
              _ ->
                  method_not_allowed(Req0, <<"GET">>)
          end,
    {ok, Req, State}.
