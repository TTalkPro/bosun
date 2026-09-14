# 13 · 组织、用户、认证与 API Key

> 2026-09-14 新增（BOS-13 Epic）。Bosun 从「单人、无认证」变成「多组织、有登录」：
> 组织管理员用真实邮箱注册，组织内用户由管理员分配；每个用户给自己的 Agent 发 MCP API Key。
> 11-identity 里的「身份」保留（Agent 仍靠 `identify` 署名），本篇在它下面加一层「谁在用 Bosun」。

## 1. 目标与决定

| 决定 | 内容 |
|---|---|
| 组织注册 | 任何人可注册组织；注册人成为组织管理员；邮箱必须**格式合法 + 收到验证码**（SMTP 可配，未配置时验证码打到服务端日志——开发模式） |
| 组织内用户 | 管理员填 email + 显示名 + 初始密码 建用户；用户登录后可改密；管理员可停用 / 恢复 / 改角色 / 重置密码 |
| 数据隔离 | **项目归属组织**（`project.org_id`）。列表 / 查询 / 搜索 / 筛选器 / 导出 只看本组织。升级前的历史项目 `org_id = undefined`，任何组织都看不到，用 `bosun_org:adopt_orphans(OrgId)` 手动收编 |
| Web 鉴权 | 登录会话 Cookie（`bosun_session`，HttpOnly，SameSite=Lax，30 天） |
| MCP 鉴权 | **只认** `Authorization: Bearer <api key>`，无 key 一律 401；REST 也接受 Bearer key（脚本用） |
| 项目 key | 仍全局唯一（任务 id `KEY-N` 是全局主键，不改）；跨组织撞 key 时后来者换一个 |
| 角色 | `admin` / `member`。admin 多出：组织信息、用户管理、导出 / 导入。其余一致 |

## 2. 数据模型（Mnesia，均 `disc_copies`）

```
org        id (o<N>)   name · created_by · created_at · updated_at
user       id (u<N>)   org_id* · email* (小写，全局唯一) · name (显示名，组织内唯一) · password (哈希元组)
                       · role (admin|member) · status (active|disabled) · created_at · updated_at · last_login_at
session    id (sha256(token))   user_id* · created_at · expires_at · last_seen_at
api_key    id (k<N>)   user_id* · hash* (sha256(key)) · name · prefix (bsk_xxxxxx，展示用) · created_at · last_used_at · revoked_at
email_code email       code (6 位) · purpose (register) · expires_at (15 分钟) · attempts · sent_at
project    + org_id*   （undefined = 升级前的孤儿项目）
filter     + org_id*
actor      + org_id · user_id   （人 = 用户本人；Agent = 用的哪把 key 的主人）
```

`*` 为二级索引。id 用 `bosun_store:next_id/1` 计数器（与 filter 一样）。

- 密码：`crypto:pbkdf2_hmac(sha256, Pw, Salt, 120000, 32)`，存 `{pbkdf2_sha256, Iter, Salt, Hash}`；比较用 `crypto:hash_equals/2`。最短 8 位。
- 会话 token：32 字节随机，base64url；表里只存 sha256。30 天不活动过期；登录时顺手清掉该用户过期会话。
- API Key：`bsk_` + 40 位十六进制（20 字节随机）。**只在创建时返回一次**；表里存 sha256 与前缀。撤销 = 写 `revoked_at`，不删（历史可查）。`last_used_at` 每分钟最多写一次。
- 验证码：`crypto:strong_rand_bytes` 派生 6 位数字；同一邮箱 60 秒内不重发；错 5 次作废；注册成功即删。
- 邮箱格式：`^[^@\s]+@[^@\s]+\.[^@\s]+$` 且 ≤ 254 字符，统一小写。

## 3. 模块（bosun_core）

