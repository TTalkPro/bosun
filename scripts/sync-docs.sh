#!/bin/sh
# 把 docs/AGENT-WORKFLOW*.md 拷进 bosun_core/priv/workflow（rebar3 compile pre_hook 调用）。
set -e
cd "$(dirname "$0")/.."
mkdir -p apps/bosun_core/priv/workflow
cp docs/AGENT-WORKFLOW.md docs/AGENT-WORKFLOW.en.md apps/bosun_core/priv/workflow/
