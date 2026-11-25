# 02 · 任务管理

> 功能：向特定项目查询任务、创建任务；任务 ID 自动带项目前缀；MCP 同样可操作。

## 1. 实体

```erlang
-record(task, {
    id, project_key, seq, title, description,
    status       :: new | in_progress | done | verified | rejected | cancelled,
    priority     :: low | medium | high,
    labels       :: [binary()],
    history      :: [map()],           %% 状态迁移记录，倒序（见 03）
    feedback_seq :: non_neg_integer(), %% Feedback 序号分配（见 04）
    created_at, updated_at,
    assignee     :: binary() | undefined, %% 执行方（见 03 §6）
    kind         :: task | epic | undefined, %% Epic 就是一种任务；undefined（旧数据）视为 task
    epic         :: binary() | undefined,  %% 所属 Epic 的任务 id，可跨项目；Epic 自己不能有
    milestone    :: binary() | undefined,  %% 所属 milestone（14），同项目；undefined = 待规划
    milestone_log :: [map()] | undefined   %% 归属变更记录 #{from, to, actor, at, comment}（14 D7）
}).
```

对外 JSON：摘要（列表）= `id project_key seq title status priority labels created_by created_by_kind assignee assignee_kind commits kind epic milestone milestone_name progress blocked feedback_count open_question created_at updated_at`；详情 = 摘要 + `description history feedback links milestone_log`，Epic 再加 `children`（步骤摘要，按 id 序），普通任务加 `epic_title`。`created_by` 取自 history 首条 actor；`*_kind` 查 actor 表（见 11）；`commits` 是所有历史条目的提交 hash 去重后按时间排序；`feedback_count` / `open_question` 只算有效（未作废）反馈。

### Epic

Epic 是 `kind = epic` 的任务：一个整体目标，普通任务通过 `epic` 字段挂上去作为步骤（可跨项目）。它有自己的描述、状态、反馈和历史，走同一个状态机；`progress = #{total, done, cancelled, active_total, percent, by_status}` 由步骤派生（done = DONE 或 VERIFIED；`percent` 的分母是 `active_total = total - cancelled`，全部取消时为 100%，无步骤时为 0），不落库。Epic 状态随步骤自动流转（见 03）：全部有效步骤进入 DONE / VERIFIED 且至少一个有效步骤存在时自动 → DONE，步骤重开导致不再满足时自动回 IN_PROGRESS。校验：`epic` 必须指向存在且 `kind = epic` 的任务；Epic 不能再挂 Epic；`kind` 建单后不可改；update `epic = ""` 摘掉。列表过滤 `kind` / `epic`；`task` 表对 `epic` 建索引（`bosun_store:ensure_indexes/0` 给老表补索引）。

### 任务 ID

- `^<KEY>-<N>$`，`N` 从 1 开始、项目内单调递增、**永不复用**。
- 分配与 `mnesia:write(#task{})` 在**同一个事务**里完成。
- 解析大小写不敏感（`bos-12` = `BOS-12`），序号不允许前导零。

## 2. 领域 API（`bosun_task`）

`create/2`、`get/1`（含内嵌 feedback）、`list/2`（status / label / q / kind / epic / priority / assignee / attention / milestone / sort / limit / offset；`q` 走 BM25 再补 ID 子串，见 08；milestone 取 id / 名称 / `active` / `backlog`，见 14）、`update/2`（title / description / priority / labels / assignee / epic / milestone + milestone_comment；status 被忽略）、`search/2`（跨项目 BM25，按任务聚合）、`find_by_ids/1`。

## 3. REST

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/projects/:key/tasks?status=&q=&kind=&epic=&priority=&assignee=&attention=&milestone=&sort=&limit=&offset=` | 摘要列表 `{tasks, total}` |
| POST | `/api/v1/projects/:key/tasks` | 201 task（409 archived） |
| GET / PATCH | `/api/v1/tasks/:id` | 详情 / 改字段 |
| GET | `/api/v1/search?q=&project=&limit=` | 全文检索 |

## 4. MCP 工具

`list_tasks(project_key, status?, label?, kind?, epic?, milestone?, query?, limit?, offset?)` · `search_tasks(query, project_key?, limit?)` · `get_task(task_id)` · `create_task(project_key, title, description?, priority?, labels?, assignee?, kind?, epic?, milestone?)` · `update_task(task_id, …, milestone?, milestone_comment?)`。改状态请用 `transition_task`（03）；milestone 本身的工具见 14。

## 5. 前端

`/projects/:key`：milestone 范围 + 看板 / 列表（见 07、14）；列表是 shadcn Table（ID / 标题 / 状态 / 优先级 / Milestone / 标签 / 提出人 / 执行人 / 反馈 / 更新，可显隐、排序、分页、勾选批量）；右侧面板新建任务（两栏：标题 / 描述 + 属性栏，可「创建后继续新建」）。`/tasks/:id`：页头（编号、状态、优先级、Milestone、阻塞 / 待回答）与迁移按钮、提示条、进度卡片、描述（只读渲染 ↔ Milkdown 编辑）、动态流（状态变化 + Milestone 变更 + Feedback）、右栏属性 / 关联 / 交付。
