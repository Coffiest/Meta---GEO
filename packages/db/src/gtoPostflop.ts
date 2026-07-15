import type { Card, HandCombo, NodeStrategy } from "@meta-geo/engine";
import { parseCard, solvePostflopHuAsync } from "@meta-geo/engine";
import { cellLabel } from "./geoTree.js";
import { expandToken } from "./preflopBaseline.js";
import type { GtoNodeResult } from "./preflopBaseline.js";
import { PREFLOP_BANDS } from "./data/preflop100.js";
import { getVsOpenCallRange } from "./preflopVsOpenBaseline.js";

/**
 * GTOタブのポストフロップ(SRP: オープン→コール, HU)をCFRソルバーでオンデマンド計算する。
 *
 * - レンジ: オープナー=転記オープンレンジ / コーラー=genPreflopVsOpen のコールレンジ。
 *   ※前ストリートのアクションによる絞り込みは v1 では行わない(チェックスルー前提の近似)。
 * - コンボ間引き: suited=2/4(重み2倍) / pair=2/6(重み3倍) / offsuit=3/12(重み4倍)で計算量を抑える。
 * - 予算: flop=チャンス4サンプル×28反復 / turn=10サンプル×60反復 / river=全列挙×120反復。
 * - 解は solvePostflopHuAsync(毎反復イベントループへ譲る)で計算し、呼び出し側でキャッシュする。
 */

const POSTFLOP_ORDER = ["SB", "BB", "UTG", "HJ", "CO", "BTN"];
const BAND_DEPTH: Record<string, number> = { "100": 100, "20": 20, "14": 14 };

/** handクラス→重み から、間引きしたコンボ列へ展開する。 */
function expandClassCombos(freqByLabel: Record<string, number>): HandCombo[] {
  const SUITS = ["s", "h", "d", "c"] as const;
  const out: HandCombo[] = [];
  for (const [label, w] of Object.entries(freqByLabel)) {
    if (w <= 0) continue;
    const hi = label[0]!;
    const lo = label[1]!;
    if (label.length === 2) {
      // ペア: 6コンボ中2つ、重み3倍。
      const picks: [string, string][] = [
        [`${hi}s`, `${hi}h`],
        [`${hi}d`, `${hi}c`],
      ];
      for (const [a, b] of picks) out.push({ a: parseCard(a)!, b: parseCard(b)!, weight: 3 * w });
    } else if (label.endsWith("s")) {
      // スーテッド: 4コンボ中2つ、重み2倍(フラッシュ系の多様性を保ちつつ削減)。
      for (const s of ["s", "d"] as const) out.push({ a: parseCard(`${hi}${s}`)!, b: parseCard(`${lo}${s}`)!, weight: 2 * w });
    } else {
      // オフスート: 12コンボ中3つ、重み4倍。
      const picks: [string, string][] = [
        [`${hi}s`, `${lo}h`],
        [`${hi}h`, `${lo}d`],
        [`${hi}d`, `${lo}c`],
      ];
      for (const [a, b] of picks) out.push({ a: parseCard(a)!, b: parseCard(b)!, weight: 4 * w });
    }
  }
  return out;
}

/** カード2枚 → 13x13クラスラベル("AKs"等)。 */
const RANK_CHAR: Record<number, string> = { 14: "A", 13: "K", 12: "Q", 11: "J", 10: "T", 9: "9", 8: "8", 7: "7", 6: "6", 5: "5", 4: "4", 3: "3", 2: "2" };
function classOf(a: Card, b: Card): string {
  const hi = Math.max(a.rank, b.rank);
  const lo = Math.min(a.rank, b.rank);
  if (hi === lo) return `${RANK_CHAR[hi]}${RANK_CHAR[hi]}`;
  return `${RANK_CHAR[hi]}${RANK_CHAR[lo]}${a.suit === b.suit ? "s" : "o"}`;
}

