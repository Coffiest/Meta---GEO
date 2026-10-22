import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtractHand } from "./reviewExtract.js";
import type { GtoActionEV } from "./reviewClassify.js";

/**
 * GTO Wizard のプリフロップの解(オーナーが画面から数値化。`packages/engine/data/gtow/<スタック>/<場面>.json`。web の解説の表も同じファイルを読む)で
 * プリフロップの決定を判定する(オーナー確定 2026-10-09)。
 *
 *  - データは MTT・ChipEV・8max の解を LJ 以降の6人として使う。アプリの「UTG」はデータの「LJ」。
 *  - スタックの段階(`GTOW_TIERS`)ごとにデータを持つ。有効スタックの入る段階のうち、その場面のデータがあるものを使う
 *    (70bb は全場面、50/40/30/25/20bb は BB のディフェンスだけ。50〜60bb で 50bb のデータが無ければ 70bb)。どれにも無ければ従来どおり。
 *  - データに EV は無いので、選んだアクションの GTO の頻度で格付けする(GTOW_BANDS)。
 *  - レイズはサイズを問わずレイズとして扱う。オールインは別のアクション。
 *  - DB には入れずリポジトリの JSON を読む(Supabase の転送量を使わない)。
 */

export const GTOW_MIN_STACK_BB = 18;
/** データのスタックと、それを使う有効スタックの範囲 [下限, 上限)。上から順に当てはめる。 */
export const GTOW_TIERS: readonly { stack: number; min: number; max: number }[] = [
  { stack: 70, min: 60, max: Infinity },
  { stack: 50, min: 45, max: 60 },
  { stack: 70, min: 50, max: 60 },
  { stack: 40, min: 35, max: 45 },
  { stack: 30, min: 27.5, max: 35 },
  { stack: 25, min: 22.5, max: 27.5 },
  { stack: 20, min: 18, max: 22.5 },
];
/** 頻度による格付けの境目。これ以上(またはいちばん多いアクション)は定石手、未満は悪手、NEVER 未満は大悪手。 */
export const GTOW_BANDS = { book: 0.2, never: 0.02 } as const;

type Freq = { raise: number; call: number; fold: number; allIn: number; weight: number };
const cache = new Map<string, Record<string, Freq> | null>();
const here = dirname(fileURLToPath(import.meta.url));

function loadScene(stack: number, scene: string): Record<string, Freq> | null {
  const key = `${stack}/${scene}`;
  if (cache.has(key)) return cache.get(key)!;
  const file = join(here, "..", "..", "engine", "data", "gtow", String(stack), `${scene}.json`);
  let hands: Record<string, Freq> | null = null;
  try {
    if (existsSync(file)) hands = (JSON.parse(readFileSync(file, "utf8")) as { hands: Record<string, Freq> }).hands;
  } catch {
    hands = null;
  }
  cache.set(key, hands);
  return hands;
}

const POS = (p: string) => (p === "UTG" ? "LJ" : p);

/**
 * ヒーローのプリフロップの決定の直前までの手順から、GTO Wizard の場面名を作る。当てはまらなければ null。
 *  RFI_<自分> / vsOpen_<自分>_vs_<オープナー> / vs3bet_<オープナー>_vs_<3ベッター> /
 *  vs4bet_<3ベッター>_vs_<オープナー>(4bet がレイズ)/ vs4betAI_<3ベッター>_vs_<オープナー>(4bet がオールイン)/
 *  vs5bet_<オープナー>_vs_<3ベッター>(5bet オールイン)
 */
export function gtowSceneOf(hand: ExtractHand, heroSeat: number, decisionSeq: number, positions: Map<number, string>): string | null {
  const raises: { seat: number; allIn: boolean }[] = [];
  let calls = 0;
  for (const a of hand.actions) {
    if (a.sequenceNumber >= decisionSeq) break;
    if (a.street !== "preflop" || a.kind === "postBlind" || a.kind === "postAnte") continue;
    if (a.kind === "bet" || a.kind === "raise" || a.kind === "allIn") raises.push({ seat: a.seatIndex, allIn: a.kind === "allIn" });
    else if (a.kind === "call") calls++;
  }
  if (calls > 0) return null; // リンプ・コールが入った場面(スクイーズ等)はデータに無い
  const pos = (s: number) => POS(positions.get(s) ?? "");
  const me = pos(heroSeat);
  if (!me) return null;
  if (raises.length === 0) return `RFI_${me}`;
  const [r1, r2, r3, r4] = raises;
  if (raises.length === 1 && !r1!.allIn && r1!.seat !== heroSeat) return `vsOpen_${me}_vs_${pos(r1!.seat)}`;
  if (raises.length === 2 && r1!.seat === heroSeat && !r2!.allIn) return `vs3bet_${me}_vs_${pos(r2!.seat)}`;
  if (raises.length === 3 && r2!.seat === heroSeat && r3!.seat === r1!.seat) {
    return r3!.allIn ? `vs4betAI_${me}_vs_${pos(r1!.seat)}` : `vs4bet_${me}_vs_${pos(r1!.seat)}`;
  }
  if (raises.length === 4 && r1!.seat === heroSeat && r3!.seat === heroSeat && r4!.seat === r2!.seat && r4!.allIn) {
    return `vs5bet_${me}_vs_${pos(r2!.seat)}`;
  }
  return null;
}

export interface GtowJudgement {
  scene: string;
  /** 使ったデータのスタック(bb)。画面の表も同じファイルを読む。 */
  stack: number;
  gtoActions: GtoActionEV[];
  chosenFreq: number;
  classification: "book" | "mistake" | "blunder";
}

/**
 * 場面とハンドと選んだアクションから、頻度で格付けする。データが無ければ null。
 * `gtoActions` はレイズのバケットを選んだサイズに合わせて返す(サイズを問わずレイズとして扱うため)。
 */
export function judgeGtow(params: {
  scene: string;
  handClass: string;
  effStackBb: number;
  chosenKind: string;
  chosenBucket: string;
}): GtowJudgement | null {
  if (params.effStackBb < GTOW_MIN_STACK_BB) return null;
  let stack = 0;
  let hands: Record<string, Freq> | null = null;
  for (const t of GTOW_TIERS) {
    if (params.effStackBb < t.min || params.effStackBb >= t.max) continue;
    hands = loadScene(t.stack, params.scene);
    if (hands) {
      stack = t.stack;
      break;
    }
  }
  const f = hands?.[params.handClass];
  if (!f) return null;
  const total = f.raise + f.call + f.fold + f.allIn;
  if (total <= 0) return null;
  const raiseBucket = params.chosenBucket.startsWith("raise") ? params.chosenBucket : "raise2-5";
  const gtoActions: GtoActionEV[] = [
    { bucket: "fold", frequency: f.fold, evBb: 0 },
    { bucket: "call", frequency: f.call, evBb: 0 },
    { bucket: raiseBucket, frequency: f.raise, evBb: 0 },
    { bucket: "allIn", frequency: f.allIn, evBb: 0 },
  ];
  const k = params.chosenKind;
  const chosenFreq =
    k === "fold" ? f.fold : k === "call" || k === "check" ? f.call : k === "allIn" ? f.allIn : k === "raise" || k === "bet" ? f.raise : 0;
  const max = Math.max(f.raise, f.call, f.fold, f.allIn);
  const classification =
    chosenFreq >= GTOW_BANDS.book || (chosenFreq > 0 && chosenFreq >= max - 1e-9)
      ? "book"
      : chosenFreq >= GTOW_BANDS.never
        ? "mistake"
        : "blunder";
  return { scene: params.scene, stack, gtoActions, chosenFreq, classification };
}
