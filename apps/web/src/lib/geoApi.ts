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

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${SERVER_URL}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`GEO API request failed: ${path} (${res.status})`);
  return (await res.json()) as T;
}

export const geoApi = {
  summary: () => getJson<GeoSummaryStats>("/api/geo/summary"),
  positionalRfi: (seatCount = 6) => getJson<PositionalRfiStat[]>(`/api/geo/positional-rfi?seatCount=${seatCount}`),
  hands: (limit = 20, offset = 0) => getJson<RecentHandSummary[]>(`/api/geo/hands?limit=${limit}&offset=${offset}`),
  handDetail: (id: string) => getJson<HandDetail>(`/api/geo/hands/${id}`),
  rangeMatrix: (position: string, scenario: RangeScenario) =>
    getJson<RangeMatrixResult>(`/api/geo/range-matrix?position=${encodeURIComponent(position)}&scenario=${scenario}`),
};
