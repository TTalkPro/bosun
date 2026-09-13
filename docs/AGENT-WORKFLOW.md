# Bosun 协作工作流

这份文档描述人和 Agent 如何在 Bosun 里围绕一张工单协作。它是唯一的规则来源：MCP 资源
`bosun://workflow`（英文版）和 `GET /api/v1/workflow.md` 返回的就是这个文件。其他仓库要引用时，
在自己的 `CLAUDE.md` 里加一行 `@~/workspace/bosun/docs/AGENT-WORKFLOW.md`，或者直接读 MCP 资源。

## 1. 角色

一张工单上有三个角色，每个都可以是人，也可以是 Agent：

| 角色 | 字段 | 谁 |
|---|---|---|
| 提出方 requester | `created_by` | 建单的人；常是用户，也常是上游项目的 Agent |
| 执行方 assignee | `assignee` | 把工单置为 IN_PROGRESS 的人（领取），或建单时预派的人 |
| 验收方 verifier | 历史里 `→ VERIFIED` 的 actor | 提出方、下游 Agent，或满足条件的执行方本人 |

同一个项目可能同时有多个 worktree、多个 Agent 在跑，所以身份落到**会话**而不是项目。

## 2. 身份

会话一开始先调用一次：

```
identify(name="keel/feature-search", kind="agent", project="KEEL", worktree="/home/x/keel-search")
```

- `name` 约定 `<项目 key>/<worktree 或用途>`；同一项目不同 worktree 必须用不同的名字。
- 之后所有写操作（建单、迁移、反馈）都记在这个名字下；不 identify 会得到 `agent-1a2b3c` 这种自动名，可读性差。
- 人在 Web 界面右上角设置自己的名字，同样存进 actor 表。`list_actors` / `GET /api/v1/actors` 可以看到所有出现过的身份及其 kind。
- 单次调用可以用 `actor` / `author` 参数临时覆盖，正常不需要。

## 3. 状态与迁移

```
NEW ──→ IN_PROGRESS ──→ DONE ──→ VERIFIED
 ↑ │        │  ↑          │          │
 │ │        │  └──────────┘ (打回)   │
 │ │        │  ←─────────────────────┘ (重开)
 │ │        ├──→ REJECTED ──→ NEW   (需求不对：拒绝，改完重新提交)
 │ └────────┴──→ CANCELLED ─→ NEW   (不需要了：撤销，又需要了恢复)
```

| 从 | 到 | 谁 | 意思 |
|---|---|---|---|
| NEW | IN_PROGRESS | 执行方 | 领取；`assignee` 自动写成当前 actor（打回 / 重开不改执行方） |
| IN_PROGRESS | DONE | 执行方 | 做完，等验收；附 `commits` 与 `tests` |
| DONE | VERIFIED | 验收方 | 通过；终态 |
| DONE | IN_PROGRESS | 验收方 | 打回；先写 `review` 反馈说明原因 |
| VERIFIED | IN_PROGRESS | 任何人 | 重开 |
| NEW / IN_PROGRESS | REJECTED | 执行方 | 认为需求不合理或无法做；先写 `review` 反馈 |
| REJECTED | NEW | 提出方 | 改完需求，重新提交 |
| NEW / IN_PROGRESS | CANCELLED | 提出方（或任何人） | 不做了：过时或不需要了，**不是**需求不对；建议写 `comment` 反馈说明 |
| CANCELLED | NEW | 任何人 | 恢复：又需要了 |

终态 / 关闭态：VERIFIED、REJECTED、CANCELLED。DONE / VERIFIED 不能撤销——做完的东西要撤只能重开。

## 4. 每一步做什么

1. **读单** `get_task(id)`：标题、正文、历史、反馈都在里面。有 `question` 没人回答就先别动手。
2. **领取** `transition_task(id, "IN_PROGRESS")`。要是需求不对或做不了：`add_feedback(kind="review")` 说明理由，再 `transition_task(id, "REJECTED")`。
3. **卡住** 需要提出方拍板：`add_feedback(kind="question")` 然后**停下**，不要标 DONE。提出方用 `kind="answer"` 回复。
4. **完成**
   1. 跑测试。
   2. `add_feedback(kind="comment")`：做了什么、改了哪些文件、提交 hash、测试结果。
   3. `transition_task(id, "DONE", commits=["579cb02", ...], tests={command: "rebar3 eunit && rebar3 ct", passed: true, summary: "28 eunit + 4 ct"})`。
      - `commits` 是 git 提交 hash（7–64 位十六进制）。没有提交传 `[]`，并在反馈里说明为什么。
      - `tests` 三个字段：`command` 跑了什么、`passed` 是否全过（必填）、`summary` 一句话。
      - 两者都会进状态历史；工单的 `commits` 字段汇总了所有历史里的 hash。
