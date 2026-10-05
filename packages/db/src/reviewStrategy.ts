import {
  judgeBarrelCheck,
  judgeBet,
  judgeSpotDecision,
  readBarrelCheckSpots,
  readBetRoles,
  readDecisionSpots,
  readPotShape,
  readArticleFacts,
  readBoardChange,
  matchArticleRule,
  ARTICLE_RULES,
  type ArticleRule,
  type BarrelVerdict,
  type SpotVerdict,
  type StrategyVerdict,
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
  /** プローブ・ドンク・チェックレイズの表で評価したときの場合分け(バリィの解説の材料)。それ以外は null。 */
  spot: SpotVerdict | null;
  /** ノートに良し悪しの記載が無く、解説だけを付ける評価。GTOの格付けがあればそちらを残す。 */
  keepGto: boolean;
}

/** 知識ベースのルールのうち、決定に当てはまった1件(文章は画面が id で引く)。 */
export interface DecisionArticle {
  id: string;
  /** バッジ。null なら解説だけ。 */
  grade: NotionGrade | null;
  /** true なら GTO の格付けがある決定ではバッジを置き換えない。 */
  keepGto: boolean;
}

/**
 * 各決定に、知識ベース(`packages/engine/knowledge/*.md`)から当てはまるルールを1つ載せる。
 * 役割(ドンク/CB 等)とボードの変化は、先に `attachStrategies` が載せたものを使う。
 */
export function attachArticles(hand: ExtractHand, decisions: ReviewedDecision[], rules: readonly ArticleRule[] = ARTICLE_RULES): void {
  const input = {
    buttonFixedPos: hand.buttonFixedPos,
    seatCount: SEAT_COUNT,
    board: hand.board,
    seats: hand.seats,
    actions: hand.actions,
    icmStage: hand.icmStage ?? null,
  };
  for (const d of decisions) {
    const street = d.street;
    const boardChange =
      d.strategy?.boardChange ?? (street === "turn" || street === "river" ? readBoardChange(street, hand.board) : null);
    const facts = readArticleFacts(input, {
      sequenceNumber: d.sequenceNumber,
      street,
      seatIndex: d.seatIndex,
      heroPos: d.heroPos,
      effStackBb: d.effStackBb,
      potBb: d.potBb,
      facingSizeBb: d.facingSizeBb,
      bucket: d.actionTaken.bucket,
      role: d.strategy?.role ?? null,
      boardChange,
    });
    const rule = matchArticleRule(rules, facts);
    d.article = rule ? { id: rule.id, grade: rule.grade, keepGto: rule.keepGto } : null;
  }
}

/**
 * 各決定に、ベットの役割と戦略判定を載せる。
 *
 * ベット/レイズに加えて、Notion に記載のある場面では**ベット以外の決定**も表で評価する
 * (「打たなかった」「コールした」も選択なので、打つべき手なら咎め、正しければ褒める):
 *  - ダブル/トリプルバレルを打てた場面のチェック
 *  - プローブ・ドンクを打てた場面のチェック
 *  - チェックしてベットに直面した場面(チェックレイズ)のコール/フォールド
 *  - チェックレイズしてコールされたあとのターンのチェック
 * それ以外の決定は null。
 */
export function attachStrategies(hand: ExtractHand, decisions: ReviewedDecision[]): void {
  const roles = readBetRoles(hand.actions, { buttonFixedPos: hand.buttonFixedPos, seatCount: SEAT_COUNT });
  const bySeq = new Map(roles.map((r) => [r.sequenceNumber, r]));
  const holeBySeat = new Map(hand.seats.map((s) => [s.seatIndex, s.holeCards]));
  const potType = readPotShape(hand.actions, { buttonFixedPos: hand.buttonFixedPos, seatCount: SEAT_COUNT }).type;

  const barrelChecks = new Map(readBarrelCheckSpots(hand.actions).map((s) => [s.sequenceNumber, s]));
  const spots = new Map(
    readDecisionSpots(hand.actions, { buttonFixedPos: hand.buttonFixedPos, seatCount: SEAT_COUNT }).map((s) => [
      s.sequenceNumber,
      s,
    ])
  );
  const toStrategy = (role: BetRole | null, v: StrategyVerdict): DecisionStrategy => ({
    role,
    tag: v.tag,
    reason: v.reason,
    grade: v.grade,
    boardChange: v.boardChange,
    barrel: v.barrel,
    spot: v.spot,
    keepGto: v.keepGto,
  });

  for (const d of decisions) {
    const hole = holeBySeat.get(d.seatIndex) ?? [];
    const spr = d.potBb > 0 ? d.effStackBb / d.potBb : null;
    const spot = spots.get(d.sequenceNumber);
    const info = bySeq.get(d.sequenceNumber);
    if (info) {
      const v = judgeBet(info, hole, hand.board, {
        potType,
        spr,
        isAllIn: d.actionTaken.bucket === "allIn",
        afterCheckRaise: spot?.kind === "afterCheckRaise",
      });
      d.strategy = toStrategy(info.role, v);
      continue;
    }
    const kind = d.actionTaken.kind;
    const action = kind === "check" ? "check" : kind === "call" ? "call" : kind === "fold" ? "fold" : null;
    let v: StrategyVerdict | null = null;
    if (action) {
      // チェックレイズ後のターンは、ダブルバレルより先に見る(ノートに専用の戦略がある)。
      if (spot?.kind === "afterCheckRaise") v = judgeSpotDecision(spot, action, hole, hand.board, { potType, spr });
      const barrel = action === "check" ? barrelChecks.get(d.sequenceNumber) : undefined;
      if (!v && barrel) v = judgeBarrelCheck(barrel, hole, hand.board, spr);
      if (!v && spot) v = judgeSpotDecision(spot, action, hole, hand.board, { potType, spr });
    }
    d.strategy = v ? toStrategy(null, v) : null;
  }
  attachArticles(hand, decisions);
}

/**
 * Notion の評価で、格付けを置き換える。
 *
 * - **GTOの分類が無い決定(マルチウェイ等)にも付ける。** ポストフロップは Notion で判定する方針のため。
 *   このとき `evLossBb` は null のまま(GTO精度の平均には入らない。件数には入る)。
 * - `evLossBb` はそのまま残す。数字はGTO由来の事実で、バッジだけが Notion の評価になる。
 * - `keepGto` の評価(チェックレイズの表に無い手のコール/フォールドなど)は、GTOの格付けがあれば上書きしない。
 */
export function applyNotionGrades(decisions: ReviewedDecision[]): void {
  for (const d of decisions) {
    const g = d.strategy?.grade;
    if (!g) {
      applyArticleGrade(d);
      continue;
    }
    // 解説だけの評価(ノートに良し悪しの記載が無い)は、GTOの格付けがあればそちらを残す。
    if (d.strategy?.keepGto && d.classification !== null && d.classification !== g) continue;
    d.classification = g;
  }
}

/**
 * 知識ベースのルールのバッジ。Notion の評価が無い決定にだけ効く(Notion > 記事 > GTO)。
 * `keepGto` のルールは、GTO の格付けがあればそちらを残す。
 */
function applyArticleGrade(d: ReviewedDecision): void {
  const a = d.article;
  if (!a?.grade) return;
  if (a.keepGto && d.classification !== null) return;
  d.classification = a.grade;
}
