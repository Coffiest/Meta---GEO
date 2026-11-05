import type { PlayerAction } from "@meta-geo/engine";
import { handClassOf, type BotContext } from "./context.js";
import { rangeEquity } from "./postflop.js";
import { idxOf, topPercentOf } from "./ranges.js";
import { tendenciesOf } from "./opponentModel.js";
import type { PlayerTendencies } from "@meta-geo/db";

/**
 * 自動の席の「打ち方の型」と「癖」(オーナー指示 2026-11-05)。
 *
 * 土台はいまの判断(GTO の表+レンジに対する勝率 = シャーク)。型と癖は、その判断に後から上書きをかける層。
 * - 型: ルース/タイト(プリフロップの参加の広さ)× アグレッシブ/パッシブ(ポストフロップの攻め)の4つ+シャーク+グラスキャノン。
 * - 癖: リンプ・コールドコール過多・3/4/5ベットの過多/過少・ブラフ過少・マージナルなベット など。1人に2〜4個(シャークは0〜2個)。
 * 型は大会ごとに引き直す(呼び出し側が席に入るたびに `randomPersona` を引く)。
 * ペイロードには何も足さない。人間かどうかでは分岐しない(相手が誰でも同じ判断)。
 */
export type BotStyle = "shark" | "glassCannon" | "lag" | "tag" | "loosePassive" | "tightPassive";

export type BotTrait =
  | "limper"
  | "coldCaller"
  | "underRaiser"
  | "underBluffer"
  | "lowBetFreq"
  | "marginalBettor"
  | "valueOnlyBettor"
  | "overFolder"
  | "callingStation"
  | "under3bet"
  | "over3bet"
  | "under4bet"
  | "over4bet"
  | "under5bet"
  | "over5bet";

export interface BotPersona {
  style: BotStyle;
  traits: BotTrait[];
  /** 癖の強さ(0.5〜1)。同じ癖でも人によって効き方を変える。 */
  intensity: number;
  /** プリフロップの参加の広さの上乗せ(上位何割まで広げる/狭めるか。-0.1〜+0.3)。 */
  looseness: number;
  /** ポストフロップの攻めの強さ(-1 = とてもパッシブ 〜 +1 = とてもアグレッシブ)。 */
  aggression: number;
}

const STYLE_WEIGHTS: [BotStyle, number][] = [
  ["shark", 0.3],
  ["glassCannon", 0.01],
  ["lag", 0.1725],
  ["tag", 0.1725],
  ["loosePassive", 0.1725],
  ["tightPassive", 0.1725],
];

/** 型ごとに付きやすい癖(重み)。 */
const TRAIT_WEIGHTS: Record<BotStyle, Partial<Record<BotTrait, number>>> = {
  shark: { underBluffer: 1, lowBetFreq: 1, marginalBettor: 1, over3bet: 1, under4bet: 1, overFolder: 0.5 },
  glassCannon: {},
  lag: { over3bet: 3, over4bet: 2, over5bet: 1, marginalBettor: 2, coldCaller: 1, under4bet: 1, overFolder: 1 },
  tag: { under3bet: 2, under4bet: 2, valueOnlyBettor: 2, underBluffer: 2, overFolder: 2, over3bet: 1, lowBetFreq: 1 },
  loosePassive: { limper: 3, coldCaller: 3, callingStation: 3, underRaiser: 2, under3bet: 2, under4bet: 1, valueOnlyBettor: 1, lowBetFreq: 1 },
  tightPassive: { underRaiser: 3, underBluffer: 3, lowBetFreq: 2, overFolder: 3, under3bet: 2, under4bet: 2, under5bet: 1, valueOnlyBettor: 2, limper: 1 },
};

/** 同時に持てない組。 */
const EXCLUSIVE: [BotTrait, BotTrait][] = [
  ["under3bet", "over3bet"],
  ["under4bet", "over4bet"],
  ["under5bet", "over5bet"],
  ["overFolder", "callingStation"],
  ["valueOnlyBettor", "marginalBettor"],
  ["underBluffer", "marginalBettor"],
];

