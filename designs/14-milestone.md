# 14 · Milestone（发布范围）

状态：已审定（2026-11-25）；M1～M4 全部实现（未提交）

## 1. 目标与决定

看板只适合看「一批数量有限、正在推进的事」。项目越用越久，整项目看板会被历史任务撑满（导入 TASK.md 后 BOS 一个项目就有 66 个已完成）。实际的工作方式是：**先规划一个任务集合作为一次发布（milestone），看板只看这一个 milestone**；项目全貌交给列表 / 搜索 / BQL。

已定：

| # | 决定 | 理由 |
|---|---|---|
| D1 | 每个项目**同时最多一个进行中**的 milestone | 看板默认就看它，「当前」没有歧义；并行版本（热修 + 大版本）以后再放开 |
| D2 | milestone **属于单个项目**，不跨项目 | 与任务编号、权限、导入导出的单位一致；跨项目发布以后再说 |
| D3 | **看板只在选中某个 milestone 时提供**；全部任务、待规划只有列表。没有进行中的 milestone 时缺省进待规划（列表）并提示新建 | 看板不再提供「整项目」视图；审定后又收紧为「待规划也不用看板」 |
| D4 | milestone 与 Epic **正交**：任务可以同时属于一个 Epic 和一个 milestone | Epic 回答「做什么」、可跨多次发布；milestone 回答「什么时候交付」、发布后关闭 |
| D5 | **Epic 可以进 milestone**：一次发布 = 若干 Epic + 若干独立任务（bug）。Epic 换 milestone 时，原来跟它在同一个 milestone（含都没排期）、还没做完（NEW / IN_PROGRESS）的步骤一起挪；做完的、明确排在别处的不动；新建步骤没指定时继承 Epic 的（Epic 的已发布就不继承） | 审定时改（原稿是「Epic 不进、只排步骤」） |
| D7 | **归属变更留痕**：每次移入 / 移出 / 发布结转 / 跟随 Epic 都记进任务的 `milestone_log`，milestone 详情列出「范围变更」 | 审定时加：例如某任务这次不做了，挪到下一个 milestone，要看得到 |
| D6 | 一个任务最多属于一个 milestone；没有 = 待规划 | 最常见的「fix version」语义，简单 |

和 Epic 的对比（为什么不复用 Epic）：

| | Epic（11 / 12） | Milestone |
|---|---|---|
| 回答 | 做什么（一个目标） | 什么时候交付（一次发布） |
| 时间 | 无截止，可跨多次发布 | 有目标日期，发布后关闭 |
| 关系 | 步骤可分散在多个 milestone | 一次发布含多个 Epic 的一部分 |
| 进度 | 已验收步骤 / 有效步骤 | 已完成 + 已验收 / 范围内任务（见 §5） |

## 2. 数据模型（Mnesia，`disc_copies`）

```erlang
-record(milestone, {
    id           :: binary(),          %% <<"BOS-M3">>：项目内序号（project.milestone_seq），不复用
    project_key  :: binary(),
    seq          :: pos_integer(),
    name         :: binary(),          %% 「0.1.4」「2026 Q1」；项目内唯一（大小写敏感、去首尾空白）
    description  :: binary(),          %% Markdown；发布时可写入发布说明
    status       :: planning | active | released,
    start_date   :: binary() | undefined,   %% <<"2026-12-01">>，只是展示 / 燃尽起点
    target_date  :: binary() | undefined,   %% 目标日期
    released_at  :: integer() | undefined,  %% 毫秒
    summary      :: map() | undefined,      %% 发布时的快照，见 §4.3
    created_by   :: binary(),
    created_at   :: integer(),
    updated_at   :: integer()
}).
```

- 表 `milestone`，索引 `[project_key]`。组织归属走项目（项目已带 `org_id`），不再单存。
- id 不用全局计数器：组织作用域导入时全局号会和别的组织撞（筛选器踩过这个坑，见 10 的 place_filters）；项目内序号跟着项目走，项目归属导入时已校验。`BOS-M3` 也不会被当成任务 id（`BOS-12`）。`project` 记录末尾加 `milestone_seq`。
- `task` 记录**末尾**加 `milestone :: binary() | undefined`（milestone id）与 `milestone_log :: [#{from, to, actor, at, comment}]`，`task` 表索引加 `milestone`。现有的「按字段名迁移」（`bosun_store:migrate/0`）会把老数据补成 `undefined` = 待规划，不需要另写迁移。
- 日期用 `YYYY-MM-DD` 字符串：只关心日，不关心时区换算；比较按字符串即可。

