import {
  HAND_CATEGORY,
  compareHandRank,
  createOrderedDeck,
  evaluateBest,
  type Card,
  type PlayerAction,
} from "@meta-geo/engine";
import { EV_LABELS } from "@meta-geo/db";
import type { BotAction, BotContext } from "./context.js";
import { callVsOpenRange, openRange, percentileRange, type Range169 } from "./ranges.js";

/**
 * ポストフロップの意思決定。
 *
 * - 勝率はランダムな手ではなく**相手のレンジ**に対して見る。相手のプリフロップの手からレンジ(169マスの重み)を作り、
 *   ポストフロップでベット・レイズしてきた回数に応じて、強い役とドローに重みを寄せる(棄却サンプリング)。
 * - プリフロップのレイザーが先に打てるとき: C ベット(ヘッズアップの SRP で合計 55〜70%)。ボードと手の強さで頻度とサイズを決める。
 * - ターン・リバー: 前のストリートで打っていればバレル。バリューとドロー・スケアカードのブラフ。サイズはジオメトリックに寄せる。
 * - レイザーでない側は、レイザーより先にベットしない(ドンクしない)。例外はターンで 9 以下のカードがペアになったときの小さいドンクだけ。
 * - ベットに直面したら、必要な勝率と比べる。降りすぎないよう、ポットに対して小さいベットにはショーダウンバリューのある手で守る。
 */

const RANK_CHAR = "23456789TJQKA";
const SUITS = ["spades", "hearts", "diamonds", "clubs"] as const;

function cardKey(c: Card): string {
  return `${c.rank}${c.suit[0]}`;
}

/** 169 マスのラベル → 具体的な2枚の候補(使われているカードを除く)。 */
function combosOfLabel(label: string, dead: Set<string>): [Card, Card][] {
  const r1 = RANK_CHAR.indexOf(label[0]!) + 2;
  const r2 = RANK_CHAR.indexOf(label[1]!) + 2;
  const out: [Card, Card][] = [];
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      if (label.length === 2 && j <= i) continue;
      if (label.endsWith("s") && i !== j) continue;
      if (label.endsWith("o") && i === j) continue;
      const a = { rank: r1, suit: SUITS[i]! } as Card;
      const b = { rank: r2, suit: SUITS[j]! } as Card;
      if (dead.has(cardKey(a)) || dead.has(cardKey(b))) continue;
      out.push([a, b]);
    }
  }
  return out;
}

/** 相手1人のプリフロップのレンジ(169の重み)を、その人のプリフロップの手から見積もる。 */
function preflopRangeOf(ctx: BotContext, seatIndex: number): Range169 {
  const pre = ctx.actions.filter((a) => a.street === "preflop");
  const aggressive = pre.filter((a) => a.kind === "bet" || a.kind === "raise" || a.kind === "allIn");
  const mine = pre.filter((a) => a.seatIndex === seatIndex);
  const pos = ctx.positions.get(seatIndex) ?? "CO";
  const raisedTimes = mine.filter((a) => a.kind === "raise" || a.kind === "bet" || a.kind === "allIn").length;
  if (raisedTimes >= 2) return percentileRange(0, 0.04);
  if (raisedTimes === 1) {
    const myRaise = mine.find((a) => a.kind === "raise" || a.kind === "bet" || a.kind === "allIn")!;
    const order = aggressive.indexOf(myRaise);
    if (order === 0) return openRange(pos, ctx.effStackBb);
    return percentileRange(0, order === 1 ? 0.1 : 0.05);
  }
  // コールだけ。
  if (aggressive.length === 0) return percentileRange(0.05, pos === "BB" ? 1 : 0.6); // リンプポット
  const opener = aggressive[0]!;
  if (aggressive.length === 1) return callVsOpenRange(ctx.positions.get(opener.seatIndex) ?? "CO", pos, ctx.effStackBb);
  return percentileRange(0.03, 0.18); // 3ベット以上へのコール
}

/** ポストフロップでこの相手がベット・レイズした回数。 */
function postflopAggression(actions: readonly BotAction[], seatIndex: number): number {
  return actions.filter((a) => a.street !== "preflop" && a.seatIndex === seatIndex && (a.kind === "bet" || a.kind === "raise" || a.kind === "allIn"))
    .length;
}

interface Villain {
  weights: { label: string; w: number }[];
  total: number;
  aggression: number;
}

