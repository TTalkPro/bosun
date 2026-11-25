# 07 · Web 前端

React 19 + TypeScript + Vite + shadcn/ui（Radix）+ Tailwind CSS v4；react-router 7；SWR + axios；sonner（提示）；dayjs；
@dnd-kit（看板拖拽）；CodeMirror 6（BQL 编辑器）；Milkdown Crepe + react-markdown + Mermaid（见 06）；cmdk（搜索式下拉）。
界面风格参照 shadcn dashboard（卡片、统计卡片、右侧面板）。

## 目录

```
web/src/
├── api/          client · types · auth · projects · tasks · milestones · feedback · search · query · stats · identity
├── styles/       Tailwind 主题（CSS variables，浅 / 深色，series-* 图表色）、markdown
├── hooks/        use-theme（主题）· use-accent（主题色）
├── routes/       router · paths
├── layouts/      MainLayout（侧栏：工作区 / 项目（含进行中的 milestone 子项）/ 筛选器 / 管理；顶栏全局搜索、主题切换）
├── components/   ui/*（shadcn）· markdown/* · SidePanel · FormField · Section · ConfirmDialog · TaskIdChip · ProjectMark · RelativeTime · GlobalSearch · …
├── features/     auth · projects · tasks · board · milestones · dashboard · status · feedback · links · query · filters · account · org · data
└── pages/        Login · Register · Projects · ProjectTasks · Milestones · TaskDetail · Query · Data · Account · Org · NotFound
```

## 路由

| 路径 | 页面 |
|---|---|
| `/login` `/register` | 登录 / 注册组织（不需要登录） |
| `/projects` | 项目列表 + 统计卡片 + 近 14 天动态 |
| `/projects/:key?view=board\|list&m=<milestone id>\|backlog\|all` | 项目任务：milestone 切换器、概况卡片、看板 / 列表（见下） |
| `/projects/:key/milestones` | Milestone 管理（14） |
| `/tasks/:id` | 任务详情 |
| `/query?q=\|filter=` | BQL 查询 |
| `/account` · `/org` · `/data` | 账户与 API key · 组织与用户（管理员）· 数据导入导出（管理员） |

## 项目任务页（`/projects/:key`）

- 范围 `m`：某个 milestone、`backlog`（待规划）、`all`（全部任务）。不写时：要看板 → 进行中的 milestone，没有就待规划；要列表 → 全部。
- **看板只在范围是某个 milestone 时提供**；全部 / 待规划只有列表，不显示看板 / 列表切换。`view` 记住的是「要的」视图（偏好存 localStorage），改筛选时原样写回，切回某个 milestone 时仍是原来选的看板。
- 选中 milestone：概况卡片（进度、计数、燃尽）+ 这个 milestone 的统计卡片；已发布的显示发布记录。待规划：提示条（引导新建 / 开始 milestone）。
- 看板：按状态分列，@dnd-kit 拖拽（指针 / 触屏 / 键盘），需要证据的迁移先弹面板；工具条筛选（执行人 / 优先级 / 需要关注）在前端做。列表：分面与排序交给服务端，列显隐、分页、行菜单、勾选批量设置 milestone。

## 约定

- 写操作直接调 axios，成功后 `mutate` 相关 key；任务详情与 feedback 15s 轮询。
- 错误：400 → 表单字段；404 → 页面级；409 → snackbar；其他 → snackbar。
- **所有带输入的弹窗**都是右侧面板（`SidePanel`）：`size="md"` 给几个单行输入的短表单（项目设置、新建项目、用户、密码、API Key、关联、筛选器、milestone），`lg`（屏宽 2/3）给带大段 Markdown 的（新建任务、Feedback、发布面板）。纯确认用 `ConfirmDialog`，不用原生 `window.confirm` / `prompt`。
- 表单项统一用 `FormField`（标签 / 控件 / 说明或错误，上下各 8px），不各写各的间距。
- 小号 chip 统一「标签」观感（`SoftChip` 淡底色）。
- `pnpm build` 输出到 `apps/bosun_web/priv/static`，后端同端口提供页面、REST、MCP。
