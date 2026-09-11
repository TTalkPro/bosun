%%%-------------------------------------------------------------------
%%% @doc GET /api/v1/export（下载 JSON） · POST /api/v1/import?mode=replace|merge
%%%-------------------------------------------------------------------
-module(bosun_web_backup_h).

-export([init/2]).

-import(bosun_web_api, [reply_result/3, with_body/2, query_map/1, method_not_allowed/2]).

init(Req0, #{mode := export} = State) ->
    Req = case cowboy_req:method(Req0) of
              <<"GET">> ->
                  {ok, Map} = bosun_backup:export(),
                  Name = <<"bosun-export-", (date_tag())/binary, ".json">>,
                  cowboy_req:reply(200, #{<<"content-type">> => <<"application/json; charset=utf-8">>,
                                          <<"content-disposition">> => <<"attachment; filename=\"", Name/binary, "\"">>},
                                   bosun_json:encode(Map), Req0);
              _ -> method_not_allowed(Req0, <<"GET">>)
          end,
    {ok, Req, State};
init(Req0, #{mode := import} = State) ->
    Req = case cowboy_req:method(Req0) of
              <<"POST">> ->
                  Mode = case maps:get(<<"mode">>, query_map(Req0), <<"merge">>) of
                             <<"replace">> -> replace;
                             _ -> merge
                         end,
                  with_body(Req0, fun(Body, Req1) -> reply_result(200, bosun_backup:import(Body, #{mode => Mode}), Req1) end);
              _ -> method_not_allowed(Req0, <<"POST">>)
          end,
    {ok, Req, State}.

date_tag() ->
    {{Y, M, D}, {H, Mi, _}} = calendar:universal_time(),
    iolist_to_binary(io_lib:format("~4..0B~2..0B~2..0B-~2..0B~2..0B", [Y, M, D, H, Mi])).
