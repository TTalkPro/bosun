# 03 · 任务状态流转

> 功能：任务状态 `NEW → IN_PROGRESS → DONE → VERIFIED`（+ `REJECTED`），MCP 可操作状态转换。

## 1. 状态

| 状态 | 含义 | 典型操作者 |
|---|---|---|
| `NEW` | 已创建、未开始 | 人 / Agent 创建 |
| `IN_PROGRESS` | 正在做 | 执行方 |
| `DONE` | 做完、待验收 | 执行方 |
| `VERIFIED` | 提出方验收通过，终态 | 提出方（人或另一个项目的 Agent） |
| `REJECTED` | 执行方认为需求不合理，拒绝执行 | 执行方 |
| `CANCELLED` | 不做了：过时或不需要了（不是需求不对），关闭态 | 提出方或任何人 |

内部 atom `new | in_progress | done | verified | rejected | cancelled`；输入不区分大小写，`in-progress` / `in progress` / `reject` / `canceled` 也接受。

## 2. 迁移表

| From | To | 语义 |
|---|---|---|
| NEW | IN_PROGRESS | 开始 |
| IN_PROGRESS | DONE | 完成 |
| DONE | VERIFIED | 验收通过 |
| DONE | IN_PROGRESS | 打回（建议附 comment） |
| VERIFIED | IN_PROGRESS | 重新打开 |
| NEW / IN_PROGRESS | REJECTED | 执行方拒绝需求（先写一条 `review` feedback） |
| REJECTED | NEW | 提出方修改需求后重新提交 |
| NEW / IN_PROGRESS | CANCELLED | 撤销：不需要了（建议写一条 `comment` feedback；进行中撤销 `assignee` 保留） |
| CANCELLED | NEW | 恢复：又需要了 |

其余一律 `{invalid_transition, From, To}`，错误文本带上可用的目标状态。NEW → IN_PROGRESS 还要求没有未满足的依赖（见 12）：否则 `{blocked, [Ids]}`。DONE / VERIFIED 不能撤销（做完的只能重开）。REJECTED 与 CANCELLED 的区别：前者是执行方说「需求不对」，要提出方改；后者是谁都可以说「不需要了」。

### 自动流转：Epic 随步骤级联

上表管**手动**迁移。步骤（挂在该 Epic 下的任务，见 02）迁移时，同一事务内同步 Epic 自身状态，不走迁移表（与 12 的「替代自动撤销」同一模式）：

- 全部步骤进入 DONE / VERIFIED / CANCELLED 且至少一个 DONE / VERIFIED → Epic 自动 `→ DONE`（从 NEW / IN_PROGRESS），历史备注 `all steps completed (auto)`
- DONE / VERIFIED 的 Epic 因步骤重开不再满足上一条 → 自动 `→ IN_PROGRESS`，历史备注 `step reopened (auto)`

CANCELLED / REJECTED 的 Epic 不参与自动流转（保持人工控制）。自动条目的 actor 记为触发步骤迁移的操作者，`commits` / `tests` 为空。

**跨项目场景**：任务常由一方提出、另一方执行——例如 coxswain 项目的 Agent 给 keel 建任务，keel 的 Agent 执行，coxswain 验收；keel 也可以认为需求不合理，写 review 后置为 `REJECTED`，coxswain 改完需求再「重新提交」回 `NEW`。因此 `actor` / `author` 必须是能标识来源的稳定名字（建议用项目 Key）。

## 3. 历史记录

每次迁移在 `task.history` 头部追加 `#{from, to, actor, comment, at, commits, tests}`；创建时写入 `from = undefined, to = new` 作为首条（也就是 `created_by`）。

- `commits :: [binary()]`：本次迁移附带的 git 提交 hash（7–64 位十六进制，否则 `{invalid, commits, _}`）。没有提交可以为空，但应在 feedback 里说明。
- `tests :: #{command, passed, summary} | undefined`：测试证据；`passed` 必填布尔。

## 4. 接口

- `bosun_task_status:transition(TaskId, To, #{actor, actor_kind, comment, commits, tests})`
- REST `POST /api/v1/tasks/:id/transition {"to","comment","actor","commits":[...],"tests":{...}}` → 200 task / 409 invalid_transition（`detail.allowed`）/ 409 self_verify_requires_tests（`detail.assignee`）
- MCP `transition_task(task_id, to, comment?, actor?, commits?, tests?)`

## 6. 角色：提出方 / 执行方 / 验收方

- **提出方** `created_by`：history 首条的 actor。可以是人，也可以是上游项目的 Agent。
- **执行方** `assignee`：从 NEW 领取（→ IN_PROGRESS）时自动写成当前 actor；建单 / update 可预派。打回 / 重开不改执行方（除非还没人领）。
- **验收方**：把任务置为 `VERIFIED` 的人。不限定是提出方——下游 Agent、人、或执行方本人都可以。

**自验收规则**：执行方（`actor == assignee`）验收自己的任务时，必须有通过的测试证据：本次 `tests.passed == true`，或者最近一次 `→ DONE` 的历史条目带有 `tests.passed == true`；否则拒绝 `{self_verify_requires_tests, Assignee}`。其他人验收不要求测试记录（他们自己核过）。

完成（`→ DONE`）时约定附带 `commits`（有则填）与 `tests`；这样验收方看历史就能拿到提交与测试结果，不用翻 feedback。

## 5. 前端

状态 chip 颜色：NEW info · IN_PROGRESS primary · DONE warning · VERIFIED success · REJECTED error · CANCELLED default（灰）（`web/src/features/tasks/status.ts` 与后端迁移表一份）。「开始」直接提交；「完成」「验收」打开右侧完成证据面板（提交 hash、测试命令 / 是否通过 / 摘要、备注），自己验收时面板提示是否已有通过的测试；打回 / 重开 / 拒绝 / 重新提交 / 撤销弹窗要求写原因，原因存为 `review` feedback（撤销存为 `comment`），历史 comment 引用其 ID。
