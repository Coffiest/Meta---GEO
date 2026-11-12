/**
 * 特訓(プリフロップの練習モード)の中身。8人卓・トーナメント・アンティあり。
 * データはソルバーの解(場面ごとに、169種類の手それぞれの行動の頻度と期待値)。
 * `public/trainer/<スタック>.json` を必要なときに読み込む。
 *
 * 場面の名前(pa)は、UTG から順に行動を「-」でつないだもの(例: "F-R2.1-F" = UTG フォールド、
 * UTG1 が 2.1bb にレイズ、LJ フォールド)。F=フォールド、C=コール、R<数>=その額までレイズ、RAI=オールイン。
 */

export const TRAINER_POSITIONS = ["UTG", "UTG1", "LJ", "HJ", "CO", "BTN", "SB", "BB"] as const;
export type TrainerPosition = (typeof TRAINER_POSITIONS)[number];
export const TRAINER_STACKS = [100, 60, 40, 30, 20, 12] as const;
export type TrainerStack = (typeof TRAINER_STACKS)[number];

export type TrainerAction = { c: string; s: number[]; e: number[] };
export type TrainerNode = { actor: TrainerPosition; a: TrainerAction[] };
export type TrainerData = { stack: number; nodes: Record<string, TrainerNode> };

const RANKS = "AKQJT98765432";

/** 2枚の札("Ah","Kd")を、169種類の表の位置にする(行=1枚目、列=2枚目。スーテッドは右上)。 */
export function handIndex(c1: string, c2: string): number {
  let a = RANKS.indexOf(c1[0]!);
  let b = RANKS.indexOf(c2[0]!);
  const suited = c1[1] === c2[1];
  if (a > b) [a, b] = [b, a];
  if (a === b) return a * 13 + a;
  return suited ? a * 13 + b : b * 13 + a;
}

export function handName(idx: number): string {
  const r = Math.floor(idx / 13);
  const c = idx % 13;
  if (r === c) return RANKS[r]! + RANKS[c]!;
  return r < c ? `${RANKS[r]}${RANKS[c]}s` : `${RANKS[c]}${RANKS[r]}o`;
}

export function actionLabel(code: string, stack: number): string {
  if (code === "F") return "フォールド";
  if (code === "C") return "コール";
  if (code === "X") return "チェック";
  if (code === "RAI") return `オールイン ${stack}`;
  if (code.startsWith("R")) return `レイズ ${code.slice(1)}`;
  return code;
}

/** 攻撃的な順(乱数「高」で、数字が大きいほど攻撃的な行動に当てる)。 */
export function aggression(code: string): number {
  if (code === "F") return 0;
  if (code === "C" || code === "X") return 1;
  if (code === "RAI") return 1e6;
  return 2 + Number(code.slice(1));
}

export const nextPa = (pa: string, code: string) => (pa ? `${pa}-${code}` : code);

/** 判定(棋譜解析の分類に合わせた5段階)。 */
export type TrainerGrade = "best" | "correct" | "inaccuracy" | "wrong" | "blunder";

export type DecisionResult = {
  grade: TrainerGrade;
  /** 選んだ行動の期待値と、いちばん良い行動の期待値の差(bb)。 */
  evLoss: number;
  /** 0〜1。この判断の点数。 */
  score: number;
  freq: number;
};

/**
 * 1回の判断を採点する(仮の基準。細かい調整は後で)。
 * - 解の頻度が最大の行動、または期待値の損が 0.01bb 以下 → ベスト
 * - 頻度 10% 以上で選ばれる行動 → 正解
 * - 損 0.15bb 未満 → 不正確 / 0.5bb 未満 → 間違い / それ以上 → 大悪手
 * 点数は、選んだ行動の頻度を最大の頻度で割ったものと、損の大きさから決める。
 */
export function gradeDecision(node: TrainerNode, hand: number, code: string): DecisionResult {
  const freqs = node.a.map((x) => x.s[hand] ?? 0);
  const evs = node.a.map((x, i) => ((freqs[i] ?? 0) > 0.001 ? x.e[hand] ?? 0 : x.e[hand] ?? 0));
  const i = node.a.findIndex((x) => x.c === code);
  const freq = freqs[i] ?? 0;
  const bestEv = Math.max(...evs);
  const evLoss = Math.max(0, bestEv - (evs[i] ?? 0));
  const maxFreq = Math.max(...freqs);
  let grade: TrainerGrade;
  if (freq >= maxFreq - 1e-6 || evLoss <= 0.01) grade = "best";
  else if (freq >= 0.1) grade = "correct";
  else if (evLoss < 0.15) grade = "inaccuracy";
  else if (evLoss < 0.5) grade = "wrong";
  else grade = "blunder";
  const score = grade === "best" ? 1 : Math.max(0, Math.min(1, maxFreq > 0 ? freq / maxFreq : 0) * 0.5 + Math.max(0, 1 - evLoss / 1) * 0.5);
  return { grade, evLoss, score, freq };
}

