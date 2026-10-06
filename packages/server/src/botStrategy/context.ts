import {
  normalizeCallLikeAggression,
  reviewPositions,
  type Card,
  type HandEngine,
  type Street,
} from "@meta-geo/engine";

/**
 * 自動の席の意思決定に渡す「その時点の卓の様子」。HandEngine の公開状態とイベント履歴から作る。
 * ペイロードには何も足さない(サーバーの内部だけで使う)。席の持ち主によって作り方は変わらない。
 */
export interface BotSeat {
  seatIndex: number;
  stack: number;
  status: "active" | "folded" | "allIn";
  streetContribution: number;
  handContribution: number;
  /** ハンド開始時のスタック(= 残り + 拠出)。 */
  startStack: number;
}

export interface BotAction {
  seatIndex: number;
  street: string;
  /** 正規化後の種類(額を上げていない攻撃的な手はコール)。 */
  kind: string;
  toAmount: number | null;
}

export interface BotContext {
  seatIndex: number;
  street: Street;
  hole: readonly [Card, Card];
  board: readonly Card[];
  bb: number;
  seats: BotSeat[];
  /** ブラインド・アンティ以外の、このハンドの手(正規化済み・発生順)。 */
  actions: BotAction[];
  /** 6-max の表の言葉のポジション(UTG/HJ/CO/BTN/SB/BB)。 */
  positions: Map<number, string>;
  heroPos: string;
  /** 卓の全体のポット(現ストリートの拠出を含む)。 */
  pot: number;
  toCall: number;
  currentBetToMatch: number;
  minRaiseTo: number;
  /** このストリートで出せる最大(= 自分の現ストリート拠出 + 残り)。 */
  maxTo: number;
  canRaise: boolean;
  hero: BotSeat;
  /** 生きている相手(降りていない)。 */
  opponents: BotSeat[];
  /** 有効スタック(bb)= 自分の開始スタックと、生きている相手の最大の開始スタックの小さい方。 */
  effStackBb: number;
}

/** カードのランク(2〜14)→ 表の文字。 */
const RANK_CHAR: Record<number, string> = {
  14: "A",
  13: "K",
  12: "Q",
  11: "J",
  10: "T",
  9: "9",
  8: "8",
  7: "7",
  6: "6",
  5: "5",
  4: "4",
  3: "3",
  2: "2",
};

/** 2枚 → "AKs" / "T9o" / "77"。 */
export function handClassOf(hole: readonly [Card, Card]): string {
  const [a, b] = hole[0].rank >= hole[1].rank ? [hole[0], hole[1]] : [hole[1], hole[0]];
  if (a.rank === b.rank) return `${RANK_CHAR[a.rank]}${RANK_CHAR[b.rank]}`;
  return `${RANK_CHAR[a.rank]}${RANK_CHAR[b.rank]}${a.suit === b.suit ? "s" : "o"}`;
}

const SKIP_KINDS = new Set(["postBlind", "postAnte", "deadSmallBlind", "dealStreet", "handComplete"]);

/**
 * @param canRaise TDA Rule 47: 不完全レイズのあと、既に行動した席は再オープンされない(呼び出し側が判定して渡す)。
 */
export function buildBotContext(hand: HandEngine, seatIndex: number, seatCount: number, canRaise: boolean): BotContext | null {
  const state = hand.getPublicState();
  const hole = hand.getSeatHoleCards(seatIndex);
  if (hole.length !== 2) return null;
  const seats: BotSeat[] = state.seats.map((s) => ({
    seatIndex: s.seatIndex,
    stack: s.stack,
    status: s.status,
    streetContribution: s.streetContribution,
    handContribution: s.handContribution,
    startStack: s.stack + s.handContribution,
  }));
  const hero = seats.find((s) => s.seatIndex === seatIndex);
  if (!hero) return null;

  const events = hand.getEvents() as readonly { type?: string; seatIndex?: number; street?: string; toAmount?: number }[];
  const raw = events
    .filter((e) => typeof e.type === "string" && typeof e.seatIndex === "number" && typeof e.street === "string")
    .map((e) => ({ seatIndex: e.seatIndex!, street: e.street!, kind: e.type!, toAmount: typeof e.toAmount === "number" ? e.toAmount : null }));
  const normalized = normalizeCallLikeAggression(raw);
  const actions = normalized.filter((a) => !SKIP_KINDS.has(a.kind));

  const { strategy } = reviewPositions({
    seatIndexes: seats.map((s) => s.seatIndex),
    buttonFixedPos: state.buttonFixedPos,
    seatCount,
    actions: raw,
  });
  const heroPos = strategy.get(seatIndex) ?? "BTN";
  const opponents = seats.filter((s) => s.seatIndex !== seatIndex && s.status !== "folded");
  const maxOpp = opponents.reduce((m, s) => Math.max(m, s.startStack), 0);
  const bb = state.bigBlind;
  const toCall = Math.max(0, state.currentBetToMatch - hero.streetContribution);
  return {
    seatIndex,
    street: state.street,
    hole: hole as unknown as readonly [Card, Card],
    board: state.board,
    bb,
    seats,
    actions,
    positions: strategy,
    heroPos,
    pot: state.potTotal,
    toCall,
    currentBetToMatch: state.currentBetToMatch,
    minRaiseTo: hand.getMinRaiseToAmount(),
    maxTo: hero.streetContribution + hero.stack,
    canRaise,
    hero,
    opponents,
    effStackBb: bb > 0 ? Math.min(hero.startStack, maxOpp || hero.startStack) / bb : 0,
  };
}
