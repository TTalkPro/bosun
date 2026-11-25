# 10 · 数据导出 / 导入

整库 JSON 备份与恢复；搜索索引不导出，导入后从 Mnesia 重建。

## 格式

`{"format":"bosun-export","version":3,"exported_at","projects","tasks","feedback","filters","actors","links","milestones","counters"}`（3 起有 `milestones`、任务的 `milestone` / `milestone_log`、项目的 `milestone_seq`；1、2 照样能导入，见 14 §4.6），内部形态（毫秒时间、序号计数器），往返无损。`bosun_backup:export/0` `export_file/1` `import/2` `import_file/2`。

## 模式

`merge`（缺省，同 key 覆盖，计数器取大者）| `replace`（清空后写入）。整个导入是一个 Mnesia 事务，任一记录不合法整体回滚。

## 校验

文件内容不可信（组织管理员上传的任意 JSON），写库前过三道，任一不过整批拒绝（`{invalid, data, 说明}`）：

1. **形状**：字段类型不对直接拒绝（标题不是字符串、labels 不是字符串列表、时间不是整数……）。以前原样落库，之后列表 / 详情一读就 500。
2. **归属**：任务 id 必须等于 `<project_key>-<seq>`，反馈 id 必须等于 `<task_id>#<seq>`；任务 / 反馈 / 关联指向的项目必须是本次导入的项目、或当前作用域里已有的项目，反馈挂的任务必须在文件里或库里。否则组织 A 的管理员能用一个写着组织 B 项目 key 的文件覆盖 B 的任务。操作者名字是全局主键：别的组织已登记的同名操作者不动。
3. **序号只进不退**：项目的 `task_seq`、任务的 `feedback_seq` 取「文件里的、库里已有的、实际最大序号」三者最大值。`merge` 一份旧导出不会让序号回退（回退后新建的任务 / 反馈会和已有的撞号并覆盖）；建单时若仍撞号返回 `{conflict, id}`，绝不覆盖。

项目 / 筛选器 / 操作者的 `org_id` 会写进文件，但只有**系统作用域**（shell、`export_file` / `import_file`）导入时采信，这样整库备份还原后项目不会变成孤儿；组织作用域（REST）下一律打成当前组织。组织 / 用户 / 会话 / API key 本身仍不进导出——要完整灾备请同时备份 `data/mnesia/`。

⚠️ `merge` 导入一份**旧**快照会把之后修订过的 feedback 重新标回 active；想回到某个时间点用 `replace`。

## 入口

`GET /api/v1/export` · `POST /api/v1/import?mode=` · `scripts/export.sh` / `import.sh`（release 里在 `bin/`）· 前端 `/data`。
