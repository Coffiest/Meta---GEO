# 引き継ぎ: フレンド対戦(プライベートテーブル)

2026-10-16 時点(本番 **v1.12.0**、Deploy run 422 で Fly.io・Vercel とも success)。
オーナーと質問攻め(/grill-me)で仕様を詰めて、段階ごとに出荷した。**機能としては完成・ホームに公開済み。**
決まりの要点は CLAUDE.md の「フレンド対戦(プライベートテーブル。オーナー確定 2026-10-16)」。ここはその裏の事情と、残っていること。

## オーナーが決めた仕様(Q&A の答え)

| 項目 | 決定 |
|---|---|
| 入口 | ホームの「Friend Match」(Play / High Roller と同じ `line-fill-btn`)→ 下から出るシートで「ルームを作成」/「ルームに入室」 |
| 参加できる人 | ログインしていれば誰でも。参加費・賞金なし |
| コード | 数字6桁。待合では下のバーの右上(画面の右下)にコードとコピー |
| 最大人数 | 2〜6 |
| ブラインド | ターボ 3分・20,000 / ノーマル 5分・20,000 / ディープロング 10分・40,000(表は SNG と同じ) |
| レイトイン | オン/オフ、レベル1〜10まで(既定6)。次のハンドから、空席にランダム、**TDA Rule 8 どおり**(下記) |
| リエントリー | オン/オフ、1〜5回か無制限。締切はレイトインと同じ |
| 空席を自動で埋める | ホストが席の数を決める(種別は一切出さない) |
| チャット・タイムバンク | ホストが選ぶ |
| ホスト | 2人以上でスタート。参加者を外す・設定変更・解散。抜けたら次に入った人が引き継ぐ |
| 切断 | 待合では60秒は席とホストを保つ。スタートされないルームは30分で消える |
| 席とボタン | スタート時に暗号学的な乱数(`cryptoRandom`) |
| 終わった後 | 全員に順位表。ホストが「もう一度」(同じコードの待合)か「解散」。他の人は待つ |
| 観戦 | 席の無い人・飛んだ人は観戦できる。**手札が見えるのは、もう座る見込みが無い人だけ**(リエントリー・レイトインできる間は伏せる) |
| 最後の1人 | リエントリーできる人がいれば15秒待つ。来なければ・全員断れば優勝 |
| 記録 | レート・偏差値・ランキング・スタッツ・グラフ・GEO の解放条件・無料体験・招待に**数えない**。ハンドは GEO の DB に区別せず入り、履歴・棋譜解析には「Friend Match」 |

TDA の途中着席(オーナー指示「調べて正しく実装」): ボタン〜SB の間(デッドボタン・デッド SB を含む)に入る人は1回休み、次の BB の位置なら BB イン、SB からは入れない、待っている人はボタン・ブラインドの計算から外す(流れを変えない)。ヘッズアップから3人になるときも同じ規則で回す。

## コードの置き場所

| 場所 | 中身 |
|---|---|
| `packages/engine/src/tournament.ts` | `random` の差し込み、`addPlayer` / `getWaitingSeats` / `planNextHand`(TDA)/ `randomFirstBlinds`。テスト `test/tournamentLateSeating.test.ts` |
| `packages/server/src/privateRoom.ts` | ルーム(`PrivateRoomManager`、socket の `privateCreate/Join/Resume/Leave/Kick/Settings/Start/Rematch/Disband`、`privateRoom` / `privateRoomClosed` を送る)。設定の丸めは `normalizePrivateSettings`。テスト `test/privateRoom.test.ts` |
| `packages/server/src/gameServer.ts` | `TableSession` の private モード(`requestSeat` / `addSpectator` / `sendSpectatorCards` / `waitForReentry` / `couldStillSit` など)、`cryptoRandom`。テスト `test/cryptoRandom.test.ts` |
| `packages/server/src/lobby.ts` | マネージャーの生成、SNG/MTT 中は作れない(`BUSY`) |
| `packages/db/src/rankedGame.ts` | `RANKED_TOURNAMENT`(`gameType <> "private"`)。**成績を集計するクエリを足すときは必ずこれを足す** |
| `apps/web/src/lib/privateRoom.ts` | 画面側の型・既定値・コードの記憶(localStorage `privateRoomCode`、再読み込みで戻る) |
| `apps/web/src/lib/socket.ts` | `privateIntent`、`privateActions`、観戦の手札・リエントリー待ちの状態 |
| `apps/web/src/components/friend/` | `FriendMatch.tsx`(ボタン・シート・設定フォーム)、`PrivateLobby.tsx`(待合のバー・参加者/設定のシート・観戦のバー・リエントリーの確認・飛んだ後/順位表のシート) |
| `apps/web/src/app/page.tsx` | 卓の画面への組み込み(待合は `PokerTable` の `waitingRoom` で状態なしに座らせる) |

## 出荷の途中で直した不具合(SNG にも効いている)

- 飛んだ人が画面を開いたままだと、次のハンドの手札を送ろうとして例外(`Unknown seat`)になり卓が止まった → 配られていない席には送らない(v1.11.3)。
- `crypto.randomInt` の範囲は 2^48 未満でないと例外 → 2^47(v1.11.3)。
- 観戦の手札は `getAllHoleCards` ではなく席ごとの `getSeatHoleCards`(前者はハンドが終わるまで使えない)。

## デプロイで起きたこと

- run 421(v1.11.8)が「Deploy to Fly.io」で約42分止まった。ログでは Fly のリモートビルダーの `pnpm install` で、corepack が pnpm-10.33.0 をダウンロードするところから進んでいない(Fly 側の通信の一時的な詰まり。コードの問題ではない)。取り消して run 422 で通った(入れ替えは1分20秒)。
- `deploy.yml` の deploy-server に **`timeout-minutes` が無い**ので、また詰まると延々と待つ。上限(例: 20分)を足すかは未着手・オーナー未相談。足すなら wait-for-quiet の上限(25分+5分)と別の段なので干渉しない。

## 残っていること

1. **実機での確認がまだ。** 手元の Postgres+サーバー+socket.io-client のスクリプトで、作成・入室・スタート・レイトイン・リエントリー・15秒待ち・断る・観戦の手札・もう一度・解散まで通したが、ログインした実機の画面ではオーナーも試していない。2台で一度通してもらい、感想をもらう。
2. 卓の途中保存は無いので、サーバーの入れ替え・クラッシュでフレンド対戦の卓も消える(SNG と同じ。CLAUDE.md の deploy の項)。
3. 将来の候補(オーナー未依頼): ルームのコードを共有するリンク(`?room=123456`)、観戦人数の表示。

## 手元での確認のしかた

- サーバーのテスト: `pnpm --filter @meta-geo/server test`(privateRoom / cryptoRandom)。エンジン: `pnpm --filter @meta-geo/engine test`。
- DB のテストは空の DB が要る(`DATABASE_URL` を新しく作った `metageo_test` に向けて `prisma migrate deploy` してから)。
- 通しの確認は、手元で Postgres とサーバーを立て、socket.io-client で2〜3人分つないで `privateCreate` → `privateJoin` → `privateStart` を送る小さなスクリプトで行った(スクリプトは作業用の一時フォルダに置いていて、リポジトリには無い)。
- 画面は仮のページ(`apps/web/src/app/dev-friend/page.tsx` など)で描いて Playwright で撮った。**仮のページはコミットしない。**
