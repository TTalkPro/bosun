# 10 · 数据导出 / 导入

整库 JSON 备份与恢复；搜索索引不导出，导入后从 Mnesia 重建。

## 格式

`{"format":"bosun-export","version":2,"exported_at","projects","tasks","feedback","filters","counters"}`，内部形态（毫秒时间、序号计数器），往返无损。`bosun_backup:export/0` `export_file/1` `import/2` `import_file/2`。

## 模式

`merge`（缺省，同 key 覆盖，计数器取大者）| `replace`（清空后写入）。整个导入是一个 Mnesia 事务，任一记录不合法整体回滚。

⚠️ `merge` 导入一份**旧**快照会把之后修订过的 feedback 重新标回 active；想回到某个时间点用 `replace`。

## 入口

`GET /api/v1/export` · `POST /api/v1/import?mode=` · `scripts/export.sh` / `import.sh`（release 里在 `bin/`）· 前端 `/data`。
