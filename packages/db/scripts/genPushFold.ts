/**
 * HU(ヘッズアップ)プッシュ/フォールドのNash均衡を自力計算し、JSONに書き出す生成スクリプト。
 * GTO Wizardの「HU Push/Fold(ICMなしChipEV Nash)」チャートと直接照合できる、自社計算の正解データ。
 *
 *   実行: pnpm --filter @meta-geo/db exec tsx scripts/genPushFold.ts
 *   出力: packages/db/src/data/pushFoldNash.json
 *
 * モデル(ChipEV, アンティ無し):
 *   有効スタック S(bb)。SBが0.5、BBが1をポスト。SBはjam or fold、BBはjamに対しcall or fold。
 *   SB fold: -0.5 / SB jam & BB fold: +1 / all-in(pot=2S): (2eq-1)*S
 *   BB fold(vs jam): -1 / BB call: (2eq-1)*S
 * 均衡は各手の閾値(pure)。相互ベストレスポンス反復で収束させる。
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Card, Rank, Suit } from "@meta-geo/engine";
import { evaluateBest, compareHandRank } from "@meta-geo/engine";

const SAMPLES = 250;
const DEPTHS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20];
const ITERATIONS = 40;

const RANKS_DESC: Rank[] = [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2];
const RANK_CHAR: Record<number, string> = { 14: "A", 13: "K", 12: "Q", 11: "J", 10: "T", 9: "9", 8: "8", 7: "7", 6: "6", 5: "5", 4: "4", 3: "3", 2: "2" };

function label(row: number, col: number): string {
  const hi = RANK_CHAR[RANKS_DESC[Math.min(row, col)]!]!;
  const lo = RANK_CHAR[RANKS_DESC[Math.max(row, col)]!]!;
  if (row === col) return `${hi}${hi}`;
  return row < col ? `${hi}${lo}s` : `${hi}${lo}o`;
}

function combosOf(lbl: string): number {
  if (lbl.length === 2) return 6;
  return lbl.endsWith("s") ? 4 : 12;
}

/** 代表ホールカード。Aは{spades,hearts}、Bは{clubs,diamonds}で、AとBが札を共有しないようにする。 */
function repCards(row: number, col: number, side: "A" | "B"): [Card, Card] {
  const s1: Suit = side === "A" ? "spades" : "clubs";
  const s2: Suit = side === "A" ? "hearts" : "diamonds";
  const hiR = RANKS_DESC[Math.min(row, col)]!;
  const loR = RANKS_DESC[Math.max(row, col)]!;
  if (row === col) return [{ rank: hiR, suit: s1 }, { rank: hiR, suit: s2 }];
  if (row < col) return [{ rank: hiR, suit: s1 }, { rank: loR, suit: s1 }]; // suited
  return [{ rank: hiR, suit: s1 }, { rank: loR, suit: s2 }]; // offsuit
}

const ALL_SUITS: Suit[] = ["spades", "hearts", "diamonds", "clubs"];
function fullDeck(): Card[] {
  const d: Card[] = [];
  for (const s of ALL_SUITS) for (const r of RANKS_DESC) d.push({ rank: r, suit: s });
  return d;
}

function key(c: Card): number {
  return c.rank * 4 + ALL_SUITS.indexOf(c.suit);
}

/** モンテカルロで holeA vs holeB のプリフロップ全ボード決着エクイティ(勝ち=1, タイ=0.5)を推定。 */
function equity(holeA: [Card, Card], holeB: [Card, Card], samples: number): number {
  const used = new Set([key(holeA[0]), key(holeA[1]), key(holeB[0]), key(holeB[1])]);
  const pool = fullDeck().filter((c) => !used.has(key(c)));
  let win = 0;
  for (let i = 0; i < samples; i++) {
    // 5枚をランダム抽出(部分Fisher-Yates)。
    const p = pool.slice();
    for (let j = 0; j < 5; j++) {
      const k = j + Math.floor(Math.random() * (p.length - j));
      const t = p[j]!;
      p[j] = p[k]!;
      p[k] = t;
    }
    const board = p.slice(0, 5);
    const cmp = compareHandRank(evaluateBest([...holeA, ...board]), evaluateBest([...holeB, ...board]));
    if (cmp > 0) win += 1;
    else if (cmp === 0) win += 0.5;
  }
  return win / samples;
}

