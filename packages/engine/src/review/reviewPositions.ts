import { computePositionLabels } from "../positionLabels.js";

/**
 * 棋譜解析のポジション。
 *
 * 以前はボタンからの席のずれ(BTN/SB/BB/UTG/HJ/CO の固定順)で名前を付けていたが、空席(飛んだ人・
 * デッドボタン/デッドSB)があると実際の位置とずれた(オーナー指摘: UTG のアクションが「HJ Raise」と出ていた)。
 * 実際のブラインドの席から数える。
 *
 *  - `display`: 画面に出す名前。卓の表示(`computePositionLabels`)と同じ。5人なら UTG/CO、ヘッズアップは BTN(SB)/BB。
 *  - `strategy`: GTO の表・解説の条件に使う名前(6-max の表の言葉)。ボタンから数えて何人目か
 *    (BTN / CO / HJ / UTG)で決める。5人のときの最初の人は、後ろに3人いるので HJ の表で見る。
 *    ヘッズアップのボタンはブラインド同士の SB と同じ立場なので SB。
 *
 * ブラインドの席は記録の postBlind から読む(先に出した方が SB、後が BB。1回だけならデッドSB で BB)。
 */
export interface ReviewPositionAction {
  seatIndex: number;
  street: string;
  kind: string;
}

export interface ReviewPositions {
  display: Map<number, string>;
  strategy: Map<number, string>;
}

const STRATEGY_FROM_BUTTON = ["BTN", "CO", "HJ", "UTG"] as const;

export function blindSeatsFromActions(actions: readonly ReviewPositionAction[]): { smallBlind: number | null; bigBlind: number | null } {
  const posts = actions.filter((a) => a.street === "preflop" && a.kind === "postBlind").map((a) => a.seatIndex);
  if (posts.length >= 2) return { smallBlind: posts[0]!, bigBlind: posts[1]! };
  if (posts.length === 1) return { smallBlind: null, bigBlind: posts[0]! };
  return { smallBlind: null, bigBlind: null };
}

export function reviewPositions(params: {
  seatIndexes: readonly number[];
  buttonFixedPos: number;
  seatCount: number;
  actions: readonly ReviewPositionAction[];
}): ReviewPositions {
  const { seatIndexes, buttonFixedPos, seatCount, actions } = params;
  const { smallBlind, bigBlind: bb } = blindSeatsFromActions(actions);
  // 記録にブラインドが無い古いハンドは、ボタンの2つ次を BB とみなす(以前の数え方)。
  const bigBlind = bb ?? (buttonFixedPos + 2) % seatCount;
  const sb = bb === null ? (buttonFixedPos + 1) % seatCount : smallBlind;

  const display = computePositionLabels({ seatIndexes, buttonFixedPos, smallBlindSeat: sb, bigBlindSeat: bigBlind, seatCount });

  const strategy = new Map<number, string>();
  const occupied = new Set(seatIndexes);
  if (seatIndexes.length === 2) {
    for (const s of seatIndexes) strategy.set(s, s === bigBlind ? "BB" : "SB");
    return { display, strategy };
  }
  strategy.set(bigBlind, "BB");
  if (sb !== null && occupied.has(sb)) strategy.set(sb, "SB");
  // BB の次からボタンまで(ボタンを含む)、着席している人を時計回りに並べ、後ろから BTN / CO / HJ / UTG。
  const order: number[] = [];
  for (let step = 1; step <= seatCount; step++) {
    const pos = (bigBlind + step) % seatCount;
    if (occupied.has(pos) && !strategy.has(pos)) order.push(pos);
    if (pos === buttonFixedPos) break;
  }
  order.reverse().forEach((pos, i) => strategy.set(pos, STRATEGY_FROM_BUTTON[i] ?? "UTG"));
  for (const s of seatIndexes) if (!display.has(s)) display.set(s, strategy.get(s) ?? "");
  return { display, strategy };
}
