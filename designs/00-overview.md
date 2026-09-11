# Bosun 总体设计

> Bosun（水手长）—— 一个面向「人 + Agent」协作的轻量任务管理系统。
> 后端 Erlang/OTP，前端 React + MUI，对外同时提供 REST（给前端）与 MCP（给 Agent）两套接口。

## 1. 目标与边界

| 要做 | 不做（本期） |
|---|---|
| 多项目管理（创建 / 查询） | 认证、授权、多租户（单人操作，见 §6） |
| 项目内任务：带项目前缀的自增 ID、创建 / 查询 / 编辑 | 任务依赖、子任务、看板拖拽、甘特图 |
| 任务状态机 `NEW → IN_PROGRESS → DONE → VERIFIED`（+ `REJECTED` / `CANCELLED`） | 自定义工作流 |
| 任务 Feedback（追加 / 修订 / 查看） | 通知、邮件、Webhook |
| 所有上述能力通过 MCP 暴露给 Agent | A2A、AG-UI 聊天面板（预留扩展点） |
| Milkdown 编辑器 + GFM 渲染 + Mermaid | 附件上传、图片托管 |
| 全文检索（bitcask BM25）、BQL 查询与保存的筛选器、整库导出导入 | |

## 2. 功能拆分

| # | 设计文档 | 内容 | 依赖 |
|---|---|---|---|
| 01 | [01-project.md](01-project.md) | 项目实体、Key 规则、CRUD、REST/MCP 接口 | 00 |
| 02 | [02-task.md](02-task.md) | 任务实体、`KEY-N` ID 分配、CRUD、查询 | 01 |
| 03 | [03-task-status.md](03-task-status.md) | 状态机、迁移规则、历史记录 | 02 |
| 04 | [04-feedback.md](04-feedback.md) | Feedback 实体、追加 / 修订 / 列表 | 02 |
| 05 | [05-mcp-server.md](05-mcp-server.md) | MCP 服务端接入、工具目录、资源、错误约定 | 01–04 |
| 06 | [06-markdown-editor.md](06-markdown-editor.md) | Milkdown 编辑器、GFM 渲染、Mermaid | 07 |
| 07 | [07-web-app.md](07-web-app.md) | 前端工程、页面、路由、API 客户端 | 01–04 |
| 08 | [08-search.md](08-search.md) | bitcask BM25 全文检索（后补） | 02、04 |
| 09 | [09-bql.md](09-bql.md) | BQL 查询语言与保存的筛选器（后补） | 02、08 |
| 10 | [10-backup.md](10-backup.md) | 整库导出 / 导入（后补） | 01–04、09 |
| 11 | [11-identity.md](11-identity.md) | 身份与操作者：会话身份、actor 表（后补） | 05、07 |

「MCP 可操作」是横切需求：01–04 各自定义**自己的** MCP 工具（名称、参数 Schema、返回值），05 只负责把它们挂起来并统一约定。

## 3. 技术栈

### 后端

| 组件 | 选择 | 理由 |
|---|---|---|
| 运行时 | Erlang/OTP 28（`minimum_otp_vsn` 27） | 与 beamai 一致；直接用 stdlib `json` |
| 构建 | rebar3 umbrella | 与 beamai_extra 同构 |
| HTTP | cowboy 2.12 | beamai_mcp 的 cowboy 适配器可直接复用 |
| MCP | `beamai_mcp`（beamai_extra） | 已实现 Streamable HTTP + session registry，只需注册 tool |
| 存储 | **Mnesia**（`disc_copies`） | 零外部依赖、事务、二级索引；单人规模绰绰有余 |
| 检索 | bitcask（BM25 + jieba，C++ NIF） | 纯索引，可随时从 Mnesia 重建 |
| JSON | OTP `json` | 与依赖库口径一致 |
| ID | 项目 Key + 项目内自增序号 | 见 02 |

依赖引入方式（`rebar.config`）：git_subdir 指向 beamai / beamai_extra，git 指向 bitcask；本地开发用 `_checkouts/` 软链（进 `.gitignore`）。

> 为什么不选 SQLite：需要 NIF 依赖，换来的 SQL 查询能力本期用不上。
> 为什么不选纯文件：Feedback 追加与 ID 分配需要原子性，自己写锁不如用 Mnesia 事务。
> 存储层封装在 `bosun_store` 后面，将来要换只动一个模块。

### 前端

| 组件 | 选择 |
|---|---|
| 框架 | React 19 + TypeScript + Vite 7 |
| UI | MUI 7（`@mui/material`、`@mui/x-data-grid`、`@mui/lab`）、`@mui/icons-material` |
| 路由 | react-router 7（data router） |
| 数据 | SWR + axios |
| 通知 | notistack |
| Markdown | Milkdown 7（Crepe）+ react-markdown + mermaid（见 06） |
| 包管理 | pnpm |

