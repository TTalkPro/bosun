# 12 · 任务关联

两种有方向的关联，都可以跨项目。不做「相关」这种没有语义的链——需要就在 feedback 里引用 id。

| 类型 | A → B | 效果 |
|---|---|---|
| `replaces` 替代 | A 接手 B 的内容 | 建链时 B 若在 NEW / IN_PROGRESS，自动置 CANCELLED（历史 `replaced by A`）；B 已 DONE / VERIFIED / 其它则只记链 |
| `depends_on` 依赖 | B 没做完 A 不能开始 | B 不在 DONE / VERIFIED → A `blocked = true`；A 从 NEW → IN_PROGRESS 被拒 `{blocked, [B, ...]}`（REST 409 `blocked`，detail.blockers）。其它迁移不拦：已经在做的不因新加依赖而停，打回 / 重开也不拦 |

与 REJECTED / CANCELLED 的关系：替代是撤销的一种来源，撤销原因直接写进历史，不需要再写 feedback。

## 模型

```erlang
-record(link, {
    key        :: {From, To, Type},   %% 同一对同类型只一条；重复 add 幂等
    from, to   :: binary(),
    type       :: replaces | depends_on,
    actor      :: binary(),
    created_at :: integer()
}).
```

Mnesia 表 `link`，`from` / `to` 建索引。校验：两端存在、不能自链、类型合法；`depends_on` 不能成环——沿 depends_on 从 B 能走到 A 就拒绝 `{cycle, [A, B, ..., A]}`（REST 409 `cycle`，detail.path）。同一对可同时有两种类型。删链允许（不是审计记录），删链不改任何状态。任务不能删，所以链不需要级联。

`blocked` / `links` 都是脏读派生的：`bosun_link:add/remove` 在事务提交后再取详情，否则事务里看不到自己的写。建链后两端都重建搜索索引（对端可能被撤销）。

## JSON

- 摘要：`blocked :: boolean()`。
- 详情：`links :: [#{type, direction (out | in), task, title, status, kind, actor, created_at}]`，出链在前，再按类型、id 排。out = 本任务 → 对方（我依赖 / 我替代），in = 对方 → 本任务（被依赖 / 被替代）。

## 接口

- `bosun_link:add(From, To, Type, #{actor, actor_kind})` / `remove(From, To, Type)` → From 的详情；`blockers/1`、`blocked/1`、`of_task/1`、`links_json/1`。
- REST `POST /api/v1/tasks/:id/links {to, type, actor}` → 201；`DELETE /api/v1/tasks/:id/links/:type/:to` → 200；404 链不存在；400 `invalid type/to/from`。
- MCP `link_tasks(from, to, type)`、`unlink_tasks(from, to, type)`；`get_task` 带 `links` / `blocked`；transition 被拦时错误文本列出阻塞任务并提示 unlink。
- BQL：`blocked = true|false`；`depends_on = X`（出链）、`blocks = X`（入链：X 依赖本任务）、`replaces = X`、`replaced_by = X`，支持 = != IN NOT IN / IS EMPTY。
- 备份：`links` 数组，导入 replace / merge 都写（key 相同覆盖）。

## 前端

- 详情页右栏「关联」卡片：依赖 / 被依赖 / 替代 / 被替代 分组；未满足的依赖前有 🔒；hover 出删除（ConfirmDialog）；「添加」→ SidePanel：类型切换 + 跨项目搜索（也可直接输 ID）。替代成功后提示「X 已自动撤销」。
- 列表行与详情头：`blocked` 显示灰色「被阻塞」chip，tooltip 列阻塞者。「开始」按钮被阻塞时禁用并 tooltip。
