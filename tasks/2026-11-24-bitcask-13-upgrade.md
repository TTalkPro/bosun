# bitcask 12.0.1 → 13.1.1

## 背景
bitcask 13.1.0 起仓库改成 rebar3 umbrella：核心在 `apps/bitcask`，图查询语言拆到 `apps/bitcask_cypher`。
本项目只用核心的 KV 与检索接口（`open` / `put` / `get` / `delete` / `search_fields` / `search_wildcard` /
`encode_meta` / `decode_meta` / `merge` / `status` 等），这几个接口在 12.0.1 → 13.1.1 之间签名与行为都没变。

## 做了什么
- `rebar.config`：`{git, Url, {tag, "12.0.1"}}` → `{git_subdir, Url, {tag, "13.1.1"}, "apps/bitcask"}`
  （rebar3 3.14+；rebar3 拉取时用 sparse checkout，构建机的 git 需 2.25+）。`rebar.lock` 不变：bitcask 一直走
  `_checkouts`，checkout 依赖不进 lock。
- 本地 `_checkouts/bitcask` 软链改到 `~/workspace/bitcask/apps/bitcask`（原来指向仓库根，现在根目录不是应用了）。
- 直接上 13.1.1 而不是 13.1.0：13.1.0 这个 tag 被下游按 `git_subdir` 依赖时编不出 NIF——`apps/bitcask/third_party` 是指向仓库根
  `third_party/` 的符号链接，rebar3 只稀疏检出 `apps/bitcask`，符号链接悬空，初始化子模块的 hook 找不到路径。13.1.1 修了（hook 按
  `pwd -P` 算子模块的真实位置，悬空时先把 `/third_party/` 加进稀疏范围）。
- 13.1.0 → 13.1.1 只动了构建 hook、`vsn` 和 libbitcask 子模块指针（上游库源码逐字节相同），Erlang / NIF 源码没改，
  bosun 侧没有需要适配的接口。
- 盘上格式不变（12.0.2～13.1.1 各版都写明），`?SCHEMA` 不动，既有索引直接可用。
- 文档：`CLAUDE.md` 的 `_checkouts` 说明、`designs/08-search.md` 的依赖写法。
- 顺带修一个与 bitcask 无关的偶发假红：`bosun_auth_tests:org_isolation` 在系统作用域查 B 组织的任务，而那条任务是在用例里唯一一次
  `bosun_search:sync()` 之后写的（索引是异步 cast），负载高时索引还没写完。查之前补一次 `sync()`。

## 验证
- `rebar3 check`（xref、dialyzer、eunit 63 个、ct 7 个）全过，编译走 `_checkouts` 的 bitcask 工作区（13.1.1）。
- 不用 `_checkouts`、按 `rebar.config` 里的 `git_subdir` 写法从零拉取 13.1.1：在一份不带 `_build/` 的拷贝里 `rebar3 compile`，
  hook 把 `/third_party/` 加进稀疏范围、子模块初始化到 `8511c09`，NIF 与各应用都编过，`rebar3 eunit` 63 个全过。
  本机连不上 GitHub，所以 git 的 URL 用 `insteadOf` 改指本机 `~/workspace/bitcask`（tag `13.1.1` = `b4607dd`）及其子模块，
  其余流程与真实拉取一致。

## 注意
Docker 镜像走的就是 `git_subdir` 拉取，这次没有实际跑 `docker compose build`（本机连不上 GitHub）。
