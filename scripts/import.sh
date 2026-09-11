#!/usr/bin/env bash
# 从 JSON 导入：scripts/import.sh file.json [merge|replace] [http://127.0.0.1:4000]
# replace = 清空后写入；merge（缺省）= 同 key 覆盖
set -e
FILE="${1:?usage: import.sh file.json [merge|replace] [base-url]}"
MODE="${2:-merge}"
BASE="${3:-http://127.0.0.1:4000}"
curl -sf -X POST "$BASE/api/v1/import?mode=$MODE" -H 'content-type: application/json' --data-binary "@$FILE"
echo