## 3. 规则（`bosun_milestone`）

**状态**

```
planning ──activate──▶ active ──release──▶ released
   ▲                      │                    │
   └──────pause───────────┘◀──────reopen───────┘
```

- `activate`：项目里已有别的 active → 拒 `{conflict, active_exists, OtherId}`（REST 409 `active_exists`，detail.milestone）。
- `pause`：active → planning（看板退回待规划池）。
- `release`：见 §4.3。
- `reopen`：released → active（同样受 D1 约束）；`released_at` / `summary` 保留到下次发布覆盖。
- 删除：只有 `planning` 且没有任务时允许，否则 409 `not_empty`。

**任务归属**

- 设置 `task.milestone`：值可以是 id、名称或 `active`；milestone 必须存在、与任务**同项目**，否则 `{invalid, milestone, …}`。Epic 的级联见 D5。
- 不能**加入** `released` 的 milestone（`{invalid, milestone, <<"0.1.3 is released">>}`）；可以从里面**移出**。
- 移动任务不改任务状态、不写状态历史（历史只记状态迁移），而是追加一条 `milestone_log`（可带 `milestone_comment` 说明原因）；`updated_at` 照常更新。
- 任务改项目不存在（任务不能换项目），所以不用处理跨项目搬家。

**进度口径**（列表、卡片、统计一致）

- 范围 = milestone 里的**非 Epic** 任务，**不含** REJECTED / CANCELLED；Epic 单独计数（`epics` / `epics_done`），它的完成由步骤决定，算进范围会重复。
- 已完成 = DONE + VERIFIED；其中 VERIFIED 单独显示「已验收」。
- 完成率 = 已完成 / 范围。和 Epic 不同（Epic 只认 VERIFIED）：发布关心「做完没有」，验收是另一道门，单独提示「N 个待验收」。

## 4. 接口

### 4.1 领域（`bosun_milestone`）

`create(Key, #{name, description, start_date, target_date, actor})`、`update(Id, Map)`、`delete(Id)`、`list(Key)`、`get(Id)`、`activate/1`、`pause/1`、`reopen/1`、`release(Id, #{carry_over => backlog | MilestoneId, actor})`、`active(Key) -> {ok, Id} | none`。
任务侧：`bosun_task:create/update` 接受 `milestone`（`""` = 移出）；`bosun_task:list/2` 增加 `milestone` 过滤（id、`backlog` = 未排期、`active` = 当前进行中）。

### 4.2 REST

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/projects/:key/milestones` | 列表，每项带 §3 的计数 `counts` |
| POST | `/api/v1/projects/:key/milestones` | 新建（缺省 `planning`）→ 201 |
| GET / PATCH / DELETE | `/api/v1/milestones/:id` | 详情（含计数与 `changes` 范围变更）/ 改 name、description、日期 / 删除 |
| POST | `/api/v1/milestones/:id/activate` `…/pause` `…/reopen` | 状态迁移 |
| POST | `/api/v1/milestones/:id/release` | `{carry_over: "backlog" \| "m8", notes?}` → 发布结果 |
| GET | `/api/v1/projects/:key/tasks?milestone=m7\|backlog\|active` | 看板 / 列表的数据源 |
| PATCH | `/api/v1/tasks/:id` | 加 `milestone`（"" = 移出）与可选的 `milestone_comment` |
| POST | `/api/v1/projects/:key/tasks/milestone` | 批量 `{ids: [...], milestone: "BOS-M7" \| "", comment?}`，逐条校验，返回成功 / 失败列表；comment 记进每条变更 |
| GET | `/api/v1/stats?project=KEY&milestone=m7` | 计数 + 燃尽（§5） |

权限与项目操作一致：Web 上组织成员都可以（同项目的新建 / 设置）；Bearer key 打 REST 时，批量归属要 `write`，milestone 本身的增删改与状态迁移要 `manage`。错误：409 `active_exists`（detail.milestone）、409 `invalid_state`（detail.status / action）、409 `not_empty`、409 `conflict`（field = name）。

### 4.3 发布（release）

一次请求、一个事务：

1. 只能从 `active` 发布。
2. **未完成**（NEW / IN_PROGRESS）的任务按 `carry_over` 移到另一个 milestone（必须同项目、不能是 released）或退回待规划。DONE（未验收）**留在本次**，算交付，但在结果和页面上列出「待验收」。
3. 写 `released_at`、`status = released`，`summary` 快照：
   `#{released_by, counts => #{delivered, verified, pending_verify, rejected, cancelled, carried_over}, delivered => [Id], epics => [Id], pending_verify => [Id], carried_over => [Id], carried_to => backlog | M, notes => Markdown}`
   结转的任务各记一条 `milestone_log`（「carried over when 0.1.4 was released」）。没做完的 Epic 也按同样规则结转。
   ——发布后任务还会被移动 / 打回，快照保证历史上的「这次发了什么」不变。
