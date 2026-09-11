# 04 · 任务 Feedback

> 功能：任务可附加 Feedback，通过 MCP 添加、修订、查看。

## 1. 定位

Feedback 是任务下**不可变、只追加**的 Markdown 记录，用于人与 Agent 之间的往返。不是聊天——没有线程回复、**没有删除**（Agent 可能已经读过并引用了它）。

「修订」= 追加一条新记录（`supersedes` 指向旧 id），旧记录标记为作废（`superseded_by` 指向新 id，`status = superseded`）；一条链就是一个线索。只有原作者能修订（`actor == author`，否则 403 / `forbidden`），已作废的不能再修订（409 / `superseded`，提示去改最新那条）。`feedback_count` 与「待回答」只算有效记录；作废记录从搜索索引里摘掉。

## 2. 实体

```erlang
-record(feedback, {
    id            :: binary(),        %% <<"BOS-12#3">>
    task_id, seq, author,
    kind          :: comment | review | question | answer,
    content       :: binary(),        %% Markdown
    created_at    :: integer(),
    supersedes    :: binary() | undefined,   %% 修订自
    superseded_by :: binary() | undefined    %% 已被替代（作废）
}).
```

### kind

`comment`（说明）、`review`（评审 / 打回 / 拒绝理由）、`question`（Agent 有疑问，阻塞等人答）、`answer`（回答）。最新一条有效记录是 `question` 时，任务标「待回答」。

## 3. 领域 API（`bosun_feedback`）

`add/2`（事务内分配 `#N`、刷新 task.updated_at）、`revise/2`、`list/1`（含作废，seq 升序）、`get/1`、`count/1`（有效数）。

## 4. REST

| 方法 | 路径 | 成功 | 错误 |
|---|---|---|---|
| GET | `/api/v1/tasks/:id/feedback` | 200 `{feedback:[...]}` | 404 |
| POST | `/api/v1/tasks/:id/feedback` | 201 feedback | 400 · 404 |
| PATCH | `/api/v1/tasks/:id/feedback/:seq` | 201 **新** feedback（修订） | 400 · 403 非作者 · 404 · 409 已作废 |

## 5. MCP 工具

`add_feedback(task_id, content, kind?, author?)` · `update_feedback(feedback_id, content?, kind?, author?)`（修订，返回新条） · `list_feedback(task_id)`。`get_task` 内嵌全部 feedback。

## 6. 前端

「添加 Feedback」按钮打开右侧 2/3 面板（大编辑器，类型下拉）；自己写的有效条目有「修订」按钮。作废版本折叠成一行虚线卡片（删除线摘要、「已被 #n 替代」），点开可看原文；新版本头部显示「修订自 #n」，锚点互跳。
