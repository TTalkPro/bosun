%%%-------------------------------------------------------------------
%%% @doc GET /api/v1/stats?days=14&tz=480[&project=KEY] —— 项目总览统计（bosun_stats:overview/1）。
%%% 给了 project 只统计该项目（看不到的项目 404）。
%%% tz：时区偏移分钟数，东正西负（JS 里是 -new Date().getTimezoneOffset()）。
%%%-------------------------------------------------------------------
-module(bosun_web_stats_h).

-export([init/2]).

-import(bosun_web_api, [reply_result/3, query_map/1, method_not_allowed/2]).

init(Req0, State) ->
    Req = case cowboy_req:method(Req0) of
              <<"GET">> ->
                  Q = query_map(Req0),
                  Opts0 = #{days => int(maps:get(<<"days">>, Q, undefined), 14),
                            tz_offset => int(maps:get(<<"tz">>, Q, undefined), 0)},
                  Opts = case maps:get(<<"project">>, Q, <<>>) of
                             <<>> -> Opts0;
                             Key -> Opts0#{project => Key}
                         end,
                  reply_result(200, bosun_stats:overview(Opts), Req0);
              _ ->
                  method_not_allowed(Req0, <<"GET">>)
          end,
    {ok, Req, State}.

%% 参数写坏了按缺省处理：这是只读的展示接口，没必要 400
int(V, Default) when is_binary(V) ->
    try binary_to_integer(V) catch error:badarg -> Default end;
int(_, Default) -> Default.
