# デプロイ手順

このリポジトリは「コマンド一つで本番にデプロイできる」状態まで準備してありますが、
Vercel・Fly.io・Supabaseいずれもあなたのアカウント認証が必要なため、**実際のデプロイ実行は
ご自身の環境から行ってください**(このセッションにはそれらの認証情報がありません)。

構成:

| コンポーネント | デプロイ先 | 理由 |
|---|---|---|
| `apps/web`(Next.js) | **Vercel** | 静的/SSRに強く、Next.jsとの親和性が高い |
| `packages/server`(Socket.IO) | **Fly.io** | WebSocketを常時起動プロセスで保持する必要があり、Vercelのサーバーレスには不向き |
| DB | **Supabase**(Postgres) | ローカルと同じPrismaスキーマがそのまま使える。認証機能も将来使える |

## 1. Supabase(DB)

1. https://supabase.com でプロジェクトを作成
2. Project Settings → Database → Connection string(**Session pooler**推奨)をコピー
3. ローカルでマイグレーションを本番DBに適用:
   ```bash
   cd packages/db
   DATABASE_URL="postgresql://postgres:[YOUR-PASSWORD]@[YOUR-PROJECT-REF].supabase.co:5432/postgres" \
     npx prisma migrate deploy
   ```

## 2. Fly.io(対戦サーバー)

```bash
# 初回のみ
curl -L https://fly.io/install.sh | sh
fly auth login

# リポジトリのルートから実行(モノレポ全体をビルドコンテキストにするため)
cd /path/to/Meta---GEO
fly launch --config packages/server/fly.toml --dockerfile packages/server/Dockerfile --no-deploy
# app名を聞かれたら packages/server/fly.toml の app と合わせるか、対話で変更してファイルを更新

fly secrets set DATABASE_URL="<Supabaseの接続文字列>" --config packages/server/fly.toml
fly secrets set WEB_ORIGIN="https://<あなたのVercelドメイン>" --config packages/server/fly.toml

fly deploy --config packages/server/fly.toml --dockerfile packages/server/Dockerfile .
```

デプロイ後、`https://<app名>.fly.dev/health` が `{"ok":true}` を返せば成功です。

## 3. Vercel(Web)

```bash
cd apps/web
npx vercel link   # プロジェクトを作成/紐付け(Root Directoryはapps/webのまま)
npx vercel env add NEXT_PUBLIC_SERVER_URL production
# 値: https://<Fly.ioでデプロイしたapp名>.fly.dev

npx vercel --prod
```

`apps/web/vercel.json` にビルドコマンド(モノレポ全体を `pnpm install` してから `@meta-geo/web` を
ビルドする)を設定済みなので、Vercel側の追加設定は基本的に不要です。

## 環境変数まとめ

| 変数 | どこで使う | 値の例 |
|---|---|---|
| `DATABASE_URL` | `packages/db`, `packages/server` | Supabaseの接続文字列 |
| `PORT` | `packages/server` | Fly.ioでは自動設定(`fly.toml`で4000指定済み) |
| `WEB_ORIGIN` | `packages/server` | SocketのCORS許可オリジン。Vercelの本番URL |
| `NEXT_PUBLIC_SERVER_URL` | `apps/web` | Fly.ioの対戦サーバーURL(`https://xxx.fly.dev`) |

## デプロイ後の確認

1. VercelのURLを開き、着席してBOT対戦がプレイできること
2. `/geo` でハンド履歴・統計が表示されること(サーバー経由でSupabaseのデータを読めているか)
3. `docs/SOLO_TESTING.md` と同様の手順を本番URLに対して実行し、DBにハンドが記録されることを確認

## 既知の制約

- `packages/server/Dockerfile` はこの開発環境でDocker-in-Dockerが使えずローカルビルド検証が
  できていません。`fly deploy` で初回ビルド時にエラーが出た場合はログを確認し、
  `pnpm install --frozen-lockfile` や `prisma generate` 周りを疑ってください。
- `apps/web/vercel.json` も同様に、実際のVercelアカウントでのデプロイ検証はできていません
  (認証情報がないため)。Vercelのプロジェクト設定で Root Directory が `apps/web` に
  なっていることを確認してください。もしビルドが失敗する場合は、Vercelダッシュボードの
  Build & Development Settings で Build Command を直接
  `cd ../.. && pnpm install --frozen-lockfile && pnpm --filter @meta-geo/web run build` に
  上書き設定してみてください。
- ソロテスト用の実装(1テーブルにつき人間1人まで)のままです。複数人が同時にプレイできる
  ロビー機能・複数テーブル対応は未実装です(次フェーズ)。
