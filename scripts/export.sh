#!/usr/bin/env bash
# 导出整库到 JSON：scripts/export.sh [out.json] [http://127.0.0.1:4000]
set -e
OUT="${1:-bosun-export-$(date +%Y%m%d-%H%M).json}"
BASE="${2:-http://127.0.0.1:4000}"
curl -sf "$BASE/api/v1/export" -o "$OUT"
echo "exported to $OUT ($(wc -c < "$OUT") bytes)"
