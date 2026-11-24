%%%-------------------------------------------------------------------
%%% 组织 / 用户 / 会话 / API key / 作用域隔离（designs/13-org-auth.md）
%%%-------------------------------------------------------------------
-module(bosun_auth_tests).

-include_lib("eunit/include/eunit.hrl").

setup() -> ok = bosun_test_env:setup(), bosun_scope:clear().

auth_test_() ->
    Tests = [
        {"email validation", fun email_validation/0},
        {"register flow", fun register_flow/0},
        {"code limits", fun code_limits/0},
        {"login & password", fun login_and_password/0},
        {"user management", fun user_management/0},
        {"sessions", fun sessions/0},
        {"api keys", fun api_keys/0},
        {"api key scopes", fun api_key_scopes/0},
        {"org isolation", fun org_isolation/0},
        {"backup scoped", fun backup_scoped/0},
        {"adopt orphans", fun adopt_orphans/0},
        {"import cannot reach into another org", fun import_cross_org/0},
        {"key project whitelist covers projects & export", fun key_project_whitelist/0},
        {"password change / reset kills sessions", fun password_kills_sessions/0},
        {"system-scope backup keeps org ids", fun backup_keeps_orgs/0}
    ],
    {foreach, fun setup/0, fun(_) -> bosun_scope:clear() end,
     [fun(_) -> T end || T <- Tests]}.

