/**
 * フロップの CB(オリジナルレイザー・インポジション・シングルレイズドポット)の判定。
 *
 * 出典: Amu「Flop CBの基礎 (BTN vs BB)」(note, 2023-06-09)。GTO Wizard 100bb のソリューションを
 * 「ボードの7分類 → レンジ全体のサイズと頻度 → ハンドへの振り分け」に整理したもの。要点は
 * `packages/engine/knowledge/flop-cb.md`。オーナー指示で、BTN vs BB に限らずオリジナルかつ IP なら当てはめる。
 *
 * 判定はこの手順で行う:
 *  1. ボードを分類する(Class1 モノトーン / 2 トリップス / 3 ペア / 4 A〜Jハイ HMSD / 5 A〜Jハイ HMnSD /
 *     6 T・9ハイ / 7 8ハイ以下)。コネクト(何らかの2枚でストレートが完成しうる)も見る。
 *  2. 分類ごとに、使うサイズ(33 / 50 / 75 / 125%)と頻度を決める。
 *  3. 手を「高頻度で打つ / 平均 / 低頻度(チェック寄り)」、全サイズ混合のボードでは A / B / C type に振り分ける。
 *  4. 実際のアクション(チェック / どのサイズで打ったか)と照らしてバッジを付ける。
 *
 * 相手の手札は使わない。席の持ち主によって分岐しない。
 */

import type { NotionGrade } from "./strategyVerdict.js";
import { classifyFlop, type FlopClassId } from "../geo/boardClass.js";

export type SizeKey = "33" | "50" | "75" | "125";
/** HM(ハイとミドル)の強さ。Class4 のみ。 */
export type HmTier = "strong" | "mid" | "weak";
/**
 * 手の振り分け。
 *  - high / mid / low: 安いベット主体のボード(Class1・3・5・7)での頻度の高低。
 *  - all: Class2(全部打つ)。
 *  - typeA / typeB / typeC: 全サイズ混合のボード(Class4 の mix・Class6)。A=全サイズ混合 / B=最大サイズ基調 / C=安いベットかチェック。
 *  - value / bluff / check: ポラーなボード(Class4 の強HM)。
 */
export type CbGroup = "high" | "mid" | "low" | "all" | "typeA" | "typeB" | "typeC" | "value" | "bluff" | "check";

export interface FlopCbPlan {
  cls: FlopClassId;
  connected: boolean;
  hmTier?: HmTier | undefined;
  /** レンジ全体の、サイズごとの頻度(0〜1)。チェックは残り。 */
  freq: Partial<Record<SizeKey, number>>;
}

export interface FlopCbJudgement extends FlopCbPlan {
  group: CbGroup;
  /** 手の説明(例「トップペア・グッドキッカー」)。 */
  handLabel: string;
  /** 実際のアクション。check か、近いサイズ。 */
  action: "check" | SizeKey;
  grade: NotionGrade;
}

const RANK: Record<string, number> = { A: 14, K: 13, Q: 12, J: 11, T: 10 };
function rankOf(c: string): number {
  const ch = c[0]!.toUpperCase();
  return RANK[ch] ?? Number(ch);
}
const suitOf = (c: string) => c[c.length - 1]!.toLowerCase();

