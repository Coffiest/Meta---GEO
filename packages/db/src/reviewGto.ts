import { computeAllInEquity, parseCard } from "@meta-geo/engine";
import { PREFLOP_BANDS } from "./data/preflop100.js";
import { expandToken } from "./preflopBaseline.js";
import type { GtoActionEV } from "./reviewClassify.js";
import { bucketPreflopRaiseBb } from "./geoTree.js";
import { getNashJamRange, getNashVsJamCallRange } from "./preflopNashBaseline.js";
import { getVsOpenStrategy } from "./preflopVsOpenBaseline.js";
import {
  EV_N,
  EV_LABELS,
  EV_IDX,
  EV_P,
  eqVsRange,
  rangeMass,
  freqArrayOf,
  playability,
  posBase,
  sprAdjust,
  POSTED,
  PREFLOP_ORDER,
  DEAD_TOTAL,
  deadOthersOf,
  bandOfStack,
  eqMatrixAvailable,
} from "./preflopEvModel.js";

/**
 * 局後検討のGTO基準生成。heroの各意思決定に対し、選択肢ごとの{バケット, GTO頻度, EV(bb)}を返す。
 * これを reviewClassify.classifyDecision に渡してEV損ベースの9段階分類を行う。
 *
 * EVの出どころ(正直な精度ラベル):
 *  - vsジャム(コール/フォールド): 自社Nashレンジ+equity行列による厳密EV。
 *  - ポストフロップの対オールイン: computeAllInEquity(実ハンド同士)による厳密equity EV。
 *  - オープン/vsオープン: GTOタブと同じEVモデル(転記レンジ+実現率モデル)による推定EV。
 *    genPreflopVsOpen.ts と同じ数式・係数(preflopEvModel.ts に一元化)。
 */

const CALIB = {
  /** オープナー側の実現率ベース(vs3betコール時)。genPreflopVsOpen と同一。 */
  openBaseVsOopDefender: 1.05,
  openBaseVsIpDefender: 0.85,
  /** 深いスタックでジャムした場合に相手がコールするタイトレンジ(手動)。 */
  deepJamCallRange: ["QQ+", "AKs", "AKo"],
} as const;

function expandTo169(tokens: string[] | undefined): number[] {
  const out = new Array<number>(EV_N).fill(0);
  if (!tokens) return out;
  for (const t of tokens) for (const c of expandToken(t)) if (EV_IDX[c] !== undefined) out[EV_IDX[c]!] = 1;
  return out;
}

/** クラスhの、レンジ全体に占める頻度(0/1レンジならメンバーシップ)。 */
function freqOfClass(freq: number[], handClass: string): number {
  const i = EV_IDX[handClass];
  return i === undefined ? 0 : freq[i]!;
}

// ============================================================================
// 1) vsジャム: Nash厳密EV
// ============================================================================

export function vsJamGtoActions(params: {
  jammerPos: string;
  heroPos: string;
  /** コールに必要な額(bb)と自分の残り(bb)の小さい方=リスク額。 */
  riskBb: number;
  handClass: string;
}): GtoActionEV[] | null {
  if (!eqMatrixAvailable()) return null;
  const S = Math.max(1, Math.min(25, params.riskBb));
  const jam = getNashJamRange(params.jammerPos, S);
  const callRange = getNashVsJamCallRange(params.jammerPos, params.heroPos, S);
  if (!jam) return null;
  const jamArr = freqArrayOf(jam);
  if (rangeMass(jamArr) <= 0) return null;
  const h = EV_IDX[params.handClass];
  if (h === undefined) return null;

  const posted = POSTED[params.heroPos] ?? 0;
  const dead = deadOthersOf(params.jammerPos, params.heroPos) + 0; // アンティはジャマーがBB以外なら死に金1がdeadOthersのBB2.0に含まれる
  const evFold = -posted;
  const evCall = eqVsRange(h, jamArr) * (2 * S + dead) - S;
  const callFreq = callRange ? freqOfClass(freqArrayOf(callRange), params.handClass) : evCall > evFold ? 1 : 0;

  return [
    { bucket: "call", frequency: callFreq, evBb: evCall },
    { bucket: "fold", frequency: 1 - callFreq, evBb: evFold },
  ];
}

