%%%-------------------------------------------------------------------
%%% @doc 密码哈希：PBKDF2-HMAC-SHA256，随机盐，常量时间比较。
%%%-------------------------------------------------------------------
-module(bosun_password).

-export([hash/1, verify/2, validate/1]).

-define(ITER, 120000).
-define(KEYLEN, 32).
-define(MIN_LEN, 8).
-define(MAX_LEN, 128).

-type hashed() :: {pbkdf2_sha256, pos_integer(), binary(), binary()}.
-export_type([hashed/0]).

%% @doc 校验明文密码的强度（长度）。
-spec validate(term()) -> {ok, binary()} | {error, {invalid, password, binary()}}.
validate(Pw) when is_binary(Pw) ->
    case string:length(Pw) of
        L when L < ?MIN_LEN -> {error, {invalid, password, <<"must be at least 8 characters">>}};
        L when L > ?MAX_LEN -> {error, {invalid, password, <<"must be at most 128 characters">>}};
        _ -> {ok, Pw}
    end;
validate(_) -> {error, {invalid, password, <<"must be a string">>}}.

-spec hash(binary()) -> hashed().
hash(Pw) when is_binary(Pw) ->
    Salt = crypto:strong_rand_bytes(16),
    {pbkdf2_sha256, ?ITER, Salt, crypto:pbkdf2_hmac(sha256, Pw, Salt, ?ITER, ?KEYLEN)}.

-spec verify(term(), hashed() | term()) -> boolean().
verify(Pw, {pbkdf2_sha256, Iter, Salt, Hash}) when is_binary(Pw) ->
    crypto:hash_equals(crypto:pbkdf2_hmac(sha256, Pw, Salt, Iter, byte_size(Hash)), Hash);
verify(_, _) -> false.
