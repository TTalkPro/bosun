%%%-------------------------------------------------------------------
%%% @doc 登录会话。表里只存 token 的 sha256；明文 token 只回给调用方放 Cookie。
%%% 30 天不活动过期；`last_seen_at' 每分钟最多写一次。
%%%-------------------------------------------------------------------
-module(bosun_session).

-include("bosun.hrl").

-export([create/1, lookup/1, delete/1, delete_all/1, delete_all_in_tx/1, ttl_seconds/0]).

-define(TTL_MS, 30 * 24 * 60 * 60 * 1000).
-define(TOUCH_MS, 60 * 1000).

-spec ttl_seconds() -> pos_integer().
ttl_seconds() -> ?TTL_MS div 1000.

%% @doc 给用户开一个会话，返回明文 token。顺手清掉该用户已过期的会话。
-spec create(binary()) -> {ok, binary()}.
create(UserId) ->
    Now = bosun_util:now_ms(),
    Token = base64:encode(crypto:strong_rand_bytes(32), #{mode => urlsafe, padding => false}),
    Rec = #session{id = hash(Token), user_id = UserId, created_at = Now,
                   expires_at = Now + ?TTL_MS, last_seen_at = Now},
    ok = mnesia:dirty_write(Rec),
    lists:foreach(fun(#session{id = Id, expires_at = Exp}) when Exp < Now -> mnesia:dirty_delete(session, Id);
                     (_) -> ok
                  end, mnesia:dirty_index_read(session, UserId, #session.user_id)),
    {ok, Token}.

%% @doc token → 主体。过期 / 不存在 / 用户停用都是 error。
-spec lookup(term()) -> {ok, bosun_scope:principal()} | {error, unauthorized}.
lookup(Token) when is_binary(Token), Token =/= <<>> ->
    Now = bosun_util:now_ms(),
    case mnesia:dirty_read(session, hash(Token)) of
        [#session{expires_at = Exp, id = Id}] when Exp < Now ->
            mnesia:dirty_delete(session, Id),
            {error, unauthorized};
        [#session{user_id = UserId, last_seen_at = Seen} = S] ->
            case Now - Seen > ?TOUCH_MS of
                true -> mnesia:dirty_write(S#session{last_seen_at = Now, expires_at = Now + ?TTL_MS});
                false -> ok
            end,
            case bosun_user:principal(UserId, #{via => session}) of
                {ok, P} -> {ok, P};
                {error, _} -> {error, unauthorized}
            end;
        [] -> {error, unauthorized}
    end;
lookup(_) -> {error, unauthorized}.

-spec delete(term()) -> ok.
delete(Token) when is_binary(Token) -> mnesia:dirty_delete(session, hash(Token));
delete(_) -> ok.

%% @doc 踢掉用户的全部会话（停用 / 改密时）。
-spec delete_all(binary()) -> ok.
delete_all(UserId) ->
    lists:foreach(fun(#session{id = Id}) -> mnesia:dirty_delete(session, Id) end,
                  mnesia:dirty_index_read(session, UserId, #session.user_id)).

-spec delete_all_in_tx(binary()) -> ok.
delete_all_in_tx(UserId) ->
    lists:foreach(fun(#session{id = Id}) -> mnesia:delete({session, Id}) end,
                  mnesia:index_read(session, UserId, #session.user_id)).

hash(Token) -> crypto:hash(sha256, Token).
