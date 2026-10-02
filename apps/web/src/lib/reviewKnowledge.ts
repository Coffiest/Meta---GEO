import type { Classification } from "./classification";
import type { PostflopBucket, PreflopBucket } from "./geoApi";
import type { ReviewedDecision } from "./reviewApi";
// engine は**モジュール単位で**インポートする(他の web のコードと同じ)。ルート
// (`@meta-geo/engine`)は deck.ts 経由で `node:crypto` を取り込むので、ブラウザ向けの
// バンドルに入れるとビルドが落ちる。
import type { BetRole } from "@meta-geo/engine/src/review/betRole.js";
import {
  readBoardTexture,
  type BoardTexture,
  type DrawDensity,
  type RankBand,
  type SuitPattern,
} from "@meta-geo/engine/src/review/boardTexture.js";
import {
  readHandStrength,
  type HandStrength,
  type KickerBand,
  type MadeCategory,
} from "@meta-geo/engine/src/review/handStrength.js";
import { readPotShape, type PotShape, type PotType } from "@meta-geo/engine/src/review/potShape.js";
import type {
  BoardChange,
  StrategyReason,
  StrategyTag,
} from "@meta-geo/engine/src/review/strategyVerdict.js";

/**
 * 棋譜解析に、オーナーが書いたポーカー知識を添えるための仕組み。
 *
 * 解析そのもの(`packages/db/src/reviewClassify.ts`)は、heroの1アクションを
 * GTO最善からのEV損で9段階に格付けする。ただし返るのは格付けとEV損と頻度だけで、
 * 「**なぜ**その手が悪いのか」を説明する文章がどこにも無い。
 *
 * ここはその空きを埋める層で、**格付けのロジックには一切触らない**。
 * 条件に当てはまった知識を引いてきて、格付けの隣に置くだけ。
 *
 * 知識の実体は `src/data/reviewKnowledge.ts`。Notion に書かれたものを開発時に
 * 取り込む(実行時に Notion を読みにいかないので、追加のコストも遅延も無い)。
 */

/** 解析対象のストリート。showdown には決定が無いので含めない。 */
export type KnowledgeStreet = "preflop" | "flop" | "turn" | "river";

/**
 * hero が実際に取った手のバケット。`geoApi.ts` の語彙(サーバーの `geoTree.ts` と同じ)そのもの。
 *
 * **型で縛っている理由**: ここを `string` にしていた頃、存在しない名前(`bet33` / `bet75` /
 * `raise50` など)で条件を書いてしまい、ベット/レイズを条件にした解説が実データでは一度も
 * 当たらなくなっていた。テストも同じ架空の名前で組んでいたので通ってしまった。
 * ポストフロップのレイズもベットと同じ `bet…` のバケットになる(`raise…` は無い)。
 */
export type ActionBucket = PreflopBucket | PostflopBucket;

/** ポストフロップのベット/レイズ(額あり)のバケット。 */
export const BET_BUCKETS: ActionBucket[] = ["bet20-40", "bet40-60", "bet60-80", "bet80-100", "bet100+"];
/** ベット全般(オールインを含む)。「打った」ことだけを条件にするとき。 */
export const ANY_BET: ActionBucket[] = [...BET_BUCKETS, "allIn"];
/** 大きめのベット(ポットの60%以上)とオールイン。 */
export const BIG_BET: ActionBucket[] = ["bet60-80", "bet80-100", "bet100+", "allIn"];
/** ポットサイズ前後以上。 */
export const HUGE_BET: ActionBucket[] = ["bet80-100", "bet100+", "allIn"];

/** 数値の範囲条件。書いた側だけを判定する(min だけ / max だけ、も可)。 */
export interface RangeCond {
  /** この値以上(境界を含む)。 */
  min?: number;
  /** この値**未満**(境界を含まない)。min と揃えず非対称にしてあるのは、
   *  「20bb以下」と「20bb超」のような帯を隙間なく敷き詰められるようにするため。 */
  max?: number;
}

/**
 * 知識が当てはまる条件。
 *
 * **書かれた項目だけを判定する。** 書かなかった項目は「問わない」。
 * 全部省略すれば、あらゆる決定に当てはまる一般論になる。
 */
