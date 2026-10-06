import type { PlayerAction } from "@meta-geo/engine";
import {
  PREFLOP_BANDS,
  bandOfStack,
  buildPreflopOpenerVs3betNode,
  defenseGtoActions,
  eqMatrixAvailable,
  eqVsRange,
  openGtoActions,
  vsJamGtoActions,
  type GtoActionEV,
} from "@meta-geo/db";
import { handClassOf, type BotAction, type BotContext } from "./context.js";
import { idxOf, jamRange, openRange, percentileRange, strengthOf, unionRange } from "./ranges.js";

/**
 * プリフロップの意思決定。リポジトリにある計算済みの GTO の表(`@meta-geo/db` の reviewGto.ts と同じデータ)から、
 * **頻度どおりに**手を選ぶ。表の無い局面は null を返し、呼び出し側が従来の判断に任せる。
 *
 * - 誰も参加していない(オープン): openGtoActions。15bb 未満の帯はジャムかフォールド(Nash)。BvB の SB も同じ表。
 * - オープンに直面(15bb 以上): defenseGtoActions(コール / 3ベット / ジャム / フォールド)。
 * - オープンに直面(15bb 未満): オープンレンジに対する勝率でリシャブ / コール / フォールド。
 * - オールインに直面: Nash のコールレンジ(25bb 以下)。25bb を超える深いオールインは、相手のジャムのレンジを
 *   Nash の 25bb より広く見積もり、勝率がポットオッズを上回ればコールする(強い手だけだと決めつけて降りすぎない)。
 * - オープンして3ベットされた: openerVs3 の表。無い帯は手の強さで決める。
 * - リンプに直面: アイソレート / チェック / オーバーリンプを手の強さで決める。
 */

const VOLUNTARY = new Set(["fold", "check", "call", "bet", "raise", "allIn"]);
const AGGRESSIVE = new Set(["bet", "raise", "allIn"]);

/** 頻度で1つ選ぶ。全部 0 なら null。 */
function pickByFrequency(options: GtoActionEV[], rand: () => number): string | null {
  const total = options.reduce((s, o) => s + Math.max(0, o.frequency), 0);
  if (total <= 0.0001) return null;
  let r = rand() * total;
  for (const o of options) {
    r -= Math.max(0, o.frequency);
    if (r <= 0) return o.bucket;
  }
  return options[options.length - 1]!.bucket;
}

function isRaiseBucket(b: string): boolean {
  return b.startsWith("raise");
}

/** toAmount(チップ)のレイズ/ベット。最小に満たなければ最小、残りが少なければオールイン。 */
function raiseTo(ctx: BotContext, toChips: number): PlayerAction {
  const to = Math.max(ctx.minRaiseTo, Math.round(toChips));
  if (!ctx.canRaise || ctx.minRaiseTo > ctx.maxTo) return ctx.toCall > 0 ? { kind: "call" } : { kind: "check" };
  if (to >= ctx.maxTo || ctx.maxTo - to <= ctx.bb * 1.5 || to >= ctx.maxTo * 0.45) return { kind: "allIn" };
  return { kind: "raise", toAmount: to };
}

function allIn(ctx: BotContext): PlayerAction {
  // 相手のオールインに残りで足りる/足りない場合はコール(記録がレイズにならないように)。
  if (ctx.toCall >= ctx.hero.stack) return { kind: "call" };
  if (!ctx.canRaise) return ctx.toCall > 0 ? { kind: "call" } : { kind: "check" };
  return { kind: "allIn" };
}

function foldOrCheck(ctx: BotContext): PlayerAction {
  return ctx.toCall > 0 ? { kind: "fold" } : { kind: "check" };
}

/** 表の一般的なオープンのサイズ(bb)。 */
function openSizeBb(pos: string, effBb: number): number {
  const p = PREFLOP_BANDS[bandOfStack(effBb)]?.[pos];
  if (p?.raiseSize) return p.raiseSize;
  return pos === "SB" ? 3 : pos === "BTN" ? 2.5 : 2.2;
}

interface PreflopShape {
  before: BotAction[];
  raises: BotAction[];
  limps: BotAction[];
  heroActed: boolean;
}

function shapeOf(ctx: BotContext): PreflopShape {
  const before = ctx.actions.filter((a) => a.street === "preflop" && VOLUNTARY.has(a.kind));
  const raises = before.filter((a) => AGGRESSIVE.has(a.kind));
  const firstRaiseIdx = before.findIndex((a) => AGGRESSIVE.has(a.kind));
  const limps = before.filter((a, i) => a.kind === "call" && (firstRaiseIdx < 0 || i < firstRaiseIdx));
  return { before, raises, limps, heroActed: before.some((a) => a.seatIndex === ctx.seatIndex) };
}

