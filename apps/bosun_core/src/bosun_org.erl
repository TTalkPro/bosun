%%%-------------------------------------------------------------------
%%% @doc 组织：注册（邮箱验证码 → 组织 + 管理员）、查询 / 改名、收编孤儿项目。
%%% 设计见 designs/13-org-auth.md。
%%%-------------------------------------------------------------------
-module(bosun_org).

-include("bosun.hrl").

-export([request_code/1, register/1, get/1, update/2, adopt_orphans/1, to_map/1]).

-define(MAX_NAME, 100).

%% @doc 注册第一步：给邮箱发验证码。
-spec request_code(term()) -> {ok, map()} | {error, term()}.
request_code(Email) -> bosun_email_code:request(Email).

%% @doc 注册第二步：验证码对上就建组织 + 管理员。
%% Input: #{<<"org_name">>, <<"email">>, <<"code">>, <<"name">>, <<"password">>}
%% 返回 #{<<"org">>, <<"user">>}
-spec register(map()) -> {ok, map()} | {error, term()}.
register(Input) when is_map(Input) ->
    with_valid(Input, fun(OrgName, Email) ->
        case bosun_email_code:verify(Email, maps:get(<<"code">>, Input, <<>>)) of
            ok ->
                Res = bosun_store:transaction(fun() ->
                    Now = bosun_util:now_ms(),
                    OrgId = <<"o", (integer_to_binary(bosun_store:next_id(org)))/binary>>,
                    U0 = bosun_user:create_in_tx(OrgId, Input#{<<"email">> => Email, <<"role">> => <<"admin">>}),
                    %% 注册即登录
                    U = U0#user{last_login_at = Now},
                    ok = mnesia:write(U),
                    O = #org{id = OrgId, name = OrgName, created_by = U#user.id,
                             created_at = Now, updated_at = Now},
                    ok = mnesia:write(O),
                    {O, U}
                end),
                case Res of
                    {ok, {O, U}} ->
                        ok = bosun_email_code:consume(Email),
                        ok = bosun_actor:touch(U#user.name, human, #{org_id => O#org.id, user_id => U#user.id}),
                        {ok, #{<<"org">> => to_map(O), <<"user">> => bosun_user:to_map(U)}};
                    {error, _} = E -> E
                end;
            {error, _} = E -> E
        end
    end).

-spec get(binary()) -> {ok, map()} | {error, not_found}.
get(Id) ->
    case mnesia:dirty_read(org, Id) of
        [O] -> {ok, to_map(O)};
        [] -> {error, not_found}
    end.

%% @doc 改名。
-spec update(binary(), map()) -> {ok, map()} | {error, term()}.
update(Id, Input) when is_map(Input) ->
    Res = bosun_store:transaction(fun() ->
        case mnesia:read(org, Id, write) of
            [] -> bosun_store:abort(not_found);
            [O0] ->
                O1 = case maps:get(<<"name">>, Input, undefined) of
                         undefined -> O0;
                         V ->
                             case validate_name(V) of
                                 {ok, N} -> O0#org{name = N};
                                 {error, R} -> bosun_store:abort(R)
                             end
                     end,
                O2 = O1#org{updated_at = bosun_util:now_ms()},
                ok = mnesia:write(O2),
                O2
        end
    end),
    case Res of
        {ok, O} -> {ok, to_map(O)};
        {error, _} = E -> E
    end.

%% @doc 把升级前没有组织的项目 / 筛选器 / 操作者全部划给这个组织（运维在 shell 里跑一次）。
%% 返回收编的项目数。
-spec adopt_orphans(binary()) -> {ok, non_neg_integer()} | {error, not_found}.
adopt_orphans(OrgId) ->
    case mnesia:dirty_read(org, OrgId) of
        [] -> {error, not_found};
        [_] ->
            {ok, N} = bosun_store:transaction(fun() ->
                Ps = [P || #project{org_id = undefined} = P <- mnesia:select(project, [{'_', [], ['$_']}], write)],
                lists:foreach(fun(P) -> ok = mnesia:write(P#project{org_id = OrgId}) end, Ps),
                lists:foreach(fun(F) -> ok = mnesia:write(F#filter{org_id = OrgId}) end,
                              [F || #filter{org_id = undefined} = F <- mnesia:select(filter, [{'_', [], ['$_']}], write)]),
                lists:foreach(fun(A) -> ok = mnesia:write(A#actor{org_id = OrgId}) end,
                              [A || #actor{org_id = undefined} = A <- mnesia:select(actor, [{'_', [], ['$_']}], write)]),
                length(Ps)
            end),
            logger:notice("bosun_org: ~b orphan projects adopted by ~s", [N, OrgId]),
            {ok, N}
    end.

-spec to_map(#org{}) -> map().
to_map(#org{} = O) ->
    #{<<"id">> => O#org.id, <<"name">> => O#org.name, <<"created_by">> => O#org.created_by,
      <<"created_at">> => bosun_json:iso8601(O#org.created_at),
      <<"updated_at">> => bosun_json:iso8601(O#org.updated_at)}.

%%====================================================================

with_valid(Input, Fun) ->
    case validate_name(maps:get(<<"org_name">>, Input, <<>>)) of
        {ok, OrgName} ->
            case bosun_email_code:validate_email(maps:get(<<"email">>, Input, <<>>)) of
                {ok, Email} -> Fun(OrgName, Email);
                {error, _} = E -> E
            end;
        {error, _} = E -> E
    end.

validate_name(V) ->
    N = bosun_util:trim(V),
    case N of
        <<>> -> {error, {invalid, org_name, <<"must not be empty">>}};
        _ when byte_size(N) > ?MAX_NAME * 4 -> {error, {invalid, org_name, <<"at most 100 characters">>}};
        _ ->
            case string:length(N) =< ?MAX_NAME of
                true -> {ok, N};
                false -> {error, {invalid, org_name, <<"at most 100 characters">>}}
            end
    end.
