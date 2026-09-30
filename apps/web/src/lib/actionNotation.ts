/**
 * 棋譜解析で1手を短く書く表記(オーナー確定)。例: `UTG bet 33%` / `BB x/r 3x` / `CO ALL IN`。
 *
 * | 表記 | 意味 |
 * |---|---|
 * | `check` | チェック |
 * | `x/c` | 同じストリートでチェックした後にコール(チェックコール) |
 * | `x/r` | 同じストリートでチェックした後にレイズ(チェックレイズ) |
 * | `x/f` | 同じストリートでチェックした後にフォールド(チェックフォールド) |
 * | `call` / `fold` | コール / フォールド |
 * | `bet 33%` | ベット。サイズはポットに対する割合 |
 * | `Raise 2.5bb` | プリフロップのレイズ。サイズは到達額(bb) |
 * | `Raise 3x` | ポストフロップのレイズ。サイズは相手のベットの何倍か |
 * | `ALL IN` | オールイン |
 *
 * ポジションは棋譜解析の決定(`heroPos`)と同じ数え方(ボタンからの席のずれ)で出す。
 */

export interface NotationAction {
  sequenceNumber: number;
  seatIndex: number;
  street: string;
  kind: string;
  /** 現ストリートの累計拠出(=そのアクション後の「〜まで」)。 */
  toAmount: number | null;
  potBefore: number;
}

/** サーバーの `reviewExtract.ts` と同じ並び(ボタンからのずれ 0..5)。 */
const POSITION_NAMES = ["BTN", "SB", "BB", "UTG", "HJ", "CO"] as const;
const SEAT_COUNT = POSITION_NAMES.length;

export function positionOfSeat(seatIndex: number, buttonFixedPos: number): string {
  const offset = (((seatIndex - buttonFixedPos) % SEAT_COUNT) + SEAT_COUNT) % SEAT_COUNT;
  return POSITION_NAMES[offset] ?? "";
}

/** 小数1桁まで。整数なら小数点を出さない(2.0 → "2", 2.5 → "2.5")。 */
function short(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/**
 * その手の表記(ポジションを除いた部分)。
 *
 * @param actions ハンドの全アクション(タイムライン)
 * @param sequenceNumber 表記したい手
 * @param bigBlind そのハンドのBB額(プリフロップのレイズを bb で書くため)
 */
export function actionNotation(actions: readonly NotationAction[], sequenceNumber: number, bigBlind: number): string {
  const idx = actions.findIndex((a) => a.sequenceNumber === sequenceNumber);
  const a = actions[idx];
  if (!a) return "";

  // 同じストリートで、この手より前に本人がチェックしていたか。現ストリートの拠出も数える。
  let checkedBefore = false;
  const contribution = new Map<number, number>();
  let lastBetTo = 0; // 現ストリートでいま立っている額(レイズの倍率の分母)
  for (let i = 0; i < idx; i++) {
    const p = actions[i]!;
    if (p.street !== a.street) continue;
    if (p.seatIndex === a.seatIndex && p.kind === "check") checkedBefore = true;
    if (p.toAmount !== null) {
      contribution.set(p.seatIndex, p.toAmount);
      if (p.kind !== "postAnte") lastBetTo = Math.max(lastBetTo, p.toAmount);
    }
  }

  const preflop = a.street === "preflop";
  switch (a.kind) {
    case "check":
      return "check";
    case "fold":
      return checkedBefore ? "x/f" : "fold";
    case "call":
      return checkedBefore ? "x/c" : "call";
    case "allIn":
      return checkedBefore ? "x/r ALL IN" : "ALL IN";
    case "bet": {
      if (preflop) return a.toAmount !== null && bigBlind > 0 ? `Raise ${short(a.toAmount / bigBlind)}bb` : "Raise";
      const prior = contribution.get(a.seatIndex) ?? 0;
      const amount = a.toAmount !== null ? a.toAmount - prior : null;
      if (amount === null || a.potBefore <= 0) return "bet";
      return `bet ${Math.round((amount / a.potBefore) * 100)}%`;
    }
    case "raise": {
      const head = checkedBefore ? "x/r" : "Raise";
      if (a.toAmount === null) return head;
      if (preflop) return bigBlind > 0 ? `${head} ${short(a.toAmount / bigBlind)}bb` : head;
      return lastBetTo > 0 ? `${head} ${short(a.toAmount / lastBetTo)}x` : head;
    }
    default:
      return a.kind;
  }
}

/** ポジションつきの表記(例 `UTG bet 33%`)。 */
export function actionLabel(
  actions: readonly NotationAction[],
  sequenceNumber: number,
  table: { buttonFixedPos: number; bigBlind: number }
): string {
  const a = actions.find((x) => x.sequenceNumber === sequenceNumber);
  if (!a) return "";
  return `${positionOfSeat(a.seatIndex, table.buttonFixedPos)} ${actionNotation(actions, sequenceNumber, table.bigBlind)}`;
}

/** 棋譜解析・ハンド履歴でのストリート名(オーナー確定: 英語表記)。 */
export const STREET_EN: Record<string, string> = {
  preflop: "Preflop",
  flop: "Flop",
  turn: "Turn",
  river: "River",
  showdown: "Showdown",
};

/** 表記の下に出す情報(例 `Flop · ES 40BB · Pot 6.5BB`)。ES = エフェクティブスタック。 */
export function decisionInfo(street: string, effStackBb: number, potBb: number): string {
  return `${STREET_EN[street] ?? street} · ES ${effStackBb.toFixed(0)}BB · Pot ${potBb.toFixed(1)}BB`;
}
