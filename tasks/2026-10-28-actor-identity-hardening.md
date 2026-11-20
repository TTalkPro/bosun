# MCP actor 身份收紧

## 背景
MCP `actor` / `author` 参数当前可以覆盖会话身份，导致有效 key 可以冒名写历史。

## 目标
- 已绑定 API key 的 MCP 会话禁止通过参数覆盖 actor / author。
- 未绑定主体的系统/测试作用域保留覆盖能力，避免破坏领域测试与运维脚本。
- 身份固定为 `identify` 生成的名称；key 主人继续记录在 actor 表。

## 验收
- 绑定主体后传 `actor` / `author` 返回 `forbidden_actor_override`。
- 不传参数时使用当前 identity。
- 系统作用域行为保持不变。