function sampleFromVillain(v: Villain, dead: Set<string>, board: readonly Card[], rand: () => number): [Card, Card] | null {
  for (let tries = 0; tries < 30; tries++) {
    let r = rand() * v.total;
    let label = v.weights[v.weights.length - 1]!.label;
    for (const x of v.weights) {
      r -= x.w;
      if (r <= 0) {
        label = x.label;
        break;
      }
    }
    const combos = combosOfLabel(label, dead);
    if (combos.length === 0) continue;
    const pick = combos[Math.floor(rand() * combos.length)]!;
    // ベット・レイズしてきた相手は、役やドローのある手に寄せる(エアーは一部だけ残す = ブラフ)。
    if (v.aggression > 0 && board.length >= 3) {
      const cat = evaluateBest([...pick, ...board]).category;
      if (cat < HAND_CATEGORY.onePair && !hasDraw(pick, board)) {
        if (rand() > Math.pow(0.4, v.aggression)) continue;
      }
    }
    return pick;
  }
  return null;
}

function hasDraw(hole: readonly Card[], board: readonly Card[]): boolean {
  if (board.length >= 5) return false;
  const all = [...hole, ...board];
  const suits: Record<string, number> = {};
  for (const c of all) suits[c.suit] = (suits[c.suit] ?? 0) + 1;
  if (Object.values(suits).some((n) => n === 4)) return true;
  const ranks = new Set<number>(all.map((c) => c.rank));
  if (ranks.has(14)) ranks.add(1);
  for (let lo = 1; lo <= 10; lo++) {
    let n = 0;
    for (let k = 0; k < 5; k++) if (ranks.has(lo + k)) n++;
    if (n >= 4) return true;
  }
  return false;
}

/** 相手のレンジに対する勝率(モンテカルロ)。 */
export function rangeEquity(ctx: BotContext, rand: () => number, samples = 320): number {
  const villains: Villain[] = ctx.opponents.map((o) => {
    const range = preflopRangeOf(ctx, o.seatIndex);
    const weights = EV_LABELS.map((label, i) => ({ label, w: range[i]! * (label.length === 2 ? 6 : label.endsWith("s") ? 4 : 12) })).filter(
      (x) => x.w > 0,
    );
    return { weights, total: weights.reduce((s, x) => s + x.w, 0), aggression: postflopAggression(ctx.actions, o.seatIndex) };
  });
  if (villains.length === 0 || villains.some((v) => v.total <= 0)) return 0.5;
  const known = [...ctx.hole, ...ctx.board];
  const n = Math.max(120, Math.floor(samples / Math.max(1, villains.length)));
  let share = 0;
  let done = 0;
  for (let s = 0; s < n; s++) {
    const dead = new Set(known.map(cardKey));
    const hands: [Card, Card][] = [];
    let ok = true;
    for (const v of villains) {
      const pick = sampleFromVillain(v, dead, ctx.board, rand);
      if (!pick) {
        ok = false;
        break;
      }
      dead.add(cardKey(pick[0]));
      dead.add(cardKey(pick[1]));
      hands.push(pick);
    }
    if (!ok) continue;
    const deck = createOrderedDeck().filter((c) => !dead.has(cardKey(c)));
    const runout = [...ctx.board];
    while (runout.length < 5) {
      const i = Math.floor(rand() * deck.length);
      runout.push(deck[i]!);
      deck.splice(i, 1);
    }
    const mine = evaluateBest([...ctx.hole, ...runout]);
    let winners = 1;
    let lost = false;
    for (const hh of hands) {
      const cmp = compareHandRank(mine, evaluateBest([...hh, ...runout]));
      if (cmp < 0) {
        lost = true;
        break;
      }
      if (cmp === 0) winners++;
    }
    if (!lost) share += 1 / winners;
    done++;
  }
  return done > 0 ? share / done : 0.5;
}

interface Made {
  cat: number;
  strong: boolean; // ツーペア以上
  overpair: boolean;
  topPair: boolean;
  goodKicker: boolean;
  pair: boolean;
}

function madeOf(hole: readonly [Card, Card], board: readonly Card[]): Made {
  const cat = evaluateBest([...hole, ...board]).category;
  const top = Math.max(...board.map((c) => c.rank));
  const pocket = hole[0].rank === hole[1].rank;
  const overpair = pocket && cat === HAND_CATEGORY.onePair && hole[0].rank > top;
  const topPair = cat === HAND_CATEGORY.onePair && hole.some((c) => c.rank === top);
  const kicker = topPair ? Math.max(...hole.filter((c) => c.rank !== top).map((c) => c.rank), 0) : 0;
  return {
    cat,
    strong: cat >= HAND_CATEGORY.twoPair,
    overpair,
    topPair,
    goodKicker: topPair && kicker >= 11,
    pair: cat >= HAND_CATEGORY.onePair,
  };
}

