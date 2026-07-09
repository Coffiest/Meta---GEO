const SERVER_URL = process.env["NEXT_PUBLIC_SERVER_URL"] ?? "http://localhost:4000";

export interface GeoSummaryStats {
  totalHands: number;
  totalPlayers: number;
  totalTournaments: number;
  averagePot: number;
  showdownRate: number;
}

export interface PositionalRfiStat {
  position: string;
  opportunities: number;
  raises: number;
  limps: number;
  checks: number;
  folds: number;
}

export interface RecentHandSummary {
  id: string;
  handNumber: number;
  createdAt: string;
  board: string[];
  potTotal: number;
  wonByFold: boolean;
  seatCount: number;
}

export interface HandDetail {
  id: string;
  handNumber: number;
  board: string[];
  potTotal: number;
  wonByFold: boolean;
  levelSmallBlind: number;
  levelBigBlind: number;
  seats: {
    seatIndex: number;
    displayName: string;
    holeCards: string[];
    isSmallBlind: boolean;
    isBigBlind: boolean;
    resultStackDelta: number;
  }[];
  actions: {
    seatIndex: number;
    street: string;
    kind: string;
    toAmount: number | null;
    potBefore: number;
  }[];
}

export type RangeScenario = "rfi" | "vsOpen";

export interface RangeCell {
  label: string;
  count: number;
  raise: number;
  call: number;
  fold: number;
}

export interface RangeMatrixResult {
  position: string;
  scenario: RangeScenario;
  cells: RangeCell[][];
  totalSamples: number;
}

/** サブスク未加入者が無料枠上限に達した場合にサーバーが返す403のボディ形状。 */
export class GeoDailyLimitError extends Error {
  constructor(public limit: number) {
    super("daily_limit_reached");
  }
}

async function getJson<T>(path: string, accessToken: string): Promise<T> {
  const res = await fetch(`${SERVER_URL}${path}`, {
    cache: "no-store",
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 403) {
    const body = (await res.json().catch(() => ({}))) as { limit?: number };
    throw new GeoDailyLimitError(body.limit ?? 0);
  }
  if (!res.ok) throw new Error(`GEO API request failed: ${path} (${res.status})`);
  return (await res.json()) as T;
}

/** GEO APIはログイン必須(無料枠は1日の閲覧回数制限、サブスク加入者は無制限)。accessTokenを毎回渡す。 */
export function createGeoApi(accessToken: string) {
  return {
    summary: () => getJson<GeoSummaryStats>("/api/geo/summary", accessToken),
    positionalRfi: (seatCount = 6) =>
      getJson<PositionalRfiStat[]>(`/api/geo/positional-rfi?seatCount=${seatCount}`, accessToken),
    hands: (limit = 20, offset = 0) =>
      getJson<RecentHandSummary[]>(`/api/geo/hands?limit=${limit}&offset=${offset}`, accessToken),
    handDetail: (id: string) => getJson<HandDetail>(`/api/geo/hands/${id}`, accessToken),
    rangeMatrix: (position: string, scenario: RangeScenario) =>
      getJson<RangeMatrixResult>(
        `/api/geo/range-matrix?position=${encodeURIComponent(position)}&scenario=${scenario}`,
        accessToken,
      ),
  };
}
