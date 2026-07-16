import type { Classification } from "./classification";

const SERVER_URL = process.env["NEXT_PUBLIC_SERVER_URL"] ?? "http://localhost:4000";

export interface GtoActionEV {
  bucket: string;
  frequency: number;
  evBb: number;
}

export interface ReviewedDecision {
  sequenceNumber: number;
  street: string;
  analyzable: boolean;
  outOfScopeReason: string | null;
  heroPos: string;
  effStackBb: number;
  potBb: number;
  facingSizeBb: number | null;
  actionTaken: { kind: string; bucket: string; toAmount: number | null };
  gtoActions: GtoActionEV[] | null;
  evLossBb: number | null;
  classification: Classification | null;
  actionName: string;
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
}

export interface TournamentReview {
  tournamentId: string;
  gtoAccuracy: number | null;
  totalDecisions: number;
  classifiedDecisions: number;
  mistakeCount: number;
  artisticCount: number;
  hands: TournamentReviewHand[];
  /** HUポストフロップのソルバー解析が未完了(ポーリングで再取得)。 */
  solving: boolean;
}

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

/** 1トーナメントの一括解析を取得。 */
export async function fetchTournamentReview(tournamentId: string, accessToken: string): Promise<TournamentReview | null> {
  const res = await fetch(`${SERVER_URL}/api/review/tournament`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ tournamentId }),
    cache: "no-store",
  });
  if (!res.ok) return null;
  return (await res.json()) as TournamentReview;
}
