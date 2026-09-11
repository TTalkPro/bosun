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
- [x] `bosun_search`（08）：bitcask jieba BM25，fields 加权，key 前缀过滤，写后异步索引，启动重建 (T)
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

## 6. 收尾
- [x] README、设计文档 00–10
- [x] `rebar3 check`（xref / dialyzer / eunit / ct）全部通过
- [x] 重建后再用 Claude Code 走一遍 MCP 验收（本会话通过 `.mcp.json` 连上 bosun，BOS-3 ~ BOS-6 均由 MCP 建单 / 迁移 / 反馈）
