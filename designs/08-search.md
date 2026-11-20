# 08 · 全文检索（bitcask BM25）

> 主数据仍在 Mnesia；bitcask（C++ NIF，BM25 + jieba 分词）只做**可丢弃的索引**。不用向量。

## 1. 定位

- 索引是派生数据：目录为空时启动即从 Mnesia 全量重建；`bosun_search:reindex/0` 随时可重来。
- 写（入索引 / 摘除 / 重建）经一个 gen_server（`bosun_search`）串行；**读不经过它**：当前句柄发布在 `persistent_term`，`search/2` 在调用进程里直接查（bitcask 句柄可并发读）。检索之间不排队，重建期间也不等。
- 目录按代：`<search_dir>/gen-<N>/`。重建 = 在 `gen-<N+1>` 里建好 → 发布新句柄 → 关旧句柄、删旧目录；重建期间读落在旧代上，排队的写等重建完落到新代。读到刚被关掉的旧句柄（`badarg`）时重取一次即是新的。
- 写路径：每个成功写操作之后 `gen_server:cast` 一条索引请求（异步）；作废的 feedback 从索引删除。测试用 `bosun_search:sync/0` 做屏障。

## 2. 文档模型

| Key | text（默认字段） | fields | meta |
|---|---|---|---|
| `task:<ID>` | 标题 + 描述 + 标签 | `title`、`labels` | v / org / project / kind / status |
| `fb:<ID>` | 内容 | — | v / org / project / kind / task |

- `org` 是项目的 `org_id`（孤儿项目为 null，任何组织都搜不到）。项目改组织（`bosun_org:adopt_orphans/1`）后会整体 reindex。
- `v` 是索引格式版本（`?SCHEMA`，当前 3）。启动时抽一篇文档看版本，对不上就**丢掉这一代**、另起一代从 Mnesia 全量重建——meta 结构变了、或引擎升级后旧索引不能沿用，只需把 `?SCHEMA` 加一。
  - 2 → 3：bitcask 6.7.1 → 10.0.0。8.1.0 把默认字段的盘上标识改了，旧版本写的封存段不能无损沿用；逐 key 删再写清不干净，所以是整目录重建。
- 这一代打不开（损坏 / 版本不兼容）同样丢掉另起一代，不拦启动。
- 分代之前的旧布局（bitcask 文件直接放在 `search_dir` 下）启动时整个清掉重来；只在根目录里确实有 `bitcask.meta` / `bitcask.write.lock` / `*.bitcask.data` 时才删，别的文件一概不碰，`search_dir` 配错不会误删。
- **定时 merge**：bitcask 是追加写，任务每改一次索引里就多一篇、旧的那篇一直占着盘。写进程每 `search_merge_interval`（缺省 6 小时；`off` 关掉）看一眼各数据文件的死字节，超过 `search_merge_min_dead_bytes`（缺省 1 MB）且占到全部数据一半以上，就把当前写文件封口（`close_write_file`，引擎只并封了口的文件），并掉碎片率 ≥ 40% 的文件和所有 10 MB 以下的小文件（旁车 `merge`，不占写锁，读写都不停）。`bosun_search:merge/0` 手动触发，`merge(force)` 不看门槛。
  - ⚠️ 挑文件按 `status` 自己定，不问 `needs_merge`：它用的是开库 / 上次合并时的统计，本次打开之后才变成死数据的文件它看不见（10.0.0 实测 96% 是死的仍返回 false，重开库才认），照它说的做，不重启的服务就永远不合并。
  - ⚠️ `bitcask:merge` 不像 `bitcask:open` 那样替 jieba 补缺省词典目录（10.0.0），不显式给 `dict_path`（且必须是 binary）的话 cppjieba 直接 abort 整个节点。这里自己给，并先确认词典在。
- `reindex/0` 不逐 key 删再写：那样旧格式的段清不掉，一次重建还会留下等量的死数据。新的一代没建成时旧的一代原样继续服务，返回 `{error, {reindex_failed, _}}`。

分析器 `jieba`（`enable_stop_words`）；jieba 对拉丁词大小写敏感，入库与查询统一小写。

## 3. 查询语义

0. 每个词同时打默认字段与 `title` / `labels` 字段：`w title:w^3 labels:w^8`（`search_fields_attributed`，返回每条命中实际命中的字段）。引擎分数再乘**命中字段系数**：命中标签 ×8、命中标题 ×3（取大者），只命中正文 / feedback ×1。标签权重最高，因此前端没有单独的标签过滤。
   - 为什么要在引擎外再乘一次：bitcask 10 下命名字段的子分数量级比默认字段小一截（同一段文本，`title:w` 的分数不到默认字段的一半；单 token 的 `labels:w` 更小），只靠 `^3` / `^8` 相加压不过正文里的词频——升级后「标签命中排最前」的用例就是这么挂的。显式按命中字段加权不依赖两类分数的相对量级。这个现象值得回报给 bitcask 上游（见 tasks/2026-11-19-bitcask-10-upgrade.md）。
1. 空白分隔的多个词 **AND**：各词分别检索后按 key 求交、分数相加。单个词交给 jieba 自己切。
2. 单个拉丁词无命中时按前缀 `search_wildcard(词*)` 回退。
3. 组织 / 项目 / 类型过滤按 meta **下推给引擎**：`search_fields_attributed/4`、`search_wildcard/4` 带 meta filter（`org eq`、`project eq`、`kind in`）。`org` 缺省取调用进程的当前主体（`bosun_scope:org_id/0`），系统作用域不按组织过滤；调用方事后的可见性检查保留，作为兜底，bitcask 6.7.1（libbitcask 6.6.1）起带 filter 时引擎补取到 K 条，不再静默少返回。K = `max(limit*2, 50)`（`search_fields` 多 boost 组是逐字段 top-K 求和的近似，留余量），多词求交时每词 ×8。

`bosun_task:search/2` 按任务聚合：同一任务只留最高分命中；命中来自 feedback 时带 `feedback: {id, author, kind, snippet}`。

## 4. 接入点

`GET /api/v1/search` · MCP `search_tasks` · 列表页 `q`（BM25 命中排前面，再补标题 / ID 子串）· 顶栏搜索下拉。

## 5. 依赖

`{bitcask, {git, "https://github.com/DavidAlphaFox/bitcask.git", {tag, "10.0.0"}}}`（最低 OTP 27）；pre_hooks 用 cmake 编 NIF（需 cmake + libicu-dev）。release 里加 `bitcask`。
