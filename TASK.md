# Bosun - Task List

> 设计见 [designs/](designs/)。2026-09-11 因本机 home 目录被意外清空（原因不明，非本仓库操作），
> 仓库与 git 历史丢失，当天从对话上下文**完整重建**；数据从 10:50 的导出快照恢复。

## 0. 工程骨架（00-overview）
- [x] rebar3 umbrella：`rebar.config`、`config/sys.config`、`config/vm.args`
- [x] `_checkouts/` 指向本机 beamai_core / beamai_mcp / bitcask；deps 里保留 git 声明
- [x] 三个 app：`bosun_core` / `bosun_mcp` / `bosun_web`

## 1. 领域层 `bosun_core`
- [x] `bosun_store`：Mnesia schema、五张表、按字段名迁移、`transaction/1`、`reset_tables/0`、`next_id/1`、`data_dir/0` (T)
- [x] `bosun_id`、`bosun_json`、`bosun_util`
- [x] `bosun_project`（01） (T)
- [x] `bosun_task`（02）：`KEY-N` 事务内分配、列表 `q` 走索引、`search/2` 按任务聚合 (T)
- [x] `bosun_task_status`（03）：含 `REJECTED`、`CANCELLED`（BOS-10） (T)
- [x] `bosun_feedback`（04）：不可变，`revise/2` 新条 + 旧条作废 (T)
- [x] `bosun_search`（08）：bitcask jieba BM25，标签 / 标题字段 boost，组织 / 项目 / 类型过滤按 meta 下推引擎（bitcask 12.0.0），索引格式带版本、不符 / 打不开自动删目录重建，写后异步索引，启动重建 (T)
- [x] `bosun_bql` + `bosun_filter`（09） (T)
- [x] `bosun_backup`（10） (T)

## 2. MCP `bosun_mcp`（05）
- [x] 17 个工具、3 个资源、`work_on_task` 提示；错误文本面向 Agent (T)

## 3. REST `bosun_web`
- [x] 全部端点、`/mcp`、静态 SPA 回退（`code:priv_dir`）、环境变量覆盖 IP / 端口 (T)
- [x] ct：REST 链路 / 错误 / 静态 / MCP 端到端 (T)

## 4. 前端 `web/`（07）
- [x] 项目页、任务列表（状态 chip + 单搜索框、URL 同步、TaskTable）、任务详情（行内编辑、迁移、时间线、Feedback 线索）
- [x] 右侧 2/3 面板：新建任务 / 项目、添加 / 修订 Feedback
- [x] 顶栏全局搜索下拉；可折叠侧栏（项目 / 筛选器）；`/query` BQL 页；`/data` 导入导出页
- [x] Markdown：Crepe 编辑器（主题跟随、mermaid 预览、手柄留边）+ react-markdown 展示 (T)
- [x] vitest：status 表、ID 归一、缺省 kind、MarkdownView (T)

## 5. Release
- [x] `prod` profile（带 ERTS、无 debug_info、tar）、`prod.vm.args`、`release.env.example`、overlay 带 export/import 脚本
- [x] mnesia `{mnesia, load}` + `BOSUN_DATA_DIR` 运行期决定目录
- [x] `scripts/build-release.sh`；tar 解压到别处、`BOSUN_HTTP_PORT=4321 BOSUN_DATA_DIR=... bin/bosun foreground` 实测页面 / REST / 搜索均正常

## 5.9 工单驱动（2026-09-11）
- [x] BOS-4 UI 统一：带输入的弹窗全部改为右侧面板（TransitionPanel / FilterFormPanel），纯确认 ConfirmDialog
- [x] BOS-5 FreeBSD rc.d 脚本 `deploy/freebsd/bosun` + README 小节（未实机验证）
- [x] BOS-6 遗漏补齐：favicon、`.mcp.json` + `CLAUDE.md`、eslint（react-hooks v7 规则全部通过）、README 说明首次编译慢

## 5.10 身份 / 角色 / 工作流文档（2026-09-11）
- [x] BOS-7 身份模型：`identify` / `whoami` / `list_actors`、会话级身份、`actor` 表、前端「我是谁」与人 / Agent 图标 (T)
- [x] BOS-8 角色模型：assignee、自验收需测试结果、`commits` / `tests` 结构化字段
- [x] BOS-9 工作流文档 `docs/AGENT-WORKFLOW.md`
- [x] BOS-11 Epic：`kind = epic` + `epic` 字段、进度、步骤列表、BQL `kind` / `epic`
- [x] BOS-12 任务关联：`replaces` / `depends_on`、blocked、BQL（设计 12）
- [x] BOS-10 `CANCELLED`（已撤销）状态：NEW / IN_PROGRESS 可撤销、可恢复