%% 注册一个组织并返回 {Org, AdminUser}
register(OrgName, Email, Name) ->
    {ok, #{<<"delivery">> := <<"log">>}} = bosun_org:request_code(Email),
    {ok, Code} = bosun_email_code:peek(Email),
    {ok, #{<<"org">> := O, <<"user">> := U}} =
        bosun_org:register(#{<<"org_name">> => OrgName, <<"email">> => Email, <<"code">> => Code,
                             <<"name">> => Name, <<"password">> => <<"secret123">>}),
    {O, U}.

principal(#{<<"id">> := Id}) ->
    {ok, P} = bosun_user:principal(Id, #{via => session}),
    P.

email_validation() ->
    ?assertEqual({ok, <<"a.b@example.com">>}, bosun_email_code:validate_email(<<" A.B@Example.COM ">>)),
    ?assertMatch({error, {invalid, email, _}}, bosun_email_code:validate_email(<<"nope">>)),
    ?assertMatch({error, {invalid, email, _}}, bosun_email_code:validate_email(<<"a@b">>)),
    ?assertMatch({error, {invalid, email, _}}, bosun_email_code:validate_email(<<"a b@c.d">>)),
    ?assertMatch({error, {invalid, email, _}}, bosun_email_code:validate_email(<<>>)),
    ?assertMatch({error, {invalid, email, _}}, bosun_org:request_code(<<"bad">>)).

register_flow() ->
    ?assertEqual(log, bosun_mailer:mode()),
    {ok, #{<<"delivery">> := <<"log">>, <<"expires_in">> := 900}} = bosun_org:request_code(<<"Admin@Acme.io">>),
    {ok, Code} = bosun_email_code:peek(<<"admin@acme.io">>),
    ?assertEqual(6, byte_size(Code)),
    Base = #{<<"org_name">> => <<"Acme">>, <<"email">> => <<"admin@acme.io">>, <<"name">> => <<"Alice">>, <<"password">> => <<"secret123">>},
    %% 错码 → mismatch；弱密码 → invalid；组织名空 → invalid
    ?assertEqual({error, code_mismatch}, bosun_org:register(Base#{<<"code">> => <<"000000">>})),
    ?assertMatch({error, {invalid, password, _}}, bosun_org:register(Base#{<<"code">> => Code, <<"password">> => <<"short">>})),
    ?assertMatch({error, {invalid, org_name, _}}, bosun_org:register(Base#{<<"code">> => Code, <<"org_name">> => <<>>})),
    %% 失败不消费验证码
    {ok, #{<<"org">> := #{<<"id">> := OrgId, <<"name">> := <<"Acme">>},
           <<"user">> := #{<<"id">> := UserId, <<"role">> := <<"admin">>, <<"email">> := <<"admin@acme.io">>, <<"name">> := <<"Alice">>}}} =
        bosun_org:register(Base#{<<"code">> => Code}),
    ?assertEqual(error, bosun_email_code:peek(<<"admin@acme.io">>)),
    {ok, #{<<"created_by">> := UserId}} = bosun_org:get(OrgId),
    %% 同邮箱不能再注册
    {ok, _} = bosun_org:request_code(<<"admin@acme.io">>),
    {ok, Code2} = bosun_email_code:peek(<<"admin@acme.io">>),
    ?assertEqual({error, {conflict, email}}, bosun_org:register(Base#{<<"code">> => Code2, <<"org_name">> => <<"Other">>})),
    %% 管理员进了 actor 表
    {ok, #{<<"kind">> := <<"human">>, <<"user_id">> := UserId}} = bosun_actor:get(<<"Alice">>),
    %% 改名
    {ok, #{<<"name">> := <<"Acme Inc">>}} = bosun_org:update(OrgId, #{<<"name">> => <<"Acme Inc">>}),
    ?assertEqual({error, not_found}, bosun_org:update(<<"o999">>, #{<<"name">> => <<"x">>})).

code_limits() ->
    {ok, _} = bosun_org:request_code(<<"x@y.io">>),
    ?assertMatch({error, {too_many_requests, _}}, bosun_org:request_code(<<"x@y.io">>)),
    ?assertEqual({error, code_expired}, bosun_email_code:verify(<<"nobody@y.io">>, <<"123456">>)),
    lists:foreach(fun(_) -> ?assertEqual({error, code_mismatch}, bosun_email_code:verify(<<"x@y.io">>, <<"bad">>)) end,
                  lists:seq(1, 5)),
    %% 错 5 次作废
    {ok, Real} = bosun_email_code:peek(<<"x@y.io">>),
    ?assertEqual({error, code_expired}, bosun_email_code:verify(<<"x@y.io">>, Real)),
    ?assertEqual(error, bosun_email_code:peek(<<"x@y.io">>)).

login_and_password() ->
    {_, #{<<"id">> := Uid}} = register(<<"Acme">>, <<"admin@acme.io">>, <<"Alice">>),
    ?assertMatch({ok, #{<<"id">> := Uid, <<"last_login_at">> := B}} when is_binary(B),
                 bosun_user:authenticate(<<"ADMIN@acme.io">>, <<"secret123">>)),
    ?assertEqual({error, invalid_credentials}, bosun_user:authenticate(<<"admin@acme.io">>, <<"wrong">>)),
    ?assertEqual({error, invalid_credentials}, bosun_user:authenticate(<<"nobody@acme.io">>, <<"secret123">>)),
    ?assertEqual({error, invalid_credentials}, bosun_user:change_password(Uid, <<"wrong">>, <<"newsecret1">>)),
    ?assertMatch({error, {invalid, password, _}}, bosun_user:change_password(Uid, <<"secret123">>, <<"123">>)),
    ?assertEqual(ok, bosun_user:change_password(Uid, <<"secret123">>, <<"newsecret1">>)),
    ?assertMatch({ok, _}, bosun_user:authenticate(<<"admin@acme.io">>, <<"newsecret1">>)),
    ?assertEqual({error, invalid_credentials}, bosun_user:authenticate(<<"admin@acme.io">>, <<"secret123">>)).

user_management() ->
    {#{<<"id">> := OrgId}, #{<<"id">> := AdminId}} = register(<<"Acme">>, <<"admin@acme.io">>, <<"Alice">>),
    {ok, #{<<"id">> := BobId, <<"role">> := <<"member">>, <<"status">> := <<"active">>, <<"org_id">> := OrgId}} =
        bosun_user:create(OrgId, #{<<"email">> => <<"Bob@acme.io">>, <<"name">> => <<"Bob">>, <<"password">> => <<"bobsecret">>}),
    ?assertEqual({error, {conflict, email}}, bosun_user:create(OrgId, #{<<"email">> => <<"bob@acme.io">>, <<"name">> => <<"B2">>, <<"password">> => <<"bobsecret">>})),
    ?assertEqual({error, {conflict, name}}, bosun_user:create(OrgId, #{<<"email">> => <<"b2@acme.io">>, <<"name">> => <<"bob">>, <<"password">> => <<"bobsecret">>})),
    ?assertMatch({error, {invalid, role, _}}, bosun_user:create(OrgId, #{<<"email">> => <<"c@acme.io">>, <<"name">> => <<"C">>, <<"password">> => <<"bobsecret">>, <<"role">> => <<"god">>})),
    ?assertMatch({error, {invalid, name, _}}, bosun_user:create(OrgId, #{<<"email">> => <<"c@acme.io">>, <<"name">> => <<>>, <<"password">> => <<"bobsecret">>})),
    {ok, [#{<<"id">> := AdminId}, #{<<"id">> := BobId}]} = bosun_user:list(OrgId),
    ?assertMatch({ok, _}, bosun_user:authenticate(<<"bob@acme.io">>, <<"bobsecret">>)),
    %% 最后一个 admin 不能降级 / 停用
    ?assertEqual({error, last_admin}, bosun_user:update(OrgId, AdminId, #{<<"role">> => <<"member">>})),
    ?assertEqual({error, last_admin}, bosun_user:update(OrgId, AdminId, #{<<"status">> => <<"disabled">>})),
    {ok, #{<<"role">> := <<"admin">>}} = bosun_user:update(OrgId, BobId, #{<<"role">> => <<"admin">>}),
    {ok, #{<<"role">> := <<"member">>}} = bosun_user:update(OrgId, AdminId, #{<<"role">> => <<"member">>}),
    {ok, #{<<"role">> := <<"admin">>}} = bosun_user:update(OrgId, AdminId, #{<<"role">> => <<"admin">>}),
    %% 停用：登录失败、会话失效；重置密码
    {ok, Tok} = bosun_session:create(BobId),
    ?assertMatch({ok, #{user_id := BobId}}, bosun_session:lookup(Tok)),
    {ok, #{<<"status">> := <<"disabled">>}} = bosun_user:update(OrgId, BobId, #{<<"status">> => <<"disabled">>, <<"password">> => <<"reset1234">>}),
    ?assertEqual({error, user_disabled}, bosun_user:authenticate(<<"bob@acme.io">>, <<"reset1234">>)),
    ?assertEqual({error, unauthorized}, bosun_session:lookup(Tok)),
    {ok, #{<<"status">> := <<"active">>}} = bosun_user:update(OrgId, BobId, #{<<"status">> => <<"active">>}),
    ?assertMatch({ok, _}, bosun_user:authenticate(<<"bob@acme.io">>, <<"reset1234">>)),
    %% 别的组织的用户看不到
    {#{<<"id">> := Org2}, _} = register(<<"Other">>, <<"root@other.io">>, <<"Root">>),
    ?assertEqual({error, not_found}, bosun_user:update(Org2, BobId, #{<<"name">> => <<"hijack">>})),
    ?assertEqual({error, not_found}, bosun_user:get_in_org(Org2, BobId)),
    {ok, [_]} = bosun_user:list(Org2).

sessions() ->
    {_, #{<<"id">> := Uid, <<"name">> := <<"Alice">>}} = register(<<"Acme">>, <<"admin@acme.io">>, <<"Alice">>),
    {ok, Tok} = bosun_session:create(Uid),
    {ok, #{user_id := Uid, name := <<"Alice">>, role := admin, via := session}} = bosun_session:lookup(Tok),
    ?assertEqual({error, unauthorized}, bosun_session:lookup(<<"garbage">>)),
    ?assertEqual({error, unauthorized}, bosun_session:lookup(undefined)),
    ok = bosun_session:delete(Tok),
    ?assertEqual({error, unauthorized}, bosun_session:lookup(Tok)).

api_keys() ->
    {_, #{<<"id">> := Uid}} = register(<<"Acme">>, <<"admin@acme.io">>, <<"Alice">>),
    {ok, #{<<"key">> := Plain, <<"id">> := Kid, <<"prefix">> := Prefix, <<"created_at">> := CreatedAt,
           <<"status">> := <<"active">>, <<"name">> := <<"laptop">>}} =
        bosun_api_key:create(Uid, <<"laptop">>),
    ?assertMatch(<<"bsk_", _/binary>>, Plain),
    ?assertEqual(44, byte_size(Plain)),
    ?assertEqual(Prefix, binary:part(Plain, 0, 10)),
    %% 列表里没有明文
    {ok, [K]} = bosun_api_key:list(Uid),
    ?assertNot(maps:is_key(<<"key">>, K)),
    {ok, #{user_id := Uid, via := api_key, key_id := Kid}} = bosun_api_key:authenticate(Plain),
    ?assertEqual({error, unauthorized}, bosun_api_key:authenticate(<<"bsk_nope">>)),
    ?assertEqual({error, unauthorized}, bosun_api_key:authenticate(undefined)),
    {ok, [#{<<"last_used_at">> := Used}]} = bosun_api_key:list(Uid),
    ?assert(is_binary(Used)),
    {ok, #{<<"key">> := NewPlain, <<"id">> := Kid, <<"prefix">> := NewPrefix, <<"created_at">> := CreatedAt,
           <<"scopes">> := [<<"read">>], <<"name">> := <<"laptop">>, <<"status">> := <<"active">>}} =
        bosun_api_key:rotate(Uid, Kid),
    ?assertMatch(<<"bsk_", _/binary>>, NewPlain),
    ?assertNotEqual(Plain, NewPlain),
    ?assertNotEqual(Prefix, NewPrefix),
    {ok, [#{<<"rotated_at">> := Rotated, <<"last_used_at">> := undefined}]} = bosun_api_key:list(Uid),
    ?assert(is_binary(Rotated)),
    {ok, #{key_id := Kid}} = bosun_api_key:authenticate(NewPlain),
    ?assertEqual({error, unauthorized}, bosun_api_key:authenticate(Plain)),
    ?assertEqual({error, not_found}, bosun_api_key:rotate(<<"u999">>, Kid)),
    ?assertEqual({error, not_found}, bosun_api_key:revoke(<<"u999">>, Kid)),
    {ok, #{<<"status">> := <<"revoked">>}} = bosun_api_key:revoke(Uid, Kid),
    {ok, #{<<"status">> := <<"revoked">>}} = bosun_api_key:revoke(Uid, Kid),
    ?assertEqual({error, unauthorized}, bosun_api_key:authenticate(Plain)),
    ?assertEqual({error, not_found}, bosun_api_key:rotate(Uid, Kid)),
    ?assertEqual({error, not_found}, bosun_api_key:create(<<"u999">>, <<"x">>)),
    {ok, #{<<"name">> := <<"default">>}} = bosun_api_key:create(Uid, <<>>).

api_key_scopes() ->
    {_, #{<<"id">> := Uid}} = register(<<"Acme">>, <<"admin@acme.io">>, <<"Alice">>),
    {ok, #{<<"key">> := Plain, <<"scopes">> := [<<"read">>], <<"project_keys">> := [<<"ONE">>]}} =
        bosun_api_key:create(Uid, <<"readonly">>, #{<<"scopes">> => [<<"read">>],
                                                    <<"project_keys">> => [<<"one">>]}),
    {ok, P} = bosun_api_key:authenticate(Plain),
    ?assertEqual([<<"read">>], maps:get(scopes, P)),
    ?assertEqual([<<"ONE">>], maps:get(project_keys, P)),
    ok = bosun_scope:with(P, fun() ->
        ?assertEqual(true, bosun_scope:has_scope(<<"read">>)),
        ?assertEqual(false, bosun_scope:has_scope(<<"write">>)),
        {ok, _} = bosun_project:create(#{<<"key">> => <<"ONE">>, <<"name">> => <<"allowed">>}),
        {ok, _} = bosun_project:create(#{<<"key">> => <<"TWO">>, <<"name">> => <<"hidden">>}),
        ?assertEqual(true, bosun_scope:project_visible(<<"one">>)),
        ?assertEqual(false, bosun_scope:project_visible(<<"TWO">>)),
        ?assertEqual({error, {project, not_found}}, bosun_task:list(<<"TWO">>, #{}))
    end),
    ?assertMatch({error, {invalid, scopes, _}},
                 bosun_api_key:create(Uid, <<"bad">>, #{<<"scopes">> => [<<"god">>]})),
    ?assertMatch({error, {invalid, project_keys, _}},
                 bosun_api_key:create(Uid, <<"bad">>, #{<<"project_keys">> => [<<"bad key">>]})),
    ?assertMatch({error, {invalid, expires_at, _}},
                 bosun_api_key:create(Uid, <<"bad">>, #{<<"expires_at">> => 1})).

org_isolation() ->
    {_, A} = register(<<"Acme">>, <<"admin@acme.io">>, <<"Alice">>),
    {_, B} = register(<<"Beta">>, <<"root@beta.io">>, <<"Bob">>),
    PA = principal(A), PB = principal(B),
    %% A 建项目 / 任务 / 筛选器
    {ok, TaskA} = bosun_scope:with(PA, fun() ->
        {ok, #{<<"org_id">> := OrgA}} = bosun_project:create(#{<<"key">> => <<"ACM">>, <<"name">> => <<"Acme">>}),
        ?assertEqual(maps:get(org_id, PA), OrgA),
        {ok, T} = bosun_task:create(<<"ACM">>, #{<<"title">> => <<"alpha secret">>, <<"actor">> => <<"Alice">>}),
        {ok, _} = bosun_feedback:add(<<"ACM-1">>, #{<<"content">> => <<"note">>, <<"author">> => <<"Alice">>}),
        {ok, _} = bosun_filter:create(#{<<"name">> => <<"mine">>, <<"query">> => <<"project = ACM">>}),
        {ok, T}
    end),
    ok = bosun_search:sync(),
    %% B 什么都看不到
    bosun_scope:with(PB, fun() ->
        {ok, []} = bosun_project:list(#{}),
        ?assertEqual({error, not_found}, bosun_project:get(<<"ACM">>)),
        ?assertEqual({error, not_found}, bosun_project:update(<<"ACM">>, #{<<"name">> => <<"x">>})),
        ?assertEqual({error, {project, not_found}}, bosun_task:list(<<"ACM">>, #{})),
        ?assertEqual({error, {project, not_found}}, bosun_task:create(<<"ACM">>, #{<<"title">> => <<"x">>, <<"actor">> => <<"Bob">>})),
        ?assertEqual({error, not_found}, bosun_task:get(<<"ACM-1">>)),
        ?assertEqual({error, not_found}, bosun_task:update(<<"ACM-1">>, #{<<"title">> => <<"x">>})),
        ?assertEqual({error, not_found}, bosun_task_status:transition(<<"ACM-1">>, <<"IN_PROGRESS">>, #{actor => <<"Bob">>})),
        ?assertEqual({error, not_found}, bosun_feedback:add(<<"ACM-1">>, #{<<"content">> => <<"hi">>, <<"author">> => <<"Bob">>})),
        ?assertEqual({error, not_found}, bosun_feedback:list(<<"ACM-1">>)),
        ?assertEqual({error, not_found}, bosun_feedback:get(<<"ACM-1#1">>)),
        ?assertEqual({error, not_found}, bosun_feedback:revise(<<"ACM-1#1">>, #{<<"content">> => <<"x">>, <<"actor">> => <<"Alice">>})),
        {ok, #{<<"hits">> := []}} = bosun_task:search(<<"secret">>, #{}),
        %% 引擎侧就按组织过滤掉了，不靠事后的可见性检查
        {ok, []} = bosun_search:search(<<"secret">>, #{}),
        {ok, []} = bosun_search:search(<<"note">>, #{}),
        {ok, #{<<"tasks">> := [], <<"total">> := 0}} = bosun_bql:query(<<"project = ACM">>, #{}),
        {ok, []} = bosun_task:find_by_ids([<<"ACM-1">>]),
        {ok, []} = bosun_filter:list(),
        %% 同 key 被占了
        ?assertEqual({error, {conflict, key}}, bosun_project:create(#{<<"key">> => <<"ACM">>, <<"name">> => <<"B's">>})),
        %% B 自己的项目正常；跨组织 link 也不行
        {ok, _} = bosun_project:create(#{<<"key">> => <<"BET">>, <<"name">> => <<"Beta">>}),
        {ok, _} = bosun_task:create(<<"BET">>, #{<<"title">> => <<"b1">>, <<"actor">> => <<"Bob">>}),
        ?assertMatch({error, {invalid, to, _}}, bosun_link:add(<<"BET-1">>, <<"ACM-1">>, <<"depends_on">>, #{actor => <<"Bob">>})),
        ?assertMatch({error, {invalid, epic, _}}, bosun_task:update(<<"BET-1">>, #{<<"epic">> => <<"ACM-1">>})),
        {ok, [#{<<"key">> := <<"BET">>}]} = bosun_project:list(#{}),
        {ok, [#{<<"name">> := <<"Bob">>}]} = bosun_actor:list()
    end),
    %% A 看自己的一切正常，看不到 B 的
    bosun_scope:with(PA, fun() ->
        {ok, [#{<<"key">> := <<"ACM">>}]} = bosun_project:list(#{}),
        {ok, #{<<"id">> := <<"ACM-1">>}} = bosun_task:get(<<"ACM-1">>),
        {ok, #{<<"hits">> := [#{<<"task">> := #{<<"id">> := <<"ACM-1">>}}]}} = bosun_task:search(<<"secret">>, #{}),
        {ok, [#{type := feedback, id := <<"ACM-1#1">>}]} = bosun_search:search(<<"note">>, #{}),
        {ok, []} = bosun_search:search(<<"b1">>, #{}),
        {ok, #{<<"total">> := 1}} = bosun_bql:query(<<"project = ACM">>, #{}),
        {ok, [#{<<"name">> := <<"mine">>}]} = bosun_filter:list(),
        ?assertEqual({error, not_found}, bosun_task:get(<<"BET-1">>)),
        {ok, [#{<<"name">> := <<"Alice">>}]} = bosun_actor:list()
    end),
    ?assertEqual(<<"ACM-1">>, maps:get(<<"id">>, TaskA)),
    %% B 的任务是在上面那次 sync 之后写的，索引是异步的：系统作用域不按组织过滤，查得到与否只看写进程跑没跑到
    ok = bosun_search:sync(),
    %% 系统作用域看全部
    {ok, [_, _]} = bosun_project:list(#{}),
    {ok, [#{id := <<"ACM-1">>}]} = bosun_search:search(<<"secret">>, #{}),
    {ok, [#{id := <<"BET-1">>}]} = bosun_search:search(<<"b1">>, #{}),
    {ok, #{<<"total">> := 2}} = bosun_bql:query(<<>>, #{}).

backup_scoped() ->
    {_, A} = register(<<"Acme">>, <<"admin@acme.io">>, <<"Alice">>),
    {_, B} = register(<<"Beta">>, <<"root@beta.io">>, <<"Bob">>),
    PA = principal(A), PB = principal(B),
    bosun_scope:with(PA, fun() ->
        {ok, _} = bosun_project:create(#{<<"key">> => <<"ACM">>, <<"name">> => <<"Acme">>}),
        {ok, _} = bosun_task:create(<<"ACM">>, #{<<"title">> => <<"a1">>, <<"actor">> => <<"Alice">>}),
        {ok, _} = bosun_task:create(<<"ACM">>, #{<<"title">> => <<"a2">>, <<"actor">> => <<"Alice">>}),
        {ok, _} = bosun_link:add(<<"ACM-2">>, <<"ACM-1">>, <<"depends_on">>, #{actor => <<"Alice">>}),
        {ok, _} = bosun_filter:create(#{<<"name">> => <<"fa">>, <<"query">> => <<"project = ACM">>})
    end),
    bosun_scope:with(PB, fun() ->
        {ok, _} = bosun_project:create(#{<<"key">> => <<"BET">>, <<"name">> => <<"Beta">>}),
        {ok, _} = bosun_task:create(<<"BET">>, #{<<"title">> => <<"b1">>, <<"actor">> => <<"Bob">>}),
        {ok, _} = bosun_filter:create(#{<<"name">> => <<"fb">>, <<"query">> => <<"project = BET">>})
    end),
    {ok, ExportA} = bosun_scope:with(PA, fun() -> bosun_backup:export() end),
    ?assertMatch(#{<<"projects">> := [#{<<"key">> := <<"ACM">>}], <<"tasks">> := [_, _], <<"links">> := [_],
                   <<"filters">> := [#{<<"name">> := <<"fa">>}], <<"actors">> := [#{<<"name">> := <<"Alice">>}],
                   <<"counters">> := Cs} when map_size(Cs) =:= 0, ExportA),
    %% B 导入 A 的导出：项目 key 被 A 占着 → conflict
    ?assertEqual({error, {conflict, key}}, bosun_scope:with(PB, fun() -> bosun_backup:import(ExportA, #{mode => merge}) end)),
    %% A 自己 replace 回去：任务还在，筛选器换了 id，B 的不受影响
    {ok, #{<<"projects">> := 1, <<"tasks">> := 2, <<"filters">> := 1}} =
        bosun_scope:with(PA, fun() -> bosun_backup:import(ExportA, #{mode => replace}) end),
    bosun_scope:with(PA, fun() ->
        {ok, #{<<"total">> := 2}} = bosun_task:list(<<"ACM">>, #{}),
        {ok, [#{<<"name">> := <<"fa">>, <<"id">> := NewId}]} = bosun_filter:list(),
        [#{<<"id">> := OldId}] = maps:get(<<"filters">>, ExportA),
        ?assertNotEqual(OldId, NewId),
        {ok, #{<<"blocked">> := true}} = bosun_task:get(<<"ACM-2">>)
    end),
    bosun_scope:with(PB, fun() ->
        {ok, [#{<<"key">> := <<"BET">>}]} = bosun_project:list(#{}),
        {ok, #{<<"total">> := 1}} = bosun_task:list(<<"BET">>, #{}),
        {ok, [#{<<"name">> := <<"fb">>}]} = bosun_filter:list()
    end),
    %% 系统作用域导出带计数器与全部数据
    {ok, #{<<"projects">> := [_, _], <<"counters">> := Counters}} = bosun_backup:export(),
    ?assert(map_size(Counters) > 0).

%% 组织 B 的管理员拿一个写着组织 A 项目 key 的文件，改不了 A 的任何东西
import_cross_org() ->
    {_, A} = register(<<"Acme">>, <<"admin@acme.io">>, <<"Alice">>),
    {_, B} = register(<<"Beta">>, <<"root@beta.io">>, <<"Bob">>),
    PA = principal(A), PB = principal(B),
    bosun_scope:with(PA, fun() ->
        {ok, _} = bosun_project:create(#{<<"key">> => <<"ACM">>, <<"name">> => <<"Acme">>}),
        {ok, _} = bosun_task:create(<<"ACM">>, #{<<"title">> => <<"original">>, <<"actor">> => <<"Alice">>}),
        {ok, _} = bosun_feedback:add(<<"ACM-1">>, #{<<"content">> => <<"original note">>, <<"author">> => <<"Alice">>})
    end),
    bosun_scope:with(PB, fun() ->
        {ok, _} = bosun_project:create(#{<<"key">> => <<"BET">>, <<"name">> => <<"Beta">>}),
        {ok, _} = bosun_task:create(<<"BET">>, #{<<"title">> => <<"b1">>, <<"actor">> => <<"Bob">>})
    end),
    Base = #{<<"format">> => <<"bosun-export">>, <<"version">> => 2},
    Evil = #{<<"id">> => <<"ACM-1">>, <<"project_key">> => <<"ACM">>, <<"seq">> => 1, <<"title">> => <<"pwned">>},
    Import = fun(Data, Mode) -> bosun_scope:with(PB, fun() -> bosun_backup:import(maps:merge(Base, Data), #{mode => Mode}) end) end,
    %% 文件里不带项目、只带别人项目下的任务 / 反馈 / 关联
    [?assertMatch({error, {invalid, data, <<"refers to unknown project ACM">>}}, Import(D, M))
     || M <- [merge, replace],
        D <- [#{<<"tasks">> => [Evil]},
              #{<<"feedback">> => [#{<<"id">> => <<"ACM-1#1">>, <<"task_id">> => <<"ACM-1">>, <<"seq">> => 1, <<"content">> => <<"pwned">>}]},
              #{<<"links">> => [#{<<"from">> => <<"BET-1">>, <<"to">> => <<"ACM-1">>, <<"type">> => <<"replaces">>}]}]],
    %% 借自己项目的 key、却写别人任务的 id
    ?assertMatch({error, {invalid, data, _}}, Import(#{<<"tasks">> => [Evil#{<<"project_key">> := <<"BET">>}]}, merge)),
    %% 带上项目 → key 被 A 占着
    ?assertEqual({error, {conflict, key}}, Import(#{<<"projects">> => [#{<<"key">> => <<"ACM">>, <<"name">> => <<"mine now">>}], <<"tasks">> => [Evil]}, merge)),
    %% 同名操作者：不改 A 那条的归属和类型
    {ok, _} = Import(#{<<"actors">> => [#{<<"name">> => <<"Alice">>, <<"kind">> => <<"agent">>}, #{<<"name">> => <<"beta-bot">>, <<"kind">> => <<"agent">>}]}, merge),
    bosun_scope:with(PA, fun() ->
        {ok, #{<<"title">> := <<"original">>, <<"feedback">> := [#{<<"content">> := <<"original note">>}], <<"links">> := []}} = bosun_task:get(<<"ACM-1">>),
        {ok, #{<<"name">> := <<"Acme">>}} = bosun_project:get(<<"ACM">>),
        {ok, As} = bosun_actor:list(),
        ?assertMatch([#{<<"kind">> := <<"human">>}], [X || #{<<"name">> := <<"Alice">>} = X <- As])
    end),
    bosun_scope:with(PB, fun() ->
        {ok, Bs} = bosun_actor:list(),
        ?assertEqual([<<"Bob">>, <<"beta-bot">>], lists:sort([maps:get(<<"name">>, X) || X <- Bs]))
    end).

%% key 的项目白名单：项目列表 / 详情 / 导出也只给白名单里的；`*' = 全部
key_project_whitelist() ->
    {_, #{<<"id">> := Uid} = A} = register(<<"Acme">>, <<"admin@acme.io">>, <<"Alice">>),
    bosun_scope:with(principal(A), fun() ->
        {ok, _} = bosun_project:create(#{<<"key">> => <<"ONE">>, <<"name">> => <<"allowed">>}),
        {ok, _} = bosun_project:create(#{<<"key">> => <<"TWO">>, <<"name">> => <<"hidden">>}),
        {ok, _} = bosun_task:create(<<"TWO">>, #{<<"title">> => <<"secret">>})
    end),
    {ok, #{<<"key">> := Plain}} = bosun_api_key:create(Uid, <<"one">>, #{<<"scopes">> => [<<"read">>, <<"manage">>], <<"project_keys">> => [<<"ONE">>]}),
    {ok, P} = bosun_api_key:authenticate(Plain),
    bosun_scope:with(P, fun() ->
        {ok, [#{<<"key">> := <<"ONE">>}]} = bosun_project:list(#{}),
        ?assertEqual({error, not_found}, bosun_project:get(<<"TWO">>)),
        ?assertEqual({error, not_found}, bosun_project:update(<<"TWO">>, #{<<"name">> => <<"x">>})),
        {ok, #{<<"projects">> := [#{<<"key">> := <<"ONE">>}], <<"tasks">> := []}} = bosun_backup:export()
    end),
    {ok, #{<<"key">> := Star}} = bosun_api_key:create(Uid, <<"all">>, #{<<"project_keys">> => [<<"*">>]}),
    {ok, PStar} = bosun_api_key:authenticate(Star),
    bosun_scope:with(PStar, fun() ->
        {ok, [_, _]} = bosun_project:list(#{}),
        ?assertEqual(true, bosun_scope:project_visible(<<"TWO">>))
    end).

%% 改密 / 管理员重置密码后，旧会话全部失效；撤销的 key、删掉的会话不会被「最近使用」回写复活
password_kills_sessions() ->
    {#{<<"id">> := OrgId}, #{<<"id">> := Uid}} = register(<<"Acme">>, <<"admin@acme.io">>, <<"Alice">>),
    {ok, T1} = bosun_session:create(Uid),
    {ok, T2} = bosun_session:create(Uid),
    {ok, _} = bosun_session:lookup(T1),
    ok = bosun_user:change_password(Uid, <<"secret123">>, <<"newsecret1">>),
    ?assertEqual({error, unauthorized}, bosun_session:lookup(T1)),
    ?assertEqual({error, unauthorized}, bosun_session:lookup(T2)),
    {ok, T3} = bosun_session:create(Uid),
    {ok, _} = bosun_user:update(OrgId, Uid, #{<<"name">> => <<"Alice B">>}),
    {ok, _} = bosun_session:lookup(T3),                     %% 改名不踢
    {ok, _} = bosun_user:update(OrgId, Uid, #{<<"password">> => <<"resetsecret1">>}),
    ?assertEqual({error, unauthorized}, bosun_session:lookup(T3)),
    ?assertMatch({ok, #{<<"last_login_at">> := L}} when is_binary(L), bosun_user:authenticate(<<"admin@acme.io">>, <<"resetsecret1">>)).

%% 系统作用域的整库导出 / 导入（scripts/export.sh 之外的 shell 备份）保留项目的组织归属
backup_keeps_orgs() ->
    {#{<<"id">> := OrgId}, A} = register(<<"Acme">>, <<"admin@acme.io">>, <<"Alice">>),
    bosun_scope:with(principal(A), fun() ->
        {ok, _} = bosun_project:create(#{<<"key">> => <<"ACM">>, <<"name">> => <<"Acme">>}),
        {ok, _} = bosun_filter:create(#{<<"name">> => <<"fa">>, <<"query">> => <<"project = ACM">>})
    end),
    {ok, Map} = bosun_backup:export(),
    {ok, Decoded} = bosun_json:decode(bosun_json:encode(Map)),
    {ok, _} = bosun_backup:import(Decoded, #{mode => replace}),
    bosun_scope:with(principal(A), fun() ->
        {ok, [#{<<"key">> := <<"ACM">>, <<"org_id">> := OrgId}]} = bosun_project:list(#{}),
        {ok, [#{<<"name">> := <<"fa">>}]} = bosun_filter:list()
    end).

adopt_orphans() ->
    %% 系统作用域建的项目没有组织 → 谁都看不到，收编后归该组织
    {ok, _} = bosun_project:create(#{<<"key">> => <<"OLD">>, <<"name">> => <<"Legacy">>}),
    {ok, _} = bosun_filter:create(#{<<"name">> => <<"old">>, <<"query">> => <<"project = OLD">>}),
    {ok, _} = bosun_task:create(<<"OLD">>, #{<<"title">> => <<"legacy widget">>}),
    ok = bosun_search:sync(),
    {#{<<"id">> := OrgId}, A} = register(<<"Acme">>, <<"admin@acme.io">>, <<"Alice">>),
    PA = principal(A),
    {ok, []} = bosun_scope:with(PA, fun() -> bosun_project:list(#{}) end),
    {ok, []} = bosun_scope:with(PA, fun() -> bosun_search:search(<<"widget">>, #{}) end),
    ?assertEqual({error, not_found}, bosun_org:adopt_orphans(<<"o999">>)),
    {ok, 1} = bosun_org:adopt_orphans(OrgId),
    {ok, 0} = bosun_org:adopt_orphans(OrgId),
    bosun_scope:with(PA, fun() ->
        {ok, [#{<<"key">> := <<"OLD">>, <<"org_id">> := OrgId}]} = bosun_project:list(#{}),
        {ok, [#{<<"name">> := <<"old">>}]} = bosun_filter:list(),
        %% 收编时重建了索引，meta 里的 org 跟着变
        {ok, [#{id := <<"OLD-1">>}]} = bosun_search:search(<<"widget">>, #{})
    end).
