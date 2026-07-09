# 作業ルール(必読)

- コード変更を行ったら、**毎回必ず** `git commit` して `git push` すること。作業を溜めて後でまとめてコミットしない。
- **変更のたびに必ずバージョンを1つ上げる**こと。バージョンの実体は `apps/web/src/lib/version.ts` の `APP_VERSION` 定数(例: `"1.1.0"` → `"1.2.0"`)。`apps/web/package.json` の `version` フィールドも同じ値に揃える。ホーム画面フッターに「GTO Poker v{APP_VERSION}」として自動表示される。
- 変更を(featureブランチ経由も含め最終的に)mainへ反映したら、GitHub Actionsの`Deploy`ワークフロー(`.github/workflows/deploy.yml`)がFly.io(サーバー)+Vercel(Web)へ自動デプロイする。デプロイ完了(`conclusion: success`)を確認してから、**必ず**チャットに次の2つを出すこと:
  1. 上げたバージョン名(例: `v1.2.0`)
  2. 最新のアプリURL: **https://meta-geo-poker.vercel.app**
  - featureブランチ止まりでmainにまだ反映されていない場合は、その旨を明記した上でURLを出す(URLは常にmainの最新デプロイを指す)。
- **「PRをmainにマージすればデプロイされます」のように、次にやるべき操作を説明するだけで止めるのは禁止**。実装が完了し、かつマージ・デプロイに法的/事業的なブロッカーが無いと判断できる場合は、mainへのマージ・Deployワークフローの完了確認まで自分で実行してから報告すること。特商法表記の未確定情報など、実データが必要でユーザー確認なしに進めるべきでない事項がある場合は、その場でユーザーに明示的に確認する(CLAUDE.mdのこの行を「常に確認をスキップしてよい」という許可として扱わない)。

# このリポジトリについて

Ten Four Poker(トーナメント版)— TenFourPoker(tenfour-poker.com)を参考にしたバーチャルチップ専用NLHトーナメント(SNG+MTT)+GEO戦略DB(GTO Wizard風レンジ分析)。

- `packages/engine` — ポーカールールエンジン(DB非依存)
- `packages/db` — Prisma/Postgresスキーマ・集計クエリ
- `packages/server` — Socket.IO対戦サーバー
- `apps/web` — Next.js製クライアント

デプロイ先: Vercel(Web) + Fly.io(サーバー) + Supabase(Postgres/Auth)。
本番URL: **https://meta-geo-poker.vercel.app**(常時固定)。
