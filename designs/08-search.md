# 08 · 全文检索（bitcask BM25）

> 主数据仍在 Mnesia；bitcask（C++ NIF，BM25 + jieba 分词）只做**可丢弃的索引**。不用向量。

## 1. 定位

- 索引是派生数据：目录为空时启动即从 Mnesia 全量重建；`bosun_search:reindex/0` 随时可重来。
- 一个 gen_server（`bosun_search`）持有 cask 句柄，读写都经它串行。
- 写路径：每个成功写操作之后 `gen_server:cast` 一条索引请求（异步）；作废的 feedback 从索引删除。测试用 `bosun_search:sync/0` 做屏障。

## 2. 文档模型

| Key | text（默认字段） | fields | meta |
|---|---|---|---|
| `task:<ID>` | 标题 + 描述 + 标签 | `title`、`labels` | v / org / project / kind / status |
| `fb:<ID>` | 内容 | — | v / org / project / kind / task |

- `org` 是项目的 `org_id`（孤儿项目为 null，任何组织都搜不到）。项目改组织（`bosun_org:adopt_orphans/1`）后会整体 reindex。
- `v` 是索引格式版本（`?SCHEMA`，当前 2）。启动时抽一篇文档看版本，对不上就从 Mnesia 全量重建——meta 结构变了只需把 `?SCHEMA` 加一。

分析器 `jieba`（`enable_stop_words`）；jieba 对拉丁词大小写敏感，入库与查询统一小写。

## 3. 查询语义

0. 每个词同时打默认字段与 `title` / `labels` 字段：`w title:w^3 labels:w^8`（`search_fields` 语法）。标签权重最高，因此前端没有单独的标签过滤。
1. 空白分隔的多个词 **AND**：各词分别检索后按 key 求交、分数相加。单个词交给 jieba 自己切。
2. 单个拉丁词无命中时按前缀 `search_wildcard(词*)` 回退。
3. 组织 / 项目 / 类型过滤按 meta **下推给引擎**：`search_fields/4`、`search_wildcard/4` 带 meta filter（`org eq`、`project eq`、`kind in`）。`org` 缺省取调用进程的当前主体（`bosun_scope:org_id/0`），系统作用域不按组织过滤；调用方事后的可见性检查保留，作为兜底，bitcask 6.7.1（libbitcask 6.6.1）起带 filter 时引擎补取到 K 条，不再静默少返回。K = `max(limit*2, 50)`（`search_fields` 多 boost 组是逐字段 top-K 求和的近似，留余量），多词求交时每词 ×8。

`bosun_task:search/2` 按任务聚合：同一任务只留最高分命中；命中来自 feedback 时带 `feedback: {id, author, kind, snippet}`。

## 4. 接入点

`GET /api/v1/search` · MCP `search_tasks` · 列表页 `q`（BM25 命中排前面，再补标题 / ID 子串）· 顶栏搜索下拉。

## 5. 依赖

`{bitcask, {git, "https://github.com/DavidAlphaFox/bitcask.git", {tag, "6.7.1"}}}`（最低 OTP 27）；pre_hooks 用 cmake 编 NIF（需 cmake + libicu-dev）。release 里加 `bitcask`。
