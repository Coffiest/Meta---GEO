/** 着席人数ごとの、ボタンからのオフセット順ポジション名テーブル(0番目 = BTN自身)。 */
const POSITION_TABLES: Record<number, string[]> = {
  2: ["BTN", "BB"],
  3: ["BTN", "SB", "BB"],
  4: ["BTN", "SB", "BB", "CO"],
  5: ["BTN", "SB", "BB", "UTG", "CO"],
  6: ["BTN", "SB", "BB", "UTG", "HJ", "CO"],
  7: ["BTN", "SB", "BB", "UTG", "UTG1", "HJ", "CO"],
  8: ["BTN", "SB", "BB", "UTG", "UTG1", "UTG2", "HJ", "CO"],
  9: ["BTN", "SB", "BB", "UTG", "UTG1", "UTG2", "LJ", "HJ", "CO"],
};

/** ボタン位置からの相対オフセットで、指定シートのポジション名(BTN/SB/BB/UTG/HJ/CO等)を返す。 */
export function positionLabel(seatIndex: number, buttonFixedPos: number, seatCount: number): string {
  const table = POSITION_TABLES[seatCount] ?? POSITION_TABLES[6]!;
  const offset = (seatIndex - buttonFixedPos + seatCount) % seatCount;
  return table[offset] ?? "";
}