export interface KnowledgeWhen {
  street?: KnowledgeStreet[];
  /** ポジション名(UTG / HJ / CO / BTN / SB / BB)。 */
  heroPos?: string[];
  /** 9段階の格付け。「悪手のときだけ出す」のような使い方をする。 */
  classification?: Classification[];
  /** 有効スタック(bb)。 */
  effStackBb?: RangeCond;
  /** 直面しているベットサイズ(bb)。直面していない決定には当たらない。 */
  facingSizeBb?: RangeCond;
  /** hero が実際に取った手。語彙は `ActionBucket`。 */
  actionBucket?: ActionBucket[];
  /** GTO が最も高い頻度で取る手。 */
  gtoTopBucket?: string[];

  // ── ボードの質感(`boardTexture.ts`)。帯は L=2〜4 / M=5〜9 / H=T〜A ──
  /** 帯の並び(例 "H-L-L")。フロップの3枚を高い順に並べたもの。 */
  boardShape?: string[];
  /** ボードの最高ランクの帯。 */
  boardHighBand?: RankBand[];
  /** スートの散り方。5枚のボードでは "twotone" はほぼ常に真になるので注意。 */
  boardSuit?: SuitPattern[];
  /** フラッシュが成立しうるか(同じスートが3枚以上)。 */
  boardFlushPossible?: boolean;
  /** ドローの多寡。 */
  boardDraws?: DrawDensity[];
  /** ペアが乗っているか。 */
  boardPaired?: boolean;
  /** ペアのランクの帯(【ミドルペアボード】の「ロー/ミドル/ハイがペア」)。 */
  boardPairBand?: RankBand[];
  /** ブロードウェイの枚数(ノートの「2BW」= 2)。 */
  boardBroadwayCount?: RangeCond;
  /** ハイと2番目のランク差(【A〜Jhi HMnSD】の「HM」)。 */
  boardHmGap?: RangeCond;

  // ── 自分の手(`handStrength.ts`)──
  /** 出来ている役。 */
  made?: MadeCategory[];
  /** トップペアのときのキッカーの段。 */
  kicker?: KickerBand[];
  /** 成立しているドロー。ここに挙げたもののうち**どれか1つでも**成立していれば当たり。 */
  anyDraw?: (keyof HandStrength["draws"])[];

  // ── ベットの役割と戦略判定(サーバーが決定に載せる `strategy`)──
  /** ベットの役割(ドンク/CB/ディレイCB/バレル/プローブ/チェックレイズ)。 */
  role?: BetRole[];
  /** 戦略判定のタグ(シンバリュー/マージナル/フラドロミス・ブラフ/ドンクの良し悪し)。 */
  strategyTag?: StrategyTag[];
  /** 戦略判定の理由。 */
  strategyReason?: StrategyReason[];
  /** 直前のストリートから盤面のどこが変わったか(ドンクの理由に使う)。 */
  boardChange?: BoardChange[];

  // ── ポットの形(`potShape.ts`)──
  potType?: PotType[];
  /** ブラインド同士か(ノートの「BvB」)。 */
  blindVsBlind?: boolean;
}

/** 決定そのものには乗っていない、ハンド全体から導ける文脈。 */
export interface KnowledgeContext {
  board: readonly string[];
  heroHoleCards: readonly (string | null)[];
  actions: readonly { seatIndex: number; street: string; kind: string }[];
  buttonFixedPos: number;
  seatCount: number;
}

/** 文脈から、条件判定に使う3つの読み取り結果を作る。決定ごとに作り直さないよう外で1回作る。 */
export interface KnowledgeFacts {
  texture: BoardTexture | null;
  hand: HandStrength | null;
  pot: PotShape;
}

/** そのストリートの時点で開いていたボードの枚数。 */
const BOARD_CARDS_BY_STREET: Record<string, number> = { preflop: 0, flop: 3, turn: 4, river: 5 };

/**
 * その決定の時点で見えていたボードを切り出す。
 *
 * タイムラインが持っているのは**最終的な5枚**なので、そのままフロップの決定に使うと
 * 「フロップでは A-L-L だったのに、リバーまで含めて判定してしまう」ことになる。
 * ストリートで切ること。
 */