function seatOf(ctx: BotContext, seatIndex: number) {
  return ctx.seats.find((s) => s.seatIndex === seatIndex);
}

/** その席はオールインしているか(残りが 0)。 */
function isAllInSeat(ctx: BotContext, seatIndex: number): boolean {
  const s = seatOf(ctx, seatIndex);
  return !!s && (s.status === "allIn" || s.stack === 0);
}

export function decidePreflop(ctx: BotContext, rand: () => number): PlayerAction | null {
  if (!eqMatrixAvailable() || ctx.bb <= 0) return null;
  const hand = handClassOf(ctx.hole);
  const h = idxOf(hand);
  if (h === undefined) return null;
  const shape = shapeOf(ctx);
  const effBb = ctx.effStackBb;
  const pos = ctx.heroPos;

  // --- 誰も参加していない: オープン ---
  if (shape.raises.length === 0 && shape.limps.length === 0) {
    if (pos === "BB") return { kind: "check" }; // 全員降りて BB まで来ることは無いが念のため
    const opts = openGtoActions({ heroPos: pos, handClass: hand, effStackBb: effBb });
    if (!opts) return null;
    const b = pickByFrequency(opts, rand) ?? "fold";
    if (b === "fold") return foldOrCheck(ctx);
    if (b === "allIn") return allIn(ctx);
    if (b === "call") return ctx.toCall > 0 ? { kind: "call" } : { kind: "check" }; // SB のリンプ
    if (isRaiseBucket(b)) return raiseTo(ctx, openSizeBb(pos, effBb) * ctx.bb);
    return null;
  }

  const lastRaise = shape.raises[shape.raises.length - 1];

  // --- オールインに直面(直前の攻撃的な手が、残りを全部入れたもの) ---
  if (lastRaise && isAllInSeat(ctx, lastRaise.seatIndex) && ctx.toCall > 0) {
    return decideVsAllIn(ctx, hand, h, lastRaise, shape, rand);
  }

  // --- オープン1回に直面(自分はまだ動いていない) ---
  if (shape.raises.length === 1 && !shape.heroActed && lastRaise) {
    const openerPos = ctx.positions.get(lastRaise.seatIndex) ?? "CO";
    const callers = shape.before.filter((a, i) => a.kind === "call" && i > shape.before.indexOf(lastRaise));
    if (callers.length > 0) return decideSqueeze(ctx, hand, h, lastRaise, openerPos, rand);
    if (effBb >= 15) {
      const opts = defenseGtoActions({ openerPos, heroPos: pos, handClass: hand, effStackBb: effBb });
      if (opts) {
        const b = pickByFrequency(opts, rand) ?? "fold";
        if (b === "fold") return { kind: "fold" };
        if (b === "call") return { kind: "call" };
        if (b === "allIn") return allIn(ctx);
        if (isRaiseBucket(b)) {
          const ip = pos !== "SB" && pos !== "BB";
          return raiseTo(ctx, (lastRaise.toAmount ?? ctx.currentBetToMatch) * (ip ? 3 : 3.7));
        }
      }
    }
    // 15bb 未満(または表が無い): オープンレンジに対する勝率で、リシャブ / コール / フォールド。
    const eq = eqVsRange(h, openRange(openerPos, effBb));
    const potOdds = ctx.toCall / (ctx.pot + ctx.toCall);
    if (eq >= 0.5) return allIn(ctx);
    if (pos === "BB" && eq >= potOdds + 0.04) return { kind: "call" };
    if (effBb < 15 && eq >= 0.46 && rand() < 0.5) return allIn(ctx);
    return { kind: "fold" };
  }

  // --- オープンして3ベットされた ---
  if (shape.raises.length === 2 && shape.raises[0]!.seatIndex === ctx.seatIndex && lastRaise) {
    const threeBettorPos = ctx.positions.get(lastRaise.seatIndex) ?? "BB";
    const node = buildPreflopOpenerVs3betNode(bandOfStack(effBb), pos, threeBettorPos);
    if (!node.unsupported) {
      const cell = node.matrix.cells.flat().find((c) => c.label === hand);
      if (cell && cell.count > 0) {
        const opts: GtoActionEV[] = Object.entries(cell.byBucket).map(([bucket, frequency]) => ({ bucket, frequency, evBb: 0 }));
        const b = pickByFrequency(opts, rand) ?? "fold";
        if (b === "allIn") return allIn(ctx);
        if (b === "call") return { kind: "call" };
        return { kind: "fold" };
      }
    }
    const s = strengthOf(h);
    if (s >= 0.74 || ["AKs", "AKo", "QQ", "KK", "AA"].includes(hand)) return allIn(ctx);
    if (s >= 0.64 && effBb >= 30) return { kind: "call" };
    return { kind: "fold" };
  }

  // --- リンプに直面 ---
  if (shape.raises.length === 0 && shape.limps.length > 0) {
    const s = strengthOf(h);
    const isoTo = (3.5 + shape.limps.length) * ctx.bb;
    if (pos === "BB") {
      if (s >= 0.6 && rand() < 0.8) return raiseTo(ctx, isoTo);
      if (s >= 0.66) return raiseTo(ctx, isoTo);
      return { kind: "check" };
    }
    if (effBb < 15 && s >= 0.6) return allIn(ctx);
    if (s >= 0.6) return raiseTo(ctx, isoTo);
    if (s >= 0.53 && (pos === "BTN" || pos === "SB") && rand() < 0.4) return { kind: "call" };
    return foldOrCheck(ctx);
  }

  return null;
}