/** ソルバーのアクション名 → UIのポストフロップバケット。 */
function toBucket(action: string): string {
  if (action === "check" || action === "call") return "checkOrCall";
  if (action === "fold") return "fold";
  if (action === "allin") return "allIn";
  if (action.startsWith("bet")) {
    const f = Number(action.slice(3));
    const pct = f * 100;
    if (pct < 40) return "bet20-40";
    if (pct < 60) return "bet40-60";
    if (pct < 80) return "bet60-80";
    if (pct <= 100) return "bet80-100";
    return "bet100+";
  }
  return action;
}

/** UIのポストフロップバケット → ノードで利用可能なソルバーアクション名。 */
function fromBucket(bucket: string, available: string[]): string | null {
  if (bucket === "checkOrCall") {
    if (available.includes("check")) return "check";
    if (available.includes("call")) return "call";
    return null;
  }
  if (bucket === "fold") return available.includes("fold") ? "fold" : null;
  if (bucket === "allIn") return available.includes("allin") ? "allin" : null;
  if (bucket.startsWith("bet")) {
    // 単一サイズ抽象化: 最初のbetアクションへスナップ。
    return available.find((a) => a.startsWith("bet")) ?? null;
  }
  return null;
}

export interface GtoPostflopParams {
  band: string; // "100" | "20" | "14"
  openerPos: string;
  defenderPos: string;
  board: string[]; // "As" 形式 3〜5枚
  /** 現ストリート内の既アクション(UIバケット名)。 */
  postflopLine: string[];
}

const STREET_BUDGET: Record<number, { sampleChance?: number; iterations: number }> = {
  3: { sampleChance: 4, iterations: 28 },
  4: { sampleChance: 10, iterations: 60 },
  5: { iterations: 120 },
};

/** 解いたスポット(band×ペア×ボード)への問い合わせハンドル。postflopLine別のノード取り出しは軽量。 */
export interface GtoPostflopSpotHandle {
  nodeFor(postflopLine: string[]): GtoNodeResult;
}

export interface GtoPostflopSpotParams {
  band: string; // "100" | "20" | "14"
  openerPos: string;
  defenderPos: string;
  board: string[]; // "As" 形式 3〜5枚
}

/**
 * SRP(オープン→コール)のHUポストフロップ・スポットを解き、ノード問い合わせハンドルを返す。
 * 解けない(バンド/ペア未整備・不正ボード)なら null。
 */
export async function prepareGtoPostflopSpot(params: GtoPostflopSpotParams): Promise<GtoPostflopSpotHandle | null> {
  const S = BAND_DEPTH[params.band];
  const openPos = PREFLOP_BANDS[params.band]?.[params.openerPos];
  if (!S || !openPos || !openPos.raise) return null;
  const callRange = getVsOpenCallRange(params.band, params.openerPos, params.defenderPos);
  if (!callRange) return null;
  const board = params.board.map((c) => parseCard(c));
  if (board.some((c) => !c) || board.length < 3 || board.length > 5) return null;
  const budget = STREET_BUDGET[board.length]!;

  // レンジ構築。
  const openRange: Record<string, number> = {};
  for (const t of openPos.raise) for (const cls of expandToken(t)) openRange[cls] = 1;
  const openerCombos = expandClassCombos(openRange);
  const callerCombos = expandClassCombos(callRange);

  // OOP = ポストフロップで先に行動する側。
  const openerIsOop = POSTFLOP_ORDER.indexOf(params.openerPos) < POSTFLOP_ORDER.indexOf(params.defenderPos);
  const oop = openerIsOop ? openerCombos : callerCombos;
  const ip = openerIsOop ? callerCombos : openerCombos;

  // ポット/スタック(ChipEV, BBアンティ)。genPreflopVsOpen と同じ会計。
  const R = openPos.raiseSize;
  let deadOthers = 0;
  for (const b of ["SB", "BB"] as const) {
    if (b === params.openerPos || b === params.defenderPos) continue;
    deadOthers += b === "SB" ? 0.5 : 2.0;
  }
  const anteExtra = params.defenderPos === "BB" ? 1 : 0;
  const potBb = R + anteExtra + R + deadOthers;
  const stackBb = S - R;

  const handle = await solvePostflopHuAsync({
    board: board as Card[],
    oop,
    ip,
    potBb,
    stackBb,
    betSizes: [0.75],
    allowRaise: true,
    iterations: budget.iterations,
    ...(budget.sampleChance !== undefined ? { sampleChance: budget.sampleChance } : {}),
  });

  return {
    nodeFor(postflopLine: string[]): GtoNodeResult {
      return buildNodeFromHandle(handle.queryNode, params, openerIsOop, postflopLine);
    },
  };
}