/** ボードの分類(GEO と同じ `classifyFlop`)から、レンジ全体の CB のサイズと頻度を決める。 */
export function cbPlanForFlop(board: readonly string[]): FlopCbPlan | null {
  const c = classifyFlop(board);
  if (!c) return null;
  const ranks = board.slice(0, 3).map(rankOf).sort((x, y) => y - x);
  const [h, m] = ranks as [number, number, number];
  const connected = c.connected;
  if (c.classId === 1) return { cls: 1, connected, freq: { "33": 0.25, "50": 0.05 } };
  if (c.classId === 2) {
    // 999 以上は 33% か 50%、888 以下は 50% か 75%。どちらもレンジで打つ。
    return { cls: 2, connected, freq: h >= 9 ? { "33": 0.5, "50": 0.5 } : { "50": 0.5, "75": 0.5 } };
  }
  if (c.classId === 3) return { cls: 3, connected, freq: { "33": 0.5, "50": 0.15 } };
  if (c.classId === 4 || c.classId === 5) {
    if (c.classId === 4) {
      const hmTier: HmTier = m >= 12 ? "strong" : h - m >= 4 || (h === 14 && m <= 5) ? "weak" : "mid";
      const freq: FlopCbPlan["freq"] =
        hmTier === "strong"
          ? { "125": 0.5 }
          : hmTier === "mid"
            ? { "33": 0.15, "50": 0.1, "75": 0.1, "125": 0.15 }
            : { "33": 0.15, "50": 0.15, "75": 0.15, "125": 0.05 };
      return { cls: 4, connected, hmTier, freq };
    }
    return { cls: 5, connected, freq: { "33": 0.35, "50": 0.2 } };
  }
  if (c.classId === 6) {
    // コネクトならポットオーバーを外し、安いベットを好む。
    return connected
      ? { cls: 6, connected, freq: { "33": 0.25, "50": 0.15, "75": 0.1 } }
      : { cls: 6, connected, freq: { "33": 0.15, "50": 0.1, "75": 0.1, "125": 0.15 } };
  }
  return connected
    ? { cls: 7, connected, freq: { "33": 0.3, "50": 0.15 } }
    : { cls: 7, connected, freq: { "33": 0.15, "50": 0.15, "75": 0.15 } };
}

/** ポットに対する割合 → 一番近いサイズ。 */
export function sizeKeyOf(pct: number): SizeKey {
  const sizes: [SizeKey, number][] = [["33", 0.33], ["50", 0.5], ["75", 0.75], ["125", 1.25]];
  let best = sizes[0]!;
  for (const s of sizes) if (Math.abs(s[1] - pct) < Math.abs(best[1] - pct)) best = s;
  return best[0];
}

interface Features {
  set: boolean;
  trips: boolean;
  twoPair: boolean;
  overpair: boolean;
  /** 直上のオーバーペア(H+1 / H+2)。 */
  overpairNear: boolean;
  topPair: boolean;
  kicker: number;
  middlePair: boolean;
  bottomPair: boolean;
  /** ボードより下〜間のポケットペア。hiの直下ほど小さい値。 */
  underPocket: number | null;
  flush: "nut" | "second" | "other" | null;
  flushDraw: "nut" | "second" | "other" | null;
  backdoor: boolean;
  straightDraw: boolean;
  straight: boolean;
  /** 2枚ともボードの M 以下。 */
  belowMiddle: boolean;
  /** ボードの H より上の札を持っている(オーバーカード)。 */
  overcard: boolean;
  hiCard: number;
  loCard: number;
  suited: boolean;
}

function straightInfo(all: number[]): { made: boolean; draw: boolean } {
  const set = new Set(all.flatMap((r) => (r === 14 ? [14, 1] : [r])));
  let made = false;
  let draw = false;
  for (let lo = 1; lo <= 10; lo++) {
    const n = [0, 1, 2, 3, 4].filter((i) => set.has(lo + i)).length;
    if (n >= 5) made = true;
    if (n === 4) draw = true;
  }
  return { made, draw };
}