| 模块 | 职责 |
|---|---|
| `bosun_scope` | **当前主体**（进程字典）：`set/1` `get/0` `org_id/0` `user/0` `clear/0`。REST 中间件每个请求设一次；MCP 在每次工具调用前从会话身份设。`undefined` = 系统作用域（shell / 测试 / 迁移脚本），不过滤 |
| `bosun_org` | `request_code(Email)` · `register(#{org_name, email, code, name, password})` · `get/1` · `update/2` · `adopt_orphans/1` |
| `bosun_user` | `create/2`（管理员建） · `get/1` · `list/1` · `update/3` · `authenticate(Email, Pw)` · `change_password/3` · `to_map/1` |
| `bosun_password` | `hash/1` · `verify/2` · `validate/1` |
| `bosun_session` | `create/1` → token · `lookup/1` → principal · `delete/1` |
| `bosun_api_key` | `create(UserId, Name)` → 含明文 key · `list/1` · `revoke/2` · `authenticate/1` → principal |
| `bosun_email_code` | 验证码的生成 / 校验 / 限流；`peek/1` 只给测试 |
| `bosun_mailer` | `send(To, Subject, Text)`：配置了 SMTP 走 `gen_smtp_client:send_blocking`，否则 `logger:notice` 打印（`mode/0` → `smtp | log`） |

主体（principal）map：`#{user_id, org_id, name, email, role, via => session | api_key, key_id}`。

### 3.1 作用域怎么落到领域层

不改现有函数签名，领域函数在读写时问 `bosun_scope`：

- `bosun_project:create` 把 `org_id` 写成当前组织；`list` 只出当前组织；`get / update` 组织不符 → `not_found`（不泄露存在性）。
- 任务、状态迁移、关联、反馈：先取项目，项目不可见即 `not_found`。`bosun_scope:project_visible(Key)` 一处判断。
- `bosun_bql:query` / `bosun_task:search` / `find_by_ids`：结果过滤到可见项目。
- `bosun_filter`：带 `org_id`，list / get 按组织。
- `bosun_actor:list`：按组织。`touch` 顺手记 `org_id` / `user_id`——但名字是全局主键，归属只在**首次出现**时写入，之后别的组织用同名不会改它（同名跨组织只在先出现的组织里列出）。
- 任务的读取统一走 `bosun_task:read_in_tx/2` / `read_dirty/1` / `visible/1`，状态迁移 / 关联 / 反馈都用它们。
- `bosun_backup:export` 只导本组织（项目 / 任务 / 反馈 / 关联 / 筛选器 / 操作者）；`import` 把导入的项目 / 筛选器打上当前组织，`replace` 只清本组织的数据；用户 / 会话 / key 不进导出。
- 作用域为 `undefined` 时以上全部退化为原行为——现有 eunit 不用改。

写操作的署名：REST 一律用主体的显示名（body 里的 `actor` / `author` 不再采信）；MCP 仍是 `actor` 参数 > `identify` 名 > 自动名，同时把 key 主人记到 actor 表。

## 4. HTTP（bosun_web）

### 4.1 中间件 `bosun_web_auth`

放在 `cowboy_router` 之后、`cowboy_handler` 之前。按路由的 handler opts 里的 `auth` 决定：

| `auth` | 路由 | 规则 |
|---|---|---|
| `public` | `/api/v1/auth/*`（除 me / logout / password）、`/api/v1/workflow.md`、静态文件 | 不查 |
| `api_key` | `/mcp` | 只认 Bearer；通过后若带 `mcp-session-id` 就 `bosun_identity:bind(ServerPid, Principal)` |
| 缺省 | 其余 `/api/v1/*` | Cookie 会话或 Bearer；通过后 `bosun_scope:set(P)`，并放进 `Req` 的 `bosun_principal` |
| `admin` | `/api/v1/users*`、`/api/v1/org`、`/api/v1/export`、`/api/v1/import` | 同上且 role = admin，否则 403 |

未通过：401 `{"error":"unauthorized"}`，`/mcp` 另带 `WWW-Authenticate: Bearer`。

### 4.2 端点

```
POST   /api/v1/auth/register/code   {email}                                    → 202 {delivery: smtp|log, expires_in}
POST   /api/v1/auth/register        {org_name, email, code, name, password}    → 201 {org, user} + Set-Cookie（注册即登录）
POST   /api/v1/auth/login           {email, password}                          → 200 {org, user} + Set-Cookie
POST   /api/v1/auth/logout                                                     → 204 + 清 Cookie
GET    /api/v1/auth/me                                                         → 200 {org, user, via}
POST   /api/v1/auth/password        {current, new}                             → 204
GET    /api/v1/org  · PATCH {name}                                             （admin）
GET    /api/v1/users · POST {email, name, password, role}                      （admin）
PATCH  /api/v1/users/:id  {name, role, status, password}                       （admin；不能停用 / 降级最后一个 admin）
GET    /api/v1/keys · POST {name} → 201 {key: "bsk_...", ...}（仅此一次）
DELETE /api/v1/keys/:id                                                        → 204（撤销）
```