/** プリフロップの最後のレイザー。 */
function preflopAggressor(actions: readonly BotAction[]): number | null {
  let seat: number | null = null;
  for (const a of actions) if (a.street === "preflop" && (a.kind === "raise" || a.kind === "bet" || a.kind === "allIn")) seat = a.seatIndex;
  return seat;
}

/** そのストリートで最後にベット・レイズした席。 */
function lastAggressorOn(actions: readonly BotAction[], street: string): number | null {
  let seat: number | null = null;
  for (const a of actions) if (a.street === street && (a.kind === "raise" || a.kind === "bet" || a.kind === "allIn")) seat = a.seatIndex;
  return seat;
}

const PREV: Record<string, string> = { flop: "preflop", turn: "flop", river: "turn" };

/** ポットの割合でベットの toAmount。残りが少なければオールイン。 */
function betFraction(ctx: BotContext, f: number): PlayerAction {
  if (!ctx.canRaise || ctx.minRaiseTo > ctx.maxTo) return { kind: "check" };
  const amount = Math.max(ctx.bb, Math.round(ctx.pot * f));
  const to = Math.max(ctx.minRaiseTo, ctx.hero.streetContribution + amount);
  if (to >= ctx.maxTo) return { kind: "allIn" };
  const left = ctx.maxTo - to;
  if (left <= (ctx.pot + 2 * amount) * 0.35) return { kind: "allIn" };
  return { kind: "bet", toAmount: to };
}

/** 残りストリートでポットを等比で大きくして、リバーでちょうどオールインになるサイズ(ポット比)。 */
function geometric(ctx: BotContext): number {
  const n = ctx.street === "flop" ? 3 : ctx.street === "turn" ? 2 : 1;
  const behind = Math.min(ctx.hero.stack, Math.max(...ctx.opponents.map((o) => o.stack), 0));
  if (ctx.pot <= 0 || behind <= 0) return 0.66;
  const f = (Math.pow((2 * behind + ctx.pot) / ctx.pot, 1 / n) - 1) / 2;
  return Math.max(0.3, Math.min(1.25, f));
}

function boardInfo(board: readonly Card[]) {
  const ranks = board.map((c) => c.rank).sort((a, b) => b - a);
  const suits: Record<string, number> = {};
  for (const c of board) suits[c.suit] = (suits[c.suit] ?? 0) + 1;
  const maxSuit = Math.max(...Object.values(suits));
  const paired = new Set(ranks).size < ranks.length;
  const high = ranks[0] ?? 0;
  const span = ranks.length >= 3 ? ranks[0]! - ranks[ranks.length - 1]! : 99;
  const connected = ranks.length >= 3 && span <= 4 && !paired;
  return { high, maxSuit, paired, connected };
}

