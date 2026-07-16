import type { Card, HandCombo, NodeStrategy } from "@meta-geo/engine";
import { parseCard, solvePostflopHuAsync } from "@meta-geo/engine";
import { cellLabel } from "./geoTree.js";
import { expandToken } from "./preflopBaseline.js";
import type { GtoNodeResult } from "./preflopBaseline.js";
import { PREFLOP_BANDS } from "./data/preflop100.js";
import { getVsOpenCallRange, getVsOpen3betRange, getVsOpenCallVs3betRange, getVsOpen3betToBb } from "./preflopVsOpenBaseline.js";
import { canonicalizeBoard, spotKeyOf } from "./solverSpot.js";

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
    // サイズ帯一致: そのバケットに対応するbetアクションを厳密に選ぶ(複数サイズ木でも一致)。
    const bets = available.filter((a) => a.startsWith("bet"));
    for (const a of bets) if (toBucket(a) === bucket) return a;
    return bets[0] ?? null; // フォールバック(単一サイズ抽象化)
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
  /** スポットの全ノード戦略を永続化用にシリアライズする(ライブ解のみ実装。復元ハンドルは持たない)。 */
  snapshot?(): GtoPostflopSpotSnapshot;
}

/**
 * ノード戦略のコンパクト表現(DB保存/転送用)。フル13x13グリッドは冗長なので
 * 有効(レンジ内)セルだけを疎に保存し、復元時に完全グリッドへ展開する。
 * - p: 手番ポジション / o: レンジ全体のアクション分布 [bucket, freq]
 * - a: 有効セル [rc(=row*13+col), [[bucket, freq]...]] / t: totalSamples
 * 頻度は4桁丸めでサイズを抑える。
 */
export interface CompactGtoNode {
  p: string | null;
  o: [string, number][];
  a: [number, [string, number][]][];
  t: number;
}

/**
 * スポットの全ノード戦略を「postflopLineバケット列 → コンパクトノード」の辞書としてシリアライズしたもの。
 * DB(GtoSolution.solution)へそのまま保存でき、復元ハンドルは辞書引き+展開で軽量にノードを返す。
 * ルート(アクション無し)のキーは空文字。ライン区切りは "|"。
 */
export interface GtoPostflopSpotSnapshot {
  nodes: Record<string, CompactGtoNode>;
}

/** GtoNodeResult → コンパクトノード(有効セルのみ疎に保持)。 */
function compactNode(r: GtoNodeResult): CompactGtoNode {
  const round4 = (x: number) => Math.round(x * 1e4) / 1e4;
  const a: [number, [string, number][]][] = [];
  r.matrix.cells.forEach((row, ri) =>
    row.forEach((cell, ci) => {
      if (cell.count > 0) {
        const bb = Object.entries(cell.byBucket).map(([b, f]) => [b, round4(f)] as [string, number]);
        a.push([ri * 13 + ci, bb]);
      }
    }),
  );
  return { p: r.position, o: r.options.map((o) => [o.bucket, round4(o.frequency)] as [string, number]), a, t: r.matrix.totalSamples };
}

/** コンパクトノード → GtoNodeResult(完全13x13グリッドへ展開)。 */
function expandNode(cn: CompactGtoNode): GtoNodeResult {
  const activeMap = new Map<number, [string, number][]>();
  for (const [rc, bb] of cn.a) activeMap.set(rc, bb);
  const cells = Array.from({ length: 13 }, (_, row) =>
    Array.from({ length: 13 }, (_, col) => {
      const lbl = cellLabel(row, col);
      const combos = lbl.length === 2 ? 6 : lbl.endsWith("s") ? 4 : 12;
      const active = activeMap.get(row * 13 + col);
      const byBucket: Record<string, number> = {};
      if (active) for (const [b, f] of active) byBucket[b] = f;
      return { label: lbl, count: active ? combos : 0, byBucket, evByBucket: {} as Record<string, number> };
    }),
  );
  const options = cn.o.map(([bucket, frequency]) => ({ bucket, frequency, geometricRatio: 0, evBb: 0 }));
  return { position: cn.p, options, matrix: { cells, totalSamples: cn.t } };
}

/** ソルバー版・ベットツリー識別子(spotKey/betTreeに反映)。解の形式を変えたら上げる。 */
export const GTO_POSTFLOP_SOLVER_VERSION = "cfr-srp-0.75-v1";

/** 永続キャッシュ用の spotKey コンポーネント(GtoSolutionの各カラムにも使う)。
 * actionLine: "srp"=シングルレイズドポット / "3bp"=3betポット。 */
