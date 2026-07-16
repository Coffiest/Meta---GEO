/**
 * 6-max マルチウェイ・プッシュ/フォールドNash(BBアンティあり)を全ポジション×全スタックで自力計算する。
 * トーナメント(Big Blind Ante)のショート〜ミドルスタックの標準解。GTO WizardのNash/ICMなしチャートと照合可能。
 *
 *   実行: pnpm --filter @meta-geo/db exec tsx scripts/genPreflopNash.ts
 *   出力: packages/db/src/data/preflopNash.json
 *
 * モデル(ChipEV):
 *   - Big Blind Ante: BBが blind 1 に加えて ante 1 をポスト。プリフロップの死に金 D = SB0.5 + BB1 + ante1 = 2.5bb。
 *     → アンティなし(D=1.5)よりジャム/コールのリワードが増え、レンジが広くなる(要求どおり)。
 *   - 有効スタック S(bb)は全員同じ。UTG,HJ,CO,BTN,SB の順に jam or fold。誰かがjamしたら、後続は call or fold。
 *   - 独立コール近似: 先頭ジャマーに対し、後続各自が独立にコール/フォールドを判断(スクイーズ再ジャムは無視)。
 *     マルチウェイのコールは均衡上まれなため「コールされた=1人コール相当」でポットを近似する。
 *
 * 重い部分(169x169プリフロップ・エクイティ行列)はキャッシュを再利用するため、Nash反復自体は高速。
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Card, Rank, Suit } from "@meta-geo/engine";
import { evaluateBest, compareHandRank } from "@meta-geo/engine";

const SAMPLES = Number(process.env["SAMPLES"] ?? 250);
const STACKS = Array.from({ length: 25 }, (_, i) => i + 1); // 1..25bb
const T = 500; // フィクティシャスプレイ反復回数
const MW = Number(process.env["MW"] ?? 1.0); // マルチウェイ罰則の強さ(anchor調整済み)
// 169x169プリフロップ・エクイティ行列のキャッシュ(リポジトリ同梱)。再生成は scripts/genEqMatrix.ts(FORCE=1)。
const CACHE = new URL("./cache/eqMatrix.json", import.meta.url).pathname;

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
for (let row = 0; row < 13; row++) {
  for (let col = 0; col < 13; col++) {
    const l = label(row, col);
    cells.push({ label: l, combos: combosOf(l), A: repCards(row, col, "A"), B: repCards(row, col, "B") });
  }
}
const P = cells.map((c) => c.combos / 1326);

// 169x169 エクイティ行列(キャッシュ再利用)。
let eq: number[][];
if (existsSync(CACHE)) {
  console.error(`[genPreflopNash] loading cached equity matrix`);
  eq = JSON.parse(readFileSync(CACHE, "utf8")) as number[][];
} else {
  console.error(`[genPreflopNash] building equity matrix (samples=${SAMPLES})...`);
  const t0 = Date.now();
  eq = Array.from({ length: N }, () => new Array<number>(N).fill(0));
  for (let i = 0; i < N; i++) {
    for (let j = i; j < N; j++) {
      const e = equity(cells[i]!.A, cells[j]!.B, SAMPLES);
      eq[i]![j] = e;
      eq[j]![i] = 1 - e;
    }
    if (i % 20 === 0) console.error(`  row ${i}/${N} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  }
  writeFileSync(CACHE, JSON.stringify(eq));
}

/** 手hの、頻度レンジ(freq[])に対する加重平均エクイティ。レンジ質量0なら0.5。 */
function eqVsRange(h: number, freq: number[]): number {
  let num = 0;
  let den = 0;
  for (let j = 0; j < N; j++) {
    const w = P[j]! * freq[j]!;
    if (w > 0) {
      num += w * eq[h]![j]!;
      den += w;
    }
  }
  return den > 0 ? num / den : 0.5;
}
function rangeFreqTotal(freq: number[]): number {
  let f = 0;
  for (let j = 0; j < N; j++) f += P[j]! * freq[j]!;
  return f;
}
function unionRange(ranges: number[][]): number[] {
  // 複数コールレンジの結合(各手の「少なくとも1人がコールする質量」)。近似として頻度の最大を取る。
  const out = new Array<number>(N).fill(0);
  for (const r of ranges) for (let j = 0; j < N; j++) out[j] = Math.max(out[j]!, r[j]!);
  return out;
}

