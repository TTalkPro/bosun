%%%-------------------------------------------------------------------
%%% @doc 用户的 API key（MCP / REST 的 Bearer）。明文 `bsk_<40 hex>' 只在创建时返回一次，
%%% 表里存 sha256 与展示用前缀。撤销写 `revoked_at'，不删。
%%%-------------------------------------------------------------------
-module(bosun_api_key).

-include("bosun.hrl").

-export([create/2, create/3, rotate/2, list/1, revoke/2, authenticate/1, to_map/1]).

-define(PREFIX, <<"bsk_">>).
-define(TOUCH_MS, 60 * 1000).
-define(MAX_NAME, 64).
-define(SCOPES, [<<"read">>, <<"write">>, <<"manage">>]).

%% @doc 建 key。返回的 map 多一个 <<"key">>（明文）。
-spec create(binary(), term()) -> {ok, map()} | {error, term()}.
create(UserId, Name0) ->
    create(UserId, Name0, #{}).

%% @doc 建 key。Input 可带 scopes / project_keys / expires_at；缺省为只读（安全缺省）。
-spec create(binary(), term(), map()) -> {ok, map()} | {error, term()}.
create(UserId, Name0, Input) when is_map(Input) ->
    Name = case bosun_util:trim(Name0) of
               <<>> -> <<"default">>;
               N -> N
           end,
    case {string:length(Name) =< ?MAX_NAME, parse_scopes(maps:get(<<"scopes">>, Input, [<<"read">>])),
          parse_project_keys(maps:get(<<"project_keys">>, Input, undefined)),
          parse_expires_at(maps:get(<<"expires_at">>, Input, undefined))} of
        {false, _, _, _} -> {error, {invalid, name, <<"at most 64 characters">>}};
        {_, {error, _} = E, _, _} -> E;
        {_, _, {error, _} = E, _} -> E;
        {_, _, _, {error, _} = E} -> E;
        {true, {ok, Scopes}, {ok, ProjectKeys}, {ok, ExpiresAt}} ->
            Secret = binary:encode_hex(crypto:strong_rand_bytes(20), lowercase),
            Plain = <<?PREFIX/binary, Secret/binary>>,
            Now = bosun_util:now_ms(),
            Id = <<"k", (integer_to_binary(bosun_store:next_id(api_key)))/binary>>,
            K = #api_key{id = Id, user_id = UserId, hash = hash(Plain), name = Name,
                         prefix = binary:part(Plain, 0, byte_size(?PREFIX) + 6),
                         scopes = Scopes, project_keys = ProjectKeys, expires_at = ExpiresAt,
                         created_at = Now, rotated_at = undefined,
                         last_used_at = undefined, revoked_at = undefined},
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

