# Bosun

人 + Agent 协作的任务管理系统。设计在 `designs/`，任务清单在 `TASK.md`，README 有运行方式。

## 工单

本仓库自己的工单在 Bosun 项目 **`BOS`**（通过 `.mcp.json` 连到本机 :4000 的 MCP）。
规则见 @docs/AGENT-WORKFLOW.md。会话开始先 `identify(name="bos/<worktree>", kind="agent", project="BOS")`；
先读工单（`get_task`），`transition_task` 到 IN_PROGRESS 再动手；完成后跑测试、`add_feedback(kind=comment)`
写清改了什么，再 `transition_task(DONE, commits=[...], tests={...})`；需要人拍板用 `kind=question` 并停下。
验收由提出方做；自己验收必须带通过的测试。新需求先建工单写设计，再开发。

## 开发

- 后端：`scripts/dev-run.sh` / `scripts/dev-stop.sh`；测试 `rebar3 eunit`、`rebar3 ct`、`rebar3 check`
- 前端：`cd web && pnpm build`（输出到 `apps/bosun_web/priv/static`）、`pnpm test`、`pnpm lint`、`pnpm typecheck`
- 依赖 `_checkouts/` 软链到 `~/workspace/{beamai,beamai_extra,bitcask}`；bitcask 是 C++ NIF，首次编译约 3 分钟
- 领域函数一律返回 `{ok, Map} | {error, Reason}`，REST / MCP 各自映射错误；对外 map 用 binary 键
- 前端带输入的弹窗一律用 `SidePanel`，纯确认用 `ConfirmDialog`；小 chip 用 `SoftChip`