4. `notes`（可选）：前端按 Epic 分组生成的发布说明草稿，用户改完一起提交，存进 summary（不覆盖 description）。

### 4.4 MCP

- 新工具：`list_milestones(project_key, include_released?)` `get_milestone(milestone_id)`（read，详情带 changes）；`assign_milestone(project_key, task_ids, milestone, comment?)`（write）；`create_milestone` `update_milestone` `transition_milestone(milestone_id, action = activate | pause | reopen | release, carry_over?, notes?)`（manage）。发布并进 `transition_milestone`，与 `transition_task` 同一个思路。
- `list_tasks` 加 `milestone`（id、`active`、`backlog`）；`create_task` / `update_task` 加 `milestone`（write，同任务协作）。
- 资源 `bosun://projects` 每个项目带当前 milestone（id、名称、完成率）；`bosun://bql` 补 `milestone` 字段说明；`bosun://workflow` 补「按 milestone 领活」一节；`work_on_task` 提示改为「优先领取当前 milestone 里的任务」。
- 错误文本面向 Agent：例如加入已发布 milestone 时提示「0.1.3 已发布，可加入进行中的 0.1.4 或留在待规划」。

### 4.5 BQL（09）

| 字段（别名） | 运算 | 说明 |
|---|---|---|
| `milestone`（`fixversion`） | = != IN IS EMPTY | 值写名称或 id：`milestone = "0.1.4"`、`milestone = m7`；`milestone = active` 表示所在项目当前进行中的那个；`IS EMPTY` = 待规划 |
| `milestone_status` | = != IN | planning / active / released |

名称按任务所在项目解析：跨项目查询时 `milestone = "1.0"` 匹配各项目里叫 1.0 的那个。

### 4.6 导入导出（10）

- 备份 `version` 3：增加 `milestones` 数组；任务带 `milestone` 与 `milestone_log`；项目带 `milestone_seq`（同 task_seq，「文件、库里、实际最大序号」取最大）。任务的 milestone 必须是同项目的 id，并且在文件里或库里存在；导入后每个项目仍只能有一个 active，否则整次拒绝。
- 读 v2 文件：没有 milestones，任务都在待规划。
- merge：同 id 覆盖；组织作用域下 milestone 的项目必须属于本组织（与任务一致）。
- `dry_run` 预演表加一行 milestones。

## 5. 统计与燃尽

`/api/v1/stats?milestone=BOS-M7[&tz=480]`（`bosun_stats:milestone/2`），与项目统计同结构：

- `projects[KEY]` / `totals`：当前在这个 milestone 里的任务的计数；
- `daily`：从 `start_date`（没有就取创建日）到「发布日 / 目标日期与今天的较晚者」，每天：`created` = 当天移入范围的数，`completed` = 当天在范围内迁移到 DONE 的次数，`remaining` = 当天结束时范围内还没完成（不是 DONE / VERIFIED / REJECTED / CANCELLED）的数，今天以后为 null；Epic 不计；
- 范围按 `milestone_log` **回放**：中途移入 / 移出 / 结转都算准（审定时接受的「按当前范围」局限因此不存在了）；没有记录的老任务视为建单起就在；
- 已发布的最后一天按「发布前一刻」算，不让结转把曲线拉到 0；
- 另带 `milestone`（id / 名称 / 状态 / 日期）与 `range`（start / end / today）；超过 180 天只给最后 180 天。

前端燃尽图：实际剩余（实线）+ 理想线（从第一天的剩余线性降到目标日 0，虚线），今天竖线，悬停十字线与提示，隐藏表格给读屏。

## 6. 前端

**项目页（`/projects/:key`）**

