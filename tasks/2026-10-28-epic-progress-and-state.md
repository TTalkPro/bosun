# Epic 进度与状态规则修正

## 背景
Epic 进度 `done / total` 把 CANCELLED / REJECTED 都计入分母；同时普通状态机允许 Epic 在子任务未完成时手动 DONE。

## 目标
- 进度返回 `done`、`cancelled`、`total`、`active_total` 和 `percent`。
- `percent` 只以需要完成的工作为分母，CANCELLED 不再阻止 100%。
- Epic 手动 `IN_PROGRESS -> DONE` 时必须所有有效子任务完成；否则返回 `epic_children_incomplete`。
- Epic 的自动级联行为保持不变。

## 验收
- 4 done + 1 cancelled 的 Epic 展示 100%，并显示 cancelled=1。
- 子任务未完成时手动完成 Epic 被拒绝。
- 子任务重开后 Epic 自动回 IN_PROGRESS。