%% @doc 轮换秘密值：保留权限配置和创建时间；只替换 hash / prefix，并让旧明文立即失效。
-spec rotate(binary(), binary()) -> {ok, map()} | {error, not_found}.
rotate(UserId, Id) ->
    Res = bosun_store:transaction(fun() ->
        case mnesia:read(api_key, Id, write) of
            [#api_key{user_id = UserId, revoked_at = undefined} = K] ->
                Secret = binary:encode_hex(crypto:strong_rand_bytes(20), lowercase),
                Plain = <<?PREFIX/binary, Secret/binary>>,
                K1 = K#api_key{hash = hash(Plain),
                               prefix = binary:part(Plain, 0, byte_size(?PREFIX) + 6),
                               rotated_at = bosun_util:now_ms(),
                               last_used_at = undefined},
                ok = mnesia:write(K1),
                {Plain, K1};
            _ -> bosun_store:abort(not_found)
        end
    end),
    case Res of
        {ok, {Plain, K}} -> {ok, (to_map(K))#{<<"key">> => Plain}};
        {error, _} = E -> E
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
            Expired = K#api_key.expires_at =/= undefined
                      andalso K#api_key.expires_at =< bosun_util:now_ms(),
            Extra = #{via => api_key, key_id => Id,
                      scopes => legacy_scopes(K#api_key.scopes),
                      project_keys => K#api_key.project_keys},
            case Expired of
                true -> {error, unauthorized};
                false ->
                    case bosun_user:principal(UserId, Extra) of
                        {ok, P} -> touch(K), {ok, P};
                        {error, _} -> {error, unauthorized}
                    end
            end;
        _ -> {error, unauthorized}
    end;
authenticate(_) -> {error, unauthorized}.

-spec to_map(#api_key{}) -> map().
to_map(#api_key{} = K) ->
    #{<<"id">> => K#api_key.id, <<"user_id">> => K#api_key.user_id, <<"name">> => K#api_key.name,
      <<"prefix">> => K#api_key.prefix,
      <<"scopes">> => legacy_scopes(K#api_key.scopes),
      <<"project_keys">> => K#api_key.project_keys,
      <<"expires_at">> => opt_time(K#api_key.expires_at),
      <<"created_at">> => bosun_json:iso8601(K#api_key.created_at),
      <<"rotated_at">> => opt_time(K#api_key.rotated_at),
      <<"last_used_at">> => opt_time(K#api_key.last_used_at),
      <<"revoked_at">> => opt_time(K#api_key.revoked_at),
      <<"status">> => case K#api_key.revoked_at of undefined -> <<"active">>; _ -> <<"revoked">> end}.

opt_time(undefined) -> undefined;
opt_time(T) -> bosun_json:iso8601(T).

%% 事务里重读再写：脏写整条记录会把并发的撤销 / 轮换覆盖回去（撤销了的 key 又活过来）。
touch(#api_key{id = Id, hash = Hash, last_used_at = Last}) ->
    Now = bosun_util:now_ms(),
    case Last =:= undefined orelse Now - Last > ?TOUCH_MS of
        true ->
            _ = bosun_store:transaction(fun() ->
                case mnesia:read(api_key, Id, write) of
                    [#api_key{hash = Hash, revoked_at = undefined} = Cur] ->
                        mnesia:write(Cur#api_key{last_used_at = Now});
                    _ -> ok
                end
            end),
            ok;
        false -> ok
    end.

hash(Plain) -> crypto:hash(sha256, Plain).

legacy_scopes(undefined) -> [<<"*">>];
legacy_scopes(Scopes) when is_list(Scopes) -> Scopes.

parse_scopes(undefined) -> {ok, [<<"read">>]};
parse_scopes(null) -> {ok, [<<"read">>]};
parse_scopes(Scopes) when is_list(Scopes) ->
    Clean = lists:usort([string:lowercase(bosun_util:trim(S)) ||
                            S <- Scopes, bosun_util:trim(S) =/= <<>>]),
    case lists:all(fun(S) -> lists:member(S, [<<"*">> | ?SCOPES]) end, Clean) of
        true -> {ok, Clean};
        false -> {error, {invalid, scopes, <<"expected read, write or manage">>}}
    end;
parse_scopes(_) -> {error, {invalid, scopes, <<"expected a list of scopes">>}}.

parse_project_keys(undefined) -> {ok, undefined};
parse_project_keys(null) -> {ok, undefined};
parse_project_keys(Keys) when is_list(Keys) ->
    Clean = lists:usort([string:uppercase(bosun_util:trim(K)) ||
                            K <- Keys, bosun_util:trim(K) =/= <<>>]),
    Valid = fun(K) -> K =:= <<"*">> orelse element(1, bosun_id:validate_key(K)) =:= ok end,
    case lists:all(Valid, Clean) of
        true -> {ok, Clean};
        false -> {error, {invalid, project_keys, <<"expected project keys like BOS">>}}
    end;
parse_project_keys(_) -> {error, {invalid, project_keys, <<"expected a list of project keys">>}}.

parse_expires_at(undefined) -> {ok, undefined};
parse_expires_at(null) -> {ok, undefined};
parse_expires_at(N) when is_integer(N) ->
    case N > bosun_util:now_ms() of
        true -> {ok, N};
        false -> {error, {invalid, expires_at, <<"expected a future unix timestamp in milliseconds">>}}
    end;
parse_expires_at(_) -> {error, {invalid, expires_at, <<"expected a future unix timestamp in milliseconds">>}}.
