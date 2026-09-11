# BQL 查询语言

BQL 是 Bosun 的 JQL 风格查询语言：一条表达式跨项目筛选任务，支持布尔逻辑、全文检索和排序分页。
设计动机与实现见 [designs/09-bql.md](../designs/09-bql.md)；本文是使用说明。

```
project = BOS AND status IN (NEW, IN_PROGRESS) AND labels = backend
  AND text ~ "mcp 创建" AND updated >= -7d
ORDER BY priority DESC, updated DESC
```

## 在哪用

| 入口 | 说明 |
|---|---|
| Web `/query` 页 | 输入框 + 示例 chip + 字段速查；可保存为筛选器，侧栏一键打开 |
| REST | `GET /api/v1/query?q=<BQL>&limit=&offset=` |
| MCP | `query_tasks(bql, limit?, offset?)`；速查资源 `bosun://bql` |

## 语法

```
query  := [expr] [ORDER BY field [ASC|DESC] {, field [ASC|DESC]}]
expr   := term {OR term}
term   := factor {AND factor}
factor := NOT factor | '(' expr ')' | cond
cond   := field op value
        | field IN '(' value {, value} ')'
        | field NOT IN '(' value {, value} ')'
        | field IS [NOT] (EMPTY | NULL)
op     := = | != | ~ | !~ | > | >= | < | <=
```

- 关键字（`AND` `OR` `NOT` `IN` `IS` `EMPTY` `NULL` `ORDER BY` `ASC` `DESC`）与字段名**不分大小写**。
- 值可以裸写（`BOS`、`backend`、`-7d`），含空格或特殊字符时加双引号：`text ~ "mcp 创建"`；引号内 `\"` 转义。
- `AND` 优先级高于 `OR`，`NOT` 最高；括号改变结合。
- 空查询 = 所有任务；也可以只写 `ORDER BY ...`。
- `IS NULL` 与 `IS EMPTY` 等价（`IS NOT EMPTY` 同理）。

## 字段

| 字段（别名） | 可用运算 | 说明 |
|---|---|---|
| `project`（`key`） | `= != IN NOT IN` | 项目 Key，大小写不敏感（写 `keel` 匹配 `KEEL`） |
| `id` | `= != IN NOT IN ~ !~` | 任务 id；`id ~ BOS-1` 是子串匹配 |
| `status` | `= != IN NOT IN` | `NEW` `IN_PROGRESS` `DONE` `VERIFIED` `REJECTED` `CANCELLED` |
| `priority` | `= != IN NOT IN > >= < <=` | `low < medium < high` |
| `labels`（`label`） | `= != IN NOT IN ~ !~ IS EMPTY` | 多值字段：`=` 即「有这个标签」，`~` 对任一标签做子串匹配 |
| `created_by`（`creator` `reporter` `requester`） | `= != IN NOT IN ~ !~` | 提出方（建单的 actor，如 `coxswain/main`） |
| `assignee` | `= != IN NOT IN ~ !~ IS EMPTY` | 执行方；`IS EMPTY` = 还没人领 |
| `kind`（`type`） | `= != IN NOT IN` | `task` / `epic` |
| `epic`（`parent`） | `= != IN NOT IN IS EMPTY` | 所属 Epic 的 id；`IS EMPTY` = 未挂到任何 Epic |
| `blocked` | `= !=` | `true` = 有未完成的 `depends_on` 依赖；也接受 `yes` / `no` |
| `depends_on` `blocks` | `= != IN NOT IN IS EMPTY` | 依赖出 / 入链的对端 id（`depends_on = BOS-12`；`blocks = BOS-12` 找谁依赖它） |
| `replaces` `replaced_by` | `= != IN NOT IN IS EMPTY` | 替代出 / 入链的对端 id |
| `title` | `= != ~ !~` | 子串匹配，不分大小写 |
| `description` | `~ !~ IS EMPTY` | 子串匹配 |
| `text` | `~ !~` | BM25 全文：标题 / 正文 / 标签 / 反馈 |
| `feedback` | `~ !~ IS EMPTY` | BM25 只搜反馈正文；`IS EMPTY` = 没有反馈 |
| `created` `updated` | `> >= < <=` | 日期，见下 |
| `question`（`open_question`） | `= !=` | `true` = 最新一条有效反馈是未回答的 `question` |
| `feedback_count` | `= != > >= < <=` | 反馈条数（含被修订作废的旧版本） |

