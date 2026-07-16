/**
 * オープンレイズに直面したディフェンス(vsオープン)解を、転記済みオープンレンジに対して自力計算する。
 *
 *   実行: pnpm --filter @meta-geo/db exec tsx scripts/genPreflopVsOpen.ts
 *   出力: packages/db/src/data/preflopVsOpen.json
 *
 * モデル(ChipEV, BBアンティ, ヘッズアップ):
 *   - オープナーのレンジ = ユーザー提供のGTO Wizard転記レンジ(PREFLOP_BANDS)のraise部分で固定。
 *   - ディフェンダーの選択肢: fold / call / 3bet(100bbバンドのみ, IP=3.3x / OOP=4.2x) / allin。
 *   - オールインのEVは厳密(オープナーのコールレンジはベストレスポンスで反復収束)。
 *   - コール/3betコールのポストフロップEVは「エクイティ×実現率×ポット」で近似。
 *     実現率はハンド依存(プレイアビリティ): ペア/スーテッド高 > オフスート弱、位置(IP/SB/BB)で補正。
 *     GTO Wizardの既知アンカー(HJ vs UTGコール~5% / BB vs BTNディフェンス~60%等)に合わせて校正。
 *   - ディフェンダーの後ろの未行動プレイヤー(スクイーズ)はコールEVへのペナルティ係数で近似。
 *
 * 反復: フィクティシャスプレイ(平均戦略同士のベストレスポンス)。
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PREFLOP_BANDS } from "../src/data/preflop100.js";
import { expandToken } from "../src/preflopBaseline.js";

// 169x169プリフロップ・エクイティ行列のキャッシュ(リポジトリ同梱)。再生成は scripts/genEqMatrix.ts(FORCE=1)。
const CACHE = new URL("./cache/eqMatrix.json", import.meta.url).pathname;
const T = 400; // フィクティシャスプレイ反復回数

const RANKS_DESC = [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2];
const RC: Record<number, string> = { 14: "A", 13: "K", 12: "Q", 11: "J", 10: "T", 9: "9", 8: "8", 7: "7", 6: "6", 5: "5", 4: "4", 3: "3", 2: "2" };
function label(row: number, col: number): string {
  const hi = RC[RANKS_DESC[Math.min(row, col)]!]!;
  const lo = RC[RANKS_DESC[Math.max(row, col)]!]!;
  if (row === col) return `${hi}${hi}`;
  return row < col ? `${hi}${lo}s` : `${hi}${lo}o`;
}
const N = 169;
const LABELS: string[] = [];
const COMBOS: number[] = [];
for (let row = 0; row < 13; row++) {
  for (let col = 0; col < 13; col++) {
    const l = label(row, col);
    LABELS.push(l);
    COMBOS.push(l.length === 2 ? 6 : l.endsWith("s") ? 4 : 12);
  }
}
const P = COMBOS.map((c) => c / 1326);
const IDX: Record<string, number> = {};
LABELS.forEach((l, i) => (IDX[l] = i));

if (!existsSync(CACHE)) {
  console.error(`[genPreflopVsOpen] equity matrix cache not found at ${CACHE}. Run genPreflopNash.ts first.`);
  process.exit(1);
}
const eq = JSON.parse(readFileSync(CACHE, "utf8")) as number[][];

function eqVsRange(h: number, freq: number[]): number {
  let num = 0, den = 0;
  for (let j = 0; j < N; j++) {
    const w = P[j]! * freq[j]!;
    if (w > 0) {
      num += w * eq[h]![j]!;
      den += w;
    }
  }
  return den > 0 ? num / den : 0.5;
}
function rangeMass(freq: number[]): number {
  let f = 0;
  for (let j = 0; j < N; j++) f += P[j]! * freq[j]!;
  return f;
}
function expandRangeTo169(tokens: string[] | undefined): number[] {
  const out = new Array<number>(N).fill(0);
  if (!tokens) return out;
  for (const t of tokens) for (const c of expandToken(t)) if (IDX[c] !== undefined) out[IDX[c]!] = 1;
  return out;
}

const ORDER = ["UTG", "HJ", "CO", "BTN", "SB", "BB"];
/** ポストフロップ行動順(SBが先、BTNが最後)。IP/OOP判定に使う。 */
const POSTFLOP_ORDER = ["SB", "BB", "UTG", "HJ", "CO", "BTN"];
const POSTED: Record<string, number> = { UTG: 0, HJ: 0, CO: 0, BTN: 0, SB: 0.5, BB: 2.0 }; // BB= blind1 + ante1
/** バンドキー → スタック深度(bb)。 */
const BAND_DEPTH: Record<string, number> = { "100": 100, "20": 20, "14": 14 };

