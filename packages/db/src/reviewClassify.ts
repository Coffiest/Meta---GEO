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
  book: "常識",
  inaccuracy: "緩手",
  mistake: "悪手",
  blunder: "大悪手",
};

/** バッジのグリフ(色付き丸SVGバッジに内包する記号)。絵文字は使わない。 */
export const CLASSIFICATION_GLYPH: Record<Classification, string> = {
  artistic: "!!",
  best: "★",
  great: "!",
  excellent: "",
  good: "",
  book: "",
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

/**
 * プリフロップ専用の3段階バンド(確定仕様)。緩手は付けず、Book(常識)/悪手/大悪手のみ。
 *   常識(book): EV損 < 0.01bb(実質最適。混合戦略の等EV手は理論上ロス0なのでここに残る。0.01は解/丸め誤差の吸収)
 *   悪手(mistake): 0.01 ≤ EV損 < 0.1bb
 *   大悪手(blunder): EV損 ≥ 0.1bb(本来参加すべき手を降りて損した等、全て大悪手)
 * フォールドも他アクションと同じ「最善EV−選択EV」で格付けする(AAフォールドは大悪手)。
 */
export const PREFLOP_BANDS = {
  book: 0.01,
  blunder: 0.1,
} as const;

/** 芸術的(難しい好手)判定のパラメータ。 */
export const ARTISTIC = {
  /** EV損がこれ以下ならGTO的に正しい(=「好手」以上)とみなす。 */
  maxEvLossBb: 0.05,
  /** GTO頻度がこれ以下なら「見つけにくい」とみなす。 */
  maxGtoFreq: 0.15,
} as const;

/**
 * 芸術的(エクスプロイト成立)判定のパラメータ。GEO母集団(n≥minGeoSamples)がGTO均衡から
 * 大きく乖離しているスポットで、heroがそのリークを突く定石アクションを取っていたら「芸術的」を付ける。
 */
export const EXPLOIT = {
  /** 母集団頻度がGTOからこれ以上(pt)乖離していたら「リーク」とみなす。 */
  minLeak: 0.2,
  /** heroの選択がGTOでこれより高頻度(=標準的)ならエクスプロイトとはみなさない。 */
  maxGtoFreq: 0.3,
  /** GTO比のEV損がこれを超える手は、搾取ではなく単なるスプ―ウとみなし芸術的にしない。 */
  maxGtoEvLossBb: 1.5,
  /** 信頼できる母集団サイズ(これ未満のGEOノードはエクスプロイト判定に使わない)。 */
  minGeoSamples: 5000,
} as const;

/** バケットがアグレッシブ(ベット/レイズ/オールイン)か。 */
function isAggroBucket(b: string): boolean {
  return b.startsWith("raise") || b.startsWith("bet") || b === "allIn";
}
/** バケットが受け身(コール/チェック)か。 */
function isPassiveBucket(b: string): boolean {
  return b === "call" || b === "checkOrCall";
}

export interface GeoExploitInput {
  /** GTO基準の各アクション(頻度)。 */
  gtoActions: GtoActionEV[];
  /** GEO母集団(n≥minGeoSamples)の各アクション頻度。 */
  geoOptions: { bucket: string; frequency: number }[];
  /** heroが実際に取ったアクションのバケット。 */
  chosenBucket: string;
  /** GTO基準からのEV損(bb)。大きすぎる手は搾取ではなくスプ―ウ。 */
  evLossBb: number;
}

/**
 * 「母集団リーク × 定石カウンター」型のエクスプロイト成立判定。
 *  - 母集団フォールド過多 → heroの攻撃(ブラフ含む)で搾取。
 *  - 母集団コール/受け身過多(スティッキー) → heroの薄いバリュー攻撃で搾取。
 *  - 母集団アグレッション過多(ブラフ/オーバーベット過多) → heroのヒーローコール/受け身継続で搾取。
 * heroの選択はGTOで高頻度すぎない(=非自明な逸脱)ことを要求し、標準プレイを片端から芸術的にしない。
 * また、GTO比のEV損が大きすぎる手は搾取ではなくスプ―ウとみなして除外する。
 */
export function detectGeoExploit(input: GeoExploitInput): boolean {
  const { gtoActions, geoOptions, chosenBucket, evLossBb } = input;
  if (geoOptions.length === 0) return false;
  if (evLossBb > EXPLOIT.maxGtoEvLossBb) return false;

  const gtoFreq = new Map(gtoActions.map((a) => [a.bucket, a.frequency]));
  const geoFreq = new Map(geoOptions.map((o) => [o.bucket, o.frequency]));

  const chosenGtoFreq = gtoFreq.get(chosenBucket) ?? 0;
  // GTOで高頻度=標準的すぎる手はエクスプロイトではない。
  if (chosenGtoFreq > EXPLOIT.maxGtoFreq) return false;

  const buckets = new Set<string>([...gtoFreq.keys(), ...geoFreq.keys()]);
  const overFold = (geoFreq.get("fold") ?? 0) - (gtoFreq.get("fold") ?? 0);
  let geoPassive = 0;
  let gtoPassive = 0;
  let geoAggro = 0;
  let gtoAggro = 0;
  for (const b of buckets) {
    if (isPassiveBucket(b)) {
      geoPassive += geoFreq.get(b) ?? 0;
      gtoPassive += gtoFreq.get(b) ?? 0;
    } else if (isAggroBucket(b)) {
      geoAggro += geoFreq.get(b) ?? 0;
      gtoAggro += gtoFreq.get(b) ?? 0;
    }
  }
  const overPassive = geoPassive - gtoPassive;
  const overAggro = geoAggro - gtoAggro;

  const chosenAggro = isAggroBucket(chosenBucket);
  const chosenPassive = isPassiveBucket(chosenBucket);

  // 1) 母集団フォールド過多 → heroの攻撃(フォールドエクイティ搾取)。
  if (overFold >= EXPLOIT.minLeak && chosenAggro) return true;
  // 2) 母集団コール/受け身過多 → heroの薄いバリュー攻撃(コールされて価値が出る)。
  if (overPassive >= EXPLOIT.minLeak && chosenAggro) return true;
  // 3) 母集団アグレッション過多(ブラフ/オーバーベット過多) → heroのヒーローコール/受け身継続。
  if (overAggro >= EXPLOIT.minLeak && chosenPassive) return true;
  return false;
}

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

  const chosen = findChosen(gtoActions, chosenBucket);
  // GTOツリーに無いアクション(頻度0で解が割り当てていない手)は、最善EVから見て
  // 最も低いEVの手と同等かそれ以下と見なし、大きめのEV損を割り当てる。
  const chosenEv = chosen ? chosen.evBb : Math.min(...gtoActions.map((a) => a.evBb));
  const chosenFreq = chosen ? chosen.frequency : 0;

  // 基準(=均衡のゲーム値)は「GTOが実際にプレイする(頻度>0)アクションのEV最大値」。
  // 頻度0の幻のアクション(解が割り当てていないのにモデルEVだけ高い手)で基準が吊り上がり、
  // EV損を過大評価するのを防ぐ。
  const played = gtoActions.filter((a) => a.frequency > 0);
  const baseline = played.length > 0 ? bestEv(played) : bestEv(gtoActions);

  // GTOが最も推奨する(最大頻度の)アクションを選んだなら、それがGTOの推し手=EV損0(正解)とみなす。
  // 例: GTOがフォールドを推奨(頻度100%)→フォールド。モデル上のfold EVが負(幻の高EV手のせい)でも
  // 大悪手にしない(常識/正着として扱う)。
  // 一方、AAを10bbジャムに降りる等はコールが最大頻度でフォールドは推奨手でないため、
  // EV損(コールEV−フォールドEV)で評価され大悪手になる。
  // 混合戦略の非最大頻度側を選んだ場合は、GTOが等EVでプレイする手ならEV損≈0で常識/最善に落ち、
  // モデル上EVが大きく劣る手だけが悪手として拾われる。
  const maxFreq = gtoActions.reduce((m, a) => Math.max(m, a.frequency), 0);
  const choseRecommended = chosenFreq > 0 && chosenFreq >= maxFreq - 1e-9;
  const evLossBb = choseRecommended ? 0 : Math.max(0, baseline - chosenEv);

  // --- プリフロップは3段階(確定仕様): 正着=常識(book) / 悪手 / 大悪手 ---
  // 「合っていたら常識、間違っていたらEV損で段階分け」。緩手/芸術的/最善/Great等は付けない。
  // EV損0.1bb以上は全て大悪手。フォールドも他アクションと同じEV損で格付けする。
  if (isPreflop) {
    if (evLossBb < PREFLOP_BANDS.book) return { classification: "book", evLossBb, chosenFreq };
    if (evLossBb < PREFLOP_BANDS.blunder) return { classification: "mistake", evLossBb, chosenFreq };
    return { classification: "blunder", evLossBb, chosenFreq };
  }

  // --- 芸術的(難しい好手): EV損ほぼゼロ かつ 低頻度 かつ 対象アクション種別 ---
  if (
    difficultKind !== undefined &&
    evLossBb <= ARTISTIC.maxEvLossBb &&
    chosenFreq > 0 &&
    chosenFreq <= ARTISTIC.maxGtoFreq
  ) {
    return { classification: "artistic", evLossBb, chosenFreq };
  }

  // --- EV損がほぼゼロ(正着)の場合、Great / 最善 を判定 ---
  if (evLossBb <= EV_BANDS.best) {
    // Great: +EVが実質一択の局面(最善と次善のEV差が大きい)で、その最善を選んだ。
    const sorted = [...gtoActions].sort((a, b) => b.evBb - a.evBb);
    const gap = sorted.length >= 2 ? (sorted[0]!.evBb - sorted[1]!.evBb) : Number.POSITIVE_INFINITY;
    if (gap >= 1.0 && chosenFreq > 0 && chosenEv >= baseline - EV_BANDS.best) {
      return { classification: "great", evLossBb, chosenFreq };
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
