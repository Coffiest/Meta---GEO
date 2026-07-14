import { cellLabel } from "./geoTree.js";

/**
 * プリフロップGTOの「正解データ」= 自社で用意するプリコンピュートNashレンジ表(初期版 v1)。
 *
 * 重要: このv1データは「標準的な6-max RFI(オープン)レンジ」の近似であり、最終的な正しさは
 * database画面の GEO/GTO 切替タブで GTO Wizard と目視比較して検証する(=フェーズ0のゲート)。
 * 検証に通らない部分は、将来オフラインのソルバー出力に差し替える。EV値も暫定の近似。
 *
 * 対応範囲(v1): 各ポジションの「フリーで最初に開くか(RFI)」の意思決定のみ(line=[])。
 * フェイス(vs レイズ)や短スタック個別調整は未整備(nullを返し、UIは「データ未整備」を表示)。
 */

const RANKS = "AKQJT98765432";

function rankIdx(r: string): number {
  return RANKS.indexOf(r === "10" ? "T" : r);
}

/**
 * レンジ文字列トークンを169ハンドクラスのラベル配列へ展開する。
 * 対応記法: "22+"(ペア以上) / "55"(単一ペア) / "ATs+"(スーテッド以上) / "KQo"(オフスート単一) / "JTs"。
 */
export function expandToken(token: string): string[] {
  const t = token.trim();
  // ペア
  if (t.length >= 2 && t[0] === t[1]) {
    const baseIdx = rankIdx(t[0]!);
    if (t.endsWith("+")) {
      const out: string[] = [];
      for (let i = 0; i <= baseIdx; i++) out.push(`${RANKS[i]}${RANKS[i]}`);
      return out;
    }
    return [`${RANKS[baseIdx]}${RANKS[baseIdx]}`];
  }
  // スーテッド/オフスート
  const hi = rankIdx(t[0]!);
  const lo = rankIdx(t[1]!);
  const suited = t.includes("s");
  const suffix = suited ? "s" : "o";
  if (hi < 0 || lo < 0 || hi === lo) return [];
  if (t.endsWith("+")) {
    const out: string[] = [];
    for (let j = hi + 1; j <= lo; j++) out.push(`${RANKS[hi]}${RANKS[j]}${suffix}`);
    return out;
  }
  return [`${RANKS[hi]}${RANKS[lo]}${suffix}`];
}

function expandRange(tokens: string[]): Set<string> {
  const set = new Set<string>();
  for (const tok of tokens) for (const cls of expandToken(tok)) set.add(cls);
  return set;
}

/** 標準的な6-max 100bb RFIレンジ(近似・v1・要検証)。BBはRFIが無い(ディフェンスのみ)。 */
const RFI_TOKENS: Record<string, string[]> = {
  UTG: ["55+", "A9s+", "KTs+", "QTs+", "JTs", "T9s", "98s", "AJo+", "KQo"],
  HJ: ["44+", "A7s+", "A5s", "K9s+", "QTs+", "J9s+", "T9s", "98s", "ATo+", "KJo+", "QJo"],
  CO: ["22+", "A2s+", "K7s+", "Q9s+", "J9s+", "T8s+", "98s", "87s", "76s", "ATo+", "KTo+", "QTo+", "JTo"],
  BTN: [
    "22+", "A2s+", "K2s+", "Q6s+", "J7s+", "T7s+", "97s+", "86s+", "75s+", "64s+", "53s+",
    "A2o+", "K7o+", "Q8o+", "J8o+", "T8o+", "98o",
  ],
  SB: [
    "22+", "A2s+", "K5s+", "Q7s+", "J8s+", "T8s+", "97s+", "86s+", "75s+", "65s", "54s",
    "A2o+", "K8o+", "Q9o+", "J9o+", "T9o",
  ],
};

const RFI_RANGES: Record<string, Set<string>> = Object.fromEntries(
  Object.entries(RFI_TOKENS).map(([pos, toks]) => [pos, expandRange(toks)]),
);

/** RFIで開くときのオープンサイズバケット(v1は一律)。 */
const OPEN_BUCKET = "raise2-2.5";

/** そのハンドクラスのコンボ数(ペア6/スーテッド4/オフスート12)。 */
function combosOf(label: string): number {
  if (label.length === 2) return 6; // ペア
  return label.endsWith("s") ? 4 : 12;
}

export interface GtoActionOut {
  bucket: string;
  frequency: number;
  evBb: number;
}

export interface GtoNodeResult {
  position: string | null;
  /** レンジ全体のアクション分布(GTO Wizardのアクションバー相当)。 */
  options: Array<{ bucket: string; frequency: number; geometricRatio: number; evBb: number }>;
  /** 13x13の各ハンドクラスのアクション頻度。 */
  matrix: {
    cells: Array<Array<{ label: string; count: number; byBucket: Record<string, number>; evByBucket: Record<string, number> }>>;
    totalSamples: number;
  };
  /** v1の対応外(データ未整備)なら true。 */
  unsupported?: boolean;
}

/** 1ハンドクラスのGTOアクション(頻度+EV)。RFI用: レンジ内=オープン、レンジ外=フォールド。 */
export function getPreflopBaseline(params: {
  heroPos: string;
  line: { position: string; bucket: string }[];
  handClass: string;
}): GtoActionOut[] | null {
  // v1はRFI(line空)のみ対応。
  if (params.line.length > 0) return null;
  const range = RFI_RANGES[params.heroPos];
  if (!range) return null;
  const inRange = range.has(params.handClass);
  if (inRange) {
    return [
      { bucket: OPEN_BUCKET, frequency: 1, evBb: 0.3 },
      { bucket: "fold", frequency: 0, evBb: 0 },
    ];
  }
  return [
    { bucket: "fold", frequency: 1, evBb: 0 },
    { bucket: OPEN_BUCKET, frequency: 0, evBb: -0.2 },
  ];
}

/** GTOタブ表示用に、あるRFIノードの13x13マトリクス＋レンジ全体分布を構築する。 */
export function buildPreflopGtoNode(params: { heroPos: string; line: { position: string; bucket: string }[] }): GtoNodeResult {
  if (params.line.length > 0 || !RFI_RANGES[params.heroPos]) {
    return {
      position: params.heroPos,
      options: [],
      matrix: { cells: [], totalSamples: 0 },
      unsupported: true,
    };
  }

  const optionTotals = new Map<string, number>();
  let totalCombos = 0;
  const cells = Array.from({ length: 13 }, (_, row) =>
    Array.from({ length: 13 }, (_, col) => {
      const label = cellLabel(row, col);
      const actions = getPreflopBaseline({ heroPos: params.heroPos, line: [], handClass: label }) ?? [];
      const byBucket: Record<string, number> = {};
      const evByBucket: Record<string, number> = {};
      const combos = combosOf(label);
      for (const a of actions) {
        if (a.frequency > 0) byBucket[a.bucket] = a.frequency;
        evByBucket[a.bucket] = a.evBb;
        optionTotals.set(a.bucket, (optionTotals.get(a.bucket) ?? 0) + a.frequency * combos);
      }
      totalCombos += combos;
      return { label, count: combos, byBucket, evByBucket };
    }),
  );

  const options = [...optionTotals.entries()]
    .filter(([, w]) => w > 0)
    .map(([bucket, w]) => ({
      bucket,
      frequency: totalCombos > 0 ? w / totalCombos : 0,
      geometricRatio: 0,
      evBb: 0,
    }));

  return { position: params.heroPos, options, matrix: { cells, totalSamples: totalCombos } };
}

export const PREFLOP_RFI_POSITIONS = Object.keys(RFI_TOKENS);