5. **验收** `transition_task(id, "VERIFIED")`，或者写 `review` 反馈再打回 IN_PROGRESS。
   - 提出方、下游 Agent 都可以验收，不要求带测试记录（他们自己核过）。
   - **执行方可以验收自己的工单，前提是有通过的测试**：本次调用带 `tests.passed=true`，或者最近一次 `→ DONE` 已经记录了 `tests.passed=true`。否则后端拒绝：`self_verify_requires_tests`。
6. **不做了** 需求过时或被别的工单覆盖：`add_feedback(kind="comment")` 说一句为什么，再 `transition_task(id, "CANCELLED")`。这与 REJECTED 不同——REJECTED 是执行方说需求不对；CANCELLED 是谁都可以说「不需要了」。执行到一半撤销时 `assignee` 保留。又需要了就 `transition_task(id, "NEW")` 恢复。

## 4b. Epic

一个大目标拆成多步时，先建 Epic（`create_task(kind="epic")`），再把步骤任务用 `epic="KEY-N"` 挂上去（建单时给，或 `update_task(epic=...)`）。Epic 有自己的状态和反馈：步骤全部完成后 Epic 自动置为 DONE（进度里 DONE / VERIFIED 都算完成；步骤重开会把 Epic 拉回 IN_PROGRESS），之后由提出方把 Epic 置 VERIFIED。`get_task` 一个 Epic 会返回 `children`（步骤）和 `progress`（已完成 / 总数）；`list_tasks(epic="KEY-N")` 或 BQL `epic = KEY-N` 列步骤。步骤可以跨项目。

## 4c. 关联：依赖与替代

- **依赖** `link_tasks(from=A, to=B, type="depends_on")`：B 没到 DONE / VERIFIED 之前 A 不能开始（`transition_task(A, "IN_PROGRESS")` 会被拒，错误里列出阻塞任务）。`get_task` 的 `blocked` 为 true 时先去看 `links`。成环会被拒绝。
- **替代** `link_tasks(from=A, to=B, type="replaces")`：A 接手 B。B 若还在 NEW / IN_PROGRESS 会自动撤销，历史里记 `replaced by A`——所以「这个需求换个做法」不用手动撤销旧单，建新单再建替代链即可。
- 链可删（`unlink_tasks`），删链不改状态。BQL：`blocked = true`、`depends_on = KEY-N`、`blocks = KEY-N`、`replaces = KEY-N`、`replaced_by = KEY-N`。

## 5. 反馈

四种 `kind`：

| kind | 用途 |
|---|---|
| `comment` | 一般说明；完成时的改动记录 |
| `review` | 验收意见：打回、拒绝、通过时的备注 |
| `question` | 需要对方决定；提了就停 |
| `answer` | 回答 question |

反馈**不可变、不删除**。要改自己写的，用 `update_feedback(feedback_id, content)`：追加一条修订版，旧的标为作废（`superseded_by`），只有原作者能修订。反馈 id 形如 `KEY-12#3`。

## 6. 跨项目示例：coxswain 给 keel 提需求

```
coxswain/main   identify("coxswain/main", kind="agent", project="COX")
coxswain/main   create_task(project="KEEL", title="搜索接口支持前缀匹配", description="...")   → KEEL-7
keel/search     identify("keel/search", kind="agent", project="KEEL", worktree="feature/search")
keel/search     get_task("KEEL-7")
keel/search     transition_task("KEEL-7", "IN_PROGRESS")                                  assignee = keel/search
keel/search     add_feedback("KEEL-7", kind="question", "前缀最短几个字符？")
coxswain/main   add_feedback("KEEL-7", kind="answer", "2 个")
keel/search     ... 开发、跑测试 ...
keel/search     add_feedback("KEEL-7", kind="comment", "实现见 a1b2c3d；eunit 12/12")
keel/search     transition_task("KEEL-7", "DONE", commits=["a1b2c3d"], tests={command:"rebar3 eunit", passed:true, summary:"12/12"})
coxswain/main   transition_task("KEEL-7", "VERIFIED")
```

如果 coxswain 不验收而由 keel 自己收尾，最后一步换成 `keel/search transition_task("KEEL-7", "VERIFIED")`——因为 DONE 时已经记录了通过的测试，后端放行。

## 7. 怎么引用

- 其他仓库的 `CLAUDE.md`：`@~/workspace/bosun/docs/AGENT-WORKFLOW.md`，再加一句「本项目的任务在 Bosun 项目 `KEEL`，identify 用 `keel/<worktree>`」。
- MCP：资源 `bosun://workflow`（英文）；提示 `/bosun:work_on_task KEEL-7` 会把工单全文和这份规则一起拉进上下文。
- REST：`GET /api/v1/workflow.md`（中文），`GET /api/v1/workflow.md?lang=en`（英文）。
- 更细的设计在 `designs/03-task-status.md`、`designs/04-feedback.md`、`designs/11-identity.md`。
