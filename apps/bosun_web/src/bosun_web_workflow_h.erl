%%%-------------------------------------------------------------------
%%% @doc GET /api/v1/workflow.md[?lang=zh|en] —— 协作工作流文档原文（text/markdown）。
%%%-------------------------------------------------------------------
-module(bosun_web_workflow_h).

-export([init/2]).

init(Req0, State) ->
    Lang = proplists:get_value(<<"lang">>, cowboy_req:parse_qs(Req0), <<"zh">>),
    Req = case bosun_workflow:doc(Lang) of
              {ok, Doc} ->
                  cowboy_req:reply(200, #{<<"content-type">> => <<"text/markdown; charset=utf-8">>}, Doc, Req0);
              {error, {invalid, lang, _}} ->
                  bosun_web_api:reply_error(Req0, {invalid, lang, <<"zh | en">>});
              {error, Reason} ->
                  bosun_web_api:reply_error(Req0, Reason)
          end,
    {ok, Req, State}.