export function decidePostflop(ctx: BotContext, rand: () => number): PlayerAction | null {
  if (ctx.street === "preflop" || ctx.board.length < 3) return null;
  const eq = rangeEquity(ctx, rand);
  const made = madeOf(ctx.hole, ctx.board);
  const draw = hasDraw(ctx.hole, ctx.board);
  const heads = ctx.opponents.length === 1;
  const pfr = preflopAggressor(ctx.actions);
  const iAmPfr = pfr === ctx.seatIndex;
  const streetActions = ctx.actions.filter((a) => a.street === ctx.street);
  const prev = PREV[ctx.street]!;
  const iBetPrev = lastAggressorOn(ctx.actions, prev) === ctx.seatIndex;
  const value = made.strong || made.overpair || (made.topPair && made.goodKicker);
  const info = boardInfo(ctx.board);

  // ---------- チェックで回ってきた / 最初に行動 ----------
  if (ctx.toCall <= 0) {
    const someoneBet = streetActions.some((a) => a.kind === "bet" || a.kind === "raise" || a.kind === "allIn");
    if (someoneBet) return { kind: "check" };
    // 主導権を持つ側(フロップ: プリフロップのレイザー / ターン・リバー: 前のストリートで最後に打った人)。
    const initiativeSeat = ctx.street === "flop" ? pfr : lastAggressorOn(ctx.actions, prev);
    const iHaveInitiative = initiativeSeat === ctx.seatIndex;
    const initiativeStillToAct =
      initiativeSeat !== null &&
      initiativeSeat !== ctx.seatIndex &&
      ctx.opponents.some((o) => o.seatIndex === initiativeSeat) &&
      !streetActions.some((a) => a.seatIndex === initiativeSeat);

    if (iHaveInitiative && ctx.street === "flop" && iAmPfr) {
      // C ベット。ヘッズアップの SRP で合計 55〜70%。
      let p = value ? 0.85 : made.pair ? 0.5 : draw ? 0.7 : 0.45;
      if (info.high >= 13 && !info.connected) p += 0.12; // A・K ハイのドライなボードはレンジで打ちやすい
      if (info.paired) p += 0.15;
      if (info.maxSuit >= 3) p -= 0.2; // モノトーンは低頻度
      if (info.connected && info.high <= 9) p -= 0.15; // 低くつながったボードはディフェンス側に有利
      if (!heads) p -= 0.25;
      const size = info.maxSuit >= 3 || info.paired || (info.high >= 13 && !info.connected) ? 0.33 : value || draw ? 0.6 : 0.33;
      return rand() < Math.max(0.05, Math.min(0.95, p)) ? betFraction(ctx, size) : { kind: "check" };
    }
    if (iHaveInitiative && iBetPrev) {
      // ターン・リバーのバレル。
      const river = ctx.street === "river";
      let p: number;
      if (made.strong || made.overpair) p = 0.85;
      else if (made.topPair) p = made.goodKicker ? (river ? 0.55 : 0.7) : river ? 0.15 : 0.45; // トップペアの心地よいベット数は2回
      else if (draw && !river) p = 0.6;
      else if (!made.pair) p = river ? (eq < 0.25 ? 0.4 : 0.1) : 0.3; // 外れたドロー・エアーの一部でブラフ
      else p = 0.15;
      if (!heads) p *= 0.6;
      const f = made.strong || made.overpair || !made.pair ? geometric(ctx) : river ? 0.4 : 0.55;
      return rand() < p ? betFraction(ctx, f) : { kind: "check" };
    }
    if (initiativeStillToAct) {
      // ドンクしない。例外: ターンで 9 以下のカードがペアになった(記事)ときの小さいドンク。
      const turnCard = ctx.street === "turn" ? ctx.board[3]! : null;
      const turnPairsLow = turnCard !== null && turnCard.rank <= 9 && ctx.board.slice(0, 3).some((c) => c.rank === turnCard.rank);
      if (turnPairsLow && heads && rand() < 0.35) return betFraction(ctx, 0.3);
      return { kind: "check" };
    }
    // 主導権を持つ側がチェックした(または誰も持っていない): 打てる手で打つ(プローブ / スタブ)。
    let p = value ? 0.75 : made.pair ? 0.35 : draw ? 0.5 : 0.25;
    if (!heads) p *= 0.5;
    const f = value ? 0.6 : 0.45;
    return rand() < p ? betFraction(ctx, f) : { kind: "check" };
  }

  // ---------- ベットに直面 ----------
  const potOdds = ctx.toCall / (ctx.pot + ctx.toCall);
  const callAllIn = ctx.toCall >= ctx.hero.stack;
  const betToPot = ctx.toCall / Math.max(1, ctx.pot - ctx.toCall);
  if (callAllIn) return eq >= potOdds ? { kind: "call" } : { kind: "fold" };
  // レイズ: ナッツ級はバリューで、強いドローの一部はセミブラフ。
  if (ctx.canRaise && ctx.minRaiseTo <= ctx.maxTo) {
    const raiseToChips = Math.max(ctx.minRaiseTo, ctx.currentBetToMatch * 3);
    if (eq >= 0.78 && rand() < 0.55) {
      return raiseToChips >= ctx.maxTo * 0.5 ? { kind: "allIn" } : { kind: "raise", toAmount: raiseToChips };
    }
    if (draw && ctx.street !== "river" && eq >= potOdds * 0.9 && rand() < 0.15) {
      return raiseToChips >= ctx.maxTo * 0.5 ? { kind: "allIn" } : { kind: "raise", toAmount: raiseToChips };
    }
  }
  if (eq >= potOdds) return { kind: "call" };
  // 降りすぎない: ポットの 60% 以下のベットには、ショーダウンバリュー(ペア以上)や強いドローで守る。
  if (betToPot <= 0.6 && (made.pair || (draw && ctx.street !== "river")) && eq >= potOdds * 0.75) return { kind: "call" };
  return { kind: "fold" };
}
