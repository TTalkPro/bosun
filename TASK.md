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
- [x] [bitcask 13.1.2 → 13.2.0](tasks/2026-11-25-bitcask-13.2.0-upgrade.md)：上游只改图层（布局 2），bosun 只用检索，代码不用改；这次也用 docker build 验了 git_subdir 干净拉取
- [x] [审查：缺陷修复与优化](tasks/2026-11-19-audit-fixes.md)：key 轮换越权、导入跨组织写、序号回退覆盖、BQL 500、Epic 级联、前端提示全哑等；没动的建议也列在里面

## 9. 前端 UI 优化（2026-11-25）
- [x] [项目看板 + 拖拽 + 外壳样式](tasks/2026-11-25-ui-kanban-refresh.md)：参照 shadcnuikit dashboard；dnd-kit 拖拽（触屏 / 键盘）、拖到完成 / 拒绝等弹证据 / 说明面板、列折叠、看板 / 列表切换、列表列显隐与分页、项目列表页 / 详情页统计卡片与动态图（新接口 `/api/v1/stats`）、任务详情页 / BQL 查询页 / 账户页 / 组织页 / 数据导入导出页 / 登录注册页改版、侧栏与筛选条改版
- [x] [表单标签与输入框间距、焦点框压标签](tasks/2026-11-25-form-field-spacing.md)：统一 FormField、短表单面板变窄、新建项目先名称后 Key + 编号预览、新建任务「取消」按钮样式

## 10. Milestone（2026-11-25，设计 14，已审定，M1～M4 完成）
- [x] [设计稿](designs/14-milestone.md)：每项目一个进行中的 milestone、看板按 milestone、发布（未完成结转 + 快照 + 发布说明）、燃尽；与 Epic 正交；审定时改为 Epic 可进 milestone（没做完的步骤跟随）、归属变更留痕（milestone_log）
- [x] M1 后端模型（表 / 规则 / REST / BQL / 备份 v3）：`bosun_milestone`、`bosun_web_milestones_h`；eunit `bosun_milestone_tests` 12 例 + ct `milestones`；`rebar3 check` 全绿（未提交）
- [x] M2 前端主线：项目页 milestone 切换器（?m=，看板缺省进行中 / 没有则待规划，列表另有全部）+ 概况卡片 / 待规划提示、管理页 `/projects/:key/milestones`（卡片、开始 / 暂停 / 重新打开 / 删除、范围变更面板）、任务详情 Milestone 行 + 动态流里的归属变更、新建任务的 Milestone 属性（缺省当前看的）、看板卡片 / 列表行的 Milestone 子菜单、列表 Milestone 列与勾选批量、移出时写原因、侧栏显示进行中的 milestone、BQL 补全；后端补 project.active_milestone、批量带 comment、系统说明改中文；前端 65 例（新增 milestones.test.ts）、`rebar3 check` 全绿（未提交）
- [x] M3 发布与统计：`bosun_stats:milestone/2` + `/api/v1/stats?milestone=`（计数与按 milestone_log 回放的燃尽，已发布按发布前一刻收尾）；概况卡片右侧燃尽图、统计卡片跟随 milestone；发布面板（交付 / 待验收 / 没做完的去向含新建、按 Epic 分组的发布说明草稿可改）；已发布的显示发布记录与发布说明；summary 加 carried_to_name；顺手修同毫秒状态历史排序（后端燃尽与前端进度卡片）；eunit 80 + ct 8、前端 68 例全绿（未提交）
- [x] M4 MCP 与文档：新增 `bosun_mcp_milestone_tools`（list / get / create / update / transition / assign，权限 read / manage / write），list_tasks / create_task / update_task 加 milestone（update 另有 milestone_comment），milestone 相关错误文案给 Agent 下一步建议，work_on_task 提示带「在不在当前发布里」，bosun://bql 补字段；docs/AGENT-WORKFLOW（中 / 英）加 4d 节，docs/BQL.md、README（功能 / 工具 28 / REST）、designs/05 / 09 / 10 / 14 更新；MCP eunit 14 例（新增 milestones），ct 工具数改 28，范围变更顺序断言改为不依赖同毫秒先后；`rebar3 check` 全绿（eunit 81 + ct 8），前端 68 例（未提交）

## 11. 文档与发布材料（2026-11-25，Bosun milestone 0.1.4 / BOS-67）
- [x] BOS-68 更新所有文档：README（概览 + 截图 + 功能概览 + REST / 工具清单）、designs/00 / 02 / 07 / 14 与实现对齐（07 重写页面 / 路由 / 看板规则）
- [x] BOS-69 [CHANGELOG.md](CHANGELOG.md)：0.1.0 ～ 0.1.3 按 tag 整理，未发布部分记 0.1.4
- [x] BOS-70 [docs/FEATURES.md](docs/FEATURES.md)：按 17 个模块列全部功能
- [x] BOS-71 README 功能截图：docs/screenshots/（9 张，演示数据 Acme，含深色）
- [x] 界面调整（用户提出）：看板只在选中某个 milestone 时提供，全部任务 / 待规划只有列表；侧栏 milestone 改为项目下的独立子项（缩进 + 进度条 + 百分比）

## 12. 0.1.4 之后
- [x] 发布 = 验收（用户 2026-11-25 定，设计 14 D8）：milestone 里有新建 / 进行中的任务（含 Epic）时拒绝发布（409 `unfinished` / MCP 文案），发布面板列出并可一键移出；发布时已完成的全部置为已验收（历史「随 <名称> 发布验收」），不再自动结转；summary 改为 delivered / verified_on_release / epics / notes；MCP `transition_milestone` 去掉 carry_over；文档、CHANGELOG（未发布段）、发布面板截图同步（未提交）
