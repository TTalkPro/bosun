# shadcn/Tailwind 全量迁移

## 背景

原计划将 MUI 替换为 shadcn Admin 的技术栈，同时继续使用 React。实际采用本项目已具备的
`shadcn/ui` 组件、Tailwind CSS 与 `lucide-react` 图标；路由、业务 API、状态迁移规则保持不变。

## 目标

- 移除 `@mui/material`、`@mui/lab`、`@mui/icons-material`、`@mui/x-data-grid` 的兼容层。
- 所有页面、任务表格、状态历史、表单面板和反馈列表使用 shadcn/Tailwind。
- 保持现有业务行为，包括服务端分页、乐观更新、权限提示、Markdown 编辑与右侧面板交互。

## 完成内容

- `TaskTable` 用 shadcn Table 重写，替代 DataGrid，并保留服务端分页、空态、加载态和紧凑模式。
- `HistoryTimeline` 用语义化列表和 Tailwind 重写。
- 表单中的 MUI Select / Autocomplete / ToggleButtonGroup / RadioGroup 分别替换为 shadcn Select、
  Input + Badge、轻量分段控件和 shadcn RadioGroup。
- 任务详情、项目列表、项目任务页、查询页、组织页和数据导入导出页完成组件迁移。
- 删除 `web/src/mui-compat/`，清理 Vite alias / plugin 和 TS paths。

## 验收

- `tsc -b`
- `eslint src`
- `vitest run`
- `rebar3 check`