/** オールインに直面。25bb 以下は Nash のコールレンジ、深いオールインは勝率とポットオッズ。 */
function decideVsAllIn(
  ctx: BotContext,
  hand: string,
  h: number,
  jam: BotAction,
  shape: PreflopShape,
  rand: () => number,
): PlayerAction {
  const jammerPos = ctx.positions.get(jam.seatIndex) ?? "BTN";
  const riskBb = Math.min(ctx.toCall, ctx.hero.stack) / ctx.bb;
  const potOdds = ctx.toCall / (ctx.pot + ctx.toCall);
  const multiway = shape.before.filter((a, i) => i > shape.before.indexOf(jam) && a.kind === "call").length > 0;
  const firstAggression = shape.raises.length === 1;

  if (riskBb <= 25 && firstAggression && !multiway) {
    const opts = vsJamGtoActions({ jammerPos, heroPos: ctx.heroPos, riskBb, handClass: hand });
    if (opts) {
      const b = pickByFrequency(opts, rand) ?? "fold";
      return b === "call" ? { kind: "call" } : { kind: "fold" };
    }
  }
  // 深いオールイン・3ベット以降のオールイン: 相手のジャムのレンジを見積もり、勝率とポットオッズで決める。
  // 人間の極端なオーバーシャブに降りすぎないよう、Nash の 25bb のレンジを BTN の 25bb のレンジと合わせて広げる。
  const jamStack = Math.min(25, Math.max(8, riskBb));
  const base = jamRange(jammerPos, jamStack) ?? percentileRange(0, 0.2);
  const wide = jamRange("BTN", jamStack) ?? percentileRange(0, 0.35);
  let villain = firstAggression ? unionRange(base, wide.map((v) => v * 0.6)) : percentileRange(0, 0.12);
  if (!firstAggression && riskBb > 25) villain = unionRange(villain, percentileRange(0, 0.07));
  const eq = eqVsRange(h, villain);
  const margin = multiway ? 0.06 : 0;
  return eq >= potOdds + margin ? { kind: "call" } : { kind: "fold" };
}

/** オープン+コーラーがいる所(スクイーズ / オーバーコール)。 */
function decideSqueeze(
  ctx: BotContext,
  hand: string,
  h: number,
  open: BotAction,
  openerPos: string,
  rand: () => number,
): PlayerAction {
  const eq = eqVsRange(h, openRange(openerPos, ctx.effStackBb));
  const s = strengthOf(h);
  const callers = ctx.actions.filter((a) => a.street === "preflop" && a.kind === "call").length;
  if (eq >= 0.58 || s >= 0.72) return raiseTo(ctx, (open.toAmount ?? ctx.currentBetToMatch) * (3.5 + callers));
  if (ctx.effStackBb < 20 && eq >= 0.52) return allIn(ctx);
  const potOdds = ctx.toCall / (ctx.pot + ctx.toCall);
  if (eq >= potOdds + 0.12 && s >= 0.52) return { kind: "call" };
  // 低頻度のスクイーズブラフ(ブロッカーのあるスーテッドエース)。
  if (/^A[2-5]s$/.test(hand) && ctx.effStackBb >= 30 && rand() < 0.3) {
    return raiseTo(ctx, (open.toAmount ?? ctx.currentBetToMatch) * (3.5 + callers));
  }
  return { kind: "fold" };
}
