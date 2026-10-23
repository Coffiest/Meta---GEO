# PokerART 引き継ぎ

## 更新日時
2026-10-23 15:15

## 現在地
- このチャットで出したもの(2026-10-21〜23、mainマージ済み):v1.13.1 チップ表現の削除 / v1.17.0〜1.17.2 オールインのランアウト中・観戦(手札が見える人)・リプレイで各席の勝率表示(`lib/runoutEquity.ts`、Web Worker、名前の横。右側の席は左横) / v1.20.0 プレイヤー情報を中央の小さなカードにし、KKPoker と同じスタッツ追加(`packages/db/src/playerTendencies.ts`、直近3,000ハンド) / v1.20.1 GEO に自動の席の決定も含める / v1.20.2 全ハンドから GEO を作り直すワークフロー(`.github/workflows/backfill-geo.yml`)。
- v1.20.1・1.20.2 のデプロイ完了と、GEO 作り直し(Actions の Backfill GEO、run 39974593651)の結果は未確認。失敗していたら Actions から手動で再実行する。
- 勝率表示は試しのページで撮影確認済み。プレイヤー情報の新しい数字の本番表示は未確認。
- GTO Wizard のデータは `packages/engine/data/gtow/70/<場面>.json`、判定は `packages/db/src/gtowPreflop.ts`。GEO の統合は読み出し時に読み替え(`geoTree.ts` の normalizePosition / expandLineKey)。

