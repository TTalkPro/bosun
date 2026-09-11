# 01 · 项目管理

> 功能：多项目管理，可通过 Web 与 MCP 查询、创建项目。

## 1. 实体

```erlang
-record(project, {
    key         :: binary(),          %% 主键，如 <<"BOS">>；任务 ID 前缀
    name        :: binary(),
    description :: binary(),          %% Markdown，可空 <<>>
    task_seq    :: non_neg_integer(), %% 已分配的最大任务序号（见 02）
    archived    :: boolean(),
    created_at  :: integer(),         %% ms
    updated_at  :: integer()
}).
```

对外 JSON（`bosun_json:project_to_map/1`）：`key name description task_count archived created_at updated_at`。`task_count` 是**已分配序号数**（任务不支持删除，两者相等）。

### Key 规则

- 正则 `^[A-Z][A-Z0-9]{1,9}$`；输入小写**服务端统一大写**后校验。
- 创建后**不可修改**（它是所有任务 ID 的一部分）；唯一：事务内 `read` 后 `write`，已存在返回 `{error, {conflict, key}}`。

### 归档

`archived = true`：默认列表不显示、不能新建任务，已有任务照常可读可改状态。**不做删除**——任务 ID 的唯一性依赖项目 Key 永不复用。

> 2026-09-11 再次确认（BOS-3 被拒绝，见 BOS-3#1）：删除会让项目下全部任务与 Feedback 一起丢失，而归档已经覆盖「不再使用」这个需求，所以删除功能**不做**。真要清理数据走导出 / 导入的 `replace` 模式。

## 2. 领域 API（`bosun_project`）

`create/1`、`get/1`、`list/1`（`#{include_archived}`）、`update/2`（name / description / archived）、`next_task_seq/1`、`next_task_seq_in_tx/1`（bosun_task 在同一事务里分配序号）。

## 3. REST

| 方法 | 路径 | 成功 | 错误 |
|---|---|---|---|
| GET | `/api/v1/projects?archived=1` | 200 `{"projects":[...]}` | — |
| POST | `/api/v1/projects` | 201 project | 400 invalid · 409 conflict |
| GET | `/api/v1/projects/:key` | 200 project | 404 |
| PATCH | `/api/v1/projects/:key` | 200 project | 400 · 404 |

## 4. MCP 工具

`list_projects(include_archived?)` · `get_project(key)` · `create_project(key, name, description?)` · `update_project(key, name?, description?, archived?)`。资源 `bosun://projects`。

## 5. 前端

`/projects` 卡片列表 + 右侧面板新建；`/projects/:key` 任务列表页头显示项目名与描述（Markdown），设置按钮进入编辑 / 归档。