export function boardUpTo(street: string, board: readonly string[]): string[] {
  const n = BOARD_CARDS_BY_STREET[street];
  return board.slice(0, n === undefined ? board.length : n);
}

/** 1つの決定について、条件判定に使う読み取り結果を作る。 */
export function factsForDecision(street: string, ctx: KnowledgeContext): KnowledgeFacts {
  const board = boardUpTo(street, ctx.board);
  return {
    texture: readBoardTexture(board),
    hand: readHandStrength(ctx.heroHoleCards, board),
    pot: readPotShape(ctx.actions, { buttonFixedPos: ctx.buttonFixedPos, seatCount: ctx.seatCount }),
  };
}

export interface KnowledgeEntry {
  /** 一意な識別子。Notion のページに対応させる。 */
  id: string;
  /** 見出し。畳んだ詳細の見出しになる。 */
  title: string;
  /**
   * カードに**常時出る**1〜2文。
   *
   * ここが解説の主役。局後検討を1ハンドぶん流し読みするとき、読まれるのはこの行だけ。
   * 一般論(「A-L-Lボードはチェック多め」)ではなく、**その手について**の言い方にする
   * (「Aハイ・ロー・ローなので、ここはチェック多め」)。長くて2文。
   */
  summary: string;
  /** 詳しい本文。タップで開く。Notion の内容をここに置く。 */
  body: string;
  /** 出典(Notion のページURL)。あれば画面に小さく導線を出す。 */
  sourceUrl?: string;
  /**
   * 並び順の微調整(既定 0)。条件の数に足して比べる。
   *
   * 条件の数だけで順位が決まると、「役割の説明」(条件が少ない)が「サイズの一般論」(条件が多い)に
   * 負けたり、逆に一般論が具体的な話を押しのけたりする。**個別の局面の話 > 役割の説明 > 一般論**
   * の順に並べるための調整用。多用しない(条件の書き方で解決できるならそちらを先に)。
   */
  priority?: number;
  when: KnowledgeWhen;
}

/**
 * 1つの決定に添える知識の上限。
 *
 * 常時表示にした以上、2件並べると決定ごとに文章の塊が2つ積まれて一覧性が壊れる。
 * 最も具体的に当たった1件だけを出す。
 */
export const MAX_NOTES_PER_DECISION = 1;

function inRange(value: number | null | undefined, cond: RangeCond | undefined): boolean {
  if (!cond) return true;
  // 条件が書かれているのに値が無い決定は、当てはまらないものとして落とす。
  // (「オーバーベットに直面したら」という知識を、誰もベットしていない局面に出さない)
  if (value === null || value === undefined) return false;
  if (cond.min !== undefined && value < cond.min) return false;
  if (cond.max !== undefined && value >= cond.max) return false;
  return true;
}

function inSet(value: string | null | undefined, allowed: readonly (string | null)[] | undefined): boolean {
  if (!allowed) return true;
  // 候補に null が書かれている場合だけ、値が無いことを「当たり」とみなす
  // (「キッカーの段が無い = トップペアではない」を条件にしたいときのため)。
  if (value === null || value === undefined) return allowed.includes(null);
  return allowed.includes(value);
}

/** GTO が最も高い頻度で取る手。頻度0しか無い(=基準なし)なら null。 */
export function gtoTopBucket(d: ReviewedDecision): string | null {
  if (!d.gtoActions || d.gtoActions.length === 0) return null;
  let top: { bucket: string; frequency: number } | null = null;
  for (const a of d.gtoActions) {
    if (a.frequency <= 0) continue;
    if (!top || a.frequency > top.frequency) top = a;
  }
  return top ? top.bucket : null;
}

/**
 * 戦略判定に当たる知識の加点。これがあると、条件の数に関係なく先頭に来る。
 *
 * 判定でバッジを上書きした手には、**上書きの理由を説明する解説が必ず出る**必要がある。
 * ボード条件の多い一般論(「A-L-Lはチェック多め」)が先に出ると、バッジは「大悪手」なのに
 * 解説は別の話、という食い違いになる。
 */
const STRATEGY_BONUS = 100;

/** `when` に実際に書かれている条件の数。多いほど具体的な知識とみなす。 */
function specificity(when: KnowledgeWhen): number {
  const n = Object.values(when).filter((v) => v !== undefined).length;
  return when.strategyTag || when.strategyReason ? n + STRATEGY_BONUS : n;
}

