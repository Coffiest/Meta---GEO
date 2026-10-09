# PokerART 引き継ぎ

## 更新日時
2026-10-09

## 現在地
- 本番は v4.188.0(main 507d4ee、Deploy・CI success 確認済み)。URL: https://meta-geo-poker.vercel.app
- 2026-10-09 に出したもの(実機の見た目は全て未確認):
  - v4.172: 履歴の収支を日時の段へ / 局後検討のワースト・ベスト削除・開始ボタン固定 / 飛んだ直後に卓が縦長になる不具合
  - v4.173〜4.182: 解説の言い回し(ノート→セオリー等)・3betの言い方・降りた判定(必要勝率)・BMCB(スライド)・ドンク(ローコネクト等)・ブロッカー一般論削除・スクイーズ(オープンレンジ上位半分)・A5s/A4sライト3bet〜5betは「!!」・マルチウェイの文言
  - v4.183〜4.188: SRPのOOPレイザー(ドライなKハイだけ33%)・マルチウェイもHUと同じ判定・リバーのMDF判定・シンバリュー(コールレンジへの勝率50%)・3bet/4betポットのフロップ(スライドゼミ4+GTO Wizard、raisedPot.ts)
- 判定の本体は packages/engine/src/review/coachRules.ts(judgeCoach)、bmcb.ts、raisedPot.ts。文言は apps/web/src/lib/coachComment.ts。
- apps/web の test/knowledgeDryRun.test.ts の4件は以前から失敗(CI では走らない)。

## 決定事項
- 「アンティ」と書く。料金はシート(usePricingSheet)。
- 変更は小さく分けて1つずつバージョンを上げて main へマージ・デプロイ確認(CLAUDE.md)。
- 解説で「ノート」「コンティニュー」「続ける」を使わない。手札の分類(ハイ+ローのオフスート等)は言わない。全ての解説に判定バッジを付け、正解/不正解/どうすべきかを言う。
- 「OOPのオリジナルはJハイ以下・モノトーンなら必ずチェック」が、3betポットの簡易戦略より優先(オーナー確定 2026-10-09。実装済み)。
- SRPのOOPレイザーは、ドライかつモノトーンでないKハイだけ33%CB、他はレンジチェック(SB vs BB除く)。
- Notion の表のベット評価は、シンバリューの勝率判定より優先。
- プリフロップの4bet以上の判定は「本物のソルバー」のデータで行う(オーナー指示)。GTO Wizard の利用規約はオーナーが確認済みで問題なし(オーナー申告)。

## 次にやること
1. GTO Wizard のプリフロップのレンジをデータ化する(オーナー指示)。
   - 必要なもの: Claude デスクトップアプリで、オーナーの Mac につないだチャット(コンピューター操作 = computer-use を有効にする)。クラウドのチャットからは Mac を操作できない。オーナーが GTO Wizard にログインしておく。
   - 集める範囲(未確定。最初にオーナーに確認): 形式(MTT/ChipEV、6max か、アンティ有無)、スタック(今のアプリの帯 7/10/14/20/30/100bb に合わせる案)、場面(RFI / vs オープン / オープナー vs 3bet / 3ベッター vs 4bet / vs 5betオールイン)、全ポジションの組み合わせ。
   - 手順: 1画面ずつ 13×13 の表のスクショを撮る → 色(レイズ/コール/フォールド/オールインの頻度)を読み取って数値にする。読み取りは手作業ではなくスクリプトで、各マスの色の割合を測る。数枚は目で照合して誤読が無いか確かめる。
   - 保存先: スクショの原画は Mac の ~/Documents/PokerART/gtow_raw/<形式>/<スタック>/<場面>_<ポジション>.png(リポジトリに入れない)。数値化したデータは packages/db/src/data/gtow/ に JSON(1ファイル = 1場面、{ "AA": {"raise":1,"call":0,"fold":0,"allIn":0}, ... } の169手)。
   - アプリへの適用: packages/db/src/reviewGto.ts の openGtoActions / defenseGtoActions と同じ形(GtoActionEV[])を返す関数を足し、今は「3bet-line」「reopened-line」で対象外になっているプリフロップ(packages/db/src/review.ts の detectPreflopSpot)をこのデータで判定する。自動の席の判断(packages/server/src/botStrategy/)にも使えるか後で検討。
   - データは大きくなりうる。Supabase の転送量に注意(CLAUDE.md)。DB ではなくリポジトリ内の JSON として持つ案。
2. 未回答の質問: ラフくんの吹き出しに「〇〇(SB)の手番」と書き、文中の「きみ」を相手の席名に置き換えるか / トーナメント履歴の RR レートの詳細表示を戻すか。
3. 実機確認(オーナー): v4.172 以降の解説・バッジの出方、履歴の収支の位置、飛んだ直後の卓。
4. ショーダウン順(packages/server/src/showdown.ts の showdownOrder)のテストを書く。
5. オーナーの To-Do(docs/TODO.md): Stripe のポータルでプラン切り替えを許可、GitHub リポジトリを非公開に。
