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
