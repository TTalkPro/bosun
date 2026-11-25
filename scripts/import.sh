#!/usr/bin/env bash
# 从 JSON 导入：BOSUN_API_KEY=bsk_… scripts/import.sh file.json [merge|replace] [http://127.0.0.1:5000]
#
# merge（缺省）= 同 ID 覆盖、其余保留；replace = 先清空本组织的项目 / 任务 / Feedback / 筛选器再写入。
# 需要组织管理员的 API key，且带 manage 权限（在「账户 → API Key」页创建时勾选）。
# 整个导入是一个事务：任何一条记录不合法就全部回滚。
set -euo pipefail

FILE="${1:?usage: BOSUN_API_KEY=bsk_… import.sh file.json [merge|replace] [base-url]}"
MODE="${2:-merge}"
BASE="${3:-http://127.0.0.1:5000}"

case "$MODE" in
  merge|replace) ;;
  *) echo "import.sh: 模式只能是 merge 或 replace（收到「$MODE」）" >&2; exit 2 ;;
esac
if [ ! -r "$FILE" ]; then
  echo "import.sh: 读不到文件 $FILE" >&2
  exit 2
fi
if [ -z "${BOSUN_API_KEY:-}" ]; then
  echo "import.sh: 需要环境变量 BOSUN_API_KEY（组织管理员、带 manage 权限的 API key）" >&2
  exit 2
fi

RESP="$(mktemp)"
trap 'rm -f "$RESP"' EXIT

# key 经标准输入的 curl 配置传进去，不出现在命令行（ps 看不到）
STATUS="$(printf 'header = "Authorization: Bearer %s"\n' "$BOSUN_API_KEY" |
  curl -sS -K - -o "$RESP" -w '%{http_code}' -X POST "$BASE/api/v1/import?mode=$MODE" \
    -H 'content-type: application/json' --data-binary "@$FILE")" || {
  echo "import.sh: 连不上 $BASE" >&2
  exit 1
}

if [ "$STATUS" != 200 ]; then
  echo "import.sh: HTTP $STATUS：$(head -c 500 "$RESP")" >&2
  case "$STATUS" in
    401) echo "  key 无效、已撤销或已过期" >&2 ;;
    403) echo "  导入要组织管理员的 key，且 key 带 manage 权限" >&2 ;;
  esac
  exit 1
fi

cat "$RESP"
echo
