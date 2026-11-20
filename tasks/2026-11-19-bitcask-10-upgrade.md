# bitcask 6.7.1 → 10.0.0

## 背景
检索依赖的 bitcask 停在 6.7.1，上游已到 10.0.0（libbitcask 10.0.0）。中间跨了三次与本项目有关的变化：

- **8.1.0**：默认字段的盘上标识改了，旧版本写出的 search checkpoint / 封存段不能无损沿用，要重建索引。
- **6.8.0**：新增 `search_fields_attributed`（每条命中带实际命中的字段）、`get_doc`。
- **7.0.3 / 9.0.0 / 10.0.0**：索引管线、打分统计、高亮等一批修复；Erlang 门面的既有函数签名没变。

本机开发走 `_checkouts/bitcask`，所以工作副本早就在用 10.0.0 的源码了——`rebar.config` 的 tag 和代码却还是按 6.7.1 写的，
`rebar3 eunit` 在升级前就有一条是红的（`full_text_search`：标签命中没排到正文命中前面）。

## 改动
- `rebar.config`：tag `6.7.1` → `10.0.0`。
- `bosun_search`：
  - `?SCHEMA` 2 → 3；格式过期时**删索引目录**重建（不再逐 key 删——旧格式的封存段清不干净）。
  - 目录打不开（损坏 / 版本不兼容）也删掉重建一次，不拦启动；只删确实是 bitcask 目录或空目录的路径。
  - `reindex/0` 同样走「关库 → 删目录 → 重开 → 全量灌」，数据文件不再只增不减。
  - 检索改用 `search_fields_attributed`，引擎分数再乘命中字段系数（标签 ×8、标题 ×3）。
  - 不是本模块写的 key 跳过，不再让 gen_server 崩。
- 文档：designs/08-search.md。

## 发现：命名字段的子分数偏小（已回报上游）
> 后续查清了，是两件事叠加，已写进 `libbitcask/feedbacks/2026-11-19-search-fields-local-stats-and-total-doc-len.md`：
> ① `search_fields` 逐段用本地统计打分，7.0.3 之后新写的文档散在各分片的 building 段里各算各的 idf，重开库后分数才归正；
> ② 字段打分的文档长度取的是整篇总词数、平均长度却是字段自己的，短字段被重罚。下面是当时的记录。

同一份文本既在默认字段又在 `title` 字段里时，10.0.0 下 `title:health` 的分数不到默认字段 `health` 的一半；
只有一个 token 的 `labels:backend` 更小（未加权约 0.04，同语料默认字段 0.25～1.9）。按 BM25 字段更短、df 更小，分数应该更高才对；
从数值反推，像是字段倒排打分时文档长度取了整篇（甚至字节数）而不是该字段的长度。6.7.1 下同一用例是绿的。
复现（6 篇文档的小语料，`search_fields_attributed` 分别查 `backend`、`labels:backend`、`title:health`、`health`）已在本次会话里跑过，
没有去翻 6.7.1 的构建做对照，所以「是哪一版引入的」还没定。本项目已用命中字段显式加权绕开，不依赖这个量级。

## 验收
- `rebar3 check`（xref / dialyzer / eunit 60 / ct 6）全绿。
- 拿现网 `data/`（6.7.1 时代写的索引）的拷贝启动：日志出现 `index format is stale, rebuilding`，文档数与 Mnesia 一致，检索可用。
- 新用例：`search_field_ranking`（标签 > 标题 > 正文）、`search_index_recovery`（非索引目录不删、reindex 幂等）。
