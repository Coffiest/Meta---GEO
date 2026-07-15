const SERVER_URL = process.env["NEXT_PUBLIC_SERVER_URL"] ?? "http://localhost:4000";

/** packages/db/src/geoTree.ts と揃えた型。今回のGEO DATABASEは無制限アクセスのため認証不要。 */
export type StackBucket = "0-5" | "5-10" | "10-15" | "15-20" | "20-30" | "30+";
export const STACK_BUCKETS: StackBucket[] = ["0-5", "5-10", "10-15", "15-20", "20-30", "30+"];
export const STACK_BUCKET_LABELS: Record<StackBucket, string> = {
  "0-5": "0-5bb",
  "5-10": "5-10bb",
  "10-15": "10-15bb",
  "15-20": "15-20bb",
  "20-30": "20-30bb",
  "30+": "30bb+",
};

export type BubbleStage = "normal" | "30" | "20" | "10" | "5" | "4" | "3" | "2" | "1" | "finalTable";
export const BUBBLE_STAGES: BubbleStage[] = ["normal", "30", "20", "10", "5", "4", "3", "2", "1", "finalTable"];
export const BUBBLE_STAGE_LABELS: Record<BubbleStage, string> = {
  normal: "通常",
  "30": "残り30人",
  "20": "残り20人",
  "10": "残り10人",
  "5": "残り5人",
  "4": "残り4人",
  "3": "バブルライン",
  "2": "残り2人",
  "1": "残り1人",
  finalTable: "ファイナルテーブル",
};

export type PreflopBucket = "fold" | "call" | "raise2-2.5" | "raise2.5-3" | "raise3-4" | "raise4+" | "allIn";
/** 弱→強(アグレッション順)の固定順。頻度ではなくこの順でセル/バーを並べる。 */
export const PREFLOP_BUCKETS: PreflopBucket[] = ["fold", "call", "raise2-2.5", "raise2.5-3", "raise3-4", "raise4+", "allIn"];
export const PREFLOP_BUCKET_LABELS: Record<PreflopBucket, string> = {
  fold: "Fold",
  call: "Call",
  "raise2-2.5": "Raise 2-2.5bb",
  "raise2.5-3": "Raise 2.5-3bb",
  "raise3-4": "Raise 3-4bb",
  "raise4+": "Raise 4bb+",
  allIn: "Allin",
};

export type PostflopBucket = "fold" | "checkOrCall" | "bet20-40" | "bet40-60" | "bet60-80" | "bet80-100" | "bet100+" | "allIn";
/** 弱→強(アグレッション順)の固定順。頻度ではなくこの順でセル/バーを並べる。 */
export const POSTFLOP_BUCKETS: PostflopBucket[] = [
  "fold",
  "checkOrCall",
  "bet20-40",
  "bet40-60",
  "bet60-80",
  "bet80-100",
  "bet100+",
  "allIn",
];
export const POSTFLOP_BUCKET_LABELS: Record<PostflopBucket, string> = {
  fold: "Fold",
  checkOrCall: "Check/Call",
  "bet20-40": "Bet 20-40%",
  "bet40-60": "Bet 40-60%",
  "bet60-80": "Bet 60-80%",
  "bet80-100": "Bet 80-100%",
  "bet100+": "Bet 100%+",
  allIn: "Allin",
};

export interface LineStep {
  position: string;
  bucket: string;
}

export interface ActionOption {
  bucket: string;
  count: number;
  frequency: number;
  geometricRatio: number;
  /** GTOノードのみ: そのアクションのEV(bb)。GEO(実測)ノードでは未設定。 */
  evBb?: number;
}

export interface TreeNode {
  position: string | null;
  sampleSize: number;
  options: ActionOption[];
  /** GTO(ソルバー計算)ノードなら true。表示(件数を隠す等)を切り替えるために使う。 */
  isGto?: boolean;
}

export interface HandClassCell {
  label: string;
  count: number;
  byBucket: Record<string, number>;
}

export interface HandClassMatrixResult {
  cells: HandClassCell[][];
  totalSamples: number;
}

export interface NodeResult {
  node: TreeNode;
  matrix: HandClassMatrixResult;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${SERVER_URL}${path}`, {
    method: "POST",
    cache: "no-store",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`GEO tree API request failed: ${path} (${res.status})`);
  return (await res.json()) as T;
}

/** トナメ偏差値でGEO集計をフィルタする範囲(min〜max)。 */
export interface RatingRange {
  min: number;
  max: number;
}

export const geoTreeApi = {
  preflopNode: (params: { stackBucket: StackBucket; bubbleStage: BubbleStage; line: LineStep[]; ratingRange?: RatingRange }) =>
    postJson<NodeResult>("/api/geo-tree/preflop-node", params),
  postflopNode: (params: {
    stackBucket: StackBucket;
    bubbleStage: BubbleStage;
    preflopLine: LineStep[];
    board: string[];
    street: "flop" | "turn" | "river";
    postflopLine: LineStep[];
    ratingRange?: RatingRange;
  }) => postJson<NodeResult>("/api/geo-tree/postflop-node", params),
  /** GTOタブ用: 自社計算したGTO解のノード。RFI(プリフロップ)＋HUプッシュ/フォールドNash。 */
  gtoNode: (params: { line?: LineStep[]; variant?: "pushfold"; stackBucket?: StackBucket; side?: "jam" | "call" }) =>
    postJson<NodeResult>("/api/geo-tree/gto-node", params),
};