// ============================================================================
// 2) オープン(RFI): 転記レンジ+EVモデル
// ============================================================================

export function openGtoActions(params: { heroPos: string; handClass: string; effStackBb: number }): GtoActionEV[] | null {
  if (!eqMatrixAvailable()) return null;
  const band = bandOfStack(params.effStackBb);
  const pos = PREFLOP_BANDS[band]?.[params.heroPos];
  if (!pos) return null;
  const h = EV_IDX[params.handClass];
  if (h === undefined) return null;

  const S = Math.max(2, params.effStackBb);
  const posted = POSTED[params.heroPos] ?? 0;
  const heroIdx = PREFLOP_ORDER.indexOf(params.heroPos);
  const defenders = PREFLOP_ORDER.slice(heroIdx + 1);
  const evFold = -posted;
  const out: GtoActionEV[] = [{ bucket: "fold", frequency: 0, evBb: evFold }];

  const raiseArr = expandTo169(pos.raise);
  const jamArr = expandTo169(pos.jam);
  const limpArr = expandTo169(pos.limp);
  const raiseFreq = freqOfClass(raiseArr, params.handClass);
  const jamFreq = freqOfClass(jamArr, params.handClass);
  const limpFreq = freqOfClass(limpArr, params.handClass);
  const foldFreq = Math.max(0, 1 - raiseFreq - jamFreq - limpFreq);
  out[0]!.frequency = foldFreq;

  // --- ジャムEV(常に選択肢として提示: 深いスタックでのジャムも正しく減点できるように) ---
  {
    let pAllFold = 1;
    let evCalledSum = 0;
    const stealReward = DEAD_TOTAL - posted;
    if (S <= 25) {
      // Nashのコールレンジで各後続の反応をモデル化(先頭コーラー近似)。
      let prefix = 1;
      for (const d of defenders) {
        const callRec = getNashVsJamCallRange(params.heroPos, d, Math.min(25, S));
        const callArr = callRec ? freqArrayOf(callRec) : new Array<number>(EV_N).fill(0);
        const cf = rangeMass(callArr);
        const deadC = deadOthersOf(params.heroPos, d);
        const evVsC = cf > 0 ? eqVsRange(h, callArr) * (2 * S + deadC) - S : 0;
        evCalledSum += prefix * cf * evVsC;
        prefix *= 1 - cf;
      }
      pAllFold = prefix;
    } else {
      // ディープ: タイトレンジのみコール。
      const callArr = expandTo169([...CALIB.deepJamCallRange]);
      const cf = rangeMass(callArr);
      const nOpp = defenders.length;
      const pSomeoneCalls = 1 - Math.pow(1 - cf, nOpp);
      const deadC = 1.5;
      evCalledSum = pSomeoneCalls * (eqVsRange(h, callArr) * (2 * S + deadC) - S);
      pAllFold = 1 - pSomeoneCalls;
    }
    const evJam = pAllFold * stealReward + evCalledSum;
    out.push({ bucket: "allIn", frequency: jamFreq, evBb: evJam });
  }

  // --- オープンレイズEV(バンドにraiseがある場合): 計算済みディフェンス反応でモデル化 ---
  if (pos.raise && pos.raiseSize) {
    const R = pos.raiseSize;
    const openArr = raiseArr;
    let prefix = 1;
    let ev = 0;
    for (const d of defenders) {
      const st = getVsOpenStrategy(band, params.heroPos, d);
      if (!st) continue;
      // 反応レンジ(クラス→頻度)を構築。
      const callArr = new Array<number>(EV_N).fill(0);
      const r3Arr = new Array<number>(EV_N).fill(0);
      const jamArrD = new Array<number>(EV_N).fill(0);
      for (const [l, s] of Object.entries(st.strat)) {
        const i = EV_IDX[l];
        if (i === undefined) continue;
        callArr[i] = s[0];
        r3Arr[i] = s[1];
        jamArrD[i] = s[2];
      }
      const cf = rangeMass(callArr);
      const tf = rangeMass(r3Arr);
      const jf = rangeMass(jamArrD);

      const deadC = deadOthersOf(params.heroPos, d);
      const heroIsIpVsD = d === "SB" || d === "BB";
      const openBase = heroIsIpVsD ? CALIB.openBaseVsOopDefender : CALIB.openBaseVsIpDefender;

      // コールされた: SRPポット。
      const iCallD = R + (d === "BB" ? 1 : 0);
      const potCall = R + iCallD + deadC;
      const rHero = sprAdjust(openBase * playability(params.handClass), (S - R) / potCall);
      const evVsCall = cf > 0 ? rHero * eqVsRange(h, callArr) * potCall - R : 0;

      // 3betされた: BR(フォールド / コール / 4betジャム)。
      let evVs3 = 0;
      if (tf > 0 && st.threeBetToBb) {
        const B3 = st.threeBetToBb;
        const i3 = B3 + (d === "BB" ? 1 : 0);
        const pot3 = i3 + B3 + deadC;
        const r3 = sprAdjust(openBase * playability(params.handClass), Math.max(0, S - B3) / pot3);
        const evCall3 = r3 * eqVsRange(h, r3Arr) * pot3 - B3;
        // 4betジャム: 相手はequity十分なら続行(scriptと同じ閾値ルール)。
        const potAllIn = 2 * S + deadC;
        const defCall4 = r3Arr.map((f, i) => (f > 0 && eqVsRange(i, openArr) * potAllIn - S > -i3 ? f : 0));
        const pC4 = tf > 0 ? rangeMass(defCall4) / tf : 0;
        const evJam4 = (1 - pC4) * (i3 + deadC) + pC4 * (eqVsRange(h, defCall4) * potAllIn - S);
        evVs3 = Math.max(-R, evCall3, evJam4);
      }

      // ジャムされた: BR(フォールド / コール)。
      let evVsJam = 0;
      if (jf > 0) {
        const potAllIn = 2 * S + deadC;
        evVsJam = Math.max(-R, eqVsRange(h, jamArrD) * potAllIn - S);
      }

      const ff = Math.max(0, 1 - cf - tf - jf);
      ev += prefix * (cf * evVsCall + tf * evVs3 + jf * evVsJam);
      prefix *= ff;
    }
    const stealReward = DEAD_TOTAL - posted;
    ev += prefix * stealReward;
    out.push({ bucket: bucketPreflopRaiseBb(R), frequency: raiseFreq, evBb: ev });
  }

  // --- リンプEV(SB/BTNの一部バンドのみ): 相手any2チェック相当の簡易モデル ---
  if (pos.limp) {
    const anyTwo = new Array<number>(EV_N).fill(1);
    const cost = 1 - posted > 0 ? 1 - posted : 0; // リンプ完了に必要な追加額(SB=0.5, その他=1)
    const potLimp = 1 + 2 + (params.heroPos === "SB" ? 0 : 0.5); // 自分1 + BB(blind1+ante1) + SBが他人なら0.5
    const heroIdxPost = params.heroPos === "SB" ? 0 : 5;
    const rLimp = sprAdjust(posBase(params.heroPos === "SB" ? "SB" : "BB", 0) * playability(params.handClass), (S - 1) / potLimp);
    void heroIdxPost;
    const evLimp = rLimp * eqVsRange(h, anyTwo) * potLimp - (posted + cost);
    out.push({ bucket: "call", frequency: limpFreq, evBb: evLimp });
  }

  return out;
}

