import { prisma } from "./client.js";

/**
 * GEOデータベース(GTO Wizard型レンジブラウザ)用の集計。
 * 実ユーザーのプリフロップ意思決定を169のハンドクラス(AA, AKs, AKo, ...)ごとに
 * 「レイズ/コール/フォールド」頻度へ集計する。
 */

const RANK_ORDER = "AKQJT98765432";

export type RangeScenario = "rfi" | "vsOpen";

export interface RangeCell {
  /** ハンドクラス表記(例: "AKs", "77", "T9o") */
  label: string;
  count: number;
  raise: number;
  call: number;
  fold: number;
}

export interface RangeMatrixResult {
  position: string;
  scenario: RangeScenario;
  /** 13x13(行=1枚目のランク、列=2枚目のランク。上三角=スーテッド、下三角=オフスート、対角=ペア) */
  cells: RangeCell[][];
  totalSamples: number;
}

const POSITION_NAMES = ["BTN", "SB", "BB", "UTG", "HJ", "CO"];

/** "10h" → "T", "Ah" → "A" のようにランク1文字へ正規化する。 */
function rankChar(card: string): string {
  const rank = card.slice(0, -1);
  return rank === "10" ? "T" : rank;
}

/** 2枚のホールカードから169分類のセル座標(row, col)を返す。row<=colがスーテッド側。 */
function classify(cards: string[]): { row: number; col: number } | null {
  if (cards.length !== 2) return null;
  const r1 = RANK_ORDER.indexOf(rankChar(cards[0]!));
  const r2 = RANK_ORDER.indexOf(rankChar(cards[1]!));
  if (r1 === -1 || r2 === -1) return null;
  const suited = cards[0]!.slice(-1) === cards[1]!.slice(-1);
  const hi = Math.min(r1, r2);
  const lo = Math.max(r1, r2);
  if (hi === lo) return { row: hi, col: lo }; // ペアは対角
  // 上三角(row < col) = スーテッド、下三角(row > col) = オフスート
  return suited ? { row: hi, col: lo } : { row: lo, col: hi };
}

export function cellLabel(row: number, col: number): string {
  const a = RANK_ORDER[Math.min(row, col)]!;
  const b = RANK_ORDER[Math.max(row, col)]!;
  if (row === col) return `${a}${a}`;
  return row < col ? `${a}${b}s` : `${a}${b}o`;
}

/**
 * 指定ポジション・シナリオのレンジマトリクスを実データから集計する。
 *  - rfi:    自分より前に誰もレイズ/リンプしていない状態での最初のアクション
 *  - vsOpen: 自分より前にちょうど1回レイズが入っている状態での最初のアクション
 */
export async function getRangeMatrix(position: string, scenario: RangeScenario): Promise<RangeMatrixResult> {
  const hands = await prisma.hand.findMany({
    where: { seats: { some: { user: { isBot: false } } } },
    select: {
      buttonFixedPos: true,
      tournament: { select: { seatCount: true } },
      seats: { select: { seatIndex: true, holeCards: true, user: { select: { isBot: true } } } },
      actions: {
        where: { street: "preflop" },
        orderBy: { sequenceNumber: "asc" },
        select: { seatIndex: true, kind: true },
      },
    },
  });

  const cells: RangeCell[][] = Array.from({ length: 13 }, (_, row) =>
    Array.from({ length: 13 }, (_, col) => ({ label: cellLabel(row, col), count: 0, raise: 0, call: 0, fold: 0 })),
  );
  let totalSamples = 0;

  for (const hand of hands) {
    const seatCount = hand.tournament.seatCount;
    const humanSeats = new Map(hand.seats.filter((s) => !s.user.isBot).map((s) => [s.seatIndex, s.holeCards]));

    let raisesSoFar = 0;
    let limpsSoFar = 0;
    const seenSeats = new Set<number>();

    for (const action of hand.actions) {
      if (action.kind === "postBlind" || action.kind === "postAnte") continue;
      const isFirstActionForSeat = !seenSeats.has(action.seatIndex);
      seenSeats.add(action.seatIndex);

      if (isFirstActionForSeat && humanSeats.has(action.seatIndex)) {
        const offset = (((action.seatIndex - hand.buttonFixedPos) % seatCount) + seatCount) % seatCount;
        const seatPosition = POSITION_NAMES[offset] ?? "";
        const inScenario =
          scenario === "rfi" ? raisesSoFar === 0 && limpsSoFar === 0 : raisesSoFar === 1;

        if (seatPosition === position && inScenario) {
          const coords = classify(humanSeats.get(action.seatIndex)!);
          if (coords) {
            const cell = cells[coords.row]![coords.col]!;
            cell.count++;
            totalSamples++;
            if (action.kind === "raise" || action.kind === "bet" || action.kind === "allIn") cell.raise++;
            else if (action.kind === "call") cell.call++;
            else if (action.kind === "fold" || action.kind === "check") cell.fold += action.kind === "fold" ? 1 : 0;
            // BBのチェック(RFI機会でタダ見)はfoldにもraiseにも数えず、countのみに含める
          }
        }
      }

      if (action.kind === "raise" || action.kind === "bet" || action.kind === "allIn") raisesSoFar++;
      else if (action.kind === "call") limpsSoFar++;
    }
  }

  return { position, scenario, cells, totalSamples };
}
