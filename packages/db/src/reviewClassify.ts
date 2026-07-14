/**
 * 分類エンジン。heroの1アクションを、GTO最善からのEV損(bb)で9段階に格付けする。
 * チェスドットコムのGame Reviewのポーカー版。分類は「意思決定の質(EV)」のみで付け、
 * ハンドの勝敗(結果)は一切考慮しない。
 *
 * 段階(良い順):
 *   芸術的(artistic) > 最善(best) > Great(great) > 良手(excellent) > 好手(good)
 *   > Book(book) > 緩手(inaccuracy) > 悪手(mistake) > 大悪手(blunder)
 *
 * 芸術的は当面「難しい好手」型のみで運用する(エクスプロイト型は母集団データ蓄積後に解禁)。
 */

export type Classification =
  | "artistic"
  | "best"
  | "great"
  | "excellent"
  | "good"
  | "book"
  | "inaccuracy"
  | "mistake"
  | "blunder";

/** 良い順の並び(UI/集計用)。数値が小さいほど良い。 */
export const CLASSIFICATION_ORDER: Record<Classification, number> = {
  artistic: 0,
  best: 1,
  great: 2,
  excellent: 3,
  good: 4,
  book: 5,
  inaccuracy: 6,
  mistake: 7,
  blunder: 8,
};

/** 日本語表示ラベル。 */
export const CLASSIFICATION_LABEL: Record<Classification, string> = {
  artistic: "芸術的",
  best: "最善",
  great: "Great",
  excellent: "良手",
  good: "好手",
  book: "Book",
  inaccuracy: "緩手",
  mistake: "悪手",
  blunder: "大悪手",
};

/** バッジのグリフ(色付き丸SVGバッジに内包する記号)。絵文字は使わない。 */
export const CLASSIFICATION_GLYPH: Record<Classification, string> = {
  artistic: "✦",
  best: "★",
  great: "!",
  excellent: "",
  good: "",
  book: "B",
  inaccuracy: "?!",
  mistake: "?",
  blunder: "??",
};

/**
 * EV損(bb)のバンド境界。要チューニング。§仕様書 §4/§6。
 *   最善 ≈ 0 / 良手 < 0.1 / 好手 < 0.3 / 緩手 0.3-0.8 / 悪手 0.8-2 / 大悪手 > 2
 */
export const EV_BANDS = {
  best: 0.02, // これ以下は実質最善(混合戦略の等EV手も含む)
  excellent: 0.1,
  good: 0.3,
  inaccuracy: 0.8,
  mistake: 2.0,
} as const;

/** 芸術的(難しい好手)判定のパラメータ。 */
export const ARTISTIC = {
  /** EV損がこれ以下ならGTO的に正しい(=「好手」以上)とみなす。 */
  maxEvLossBb: 0.05,
  /** GTO頻度がこれ以下なら「見つけにくい」とみなす。 */
  maxGtoFreq: 0.15,
} as const;

/** 「難しい好手」の対象アクション種別(ユーザー確定: 薄いバリュー/オーバーベット/ヒーローコール/ライトフォールド)。 */
export type DifficultActionKind = "thinValue" | "overbet" | "heroCall" | "lightFold";

export interface GtoActionEV {
  /** アクションのバケット識別子(geoApiのbucketと同じ語彙)。 */
  bucket: string;
  frequency: number;
  evBb: number;
}

export interface ClassifyInput {
  /** GTO基準の各アクション(頻度+EV)。 */
  gtoActions: GtoActionEV[];
  /** heroが実際に取ったアクションのバケット。 */
  chosenBucket: string;
  /** プリフロップか(Book判定に使う)。 */
  isPreflop: boolean;
  /** 「難しい好手」判定用のアクション種別(該当する場合のみ)。 */
  difficultKind?: DifficultActionKind | undefined;
}

export interface ClassifyResult {
  classification: Classification;
  evLossBb: number;
  /** heroの選んだアクションのGTO頻度(見つからなければ0)。 */
  chosenFreq: number;
}

