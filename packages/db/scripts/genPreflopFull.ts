/**
 * 通常のプリフロップ戦略(fold / open-raise / jam の混合)を、全ポジション×全スタックで計算する。
 * BBアンティあり。オープンしてコールされた「フロップを見る」ノードは、エクイティ実現率(realization
 * factor)でポストフロップEVを近似する(GTO Wizardのポストフロップソルバーの代替。数値は完全一致しない)。
 *
 * 戦略はリグレットマッチング(CFR系)で混合を出す。狙う遷移:
 *   ディープ(>~25bb) = open中心 / ~20bb = open と jam が混ざる / <~10bb = ほぼ純プッシュフォールド。
 *
 *   実行: SAMPLES=250 pnpm --filter @meta-geo/db exec tsx scripts/genPreflopFull.ts
 *   出力: packages/db/src/data/preflopFull.json
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Card, Rank, Suit } from "@meta-geo/engine";
import { evaluateBest, compareHandRank } from "@meta-geo/engine";

const SAMPLES = Number(process.env["SAMPLES"] ?? 250);
const STACKS = Array.from({ length: 30 }, (_, i) => i + 1); // 1..30bb
const T = Number(process.env["ITERS"] ?? 400);
const CACHE = new URL("./cache/eqMatrix.json", import.meta.url).pathname;
const RF_IP = 0.95; // インポジションのエクイティ実現率
const RF_OOP = 0.82; // アウトオブポジション
// ポストフロップ・プレイアビリティ係数。オープンしてフロップに行った後、背後のスタックを使って
// エクイティ有利な手がさらに勝てる価値を近似する(深いほどopenが有利になり、正しい遷移を作る)。
const PF_BONUS = Number(process.env["PFB"] ?? 0.22);

const RANKS_DESC: Rank[] = [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2];
const RC: Record<number, string> = { 14: "A", 13: "K", 12: "Q", 11: "J", 10: "T", 9: "9", 8: "8", 7: "7", 6: "6", 5: "5", 4: "4", 3: "3", 2: "2" };
function label(row: number, col: number): string {
  const hi = RC[RANKS_DESC[Math.min(row, col)]!]!;
  const lo = RC[RANKS_DESC[Math.max(row, col)]!]!;
  if (row === col) return `${hi}${hi}`;
  return row < col ? `${hi}${lo}s` : `${hi}${lo}o`;
}
function combosOf(l: string): number {
  return l.length === 2 ? 6 : l.endsWith("s") ? 4 : 12;
}
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
const cells: { label: string; combos: number; A: [Card, Card]; B: [Card, Card] }[] = [];
for (let row = 0; row < 13; row++) for (let col = 0; col < 13; col++) {
  const l = label(row, col);
  cells.push({ label: l, combos: combosOf(l), A: repCards(row, col, "A"), B: repCards(row, col, "B") });
}
const P = cells.map((c) => c.combos / 1326);

let eq: number[][];
if (existsSync(CACHE)) {
  console.error(`[genPreflopFull] loading cached equity matrix`);
  eq = JSON.parse(readFileSync(CACHE, "utf8")) as number[][];
} else {
  console.error(`[genPreflopFull] building equity matrix (samples=${SAMPLES})...`);
  eq = Array.from({ length: N }, () => new Array<number>(N).fill(0));
  for (let i = 0; i < N; i++) {
    for (let j = i; j < N; j++) {
      const e = equity(cells[i]!.A, cells[j]!.B, SAMPLES);
      eq[i]![j] = e;
      eq[j]![i] = 1 - e;
    }
  }
  writeFileSync(CACHE, JSON.stringify(eq));
}

function eqVsRange(h: number, freq: number[]): number {
  let num = 0, den = 0;
  for (let j = 0; j < N; j++) {
    const w = P[j]! * freq[j]!;
    if (w > 0) { num += w * eq[h]![j]!; den += w; }
  }
  return den > 0 ? num / den : 0.5;
}
function freqTotal(freq: number[]): number {
  let f = 0;
  for (let j = 0; j < N; j++) f += P[j]! * freq[j]!;
  return f;
}

const OPENERS = ["UTG", "HJ", "CO", "BTN", "SB"] as const;
const POSTED: Record<string, number> = { UTG: 0, HJ: 0, CO: 0, BTN: 0, SB: 0.5, BB: 2.0 };
const OPEN_SIZE: Record<string, number> = { UTG: 2.3, HJ: 2.3, CO: 2.3, BTN: 2.3, SB: 3.0 };
const D = 2.5;
// ポストフロップの手番順(BTNが最後=IP)。indexが大きいほどIP。
const PF_ORDER = ["SB", "BB", "UTG", "HJ", "CO", "BTN"];
function ipFactor(a: string, b: string): number {
  return PF_ORDER.indexOf(a) > PF_ORDER.indexOf(b) ? RF_IP : RF_OOP;
}

// リグレットマッチング用ヘルパ。actions固定数A。
function rmStrategy(reg: number[]): number[] {
  let sum = 0;
  const s = reg.map((r) => (r > 0 ? r : 0));
  for (const v of s) sum += v;
  if (sum <= 0) return reg.map(() => 1 / reg.length);
  return s.map((v) => v / sum);
}

/** 1スタック深度Sの通常戦略を解く。openers各自 {fold,open,jam}、後続 {fold,call,jam}。 */
function solveStack(S: number) {
  const callersOf: Record<string, string[]> = {};
  OPENERS.forEach((p, idx) => { callersOf[p] = [...OPENERS.slice(idx + 1), "BB"]; });

  // 戦略(平均)と累積regret。open: [fold,open,jam]。vsOpen: [fold,call,jam]。
  const openReg: Record<string, number[][]> = {};
  const openStr: Record<string, number[][]> = {};
  const openSum: Record<string, number[][]> = {};
  const vsReg: Record<string, Record<string, number[][]>> = {};
  const vsStr: Record<string, Record<string, number[][]>> = {};
  for (const p of OPENERS) {
    openReg[p] = cells.map(() => [0, 0, 0]);
    openStr[p] = cells.map(() => [1 / 3, 1 / 3, 1 / 3]);
    openSum[p] = cells.map(() => [0, 0, 0]);
    vsReg[p] = {}; vsStr[p] = {};
    for (const i of callersOf[p]!) {
      vsReg[p]![i] = cells.map(() => [0, 0, 0]);
      vsStr[p]![i] = cells.map(() => [1 / 3, 1 / 3, 1 / 3]);
    }
  }

  const colOf = (str: number[][], a: number) => str.map((row) => row[a]!);

  for (let t = 0; t < T; t++) {
    // 現在の平均戦略から各種レンジを作る。
    const openRange: Record<string, number[]> = {};
    const openJamRange: Record<string, number[]> = {};
    for (const p of OPENERS) {
      openRange[p] = colOf(openStr[p]!, 1);
      openJamRange[p] = colOf(openStr[p]!, 2);
    }

    // --- 後続 vs open のBR (fold/call/jam) ---
    for (const p of OPENERS) {
      const oRange = openRange[p]!;
      const oFreq = freqTotal(oRange);
      for (const i of callersOf[p]!) {
        const potFlop = 2 * OPEN_SIZE[p]! + 1.5; // アンティ+概ね片ブラインドの死に金(近似)
        const rfCall = ipFactor(i, p);
        const iJam = colOf(vsStr[p]![i]!, 2);
        const iJamFreq = freqTotal(iJam);
        const potAllIn = 2 * S + 1.0;
        const winIfFold = OPEN_SIZE[p]! + (D - POSTED[p]!);
        // opener の 3betジャムへのコール頻度(hに依存しないのでループ外で1回だけ計算)。
        let openerCallFreq = 0;
        if (iJamFreq > 0 && oFreq > 0) {
          let acc = 0;
          for (let a = 0; a < N; a++) {
            if (oRange[a]! <= 0) continue;
            const evc = eqVsRange(a, iJam) * potAllIn - S;
            if (evc > -OPEN_SIZE[p]!) acc += P[a]! * oRange[a]!;
          }
          openerCallFreq = acc / oFreq;
        }
        for (let h = 0; h < N; h++) {
          const eqVsOpen = oFreq > 0 ? eqVsRange(h, oRange) : 0.5;
          const evFold = -POSTED[i]!;
          const callBonus = Math.max(0, eqVsOpen - 0.5) * (S - OPEN_SIZE[p]!) * PF_BONUS * (rfCall >= RF_IP ? 1 : 0.7);
          const evCall = eqVsOpen * rfCall * potFlop - OPEN_SIZE[p]! + callBonus;
          const evJam = (1 - openerCallFreq) * winIfFold + openerCallFreq * (eqVsOpen * potAllIn - S);
          const evs = [evFold, evCall, evJam];
          const str = rmStrategy(vsReg[p]![i]![h]!);
          const ev = evs[0]! * str[0]! + evs[1]! * str[1]! + evs[2]! * str[2]!;
          for (let a = 0; a < 3; a++) vsReg[p]![i]![h]![a]! += evs[a]! - ev;
          const ns = rmStrategy(vsReg[p]![i]![h]!);
          for (let a = 0; a < 3; a++) vsStr[p]![i]![h]![a]! = ns[a]!;
        }
      }
    }

    // --- opener のBR (fold/open/jam) ---
    for (const p of OPENERS) {
      const behind = callersOf[p]!;
      // 各後続の vs-open 反応頻度(平均)
      const resp = behind.map((i) => {
        const f = colOf(vsStr[p]![i]!, 0), c = colOf(vsStr[p]![i]!, 1), j = colOf(vsStr[p]![i]!, 2);
        return { i, foldFreq: freqTotal(f), callFreq: freqTotal(c), jamFreq: freqTotal(j), call: c, jam: j };
      });
      const pAllFold = resp.reduce((a, r) => a * r.foldFreq, 1);
      const pJammed = 1 - resp.reduce((a, r) => a * (1 - r.jamFreq), 1);
      const pCalledNoJam = Math.max(0, 1 - pAllFold - pJammed);
      // 集約: call pool / jam pool
      const callPool = new Array<number>(N).fill(0);
      const jamPool = new Array<number>(N).fill(0);
      for (const r of resp) for (let x = 0; x < N; x++) { callPool[x] = Math.max(callPool[x]!, r.call[x]!); jamPool[x] = Math.max(jamPool[x]!, r.jam[x]!); }
      const potFlop = 2 * OPEN_SIZE[p]! + 1.5;
      const potAllIn = 2 * S + (D - POSTED[p]!);
      const rfOpen = RF_OOP + 0.03; // opener は概ねOOP

      // 直接ジャムに対する後続の「ジャムコール範囲」を正しく計算(ジャムには狭くコールする)。
      const jamR = openJamRange[p]!;
      const jamRFreq = freqTotal(jamR);
      const eqJamR = new Array<number>(N); // 各手の eq vs opener自身のjam範囲(コール側評価用)
      for (let a = 0; a < N; a++) eqJamR[a] = jamRFreq > 0 ? eqVsRange(a, jamR) : 0.5;
      const jamCallPool = new Array<number>(N).fill(0);
      let pAllFoldJam = 1;
      for (const r of resp) {
        // 後続iのコール(vs直接ジャム)BR: eq(手 vs opener jam範囲)*potAllIn - S > -posted_i
        let cf = 0;
        for (let a = 0; a < N; a++) {
          if (eqJamR[a]! * potAllIn - S > -POSTED[r.i]!) {
            jamCallPool[a] = 1;
            cf += P[a]!;
          }
        }
        pAllFoldJam *= 1 - cf;
      }

      for (let h = 0; h < N; h++) {
        const evFold = -POSTED[p]!;
        const eqOC = eqVsRange(h, callPool);
        const openBonus = Math.max(0, eqOC - 0.5) * (S - OPEN_SIZE[p]!) * PF_BONUS * 0.7; // openerは概ねOOP
        const flopEV = eqOC * rfOpen * potFlop - OPEN_SIZE[p]! + openBonus;
        const callJamEV = eqVsRange(h, jamPool) * potAllIn - S;
        const foldToJamEV = -OPEN_SIZE[p]!;
        const evOpen = pAllFold * (D - POSTED[p]!) + pCalledNoJam * flopEV + pJammed * Math.max(foldToJamEV, callJamEV);
        // jam(直接オールイン): 相手は狭いジャムコール範囲。
        const evJam = pAllFoldJam * (D - POSTED[p]!) + (1 - pAllFoldJam) * (eqVsRange(h, jamCallPool) * potAllIn - S);
        const evs = [evFold, evOpen, evJam];
        const str = rmStrategy(openReg[p]![h]!);
        const ev = evs[0]! * str[0]! + evs[1]! * str[1]! + evs[2]! * str[2]!;
        for (let a = 0; a < 3; a++) openReg[p]![h]![a]! += evs[a]! - ev;
        const ns = rmStrategy(openReg[p]![h]!);
        for (let a = 0; a < 3; a++) { openStr[p]![h]![a]! = ns[a]!; openSum[p]![h]![a]! += ns[a]!; }
      }
    }
  }

  // 出力は平均戦略(CFRは平均が収束する)。
  for (const p of OPENERS) openStr[p] = openSum[p]!.map((row) => { const s = row[0]! + row[1]! + row[2]!; return s > 0 ? [row[0]! / s, row[1]! / s, row[2]! / s] : [1 / 3, 1 / 3, 1 / 3]; });

  const positions: Record<string, { fold: number; open: number; jam: number; strat: Record<string, [number, number, number]> }> = {};
  for (const p of OPENERS) {
    let fold = 0, open = 0, jam = 0;
    const strat: Record<string, [number, number, number]> = {};
    cells.forEach((c, idx) => {
      const s = openStr[p]![idx]!;
      const f = Math.round(s[0]! * 1000) / 1000, o = Math.round(s[1]! * 1000) / 1000, j = Math.round(s[2]! * 1000) / 1000;
      strat[c.label] = [f, o, j];
      fold += P[idx]! * s[0]!; open += P[idx]! * s[1]!; jam += P[idx]! * s[2]!;
    });
    positions[p] = { fold, open, jam, strat };
  }
  return positions;
}

console.error(`[genPreflopFull] solving ${STACKS.length} stacks x ${OPENERS.length} positions...`);
const stacks = STACKS.map((S) => {
  const positions = solveStack(S);
  const summary = OPENERS.map((p) => `${p}:o${(positions[p]!.open * 100).toFixed(0)}/j${(positions[p]!.jam * 100).toFixed(0)}`).join(" ");
  console.error(`  S=${S}bb  ${summary}`);
  return { s: S, positions };
});

const out = { model: "6max-preflop-cfr-openjamfold-bbante", samples: SAMPLES, openSize: OPEN_SIZE, stacks };
const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, "..", "src", "data");
mkdirSync(dataDir, { recursive: true });
writeFileSync(join(dataDir, "preflopFull.json"), JSON.stringify(out, null, 0));
console.error(`[genPreflopFull] wrote src/data/preflopFull.json`);
