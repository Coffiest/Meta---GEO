# 作業ルール(必読)

- コード変更を行ったら、**毎回必ず** `git commit` して `git push` すること。作業を溜めて後でまとめてコミットしない。
- プッシュ後は、**必ず**最新のアプリのURLをチャットに出すこと: **https://meta-geo-poker.vercel.app**
  - mainにマージ/プッシュした場合は、GitHub Actionsの`Deploy`ワークフロー(`.github/workflows/deploy.yml`)が自動でFly.io(サーバー)+Vercel(Web)にデプロイする。デプロイ完了(`conclusion: success`)を確認してからURLを案内する。
  - featureブランチ止まりでmainにまだ反映されていない場合は、その旨を明記した上でURLを出す(URLは常にmainの最新デプロイを指す)。

# このリポジトリについて

Ten Four Poker(トーナメント版)— TenFourPoker(tenfour-poker.com)を参考にしたバーチャルチップ専用NLHトーナメント(SNG+MTT)+GEO戦略DB(GTO Wizard風レンジ分析)。

- `packages/engine` — ポーカールールエンジン(DB非依存)
- `packages/db` — Prisma/Postgresスキーマ・集計クエリ
- `packages/server` — Socket.IO対戦サーバー
- `apps/web` — Next.js製クライアント

デプロイ先: Vercel(Web) + Fly.io(サーバー) + Supabase(Postgres/Auth)。
本番URL: **https://meta-geo-poker.vercel.app**(常時固定)。
