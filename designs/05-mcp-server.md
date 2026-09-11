# 05 · MCP 服务端

> 横切能力：把领域操作以 MCP 工具暴露给 Claude Code 等 Agent。基于 `beamai_mcp`（beamai_extra）。

## 1. 接入

`bosun_web_router` 把 `bosun_mcp:cowboy_config()`（tools / resources / prompts / server_info）挂到 `{"/mcp", beamai_mcp_cowboy_handler, Config}`；只开 Streamable HTTP。

```bash
claude mcp add --transport http bosun http://127.0.0.1:4000/mcp
```

## 2. 工具目录（22）

| 工具 | 来源 |
|---|---|
| `identify` `whoami` `list_actors` | 11 |
| `list_projects` `get_project` `create_project` `update_project` | 01 |
| `list_tasks` `search_tasks` `get_task` `create_task` `update_task` | 02 / 08 |
| `transition_task` | 03 |
| `link_tasks` `unlink_tasks` | 12 |
| `add_feedback` `update_feedback` `list_feedback` | 04 |
| `query_tasks` `list_filters` `save_filter` `delete_filter` | 09 |

资源：`bosun://projects`（JSON）、`bosun://workflow`（状态机与推荐流程）、`bosun://bql`（BQL 参考）。提示：`work_on_task(task_id)`。

## 3. 约定

- 成功返回 JSON 文本；失败 `{error, Binary}` → `isError: true`，文本面向 Agent，告诉它下一步怎么做（`bosun_mcp:error_to_text/1`）。
- 身份来自会话：会话开始调一次 `identify`（11），之后的写操作都记在这个名字下；没 identify 会得到 `agent-1a2b3c` 这种自动名。`actor` / `author` 参数只用于单次调用覆盖，正常不需要。
- 工具描述用英文。

## 4. 测试

`bosun_mcp_tests`（直接调 handler）+ `bosun_web_SUITE:mcp_end_to_end`（httpc 走 initialize → tools/list → tools/call → resources/read → prompts/get）。手工验收：`claude -p --mcp-config` 先 `identify`，再以 KEEL 项目 agent 身份跑通建项目 → 建任务 → 开始 → 反馈 → 完成。
