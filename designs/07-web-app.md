# 07 · Web 前端

React 19 + TypeScript + Vite 7 + MUI 7；react-router 7；SWR + axios；notistack；dayjs。

## 目录

```
web/src/
├── api/          client · types · projects · tasks · feedback · search · query
├── theme/        MUI 主题（CSS variables 明暗模式）
├── routes/       router · paths
├── layouts/      MainLayout（可折叠侧栏：项目 / 筛选器 / 数据导入导出；顶栏全局搜索）
├── components/   markdown/* · SidePanel · SoftChip · StatusChip · TaskIdChip · RelativeTime · GlobalSearch · useApiError
├── features/     projects · tasks（status 表 · TaskTable · TaskFilters · TaskFormDialog）· status · feedback
└── pages/        ProjectsPage · ProjectTasksPage · TaskDetailPage · QueryPage · DataPage · NotFoundPage
```

## 路由

`/projects` · `/projects/:key` · `/tasks/:id` · `/query?q=|filter=` · `/data`。

## 约定

- 写操作直接调 axios，成功后 `mutate` 相关 key；任务详情与 feedback 15s 轮询。
- 错误：400 → 表单字段；404 → 页面级；409 → snackbar；其他 → snackbar。
- **所有带输入的弹窗**都是右侧 2/3 面板（`SidePanel`）：新建任务 / 项目、添加 / 修订 Feedback、打回 / 拒绝 / 重开 / 重新提交（`TransitionPanel`）、新建 / 编辑筛选器（`FilterFormPanel`）。纯确认用 `ConfirmDialog`（MUI Dialog），不用原生 `window.confirm` / `prompt`。
- 小号 chip 统一「标签」观感（`SoftChip` 淡底色）。
- `pnpm build` 输出到 `apps/bosun_web/priv/static`，后端同端口提供页面、REST、MCP。
