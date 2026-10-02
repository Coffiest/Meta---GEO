/**
 * データベースタブの「データ研究」のクライアント(`/api/research/*`)と、画面の言葉。
 * 軸・指標の名前はサーバーの `packages/db/src/researchQuery.ts` の許可リストと同じ。
 */

const SERVER_URL = process.env["NEXT_PUBLIC_SERVER_URL"] ?? "http://localhost:4000";

export type ResearchScope = "me" | "all";

export type ResearchDimension =
  | "thinkBucket"
  | "winProbBucket"
  | "itmProbBucket"
  | "bubbleStage"
  | "stackBucket"
  | "prevBigPot"
  | "sinceBigPot"
  | "lossStreak"
  | "tournamentPhase"
  | "street"
  | "position"
  | "betSizeBucket"
  | "boardTexture"
  | "spot"
  | "madeHand"
  | "gameType"
  | "playersActive";

export type ResearchMetric =
  | "foldRate"
  | "passiveRate"
  | "aggressiveRate"
  | "allInRate"
  | "avgThinkSec"
  | "medianThinkSec"
  | "timeoutRate"
  | "vpip"
  | "pfr"
  | "avgResultBb"
  | "showdownRate"
  | "winRate";

export interface ResearchFilters {
  street?: string;
  position?: string;
  gameType?: string;
  days?: number;
  facingBet?: boolean;
}

export interface ResearchCell {
  key: string;
  n: number;
  value: number | null;
}

export interface ResearchCrosstabResult {
  dimension: ResearchDimension;
  metric: ResearchMetric;
  scope: ResearchScope;
  buckets: ResearchCell[];
  overall: ResearchCell;
  minSample: number;
}

export async function fetchResearchCrosstab(
  accessToken: string,
  body: { dimension: ResearchDimension; metric: ResearchMetric; scope: ResearchScope; filters: ResearchFilters }
): Promise<ResearchCrosstabResult> {
  const res = await fetch(`${SERVER_URL}/api/research/crosstab`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`research ${res.status}`);
  return (await res.json()) as ResearchCrosstabResult;
}

