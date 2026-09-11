#!/usr/bin/env bash
# 开发用：编译后以非交互方式起后端（日志到 stdout）。Ctrl-C 结束。
set -e
cd "$(dirname "$0")/.."
rebar3 compile
exec erl -pa _build/default/lib/*/ebin _build/default/checkouts/*/ebin -config config/sys.config -noinput -sname bosun \
  -eval '{ok, _} = application:ensure_all_started(bosun_web).'