const RANK_OF: Record<string, number> = { A: 14, K: 13, Q: 12, J: 11, T: 10, "9": 9, "8": 8, "7": 7, "6": 6, "5": 5, "4": 4, "3": 3, "2": 2 };
/**
 * ハンド依存のプレイアビリティ(エクイティ実現率の素点)。
 * ペア/スーテッドの強い手はエクイティをほぼ実現し、オフスートの弱い手は大きく実現し損ねる。
 * GTO Wizardのディフェンスレンジ形状(スーテッド/ペア寄り、オフスートは上位のみ)を再現するための係数。
 */
function playability(l: string): number {
  const hi = RANK_OF[l[0]!]!;
  const lo = RANK_OF[l[1]!]!;
  if (l.length === 2) {
    // ペア: セットマイン価値があり実現率は高い。
    return hi >= 10 ? 1.02 : hi >= 7 ? 0.98 : 0.94;
  }
  const suited = l.endsWith("s");
  const gap = hi - lo;
  if (suited) {
    if (hi >= 10 && lo >= 10) return 1.0; // スーテッドブロードウェイ
    if (hi === 14) return 0.92; // Axs
    if (gap <= 2 && lo >= 4) return 0.9; // スーテッドコネクター/1-2ギャップ
    return 0.78;
  }
  // オフスート
  if (hi >= 10 && lo >= 10) return 0.84; // オフスートブロードウェイ
  if (hi === 14) return 0.68; // Axo
  return 0.52; // その他オフスート(ほぼ実現できない)
}
/** 位置ベース係数: BBはクローズ(スクイーズ無し)でやや高め、SBはOOP+後ろにBB+レンジがキャップされ最弱。
 * IPは後ろの人数分スクイーズ減衰。 */
function posBase(defender: string, playersBehind: number): number {
  const base = defender === "BB" ? 0.92 : defender === "SB" ? 0.62 : 0.93;
  return base * Math.pow(0.97, playersBehind);
}
/** SPR(スタック/ポット比)が低いほどエクイティ実現率は1に近づく(コミット済みで実現し損ねる余地が減る)。 */
function sprAdjust(r: number, spr: number): number {
  const t = Math.max(0, Math.min(1, 1 - spr / 5)) * 0.5;
  return r + (1 - r) * t;
}

interface DefStrat {
  /** hand→[fold,call,threeBet,jam] 平均頻度。 */
  strat: [number, number, number, number][];
  callFreq: number;
  threeBetFreq: number;
  jamFreq: number;
  threeBetToBb?: number;
  /** オープナーの vs3bet 応答 hand→[fold,call,jam](3betポットのレンジ導出に使う)。use3betのみ。 */
  oppVs3?: [number, number, number][];
  /** オープナーのオープンレンジ(0/1)。3betポットのコーラー範囲の母集合。 */
  openFreq?: number[];
}

/**
 * (band, opener, defender) のディフェンス混合戦略を解く。
 * openFreq: オープナーのレイズレンジ(0/1)。R: オープンサイズ。S: スタック。
 */