- 页头加 milestone 切换器（Popover + 搜索）：分组「进行中 / 规划中 / 已发布」+「待规划」；底部「管理 milestone…」「新建 milestone」。URL `?m=m7 | backlog`，不带时 = 进行中的那个，没有就 = 待规划（D3）。
- **看板只在选中某个 milestone 时提供**；待规划与「全部」（项目全貌）只有列表，不显示看板 / 列表切换。
- 选中 milestone 时页头卡片：名称 + 状态徽章、目标日期与「还剩 N 天 / 已超期 N 天」、完成率条、「N 个待验收」、迷你燃尽；按钮「开始」（planning）/「发布…」（active）/「编辑」。
- 统计卡片（未结 / 进行中 / 待验收 …）：M2 先在「全部 / 待规划」时显示整个项目的；选中 milestone 时由概况卡片代替（按 milestone 的统计与燃尽在 M3）。
- 项目 JSON 带 `active_milestone`（id、名称、目标日期、完成率），侧栏项目名下显示。
- 待规划视图（列表）：行菜单「Milestone」、勾选批量排进去；顶部提示「当前没有进行中的 milestone」+「新建」「从规划中挑一个开始」。

**Milestone 管理（`/projects/:key/milestones`）**

- 卡片列表：进行中置顶，规划中按目标日期，已发布按发布时间倒序（可折叠）；每张卡片：日期、完成率、范围数、待验收数。
- 新建 / 编辑用右侧面板（size md，FormField）：名称、开始 / 目标日期、描述。

**发布面板**（右侧面板 lg；页头卡片「发布…」、管理页卡片菜单都能打开）

1. 概况：已完成 N、已验收 M、待验收 K（列出）、未完成 U（列出）。
2. 未完成去向：下拉（规划中的 milestone / 新建一个 / 退回待规划），缺省选目标日期最近的规划中 milestone。
3. 发布说明：按 Epic 分组、Epic 外的归「其它」，列出已完成任务（`- 标题（BOS-12）`），可编辑。
4. 确认 → `POST …/release` → 跳到已发布 milestone 的只读概览。

**任务的归属入口**

- 任务详情右栏「详情」加一行 Milestone（Select，只列规划中 / 进行中；Epic 改时提示「N 个没做完的步骤会一起移过去」；改的时候可以填一句原因，进 `milestone_log`）；动态流里显示归属变更。
- 新建任务面板属性栏加 Milestone，缺省 = 当前视图的 milestone（从看板列「快速添加」也一样）。
- 列表视图：新增 Milestone 列（可显隐）、筛选 facet、多选后「设置 Milestone…」批量。

**移动的交互**：从待规划排进 milestone 直接改；从某个 milestone 移出或换到别的，先弹确认框写原因（可空），记进 `milestone_log`。系统自动写的说明用中文（「跟随 Epic BOS-2」「0.1.4 发布时结转」），前端原样显示。

**其它**：侧栏项目下单独一行子项（缩进 + 竖线）显示进行中的 milestone、进度条与百分比，点了进它的看板；BQL 补全加 `milestone` 字段与本项目的 milestone 名。

## 7. 落地顺序

| 阶段 | 内容 | 验证 |
|---|---|---|
| M1 后端模型 | 表 / 记录 / 迁移、`bosun_milestone`、任务归属校验、list 过滤、REST、BQL、备份 v3 | eunit（规则、迁移、发布事务、BQL）+ ct（REST 链路） |
| M2 前端主线 | 切换器 + URL、看板按 milestone、页头卡片、管理页、任务详情 / 新建面板 / 列表的归属入口与批量 | vitest + 临时实例截图 |
| M3 发布与统计 | 发布面板、发布说明草稿、`summary` 快照、燃尽（stats `remaining`） | eunit（回放）+ 截图 |
| M4 Agent 与文档 | MCP 工具 / 参数 / 提示、`docs/AGENT-WORKFLOW.md`、README、designs/09 / 10 补字段 | ct（MCP 端到端） |

**现有数据**：部署实例里从 TASK.md 导入的 BOS 项目（13 个 Epic + 53 个任务，全是已完成），上线后建一个已发布的 milestone「0.1.3 及以前」，把它们都归进去，待规划池就是空的（审定时已同意）。

## 8. 不做（本期）

- 同项目多个进行中 milestone、跨项目 milestone（D1 / D2）。
- 精确燃尽（按 `milestone_log` 回放范围变化）；容量 / 工时估算、故事点。
- 发布与 git tag / 版本号联动、自动生成 CHANGELOG 文件。
- milestone 级权限（谁能发布）——沿用项目操作权限。