// 169クラスの代表・ラベル・コンボを作る。
const N = 169;
const cells: { row: number; col: number; label: string; combos: number; A: [Card, Card]; B: [Card, Card] }[] = [];
for (let row = 0; row < 13; row++) {
  for (let col = 0; col < 13; col++) {
    const lbl = label(row, col);
    cells.push({ row, col, label: lbl, combos: combosOf(lbl), A: repCards(row, col, "A"), B: repCards(row, col, "B") });
  }
}

// 169x169 エクイティ行列(A視点)。対称性 eq(i,j)=1-eq(j,i) を利用。
console.error(`[genPushFold] building ${N}x${N} equity matrix (samples=${SAMPLES})...`);
const t0 = Date.now();
const eq: number[][] = Array.from({ length: N }, () => new Array<number>(N).fill(0));
for (let i = 0; i < N; i++) {
  for (let j = i; j < N; j++) {
    const e = equity(cells[i]!.A, cells[j]!.B, SAMPLES);
    eq[i]![j] = e;
    eq[j]![i] = 1 - e;
  }
  if (i % 20 === 0) console.error(`  row ${i}/${N}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}
console.error(`[genPushFold] matrix done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

const P = cells.map((c) => c.combos / 1326);

/** 相互ベストレスポンスで1つのスタック深度のNashを解く。 */
function solveDepth(S: number): { jam: boolean[]; call: boolean[]; jamFreq: number; callFreq: number } {
  let call = cells.map((_, idx) => P[idx]! > 0 && idx >= 0 && cells[idx]!.combos > 0 && topDefault(idx)); // 初期: 上位40%
  let jam = new Array<boolean>(N).fill(false);
  for (let iter = 0; iter < ITERATIONS; iter++) {
    // SBのベストレスポンス(vs 現在のBB callレンジ)
    const callFreq = call.reduce((s, v, idx) => s + (v ? P[idx]! : 0), 0);
    jam = cells.map((_, h) => {
      let evCallBranch = 0;
      for (let b = 0; b < N; b++) if (call[b]) evCallBranch += P[b]! * (2 * eq[h]![b]! - 1) * S;
      const evPush = (1 - callFreq) * 1 + evCallBranch;
      return evPush > -0.5;
    });
    // BBのベストレスポンス(vs 現在のSB jamレンジ)
    const jamFreq = jam.reduce((s, v, idx) => s + (v ? P[idx]! : 0), 0);
    call = cells.map((_, h) => {
      if (jamFreq <= 0) return false;
      let evc = 0;
      for (let a = 0; a < N; a++) if (jam[a]) evc += (P[a]! / jamFreq) * (2 * eq[h]![a]! - 1) * S;
      return evc > -1;
    });
  }
  const jamFreq = jam.reduce((s, v, idx) => s + (v ? P[idx]! : 0), 0);
  const callFreq = call.reduce((s, v, idx) => s + (v ? P[idx]! : 0), 0);
  return { jam, call, jamFreq, callFreq };
}

function topDefault(idx: number): boolean {
  // ざっくり上位: ペア or 片方A/K を初期callに。反復で正しく収束するので初期値は粗くてよい。
  const l = cells[idx]!.label;
  return l.length === 2 || l.startsWith("A") || l.startsWith("K");
}

const depths = DEPTHS.map((S) => {
  const r = solveDepth(S);
  const jam: Record<string, number> = {};
  const call: Record<string, number> = {};
  cells.forEach((c, idx) => {
    if (r.jam[idx]) jam[c.label] = 1;
    if (r.call[idx]) call[c.label] = 1;
  });
  console.error(`  S=${S}bb  jam=${(r.jamFreq * 100).toFixed(1)}%  call=${(r.callFreq * 100).toFixed(1)}%`);
  return { s: S, jamFreq: r.jamFreq, callFreq: r.callFreq, jam, call };
});

const out = { model: "HU-pushfold-chipev-nash", samples: SAMPLES, generatedDepths: DEPTHS, depths };
const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, "..", "src", "data");
mkdirSync(dataDir, { recursive: true });
writeFileSync(join(dataDir, "pushFoldNash.json"), JSON.stringify(out, null, 0));
console.error(`[genPushFold] wrote src/data/pushFoldNash.json`);
