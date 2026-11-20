# MCP API Key 权限分级

## 背景
当前 API Key 只继承用户权限，`bosun_mcp:scoped/1` 仅设置组织作用域，不限制工具能力。

## 目标
- Key 支持 `scopes`：`read` / `write` / `manage`。
- Key 支持 `project_keys` 项目白名单。
- MCP 调用前强制检查工具权限；REST Bearer 复用同一 principal。
- 兼容旧 Key：历史记录缺失 `scopes` / `project_keys` 时继续拥有组织内权限。

## 验收
- readonly key 不能创建任务、迁移状态或修改项目。
- write key 能操作任务但不能管理项目 / filter。
- 限制项目白名单后，未授权项目按不可见处理。
- MCP 错误返回面向 Agent 的 `forbidden_scope` 提示。
