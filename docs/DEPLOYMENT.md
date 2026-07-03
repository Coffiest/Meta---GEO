# デプロイ手順

このリポジトリの開発セッション(サンドボックス)からは fly.io / vercel.com / supabase.com への
直接アクセスと、Postgresへの生TCP接続がネットワークポリシーでブロックされているため、実際の
デプロイは **GitHub Actions のワークフロー(`.github/workflows/deploy.yml`)** が行います。
GitHub Actionsのランナーはフルインターネットアクセスを持つため、そこから
`prisma migrate deploy` → `fly deploy` → `vercel deploy` を順に実行します。

構成:

| コンポーネント | デプロイ先 | 理由 |
|---|---|---|
| `apps/web`(Next.js) | **Vercel** | 静的/SSRに強く、Next.jsとの親和性が高い |
| `packages/server`(Socket.IO) | **Fly.io** | WebSocketを常時起動プロセスで保持する必要があり、Vercelのサーバーレスには不向き |
| DB | **Supabase**(Postgres) | ローカルと同じPrismaスキーマがそのまま使える |

## 0. 初回だけ: Supabaseにスキーマを適用する

サンドボックスからSupabaseへ生TCP接続できないため、初回のスキーマ適用だけは
Supabaseダッシュボードの **SQL Editor** に直接SQLを貼り付けて実行しています(実施済み)。
2回目以降のスキーマ変更は、後述のGitHub Actionsワークフロー内で
`prisma migrate deploy` が自動的に適用します。

## 1. GitHub リポジトリシークレットを登録する(あなたが行う作業)

GitHubのリポジトリ画面 → `Settings` → 左メニュー `Secrets and variables` → `Actions` →
`New repository secret` から、以下3つを登録してください。

| シークレット名 | 値 |
|---|---|
| `DATABASE_URL` | Supabaseの接続文字列(**Session pooler**推奨。Project Settings → Database → Connection string) |
| `FLY_API_TOKEN` | Fly.ioのAPIトークン(`fly tokens create deploy` またはダッシュボードで発行) |
| `VERCEL_TOKEN` | Vercelのトークン(Account Settings → Tokens で発行) |

`DATABASE_URL` は `postgresql://postgres.xxxxxxxxxxxx:[YOUR-PASSWORD]@aws-0-<region>.pooler.supabase.com:5432/postgres`
の形式です。Supabaseダッシュボードの Connect 画面に表示されている、あなたのプロジェクトの
実際の接続文字列(Session pooler)をそのままコピーしてください。

## 2. Fly.io側の準備

- Fly.ioのアプリ名は `meta---geo` で作成済みです(`packages/server/fly.toml` の `app` と一致)。
- もしFly.ioダッシュボードの「GitHubから自動デプロイ」機能を別途接続していた場合は、
  このワークフローと二重にデプロイが走ってしまうため **切断してください**
  (Fly.ioダッシュボード → 対象アプリ → Settings → 接続済みのGitHub連携を解除)。
  今後のデプロイは全てこのリポジトリの `deploy.yml` 経由で行います。

## 3. デプロイを実行する

シークレットを登録したら、以下のどちらかでワークフローが動きます。

- `main` ブランチに push する
- GitHubの `Actions` タブ → `Deploy` → `Run workflow` から手動実行する

ワークフローは3ジョブを順に実行します: `migrate-db`(Prismaマイグレーション適用) →
`deploy-server`(Fly.ioへ`packages/server`をデプロイ+ヘルスチェック) →
`deploy-web`(Vercelへ`apps/web`をデプロイ)。

## 環境変数まとめ

| 変数 | どこで使う | 値 |
|---|---|---|
| `DATABASE_URL` | `packages/db`, `packages/server` | Supabaseの接続文字列(GitHubシークレット) |
| `PORT` | `packages/server` | Fly.ioでは`fly.toml`で4000に固定設定済み |
| `WEB_ORIGIN` | `packages/server` | SocketのCORS許可オリジン。現状は`*`(全許可)。Vercelの本番URLが確定したら絞る |
| `NEXT_PUBLIC_SERVER_URL` | `apps/web` | 対戦サーバーURL。`https://meta---geo.fly.dev`をワークフローが自動設定 |

## デプロイ後の確認

1. VercelのURLを開き、着席してBOT対戦がプレイできること
2. `/geo` でハンド履歴・統計が表示されること(サーバー経由でSupabaseのデータを読めているか)
3. `docs/SOLO_TESTING.md` と同様の手順を本番URLに対して実行し、DBにハンドが記録されることを確認

## トランプ・テーブルのデザイン差し込み

- トランプ画像: `apps/web/public/cards/` に適用済み(GitHubのWeb画面からアップロード)。
  命名規則は `apps/web/public/cards/README.md` を参照。
- テーブル(フェルト)画像: `apps/web/public/table/felt.png` という1ファイルを、同じ要領で
  GitHubのWeb画面からアップロードすれば自動的に反映されます(`apps/web/public/table/README.md`
  参照)。**このファイルはまだ未適用です** — 添付いただいた画像はチャット上でのみ確認でき、
  このセッションからファイルとして保存する手段がないため、他のカード画像と同様にGitHub経由での
  アップロードをお願いします。

## 既知の制約

- ソロテスト用の実装(1テーブルにつき人間1人まで)のままです。複数人が同時にプレイできる
  ロビー機能・複数テーブル対応は未実装です(次フェーズ)。
- `WEB_ORIGIN` は現状`*`(全オリジン許可)にしてあります。Vercelの本番URLが確定したら
  `deploy.yml` の該当箇所を実際のドメインに絞ることを推奨します。