function pickWeighted<T>(items: [T, number][], rand: () => number): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [v, w] of items) {
    r -= w;
    if (r <= 0) return v;
  }
  return items[items.length - 1]![0];
}

export function randomPersona(rand: () => number = Math.random): BotPersona {
  const style = pickWeighted(STYLE_WEIGHTS, rand);
  const count =
    style === "glassCannon" ? 0 : style === "shark" ? pickWeighted<number>([[0, 0.6], [1, 0.3], [2, 0.1]], rand) : 2 + Math.floor(rand() * 3);
  const traits: BotTrait[] = [];
  let pool = Object.entries(TRAIT_WEIGHTS[style]) as [BotTrait, number][];
  while (traits.length < count && pool.length > 0) {
    const t = pickWeighted(pool, rand);
    traits.push(t);
    const banned = new Set<BotTrait>([t]);
    for (const [a, b] of EXCLUSIVE) {
      if (a === t) banned.add(b);
      if (b === t) banned.add(a);
    }
    pool = pool.filter(([k]) => !banned.has(k));
  }
  const between = (lo: number, hi: number) => lo + rand() * (hi - lo);
  const base: Record<BotStyle, [number, number, number, number]> = {
    // looseness の範囲 / aggression の範囲
    shark: [0, 0, 0, 0],
    glassCannon: [1, 1, 1, 1],
    lag: [0.08, 0.2, 0.35, 0.8],
    tag: [-0.04, 0.02, 0.2, 0.6],
    loosePassive: [0.12, 0.3, -0.9, -0.4],
    tightPassive: [-0.1, -0.03, -0.9, -0.4],
  };
  const [l0, l1, a0, a1] = base[style];
  return { style, traits, intensity: between(0.5, 1), looseness: between(l0, l1), aggression: between(a0, a1) };
}

const AGG = new Set(["bet", "raise", "allIn"]);
const isAgg = (a: PlayerAction) => a.kind === "bet" || a.kind === "raise" || a.kind === "allIn";

/** 大まかな位置ごとの参加の広さ(上位何割)。 */
const POS_WIDTH: Record<string, number> = { UTG: 0.15, HJ: 0.19, CO: 0.26, BTN: 0.42, SB: 0.38, BB: 0.4 };

function raiseBy(ctx: BotContext, mult: number): PlayerAction {
  const base = ctx.currentBetToMatch > 0 ? ctx.currentBetToMatch : ctx.bb;
  return { kind: "raise", toAmount: Math.round(base * mult) };
}

function betPot(ctx: BotContext, frac: number): PlayerAction {
  return { kind: "bet", toAmount: Math.round(Math.max(ctx.bb, ctx.pot * frac)) };
}

/**
 * いまの判断(土台)に、型と癖の上書きをかける。シャークで癖が無ければそのまま返す。
 */
export function applyPersona(
  ctx: BotContext,
  base: PlayerAction,
  persona: BotPersona,
  rand: () => number,
  read: (playerId: string) => PlayerTendencies | null = tendenciesOf,
): PlayerAction {
  let a = base;
  if (!(persona.style === "shark" && persona.traits.length === 0)) {
    a = ctx.street === "preflop" ? applyPreflop(ctx, a, persona, rand) : applyPostflop(ctx, a, persona, rand);
  }
  // シャークは、相手の傾向(通算+この大会で見た打ち方)が分かっていれば、そこを突く。
  if (persona.style === "shark") a = exploit(ctx, a, rand, read);
  return a;
}

/** 突く相手: ベットに直面していれば最後に攻めた人、そうでなければ相手が1人のときのその人。 */
function targetOf(ctx: BotContext): string | null {
  const agg = ctx.actions.filter((x) => x.street === ctx.street && AGG.has(x.kind) && x.seatIndex !== ctx.seatIndex);
  if (ctx.toCall > 0 && agg.length > 0) {
    const s = ctx.seats.find((x) => x.seatIndex === agg[agg.length - 1]!.seatIndex);
    return s?.playerId ?? null;
  }
  return ctx.opponents.length === 1 ? ctx.opponents[0]!.playerId : null;
}