export function gtoPostflopSpotComponents(band: string, opener: string, defender: string, board: string[], actionLine: string = "srp") {
  const street = board.length === 3 ? "flop" : board.length === 4 ? "turn" : "river";
  return {
    street,
    effStackBucket: band,
    heroPos: `${opener}v${defender}`,
    boardCanon: canonicalizeBoard(board),
    actionLine,
    betTree: GTO_POSTFLOP_SOLVER_VERSION,
  };
}

/** スート正規化込みの決定的 spotKey。suit-isomorphicなボードは同一キーに集約される。 */
export function gtoPostflopSpotKey(band: string, opener: string, defender: string, board: string[], actionLine: string = "srp"): string {
  return spotKeyOf(gtoPostflopSpotComponents(band, opener, defender, board, actionLine));
}

/** ソルバー品質オーバーライド(事前計算バッチ用。省略時はSTREET_BUDGETの既定)。 */
export interface GtoPostflopQuality {
  iterations?: number;
  sampleChance?: number;
  betSizes?: number[];
}

export interface GtoPostflopSpotParams {
  band: string; // "100" | "20" | "14"
  openerPos: string;
  defenderPos: string;
  board: string[]; // "As" 形式 3〜5枚
  /** 事前計算時に反復数/チャンスサンプル/ベットサイズを上書き(オンデマンドは未指定=既定)。 */
  quality?: GtoPostflopQuality;
}

/** 他プレイヤーの死に金(自分とヒーロー2人以外のブラインド+BBアンティ)。 */
function deadOthersOf(openerPos: string, defenderPos: string): number {
  let deadOthers = 0;
  for (const b of ["SB", "BB"] as const) {
    if (b === openerPos || b === defenderPos) continue;
    deadOthers += b === "SB" ? 0.5 : 2.0;
  }
  return deadOthers;
}

/**
 * レンジ+ポット/スタックを与えてHUポストフロップを解き、ノード問い合わせハンドルを返す(SRP/3bet共通コア)。
 * heroForLabels は heroPos ラベル解決用に openerPos/defenderPos だけを保持する。
 */
async function solveRangedSpot(args: {
  openerPos: string;
  defenderPos: string;
  openerCombos: HandCombo[];
  callerCombos: HandCombo[];
  board: Card[];
  potBb: number;
  stackBb: number;
  quality?: GtoPostflopQuality | undefined;
}): Promise<GtoPostflopSpotHandle> {
  const budget = STREET_BUDGET[args.board.length]!;
  // OOP = ポストフロップで先に行動する側(絶対ポジション順)。
  const openerIsOop = POSTFLOP_ORDER.indexOf(args.openerPos) < POSTFLOP_ORDER.indexOf(args.defenderPos);
  const oop = openerIsOop ? args.openerCombos : args.callerCombos;
  const ip = openerIsOop ? args.callerCombos : args.openerCombos;
  const params: GtoPostflopSpotParams = { band: "", openerPos: args.openerPos, defenderPos: args.defenderPos, board: [] };

  const q = args.quality;
  const iterations = q?.iterations ?? budget.iterations;
  const sampleChance = q?.sampleChance ?? budget.sampleChance;
  const betSizes = q?.betSizes ?? [0.75];

  const handle = await solvePostflopHuAsync({
    board: args.board,
    oop,
    ip,
    potBb: args.potBb,
    stackBb: args.stackBb,
    betSizes,
    allowRaise: true,
    iterations,
    ...(sampleChance !== undefined ? { sampleChance } : {}),
  });

  return {
    nodeFor(postflopLine: string[]): GtoNodeResult {
      return buildNodeFromHandle(handle.queryNode, params, openerIsOop, postflopLine);
    },
    snapshot(): GtoPostflopSpotSnapshot {
      return snapshotSpot(handle.queryNode, params, openerIsOop);
    },
  };
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

  // レンジ構築: オープナー=転記オープンレンジ / コーラー=vsオープンのコールレンジ。
  const openRange: Record<string, number> = {};
  for (const t of openPos.raise) for (const cls of expandToken(t)) openRange[cls] = 1;
  const openerCombos = expandClassCombos(openRange);
  const callerCombos = expandClassCombos(callRange);

  // ポット/スタック(ChipEV, BBアンティ)。genPreflopVsOpen と同じ会計。
  const R = openPos.raiseSize;
  const deadOthers = deadOthersOf(params.openerPos, params.defenderPos);
  const anteExtra = params.defenderPos === "BB" ? 1 : 0;
  const potBb = R + anteExtra + R + deadOthers;
  const stackBb = S - R;

  return solveRangedSpot({
    openerPos: params.openerPos,
    defenderPos: params.defenderPos,
    openerCombos,
    callerCombos,
    board: board as Card[],
    potBb,
    stackBb,
    quality: params.quality,
  });
}

