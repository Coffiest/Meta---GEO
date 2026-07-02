# Meta-GEO — Ten Four Poker トーナメント版 + GEO戦略DB

TDAルール準拠のノーリミットホールデム・トーナメントエンジンと、全ハンド/全アクションを
記録してスポットごとに検索・分析できる「GEO戦略(仮称)」DBを組み合わせたポーカーアプリ。

## モノレポ構成

```
packages/engine   純粋なポーカールールエンジン(TypeScript, DB/ネットワーク非依存)
packages/db       Prismaスキーマ + ハンド記録ロジック(GEO戦略DBの実体)
packages/server   Socket.IO対戦サーバー + ルールベースBOT
apps/web          Next.js製のスマホ縦画面クライアント(Ten Four Poker風UI)
docs/             ルール調査メモ・ソロテスト手順など
```

## ドキュメント

- [`docs/POKER_RULES.md`](./docs/POKER_RULES.md) — TDAルール調査メモ(サイドポット計算、
  不完全レイズ、デッドボタン等の実装基礎)
- [`docs/SOLO_TESTING.md`](./docs/SOLO_TESTING.md) — 1人でプレイ→DB保存確認まで行う手順

## クイックスタート

```bash
pnpm install

# DB(初回のみ)
service postgresql start
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'localdev';"
sudo -u postgres psql -c "CREATE DATABASE meta_geo_dev;"
cd packages/db && NODE_USE_ENV_PROXY=1 npx prisma migrate deploy && cd ../..

# 対戦サーバー(ターミナル1)
cd packages/server && PORT=4000 NODE_USE_ENV_PROXY=1 npx tsx src/index.ts

# Webクライアント(ターミナル2)
cd apps/web && NEXT_PUBLIC_SERVER_URL=http://localhost:4000 npx next dev -p 3000
```

`http://localhost:3000` を開いて着席すると、BOTが自動的に残り席を埋めてトーナメントが始まります。
詳しい確認手順は [`docs/SOLO_TESTING.md`](./docs/SOLO_TESTING.md) を参照してください。

## テスト

```bash
pnpm -r --filter=./packages/* test
```

サイドポット計算、TDA Rule 47(不完全レイズ)、デッドボタンのエッジケース、6人BOT対戦の
フルシミュレーション(チップ保存則の検証)などを自動テストで担保しています。