/** 頻度どおりに行動を1つ選ぶ。 */
export function sampleAction(node: TrainerNode, hand: number, rand: () => number = Math.random): string {
  const freqs = node.a.map((x) => x.s[hand] ?? 0);
  const total = freqs.reduce((a, b) => a + b, 0);
  let r = rand() * (total || 1);
  for (let i = 0; i < node.a.length; i++) {
    r -= freqs[i]!;
    if (r <= 0) return node.a[i]!.c;
  }
  return node.a.find((x) => x.c === "F")?.c ?? node.a[0]!.c;
}

/** 乱数(1〜100)に当たる行動(乱数「高」: 数字が大きいほど攻撃的)。 */
export function rngAction(node: TrainerNode, hand: number, rng: number): string {
  const sorted = [...node.a].sort((a, b) => aggression(a.c) - aggression(b.c));
  let acc = 0;
  for (const x of sorted) {
    acc += (x.s[hand] ?? 0) * 100;
    if (rng <= acc + 1e-9) return x.c;
  }
  return sorted[sorted.length - 1]!.c;
}

// ---------- 1ハンドの進行 ----------

export type TrainerSeatState = {
  pos: TrainerPosition;
  cards: [string, string];
  /** このストリートに出した額(bb)。 */
  bet: number;
  stack: number;
  folded: boolean;
  lastCode: string | null;
};

export type TrainerHand = {
  stack: number;
  heroPos: TrainerPosition;
  seats: TrainerSeatState[];
  pa: string;
  /** 次に行動する席(0〜7、UTG=0)。null なら終わり。 */
  toAct: number | null;
  /** すでに行動した後、まだ合わせる必要がある人がいるかの判定用。 */
  acted: boolean[];
  pot: number;
  ante: number;
  done: boolean;
  /** データの無い場面に来たので打ち切った。 */
  outOfData: boolean;
};

function deck(): string[] {
  const out: string[] = [];
  for (const r of RANKS) for (const s of "shdc") out.push(r + s);
  return out;
}

export function dealHand(stack: number, heroPos: TrainerPosition, rand: () => number = Math.random): TrainerHand {
  const d = deck();
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [d[i], d[j]] = [d[j]!, d[i]!];
  }
  const ante = 0.125;
  const seats: TrainerSeatState[] = TRAINER_POSITIONS.map((pos, i) => {
    const blind = pos === "SB" ? 0.5 : pos === "BB" ? 1 : 0;
    return { pos, cards: [d[i * 2]!, d[i * 2 + 1]!], bet: blind, stack: stack - blind, folded: false, lastCode: null };
  });
  return { stack, heroPos, seats, pa: "", toAct: 0, acted: Array(8).fill(false), pot: ante * 8, ante, done: false, outOfData: false };
}

const maxBet = (h: TrainerHand) => Math.max(...h.seats.map((s) => s.bet));

/** 行動を当てはめて、次の手番へ進める。 */
export function applyAction(h: TrainerHand, code: string): TrainerHand {
  if (h.toAct === null) return h;
  const seats = h.seats.map((s) => ({ ...s }));
  const acted = [...h.acted];
  const me = seats[h.toAct]!;
  const top = maxBet(h);
  if (code === "F") me.folded = true;
  else if (code === "C" || code === "X") {
    const add = Math.min(me.stack, top - me.bet);
    me.bet += add;
    me.stack -= add;
  } else {
    const to = code === "RAI" ? me.bet + me.stack : Number(code.slice(1));
    const add = Math.min(me.stack, to - me.bet);
    me.bet += add;
    me.stack -= add;
    // レイズしたら、他の人はもう一度行動する。
    for (let i = 0; i < 8; i++) if (i !== h.toAct) acted[i] = false;
  }
  me.lastCode = code;
  acted[h.toAct] = true;
  const next: TrainerHand = { ...h, seats, acted, pa: nextPa(h.pa, code) };
  next.toAct = nextToAct(next, h.toAct);
  next.done = next.toAct === null;
  return next;
}

function nextToAct(h: TrainerHand, from: number): number | null {
  const live = h.seats.filter((s) => !s.folded);
  if (live.length <= 1) return null;
  const top = maxBet(h);
  for (let k = 1; k <= 8; k++) {
    const i = (from + k) % 8;
    const s = h.seats[i]!;
    if (s.folded || s.stack <= 0) continue;
    if (!h.acted[i] || s.bet < top) return i;
  }
  return null;
}

export const potOf = (h: TrainerHand) => h.pot + h.seats.reduce((a, s) => a + s.bet, 0);