function solveDefense(band: string, opener: string, defender: string): DefStrat | null {
  const table = PREFLOP_BANDS[band];
  const pos = table?.[opener];
  if (!pos || !pos.raise) return null;
  const S = BAND_DEPTH[band]!;
  const R = pos.raiseSize;
  const openFreq = expandRangeTo169(pos.raise);
  if (rangeMass(openFreq) <= 0) return null;

  const defIsOOP = defender === "SB" || defender === "BB";
  const use3bet = band === "100";
  // 3betサイズ: 3bettor(defender)がポストフロップOOPなら大きめ4.2x、IPなら3.3x。
  const defenderIpForSize = POSTFLOP_ORDER.indexOf(defender) > POSTFLOP_ORDER.indexOf(opener);
  const B3 = use3bet ? Math.min(S, R * (defenderIpForSize ? 3.3 : 4.2)) : 0;

  // 他プレイヤーの死に金(自分とオープナー以外のブラインド+アンティ)。
  let deadOthers = 0;
  for (const b of ["SB", "BB"] as const) {
    if (b === opener || b === defender) continue;
    deadOthers += b === "SB" ? 0.5 : 2.0; // BB= blind1+ante1
  }
  const posted = POSTED[defender]!;
  // コール/3betの総投資(ベースライン=ポスト前)。BBはアンティ1が追加で入る(ブラインド1はR内)。
  const anteExtra = defender === "BB" ? 1 : 0;
  const iCall = R + anteExtra;
  const i3 = B3 + anteExtra;
  const potCall = iCall + R + deadOthers;
  const pot3 = i3 + B3 + deadOthers;
  const potAllIn = 2 * S + deadOthers;
  // ハンド依存実現率(+SPR補正: 浅いほど1へ近づく)。
  const defenderIdx = ORDER.indexOf(defender);
  const playersBehind = ORDER.length - 1 - defenderIdx;
  // ポストフロップのIP/OOP(絶対ポジション順)。openBase/r3Boostはこれで決まる。
  const openerIp = POSTFLOP_ORDER.indexOf(opener) > POSTFLOP_ORDER.indexOf(defender);
  const defenderIp = !openerIp;
  // ブラインドのディフェンダーがポストフロップでIP(=SB相手のBB)なら、ポジションで実現率が伸びる。
  // これがないとBB vs SBが過小防御(実測~14%、目標30-40%)になる。該当は BB vs SB のみ。
  const blindIpBonus = defender === "BB" && opener === "SB" ? 1.34 : 1.0;
  const base = posBase(defender, playersBehind) * blindIpBonus;
  const sprCall = (S - R) / potCall;
  const spr3 = use3bet ? (S - B3) / pot3 : 0;
  const rHand = LABELS.map((l) => sprAdjust(Math.min(1.05, base * playability(l)), sprCall));
  // 3betしてコールされたときの実現率: 3bettorがポストフロップIPなら伸び、OOPなら伸びない。
  const r3Boost = defenderIp ? 1.12 : 1.0;
  const rHand3 = LABELS.map((l) => sprAdjust(Math.min(1.05, base * playability(l) * r3Boost), spr3));
  // オープナー側の実現率(vs3betコール時)。オープナーがポストフロップIP(BTN等)ほど、かつワイドなほど
  // 3betに対して(ポジション+十分な範囲で)よくディフェンスするので実現率を高く取り、ディフェンダーの
  // 3betフォールドエクイティ過大評価(=3bet過多)を抑える。オープナーがOOP(SB開き)なら3betに降りやすく
  // 実現率は低め(=BBの3betが増える)。タイトなオープナー(UTG)では元の水準を保ち既知アンカーを崩さない。
  const openMass = rangeMass(openFreq); // オープナーのレンジ幅(0..1)
  const openBase = openerIp ? Math.min(1.35, 0.93 + 0.87 * openMass) : Math.min(1.0, 0.75 + 0.4 * openMass);
  const rOpen = LABELS.map((l) => sprAdjust(Math.min(1.1, openBase * playability(l)), spr3));
  // 100bbバンドではディフェンスのオープンジャムは選択肢から外す(GTO WizardのAllin=0%と一致させる。
  // プレミアムは3betへ吸収される)。
  const useJam = S <= 25;

  // ディフェンダーのエクイティ(対オープンレンジ)は固定なので前計算。
  const eqDef = new Array<number>(N);
  for (let h = 0; h < N; h++) eqDef[h] = eqVsRange(h, openFreq);

  // 平均戦略(フィクティシャスプレイ)。
  const sum = Array.from({ length: N }, () => [1, 1, use3bet ? 1 : 0, useJam ? 1 : 0] as [number, number, number, number]);
  let denom = 2 + (use3bet ? 1 : 0) + (useJam ? 1 : 0);
  const avg = () => sum.map((s) => s.map((v) => v / denom) as [number, number, number, number]);

  // オープナーの応答(vsジャム・vs3bet)の平均。
  const oppCallJamSum = new Array<number>(N).fill(0.3);
  const oppVs3Sum = Array.from({ length: N }, () => [1, 1, 1] as [number, number, number]); // [fold,call,jam]
  let oppDenom = 1;

  let defAvg = avg();
  let oppCallJam = oppCallJamSum.slice();
  let oppVs3 = oppVs3Sum.map((s) => s.map((v) => v / 3) as [number, number, number]);

  for (let t = 0; t < T; t++) {
    // --- オープナーBR: vsジャム(コール or フォールド) ---
    const jamRange = defAvg.map((s) => s[3]);
    const jamMass = rangeMass(jamRange);
    for (let h = 0; h < N; h++) {
      if (openFreq[h]! <= 0) continue;
      // オープナー視点: フォールド=-R。ジャムコール= eq×(2S+deadOthers)-S (SはPOSTED込み全スタック)。
      const evFold = -R;
      const evCall = jamMass > 0 ? eqVsRange(h, jamRange) * potAllIn - S : 0;
      oppCallJamSum[h] = oppCallJamSum[h]! + (jamMass > 0 && evCall > evFold ? 1 : 0);
    }
    // --- オープナーBR: vs3bet(fold/call/jam) ---
    if (use3bet) {
      const r3Range = defAvg.map((s) => s[2]);
      const r3Mass = rangeMass(r3Range);
      // ディフェンダーの「3bet後にジャムされたらコールする」レンジ = BR(現時点の近似: eqで判断)。
      const defCall4 = new Array<number>(N).fill(0);
      for (let h = 0; h < N; h++) {
        if (r3Range[h]! <= 0) continue;
        const evCall4 = eqDef[h]! * potAllIn - S;
        defCall4[h] = evCall4 > -i3 ? r3Range[h]! : 0;
      }
      const pDefCall4 = r3Mass > 0 ? rangeMass(defCall4) / r3Mass : 0;
      for (let h = 0; h < N; h++) {
        if (openFreq[h]! <= 0) continue;
        const evFold = -R;
        const evCall3 = r3Mass > 0 ? rOpen[h]! * eqVsRange(h, r3Range) * pot3 - B3 : 0;
        const evJam4 =
          r3Mass > 0
            ? (1 - pDefCall4) * (i3 + deadOthers) + pDefCall4 * (eqVsRange(h, defCall4) * potAllIn - S)
            : 0;
        const best = Math.max(evFold, evCall3, evJam4);
        oppVs3Sum[h]![0] += best === evFold ? 1 : 0;
        oppVs3Sum[h]![1] += best === evCall3 ? 1 : 0;
        oppVs3Sum[h]![2] += best === evJam4 ? 1 : 0;
      }
    }
    oppDenom += 1;
    oppCallJam = oppCallJamSum.map((v) => v / oppDenom).map((v, h) => (openFreq[h]! > 0 ? Math.min(1, v) : 0));
    oppVs3 = oppVs3Sum.map((s, h) => {
      const tot = s[0] + s[1] + s[2];
      return (openFreq[h]! > 0 ? [s[0] / tot, s[1] / tot, s[2] / tot] : [1, 0, 0]) as [number, number, number];
    });

    // --- ディフェンダーBR ---
    // オープナーのジャムコール確率(レンジ全体)。
    const callJamMassArr = openFreq.map((f, h) => f * oppCallJam[h]!);
    const pOppCallJam = rangeMass(openFreq) > 0 ? rangeMass(callJamMassArr) / rangeMass(openFreq) : 0;
    // vs3betの各応答質量。
    const foldVs3Arr = openFreq.map((f, h) => f * oppVs3[h]![0]!);
    const callVs3Arr = openFreq.map((f, h) => f * oppVs3[h]![1]!);
    const jamVs3Arr = openFreq.map((f, h) => f * oppVs3[h]![2]!);
    const mOpen = rangeMass(openFreq);
    const pF3 = mOpen > 0 ? rangeMass(foldVs3Arr) / mOpen : 1;
    const pC3 = mOpen > 0 ? rangeMass(callVs3Arr) / mOpen : 0;
    const pJ3 = mOpen > 0 ? rangeMass(jamVs3Arr) / mOpen : 0;

    for (let h = 0; h < N; h++) {
      const evFold = -posted;
      // コール: EV = 実現率×エクイティ×ポット − 総投資(BBはアンティ込み)。
      const evCall = rHand[h]! * eqDef[h]! * potCall - iCall;
      // ジャム: オープナーがコールしない分を奪う(自分のPOSTEDは戻るため純益は相手R+死に金)。
      const evJamWin = R + deadOthers;
      const eqVsCallJam = pOppCallJam > 0 ? eqVsRange(h, callJamMassArr) : 0.5;
      const evJam = useJam
        ? (1 - pOppCallJam) * evJamWin + pOppCallJam * (eqVsCallJam * potAllIn - S)
        : -Infinity;
      // 3bet(100bbのみ)。
      let ev3 = -Infinity;
      if (use3bet) {
        const eqVsC3 = pC3 > 0 ? eqVsRange(h, callVs3Arr) : 0.5;
        const eqVsJ3 = pJ3 > 0 ? eqVsRange(h, jamVs3Arr) : 0.5;
        // 4betジャムされたら: コール(eq×potAllIn-S) or フォールド(-i3) の良い方。
        const evVsJam4 = Math.max(-i3, eqVsJ3 * potAllIn - S);
        ev3 = pF3 * (R + deadOthers) + pC3 * (rHand3[h]! * eqVsC3 * pot3 - i3) + pJ3 * evVsJam4;
      }
      const best = Math.max(evFold, evCall, evJam, ev3);
      sum[h]![0] += best === evFold ? 1 : 0;
      sum[h]![1] += best === evCall ? 1 : 0;
      if (use3bet) sum[h]![2] += best === ev3 ? 1 : 0;
      sum[h]![3] += best === evJam ? 1 : 0;
    }
    denom += 1;
    defAvg = avg();
  }

  // 正規化して出力。
  const strat = defAvg.map((s) => {
    const tot = s[0] + s[1] + s[2] + s[3];
    return (tot > 0 ? [s[0] / tot, s[1] / tot, s[2] / tot, s[3] / tot] : [1, 0, 0, 0]) as [number, number, number, number];
  });
  let cf = 0, tf = 0, jf = 0;
  for (let h = 0; h < N; h++) {
    cf += P[h]! * strat[h]![1]!;
    tf += P[h]! * strat[h]![2]!;
    jf += P[h]! * strat[h]![3]!;
  }
  return {
    strat,
    callFreq: cf,
    threeBetFreq: tf,
    jamFreq: jf,
    threeBetToBb: use3bet ? Math.round(B3 * 10) / 10 : undefined,
    oppVs3: use3bet ? oppVs3 : undefined,
    openFreq,
  };
}

