import {
  judgeBet,
  readBetRoles,
  type BetRole,
  type BoardChange,
  type OverrideClass,
  type StrategyReason,
  type StrategyTag,
} from "@meta-geo/engine";
import { SEAT_COUNT, type ExtractHand } from "./reviewExtract.js";
import type { ReviewedDecision } from "./review.js";

/**
 * 戦略判定を、分類済みの決定に載せてバッジを上書きする層。
 *
 * 判定の中身(役割の判定・シンバリュー/マージナル/フラドロミス)は `@meta-geo/engine` の純関数。
 * ここは「決定に結び付ける」と「格付けを書き換える」だけ。
 *
 * 分類はこのファイルの外で何度も書き換わる(同期の分類 → 保存済みソルバー結果のマージ →
 * GEOエクスプロイトの「芸術的」)。そのため
 *  - `attachStrategies` は解析の最初に1回、手札とアクション履歴から**判定を決定に載せる**
 *  - `applyStrategyOverrides` は決定だけを見て格付けを上書きする(何度呼んでも同じ結果)
 * に分け、分類が確定する各経路の最後に後者を呼ぶ。手札を持たない経路(保存済み結果のマージ)
 * でも上書きが効く。
 *
 * **全席を同じ経路で扱う。** 席の持ち主が誰であっても、判定も返る形も同一。
 */

export interface DecisionStrategy {
  role: BetRole;
  tag: StrategyTag | null;
  reason: StrategyReason | null;
  /** バッジを上書きする格付け。null なら GTO の格付けのまま。 */
  override: OverrideClass | null;
  boardChange: BoardChange | null;
}

/** 各決定に、ベットの役割と戦略判定を載せる。ベット/レイズ以外の決定は null のまま。 */
export function attachStrategies(hand: ExtractHand, decisions: ReviewedDecision[]): void {
  const roles = readBetRoles(hand.actions, { buttonFixedPos: hand.buttonFixedPos, seatCount: SEAT_COUNT });
  const bySeq = new Map(roles.map((r) => [r.sequenceNumber, r]));
  const holeBySeat = new Map(hand.seats.map((s) => [s.seatIndex, s.holeCards]));

  for (const d of decisions) {
    const info = bySeq.get(d.sequenceNumber);
    if (!info) {
      d.strategy = null;
      continue;
    }
    const v = judgeBet(info, holeBySeat.get(d.seatIndex) ?? [], hand.board);
    d.strategy = { role: info.role, tag: v.tag, reason: v.reason, override: v.override, boardChange: v.boardChange };
  }
}

/**
 * 戦略判定の格付けで、GTOの格付けを上書きする。
 *
 * - 上書きするのは**分類が付いている決定だけ**。GTOの基準が無い決定(マルチウェイ等)に
 *   バッジだけ付けると、要約の精度(EV損の平均)と件数の母数がずれる。
 * - `evLossBb` はそのまま残す。数字はGTO由来の事実で、バッジだけが戦略判定になる。
 */
export function applyStrategyOverrides(decisions: ReviewedDecision[]): void {
  for (const d of decisions) {
    const o = d.strategy?.override;
    if (o && d.classification !== null) d.classification = o;
  }
}
