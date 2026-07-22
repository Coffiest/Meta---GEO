/**
 * テーブル表示用のポジション名計算。
 *
 * ポジション名は「固定席のオフセット」ではなく、実際のブラインド位置から決める:
 * - BB席は常に "BB"、SB席(SBデッドでなければ)は常に "SB"、ボタン席(空ボタンでなければ)は "BTN"。
 * - BBの左隣(時計回りで次)の、ブラインドを払わず最初にアクションするプレイヤーが "UTG"。
 * - ボタンの右隣が "CO"、その右が "HJ"。中間の人数に応じて UTG と CO/HJ の間を埋める。
 * - ヘッズアップ(2人)はボタンがSBを兼ねるため "BTN(SB)" と "BB"。
 *
 * デッドボタン(空ボタン)のハンドでは誰も "BTN" を持たず、SBデッドのハンドでは誰も "SB" を
 * 持たない(docs/POKER_RULES.md 4章のデッドボタン方式に対応する表示)。
 */

/** 中間ポジション(UTG〜CO)の人数ごとの名前テーブル。時計回り(UTG側)から並べる。 */
const MIDDLE_NAMES: Record<number, string[]> = {
  1: ["UTG"],
  2: ["UTG", "CO"],
  3: ["UTG", "HJ", "CO"],
  4: ["UTG", "UTG1", "HJ", "CO"],
  5: ["UTG", "UTG1", "UTG2", "HJ", "CO"],
  6: ["UTG", "UTG1", "UTG2", "LJ", "HJ", "CO"],
};

export function computePositionLabels(params: {
  /** このハンドに参加している席(固定席番号)。 */
  readonly seatIndexes: readonly number[];
  readonly buttonFixedPos: number;
  /** SBデッドのハンドは null。 */
  readonly smallBlindSeat: number | null;
  readonly bigBlindSeat: number;
  readonly seatCount: number;
}): Map<number, string> {
  const { seatIndexes, buttonFixedPos, smallBlindSeat, bigBlindSeat, seatCount } = params;
  const labels = new Map<number, string>();
  const occupied = new Set(seatIndexes);

  if (seatIndexes.length === 2) {
    // ヘッズアップ: ボタンがSBを兼ねる。
    for (const idx of seatIndexes) {
      labels.set(idx, idx === bigBlindSeat ? "BB" : "BTN(SB)");
    }
    return labels;
  }

  labels.set(bigBlindSeat, "BB");
  if (smallBlindSeat !== null && occupied.has(smallBlindSeat)) labels.set(smallBlindSeat, "SB");
  if (occupied.has(buttonFixedPos)) labels.set(buttonFixedPos, "BTN");

  // BBの左隣(時計回りで次)からボタン位置の手前まで歩き、未ラベルの着席者を中間ポジションとして集める。
  const middles: number[] = [];
  for (let step = 1; step <= seatCount; step++) {
    const pos = (bigBlindSeat + step) % seatCount;
    if (pos === buttonFixedPos) break;
    if (occupied.has(pos) && !labels.has(pos)) middles.push(pos);
  }

  const names = MIDDLE_NAMES[middles.length] ?? MIDDLE_NAMES[6]!;
  middles.forEach((pos, i) => {
    labels.set(pos, names[i] ?? "");
  });

  return labels;
}