错误新增：`unauthorized`(401) · `forbidden_role`(403) · `{invalid, email | password | code | ...}`(400) · `{conflict, email | name}`(409) · `code_expired` / `code_mismatch`(400) · `too_many_requests`(429) · `last_admin`(409) · `user_disabled`(403)。

### 4.3 MCP

- 无 key：401。key 撤销 / 用户停用：下一个请求起 401（每个请求都验）。
- `bosun_identity` 身份里多 `user`（主体）；`identify` 不覆盖它。`whoami` 返回 `user: {id, name, email, org}`。
- `bosun_mcp:tools/0` 给每个 handler 套一层：调用前 `bosun_scope:set(主体)`。
- `.mcp.json`：`"headers": {"Authorization": "Bearer ${BOSUN_API_KEY}"}`；README 写明先在「账户」页建 key、`export BOSUN_API_KEY=...`。

## 5. 前端（web/）

| 路由 | 页面 |
|---|---|
| `/login` | 邮箱 + 密码；链接到注册 |
| `/register` | 两步：① 邮箱 → 发码（提示 `delivery = log` 时去看服务端日志）② 验证码 + 组织名 + 显示名 + 密码 |
| `/account` | 显示名 / 改密；**API Key**：列表（前缀、名字、创建 / 最近使用、状态）、新建（SidePanel，成功后整串只显示一次并可复制）、撤销（ConfirmDialog） |
| `/org` | admin：组织名；用户表（邮箱、名字、角色、状态、最近登录）；新建 / 编辑用户 SidePanel |

- `api/auth.ts`：`useMe()`（SWR `/auth/me`）；axios 401 拦截 → 跳 `/login?next=...`（登录 / 注册页除外）。
- `AuthGate` 包住 `MainLayout`：未登录跳登录；`useMe` 加载中显示进度条。
- 顶栏「我是谁」面板删掉，换成账户菜单：显示名 + 组织名、「账户」「组织」(admin)、「退出登录」。`api/identity.ts` 里的 localStorage 身份与 `actorFields()` 整体移除（署名由服务端决定）。
- 侧栏「数据」入口只对 admin 显示。

## 6. 配置

`config/sys.config`：

```erlang
{bosun_core, [
    {data_dir, "data"},
    {smtp, []}   %% [] = 日志模式；或 [{relay,"smtp.x.com"},{port,587},{username,"u"},{password,"p"},{from,"bosun@x.com"},{tls,if_available}]
]}
```

环境变量优先：`BOSUN_SMTP_RELAY` `BOSUN_SMTP_PORT` `BOSUN_SMTP_USERNAME` `BOSUN_SMTP_PASSWORD` `BOSUN_SMTP_FROM`（有 relay 即 SMTP 模式）。`BOSUN_COOKIE_SECURE=true` 给 https 部署加 `Secure`。

新依赖：`gen_smtp` 1.3.0（hex）。

## 7. 测试

- eunit `bosun_auth_tests`：注册流程（验证码限流 / 错码 / 过期）、登录、改密、用户管理（最后一个 admin 保护）、API key（创建只回一次、撤销后 authenticate 失败）、作用域隔离（两个组织互相看不到项目 / 任务 / 搜索 / BQL / 筛选器 / 导出）。
- eunit `bosun_mcp_tests`：带作用域调用工具；`whoami` 带 user。
- ct `bosun_web_SUITE`：`init_per_testcase` 注册组织 + 登录拿 cookie；所有请求带 cookie；新增 `auth_flow`（401 / 403 / 注册 / 登录 / 登出 / key）与 `org_isolation`；MCP 端到端改用 Bearer key，并断言无 key 401。
- vitest：登录页表单校验、AuthGate 跳转。

## 8. 不做的

- 邮件邀请链接、忘记密码（需要 SMTP 必配；先靠管理员重置）。
- OAuth / SSO。
- 项目级权限（组织内人人可见所有项目）。
- 跨组织协作（一个用户只属一个组织）。