/**
 * シャークの相手読み。相手の手札は使わず、相手の傾向の数字だけで判断を寄せる。
 * - 降りすぎる相手には、打たない所で小さく打つ(ブラフを増やす)/ 3ベットを増やす。
 * - 降りない相手(コーリングステーション)には、ブラフをやめる。
 * - ルースな相手のベットには広く付いていく / タイトな相手のベットには弱いコールをやめる。
 */
function exploit(ctx: BotContext, base: PlayerAction, rand: () => number, read: (id: string) => PlayerTendencies | null): PlayerAction {
  const id = targetOf(ctx);
  if (!id) return base;
  const t = read(id);
  if (!t) return base;
  const facing = ctx.toCall > 0;

  if (ctx.street === "preflop") {
    const h = idxOf(handClassOf(ctx.hole));
    if (h === undefined) return base;
    const top = topPercentOf(h);
    const raises = ctx.actions.filter((x) => x.street === "preflop" && AGG.has(x.kind)).length;
    if (raises !== 1 || !facing || ctx.toCall >= ctx.hero.stack) return base;
    if (t.foldTo3BetRate > 0.65 && !isAgg(base) && top < 0.3 && rand() < 0.6) return raiseBy(ctx, 3.2);
    if (t.vpipRate > 0.45 && base.kind === "fold" && top < 0.3) return { kind: "call" };
    return base;
  }

  const eq = rangeEquity(ctx, rand, 120);
  const potOdds = facing ? ctx.toCall / (ctx.pot + ctx.toCall) : 0;
  if (!facing) {
    if (base.kind === "check" && ctx.opponents.length === 1 && Math.max(t.foldToBetRate, t.foldToCbetRate) > 0.55 && rand() < 0.7) {
      return betPot(ctx, 0.33);
    }
    if (isAgg(base) && eq < 0.45 && ctx.opponents.length === 1 && t.foldToBetRate < 0.35) return { kind: "check" };
    return base;
  }
  if (base.kind === "fold" && t.vpipRate > 0.45 && eq > potOdds - 0.07) return { kind: "call" };
  if (base.kind === "call" && t.vpipRate < 0.18 && eq < 0.5) return { kind: "fold" };
  return base;
}

function has(p: BotPersona, t: BotTrait): boolean {
  return p.traits.includes(t);
}

function applyPreflop(ctx: BotContext, base: PlayerAction, p: BotPersona, rand: () => number): PlayerAction {
  const h = idxOf(handClassOf(ctx.hole));
  if (h === undefined) return base;
  const top = topPercentOf(h); // 0 が最強
  const k = p.intensity;
  const raises = ctx.actions.filter((a) => a.street === "preflop" && AGG.has(a.kind)).length;
  const facingAllIn = ctx.toCall >= ctx.hero.stack;

  // グラスキャノン: 全部参加。とても弱い手以外はレイズ。
  if (p.style === "glassCannon") {
    if (facingAllIn) return top < 0.6 ? { kind: "call" } : base;
    if (top > 0.85) return ctx.toCall > 0 ? { kind: "call" } : { kind: "check" };
    return ctx.toCall > 0 || raises > 0 ? raiseBy(ctx, 3) : raiseBy(ctx, 3);
  }

  const width = (POS_WIDTH[ctx.heroPos] ?? 0.25) + p.looseness;
  const voluntary = base.kind !== "fold" && !(base.kind === "check" && ctx.toCall === 0);

  if (raises === 0) {
    // 誰もレイズしていない: 参加の広さ
    if (!voluntary && top < width) {
      const limp = has(p, "limper") || p.aggression < -0.3 ? rand() < 0.7 * k + 0.2 : rand() < 0.15;
      return limp ? (ctx.toCall > 0 ? { kind: "call" } : { kind: "check" }) : raiseBy(ctx, 2.5);
    }
    if (voluntary && top > width + 0.02 && ctx.heroPos !== "BB") return ctx.toCall > 0 ? { kind: "fold" } : { kind: "check" };
    if (isAgg(base) && has(p, "limper") && top > 0.06 && rand() < 0.6 * k) return ctx.toCall > 0 ? { kind: "call" } : { kind: "check" };
    if (isAgg(base) && has(p, "underRaiser") && top > 0.05 && rand() < 0.5 * k) return ctx.toCall > 0 ? { kind: "call" } : { kind: "check" };
    return base;
  }

  // レイズに直面: raises=1 → 3ベットの判断、2 → 4ベット、3以上 → 5ベット
  const n = raises === 1 ? 3 : raises === 2 ? 4 : 5;
  const over = has(p, `over${n}bet` as BotTrait);
  const under = has(p, `under${n}bet` as BotTrait);
  const overTop = n === 3 ? 0.14 : n === 4 ? 0.07 : 0.04;
  const keepTop = n === 3 ? 0.025 : n === 4 ? 0.015 : 0.01;
  if (over && !isAgg(base) && top < overTop * (1 + k) && !facingAllIn) return n >= 5 ? { kind: "allIn" } : raiseBy(ctx, n === 3 ? 3.2 : 2.3);
  if (under && isAgg(base) && top > keepTop) return { kind: "call" };
  if (has(p, "underRaiser") && isAgg(base) && top > keepTop && rand() < 0.5 * k) return { kind: "call" };
  // コールの広さ: コールドコール過多・ルース
  const callWidth = (n === 3 ? 0.12 : 0.05) + Math.max(0, p.looseness) * (n === 3 ? 0.8 : 0.3) + (has(p, "coldCaller") && n === 3 ? 0.2 * k : 0);
  if (base.kind === "fold" && top < callWidth && !facingAllIn) return { kind: "call" };
  if (base.kind === "call" && p.looseness < 0 && top > callWidth + 0.03) return { kind: "fold" };
  return base;
}

