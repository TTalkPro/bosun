# 11 · 身份与操作者

> 2026-09-11 新增（BOS-7）。`actor` / `author` 从「自报字符串」变成「有来源、有类型的身份」。这不是认证——名字仍然是自报的，目标只是让记录可信、可区分。

## 1. 身份来源（优先级）

| 来源 | 谁用 | 说明 |
|---|---|---|
| 工具 / 请求参数 `actor` / `author` | 代表别人时 | 保留，正常情况不用 |
| **MCP 会话身份** `identify(name, kind, project?, worktree?)` | Agent | 会话开始调一次；之后所有写操作自动署名。`whoami()` 查看 |
| 自动名 `agent-<会话短id>` | 没 identify 的 Agent | 每个会话唯一，同一会话内稳定；不强制 identify，只是可读性差 |
| 顶栏「我是谁」（localStorage） | 浏览器里的人 | 缺省 `user`，kind 恒为 human |

命名约定：Agent 用 `<项目key>/<worktree 或用途>`，如 `keel/feature-search`；同一项目多个 worktree 各自不同名。

## 2. 实现

- `bosun_identity`（bosun_mcp，gen_server 持有 ETS `session pid → identity`）：tool handler 在 `beamai_mcp_server` 会话进程里执行，`self()` 即会话；monitor 会话进程，退出即清。`bosun_mcp:actor/1` = 参数 > 会话身份 > 自动名；`actor_kind/1` 同理。
- Mnesia 表 `actor`：`name`（主键）、`kind`（human | agent）、`project`、`worktree`、`first_seen`、`last_seen`。每次写操作（建单 / 迁移 / feedback）`bosun_actor:touch` upsert；`identify` 也写。REST 缺省 kind = human，MCP 用会话 kind；都没给时按名字猜（`user` → human，其余 agent）。启动时从历史回填一次。
- 任务 JSON 加 `created_by_kind`；`GET /api/v1/actors`；MCP `list_actors`；导出 / 导入带 `actor` 表。
- 前端：`ActorAvatar` / `ActorChip` 按 kind 画人形 / 机器人；列表提出人、详情头、时间线、Feedback 头像都用它；修订按钮只对当前身份写的条目显示。

## 3. 不做的

- 认证 / 防冒名：单人系统，没必要；以后要做在 cowboy 中间件层加 token → 绑定身份。
