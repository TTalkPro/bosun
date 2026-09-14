# Bosun

面向「人 + Agent」协作的轻量任务管理系统。

- 后端：Erlang/OTP 28，rebar3 umbrella，Mnesia 存储
- 前端：React 19 + MUI 7，Milkdown 编辑器，GFM + Mermaid 渲染
- 接口：REST（前端）+ MCP（Agent，基于 [beamai_extra](https://github.com/TTalkPro/beamai_extra) 的 `beamai_mcp`）
- 检索：[bitcask](https://github.com/DavidAlphaFox/bitcask) BM25 + jieba 分词（纯索引，可随时从 Mnesia 重建）

## 功能

1. 多项目管理（Key 成为任务 ID 前缀）
2. 项目内任务，ID 自动分配：`BOS-12`
2b. Epic：`kind = epic` 的任务作为整体目标，普通任务用 `epic` 挂上去作为步骤，进度按已完成（DONE / VERIFIED）步骤数派生；步骤全部完成后 Epic 自动置为 DONE
2c. 任务关联：`replaces`（替代，对方自动撤销）/ `depends_on`（依赖，对方没做完不能开始，成环拒绝）
3. 任务状态 `NEW → IN_PROGRESS → DONE → VERIFIED`（可打回 / 重开；执行方可 `REJECTED`，提出方重新提交；不需要了可 `CANCELLED`，可恢复）
4. 任务 Feedback（不可变；作者可修订 = 新版本 + 旧版本作废，线索完整；`comment / review / question / answer`）
5. 组织与用户：任何人可注册组织（邮箱验证码），注册人是管理员，组织内用户由管理员分配；项目归属组织，各组织互相看不到；Web 登录会话，MCP 用每个用户自己建的 API key（见 [designs/13](designs/13-org-auth.md)）
6. Milkdown 编辑器，GitHub 风格 Markdown 渲染，Mermaid 图
7. 全文检索：标题 / 正文 / 标签 / Feedback，中英文，跨项目
8. [BQL](docs/BQL.md)（JQL 风格）跨项目查询 + 可保存的筛选器
9. 整库 JSON 导出 / 导入（`/data` 页或 `scripts/export.sh` `scripts/import.sh`）

## 运行

依赖：Erlang/OTP ≥ 27、rebar3、Node ≥ 20、pnpm、cmake + libicu-dev（bitcask NIF）。本机开发用 `_checkouts/` 指向上游源码：

```bash
mkdir -p _checkouts
ln -s ~/workspace/beamai/apps/beamai_core      _checkouts/beamai_core
ln -s ~/workspace/beamai_extra/apps/beamai_mcp _checkouts/beamai_mcp
ln -s ~/workspace/bitcask                      _checkouts/bitcask
```

```bash
# 前端构建（产物直接输出到 apps/bosun_web/priv/static）
cd web && pnpm install && pnpm build && cd ..

# 后端（同一端口提供页面、REST、MCP）
scripts/dev-run.sh          # 非交互，Ctrl-C 退出；scripts/dev-stop.sh 停止（首次约 3 分钟：bitcask 的 C++ NIF 要编一遍，之后几秒）
# 或
rebar3 shell                # 交互式
```

打开 http://127.0.0.1:4000 ，先「注册组织」：填邮箱 → 收验证码 → 组织名 / 显示名 / 密码。没有配置 SMTP 时验证码打在服务端日志里（`bosun_mailer [log mode]`）。数据在 `data/mnesia/`，搜索索引在 `data/search/`（可删，启动自动重建）。

### 组织、用户与 API key

- 注册人是组织管理员；在「组织与用户」页给同事建账号（邮箱 + 显示名 + 初始密码，线下告知；用户登录后可改密）。管理员还能停用 / 恢复 / 改角色 / 重置密码，并负责导入导出。
- 显示名就是任务历史 / Feedback 里的署名；Agent 通过 MCP 写入时署 `identify` 的名字，同时记在 key 主人的账号下。
- 每个用户在「账户与 API Key」页给自己的 Agent 建 key（`bsk_…`，只显示一次，可撤销）。`/mcp` 只认 `Authorization: Bearer <key>`；REST 也接受 Bearer（脚本用）。
- 项目 key 全局唯一；别的组织占了就换一个。
- **从无认证版本升级**：旧项目没有组织，任何人都看不到。注册组织后在 shell 里收编一次：
  `bin/bosun remote_console` → `bosun_org:adopt_orphans(<<"o1">>).`（开发时 `rebar3 shell` 同理；`o1` 是组织 id，「组织」页能看到）。
- 邮件：`config/sys.config` 的 `{bosun_core, [{smtp, [...]}]}` 或环境变量 `BOSUN_SMTP_RELAY` / `BOSUN_SMTP_PORT` / `BOSUN_SMTP_USERNAME` / `BOSUN_SMTP_PASSWORD` / `BOSUN_SMTP_FROM`；有 relay 就走 SMTP（gen_smtp，STARTTLS if_available），否则日志模式。https 部署加 `BOSUN_COOKIE_SECURE=true`。

前端开发（热更新，`/api` `/mcp` 代理到 4000）：

```bash
cd web && pnpm dev          # http://localhost:5173
```

## 生产 release

```bash
scripts/build-release.sh    # 前端 + rebar3 as prod tar → _build/prod/rel/bosun/bosun-0.1.0.tar.gz
```

解压后 `bin/bosun foreground|start|stop|remote_console`。自带 ERTS，只能在同 OS / 架构上跑。环境变量（见 `release.env.example`）：

| 变量 | 缺省 | 说明 |
|---|---|---|
| `BOSUN_HTTP_IP` | `127.0.0.1` | 监听地址 |
| `BOSUN_HTTP_PORT` | `4000` | 端口 |
| `BOSUN_DATA_DIR` | `data`（相对 release 根） | mnesia 与搜索索引目录 |
| `BOSUN_SMTP_RELAY` `BOSUN_SMTP_PORT` `BOSUN_SMTP_USERNAME` `BOSUN_SMTP_PASSWORD` `BOSUN_SMTP_FROM` | 无（日志模式） | 注册验证码邮件 |
| `BOSUN_COOKIE_SECURE` | `false` | https 部署设 `true`，登录 Cookie 加 `Secure` |

### systemd

`deploy/bosun.service` + `deploy/bosun.env`（安装步骤写在 unit 文件头部）：解压到 `/opt/bosun`，数据放 `/var/lib/bosun`，`systemctl enable --now bosun`，日志 `journalctl -u bosun -f`。

### FreeBSD

`deploy/freebsd/bosun` 是 rc.d 脚本（`daemon(8)` 托管 `bin/bosun foreground`），安装步骤与 `rc.conf` 变量写在脚本头部：`install -m 555 deploy/freebsd/bosun /usr/local/etc/rc.d/bosun && sysrc bosun_enable=YES && service bosun start`，变量 `bosun_root` / `bosun_data_dir` / `bosun_http_ip` / `bosun_http_port` / `bosun_log`。

在 FreeBSD 上构建：`pkg install erlang rebar3 cmake icu node22 npm-node22 && npm i -g pnpm`；bitcask 的 NIF 是 C++23，用系统 clang（FreeBSD 14+）；release 自带 ERTS，必须在目标 OS / 架构上 `scripts/build-release.sh`。未在真机上验证过，遇到问题看 `/var/log/bosun/bosun.log`。

`bin/export.sh` / `bin/import.sh` 随 release 一起打包。节点名固定 `-sname bosun`（`config/prod.vm.args`）；与本机开发节点同时跑会冲突，改 `releases/<vsn>/vm.args` 即可。

## 接入 Claude Code（MCP）

先在「账户与 API Key」页建一把 key，然后：

```bash
export BOSUN_API_KEY=bsk_...          # 放进 shell 配置；每个人用自己的
# 用户级（所有项目可用）
claude mcp add --transport http --scope user bosun http://127.0.0.1:4000/mcp \
  --header "Authorization: Bearer ${BOSUN_API_KEY}"
# 或项目级：在目标仓库根目录写 .mcp.json（可提交，队友共享；key 走环境变量，不进仓库）
```

`.mcp.json`：

```json
{ "mcpServers": { "bosun": { "type": "http", "url": "http://127.0.0.1:4000/mcp",
                             "headers": { "Authorization": "Bearer ${BOSUN_API_KEY}" } } } }
```

`claude mcp list` 能看到 bosun 即可；没有 key 或 key 被撤销时 `/mcp` 回 401。建议在该仓库的 `CLAUDE.md` 里写一句「本项目的任务在 Bosun 项目 `KEEL` 里；调用 bosun 工具时 actor/author 用 `keel`；开工前 `transition_task` 到 IN_PROGRESS，完成后 `add_feedback` 再置 DONE 并带上 `commits` / `tests`」——完整规则见 [`docs/AGENT-WORKFLOW.md`](docs/AGENT-WORKFLOW.md)（可在其他仓库的 `CLAUDE.md` 里用 `@~/workspace/bosun/docs/AGENT-WORKFLOW.md` 引用），MCP 资源 `bosun://workflow` 返回其英文版。也可以直接用提示 `/bosun:work_on_task KEEL-1` 把任务全文拉进上下文。

工具（22）：`identify` `whoami` `list_actors` `list_projects` `get_project` `create_project` `update_project` `list_tasks` `search_tasks` `get_task` `create_task` `update_task` `transition_task` `link_tasks` `unlink_tasks` `add_feedback` `update_feedback` `list_feedback` `query_tasks` `list_filters` `save_filter` `delete_filter`；资源 `bosun://projects`、`bosun://workflow`、`bosun://bql`；提示 `work_on_task`。

## REST

除 `auth/register*`、`auth/login`、`workflow.md` 外都要登录（Cookie `bosun_session`）或 `Authorization: Bearer <api key>`；标 admin 的只有组织管理员能调。

| 方法 | 路径 |
|---|---|
| POST | `/api/v1/auth/register/code`（`{email}` → 202）、`/api/v1/auth/register`（`{org_name,email,code,name,password}` → 201 + Cookie）、`/api/v1/auth/login`、`/api/v1/auth/logout`、`/api/v1/auth/password`（`{current,new}`） |
| GET | `/api/v1/auth/me`（`{user, org, via}`） |
| GET / PATCH | `/api/v1/org`（PATCH admin） |
| GET / POST | `/api/v1/users`；GET / PATCH `/api/v1/users/:id`（admin；`name role status password`） |
| GET / POST | `/api/v1/keys`（POST 返回明文 `key`，仅一次）；DELETE `/api/v1/keys/:id`（撤销） |
| GET | `/api/v1/actors` |
| GET | `/api/v1/workflow.md?lang=zh\|en`（协作工作流文档，`text/markdown`） |
| GET | `/api/v1/search?q=&project=&limit=` |
| GET | `/api/v1/query?q=<BQL>&limit=&offset=` |
| GET / POST | `/api/v1/filters`；GET / PATCH / DELETE `/api/v1/filters/:id`；GET `/api/v1/filters/:id/run` |
| GET / POST | `/api/v1/export`、`/api/v1/import?mode=merge\|replace`（admin；只含本组织） |
| GET / POST | `/api/v1/projects` |
| GET / PATCH | `/api/v1/projects/:key` |
| GET / POST | `/api/v1/projects/:key/tasks` |
| GET / PATCH | `/api/v1/tasks/:id` |
| POST / DELETE | `/api/v1/tasks/:id/links`、`/api/v1/tasks/:id/links/:type/:to`（`replaces` / `depends_on`） |
| POST | `/api/v1/tasks/:id/transition`（`to comment commits[] tests{command,passed,summary}`；署名 = 登录用户；执行方自验收需通过的测试 → 409 `self_verify_requires_tests`） |
| GET / POST | `/api/v1/tasks/:id/feedback` |
| PATCH | `/api/v1/tasks/:id/feedback/:seq`（修订） |

## 测试

```bash
rebar3 eunit          # 领域层 + BQL + 备份 + MCP 工具
rebar3 ct             # REST + MCP 端到端（真实 cowboy）
rebar3 check          # xref + dialyzer + eunit + ct
cd web && pnpm test   # vitest
cd web && pnpm lint   # eslint（typescript-eslint + react-hooks + react-refresh）
```

## 设计文档

见 [designs/](designs/)：[总体](designs/00-overview.md) · [项目](designs/01-project.md) · [任务](designs/02-task.md) · [状态](designs/03-task-status.md) · [Feedback](designs/04-feedback.md) · [MCP](designs/05-mcp-server.md) · [Markdown](designs/06-markdown-editor.md) · [前端](designs/07-web-app.md) · [检索](designs/08-search.md) · [BQL](designs/09-bql.md) · [备份](designs/10-backup.md) · [身份](designs/11-identity.md) · [关联](designs/12-link.md) · [组织与认证](designs/13-org-auth.md)

任务清单见 [TASK.md](TASK.md)。

## 许可证

[Apache-2.0](LICENSE)