function bestEv(actions: GtoActionEV[]): number {
  return actions.reduce((m, a) => Math.max(m, a.evBb), Number.NEGATIVE_INFINITY);
}

/** heroの選んだバケットに対応するGTOアクションを引く。無ければ null(GTO非推奨手)。 */
function findChosen(actions: GtoActionEV[], bucket: string): GtoActionEV | null {
  return actions.find((a) => a.bucket === bucket) ?? null;
}

/**
 * 1アクションを分類する。gtoActions が空(基準なし)の場合は null を返す(呼び出し側で対象外扱い)。
 */
export function classifyDecision(input: ClassifyInput): ClassifyResult | null {
  const { gtoActions, chosenBucket, isPreflop, difficultKind } = input;
  if (gtoActions.length === 0) return null;

  const max = bestEv(gtoActions);
  const chosen = findChosen(gtoActions, chosenBucket);
  // GTOツリーに無いアクション(頻度0で解が割り当てていない手)は、最善EVから見て
  // 最も低いEVの手と同等かそれ以下と見なし、大きめのEV損を割り当てる。
  const chosenEv = chosen ? chosen.evBb : Math.min(...gtoActions.map((a) => a.evBb));
  const chosenFreq = chosen ? chosen.frequency : 0;
  const evLossBb = Math.max(0, max - chosenEv);

  // --- 芸術的(難しい好手): EV損ほぼゼロ かつ 低頻度 かつ 対象アクション種別 ---
  if (
    difficultKind !== undefined &&
    evLossBb <= ARTISTIC.maxEvLossBb &&
    chosenFreq > 0 &&
    chosenFreq <= ARTISTIC.maxGtoFreq
  ) {
    return { classification: "artistic", evLossBb, chosenFreq };
  }

  // --- EV損がほぼゼロ(正着)の場合、Great / Book / 最善 を判定 ---
  if (evLossBb <= EV_BANDS.best) {
    // Great: +EVが実質一択の局面(最善と次善のEV差が大きい)で、その最善を選んだ。
    const sorted = [...gtoActions].sort((a, b) => b.evBb - a.evBb);
    const gap = sorted.length >= 2 ? (sorted[0]!.evBb - sorted[1]!.evBb) : Number.POSITIVE_INFINITY;
    if (gap >= 1.0 && chosen !== null && chosen.evBb >= max - EV_BANDS.best) {
      return { classification: "great", evLossBb, chosenFreq };
    }
    // Book: プリフロップで、GTOが高頻度で選ぶ標準レンジ通りの手(教科書的・凡庸だが正しい)。
    if (isPreflop && chosen !== null && chosenFreq >= 0.7) {
      return { classification: "book", evLossBb, chosenFreq };
    }
    return { classification: "best", evLossBb, chosenFreq };
  }

  if (evLossBb < EV_BANDS.excellent) return { classification: "excellent", evLossBb, chosenFreq };
  if (evLossBb < EV_BANDS.good) return { classification: "good", evLossBb, chosenFreq };
  if (evLossBb < EV_BANDS.inaccuracy) return { classification: "inaccuracy", evLossBb, chosenFreq };
  if (evLossBb < EV_BANDS.mistake) return { classification: "mistake", evLossBb, chosenFreq };
  return { classification: "blunder", evLossBb, chosenFreq };
}

/** 重大度(ミス/芸術的の集計に使う)。 */
export function isMistake(c: Classification): boolean {
  return c === "inaccuracy" || c === "mistake" || c === "blunder";
}

/**
 * トナメ/ハンドのGTO精度%(0-100)。平均EV損を指数関数で写像する(チェスドットコムのAccuracy相当)。
 * 平均EV損=0 → 100%、損が大きいほど滑らかに低下。kは校正用の定数(暫定)。
 */
export function gtoAccuracyPct(avgEvLossBb: number): number {
  const k = 0.6;
  return Math.round(100 * Math.exp(-k * Math.max(0, avgEvLossBb)));
}
