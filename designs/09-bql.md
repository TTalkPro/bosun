# 09 · BQL 查询语言与保存的筛选器

> 参考 JIRA 的 JQL：跨项目筛选任务的表达式语言 + 可保存、侧栏一键打开的筛选器。
> 使用说明（面向用户 / Agent）见 [docs/BQL.md](../docs/BQL.md)；本文记录设计。

## 1. 语法

```
query  := [expr] [ORDER BY field [ASC|DESC] {, field [ASC|DESC]}]
expr   := term {OR term};  term := factor {AND factor}
factor := NOT factor | '(' expr ')' | cond
cond   := field op value | field IN '(' values ')' | field NOT IN '(' values ')' | field IS [NOT] EMPTY
op     := = | != | ~ | !~ | > | >= | < | <=
```

| 字段（别名） | 运算 | 说明 |
|---|---|---|
| `project`（`key`） | = != IN | |
| `id` | = != IN ~ | |
| `status` | = != IN | NEW / IN_PROGRESS / DONE / VERIFIED / REJECTED / CANCELLED |
| `priority` | = != IN > >= < <= | low < medium < high |
| `labels`（`label`） | = != IN ~ IS EMPTY | `=` 即「有这个标签」 |
| `created_by`（`creator` `reporter` `requester`） | = != IN ~ | 提出方 |
| `assignee` | = != IN ~ IS EMPTY | 执行方（领取 → IN_PROGRESS 的人，或建单预派） |
| `kind`（`type`） | = != IN | task / epic |
| `epic`（`parent`） | = != IN IS EMPTY | 所属 Epic 的 id |
| `blocked` | = != | true / false：有未完成的依赖 |
| `depends_on` `blocks` `replaces` `replaced_by` | = != IN IS EMPTY | 关联对端 id（见 12） |
| `title` | = != ~ | 子串 |
| `description` | ~ IS EMPTY | |
| `text` | ~ !~ | BM25（标题 / 正文 / 标签 / 反馈） |
| `feedback` | ~ !~ IS EMPTY | BM25 只搜反馈 |
| `created` `updated` | > >= < <= | `2026-09-01`、`2026-09-01T10:00`、`now`、`-7d -2w -12h -30m` |
| `question` | = != | true = 最新有效反馈是未回答的提问 |
| `feedback_count` | = != > >= < <= | |

缺省排序：有全文条件时按相关度，否则 `updated DESC`。

## 2. 实现

`bosun_bql`：手写分词 + 递归下降；值在解析期按字段归一，非法运算符 / 值直接报 `{invalid, query, Msg}`。求值：`dirty_select` 全部任务，全文条件先各跑一次 `bosun_search`，再逐任务求布尔。`bosun_filter`：Mnesia 表 `filter`（id `f<N>`，`counter` 表分配）。

## 3. 接入

`GET /api/v1/query` · `/api/v1/filters*` · MCP `query_tasks` `list_filters` `save_filter` `delete_filter` + 资源 `bosun://bql` · 前端 `/query`（示例 chip、速查、另存为 / 保存 / 重命名 / 删除，侧栏「筛选器」）。
