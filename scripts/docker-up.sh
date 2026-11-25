#!/bin/sh
# 构建并启动 Docker 镜像，镜像名带版本：bosun:<版本>（同时打 bosun:latest）。
#
# 版本取 rebar.config 里 relx 的 release 版本（与三个应用的 vsn、web/package.json 的 version 一致；
# 不一致时警告）。版本写进 .env 的 BOSUN_VERSION，docker-compose.yml 用它给镜像命名，
# 之后的 docker compose logs / down 等命令照常用。
#
#   scripts/docker-up.sh              # 构建 + 启动（替换正在跑的容器；数据在挂载的宿主机目录里）
#   scripts/docker-up.sh --no-cache   # 额外参数原样传给 docker compose build
set -eu
cd "$(dirname "$0")/.."

V=$(sed -n 's/.*{release, *{bosun, *"\([^"]*\)"}.*/\1/p' rebar.config | head -n 1)
if [ -z "$V" ]; then
    echo "rebar.config 里找不到 {release, {bosun, \"版本\"}, ...}" >&2
    exit 1
fi

for f in apps/*/src/*.app.src; do
    grep -q "{vsn, \"$V\"}" "$f" || echo "警告：$f 的 vsn 与 release 版本 $V 不一致" >&2
done
grep -q "\"version\": \"$V\"" web/package.json || echo "警告：web/package.json 的 version 与 release 版本 $V 不一致" >&2

# .env 只改 BOSUN_VERSION 这一行，别的变量（如 BOSUN_HTTP_PORT）原样保留
touch .env
grep -v '^BOSUN_VERSION=' .env > .env.tmp || true
echo "BOSUN_VERSION=$V" >> .env.tmp
mv .env.tmp .env

echo "==> 构建 bosun:$V"
docker compose build "$@"
docker tag "bosun:$V" bosun:latest
docker compose up -d
docker compose ps
