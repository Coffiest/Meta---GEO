/**
 * Sit & Go の階層(オーナー確定仕様)。参加費・初期スタック・レベル時間・席の埋め方・チャット/タイムバンクの有無と、
 * 参加資格をここ1か所で持つ。サーバー(卓・マッチング・資格判定)と画面(ロビー・ブラインド表)の両方が読む。
 *
 * - regular(参加費1,000): 15,000点(75BB)/ 2分30秒 / 6人そろわなければ自動で卓が埋まる / チャット・タイムバンク無し
 * - highRoller(5,000): 20,000点(100BB)/ 4分 / 6人そろったら開始 / チャット・タイムバンク有り / 生涯収支 +50,000 以上
 * - superHighRoller(20,000): 同上 / 生涯収支 +200,000 以上・偏差値 60 以上・ROI +120% 以上
 *
 * ROI は成績画面に出ている値(収支 ÷ 参加費の合計。賞金 ÷ 参加費 − 1)。
 * 賞金は今の SNG と同じ比率(1位 = 参加費×4、2位 = 参加費×2。6人ぶんの参加費をそのまま配る)。
 */
export type SngTier = "regular" | "highRoller" | "superHighRoller";

export const SNG_TIER_ORDER: readonly SngTier[] = ["regular", "highRoller", "superHighRoller"];

export interface SngTierRequirement {
  /** 生涯収支(賞金 − 参加費)の下限。 */
  minProfit: number;
  /** 偏差値の下限。 */
  minRating?: number;
  /** 成績画面の ROI(%)の下限。 */
  minRoiPct?: number;
}

export interface SngTierConfig {
  tier: SngTier;
  buyIn: number;
  startingStack: number;
  levelDurationMs: number;
  /** 6人そろわないとき、空き席を自動で埋めて始めるか。 */
  autoFill: boolean;
  chat: boolean;
  timeBank: boolean;
  requirement: SngTierRequirement | null;
}

export const SNG_TIERS: Record<SngTier, SngTierConfig> = {
  regular: {
    tier: "regular",
    buyIn: 1000,
    startingStack: 15_000,
    levelDurationMs: 150_000,
    autoFill: true,
    chat: false,
    timeBank: false,
    requirement: null,
  },
  highRoller: {
    tier: "highRoller",
    buyIn: 5000,
    startingStack: 20_000,
    levelDurationMs: 240_000,
    autoFill: false,
    chat: true,
    timeBank: true,
    requirement: { minProfit: 50_000 },
  },
  superHighRoller: {
    tier: "superHighRoller",
    buyIn: 20_000,
    startingStack: 20_000,
    levelDurationMs: 240_000,
    autoFill: false,
    chat: true,
    timeBank: true,
    requirement: { minProfit: 200_000, minRating: 60, minRoiPct: 120 },
  },
};

export function isSngTier(x: unknown): x is SngTier {
  return x === "regular" || x === "highRoller" || x === "superHighRoller";
}

/** 1位から順の賞金(6人の参加費を 4:2 で配る)。 */
export function sngPayouts(buyIn: number): { place: number; amount: number }[] {
  return [
    { place: 1, amount: buyIn * 4 },
    { place: 2, amount: buyIn * 2 },
  ];
}

/** 参加資格の判定に使う成績。rating / roiPct はトーナメント未参加なら null。 */
export interface EliteStats {
  profit: number;
  rating: number | null;
  roiPct: number | null;
}

/** その階層に参加できるか。 */
export function qualifiesForTier(tier: SngTier, stats: EliteStats): boolean {
  const req = SNG_TIERS[tier].requirement;
  if (!req) return true;
  if (stats.profit < req.minProfit) return false;
  if (req.minRating !== undefined && (stats.rating === null || stats.rating < req.minRating)) return false;
  if (req.minRoiPct !== undefined && (stats.roiPct === null || stats.roiPct < req.minRoiPct)) return false;
  return true;
}

/** アイコンの枠: Super High Roller の資格者は金、High Roller の資格者は銀、それ以外は無し。 */
export type EliteFrame = "silver" | "gold";

export function eliteFrameOf(stats: EliteStats): EliteFrame | null {
  if (qualifiesForTier("superHighRoller", stats)) return "gold";
  if (qualifiesForTier("highRoller", stats)) return "silver";
  return null;
}
