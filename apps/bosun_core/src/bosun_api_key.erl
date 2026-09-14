%%%-------------------------------------------------------------------
%%% @doc 用户的 API key（MCP / REST 的 Bearer）。明文 `bsk_<40 hex>' 只在创建时返回一次，
%%% 表里存 sha256 与展示用前缀。撤销写 `revoked_at'，不删。
%%%-------------------------------------------------------------------
-module(bosun_api_key).

-include("bosun.hrl").

-export([create/2, list/1, revoke/2, authenticate/1, to_map/1]).

-define(PREFIX, <<"bsk_">>).
-define(TOUCH_MS, 60 * 1000).
-define(MAX_NAME, 64).

%% @doc 建 key。返回的 map 多一个 <<"key">>（明文）。
-spec create(binary(), term()) -> {ok, map()} | {error, term()}.
create(UserId, Name0) ->
    Name = case bosun_util:trim(Name0) of
               <<>> -> <<"default">>;
               N -> N
           end,
    case string:length(Name) =< ?MAX_NAME of
        false -> {error, {invalid, name, <<"at most 64 characters">>}};
        true ->
            Secret = binary:encode_hex(crypto:strong_rand_bytes(20), lowercase),
            Plain = <<?PREFIX/binary, Secret/binary>>,
            Now = bosun_util:now_ms(),
            Id = <<"k", (integer_to_binary(bosun_store:next_id(api_key)))/binary>>,
            K = #api_key{id = Id, user_id = UserId, hash = hash(Plain), name = Name,
                         prefix = binary:part(Plain, 0, byte_size(?PREFIX) + 6),
                         created_at = Now, last_used_at = undefined, revoked_at = undefined},
            case bosun_store:transaction(fun() ->
                     case mnesia:read(user, UserId) of
                         [_] -> ok = mnesia:write(K);
                         [] -> bosun_store:abort(not_found)
                     end
                 end) of
                {ok, ok} -> {ok, (to_map(K))#{<<"key">> => Plain}};
                {error, _} = E -> E
            end
    end.

%% @doc 用户自己的 key，按创建时间；含已撤销的。
-spec list(binary()) -> {ok, [map()]}.
list(UserId) ->
    Ks = mnesia:dirty_index_read(api_key, UserId, #api_key.user_id),
    {ok, [to_map(K) || K <- lists:sort(fun(A, B) -> A#api_key.created_at =< B#api_key.created_at end, Ks)]}.

%% @doc 撤销自己的 key；别人的按不存在处理。已撤销的再撤销是幂等的。
-spec revoke(binary(), binary()) -> {ok, map()} | {error, not_found}.
revoke(UserId, Id) ->
    Res = bosun_store:transaction(fun() ->
        case mnesia:read(api_key, Id, write) of
            [#api_key{user_id = UserId, revoked_at = undefined} = K] ->
                K1 = K#api_key{revoked_at = bosun_util:now_ms()},
                ok = mnesia:write(K1),
                K1;
            [#api_key{user_id = UserId} = K] -> K;
            _ -> bosun_store:abort(not_found)
        end
    end),
    case Res of
        {ok, K} -> {ok, to_map(K)};
        {error, _} = E -> E
    end.

%% @doc Bearer 明文 → 主体。撤销 / 用户停用 / 不存在都是 unauthorized。
-spec authenticate(term()) -> {ok, bosun_scope:principal()} | {error, unauthorized}.
authenticate(Plain) when is_binary(Plain), byte_size(Plain) > 4 ->
    case mnesia:dirty_index_read(api_key, hash(Plain), #api_key.hash) of
        [#api_key{revoked_at = undefined, user_id = UserId, id = Id} = K] ->
            case bosun_user:principal(UserId, #{via => api_key, key_id => Id}) of
                {ok, P} -> touch(K), {ok, P};
                {error, _} -> {error, unauthorized}
            end;
        _ -> {error, unauthorized}
    end;
authenticate(_) -> {error, unauthorized}.

-spec to_map(#api_key{}) -> map().
to_map(#api_key{} = K) ->
    #{<<"id">> => K#api_key.id, <<"user_id">> => K#api_key.user_id, <<"name">> => K#api_key.name,
      <<"prefix">> => K#api_key.prefix,
      <<"created_at">> => bosun_json:iso8601(K#api_key.created_at),
      <<"last_used_at">> => opt_time(K#api_key.last_used_at),
      <<"revoked_at">> => opt_time(K#api_key.revoked_at),
      <<"status">> => case K#api_key.revoked_at of undefined -> <<"active">>; _ -> <<"revoked">> end}.

opt_time(undefined) -> undefined;
opt_time(T) -> bosun_json:iso8601(T).

touch(#api_key{last_used_at = Last} = K) ->
    Now = bosun_util:now_ms(),
    case Last =:= undefined orelse Now - Last > ?TOUCH_MS of
        true -> mnesia:dirty_write(K#api_key{last_used_at = Now});
        false -> ok
    end.

hash(Plain) -> crypto:hash(sha256, Plain).