function buildNodeFromHandle(
  queryNode: (path: string[]) => NodeStrategy | null,
  params: GtoPostflopSpotParams,
  openerIsOop: boolean,
  postflopLine: string[],
): GtoNodeResult {
  const unsupported: GtoNodeResult = { position: params.defenderPos, options: [], matrix: { cells: [], totalSamples: 0 }, unsupported: true };
  // postflopLine(バケット名)をソルバーアクションパスへ翻訳しつつ辿る。
  const path: string[] = [];
  for (const bucket of postflopLine) {
    const cur = queryNode(path);
    if (!cur) return unsupported;
    const act = fromBucket(bucket, cur.actions);
    if (!act) return unsupported;
    path.push(act);
  }
  const node: NodeStrategy | null = queryNode(path);
  if (!node) return unsupported;

  const heroPos = (node.player === 0) === openerIsOop ? params.openerPos : params.defenderPos;

  // 13x13クラス集約。
  const byClass: Record<string, { w: number; freq: number[] }> = {};
  node.combos.forEach((c, i) => {
    const cls = classOf(c.a, c.b);
    const cur = (byClass[cls] = byClass[cls] ?? { w: 0, freq: new Array(node.actions.length).fill(0) });
    cur.w += c.weight;
    node.perCombo[i]!.forEach((f, a) => (cur.freq[a] = cur.freq[a]! + c.weight * f));
  });

  let total = 0;
  const optionW: Record<string, number> = {};
  const cells = Array.from({ length: 13 }, (_, row) =>
    Array.from({ length: 13 }, (_, col) => {
      const lbl = cellLabel(row, col);
      const combos = lbl.length === 2 ? 6 : lbl.endsWith("s") ? 4 : 12;
      const entry = byClass[lbl];
      const byBucket: Record<string, number> = {};
      if (entry && entry.w > 0) {
        total += combos;
        node.actions.forEach((act, a) => {
          const f = entry.freq[a]! / entry.w;
          if (f > 0.01) {
            const b = toBucket(act);
            byBucket[b] = (byBucket[b] ?? 0) + f;
            optionW[b] = (optionW[b] ?? 0) + combos * f;
          }
        });
      }
      return { label: lbl, count: entry && entry.w > 0 ? combos : 0, byBucket, evByBucket: {} as Record<string, number> };
    }),
  );

  const options = Object.entries(optionW)
    .map(([bucket, w]) => ({ bucket, frequency: total > 0 ? w / total : 0, geometricRatio: 0, evBb: 0 }))
    .filter((o) => o.frequency > 0.001)
    .sort((a, b) => b.frequency - a.frequency);

  return { position: heroPos, options, matrix: { cells, totalSamples: total } };
}

/** 便宜ラッパー: スポットを解いて postflopLine のノードを返す(キャッシュなし)。 */
export async function solveGtoPostflopNode(params: GtoPostflopParams): Promise<GtoNodeResult> {
  const handle = await prepareGtoPostflopSpot({
    band: params.band,
    openerPos: params.openerPos,
    defenderPos: params.defenderPos,
    board: params.board,
  });
  if (!handle) {
    return { position: params.defenderPos, options: [], matrix: { cells: [], totalSamples: 0 }, unsupported: true };
  }
  return handle.nodeFor(params.postflopLine);
}
