import {
  judgeBarrelCheck,
  judgeBet,
  readBarrelCheckSpots,
  readBetRoles,
  readPotShape,
  type BarrelVerdict,
  type BetRole,
  type BoardChange,
  type NotionGrade,
  type StrategyReason,
  type StrategyTag,
} from "@meta-geo/engine";
import { SEAT_COUNT, type ExtractHand } from "./reviewExtract.js";
import type { ReviewedDecision } from "./review.js";

/**
 * ポストフロップの決定に、Notion に基づく評価(9段階)を載せてバッジにする層。
 *
 * オーナー確定: **ポストフロップは GTO のEV損ではなく Notion の内容で良手/悪手を決める。**
 * どのルールにも当たらない手は評価せず、GTO のバッジのまま残す。
 *
 * 評価の中身(役割の判定・ルール表)は `@meta-geo/engine` の純関数。ここは
 * 「決定に結び付ける」と「格付けを書き換える」だけ。
 *
 * 分類はこのファイルの外で何度も書き換わる(同期の分類 → 保存済みソルバー結果のマージ →
 * GEOエクスプロイトの「芸術的」)。そのため
 *  - `attachStrategies` は解析の最初に1回、手札とアクション履歴から**評価を決定に載せる**
 *  - `applyNotionGrades` は決定だけを見て格付けを置き換える(何度呼んでも同じ結果)
 * に分け、分類が確定する各経路の最後に後者を呼ぶ。手札を持たない経路(保存済み結果のマージ)
 * でも効く。
 *
 * **全席を同じ経路で扱う。** 席の持ち主が誰であっても、判定も返る形も同一。
 */

export interface DecisionStrategy {
  /** ベットの役割。チェックの評価(ダブル/トリプルバレルを打たなかった)では null。 */
  role: BetRole | null;
  tag: StrategyTag | null;
  reason: StrategyReason | null;
  /** Notion に基づく評価。null ならどのルールにも当たらず、GTO の格付けのまま。 */
  grade: NotionGrade | null;
  boardChange: BoardChange | null;
  /** ダブル/トリプルバレルの表で評価したときの場合分け(バリィの解説の材料)。それ以外は null。 */
  barrel: BarrelVerdict | null;
}

/**
 * 各決定に、ベットの役割と戦略判定を載せる。
 * ベット/レイズに加えて、ダブル/トリプルバレルを打てた場面の**チェック**も表で評価する
 * (「打たなかった」も選択なので、打つべき手なら咎め、打たない手なら褒める)。それ以外の決定は null。
 */
export function attachStrategies(hand: ExtractHand, decisions: ReviewedDecision[]): void {
  const roles = readBetRoles(hand.actions, { buttonFixedPos: hand.buttonFixedPos, seatCount: SEAT_COUNT });
  const bySeq = new Map(roles.map((r) => [r.sequenceNumber, r]));
  const holeBySeat = new Map(hand.seats.map((s) => [s.seatIndex, s.holeCards]));
  const potType = readPotShape(hand.actions, { buttonFixedPos: hand.buttonFixedPos, seatCount: SEAT_COUNT }).type;

  const checkSpots = new Map(readBarrelCheckSpots(hand.actions).map((s) => [s.sequenceNumber, s]));

  for (const d of decisions) {
    const info = bySeq.get(d.sequenceNumber);
    if (!info) {
      const spot = d.actionTaken.kind === "check" ? checkSpots.get(d.sequenceNumber) : undefined;
      const v = spot ? judgeBarrelCheck(spot, holeBySeat.get(d.seatIndex) ?? [], hand.board) : null;
      d.strategy = v
        ? { role: null, tag: v.tag, reason: v.reason, grade: v.grade, boardChange: v.boardChange, barrel: v.barrel }
        : null;
      continue;
    }
    const v = judgeBet(info, holeBySeat.get(d.seatIndex) ?? [], hand.board, {
      potType,
      spr: d.potBb > 0 ? d.effStackBb / d.potBb : null,
      isAllIn: d.actionTaken.bucket === "allIn",
    });
    d.strategy = {
      role: info.role,
      tag: v.tag,
      reason: v.reason,
      grade: v.grade,
      boardChange: v.boardChange,
      barrel: v.barrel,
    };
  }
}

/**
 * Notion の評価で、格付けを置き換える。
 *
 * - **GTOの分類が無い決定(マルチウェイ等)にも付ける。** ポストフロップは Notion で判定する方針のため。
 *   このとき `evLossBb` は null のまま(GTO精度の平均には入らない。件数には入る)。
 * - `evLossBb` はそのまま残す。数字はGTO由来の事実で、バッジだけが Notion の評価になる。
 */
export function applyNotionGrades(decisions: ReviewedDecision[]): void {
  for (const d of decisions) {
    const g = d.strategy?.grade;
    if (g) d.classification = g;
  }
}
