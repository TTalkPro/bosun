#!/usr/bin/env bash
# 构建生产 release：前端 → rebar3 prod tar
# 产物：_build/prod/rel/bosun/bosun-<vsn>.tar.gz（自带 ERTS，只能在同 OS/架构上跑）
set -euo pipefail
cd "$(dirname "$0")/.."
echo "== web"
( cd web && pnpm install --frozen-lockfile && pnpm build )
echo "== release"
rebar3 as prod tar
ls -la _build/prod/rel/bosun/*.tar.gz