// ============================================================================
// 3) vsオープン(ディフェンス): 転記レンジ+計算済みディフェンス+EVモデル
// ============================================================================

export function defenseGtoActions(params: {
  openerPos: string;
  heroPos: string;
  handClass: string;
  effStackBb: number;
}): GtoActionEV[] | null {
  if (!eqMatrixAvailable()) return null;
  const band = bandOfStack(params.effStackBb);
  const openPos = PREFLOP_BANDS[band]?.[params.openerPos];
  const st = getVsOpenStrategy(band, params.openerPos, params.heroPos);
  if (!openPos || !openPos.raise || !st) return null;
  const h = EV_IDX[params.handClass];
  if (h === undefined) return null;

  const S = Math.max(2, params.effStackBb);
  const R = openPos.raiseSize;
  const openArr = expandTo169(openPos.raise);
  const posted = POSTED[params.heroPos] ?? 0;
  const deadOthers = deadOthersOf(params.openerPos, params.heroPos);
  const anteExtra = params.heroPos === "BB" ? 1 : 0;
  const iCall = R + anteExtra;
  const potCall = iCall + R + deadOthers;
  const potAllIn = 2 * S + deadOthers;

  const heroIdx = PREFLOP_ORDER.indexOf(params.heroPos);
  const playersBehind = PREFLOP_ORDER.length - 1 - heroIdx;
  const base = posBase(params.heroPos, playersBehind);
  const heroIsOOP = params.heroPos === "SB" || params.heroPos === "BB";

  // 自分の3bet/ジャムに対するオープナーの反応(scriptと同じ閾値BRルール)。
  const storedJamArr = new Array<number>(EV_N).fill(0);
  const stored3Arr = new Array<number>(EV_N).fill(0);
  const storedCallArr = new Array<number>(EV_N).fill(0);
  for (const [l, s] of Object.entries(st.strat)) {
    const i = EV_IDX[l];
    if (i === undefined) continue;
    storedCallArr[i] = s[0];
    stored3Arr[i] = s[1];
    storedJamArr[i] = s[2];
  }

  const evFold = -posted;
  const eqDefH = eqVsRange(h, openArr);
  const rHand = sprAdjust(base * playability(params.handClass), (S - R) / potCall);
  const evCall = rHand * eqDefH * potCall - iCall;

  const out: GtoActionEV[] = [
    { bucket: "fold", frequency: Math.max(0, 1 - (st.strat[params.handClass]?.[0] ?? 0) - (st.strat[params.handClass]?.[1] ?? 0) - (st.strat[params.handClass]?.[2] ?? 0)), evBb: evFold },
    { bucket: "call", frequency: st.strat[params.handClass]?.[0] ?? 0, evBb: evCall },
  ];

  // ジャムEV: オープナーは閾値ルールでコール。
  {
    const jamMass = rangeMass(storedJamArr);
    const callJamArr = openArr.map((f, i) => (f > 0 && (jamMass > 0 ? eqVsRange(i, storedJamArr) : 0.5) * potAllIn - S > -R ? f : 0));
    const mOpen = rangeMass(openArr);
    const pCallJam = mOpen > 0 ? rangeMass(callJamArr) / mOpen : 0;
    const evJam = (1 - pCallJam) * (R + deadOthers) + pCallJam * (eqVsRange(h, callJamArr) * potAllIn - S);
    out.push({ bucket: "allIn", frequency: st.strat[params.handClass]?.[2] ?? 0, evBb: evJam });
  }

  // 3betEV(バンドにデータがある場合のみ=100bb)。
  if (st.threeBetToBb) {
    const B3 = st.threeBetToBb;
    const i3 = B3 + anteExtra;
    const pot3 = i3 + B3 + deadOthers;
    const openBase = heroIsOOP ? CALIB.openBaseVsOopDefender : CALIB.openBaseVsIpDefender;
    // オープナーのvs3bet BR(fold/call/jam)をクラスごとに評価して反応レンジを構築。
    const foldArr = new Array<number>(EV_N).fill(0);
    const callArr = new Array<number>(EV_N).fill(0);
    const jamArr = new Array<number>(EV_N).fill(0);
    const t3Mass = rangeMass(stored3Arr);
    const defCall4 = stored3Arr.map((f, i) => (f > 0 && eqVsRange(i, openArr) * potAllIn - S > -i3 ? f : 0));
    const pC4 = t3Mass > 0 ? rangeMass(defCall4) / t3Mass : 0;
    for (let i = 0; i < EV_N; i++) {
      if (openArr[i]! <= 0) continue;
      const rOp = sprAdjust(openBase * playability(EV_LABELS[i]!), Math.max(0, S - B3) / pot3);
      const evF = -R;
      const evC3 = t3Mass > 0 ? rOp * eqVsRange(i, stored3Arr) * pot3 - B3 : evF;
      const evJ4 = t3Mass > 0 ? (1 - pC4) * (i3 + deadOthers) + pC4 * (eqVsRange(i, defCall4) * potAllIn - S) : evF;
      const best = Math.max(evF, evC3, evJ4);
      if (best === evF) foldArr[i] = openArr[i]!;
      else if (best === evC3) callArr[i] = openArr[i]!;
      else jamArr[i] = openArr[i]!;
    }
    const mOpen = rangeMass(openArr);
    const pF3 = mOpen > 0 ? rangeMass(foldArr) / mOpen : 1;
    const pC3 = mOpen > 0 ? rangeMass(callArr) / mOpen : 0;
    const pJ3 = mOpen > 0 ? rangeMass(jamArr) / mOpen : 0;
    const r3 = sprAdjust(Math.min(1.05, base * playability(params.handClass) * (heroIsOOP ? 1.0 : 1.12)), Math.max(0, S - B3) / pot3);
    const evVsJam4 = Math.max(-i3, eqVsRange(h, jamArr) * potAllIn - S);
    const ev3 =
      pF3 * (R + deadOthers) + pC3 * (r3 * (pC3 > 0 ? eqVsRange(h, callArr) : 0.5) * pot3 - i3) + pJ3 * evVsJam4;
    out.push({ bucket: bucketPreflopRaiseBb(B3), frequency: st.strat[params.handClass]?.[1] ?? 0, evBb: ev3 });
  }

  return out;
}

