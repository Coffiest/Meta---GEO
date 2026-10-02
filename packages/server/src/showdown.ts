import type { HandEngine } from "@meta-geo/engine";

/**
 * ショーダウンで「公開義務があるプレイヤー」の席集合を返す。
 * TenFourのような全ハンド公開はせず、ルール上見せる義務のある手だけを公開する:
 *  - フォールドで決着したハンドは誰も公開しない
 *  - オールインでベッティングが閉じたショーダウンは残存者全員がテーブルアップ(標準ルール)
 *  - 通常のショーダウンは「リバーの最終アグレッサー(いなければボタン左の最初の残存者)」が
 *    先に公開し、ポットを獲得したプレイヤーも公開する。それ以外はマック
 */
export function computeRevealedSeats(hand: HandEngine): Set<number> {
  const result = hand.getResult();
  const revealed = new Set<number>();
  if (result.wonByFold) return revealed;

  const state = hand.getPublicState();
  const contenders = state.seats.filter((s) => s.status !== "folded");
  if (contenders.length < 2) return revealed;

  // 誰かがオールインしている(=それ以上のベッティングが無かった)ショーダウンは全員公開
  if (contenders.some((s) => s.status === "allIn")) {
    for (const s of contenders) revealed.add(s.seatIndex);
    return revealed;
  }

  // リバーの最終アグレッサー
  let firstShower: number | null = null;
  for (const e of hand.getEvents()) {
    if ((e.type === "bet" || e.type === "raise" || e.type === "allIn") && e["street"] === "river") {
      firstShower = e["seatIndex"] as number;
    }
  }
  // リバーにアグレッションが無ければ、ボタンの左隣から最初の残存者
  if (firstShower === null) {
    const seatCount = Math.max(...state.seats.map((s) => s.seatIndex)) + 1;
    for (let offset = 1; offset <= seatCount; offset++) {
      const seat = (state.buttonFixedPos + offset) % seatCount;
      if (contenders.some((s) => s.seatIndex === seat)) {
        firstShower = seat;
        break;
      }
    }
  }
  if (firstShower !== null) revealed.add(firstShower);

  // ポット獲得者は公開して初めてポットを獲得できる
  for (const [playerId, amount] of result.payouts) {
    if (amount <= 0) continue;
    const seat = contenders.find((s) => s.playerId === playerId);
    if (seat) revealed.add(seat.seatIndex);
  }

  return revealed;
}

/**
 * 保存済みのハンド記録から「公開された席」を求める。
 *
 * ライブ中の {@link computeRevealedSeats} と同じルールを、DBに残るアクション列だけから
 * 再現する。プレイ中のハンド履歴では、マックされた相手の手札をこれで伏せる
 * ―― 進行中のトーナメントで相手の非公開ハンドが読めてしまうのは不正の温床になるため。
 *
 * 判定材料がDBの記録に限られるぶん、迷ったら「公開しない」側へ倒してある
 * (伏せ過ぎは情報が減るだけだが、見せ過ぎは取り返しがつかない)。
 */
export function revealedSeatsFromRecord(rec: {
  buttonFixedPos: number;
  seats: { seatIndex: number; resultStackDelta: number }[];
  actions: { seatIndex: number; street: string; kind: string }[];
}): Set<number> {
  const revealed = new Set<number>();
  const folded = new Set(rec.actions.filter((a) => a.kind === "fold").map((a) => a.seatIndex));
  const contenders = rec.seats.filter((s) => !folded.has(s.seatIndex));
  // フォールドで決着したハンドは誰も公開しない。
  if (contenders.length < 2) return revealed;

  // オールインでベッティングが閉じたショーダウンは残存者全員がテーブルアップ(標準ルール)。
  if (rec.actions.some((a) => a.kind === "allIn" && !folded.has(a.seatIndex))) {
    for (const s of contenders) revealed.add(s.seatIndex);
    return revealed;
  }

  // 通常のショーダウン: リバーの最終アグレッサーが先に公開する。
  let firstShower: number | null = null;
  for (const a of rec.actions) {
    if (a.street === "river" && (a.kind === "bet" || a.kind === "raise" || a.kind === "allIn")) {
      firstShower = a.seatIndex;
    }
  }
  // リバーにアグレッションが無ければ、ボタンの左隣から最初の残存者。
  if (firstShower === null) {
    const seatCount = Math.max(...rec.seats.map((s) => s.seatIndex)) + 1;
    for (let offset = 1; offset <= seatCount; offset++) {
      const seat = (rec.buttonFixedPos + offset) % seatCount;
      if (contenders.some((s) => s.seatIndex === seat)) {
        firstShower = seat;
        break;
      }
    }
  }
  if (firstShower !== null) revealed.add(firstShower);

  // ポットを獲得したプレイヤーは公開して初めて獲得できる。
  for (const s of contenders) if (s.resultStackDelta > 0) revealed.add(s.seatIndex);

  return revealed;
}
