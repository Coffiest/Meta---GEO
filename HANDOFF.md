# PokerART 引き継ぎ

## 更新日時
2026-10-09 17:45

## 現在地
- 本番は v4.188.0(main 507d4ee)。URL: https://meta-geo-poker.vercel.app
- GTO Wizard のプリフロップ表を 70bb で73場面、数値にした。**アプリにはまだ使っていない。**
  - 置き場所:ブランチ `claude/gtow-70bb-data`(main には未マージ)。
    - データ:`packages/db/src/data/gtow/70/<場面>.json`(1ファイル = 1場面)。中身は `{format, stack, scene, source, hands}`。`hands` は169手それぞれ `{"raise","call","fold","allIn","weight"}`。頻度の合計は1。`weight` はそのハンドがレンジに入っている割合(0 ならその局面に来ない手)。
    - 読み取りの道具:`scripts/gtow/`(`parse.py` `run.py` `README.md`)。
  - 形式:MTT・ChipEV・8max の解を、LJ 以降の6人(LJ/HJ/CO/BTN/SB/BB)として使う。アンティあり。スタックは全員 70bb。サイズ(70bb):オープン 2.1bb(BTN 2.2、SB 3.5 または 8.25 / 8.4)、3bet 7.35〜11bb、4bet 16.17〜23.1bb。
  - 場面の名前:`RFI_<席>`(オープン。SB は call=リンプ)/ `vsOpen_<自分>_vs_<オープナー>` / `vs3bet_<オープナー>_vs_<3ベッター>`(allIn = 4bet オールイン、raise = 4bet)/ `vs4bet_<3ベッター>_vs_<オープナー>`(4bet がレイズ。allIn = 5bet オールイン)/ `vs4betAI_<3ベッター>_vs_<オープナー>`(4bet がオールイン。call か fold)/ `vs5bet_<オープナー>_vs_<3ベッター>`(5bet オールインへの対応)。
  - そろっていないもの:SB 対 BB の全場面(`vsOpen_BB_vs_SB`、`vs3bet_SB_vs_BB`、`vs4bet_BB_vs_SB`、`vs5bet_SB_vs_BB`、`vs4betAI_BB_vs_SB`)、`vs4bet_BB_vs_LJ`、`vs5bet_LJ_vs_BB`。7/10/14/20/30bb は未着手。
  - 精度:ハンドごとの頻度は画面と一致(目で照合済み。例:vs3bet_BTN_vs_SB の AA レイズ 23%)。レンジがとても狭い場面(vs5bet など)は `weight` の誤差が大きく、場面全体の割合は画面とずれる(例:vs5bet_BTN_vs_SB コール 画面57% / 計算70%)。判定には頻度だけを使い、`weight` は「0 かどうか」程度にとどめるのが安全。
- GTO Wizard の無料プランは1日100場面まで(帯に「n/100」)。途中で通るだけの場面も1つと数えられる。
- UI/UX の記録は `GTOWizard-UIUX.md`(チャットで共有済み。Mac の Obsidian へはまだ入れていない。フォルダ未接続のため)。
- スクショの原画(15MB)はクラウドの作業場所にだけあり、Mac の `~/Documents/PokerART/gtow_raw/` へはまだ入れていない(フォルダ未接続)。作業場所が消えると原画は失われる。数値は上のブランチにある。

## 決定事項
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
1. 取ったデータをアプリに適用する(オーナー指示。このチャットの担当)。
   - `claude/gtow-70bb-data` を取り込む。`packages/db/src/reviewGto.ts` の `openGtoActions` / `defenseGtoActions` と同じ形(GtoActionEV[])を返す関数を足し、今は「3bet-line」「reopened-line」で対象外のプリフロップ(`packages/db/src/review.ts` の `detectPreflopSpot`)をこのデータで判定する。スタックが 70bb 帯の局面だけに使う(他の帯は未取得)。
   - 注意:`packages/db/src/data/` が変わると、デプロイでサーバー入れ替えと解の投入の判定が走る(`deploy.yml` 95〜104行)。このデータは DB に入れずリポジトリの JSON のまま読む案。Supabase の転送量に注意(CLAUDE.md)。
   - JSON は計 880KB。web に載せるなら必要な場面だけ読む。
   - 自動の席の判断(`packages/server/src/botStrategy/`)にも使えるか後で検討。
2. 残りのデータ(別のチャット・Mac につないだもの。1日100場面まで):70bb の SB 対 BB と LJ 対 BB の残り → 30/20/14/10/7bb。手順は `scripts/gtow/README.md`。
3. Mac の `~/Documents` をチャットにつなぎ、原画と UI/UX のノート(Obsidian)を入れる。
4. 未回答の質問: ラフくんの吹き出しに「〇〇(SB)の手番」と書き、文中の「きみ」を相手の席名に置き換えるか / トーナメント履歴の RR レートの詳細表示を戻すか。
5. 実機確認(オーナー): v4.172 以降の解説・バッジの出方、履歴の収支の位置、飛んだ直後の卓。
6. ショーダウン順(packages/server/src/showdown.ts の showdownOrder)のテストを書く。
7. オーナーの To-Do(docs/TODO.md): Stripe のポータルでプラン切り替えを許可、GitHub リポジトリを非公開に。
