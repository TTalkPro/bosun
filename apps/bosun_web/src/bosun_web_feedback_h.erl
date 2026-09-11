%%%-------------------------------------------------------------------
%%% @doc /api/v1/tasks/:id/feedback · PATCH /api/v1/tasks/:id/feedback/:seq（修订）
%%%-------------------------------------------------------------------
-module(bosun_web_feedback_h).

-export([init/2]).

-import(bosun_web_api, [reply_result/3, with_body/2, method_not_allowed/2]).

init(Req0, State) ->
    Id = cowboy_req:binding(id, Req0),
    Seq = cowboy_req:binding(seq, Req0),
    Req = case {cowboy_req:method(Req0), Seq} of
              {<<"PATCH">>, Seq} when Seq =/= undefined ->
                  FeedbackId = <<Id/binary, "#", Seq/binary>>,
                  with_body(Req0, fun(Body, Req1) ->
                      Input = Body#{<<"actor">> => maps:get(<<"actor">>, Body, <<"user">>),
                                    <<"actor_kind">> => maps:get(<<"actor_kind">>, Body, <<"human">>)},
                      %% 修订 = 新建一条，所以 201
                      reply_result(201, bosun_feedback:revise(FeedbackId, Input), Req1)
                  end);
              {_, Seq} when Seq =/= undefined ->
                  method_not_allowed(Req0, <<"PATCH">>);
              {<<"GET">>, _} ->
                  case bosun_feedback:list(Id) of
                      {ok, Fs} -> reply_result(200, {ok, #{<<"feedback">> => Fs}}, Req0);
                      E -> reply_result(200, E, Req0)
                  end;
              {<<"POST">>, _} ->
                  with_body(Req0, fun(Body, Req1) ->
                      %% REST 来的默认是人；MCP 那边走会话身份
                      Input = Body#{<<"author_kind">> => maps:get(<<"author_kind">>, Body, <<"human">>)},
                      reply_result(201, bosun_feedback:add(Id, Input), Req1)
                  end);
              _ ->
                  method_not_allowed(Req0, <<"GET, POST">>)
          end,
    {ok, Req, State}.
