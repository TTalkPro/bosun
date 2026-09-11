#!/usr/bin/env bash
# 停掉 dev-run.sh 起的节点（按 beam 进程的 -sname 找，不误杀别的 shell）
for p in $(pgrep -x beam.smp); do
  if tr '\0' ' ' < /proc/$p/cmdline | grep -q -- "-sname bosun"; then
    echo "stopping bosun node (pid $p)"; kill "$p"
  fi
done
