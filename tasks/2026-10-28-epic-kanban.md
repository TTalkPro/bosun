# Epic 子任务 Kanban

## 背景
Epic 详情只有子任务表格，缺少执行过程视图。`~/workspace/aihtml` 的 Kanban 提供了列式拖拽、占位、浮动卡、自动滚动和键盘可访问交互参考。

## 目标
- Epic 详情新增看板视图，按任务状态分列。
- 看板卡片展示 ID、标题、优先级、负责人、项目、blocked、open question。
- 拖拽跨列调用 `transition_task`，不得绕过状态机。
- 使用 optimistic update；失败回滚并提示非法迁移原因。
- 支持键盘操作，符合 shadcn / Tailwind 视觉。

## 验收
- 合法状态变化可拖动并刷新 Epic 进度。
- 非法状态变化回滚并显示当前允许目标。
- 子任务可跨项目展示。