字段写错或运算符组合不支持，解析期直接报错（见「错误」）。

## 运算符与 `~` 的语义

| 运算符 | 含义 |
|---|---|
| `=` `!=` | 相等 / 不等 |
| `~` `!~` | 匹配 / 不匹配：`text` `feedback` 上是 BM25 全文，`title` `description` `id` `labels` `created_by` `assignee` 上是**子串**匹配（不分大小写） |
| `> >= < <=` | 只用于 `priority` `created` `updated` `feedback_count` |
| `IN (a, b)` / `NOT IN (a, b)` | 列表成员；值逗号分隔，可混用裸词与引号串 |
| `IS EMPTY` / `IS NOT EMPTY` | 只用于 `labels` `assignee` `epic` `description` `feedback` 及四个关联字段 |

多个 `text ~` 条件各自独立跑一次检索再求交（AND）——`text ~ "mcp" AND text ~ "创建"` 要求两个词都命中，与 `text ~ "mcp 创建"` 分词后的效果类似但更严格。

## 日期

`created` / `updated` 的值支持：

| 写法 | 含义 |
|---|---|
| `2026-09-01` | 当天 00:00:00 |
| `2026-09-01T10:00`、`2026-09-01T10:00:30` | 具体时刻（`t` 小写也行） |
| `now` | 当前时刻 |
| `-7d` `-2w` `-12h` `-30m` | 相对现在往前（分 / 时 / 天 / 周） |

日期按 UTC 解释。`updated >= -7d` 即「最近七天有动静」。

## 排序与分页

- 没写 `ORDER BY` 时：查询里**有全文条件**（`text` / `feedback`）→ 按相关度分数降序；否则 `updated DESC`。
- `ORDER BY` 后跟一个或多个字段，缺省 `ASC`；`status` / `priority` 按自然顺序排，`id` / `project` 按（项目, 序号）排，其余字符串不分大小写。并列时回落到 `updated DESC`。
- 分页：`limit`（缺省 100，上限 500）与 `offset`。返回 `{tasks: [任务摘要], total: 匹配总数, order: 实际排序}`，`total` 不受分页影响。

## 示例

```sql
status = NEW
project = BOS AND status IN (NEW, IN_PROGRESS)
project IN (BOS, KEEL) AND priority >= high AND status != CANCELLED
labels = backend AND updated >= -7d
created >= 2026-09-01 AND created < 2026-09-15
title ~ "mcp" AND status = NEW
text ~ "BQL" AND text ~ "筛选"
feedback ~ "超时"
created_by = "coxswain/main" AND question = true
assignee IS EMPTY AND status = NEW          -- 没人领的新单
kind = epic AND status != DONE              -- 未验收完的 Epic
epic = BOS-13 AND status != DONE            -- BOS-13 里没验收的步骤
blocked = true                              -- 被依赖卡住的
depends_on = BOS-12                         -- 依赖 BOS-12 的（它没做完这些就不能动）
replaces = BOS-3                            -- 接手 BOS-3 的
NOT (labels = backend OR labels = frontend) AND status = IN_PROGRESS
ORDER BY priority DESC, updated DESC
```

## 保存的筛选器

查询可以存起来复用（存之前先做语法校验）：

- MCP：`save_filter(name, bql, filter_id?)`（带 `filter_id` 即更新）、`list_filters`、`delete_filter`；跑的时候把 `query` 传给 `query_tasks`。
- REST：`GET / POST /api/v1/filters`、`GET / PATCH / DELETE /api/v1/filters/:id`、`GET /api/v1/filters/:id/run`。
- Web：`/query` 页保存 / 重命名 / 删除，左侧栏「筛选器」一键打开。

## 错误

语法错误、未知字段、不支持的运算符组合、非法值都在解析期拒绝，错误消息面向人可读（如 `unknown field 'stauts'`、`invalid status 'DON'`、`unterminated string`）。REST 返回 400；MCP 返回 `isError: true` 加同一段文本，照着改查询即可。