function matches(entry: KnowledgeEntry, d: ReviewedDecision, facts: KnowledgeFacts): boolean {
  const w = entry.when;
  if (!inSet(d.street, w.street)) return false;
  if (!inSet(d.heroPos, w.heroPos)) return false;
  if (!inSet(d.classification, w.classification)) return false;
  if (!inRange(d.effStackBb, w.effStackBb)) return false;
  if (!inRange(d.facingSizeBb, w.facingSizeBb)) return false;
  if (!inSet(d.actionTaken.bucket, w.actionBucket)) return false;
  if (!inSet(gtoTopBucket(d), w.gtoTopBucket)) return false;

  // ボードの質感。プリフロップにはボードが無いので、質感の条件が書いてあれば当たらない。
  const t = facts.texture;
  if (w.boardShape || w.boardHighBand || w.boardSuit || w.boardDraws || w.boardPaired !== undefined ||
      w.boardPairBand || w.boardBroadwayCount || w.boardHmGap || w.boardFlushPossible !== undefined) {
    if (!t) return false;
  }
  if (t) {
    if (!inSet(t.shape, w.boardShape)) return false;
    if (!inSet(t.bands[0], w.boardHighBand)) return false;
    if (!inSet(t.suit, w.boardSuit)) return false;
    if (w.boardFlushPossible !== undefined && t.flushPossible !== w.boardFlushPossible) return false;
    if (!inSet(t.draws, w.boardDraws)) return false;
    if (w.boardPaired !== undefined && t.isPaired !== w.boardPaired) return false;
    if (!inSet(t.pairBand, w.boardPairBand)) return false;
    if (!inRange(t.broadwayCount, w.boardBroadwayCount)) return false;
    if (!inRange(t.hmGap, w.boardHmGap)) return false;
  }

  // 自分の手。手札が見えない決定(相手の決定など)では、手の条件が書いてあれば当たらない。
  const h = facts.hand;
  if ((w.made || w.kicker || w.anyDraw) && !h) return false;
  if (h) {
    if (!inSet(h.made, w.made)) return false;
    if (!inSet(h.kicker, w.kicker)) return false;
    // anyDraw は「挙げたもののうちどれか1つでも成立していれば当たり」。
    if (w.anyDraw && !w.anyDraw.some((k) => h.draws[k])) return false;
  }

  // ベットの役割と戦略判定。ベット/レイズ以外の決定(strategy が null)には、書いてあれば当たらない。
  if (w.role || w.strategyTag || w.strategyReason || w.boardChange) {
    const st = d.strategy;
    if (!st) return false;
    if (!inSet(st.role, w.role)) return false;
    if (!inSet(st.tag, w.strategyTag)) return false;
    if (!inSet(st.reason, w.strategyReason)) return false;
    if (!inSet(st.boardChange, w.boardChange)) return false;
  }

  if (!inSet(facts.pot.type, w.potType)) return false;
  if (w.blindVsBlind !== undefined && facts.pot.isBlindVsBlind !== w.blindVsBlind) return false;

  return true;
}

/**
 * 1つの決定に添える知識を引く。
 *
 * 条件の数が多いものを先に返す ―― 「BTNの20bb以下」のような具体的な知識があるなら、
 * 一般論より先に読ませたい。同数なら定義順(= Notion での並び順)を保つ。
 */
export function matchKnowledge(
  decision: ReviewedDecision,
  entries: readonly KnowledgeEntry[],
  facts: KnowledgeFacts = EMPTY_FACTS,
  limit: number = MAX_NOTES_PER_DECISION
): KnowledgeEntry[] {
  const hit = entries
    .map((entry, index) => ({ entry, index, score: specificity(entry.when) + (entry.priority ?? 0) }))
    .filter(({ entry }) => matches(entry, decision, facts))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  return hit.slice(0, Math.max(0, limit)).map(({ entry }) => entry);
}

/** 文脈が無いとき(プリフロップのみの決定など)の既定。 */
export const EMPTY_FACTS: KnowledgeFacts = {
  texture: null,
  hand: null,
  pot: { type: "srp", raiseCount: 1, isBlindVsBlind: false },
};
