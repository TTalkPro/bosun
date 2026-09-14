%%%-------------------------------------------------------------------
%%% @doc 用户：组织管理员建 / 改，用户自己登录与改密。设计见 designs/13-org-auth.md。
%%%
%%% 显示名 `name' 就是写操作的署名（history.actor / feedback.author），组织内唯一
%%% （不分大小写）。email 全局唯一、小写。
%%%-------------------------------------------------------------------
-module(bosun_user).

-include("bosun.hrl").

-export([create/2, get/1, get_in_org/2, list/1, update/3, authenticate/2, change_password/3,
         to_map/1, principal/2, parse_role/1]).
-export([create_in_tx/2, validate_name/1]).

%% @doc 管理员建用户。Input: #{<<"email">>, <<"name">>, <<"password">>, <<"role">> (缺省 member)}
-spec create(binary(), map()) -> {ok, map()} | {error, term()}.
create(OrgId, Input) when is_map(Input) ->
    case bosun_store:transaction(fun() -> create_in_tx(OrgId, Input) end) of
        {ok, U} -> {ok, to_map(U)};
        {error, _} = E -> E
    end.

%% @doc 事务内建用户（bosun_org:register 也用）。失败以 abort 抛出。
-spec create_in_tx(binary(), map()) -> #user{}.
create_in_tx(OrgId, Input) ->
    Email = case bosun_email_code:validate_email(maps:get(<<"email">>, Input, <<>>)) of
                {ok, E} -> E;
                {error, R1} -> bosun_store:abort(R1)
            end,
    Name = case validate_name(maps:get(<<"name">>, Input, <<>>)) of
               {ok, N} -> N;
               {error, R2} -> bosun_store:abort(R2)
           end,
    Pw = case bosun_password:validate(maps:get(<<"password">>, Input, <<>>)) of
             {ok, P} -> P;
             {error, R3} -> bosun_store:abort(R3)
         end,
    Role = case parse_role(maps:get(<<"role">>, Input, <<"member">>)) of
               {ok, Ro} -> Ro;
               {error, R4} -> bosun_store:abort(R4)
           end,
    case mnesia:index_read(user, Email, #user.email) of
        [] -> ok;
        [_ | _] -> bosun_store:abort({conflict, email})
    end,
    ensure_name_free(OrgId, Name, undefined),
    Now = bosun_util:now_ms(),
    Id = <<"u", (integer_to_binary(bosun_store:next_id(user)))/binary>>,
    U = #user{id = Id, org_id = OrgId, email = Email, name = Name,
              password = bosun_password:hash(Pw), role = Role, status = active,
              created_at = Now, updated_at = Now, last_login_at = undefined},
    ok = mnesia:write(U),
    U.

-spec get(binary()) -> {ok, map()} | {error, not_found}.
get(Id) ->
    case mnesia:dirty_read(user, Id) of
        [U] -> {ok, to_map(U)};
        [] -> {error, not_found}
    end.

%% @doc 组织内取用户；不属于该组织的按不存在处理。
-spec get_in_org(binary(), binary()) -> {ok, map()} | {error, not_found}.
get_in_org(OrgId, Id) ->
    case mnesia:dirty_read(user, Id) of
        [#user{org_id = OrgId} = U] -> {ok, to_map(U)};
        _ -> {error, not_found}
    end.

%% @doc 组织内用户，按创建时间。
-spec list(binary()) -> {ok, [map()]}.
list(OrgId) ->
    Us = mnesia:dirty_index_read(user, OrgId, #user.org_id),
    {ok, [to_map(U) || U <- lists:sort(fun(A, B) -> A#user.created_at =< B#user.created_at end, Us)]}.

%% @doc 管理员改用户：name / role / status / password。最后一个 admin 不能降级或停用。
-spec update(binary(), binary(), map()) -> {ok, map()} | {error, term()}.
update(OrgId, Id, Input) when is_map(Input) ->
    Res = bosun_store:transaction(fun() ->
        case mnesia:read(user, Id, write) of
            [#user{org_id = OrgId} = U0] ->
                U1 = apply_updates(U0, Input),
                case loses_admin(U0, U1) andalso admin_count(OrgId) =< 1 of
                    true -> bosun_store:abort(last_admin);
                    false -> ok
                end,
                U2 = U1#user{updated_at = bosun_util:now_ms()},
                ok = mnesia:write(U2),
                case U2#user.status of
                    disabled -> bosun_session:delete_all_in_tx(Id);
                    active -> ok
                end,
                U2;
            _ -> bosun_store:abort(not_found)
        end
    end),
    case Res of
        {ok, U} -> {ok, to_map(U)};
        {error, _} = E -> E
    end.

%% @doc 登录校验。停用的用户 `user_disabled'；邮箱不存在或密码错都是 `invalid_credentials'。
-spec authenticate(term(), term()) -> {ok, map()} | {error, invalid_credentials | user_disabled}.
authenticate(Email0, Pw) ->
    Email = string:lowercase(bosun_util:trim(Email0)),
    case mnesia:dirty_index_read(user, Email, #user.email) of
        [#user{} = U] ->
            case bosun_password:verify(Pw, U#user.password) of
                true when U#user.status =:= disabled -> {error, user_disabled};
                true ->
                    U1 = U#user{last_login_at = bosun_util:now_ms()},
                    ok = mnesia:dirty_write(U1),
                    {ok, to_map(U1)};
                false -> {error, invalid_credentials}
            end;
        _ ->
            %% 不存在的邮箱也算一次哈希，别让响应时间暴露邮箱是否注册过
            _ = bosun_password:verify(<<"x">>, bosun_password:hash(<<"x">>)),
            {error, invalid_credentials}
    end.

%% @doc 用户自己改密：要给当前密码。
-spec change_password(binary(), term(), term()) -> ok | {error, term()}.
change_password(Id, Current, New) ->
    case bosun_password:validate(New) of
        {ok, NewPw} ->
            Res = bosun_store:transaction(fun() ->
                case mnesia:read(user, Id, write) of
                    [U] ->
                        case bosun_password:verify(Current, U#user.password) of
                            true -> ok = mnesia:write(U#user{password = bosun_password:hash(NewPw),
                                                            updated_at = bosun_util:now_ms()});
                            false -> bosun_store:abort(invalid_credentials)
                        end;
                    [] -> bosun_store:abort(not_found)
                end
            end),
            case Res of {ok, ok} -> ok; {error, _} = E -> E end;
        {error, _} = E -> E
    end.

-spec to_map(#user{}) -> map().
to_map(#user{} = U) ->
    #{<<"id">> => U#user.id, <<"org_id">> => U#user.org_id, <<"email">> => U#user.email,
      <<"name">> => U#user.name, <<"role">> => atom_to_binary(U#user.role, utf8),
      <<"status">> => atom_to_binary(U#user.status, utf8),
      <<"created_at">> => bosun_json:iso8601(U#user.created_at),
      <<"updated_at">> => bosun_json:iso8601(U#user.updated_at),
      <<"last_login_at">> => case U#user.last_login_at of undefined -> undefined; T -> bosun_json:iso8601(T) end}.

%% @doc 用户 → 主体（给 bosun_scope）。Via: session | api_key；Extra 可带 key_id。
-spec principal(binary() | #user{}, map()) -> {ok, bosun_scope:principal()} | {error, not_found | user_disabled}.
principal(Id, Extra) when is_binary(Id) ->
    case mnesia:dirty_read(user, Id) of
        [U] -> principal(U, Extra);
        [] -> {error, not_found}
    end;
principal(#user{status = disabled}, _) -> {error, user_disabled};
principal(#user{} = U, Extra) ->
    {ok, #{user_id => U#user.id, org_id => U#user.org_id, name => U#user.name, email => U#user.email,
           role => U#user.role, via => maps:get(via, Extra, session), key_id => maps:get(key_id, Extra, undefined)}}.

-spec parse_role(term()) -> {ok, admin | member} | {error, term()}.
parse_role(admin) -> {ok, admin};
parse_role(member) -> {ok, member};
parse_role(undefined) -> {ok, member};
parse_role(null) -> {ok, member};
parse_role(Bin) when is_binary(Bin) ->
    case string:lowercase(bosun_util:trim(Bin)) of
        <<"admin">> -> {ok, admin};
        <<"member">> -> {ok, member};
        <<>> -> {ok, member};
        _ -> {error, {invalid, role, <<"expected admin or member">>}}
    end;
parse_role(_) -> {error, {invalid, role, <<"expected admin or member">>}}.

%% @doc 显示名：非空、≤ 64、不含换行。
-spec validate_name(term()) -> {ok, binary()} | {error, {invalid, name, binary()}}.
validate_name(N0) ->
    N = bosun_util:trim(N0),
    case N of
        <<>> -> {error, {invalid, name, <<"must not be empty">>}};
        _ ->
            case string:length(N) =< 64 andalso binary:match(N, [<<"\n">>, <<"\r">>]) =:= nomatch of
                true -> {ok, N};
                false -> {error, {invalid, name, <<"at most 64 characters, no line breaks">>}}
            end
    end.

%%====================================================================

apply_updates(U, Input) ->
    maps:fold(fun
        (<<"name">>, V, Acc) ->
            case validate_name(V) of
                {ok, N} -> ensure_name_free(Acc#user.org_id, N, Acc#user.id), Acc#user{name = N};
                {error, R} -> bosun_store:abort(R)
            end;
        (<<"role">>, V, Acc) ->
            case parse_role(V) of
                {ok, R} -> Acc#user{role = R};
                {error, E} -> bosun_store:abort(E)
            end;
        (<<"status">>, V, Acc) ->
            case string:lowercase(bosun_util:trim(V)) of
                <<"active">> -> Acc#user{status = active};
                <<"disabled">> -> Acc#user{status = disabled};
                _ -> bosun_store:abort({invalid, status, <<"expected active or disabled">>})
            end;
        (<<"password">>, V, Acc) ->
            case bosun_password:validate(V) of
                {ok, P} -> Acc#user{password = bosun_password:hash(P)};
                {error, E} -> bosun_store:abort(E)
            end;
        (_, _, Acc) -> Acc
    end, U, Input).

loses_admin(#user{role = admin, status = active}, #user{role = R, status = S}) ->
    R =/= admin orelse S =/= active;
loses_admin(_, _) -> false.

admin_count(OrgId) ->
    length([1 || #user{role = admin, status = active} <- mnesia:index_read(user, OrgId, #user.org_id)]).

%% 组织内显示名唯一（不分大小写）；ExceptId 是自己
ensure_name_free(OrgId, Name, ExceptId) ->
    Lower = string:lowercase(Name),
    Clash = [U || #user{id = Id, name = N} = U <- mnesia:index_read(user, OrgId, #user.org_id),
                  Id =/= ExceptId, string:lowercase(N) =:= Lower],
    case Clash of
        [] -> ok;
        _ -> bosun_store:abort({conflict, name})
    end.