function features(hole: readonly string[], board: readonly string[]): Features {
  const hr = hole.map(rankOf).sort((a, b) => b - a) as [number, number];
  const br = board.map(rankOf);
  const sorted = [...br].sort((a, b) => b - a);
  const [h, m] = sorted as [number, number, number];
  const l = sorted[2]!;
  const pocket = hr[0] === hr[1];
  const hits = hr.filter((r) => br.includes(r));
  const boardSuits = board.map(suitOf);
  const holeSuits = hole.map(suitOf);
  const suitCount = (s: string) => boardSuits.filter((x) => x === s).length + holeSuits.filter((x) => x === s).length;
  let flush: Features["flush"] = null;
  let flushDraw: Features["flushDraw"] = null;
  let backdoor = false;
  for (const s of new Set(holeSuits)) {
    const n = suitCount(s);
    const mine = hole.filter((c) => suitOf(c) === s).map(rankOf).sort((a, b) => b - a);
    // ボードにない最上位の札を持っていればナッツ、その次ならセカンドナッツ。
    const missing = [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2].filter((r) => !board.some((c) => suitOf(c) === s && rankOf(c) === r));
    const tier = mine[0] === missing[0] ? "nut" : mine[0] === missing[1] ? "second" : "other";
    if (n >= 5) flush = tier;
    else if (n === 4) flushDraw = tier;
    else if (n === 3 && mine.length >= 1 && boardSuits.filter((x) => x === s).length >= 1) backdoor = true;
  }
  const st = straightInfo([...hr, ...br]);
  const boardSt = straightInfo(br);
  return {
    set: pocket && br.includes(hr[0]),
    trips: !pocket && hits.length === 1 && br.filter((r) => r === hits[0]).length >= 2,
    twoPair: !pocket && hits.length === 2 && hr[0] !== hr[1] && new Set(br).size === 3,
    overpair: pocket && hr[0] > h,
    overpairNear: pocket && hr[0] > h && hr[0] - h <= 2,
    topPair: !pocket && hr.includes(h) && br.filter((r) => r === h).length === 1,
    kicker: hr.includes(h) ? (hr[0] === h ? hr[1] : hr[0]) : 0,
    middlePair: !pocket && hr.includes(m) && m !== h,
    bottomPair: !pocket && hr.includes(l) && l !== m,
    underPocket: pocket && hr[0] < h && !br.includes(hr[0]) ? h - hr[0] : null,
    flush,
    flushDraw,
    backdoor,
    straightDraw: st.draw && !st.made && !boardSt.draw,
    straight: st.made && !boardSt.made,
    belowMiddle: hr[0] < m,
    overcard: hr[0] > h,
    hiCard: hr[0],
    loCard: hr[1],
    suited: holeSuits[0] === holeSuits[1],
  };
}

const RANK_NAME: Record<number, string> = { 14: "A", 13: "K", 12: "Q", 11: "J", 10: "T" };
const rn = (r: number) => RANK_NAME[r] ?? String(r);

/** キッカーの良し悪し(トップペア)。A・K・Q はグッドキッカー、それ未満はウィーク。 */
function goodKicker(f: Features, h: number): boolean {
  const best = [14, 13, 12].filter((r) => r !== h);
  return f.kicker >= (best[1] ?? 12);
}

function label(f: Features, h: number): string {
  if (f.straight) return "ストレート";
  if (f.flush === "nut") return "ナッツフラッシュ";
  if (f.flush === "second") return "セカンドナッツフラッシュ";
  if (f.flush) return "フラッシュ";
  if (f.set) return "セット";
  if (f.trips) return "トリップス";
  if (f.twoPair) return "ツーペア";
  if (f.overpair) return "オーバーペア";
  if (f.topPair) return `トップペア(キッカー ${rn(f.kicker)}${goodKicker(f, h) ? "・グッドキッカー" : "・ウィークキッカー"})`;
  if (f.middlePair) return "セカンドペア";
  if (f.bottomPair) return "ボトムペア";
  if (f.underPocket !== null) return "ポケットペア";
  if (f.flushDraw === "nut") return "ナッツフラッシュドロー";
  if (f.flushDraw === "second") return "セカンドナッツフラッシュドロー";
  if (f.flushDraw) return "フラッシュドロー";
  if (f.straightDraw) return "ストレートドロー";
  if (f.overcard) return `${rn(f.hiCard)} ハイ`;
  return "ノーヒット";
}