// ============================================================================
// 4) ポストフロップの対オールイン: 実ハンド同士の厳密equity EV
// ============================================================================

export function allInCallGtoActions(params: {
  heroCards: string[];
  villainCards: string[];
  boardSoFar: string[];
  /** コール前のポット(bb, 相手のオールイン込み)。 */
  potBb: number;
  /** コールに必要な額(bb)。 */
  callBb: number;
}): GtoActionEV[] | null {
  const hero = params.heroCards.map((c) => parseCard(c)).filter((c): c is NonNullable<typeof c> => c !== null);
  const villain = params.villainCards.map((c) => parseCard(c)).filter((c): c is NonNullable<typeof c> => c !== null);
  const board = params.boardSoFar.map((c) => parseCard(c)).filter((c): c is NonNullable<typeof c> => c !== null);
  if (hero.length !== 2 || villain.length !== 2 || board.length !== params.boardSoFar.length) return null;

  const eq = computeAllInEquity({
    contenders: [
      { id: "hero", holeCards: [hero[0]!, hero[1]!] },
      { id: "villain", holeCards: [villain[0]!, villain[1]!] },
    ],
    knownBoard: board,
  });
  const heroEq = eq.get("hero");
  if (heroEq === undefined) return null;

  // EV(コール) = equity×(現ポット+コール額) − コール額。EV(フォールド)=0(以降の損失なし)。
  const evCall = heroEq * (params.potBb + params.callBb) - params.callBb;
  const callFreq = evCall > 0 ? 1 : 0;
  return [
    { bucket: "checkOrCall", frequency: callFreq, evBb: evCall },
    { bucket: "fold", frequency: 1 - callFreq, evBb: 0 },
  ];
}
