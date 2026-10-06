import type { HandEngine, PlayerAction } from "@meta-geo/engine";
import { decideBotAction, type BotDecisionInput } from "../bot.js";
import { buildBotContext, type BotContext } from "./context.js";
import { decidePostflop } from "./postflop.js";
import { decidePreflop } from "./preflop.js";

export { buildBotContext } from "./context.js";

/**
 * 自動の席の意思決定の入口。GTO の表(プリフロップ)とレンジに対する勝率(ポストフロップ)で決め、
 * 当てはまる表が無い局面だけ従来の判断(`bot.ts`)に任せる。どの経路でも、エンジンが受け付ける手に整えて返す。
 */
export function decideStrongBotAction(params: {
  hand: HandEngine;
  seatIndex: number;
  seatCount: number;
  canRaise: boolean;
  legacy: BotDecisionInput;
  random?: () => number;
}): PlayerAction {
  const rand = params.random ?? Math.random;
  let ctx: BotContext | null = null;
  try {
    ctx = buildBotContext(params.hand, params.seatIndex, params.seatCount, params.canRaise);
  } catch {
    ctx = null;
  }
  let action: PlayerAction | null = null;
  if (ctx) {
    try {
      action = ctx.street === "preflop" ? decidePreflop(ctx, rand) : decidePostflop(ctx, rand);
    } catch (err) {
      console.error("[bot] strategy failed (fallback):", err);
      action = null;
    }
  }
  if (!action) action = decideBotAction({ ...params.legacy, random: rand });
  return ctx ? sanitize(action, ctx) : action;
}

/** エンジンが受け付ける形に整える(チェックできないのにチェック、コールが要らないのにコール等を直す)。 */
export function sanitize(a: PlayerAction, ctx: BotContext): PlayerAction {
  if (a.kind === "check" && ctx.toCall > 0) return { kind: "fold" };
  if (a.kind === "fold" && ctx.toCall <= 0) return { kind: "check" };
  if (a.kind === "call" && ctx.toCall <= 0) return { kind: "check" };
  if (a.kind === "bet" || a.kind === "raise") {
    if (!ctx.canRaise || ctx.minRaiseTo > ctx.maxTo) return ctx.toCall > 0 ? { kind: "call" } : { kind: "check" };
    const to = Math.max(ctx.minRaiseTo, Math.min(ctx.maxTo, a.toAmount ?? ctx.minRaiseTo));
    if (to >= ctx.maxTo) return { kind: "allIn" };
    // ベットに直面しているときは raise、そうでなければ bet。
    return ctx.currentBetToMatch > 0 ? { kind: "raise", toAmount: to } : { kind: "bet", toAmount: to };
  }
  if (a.kind === "allIn") {
    // 残りで相手の額に届かない/ちょうど届くならコール(記録がレイズにならない)。
    if (ctx.toCall >= ctx.hero.stack) return { kind: "call" };
    if (!ctx.canRaise) return ctx.toCall > 0 ? { kind: "call" } : { kind: "check" };
  }
  return a;
}
