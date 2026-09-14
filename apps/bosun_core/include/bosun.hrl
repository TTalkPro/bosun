%%%-------------------------------------------------------------------
%%% Bosun 领域记录（仅 bosun_store / bosun_json / bosun_backup 直接使用；对外一律 map）
%%%-------------------------------------------------------------------

-record(project, {
    key         :: binary(),
    name        :: binary(),
    description :: binary(),
    task_seq    :: non_neg_integer(),
    archived    :: boolean(),
    created_at  :: integer(),
    updated_at  :: integer(),
    org_id      :: binary() | undefined  %% 所属组织（13）；undefined = 升级前的孤儿项目，任何组织都看不到
}).

-record(task, {
    id           :: binary(),
    project_key  :: binary(),
    seq          :: pos_integer(),
    title        :: binary(),
    description  :: binary(),
    status       :: new | in_progress | done | verified | rejected | cancelled,
    priority     :: low | medium | high,
    labels       :: [binary()],
    history      :: [map()],           %% #{from, to, actor, comment, at, commits, tests}
    feedback_seq :: non_neg_integer(),
    created_at   :: integer(),
    updated_at   :: integer(),
    assignee     :: binary() | undefined,  %% 执行方：领取（→ IN_PROGRESS）时写入，建单可预派
    kind         :: task | epic | undefined,  %% undefined（旧数据）视为 task
    epic         :: binary() | undefined   %% 所属 Epic 的任务 id（可跨项目）；Epic 自己不能有
}).

%% Feedback 不可变：「编辑」= 追加一条新的（supersedes 指向旧条），旧条标记为
%% 作废（superseded_by 指向新条）。一条链就是一个线索。
-record(feedback, {
    id            :: binary(),
    task_id       :: binary(),
    seq           :: pos_integer(),
    author        :: binary(),
    kind          :: comment | review | question | answer,
    content       :: binary(),
    created_at    :: integer(),
    supersedes    :: binary() | undefined,   %% 本条修订自哪一条
    superseded_by :: binary() | undefined    %% 本条已被哪一条替代（作废）
}).

%% 保存的 BQL 筛选器
-record(filter, {
    id         :: binary(),        %% <<"f3">>
    name       :: binary(),
    query      :: binary(),        %% BQL
    created_at :: integer(),
    updated_at :: integer(),
    org_id     :: binary() | undefined
}).

%% 全局计数器（filter id 分配）
-record(counter, {
    key   :: atom(),
    value :: non_neg_integer()
}).

%% 任务关联（见 12）：A replaces B / A depends_on B。同一 {From, To, Type} 只一条。
-record(link, {
    key        :: {binary(), binary(), replaces | depends_on},
    from       :: binary(),
    to         :: binary(),
    type       :: replaces | depends_on,
    actor      :: binary(),
    created_at :: integer()
}).

%% 出现过的操作者（人或 Agent），写操作时 upsert；给 UI 画图标、BQL 过滤用
-record(actor, {
    name       :: binary(),          %% 主键，如 <<"user">> / <<"keel/feature-x">>
    kind       :: human | agent,
    project    :: binary() | undefined,
    worktree   :: binary() | undefined,
    first_seen :: integer(),
    last_seen  :: integer(),
    org_id     :: binary() | undefined,  %% 在哪个组织里出现（13）
    user_id    :: binary() | undefined   %% 人 = 用户本人；Agent = 它用的 API key 的主人
}).

%%--------------------------------------------------------------------
%% 组织 / 用户 / 认证（designs/13-org-auth.md）
%%--------------------------------------------------------------------

-record(org, {
    id         :: binary(),          %% <<"o1">>
    name       :: binary(),
    created_by :: binary(),          %% 注册管理员的 user id
    created_at :: integer(),
    updated_at :: integer()
}).

-record(user, {
    id            :: binary(),       %% <<"u1">>
    org_id        :: binary(),
    email         :: binary(),       %% 小写，全局唯一
    name          :: binary(),       %% 显示名 = 写操作的署名；组织内唯一（不分大小写）
    password      :: term(),         %% bosun_password:hash/1 的结果
    role          :: admin | member,
    status        :: active | disabled,
    created_at    :: integer(),
    updated_at    :: integer(),
    last_login_at :: integer() | undefined
}).

%% 登录会话：主键是 token 的 sha256，明文 token 只在 Cookie 里
-record(session, {
    id           :: binary(),
    user_id      :: binary(),
    created_at   :: integer(),
    expires_at   :: integer(),
    last_seen_at :: integer()
}).

%% MCP / REST 的 API key：明文只在创建时返回一次；撤销写 revoked_at，不删
-record(api_key, {
    id           :: binary(),        %% <<"k1">>
    user_id      :: binary(),
    hash         :: binary(),        %% sha256(明文)
    name         :: binary(),
    prefix       :: binary(),        %% 展示用 <<"bsk_ab12cd">>
    created_at   :: integer(),
    last_used_at :: integer() | undefined,
    revoked_at   :: integer() | undefined
}).

%% 注册邮箱验证码：一个邮箱同时只有一条
-record(email_code, {
    email      :: binary(),
    code       :: binary(),          %% 6 位数字
    purpose    :: register,
    expires_at :: integer(),
    attempts   :: non_neg_integer(),
    sent_at    :: integer()
}).