## 5.11 组织 / 用户 / 认证 / API Key（2026-09-14，BOS-15，分支 feature/org-auth，设计 13）
- [x] BOS-16 领域层：org · user · session · api_key · email_code 表；`bosun_scope` 作用域；project / filter / actor 带 org；mailer（gen_smtp，未配置走日志）；backup 按组织 (T)
- [x] BOS-17 REST：`bosun_web_auth` 中间件（Cookie 会话 / Bearer key / admin）；auth · org · users · keys 端点；署名 = 登录用户 (T)
- [x] BOS-18 MCP：`/mcp` 只认 Bearer key；会话绑定 key 主人；工具 / 资源 / 提示按组织；`whoami` 带 user；`.mcp.json` 带 header (T)
- [x] BOS-19 前端：登录 / 注册（验证码）/ 账户（API key 只显示一次）/ 组织用户管理；AuthGate；账户菜单 (T)
- [x] BOS-20 文档：README、designs/00、AGENT-WORKFLOW、sys.config / release.env.example

## 6. 收尾
- [x] README、设计文档 00–10
- [x] `rebar3 check`（xref / dialyzer / eunit / ct）全部通过
- [x] 重建后再用 Claude Code 走一遍 MCP 验收（本会话通过 `.mcp.json` 连上 bosun，BOS-3 ~ BOS-6 均由 MCP 建单 / 迁移 / 反馈）

## 7. 业务审查（2026-10-28）
- [x] [MCP API Key 权限分级](tasks/2026-10-28-mcp-key-permissions.md)：`read` / `write` / `manage` scopes、项目白名单、MCP 工具强制授权
- [x] [MCP actor 身份收紧](tasks/2026-10-28-actor-identity-hardening.md)：绑定 API key 后禁止参数冒名
- [x] [Epic 进度与状态规则修正](tasks/2026-10-28-epic-progress-and-state.md)：取消项不阻碍完成率，Epic 不能在子任务未完成时手动 DONE
- [x] [Epic 子任务 Kanban](tasks/2026-10-28-epic-kanban.md)：状态列拖拽、乐观更新、blocked / open question 可视化
- [x] [API Key 安全轮换与审计](tasks/2026-10-28-api-key-rotation.md)：保留权限配置和历史，旧秘密值立即失效
- [x] [shadcn/Tailwind 全量迁移](tasks/2026-10-28-shadcn-migration.md)：移除 MUI compat 与 DataGrid，前端保留 React + shadcn

## 8. 依赖升级与全项目审查（2026-11-19）
- [x] [bitcask 6.7.1 → 10.0.0](tasks/2026-11-19-bitcask-10-upgrade.md)：旧索引自动重建、`search_fields_attributed` 按命中字段加权、索引打不开不拦启动
- [x] [bitcask 10.0.0 → 12.0.0](tasks/2026-11-20-bitcask-12-upgrade.md)：去掉按命中字段加权与 merge 词典路径两处绕法；标签命中不再必然排在标题命中前面
- [x] [bitcask 12.0.1 → 13.1.1](tasks/2026-11-24-bitcask-13-upgrade.md)：依赖改按 `git_subdir` 取 `apps/bitcask`（13.1.1 起干净环境才编得出 NIF）；代码不用改，既有索引直接可用
- [x] [bitcask 13.1.1 → 13.1.2](tasks/2026-11-25-bitcask-13.1.2-upgrade.md)：PATCH，上游只升了内嵌的 libbitcask（库源码无变化）；代码不用改
- [x] [审查：缺陷修复与优化](tasks/2026-11-19-audit-fixes.md)：key 轮换越权、导入跨组织写、序号回退覆盖、BQL 500、Epic 级联、前端提示全哑等；没动的建议也列在里面

## 9. 前端 UI 优化（2026-11-25）
- [x] [项目看板 + 拖拽 + 外壳样式](tasks/2026-11-25-ui-kanban-refresh.md)：参照 shadcnuikit dashboard；dnd-kit 拖拽（触屏 / 键盘）、拖到完成 / 拒绝等弹证据 / 说明面板、列折叠、看板 / 列表切换、列表列显隐与分页、项目列表页 / 详情页统计卡片与动态图（新接口 `/api/v1/stats`）、任务详情页 / BQL 查询页 / 账户页 / 组织页 / 数据导入导出页 / 登录注册页改版、侧栏与筛选条改版
