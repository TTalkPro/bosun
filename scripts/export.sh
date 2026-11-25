#!/usr/bin/env bash
# 导出本组织的数据到 JSON：BOSUN_API_KEY=bsk_… scripts/export.sh [out.json] [http://127.0.0.1:5000]
#
# 需要组织管理员的 API key（在「账户 → API Key」页创建；导出是读操作，任意权限都行）。
# 导出范围 = key 所属的组织，与 /data 页的「下载 JSON」相同。
# 先写临时文件、成功后再改名：失败时不会留下 / 覆盖成一个装着错误信息的 out.json。
set -euo pipefail

OUT="${1:-bosun-export-$(date +%Y%m%d-%H%M).json}"
BASE="${2:-http://127.0.0.1:5000}"

if [ -z "${BOSUN_API_KEY:-}" ]; then
  echo "export.sh: 需要环境变量 BOSUN_API_KEY（组织管理员的 API key，在「账户 → API Key」页创建）" >&2
  exit 2
fi

TMP="$(mktemp "${OUT}.XXXXXX")"
trap 'rm -f "$TMP"' EXIT

# key 经标准输入的 curl 配置传进去，不出现在命令行（ps 看不到）
STATUS="$(printf 'header = "Authorization: Bearer %s"\n' "$BOSUN_API_KEY" |
  curl -sS -K - -o "$TMP" -w '%{http_code}' "$BASE/api/v1/export")" || {
  echo "export.sh: 连不上 $BASE" >&2
  exit 1
}

if [ "$STATUS" != 200 ]; then
  echo "export.sh: HTTP $STATUS：$(head -c 300 "$TMP")" >&2
  case "$STATUS" in
    401) echo "  key 无效、已撤销或已过期" >&2 ;;
    403) echo "  导出只给组织管理员：这把 key 的主人不是管理员" >&2 ;;
  esac
  exit 1
fi

mv "$TMP" "$OUT"
trap - EXIT
echo "exported to $OUT ($(wc -c < "$OUT" | tr -d ' ') bytes)"
