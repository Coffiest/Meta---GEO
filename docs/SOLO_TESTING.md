# ソロテスト手順(1人でプレイ確認 + DB保存確認)

このドキュメントは、開発中のポーカートーナメントアプリを**あなた1人だけで**実際にプレイし、
「ちゃんと遊べるか」「ハンド履歴がDB(GEO戦略DBの元データ)に正しく保存されているか」を
確認するための手順です。

## 前提

- Node.js 20+ / pnpm がインストール済み
- ローカルにPostgresが使える(このリポジトリの開発コンテナには最初から入っています)

## 0. 初回だけ: DBのセットアップ

```bash
# Postgresを起動(このコンテナでは systemd 相当が無いので service コマンドで)
service postgresql start

# ロール/DBを作成(初回のみ)
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'localdev';"
sudo -u postgres psql -c "CREATE DATABASE meta_geo_dev;"

# 依存関係インストール
pnpm install

# スキーマ適用
cd packages/db
NODE_USE_ENV_PROXY=1 npx prisma migrate deploy   # 2回目以降はこれでOK
# もしスキーマを自分で変更した場合は migrate dev を使う
```

`packages/db/.env` に `DATABASE_URL` が設定済みです(ローカルPostgres用)。本番でSupabaseに
繋ぐ場合は `packages/db/.env.example` を参考に環境変数を差し替えるだけで動作します。

## 1. 対戦サーバーを起動

```bash
cd packages/server
PORT=4000 NODE_USE_ENV_PROXY=1 npx tsx src/index.ts
```

`[server] listening on :4000` と出れば起動完了です。このプロセスは動かしっぱなしにしてください。

## 2. Webアプリを起動(別ターミナル)

```bash
cd apps/web
NEXT_PUBLIC_SERVER_URL=http://localhost:4000 npx next dev -p 3000
```

`http://localhost:3000` にアクセスします(社内ブラウザ or スマホ実機からアクセスする場合は
ホストのIPに読み替えてください)。

## 3. 実際にプレイする

1. 表示名を入力して「テーブルに着席する」を押す
2. あなたが seat0 として着席し、残り5席は自動的にBOT(BOT-Akira 等)で埋まる
3. トーナメントが自動的に開始する(ブラインド 100/200、BBアンテ200、5分ごとに上昇)
4. 自分の番になると画面下部のアクションバー(フォールド/チェック・コール/ベット・レイズ)が
   アクティブになるので、実際に操作してハンドを進める
5. ハンドが終わると、そのハンド内の全員のホールカードが公開される(Ten-Four Pokerの
   「全履歴公開」思想を踏襲)
6. 誰か1人になるまでハンドが自動的に繰り返される(トーナメント終了)

**1人だけでも、残り5人がBOTなので最初から最後まで通しでプレイ・確認できます。**

## 4. DBに正しく保存されているか確認する

プレイ中 or プレイ後に、別ターミナルで以下を実行します。

```bash
cd packages/db
NODE_USE_ENV_PROXY=1 npx tsx scripts/inspectLatestHand.ts   # 直近3ハンドを表示
NODE_USE_ENV_PROXY=1 npx tsx scripts/inspectLatestHand.ts 10 # 直近10ハンドを表示
```

以下が正しく出力されていればOKです:

- 各ハンドのブラインド/ボタン位置/ボード/ポット総額
- 各席のホールカード(フォールドしたプレイヤーも含めて全員分)、開始スタック、収支差分
- 全アクションの時系列ログ(ストリート・種別・額・アクション前ポット)
- ポットの内訳(サイドポットが発生した場合はレイヤーごとに分かれて表示される)

もっと直接見たい場合は `pnpm --filter @meta-geo/db studio` でPrisma Studio(DBのGUI)も開けます。

## 5. 自動テストで裏付けを取る(任意)

このドキュメントでの手動確認に加えて、以下のコマンドでルールエンジンの自動テストも実行できます。

```bash
pnpm -r --filter=./packages/* test
```

サイドポット計算、不完全レイズ(TDA Rule 47)、デッドボタン、フルハンドシミュレーション
(6人BOT対戦をシード付き乱数で1000ハンドまで自動再生してチップ保存則を検証)などが
自動でチェックされます。

## トラブルシューティング

- **画面が「相手のアクションを待っています…」のまま動かない**: サーバーのログを確認してください。
  BOTのアクションは約0.9秒後に自動実行されます。
- **「現在このテーブルは満席です」と表示される**: このソロテスト用テーブルは人間1人までです。
  ブラウザタブを複数開いた場合、2つ目以降は観戦モードになります。サーバープロセスを再起動すると
  席がリセットされます。
- **DBに何も記録されていない**: `packages/db/.env` の `DATABASE_URL` が正しいか、
  `service postgresql status` でPostgresが起動しているか確認してください。
