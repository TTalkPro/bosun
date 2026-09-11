%%%-------------------------------------------------------------------
%%% @doc 保存的 BQL 筛选器（JIRA 的 saved filter）。
%%%-------------------------------------------------------------------
-module(bosun_filter).

-include("bosun.hrl").

-export([create/1, get/1, list/0, update/2, delete/1, run/2]).

%% @doc Input: #{<<"name">>, <<"query">>}；query 先过一遍解析，语法错直接拒绝
-spec create(map()) -> {ok, map()} | {error, term()}.
create(Input) when is_map(Input) ->
    case validate(Input, #{}) of
        {ok, Name, Query} ->
            Now = bosun_util:now_ms(),
            Id = <<"f", (integer_to_binary(bosun_store:next_id(filter)))/binary>>,
            F = #filter{id = Id, name = Name, query = Query, created_at = Now, updated_at = Now},
            bosun_store:transaction(fun() -> ok = mnesia:write(F), to_map(F) end);
        {error, _} = E -> E
    end.

-spec get(term()) -> {ok, map()} | {error, not_found}.
get(Id0) ->
    Id = bosun_util:trim(Id0),
    case mnesia:dirty_read(filter, Id) of
        [F] -> {ok, to_map(F)};
        [] -> {error, not_found}
    end.

-spec list() -> {ok, [map()]}.
list() ->
    All = mnesia:dirty_select(filter, [{'_', [], ['$_']}]),
    {ok, [to_map(F) || F <- lists:sort(fun(A, B) -> A#filter.created_at =< B#filter.created_at end, All)]}.

-spec update(term(), map()) -> {ok, map()} | {error, term()}.
update(Id0, Input) when is_map(Input) ->
    Id = bosun_util:trim(Id0),
    bosun_store:transaction(fun() ->
        case mnesia:read(filter, Id, write) of
            [] -> bosun_store:abort(not_found);
            [F0] ->
                case validate(Input, #{name => F0#filter.name, query => F0#filter.query}) of
                    {ok, Name, Query} ->
                        F = F0#filter{name = Name, query = Query, updated_at = bosun_util:now_ms()},
                        ok = mnesia:write(F),
                        to_map(F);
                    {error, R} -> bosun_store:abort(R)
                end
        end
    end).

-spec delete(term()) -> ok | {error, not_found}.
delete(Id0) ->
    Id = bosun_util:trim(Id0),
    case bosun_store:transaction(fun() ->
             case mnesia:read(filter, Id, write) of
                 [] -> bosun_store:abort(not_found);
                 [_] -> mnesia:delete({filter, Id})
             end
         end) of
        {ok, ok} -> ok;
        {error, _} = E -> E
    end.

%% @doc 执行保存的筛选器。
-spec run(term(), map()) -> {ok, map()} | {error, term()}.
run(Id, Opts) ->
    case ?MODULE:get(Id) of
        {ok, #{<<"query">> := Q} = F} ->
            case bosun_bql:query(Q, Opts) of
                {ok, Res} -> {ok, Res#{<<"filter">> => F}};
                E -> E
            end;
        E -> E
    end.

%%====================================================================

validate(Input, Defaults) ->
    Name = case bosun_util:get_opt_bin(<<"name">>, Input) of
               undefined -> maps:get(name, Defaults, <<>>);
               N -> N
           end,
    Query = case bosun_util:get_opt_bin(<<"query">>, Input) of
                undefined -> maps:get(query, Defaults, <<>>);
                Q -> Q
            end,
    if Name =:= <<>> -> {error, {invalid, name, <<"must not be empty">>}};
       true ->
           case bosun_bql:parse(Query) of
               {ok, _} -> {ok, Name, Query};
               {error, _} = E -> E
           end
    end.

to_map(#filter{} = F) ->
    #{<<"id">> => F#filter.id, <<"name">> => F#filter.name, <<"query">> => F#filter.query,
      <<"created_at">> => bosun_json:iso8601(F#filter.created_at),
      <<"updated_at">> => bosun_json:iso8601(F#filter.updated_at)}.