- Lesson タブ(別チャット、2026-10-23):v1.18.0 6タブ化・カリキュラム一覧・1日3レッスン(`LessonProgress` / `/api/lessons`)/ v1.19.0「0. ルール説明」のレッスン(`apps/web/src/data/lessonRules.ts`、`components/lesson/LessonPlayer.tsx`)。どちらもデプロイ success 確認済み。[Coffiest/Meta---GEO#392](https://github.com/Coffiest/Meta---GEO/pull/392)(一覧で押せるレッスンをカード+再生ボタン+「はじめる」、準備中は錠)は main マージ済み。番号 v1.20.1 が #393 と重なった。その Deploy は cancelled で、v1.20.2 の Deploy に含まれる(結果は未確認)。実機は未確認。

## 決定事項
- Lesson の仕様は CLAUDE.md の Lesson の節(1日3レッスン・ゴールド以上は無制限・ルール説明は無制限・出典は出さない・バリィはくだけた普通の口調、関西弁はラフくんだけ)。
- 返答では日本語以外の表記を使わない(オーナー指示 2026-10-23)。英語の語や略語・英字の名前は、日本語に言い換えるか、カタカナで書く。
- 「バーチャルチップ」「仮想チップ」は一切使わない(画面・文書・チャット)。「お金を賭けない」等にする(2026-10-21)。
- 「アンティ」と書く。料金はシート(usePricingSheet)。
- 変更は小さく分けて1つずつバージョンを上げて main へマージ・デプロイ確認(CLAUDE.md)。
- 解説で「ノート」「コンティニュー」「続ける」を使わない。手札の分類(ハイ+ローのオフスート等)は言わない。全ての解説に判定バッジを付け、正解/不正解/どうすべきかを言う。
- 「OOPのオリジナルはJハイ以下・モノトーンなら必ずチェック」が、3betポットの簡易戦略より優先(オーナー確定 2026-10-09。実装済み)。
- SRPのOOPレイザーは、ドライかつモノトーンでないKハイだけ33%CB、他はレンジチェック(SB vs BB除く)。
- Notion の表のベット評価は、シンバリューの勝率判定より優先。
- プリフロップの4bet以上の判定は「本物のソルバー」のデータで行う(オーナー指示)。GTO Wizard の利用規約はオーナーが確認済みで問題なし(オーナー申告)。
- GTO Wizard のデータ:MTT・ChipEV・8max を LJ 以降の6人として使う / アンティあり / スタックはアプリの帯(7/10/14/20/30/70bb)、無い値は近い値で代用、100bb は不要 / 3bet がすでにオールインならその情報まででよい(オーナー確定 2026-10-09)。
- データは「70bb がそろってから、アプリへの組み込みと一緒に main へ」入れる(オーナー確定 2026-10-09)。
- GTO Wizard の UI は、並べ方・操作・色の役割だけ参考にし、名前・ロゴ・見た目そのものはまねしない。

## 次にやること
0. Lesson「1. トナメとキャッシュの違い」の中身をオーナーから受け取って作る。以後も1項目ずつ。
0. GEO 作り直しワークフローの結果を確認し、オーナーに何ハンド入ったか報告する。
1. **【最優先・オーナー指示 2026-10-22】GTO Wizard の BB のディフェンスレンジを各スタックで大量に取る。「PokerARTの続き」と言われたらこれから始める。**
   - 取るもの:各スタック(7/10/14/20/30/50/70bb。ライブラリにある値)で、LJ / HJ / CO / BTN / SB のオープンレイズに対する BB の行動(Raise / Call / Fold / Allin)。浅いスタックでオープンにオールインがあれば、それに対する BB(Call / Fold)も取る。形式は MTT・ChipEV・8max(LJ 以降を6人として使う)。
   - 進め方(この順に自分で確かめ、オーナーに方法を聞き直さない):
     a. Mac につながっていれば `computer_resolve_access` で GTO Wizard(`com.google.Chrome.app.boiilclkkfeebffcopfldjipcjddoeno`)の tier を見る。`full` なら 10-09 と同じく、デスクトップ版をコンピューター操作で全部自動で取る。
     b. `read`(2026-10-21 はこれ。ブラウザ扱いで見るだけ。回り込まない)なら、Claude in Chrome(`mcp__claude-in-chrome__tabs_context_mcp`)がつながっているか試す。つながっていれば、それで app.gtowizard.com を開いて全部自動で取る。
     c. どちらもダメなときだけ、オーナーに1回だけ「普段の Chrome に Claude 拡張(https://claude.ai/chrome)を入れ、同じ Chrome で GTO Wizard にログインして」と頼む。オーナーは「全部自動」を希望している。オーナーが画面を開いて Claude が読む方法は、オーナーが望んでいない。
   - 1日100場面まで(画面上部の「n/100」)。途中で通るだけの場面も1つと数えられる。BB の場面だけ欲しいので、オープナー Raise →残り Fold → BB の画面で撮る。
   - 読み取り:ブランチ `claude/gtow-70bb-data` の `scripts/gtow/grid.py <画像> <出力.json>`(窓の大きさに依存しない。画面の合計と一致を確認済み)。右の行動の箱は押さない(表が暗くなる)。
   - 取れたもの:50bb の BB vs HJ(`claude/gtow-70bb-data` の `packages/db/src/data/gtow/50/vsOpen_BB_vs_HJ.json`)。70bb は BB vs LJ/HJ/CO/BTN が取得済み・main 適用済み(`packages/engine/data/gtow/70/`)、BB vs SB は未取得。
   - 保存:データは main のデータ置き場 `packages/engine/data/gtow/<スタック>/vsOpen_BB_vs_<席>.json`(既存の 70bb と同じ形)。原画は ブランチ `claude/gtow-raw` の `gtow_raw/MTT_ChipEV_8max/<スタック>/`(Mac の ~/Documents/PokerART/gtow_raw/ にも置けるなら置く)。アプリへの適用は、取り終えてからオーナーに確認。
2. BvB(SB 対 BB)の Excel(オーナー支給 SB.xlsx。10/15/20/25/30bb・deep・50bb の SB のレンジ、vs limp・vs raise の BB のレンジ)をアプリの判定と解説の表に入れる。未回答の質問:①セルの色の意味(紫・濃い緑・薄い緑2段・オレンジ濃淡・黄・白)②112〜165行の見出しの無い表4つは何bbのどの場面か ③解説文はオーナーが書くか、こちらが下書きするか。
3. 未回答: ラフくんの吹き出しに「〇〇(SB)の手番」と書くか / トーナメント履歴の RR レートの詳細表示を戻すか。
4. ショーダウン順(showdownOrder)のテスト。書いたが出していない(オーナーが途中で止めた)。
5. オーナーの To-Do(docs/TODO.md): Stripe のポータルでプラン切り替えを許可。リポジトリは公開のままにする(CLAUDE.md。非公開だと Actions の無料枠が切れる)。

- GEO の統合(オーナー確定 2026-10-10): 後ろの人数で数える・オールイン以外のレイズは1つ。20bb以上への拡大はしない。少ないマスを GTO の表とまぜて埋めるのは禁止。
- GEO には自動の席の決定も全部入れる(オーナー指示 2026-10-23。10-10 の「入れない」を上書き)。過去分も入れる。
- シェアキャンペーンの付与はオーナーが投稿を目で確認して手動(自動付与しない)。
