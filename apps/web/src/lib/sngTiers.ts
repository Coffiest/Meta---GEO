/**
 * SNG の階層の画面側の窓口。定義そのもの(参加費・初期スタック・レベル時間・資格)は engine の sngTiers.ts にあり、
 * ここではそれを読み、表示名とロビー用のゲーム種別(gameKey)との対応だけを持つ。
 */
export {
  SNG_TIERS,
  SNG_TIER_ORDER,
  qualifiesForTier,
  type EliteStats,
  type SngTier,
} from "@meta-geo/engine/src/sngTiers.js";
import type { SngTier } from "@meta-geo/engine/src/sngTiers.js";
import type { GameKey } from "./socket";

/** 卓の名前(固有名なのでどの言語でも同じ表記)。 */
export const TIER_LABEL: Record<SngTier, string> = {
  regular: "Sit & Go",
  highRoller: "High Roller",
  superHighRoller: "Super High Roller",
};

export function tierLabel(tier: string | undefined | null): string {
  return TIER_LABEL[(tier as SngTier) in TIER_LABEL ? (tier as SngTier) : "regular"];
}

export const GAME_KEY_BY_TIER: Record<SngTier, GameKey> = {
  regular: "sng",
  highRoller: "sng_hr",
  superHighRoller: "sng_shr",
};
