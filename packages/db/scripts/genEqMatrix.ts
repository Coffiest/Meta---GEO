/**
 * 169x169 プリフロップ・エクイティ行列(モンテカルロ)を計算し scripts/cache/eqMatrix.json へ書き出す。
 * 他のプリフロップ生成スクリプト(genPreflopNash / genPreflopVsOpen / genPushFold / genPreflopFull)が
 * この重い行列をキャッシュ再利用する。リポジトリ同梱の前提。
 *
 *   実行: SAMPLES=400 pnpm --filter @meta-geo/db exec tsx scripts/genEqMatrix.ts
 */
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import type { Card, Rank, Suit } from "@meta-geo/engine";
import { evaluateBest, compareHandRank } from "@meta-geo/engine";

const SAMPLES = Number(process.env["SAMPLES"] ?? 400);
const CACHE = new URL("./cache/eqMatrix.json", import.meta.url).pathname;

const RANKS_DESC: Rank[] = [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2];
function repCards(row: number, col: number, side: "A" | "B"): [Card, Card] {
  const s1: Suit = side === "A" ? "spades" : "clubs";
  const s2: Suit = side === "A" ? "hearts" : "diamonds";
  const hiR = RANKS_DESC[Math.min(row, col)]!;
  const loR = RANKS_DESC[Math.max(row, col)]!;
  if (row === col) return [{ rank: hiR, suit: s1 }, { rank: hiR, suit: s2 }];
  if (row < col) return [{ rank: hiR, suit: s1 }, { rank: loR, suit: s1 }];
  return [{ rank: hiR, suit: s1 }, { rank: loR, suit: s2 }];
}
const ALL_SUITS: Suit[] = ["spades", "hearts", "diamonds", "clubs"];
function fullDeck(): Card[] {
  const d: Card[] = [];
  for (const s of ALL_SUITS) for (const r of RANKS_DESC) d.push({ rank: r, suit: s });
  return d;
}
function ckey(c: Card): number {
  return c.rank * 4 + ALL_SUITS.indexOf(c.suit);
}
function equity(a: [Card, Card], b: [Card, Card], samples: number): number {
  const used = new Set([ckey(a[0]), ckey(a[1]), ckey(b[0]), ckey(b[1])]);
  const pool = fullDeck().filter((c) => !used.has(ckey(c)));
  let win = 0;
  for (let i = 0; i < samples; i++) {
    const p = pool.slice();
    for (let j = 0; j < 5; j++) {
      const k = j + Math.floor(Math.random() * (p.length - j));
      const t = p[j]!;
      p[j] = p[k]!;
      p[k] = t;
    }
    const board = p.slice(0, 5);
    const cmp = compareHandRank(evaluateBest([...a, ...board]), evaluateBest([...b, ...board]));
    if (cmp > 0) win += 1;
    else if (cmp === 0) win += 0.5;
  }
  return win / samples;
}

const N = 169;
const cells: { A: [Card, Card]; B: [Card, Card] }[] = [];
for (let row = 0; row < 13; row++) for (let col = 0; col < 13; col++) cells.push({ A: repCards(row, col, "A"), B: repCards(row, col, "B") });

if (existsSync(CACHE) && !process.env["FORCE"]) {
  console.error(`[genEqMatrix] cache already exists at ${CACHE} (set FORCE=1 to rebuild)`);
  process.exit(0);
}
console.error(`[genEqMatrix] building 169x169 equity matrix (samples=${SAMPLES})...`);
const t0 = Date.now();
const eq: number[][] = Array.from({ length: N }, () => new Array<number>(N).fill(0));
for (let i = 0; i < N; i++) {
  for (let j = i; j < N; j++) {
    const e = equity(cells[i]!.A, cells[j]!.B, SAMPLES);
    eq[i]![j] = e;
    eq[j]![i] = 1 - e;
  }
  if (i % 20 === 0) console.error(`  row ${i}/${N} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}
mkdirSync(dirname(CACHE), { recursive: true });
writeFileSync(CACHE, JSON.stringify(eq));
console.error(`[genEqMatrix] wrote ${CACHE} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