export async function fetchResearchSummary(accessToken: string, scope: ResearchScope): Promise<{ decisions: number; hands: number }> {
  const res = await fetch(`${SERVER_URL}/api/research/summary?scope=${scope}`, {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`research ${res.status}`);
  return (await res.json()) as { decisions: number; hands: number };
}

// ───────────────────────────── 画面の言葉 ─────────────────────────────

export const DIMENSION_LABELS: Record<ResearchDimension, string> = {
  thinkBucket: "思考時間",
  winProbBucket: "優勝率(チップ比)",
  itmProbBucket: "インマネ率(ICM)",
  bubbleStage: "入賞までの距離",
  stackBucket: "有効スタック",
  prevBigPot: "直前のハンド",
  sinceBigPot: "大きいポットからのハンド数",
  lossStreak: "連敗数",
  tournamentPhase: "トーナメント内のハンド数",
  street: "ストリート",
  position: "ポジション",
  betSizeBucket: "ベットサイズ",
  boardTexture: "ボードの質感",
  spot: "場面",
  madeHand: "役",
  gameType: "種類",
  playersActive: "そのハンドの残り人数",
};

export interface MetricMeta {
  label: string;
  /** 値の表示形式。 */
  format: "percent" | "seconds" | "bb";
  /** 何を数えているか(注記)。 */
  unit: string;
}

export const METRIC_META: Record<ResearchMetric, MetricMeta> = {
  foldRate: { label: "フォールド率", format: "percent", unit: "アクション単位" },
  passiveRate: { label: "チェック/コール率", format: "percent", unit: "アクション単位" },
  aggressiveRate: { label: "ベット/レイズ率", format: "percent", unit: "アクション単位" },
  allInRate: { label: "オールイン率", format: "percent", unit: "アクション単位" },
  avgThinkSec: { label: "平均思考時間", format: "seconds", unit: "アクション単位" },
  medianThinkSec: { label: "思考時間の中央値", format: "seconds", unit: "アクション単位" },
  timeoutRate: { label: "時間切れ率", format: "percent", unit: "アクション単位" },
  vpip: { label: "VPIP", format: "percent", unit: "ハンド単位" },
  pfr: { label: "PFR", format: "percent", unit: "ハンド単位" },
  avgResultBb: { label: "1ハンドの平均収支", format: "bb", unit: "ハンド単位" },
  showdownRate: { label: "ショーダウン到達率", format: "percent", unit: "ハンド単位" },
  winRate: { label: "ポット獲得率", format: "percent", unit: "ハンド単位" },
};

const BUCKET_LABELS: Partial<Record<ResearchDimension, Record<string, string>>> = {
  thinkBucket: {
    "0-2s": "0〜2秒",
    "2-5s": "2〜5秒",
    "5-10s": "5〜10秒",
    "10-20s": "10〜20秒",
    "20s+": "20秒以上",
    timebank: "タイムバンク",
    timeout: "時間切れ",
    unknown: "記録なし",
  },
  winProbBucket: { unknown: "不明" },
  itmProbBucket: { unknown: "不明" },
  bubbleStage: {
    early: "序盤(入賞まで4人以上)",
    nearBubble: "バブル間近(あと2〜3人)",
    bubble: "バブル(あと1人)",
    itm: "インマネ",
    unknown: "不明",
  },
  prevBigPot: {
    bigWin: "大きいポットを取った直後",
    none: "通常",
    bigLoss: "大きいポットを落とした直後",
    first: "トーナメント最初のハンド",
  },
  sinceBigPot: {
    "win:1": "大勝ちの直後",
    "win:2-3": "大勝ちから2〜3ハンド",
    "win:4-10": "大勝ちから4〜10ハンド",
    "win:11+": "大勝ちから11ハンド以上",
    none: "大きいポットなし",
    "loss:11+": "大負けから11ハンド以上",
    "loss:4-10": "大負けから4〜10ハンド",
    "loss:2-3": "大負けから2〜3ハンド",
    "loss:1": "大負けの直後",
  },
  lossStreak: { "0": "連敗なし", "1": "1連敗中", "2": "2連敗中", "3+": "3連敗以上" },
  tournamentPhase: { "1-10": "1〜10ハンド目", "11-30": "11〜30ハンド目", "31-60": "31〜60ハンド目", "61+": "61ハンド目以降" },
  street: { preflop: "プリフロップ", flop: "フロップ", turn: "ターン", river: "リバー" },
  betSizeBucket: { none: "ベットなし", allIn: "オールイン", "100%+": "ポット超え" },
  spot: {
    preflop: "プリフロップ",
    cbet: "CB",
    delayedCbet: "ディレイドCB",
    turnBarrel: "ターンバレル",
    riverBarrel: "リバーバレル",
    barrel: "バレルを打てた場面",
    probe: "プローブ",
    donk: "ドンク",
    checkRaise: "チェックレイズ",
    afterCheckRaise: "チェックレイズ後",
    otherBet: "その他のベット",
    other: "その他",
  },
  madeHand: {
    straightFlush: "ストレートフラッシュ",
    quads: "フォーカード",
    fullHouse: "フルハウス",
    flush: "フラッシュ",
    straight: "ストレート",
    trips: "セット/トリップス",
    twoPair: "ツーペア",
    overPair: "オーバーペア",
    topPair: "トップペア",
    middlePair: "ミドルペア",
    bottomPair: "ボトムペア",
    pocketPairBelow: "アンダーペア",
    highCard: "ハイカード",
  },
  gameType: { sng: "SNG", mtt: "MTT" },
  playersActive: { "2": "2人", "3": "3人", "4+": "4人以上" },
};

const SUIT_LABEL: Record<string, string> = { rainbow: "レインボー", twotone: "ツートン", monotone: "モノトーン" };
const DRAW_LABEL: Record<string, string> = { dry: "ドライ", normal: "普通", drawHeavy: "ドローヘビー" };

export function bucketLabel(dimension: ResearchDimension, key: string): string {
  if (dimension === "boardTexture") {
    const [suit, draws] = key.split("-");
    return `${SUIT_LABEL[suit ?? ""] ?? suit}・${DRAW_LABEL[draws ?? ""] ?? draws}`;
  }
  return BUCKET_LABELS[dimension]?.[key] ?? key;
}

export function formatMetric(metric: ResearchMetric, value: number | null): string {
  if (value === null) return "—";
  const f = METRIC_META[metric].format;
  if (f === "percent") return `${(value * 100).toFixed(1)}%`;
  if (f === "seconds") return `${value.toFixed(1)}秒`;
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}bb`;
}

export interface ResearchPreset {
  id: string;
  title: string;
  question: string;
  dimension: ResearchDimension;
  metric: ResearchMetric;
  filters?: ResearchFilters;
}

export const RESEARCH_PRESETS: ResearchPreset[] = [
  { id: "think-aggr", title: "思考時間と行動", question: "長く考えたときほど、ベット/レイズしているか", dimension: "thinkBucket", metric: "aggressiveRate" },
  { id: "think-result", title: "思考時間と収支", question: "長く考えたハンドは、勝っているか", dimension: "thinkBucket", metric: "avgResultBb" },
  { id: "win-aggr", title: "優勝率と攻撃性", question: "チップリーダーほど、攻撃的になるか", dimension: "winProbBucket", metric: "aggressiveRate" },
  { id: "bubble-fold", title: "バブルとフォールド", question: "入賞が近づくと、降りる回数が増えるか", dimension: "bubbleStage", metric: "foldRate", filters: { facingBet: true } },
  { id: "itm-vpip", title: "インマネ率と参加率", question: "インマネ率が低いと、無理に参加しているか", dimension: "itmProbBucket", metric: "vpip" },
  { id: "tilt-vpip", title: "大きいポットの後(ティルト)", question: "大きく勝った/負けた後に、参加率が変わるか", dimension: "sinceBigPot", metric: "vpip" },
  { id: "tilt-think", title: "大きいポットの後の思考時間", question: "大きく負けた直後は、考える時間が短くなるか", dimension: "prevBigPot", metric: "avgThinkSec" },
  { id: "stack-aggr", title: "スタックと行動", question: "スタックが浅いほど、オールインが増えるか", dimension: "stackBucket", metric: "allInRate" },
];
