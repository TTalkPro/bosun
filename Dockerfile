# 多阶段构建：前端 → Erlang release → slim 运行镜像
# 构建并启动：docker compose up -d --build

# ---------- 前端（产物落到 /build/apps/bosun_web/priv/static） ----------
FROM node:22-bookworm-slim AS web
RUN npm install -g pnpm@10
WORKDIR /build/web
COPY web/package.json web/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY web/ ./
RUN pnpm build

# ---------- release（rebar3 as prod tar，含 ERTS） ----------
FROM erlang:28-bookworm AS build
RUN apt-get update \
 && apt-get install -y --no-install-recommends cmake g++ libicu-dev libtbb-dev \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /build
COPY rebar.config rebar.lock ./
COPY config/ config/
COPY scripts/ scripts/
COPY docs/ docs/
RUN sed -i 's/{project_app_dirs, \[.*\]}\./{project_app_dirs, []}./' rebar.config \
 && for i in 1 2 3 4 5; do rebar3 as prod compile && break; echo "== retry deps $i"; sleep 10; done; \
    rebar3 as prod compile
COPY rebar.config rebar.lock ./
COPY apps/ apps/
COPY --from=web /build/apps/bosun_web/priv/static apps/bosun_web/priv/static
RUN rebar3 as prod tar \
 && mkdir /out \
 && tar xzf _build/prod/rel/bosun/bosun-*.tar.gz -C /out

# ---------- 运行 ----------
FROM debian:trixie-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends libicu76 libtbb12 openssl ca-certificates curl \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --system --home-dir /opt/bosun --shell /usr/sbin/nologin bosun \
 && mkdir -p /var/lib/bosun \
 && chown bosun:bosun /var/lib/bosun
COPY --from=build /out/ /opt/bosun/
ENV BOSUN_HTTP_IP=0.0.0.0 \
    BOSUN_HTTP_PORT=5000 \
    BOSUN_DATA_DIR=/var/lib/bosun
EXPOSE 5000
VOLUME ["/var/lib/bosun"]
WORKDIR /opt/bosun
USER bosun
CMD ["./bin/bosun", "foreground"]