const OPENERS = ["UTG", "HJ", "CO", "BTN", "SB"] as const;
const POSTED: Record<string, number> = { UTG: 0, HJ: 0, CO: 0, BTN: 0, SB: 0.5, BB: 2.0 };
const D = 2.5; // SB0.5 + BB1 + ante1

/** 1スタック深度Sのマルチウェイ・プッシュ/フォールドNashをフィクティシャスプレイで解く。 */
function solveStack(S: number) {
  // openJam[p] = ポジションpが「フォールドで回ってきたとき」の開ジャム頻度。
  const openJamSum = OPENERS.map(() => new Array<number>(N).fill(0.5));
  // call[p][i] = ポジションpのジャムに対する、後続コール候補iのコール頻度。
  const callers: Record<string, string[]> = {};
  OPENERS.forEach((p, idx) => {
    callers[p] = [...OPENERS.slice(idx + 1), "BB"];
  });
  const callSum: Record<string, Record<string, number[]>> = {};
  for (const p of OPENERS) {
    callSum[p] = {};
    for (const i of callers[p]!) callSum[p]![i] = new Array<number>(N).fill(0.4);
  }

  const openJamAvg = () => openJamSum.map((s, pi) => s.map((v) => v / avgDenom[pi]!));
  const avgDenom = OPENERS.map(() => 1);
  const callDenom: Record<string, Record<string, number>> = {};
  for (const p of OPENERS) {
    callDenom[p] = {};
    for (const i of callers[p]!) callDenom[p]![i] = 1;
  }

  let jamAvg = openJamSum.map((s) => s.slice());
  const callAvg: Record<string, Record<string, number[]>> = {};
  for (const p of OPENERS) {
    callAvg[p] = {};
    for (const i of callers[p]!) callAvg[p]![i] = callSum[p]![i]!.slice();
  }

  // 死に金(ポットのうち、all-inプレイヤーのスタックSに含まれない分) = アンティ1 + フォールドしたブラインド。
  // ブラインド(SB0.5/BB1)は、その席がジャマーまたはコーラーなら自分のS内なので死に金ではない。
  const callFreqOf = (p: string, pos: string): number => {
    const arr = callAvg[p]?.[pos];
    return arr ? rangeFreqTotal(arr) : 0;
  };
  const deadDeadFor = (p: string): number => {
    let dead = 1; // アンティ(常に死に金)
    for (const b of ["SB", "BB"] as const) {
      if (b === p) continue; // そのブラインド席がジャマーならスタック内
      const blind = b === "SB" ? 0.5 : 1.0;
      const callable = callers[p]!.includes(b);
      const cp = callable ? callFreqOf(p, b) : 0; // コールしたらスタック内、フォールドなら死に金
      dead += blind * (1 - cp);
    }
    return dead;
  };

  for (let t = 0; t < T; t++) {
    // --- コール側BR: 各(opener p, caller i) vs 現在の jamAvg[p] ---
    for (let pi = 0; pi < OPENERS.length; pi++) {
      const p = OPENERS[pi]!;
      const jam = jamAvg[pi]!;
      const potCall = 2 * S + deadDeadFor(p); // ヘッズアップ近似ポット(ジャマー+コーラー各S + 死に金)
      for (const i of callers[p]!) {
        const foldEV = -POSTED[i]!;
        const br = new Array<number>(N);
        for (let h = 0; h < N; h++) {
          const evCall = eqVsRange(h, jam) * potCall - S;
          br[h] = evCall > foldEV ? 1 : 0;
        }
        callSum[p]![i] = callSum[p]![i]!.map((v, h) => v + br[h]!);
        callDenom[p]![i] = callDenom[p]![i]! + 1;
        callAvg[p]![i] = callSum[p]![i]!.map((v) => v / callDenom[p]![i]!);
      }
    }
    // --- 開ジャム側BR: 各opener p vs 後続の平均コールレンジ ---
    for (let pi = 0; pi < OPENERS.length; pi++) {
      const p = OPENERS[pi]!;
      const cs = callers[p]!.map((i) => ({ i, freq: callAvg[p]![i]!, cf: rangeFreqTotal(callAvg[p]![i]!) }));
      const pAllFold = cs.reduce((acc, c) => acc * (1 - c.cf), 1);
      const pCalled = 1 - pAllFold;
      const pool = unionRange(cs.map((c) => c.freq));
      const cfSum = cs.reduce((a, c) => a + c.cf, 0);
      // マルチウェイ罰則: コールされた場合の期待コーラー数(nOpp)。早い位置ほど多く、全員に勝つ必要があるため
      // 勝率を nOpp に応じて逓減させる(相関があるためべき指数は緩め MW)。ポットもコーラー数ぶん大きくなる。
      const nOpp = pCalled > 0 ? Math.max(1, cfSum / pCalled) : 1;
      const potCalled = S * (1 + nOpp) + deadDeadFor(p);
      const stealReward = D - POSTED[p]!;
      const evFold = -POSTED[p]!;
      const br = new Array<number>(N);
      for (let h = 0; h < N; h++) {
        const base = eqVsRange(h, pool);
        const win = Math.pow(base, 1 + MW * (nOpp - 1));
        const evJam = pAllFold * stealReward + pCalled * (win * potCalled - S);
        br[h] = evJam > evFold ? 1 : 0;
      }
      openJamSum[pi] = openJamSum[pi]!.map((v, h) => v + br[h]!);
      avgDenom[pi] = avgDenom[pi]! + 1;
    }
    jamAvg = openJamAvg();
  }

  const positions: Record<string, { jamFreq: number; jam: Record<string, number> }> = {};
  OPENERS.forEach((p, pi) => {
    const jam: Record<string, number> = {};
    let jf = 0;
    cells.forEach((c, idx) => {
      const f = Math.round(jamAvg[pi]![idx]! * 1000) / 1000;
      if (f > 0.01) jam[c.label] = f;
      jf += P[idx]! * jamAvg[pi]![idx]!;
    });
    positions[p] = { jamFreq: jf, jam };
  });

  // ジャムに直面したときのコール(ディフェンス)レンジ。vsJam[jammerPos][callerPos]。
  const vsJam: Record<string, Record<string, { callFreq: number; call: Record<string, number> }>> = {};
  for (const p of OPENERS) {
    vsJam[p] = {};
    for (const i of callers[p]!) {
      const arr = callAvg[p]![i]!;
      const call: Record<string, number> = {};
      let cf = 0;
      cells.forEach((c, idx) => {
        const f = Math.round(arr[idx]! * 1000) / 1000;
        if (f > 0.01) call[c.label] = f;
        cf += P[idx]! * arr[idx]!;
      });
      vsJam[p]![i] = { callFreq: cf, call };
    }
  }
  return { positions, vsJam };
}

console.error(`[genPreflopNash] solving ${STACKS.length} stacks x ${OPENERS.length} positions (BB ante)...`);
const stacks = STACKS.map((S) => {
  const { positions, vsJam } = solveStack(S);
  const summary = OPENERS.map((p) => `${p}:${(positions[p]!.jamFreq * 100).toFixed(0)}%`).join(" ");
  console.error(`  S=${S}bb  ${summary}`);
  return { s: S, positions, vsJam };
});

const out = { model: "6max-pushfold-nash-bbante-chipev", samples: SAMPLES, ante: "BB", stacks };
const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, "..", "src", "data");
mkdirSync(dataDir, { recursive: true });
writeFileSync(join(dataDir, "preflopNash.json"), JSON.stringify(out, null, 0));
console.error(`[genPreflopNash] wrote src/data/preflopNash.json`);
