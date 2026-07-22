import type { Classification } from "./classification";
import type { HandClassMatrixResult } from "./geoApi";

const SERVER_URL = process.env["NEXT_PUBLIC_SERVER_URL"] ?? "http://localhost:4000";

export interface GtoActionEV {
  bucket: string;
  frequency: number;
  evBb: number;
}

/** GEO母集団(n≥5000)の同一スポットのソリューション(頻度チップ+169レンジ表)。 */
export interface GeoDecisionInfo {
  sampleSize: number;
  options: { bucket: string; frequency: number }[];
  matrix: HandClassMatrixResult;
}

export interface ReviewedDecision {
  sequenceNumber: number;
  street: string;
  analyzable: boolean;
  outOfScopeReason: string | null;
  heroPos: string;
  /** この決定を行った席番号(全プレイヤー評価の再生バッジ紐付け用)。 */
  seatIndex: number;
  effStackBb: number;
  potBb: number;
  facingSizeBb: number | null;
  actionTaken: { kind: string; bucket: string; toAmount: number | null };
  gtoActions: GtoActionEV[] | null;
  evLossBb: number | null;
  classification: Classification | null;
  actionName: string;
  /** GEO母集団解(n≥5000のときのみ非null)。heroの決定にのみ付く。 */
  geo: GeoDecisionInfo | null;
}

export interface ReviewResult {
  handId: string;
  heroUserId: string;
  gtoAccuracy: number | null;
  totalEvLossBb: number | null;
  mistakeCount: number;
  artisticCount: number;
  decisions: ReviewedDecision[];
}

/** 通し再生用の1ハンドのタイムライン(サーバーのReviewHandTimelineと同形)。 */
export interface ReviewHandTimeline {
  buttonFixedPos: number;
  levelSmallBlind: number;
  levelBigBlind: number;
  levelAnte: number;
  board: string[];
  potTotal: number;
  seats: {
    seatIndex: number;
    userId: string;
    startingStack: number;
    holeCards: string[];
    displayName: string;
    avatarKey: string | null;
  }[];
  actions: TimelineAction[];
}

export interface TournamentReviewHand extends ReviewResult {
  handNumber: number;
  timeline: ReviewHandTimeline;
  /** hero以外の全プレイヤー(BOT含む)の分類済み決定。再生バッジ専用。要約件数には含めない。 */
  villainDecisions: ReviewedDecision[];
}

export interface TournamentReview {
  tournamentId: string;
  gtoAccuracy: number | null;
  totalDecisions: number;
  classifiedDecisions: number;
  mistakeCount: number;
  artisticCount: number;
  classificationCounts: Record<Classification, number>;
  hands: TournamentReviewHand[];
  /** HUポストフロップのソルバー解析が未完了(ポーリングで再取得)。 */
  solving: boolean;
}

/** 無料の要約(広告つき画面用)。TournamentReviewから hands を除いたもの。課金ゲート無し。 */
export type TournamentReviewSummary = Omit<TournamentReview, "hands">;

/** 事前計算(トナメ終了時にソルバー解析をバックグラウンド起動)。fire-and-forgetで呼ぶ。 */
export async function prewarmTournamentReview(tournamentId: string, accessToken: string): Promise<void> {
  await fetch(`${SERVER_URL}/api/review/prewarm`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ tournamentId }),
  }).catch(() => {});
}

export interface TimelineSeat {
  seatIndex: number;
  userId: string;
  startingStack: number;
  holeCards: string[];
  isSmallBlind: boolean;
  isBigBlind: boolean;
  user: { displayName: string };
}

export interface TimelineAction {
  sequenceNumber: number;
  seatIndex: number;
  street: string;
  kind: string;
  toAmount: number | null;
  potBefore: number;
}

export interface HandTimeline {
  id: string;
  handNumber: number;
  tournamentId: string;
  buttonFixedPos: number;
  levelSmallBlind: number;
  levelBigBlind: number;
  levelAnte: number;
  board: string[];
  potTotal: number;
  seats: TimelineSeat[];
  actions: TimelineAction[];
}

export interface HandReviewResponse {
  review: ReviewResult;
  timeline: HandTimeline;
  /** HUポストフロップのソルバー解析が進行中(ポーリングで再取得する)。 */
  solving?: boolean;
}

/** 1ハンドのレビュー(分類結果+再生用タイムライン)を取得。 */
export async function fetchHandReview(handId: string, accessToken: string): Promise<HandReviewResponse | null> {
  const res = await fetch(`${SERVER_URL}/api/review/hand/${encodeURIComponent(handId)}`, {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) return null;
  return (await res.json()) as HandReviewResponse;
}

/** 無料枠超過(402)の情報。次に無料解析できる時刻(ISO)を含む。 */
export interface ReviewQuotaInfo {
  remaining: number;
  limit: number;
  nextFreeAt: string | null;
}

/**
 * 1トーナメントの一括解析取得の結果。
 * - ok: 解析データ
 * - quota: 無料枠超過(402) → ペイウォールを表示
 * - error: それ以外のエラー
 */
export type TournamentReviewResult =
  | { status: "ok"; data: TournamentReview }
  | { status: "quota"; info: ReviewQuotaInfo }
  | { status: "error" };

/** 無料の要約(広告つき画面用)取得結果。課金ゲートが無いため quota は発生しない。 */
export type TournamentReviewSummaryResult = { status: "ok"; data: TournamentReviewSummary } | { status: "error" };

/**
 * トーナメントの要約(分類件数・GTO精度のみ、ハンド詳細なし)を取得する。無料・ゲート無し。
 * 「棋譜解析」を押した直後の広告つき要約画面で使う。詳細(局後検討)は fetchTournamentReview を使う。
 */
export async function fetchTournamentReviewSummary(tournamentId: string, accessToken: string): Promise<TournamentReviewSummaryResult> {
  const res = await fetch(`${SERVER_URL}/api/review/tournament/summary`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ tournamentId }),
    cache: "no-store",
  });
  if (!res.ok) return { status: "error" };
  return { status: "ok", data: (await res.json()) as TournamentReviewSummary };
}

/** 1トーナメントの一括解析(局後検討=詳細)を取得。402(無料枠超過)は quota として区別する。 */
export async function fetchTournamentReview(tournamentId: string, accessToken: string): Promise<TournamentReviewResult> {
  const res = await fetch(`${SERVER_URL}/api/review/tournament`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ tournamentId }),
    cache: "no-store",
  });
  if (res.status === 402) {
    const info = (await res.json().catch(() => ({}))) as Partial<ReviewQuotaInfo>;
    return {
      status: "quota",
      info: { remaining: info.remaining ?? 0, limit: info.limit ?? 1, nextFreeAt: info.nextFreeAt ?? null },
    };
  }
  if (!res.ok) return { status: "error" };
  return { status: "ok", data: (await res.json()) as TournamentReview };
}
