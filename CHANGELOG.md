# 更新日志

本文件记录 Bosun 各版本的变化，格式参照 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。
每一版的细节见 [`TASK.md`](TASK.md) 与 [`tasks/`](tasks/) 下的任务记录；设计见 [`designs/`](designs/)。

## [0.1.4] — 2026-11-25

对应 Bosun 自己的 milestone `0.1.4`。

### 新增

- **Milestone（发布范围）**（[设计 14](designs/14-milestone.md)）
  - 每次发布先规划一组任务（可含若干 Epic 与独立任务）；每个项目同时只有一个进行中的 milestone，状态 规划中 → 进行中 → 已发布，可暂停、可重新打开。
  - 看板只看一次发布：只在选中某个 milestone 时提供（缺省是进行中的那个）；「全部任务」和「待规划」只有列表。页头 milestone 切换器、概况卡片（日期、剩余天数、完成率、待验收）、燃尽图。
  - 管理页 `/projects/:key/milestones`；任务详情、新建任务、看板卡片 / 列表行菜单、列表批量勾选都能设置归属。
  - 归属变更留痕（`milestone_log`）：移入 / 移出 / 发布结转 / 跟随 Epic 都有记录，移出时可写原因；milestone 详情列出「范围变更」，任务动态流里也显示。
  - Epic 可以进 milestone，它没做完的步骤跟着走；Epic 下新建的步骤缺省跟 Epic 进同一个。
  - 发布面板：交付数 / 其中待验收 / 没做完的去向（规划中的 milestone、当场新建、退回待规划）/ 按 Epic 分组自动生成可编辑的发布说明；发布时保存快照（交付、待验收、结转、发布说明）。已完成未验收的算交付。
  - 按 milestone 的统计与燃尽（`/api/v1/stats?milestone=`）：按变更记录逐天回放范围，中途移入 / 移出都算准；已发布的按发布前一刻收尾。
  - REST：`/api/v1/projects/:key/milestones`、`/api/v1/milestones/:id[/activate|pause|reopen|release]`、批量 `/api/v1/projects/:key/tasks/milestone`；任务列表 `milestone=<id|名称|active|backlog>`。
  - BQL：`milestone`（别名 `fixversion`）、`milestone_status`；`milestone = active`、`milestone IS EMPTY`。
  - MCP：`list_milestones` `get_milestone` `create_milestone` `update_milestone` `transition_milestone` `assign_milestone`（工具共 28 个）；`list_tasks` / `create_task` / `update_task` 支持 milestone；`work_on_task` 提示说明任务在不在当前发布里。
  - 导入导出格式升到 3（`milestones`、任务的 `milestone` / `milestone_log`、项目的 `milestone_seq`），旧版本文件照样能导入。
- **项目设置面板**：概况（任务 / 未结 / 已验收 / Epic、完成度）、基本信息（Key 只读可复制）、描述、归档危险区（确认后立即生效）；未保存的修改关闭前会确认。
- **新建任务面板**改两栏：类型卡片、标题、描述 + 属性栏（优先级、Epic、Milestone、执行人、标签）；「创建后继续新建」连续录入。
- **任务详情**：进度卡片（新建 → 进行中 → 已完成 → 已验收，谁在什么时候推进、打回次数）、被依赖阻塞 / 有提问待回答的提示条（「去回答」直接定位）、交付卡片（最近一次测试证据 + 全部提交）。
- 侧栏项目下单独一行子项显示进行中的 milestone、进度条与百分比，点了进它的看板。
- 文档：本更新日志、[功能列表](docs/FEATURES.md)、README 功能截图。

### 变更

- 表单统一 `FormField`（标签 / 控件 / 说明间距一致），短表单侧边面板变窄；新建项目先填名称、Key 自动转大写并预览任务编号。
- 项目统计卡片在选中 milestone 时只统计这个 milestone。

### 修复

- 输入框获得焦点时高亮框压住上方标签（新建项目的 Key 等）。
- 新建任务面板的「取消」按钮和「创建」一样是实心主色。
- 同一毫秒内的「开始」「完成」两条状态记录排序取错（影响燃尽与任务详情的进度 / 交付卡片）。

## [0.1.3] — 2026-11-25

### 新增

- 项目看板（参照 shadcn dashboard）：拖拽改状态（含触屏 / 键盘），拖到完成 / 拒绝等先弹证据或说明面板；列折叠、列内快速添加、工具条（执行人 / 优先级 / 需要关注 / 排序）。
- 列表视图：列显隐、分页、列头排序、执行人 / 优先级分面、行菜单。
- 统计接口 `/api/v1/stats` 与项目列表页 / 详情页的统计卡片、每日新建与完成图。
- BQL 查询页：CodeMirror 编辑器（高亮 + 上下文补全）、结果概览、最近运行、导出 CSV。
- 数据导入前预演（`dry_run`）与预览表。
- 任务详情、账户、组织、数据导入导出、登录 / 注册等页面改版。

### 修复

- `scripts/export.sh` / `import.sh` 不带凭据：改为读 `BOSUN_API_KEY`。
- 导入时筛选器重复：本组织同 id 覆盖、同名同查询跳过。

## [0.1.2] — 2026-11-25

### 变更

- 检索引擎 bitcask 13.1.1 → 13.1.2。
- Docker 构建镜像改用 Debian trixie 与 Node 24，容器固定 hostname（Mnesia 节点名不随容器变）。

## [0.1.1] — 2026-11-24

### 变更

- 检索引擎 bitcask 12.0.1 → 13.1.1（依赖改为 `git_subdir` 取 `apps/bitcask`），已有索引直接可用。

## [0.1.0] — 2026-09-11 ～ 2026-11-20

第一个版本（打 tag 之前的全部历史）。

- 项目、任务（`KEY-N`）、六态状态机（新建 / 进行中 / 已完成 / 已验收 / 已拒绝 / 已撤销）、不可变反馈（提问 / 回答 / 评审 / 说明，修订留痕）。
- Epic（目标 + 步骤、派生进度、步骤做完自动完成）与任务关联（替代、依赖、阻塞、成环拒绝）。
- 全文检索（bitcask + jieba BM25，组织 / 项目 / 类型过滤下推引擎）与 BQL 查询语言、保存的筛选器。
- MCP 服务（工具 / 资源 / `work_on_task` 提示），人与 Agent 的身份、执行方自验收需带通过的测试。
- 多组织、邮箱验证码注册、登录会话、API key（read / write / manage 权限、项目白名单、安全轮换）、按组织隔离；登录 / 发码 / 改密限流。
- 前端全量迁移到 shadcn / Tailwind；导入导出（replace / merge）；生产 release、systemd、FreeBSD rc.d、Docker Compose（端口 5000）。
- 两轮全项目审查的缺陷与安全修复；检索引擎 bitcask 6.7.1 → 12.0.1。

[未发布]: https://github.com/TTalkPro/bosun/compare/0.1.3...HEAD
[0.1.3]: https://github.com/TTalkPro/bosun/compare/0.1.2...0.1.3
[0.1.2]: https://github.com/TTalkPro/bosun/compare/0.1.1...0.1.2
[0.1.1]: https://github.com/TTalkPro/bosun/compare/bff4465...0.1.1
[0.1.0]: https://github.com/TTalkPro/bosun/commits/bff4465
