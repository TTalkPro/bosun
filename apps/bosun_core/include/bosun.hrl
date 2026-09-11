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
    updated_at  :: integer()
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
    updated_at :: integer()
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
    last_seen  :: integer()
}).
