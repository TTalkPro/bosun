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
  - 10.0.0 → 12.0.0 不用加：盘上格式没变，分数是查询时现算的。12.0.0 只有写入字符串数组 meta 才会把 `bitcask.meta` 升到旧版本打不开的 v7，本项目的 meta 都是标量。
- 这一代打不开（损坏 / 版本不兼容）同样丢掉另起一代，不拦启动。
- 分代之前的旧布局（bitcask 文件直接放在 `search_dir` 下）启动时整个清掉重来；只在根目录里确实有 `bitcask.meta` / `bitcask.write.lock` / `*.bitcask.data` 时才删，别的文件一概不碰，`search_dir` 配错不会误删。
- **定时 merge**：bitcask 是追加写，任务每改一次索引里就多一篇、旧的那篇一直占着盘。写进程每 `search_merge_interval`（缺省 6 小时；`off` 关掉）看一眼各数据文件的死字节，超过 `search_merge_min_dead_bytes`（缺省 1 MB）且占到全部数据一半以上，就把当前写文件封口（`close_write_file`，引擎只并封了口的文件），并掉碎片率 ≥ 40% 的文件和所有 10 MB 以下的小文件（旁车 `merge`，不占写锁，读写都不停）。`bosun_search:merge/0` 手动触发，`merge(force)` 不看门槛。
  - 挑文件按 `status` 的实时统计和上面这套门槛自己定，不用引擎的 `needs_merge`（它按引擎自己的缺省门槛判断）。
  - bitcask 10 时期这里有两处绕法，上游 11.1.0 / bitcask 12.0.0 修掉后已去：`needs_merge` 看不见本次打开之后的死数据（现与 `status` 同源）；`bitcask:merge` 不替 jieba 补缺省词典目录、cppjieba 找不到词典 abort 整个节点（现 `open` / `merge` 共用选项归一，词典缺失返回 `{error, {invalid_option, _}}`），所以不再自己传 `dict_path`。
- `reindex/0` 不逐 key 删再写：那样旧格式的段清不掉，一次重建还会留下等量的死数据。新的一代没建成时旧的一代原样继续服务，返回 `{error, {reindex_failed, _}}`。

分析器 `jieba`（`enable_stop_words`）；jieba 对拉丁词大小写敏感，入库与查询统一小写。

## 3. 查询语义

0. 每个词同时打默认字段与 `title` / `labels` 字段：`w title:w^3 labels:w^8`（`search_fields`，各子句分数相加），排序直接用引擎分数。标签 boost 最高，因此前端没有单独的标签过滤。
   - 这是加分不是分层：各字段按自己的 BM25 统计打分，命中标签 / 标题的稳定排在只命中正文的前面，但标签命中与标题命中之间没有固定先后——词在哪个字段里更稀有哪边分数就高（300 篇里 60 篇带 `backend` 标签、只有 1 篇标题含 `backend` 时，标题那篇约 20 分，带标签的约 7.7 分）。
   - bitcask 10 时期这里还在引擎外按命中字段再乘一次系数（标签 ×8、标题 ×3）：当时命名字段的子分数比默认字段小一截，只靠 boost 相加压不过正文里的词频。上游在 11.0.0 修了（每字段跨段聚合统计、文档长度取字段自身词数），升 12.0.0 时这个绕法已去掉（见 tasks/2026-11-20-bitcask-12-upgrade.md）。
1. 空白分隔的多个词 **AND**：各词分别检索后按 key 求交、分数相加。单个词交给 jieba 自己切。
2. 单个拉丁词无命中时按前缀 `search_wildcard(词*)` 回退。
3. 组织 / 项目 / 类型过滤按 meta **下推给引擎**：`search_fields/4`、`search_wildcard/4` 带 meta filter（`org eq`、`project eq`、`kind in`）。`org` 缺省取调用进程的当前主体（`bosun_scope:org_id/0`），系统作用域不按组织过滤；调用方事后的可见性检查保留，作为兜底，bitcask 6.7.1（libbitcask 6.6.1）起带 filter 时引擎补取到 K 条，不再静默少返回。K = `max(limit*2, 50)`（`search_fields` 多 boost 组是逐字段 top-K 求和的近似，留余量），多词求交时每词 ×8。

`bosun_task:search/2` 按任务聚合：同一任务只留最高分命中；命中来自 feedback 时带 `feedback: {id, author, kind, snippet}`。

## 4. 接入点

`GET /api/v1/search` · MCP `search_tasks` · 列表页 `q`（BM25 命中排前面，再补标题 / ID 子串）· 顶栏搜索下拉。

## 5. 依赖

`{bitcask, {git_subdir, "https://github.com/DavidAlphaFox/bitcask.git", {tag, "13.2.0"}, "apps/bitcask"}}`（最低 OTP 27；13.1.0 起 bitcask 是 umbrella，按子目录依赖；干净环境按 `git_subdir` 拉取要用 13.1.1 及之后，13.1.0 这个 tag 编不出 NIF）；pre_hooks 用 cmake 编 NIF（需 cmake + libicu-dev）。release 里加 `bitcask`。