// ==== メイン ====
const bands = Object.keys(BAND_DEPTH);
const out: Record<string, Record<string, Record<string, unknown>>> = {};
for (const band of bands) {
  out[band] = {};
  for (let oi = 0; oi < 5; oi++) {
    const opener = ORDER[oi]!;
    const defenders = ORDER.slice(oi + 1);
    for (const defender of defenders) {
      const sol = solveDefense(band, opener, defender);
      if (!sol) continue;
      out[band]![opener] = out[band]![opener] ?? {};
      // ストレージ: hand→[c,3,j](foldは残り)。閾値未満は省く。
      const strat: Record<string, [number, number, number]> = {};
      sol.strat.forEach((s, h) => {
        const [, c, r3, j] = s;
        if (c > 0.02 || r3 > 0.02 || j > 0.02) {
          strat[LABELS[h]!] = [Math.round(c * 100) / 100, Math.round(r3 * 100) / 100, Math.round(j * 100) / 100];
        }
      });
      // 3betポットのレンジ(タスクB): 3bettor=defenderの3betレンジ、caller=openerのcall-vs-3betレンジ。
      // どちらも hand→頻度。ポストフロップ導出(gtoPostflop.ts)で使う。use3bet(100bb)のみ。
      let threeBetRange: Record<string, number> | undefined;
      let callVs3betRange: Record<string, number> | undefined;
      // オープナーのvs3bet応答(表示用, タスクC): hand→[call,jam](foldは残り)。openFreq内のみ。
      let openerVs3: Record<string, [number, number]> | undefined;
      if (sol.oppVs3 && sol.openFreq) {
        threeBetRange = {};
        callVs3betRange = {};
        openerVs3 = {};
        for (let h = 0; h < N; h++) {
          const r3 = sol.strat[h]![2]!;
          if (r3 > 0.02) threeBetRange[LABELS[h]!] = Math.round(r3 * 100) / 100;
          if (sol.openFreq[h]! > 0) {
            const c3 = sol.oppVs3[h]![1]!;
            const j3 = sol.oppVs3[h]![2]!;
            if (c3 > 0.02) callVs3betRange[LABELS[h]!] = Math.round(c3 * 100) / 100;
            if (c3 > 0.02 || j3 > 0.02) openerVs3[LABELS[h]!] = [Math.round(c3 * 100) / 100, Math.round(j3 * 100) / 100];
          }
        }
      }
      (out[band]![opener] as Record<string, unknown>)[defender] = {
        callFreq: Math.round(sol.callFreq * 1000) / 1000,
        threeBetFreq: Math.round(sol.threeBetFreq * 1000) / 1000,
        jamFreq: Math.round(sol.jamFreq * 1000) / 1000,
        threeBetToBb: sol.threeBetToBb,
        strat,
        ...(threeBetRange && Object.keys(threeBetRange).length ? { threeBetRange } : {}),
        ...(callVs3betRange && Object.keys(callVs3betRange).length ? { callVs3betRange } : {}),
        ...(openerVs3 && Object.keys(openerVs3).length ? { openerVs3 } : {}),
      };
      console.error(
        `  band=${band} ${opener}(open ${PREFLOP_BANDS[band]![opener]!.raiseSize}bb) vs ${defender}: call=${(sol.callFreq * 100).toFixed(1)}% 3bet=${(sol.threeBetFreq * 100).toFixed(1)}% jam=${(sol.jamFreq * 100).toFixed(1)}%`,
      );
    }
  }
}

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, "..", "src", "data");
mkdirSync(dataDir, { recursive: true });
writeFileSync(join(dataDir, "preflopVsOpen.json"), JSON.stringify({ model: "vsopen-fp-bbante-chipev-v1", bands: out }, null, 0));
console.error(`[genPreflopVsOpen] wrote src/data/preflopVsOpen.json`);
