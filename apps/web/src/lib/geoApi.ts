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

/**
 * GTOタブのエフェクティブスタック選択(実スタック深度)。GEOタブの範囲バケットとは別軸で、
 * GTO Wizard風に 100/30/20/15/10/5 BB の6段を直接選ぶ。各深度を転記レンジのバンドキーへ写像する
 * (packages/db preflopEvModel.bandOfStack と整合)。push/fold/Nashノードはband非対応のため
 * 併せて近い範囲バケットも送る。
 */
export const GTO_STACKS = [100, 30, 20, 15, 10, 5] as const;
export type GtoStack = (typeof GTO_STACKS)[number];
export const GTO_STACK_LABELS: Record<GtoStack, string> = {
  100: "100BB",
  30: "30BB",
  20: "20BB",
  15: "15BB",
  10: "10BB",
  5: "5BB",
};
export const GTO_STACK_TO_BAND: Record<GtoStack, string> = {
  100: "100",
  30: "30",
  20: "20",
  15: "14",
  10: "10",
  5: "7",
};
export const GTO_STACK_TO_BUCKET: Record<GtoStack, StackBucket> = {
  100: "30+",
  30: "30+",
  20: "20-30",
  15: "15-20",
  10: "10-15",
  5: "5-10",
};

export type BubbleStage = "normal" | "30" | "20" | "10" | "5" | "4" | "3" | "2" | "1" | "finalTable";
export const BUBBLE_STAGES: BubbleStage[] = ["normal", "30", "20", "10", "5", "4", "3", "2", "1", "finalTable"];
export const BUBBLE_STAGE_LABELS: Record<BubbleStage, string> = {
  normal: "全体",
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

// オープンレンジ(2〜5bb)を1つの raise2-5 に統合。5bb超(主に3bet/4bet)は raise5+。allInは別。
export type PreflopBucket = "fold" | "call" | "raise2-5" | "raise5+" | "allIn";
/** 弱→強(アグレッション順)の固定順。頻度ではなくこの順でセル/バーを並べる。 */
export const PREFLOP_BUCKETS: PreflopBucket[] = ["fold", "call", "raise2-5", "raise5+", "allIn"];
export const PREFLOP_BUCKET_LABELS: Record<PreflopBucket, string> = {
  fold: "Fold",
  call: "Call",
  "raise2-5": "Raise 2-5bb",
  "raise5+": "Raise 5bb+",
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
  /** GTOポストフロップ: サーバーがまだ計算中(ポーリングで再取得する)。 */
  solving?: boolean;
}

/**
 * GEO API の失敗を「原因が一目で分かる形」で運ぶエラー。
 *
 * 以前は postJson が素の Error を投げ、呼び出し側が `catch {}` で握り潰していたため、
 * 画面には「接続を再試行中…」しか出ず、通信断なのか・サーバーが500を返したのか・
 * ただ遅いだけなのかを切り分ける手掛かりが一切残らなかった。
 */
export type GeoApiErrorKind =
  /** 端末がオフライン(navigator.onLine === false)。 */
  | "offline"
  /** 制限時間内に応答が返らなかった(サーバーが重い/詰まっている)。 */
  | "timeout"
  /** サーバーまで到達できない(DNS/接続拒否/CORS/デプロイ中など)。 */
  | "network"
  /** 到達したがHTTPエラー応答(4xx/5xx)。 */
  | "http"
  /** 応答は返ったがJSONとして解釈できない。 */
  | "parse";

export class GeoApiError extends Error {
  readonly kind: GeoApiErrorKind;
  readonly path: string;
  readonly status: number | null;
  /** サーバーが返したエラー本文(先頭200文字)。原因特定の決め手になることが多い。 */
  readonly serverMessage: string | null;
  readonly elapsedMs: number;

  constructor(params: {
    kind: GeoApiErrorKind;
    path: string;
    status?: number | null;
    serverMessage?: string | null;
    elapsedMs: number;
    message: string;
  }) {
    super(params.message);
    this.name = "GeoApiError";
    this.kind = params.kind;
    this.path = params.path;
    this.status = params.status ?? null;
    this.serverMessage = params.serverMessage ?? null;
    this.elapsedMs = params.elapsedMs;
  }

  /** 画面にそのまま出せる日本語の一文(原因が読んで分かる粒度)。 */
  describe(): string {
    const sec = (this.elapsedMs / 1000).toFixed(1);
    switch (this.kind) {
      case "offline":
        return "端末がオフラインです。通信環境をご確認ください。";
      case "timeout":
        return `サーバーが${sec}秒以内に応答しませんでした（サーバーが混雑しています）。`;
      case "network":
        return `サーバーに接続できませんでした（${sec}秒で失敗）。デプロイ中か、通信が遮断されている可能性があります。`;
      case "http":
        return `サーバーがエラーを返しました（HTTP ${this.status}${this.serverMessage ? `: ${this.serverMessage}` : ""}）。`;
      case "parse":
        return "サーバーの応答を解釈できませんでした（想定外の形式）。";
    }
  }

  /** 問い合わせ用にコピーできる1行の技術詳細。 */
  detailLine(): string {
    return `${this.kind} ${this.path}${this.status ? ` status=${this.status}` : ""} elapsed=${Math.round(this.elapsedMs)}ms`;
  }
}

/**
 * 応答を待つ上限。これを超えたら中断して再試行する。
 *
 * 上限を設けていなかったため、サーバーが詰まって応答を返さないと fetch が永久に解決せず、
 * 画面が「接続を再試行中…」のまま何分でも固まっていた。打ち切って再試行するほうが速く復帰する。
 */
const REQUEST_TIMEOUT_MS = 12_000;

async function postJson<T>(path: string, body: unknown, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
  const startedAt = Date.now();
  const elapsed = () => Date.now() - startedAt;

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new GeoApiError({ kind: "offline", path, elapsedMs: 0, message: "offline" });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${SERVER_URL}${path}`, {
      method: "POST",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    const aborted = controller.signal.aborted;
    throw new GeoApiError({
      kind: aborted ? "timeout" : "network",
      path,
      elapsedMs: elapsed(),
      message: aborted ? `timeout after ${timeoutMs}ms` : err instanceof Error ? err.message : String(err),
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    // サーバーが返した本文(JSONの error フィールド、無ければ生テキスト)を原因として持ち回る。
    let serverMessage: string | null = null;
    try {
      const text = (await res.text()).slice(0, 200);
      try {
        const parsed = JSON.parse(text) as { error?: unknown };
        serverMessage = typeof parsed.error === "string" ? parsed.error : text || null;
      } catch {
        serverMessage = text || null;
      }
    } catch {
      /* 本文が読めなくてもステータスだけで十分な情報になる */
    }
    throw new GeoApiError({
      kind: "http",
      path,
      status: res.status,
      serverMessage,
      elapsedMs: elapsed(),
      message: `HTTP ${res.status}`,
    });
  }

  try {
    return (await res.json()) as T;
  } catch (err) {
    throw new GeoApiError({
      kind: "parse",
      path,
      status: res.status,
      elapsedMs: elapsed(),
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

/** トナメ偏差値でGEO集計をフィルタする範囲(min〜max)。 */
export interface RatingRange {
  min: number;
  max: number;
}

export const geoTreeApi = {
  preflopNode: (params: {
    stackBucket: StackBucket;
    bubbleStage: BubbleStage;
    line: LineStep[];
    ratingRange?: RatingRange;
    /** 卓の参加人数(2〜6)。未指定なら全人数。 */
    playerCount?: number;
  }) => postJson<NodeResult>("/api/geo-tree/preflop-node", params),
  postflopNode: (params: {
    stackBucket: StackBucket;
    bubbleStage: BubbleStage;
    preflopLine: LineStep[];
    board: string[];
    street: "flop" | "turn" | "river";
    postflopLine: LineStep[];
    ratingRange?: RatingRange;
    /** 卓の参加人数(2〜6)。未指定なら全人数。 */
    playerCount?: number;
  }) => postJson<NodeResult>("/api/geo-tree/postflop-node", params),
  /** GTOタブ用: 自社計算したGTO解のノード。RFI(プリフロップ)＋HUプッシュ/フォールドNash。
   * band を渡すとバンド系ノード(RFI/vsOpen/vs3bet)はそのバンドを直接使う(実スタック選択用)。 */
  gtoNode: (params: { line?: LineStep[]; variant?: "pushfold" | "full"; stackBucket?: StackBucket; band?: string; side?: "jam" | "call" }) =>
    postJson<NodeResult>("/api/geo-tree/gto-node", params),
  gtoPostflopNode: (params: { stackBucket: StackBucket; band?: string; line: LineStep[]; board: string[]; postflopLine: LineStep[] }) =>
    postJson<NodeResult>("/api/geo-tree/gto-postflop-node", params),
};