/** 手を振り分ける(記事の Step2)。 */
function groupOf(plan: FlopCbPlan, f: Features, board: readonly string[]): CbGroup {
  const br = board.map(rankOf).sort((a, b) => b - a);
  const h = br[0]!;
  const strongMade = f.straight || f.flush !== null || f.set || f.trips || f.twoPair;
  switch (plan.cls) {
    case 1: {
      // モノトーン: バリューはトップペア・グッドキッカー以上。そこに届かないショーダウンバリューは低頻度。
      if (f.flush === "nut" || f.flush === "second" || f.set || f.twoPair || f.overpair || f.straight) return "high";
      if (f.flushDraw === "nut" || f.flushDraw === "second" || f.straightDraw) return "high";
      if (f.topPair && goodKicker(f, h)) return "mid";
      if (f.topPair || f.middlePair || f.bottomPair || f.underPocket !== null) return "low";
      return "mid";
    }
    case 2:
      return "all";
    case 3: {
      // 点数で上下させる(ほとんどの手は打ってよい)。
      let score = 0;
      if (f.trips || f.flush || f.straight) score += 3;
      if (f.set || (f.twoPair && f.kicker >= 12) || f.overpair) score += 2;
      if (f.straightDraw && f.overcard) score += 1;
      if (f.hiCard === 14 && !f.topPair && !f.middlePair && !f.bottomPair && f.underPocket === null) score -= 1;
      return score >= 2 ? "high" : score <= -1 ? "low" : "mid";
    }
    case 4:
      if (plan.hmTier === "strong") {
        if (strongMade || (f.topPair && goodKicker(f, h)) || f.overpair) return "value";
        if (f.bottomPair || f.straightDraw || f.flushDraw || (f.underPocket !== null && f.underPocket >= 5) || f.belowMiddle || f.backdoor) return "bluff";
        return "check";
      }
      return mixType(f, h);
    case 6:
      return mixType(f, h);
    case 5:
    case 7: {
      if (f.set || f.straight || f.flush) return "high";
      if (f.twoPair) return "high";
      if (plan.cls === 7 && f.overpair) return f.overpairNear ? "high" : "mid";
      if (f.overpair) return "high";
      if (f.topPair) return goodKicker(f, h) ? "high" : "low";
      if (f.middlePair || f.bottomPair) return "mid";
      if (f.underPocket !== null) return f.underPocket <= 2 ? "low" : "mid";
      // トップのハイカード+ミドルのキッカー(例 K ハイのボードの KQ 以外のノーヒット)は低頻度。
      if (f.overcard && f.loCard >= 10) return "low";
      // そのほかは中頻度に色で補正(ハイ側の色持ち・バックドアは高評価、色なしは低評価)。
      if (f.flushDraw || f.straightDraw) return "high";
      return f.backdoor ? "mid" : "low";
    }
    default:
      return "mid";
  }
}

/** 全サイズ混合のボードの A / B / C type。 */
function mixType(f: Features, h: number): CbGroup {
  if (f.straight || f.flush || f.set || f.twoPair || f.overpair) return "typeB";
  if (f.topPair) return goodKicker(f, h) ? "typeB" : "typeC";
  if (f.straightDraw || (f.overcard && f.loCard < 10 && !f.suited)) return "typeB";
  if (f.middlePair || f.underPocket !== null) return "typeC";
  if (f.overcard && f.loCard >= 10) return "typeC";
  return "typeA";
}

/** 打つべき最大サイズ(B type・バリューが使うサイズ)。 */
function largestSize(plan: FlopCbPlan): SizeKey {
  for (const k of ["125", "75", "50", "33"] as SizeKey[]) if ((plan.freq[k] ?? 0) > 0) return k;
  return "33";
}

/** 判定の本体。プランとアクションからバッジを決める。 */
export function judgeFlopCb(params: { hole: readonly string[]; board: readonly string[]; kind: string; sizePct: number }): FlopCbJudgement | null {
  const plan = cbPlanForFlop(params.board);
  if (!plan || params.hole.length < 2) return null;
  const board = params.board.slice(0, 3);
  const f = features(params.hole, board);
  const h = Math.max(...board.map(rankOf));
  const group = groupOf(plan, f, board);
  const action: FlopCbJudgement["action"] = params.kind === "check" ? "check" : sizeKeyOf(params.sizePct);
  const used = action !== "check" && (plan.freq[action] ?? 0) > 0;
  const big = largestSize(plan);
  let grade: NotionGrade;
  if (action === "check") {
    grade =
      group === "low" || group === "typeC" || group === "check"
        ? "best"
        : group === "mid" || group === "typeA" || group === "bluff"
          ? "good"
          : "inaccuracy";
  } else if (!used) {
    // ボードで使わないサイズ。
    grade = group === "low" || group === "typeC" || group === "check" ? "inaccuracy" : "good";
  } else if (group === "all" || group === "high" || group === "value") {
    grade = "best";
  } else if (group === "typeB") {
    grade = action === big ? "best" : "excellent";
  } else if (group === "bluff") {
    grade = action === big ? "best" : "good";
  } else if (group === "mid" || group === "typeA") {
    grade = "excellent";
  } else if (group === "typeC") {
    grade = action === "33" ? "good" : "inaccuracy";
  } else {
    // low / check を打った: 打つ頻度がとても低い手。
    grade = "inaccuracy";
  }
  return { ...plan, group, handLabel: label(f, h), action, grade };
}
