# Fly.io用の対戦サーバーイメージ。@meta-geo/engine と @meta-geo/db を workspace: で参照する
# モノレポ構成のため、ビルドコンテキストはリポジトリのルートにする必要がある:
#   fly deploy --config packages/server/fly.toml --dockerfile packages/server/Dockerfile .
# (最後の "." がビルドコンテキスト=リポジトリルート。詳細は docs/DEPLOYMENT.md 参照)
#
# 注: この環境ではDocker-in-Dockerが使えずローカルでのビルド検証ができていないため、
# レイヤーキャッシュの最適化(package.jsonだけ先にコピーする等)はあえて行わず、
# 「リポジトリ全体をコピーしてそのままインストールする」という最も素直で失敗しにくい構成にしている。

FROM node:22-slim AS base
# Prisma のクエリエンジンはOpenSSLに動的リンクしており、`pnpm install`(prisma generate含む)
# より前にopensslを入れておかないと、正しいバイナリターゲット(例: debian-openssl-3.0.x)を
# 検出できず誤ったもの(openssl-1.1.x)をダウンロードしてしまい、実行時に
# `libssl.so.1.1: cannot open shared object file` でクラッシュする。
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /repo

COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @meta-geo/db run generate

ENV NODE_ENV=production
EXPOSE 4000

CMD ["pnpm", "--filter", "@meta-geo/server", "exec", "tsx", "src/index.ts"]