function applyPostflop(ctx: BotContext, base: PlayerAction, p: BotPersona, rand: () => number): PlayerAction {
  const k = p.intensity;
  const eq = rangeEquity(ctx, rand, 160);
  const facing = ctx.toCall > 0;
  const potOdds = facing ? ctx.toCall / (ctx.pot + ctx.toCall) : 0;

  if (p.style === "glassCannon") {
    if (eq < 0.22) return facing ? (eq > potOdds ? { kind: "call" } : { kind: "fold" }) : { kind: "check" };
    return facing ? raiseBy(ctx, 2.5) : betPot(ctx, 0.75);
  }

  if (!facing) {
    // 自分から打てる場面
    if (base.kind === "check") {
      if (has(p, "valueOnlyBettor") && eq > 0.7) return betPot(ctx, 0.6);
      if (has(p, "marginalBettor") && eq > 0.42 && eq < 0.68 && rand() < 0.7 * k) return betPot(ctx, 0.4);
      if (p.aggression > 0 && rand() < p.aggression * 0.45) return betPot(ctx, eq > 0.6 ? 0.66 : 0.5);
      return base;
    }
    if (isAgg(base)) {
      if (has(p, "valueOnlyBettor")) return eq > 0.6 ? base : { kind: "check" };
      if (has(p, "underBluffer") && eq < 0.42 && rand() < 0.85 * k) return { kind: "check" };
      if (has(p, "lowBetFreq") && rand() < 0.5 * k) return { kind: "check" };
      if (p.aggression < 0 && eq < 0.75 && rand() < -p.aggression * 0.7) return { kind: "check" };
      return base;
    }
    return base;
  }

  // ベットに直面
  if (base.kind === "fold") {
    if (has(p, "callingStation") && eq > potOdds - 0.15 * k) return { kind: "call" };
    if (p.looseness > 0.1 && eq > potOdds - 0.06 && rand() < 0.5) return { kind: "call" };
    if (p.aggression > 0.5 && rand() < (p.aggression - 0.5) * 0.25) return raiseBy(ctx, 2.6); // ブラフレイズ
    return base;
  }
  if (base.kind === "call") {
    if (has(p, "overFolder") && eq < 0.58 && rand() < 0.6 * k) return { kind: "fold" };
    if (p.aggression > 0 && eq > 0.62 && rand() < p.aggression * 0.4) return raiseBy(ctx, 2.6);
    return base;
  }
  if (isAgg(base)) {
    if ((has(p, "underRaiser") || p.aggression < -0.3) && eq < 0.85 && rand() < 0.6 * k) return { kind: "call" };
    return base;
  }
  return base;
}