aurora 作为**参考实现**（主题、侧边栏骨架、SWR hook 组织方式），不直接依赖其 workspace 包。

## 4. 仓库结构

```
bosun/
├── rebar.config                 # umbrella；prod profile 出带 ERTS 的 tar
├── config/                      # sys.config / vm.args / prod.vm.args / release.env.example
├── scripts/                     # dev-run / dev-stop / export / import / build-release
├── apps/
│   ├── bosun_core/              # 领域层：store · id · json · project · task · task_status · feedback · search · bql · filter · backup
│   ├── bosun_mcp/               # MCP tools / resources / prompts（纯函数，调用 bosun_core）
│   └── bosun_web/               # cowboy REST + /mcp + 静态 SPA（priv/static 是 pnpm build 输出）
├── web/                         # Vite + React 前端
└── designs/                     # 本目录
```

三个 OTP app 的依赖方向：`bosun_web → bosun_mcp → bosun_core`。`bosun_core` 对 HTTP / MCP 一无所知。

## 5. 分层与调用路径

```
   React (SWR/axios)          Claude Code / 任意 MCP 客户端
          │ HTTP JSON                    │ Streamable HTTP (JSON-RPC)
          ▼                              ▼
   bosun_web_*_h (cowboy)       beamai_mcp_cowboy_handler
          │                              │ tools/call
          │                     bosun_mcp_*_tools (handler fun)
          └──────────┬───────────────────┘
                     ▼
   bosun_project / bosun_task / bosun_task_status / bosun_feedback / bosun_bql / bosun_filter / bosun_backup
                     │  {ok, Map} | {error, Reason}
                     ▼
        bosun_store (Mnesia 事务)     bosun_search (bitcask 索引，写后异步)
```

约定：

- 领域模块的**每个公开函数返回 `{ok, Term} | {error, Reason}`**，`Reason` 为 atom 或 `{atom(), Detail}`。REST 与 MCP 各自把 `Reason` 映射成自己的错误形态，映射表集中在 `bosun_web_api:error_to_http/1` 与 `bosun_mcp:error_to_text/1`。
- 领域层输入输出用 **map**（键为 binary），记录只在 `bosun_store` / `bosun_json` / `bosun_backup` 内部与 Mnesia 打交道。
- 时间统一 `erlang:system_time(millisecond)` 存整数，输出 ISO-8601（UTC）字符串。

## 6. 单人 / 无认证的含义

- 所有接口不鉴权，缺省监听 `127.0.0.1:4000`（`sys.config` / 环境变量 `BOSUN_HTTP_IP` `BOSUN_HTTP_PORT` 可改）。
- 数据模型里保留 `author` / `actor` 字段，值由调用方自报：前端固定 `"user"`，MCP 工具允许 Agent 传（缺省 `"agent"`，建议用项目 Key）。
- 没有并发冲突控制（无 ETag / version）。Mnesia 事务保证单条写入原子，「后写覆盖」可接受。

## 7. 配置

`config/sys.config` 给缺省值；环境变量优先：`BOSUN_HTTP_IP`、`BOSUN_HTTP_PORT`、`BOSUN_DATA_DIR`（mnesia 在 `<dir>/mnesia`，索引在 `<dir>/search`）。mnesia 在 release 里只 `load` 不 `start`，由 `bosun_store:init/0` 定好目录后拉起。

## 8. 运行方式

```bash
scripts/dev-run.sh                # 开发（非交互）；scripts/dev-stop.sh 停
rebar3 shell                      # 交互式
scripts/build-release.sh          # 前端 + rebar3 as prod tar
cd web && pnpm dev                # 5173，代理 /api /mcp → 4000
claude mcp add --transport http bosun http://127.0.0.1:4000/mcp
```

## 9. 测试策略

| 层 | 方式 |
|---|---|
| bosun_core | eunit，`bosun_test_env:setup/0` 起 ram_copies 表 + 临时索引 |
| bosun_mcp | eunit：直接调用 tool handler fun |
| bosun_web | common_test，真实 cowboy，`httpc` 打 REST 与 MCP（Streamable HTTP） |
| web | vitest + testing-library |

## 10. 后续扩展点

- **AG-UI 聊天面板**：`beamai_agui` 已提供 `/agui/*` 路由与 session；把 `bosun_mcp` 的工具经 `beamai_mcp_adapter` 转成 agent tool 即可。
- **认证**：在 cowboy 中间件层加 token 校验，领域层不用动。