/**
 * 3betポット(オープン→3bet→コール)のHUポストフロップ・スポットを解く。
 * - 3bettor = defender(vsオープンの3betレンジ)。caller = opener(オープナーのcall-vs-3betレンジ)。
 * - ポット/スタック会計は genPreflopVsOpen の pot3/i3(BBアンティ)と同式。
 * データ未整備(3betレンジ/コールレンジ欠如)や不正ボードなら null。
 */
export async function prepareGto3betPostflopSpot(params: GtoPostflopSpotParams): Promise<GtoPostflopSpotHandle | null> {
  const S = BAND_DEPTH[params.band];
  const openPos = PREFLOP_BANDS[params.band]?.[params.openerPos];
  if (!S || !openPos || !openPos.raise) return null;
  const threeBetRange = getVsOpen3betRange(params.band, params.openerPos, params.defenderPos);
  const callVs3betRange = getVsOpenCallVs3betRange(params.band, params.openerPos, params.defenderPos);
  const threeBetToBb = getVsOpen3betToBb(params.band, params.openerPos, params.defenderPos);
  if (!threeBetRange || !callVs3betRange || !threeBetToBb) return null;
  if (Object.keys(threeBetRange).length === 0 || Object.keys(callVs3betRange).length === 0) return null;
  const board = params.board.map((c) => parseCard(c));
  if (board.some((c) => !c) || board.length < 3 || board.length > 5) return null;

  // 3bettor=defender / caller=opener。combos は頻度加重。
  const threeBettorCombos = expandClassCombos(threeBetRange);
  const callerCombos = expandClassCombos(callVs3betRange);

  // ポット/スタック: genPreflopVsOpen と同式。i3=B3+anteExtra, pot3=i3+B3+deadOthers, stack=S-B3。
  const B3 = threeBetToBb;
  const deadOthers = deadOthersOf(params.openerPos, params.defenderPos);
  const anteExtra = params.defenderPos === "BB" ? 1 : 0;
  const i3 = B3 + anteExtra;
  const potBb = i3 + B3 + deadOthers;
  const stackBb = S - B3;

  // solveRangedSpot は openerCombos=caller(opener) / callerCombos=3bettor(defender) を期待する。
  return solveRangedSpot({
    openerPos: params.openerPos,
    defenderPos: params.defenderPos,
    openerCombos: callerCombos, // opener = caller(vs3betでコールした側)
    callerCombos: threeBettorCombos, // defender = 3bettor
    board: board as Card[],
    potBb,
    stackBb,
    quality: params.quality,
  });
}

/**
 * 解いたスポットの全(街内)決定ノードを列挙し、postflopLineバケット列→13x13結果の辞書を作る。
 * ソルバー木をアクションで深さ優先に辿り、各ノードを toBucket でバケット列へ写像して保存する。
 * チャンス/端点(queryNode=null)で枝刈り。単一サイズ抽象では兄弟バケットは衝突しない。
 */
function snapshotSpot(
  queryNode: (path: string[]) => NodeStrategy | null,
  params: GtoPostflopSpotParams,
  openerIsOop: boolean,
): GtoPostflopSpotSnapshot {
  const nodes: Record<string, CompactGtoNode> = {};
  const rec = (solverPath: string[], bucketPath: string[]): void => {
    const node = queryNode(solverPath);
    if (!node) return;
    nodes[bucketPath.join("|")] = compactNode(nodeStrategyToResult(node, params, openerIsOop));
    node.actions.forEach((act) => rec([...solverPath, act], [...bucketPath, toBucket(act)]));
  };
  rec([], []);
  return { nodes };
}

/** スナップショットから軽量な問い合わせハンドルを復元する(辞書引き+展開)。 */
export function deserializeGtoPostflopSpot(snapshot: GtoPostflopSpotSnapshot): GtoPostflopSpotHandle {
  return {
    nodeFor(postflopLine: string[]): GtoNodeResult {
      const hit = snapshot.nodes[postflopLine.join("|")];
      return hit ? expandNode(hit) : { position: null, options: [], matrix: { cells: [], totalSamples: 0 }, unsupported: true };
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
  return nodeStrategyToResult(node, params, openerIsOop);
}

/** 1つの決定ノード戦略を13x13クラス集約のGtoNodeResultへ変換する。 */
function nodeStrategyToResult(node: NodeStrategy, params: GtoPostflopSpotParams, openerIsOop: boolean): GtoNodeResult {
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
