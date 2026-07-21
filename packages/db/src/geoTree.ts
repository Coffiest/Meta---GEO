import { prisma } from "./client.js";
import { computeMttPrizeStructure, SNG_PAYOUTS } from "./bankroll.js";
import { computeRRRatings } from "./rrRating.js";

/** トナメ偏差値でGEO集計をフィルタする範囲。min〜maxのプレイヤーの意思決定だけを集計する。 */
export interface RatingRange {
  min: number;
  max: number;
}

/** 偏差値レンジのフィルタ関数を作る。範囲未指定なら常にtrue。参加0件のユーザーは偏差値50扱い。 */
async function buildRatingFilter(range?: RatingRange): Promise<(userId: string) => boolean> {
  if (!range) return () => true;
  const ratings = await computeRRRatings();
  const byUser = new Map(ratings.map((r) => [r.userId, r.rrRating]));
  return (userId: string) => {
    const rating = byUser.get(userId) ?? 50;
    return rating >= range.min && rating <= range.max;
  };
}

/**
 * GEO DATABASE(GTO Wizard型シーケンシャル・アクションツリー)の集計。
 * ソルバー理論値ではなく、実際にプレイされたハンドの実測データのみを対象にする。
 * プリフロップは各ポジションを順番に辿ってライン(アクション系列)を構築し、
 * ポストフロップは正確な板面(厳密一致)まで指定してその局面の実測頻度を返す。
 */

const RANK_ORDER = "AKQJT98765432";
/** 6-maxボタンオフセット(0=ボタン)ごとのポジション名。既存rangeMatrix.ts/geoStats.tsと同じ並び。 */
const POSITION_NAMES = ["BTN", "SB", "BB", "UTG", "HJ", "CO"] as const;

export type StackBucket = "0-5" | "5-10" | "10-15" | "15-20" | "20-30" | "30+";
export const STACK_BUCKETS: StackBucket[] = ["0-5", "5-10", "10-15", "15-20", "20-30", "30+"];

export type BubbleStage = "normal" | "30" | "20" | "10" | "5" | "4" | "3" | "2" | "1" | "finalTable";
export const BUBBLE_STAGES: BubbleStage[] = ["normal", "30", "20", "10", "5", "4", "3", "2", "1", "finalTable"];

export type PreflopBucket = "fold" | "call" | "raise2-2.5" | "raise2.5-3" | "raise3-4" | "raise4+" | "allIn";
export const PREFLOP_BUCKETS: PreflopBucket[] = ["fold", "call", "raise2-2.5", "raise2.5-3", "raise3-4", "raise4+", "allIn"];

/**
 * ポストフロップは「ベットに直面していない(Check/Bet)」局面と「直面している(Fold/Call/Raise)」局面の
 * 両方があり、8色の検証済みパレット内に収めるためFold=青、Check/Call(どちらか一方しかノードに
 * 出現しない)=アクア、を共用スロットとして割り当てる。サイズ帯はプリフロップと違い100-150%と
 * オーバーベットを統合し bet100+ とする(色数を8色の検証結果内に収めるための調整。詳細はplan参照)。
 */
export type PostflopBucket = "fold" | "checkOrCall" | "bet20-40" | "bet40-60" | "bet60-80" | "bet80-100" | "bet100+" | "allIn";
export const POSTFLOP_BUCKETS: PostflopBucket[] = [
  "fold",
  "checkOrCall",
  "bet20-40",
  "bet40-60",
  "bet60-80",
  "bet80-100",
  "bet100+",
  "allIn",
];

export interface LineStep {
  position: string;
  bucket: string;
}

export function stackBucketOf(stackBb: number): StackBucket {
  if (stackBb <= 5) return "0-5";
  if (stackBb <= 10) return "5-10";
  if (stackBb <= 15) return "10-15";
  if (stackBb <= 20) return "15-20";
  if (stackBb <= 30) return "20-30";
  return "30+";
}

/** プリフロップのレイズ額(bb)をバケットへ丸める。fold/call/allInは呼び出し側で先に判定する。 */
export function bucketPreflopRaiseBb(raiseBb: number): PreflopBucket {
  if (raiseBb < 2.5) return "raise2-2.5";
  if (raiseBb < 3) return "raise2.5-3";
  if (raiseBb < 4) return "raise3-4";
  return "raise4+";
}

/** ポストフロップのベット/レイズ額(ポット比%)をバケットへ丸める。fold/checkOrCall/allInは呼び出し側で先に判定する。 */
export function bucketPostflopPct(pct: number): PostflopBucket {
  if (pct < 40) return "bet20-40";
  if (pct < 60) return "bet40-60";
  if (pct < 80) return "bet60-80";
  if (pct < 100) return "bet80-100";
  return "bet100+";
}

/**
 * ジオメトリックサイズ: 残りストリート全てで同じ比率のベットを続ければリバーでちょうど
 * オールインになるサイズ。apps/web/src/components/ActionBar.tsx の computeGeometricToAmount と
 * 同じ式(出典: GTO Wizard "Pot Geometry")。
 */
const STREETS_REMAINING: Record<string, number> = { flop: 3, turn: 2, river: 1 };
function computeGeometricToAmount(params: {
  street: string;
  potTotal: number;
  streetContribution: number;
  behindStack: number;
}): number | null {
  const { street, potTotal, streetContribution, behindStack } = params;
  const streetsRemaining = STREETS_REMAINING[street];
  if (!streetsRemaining || potTotal <= 0 || behindStack <= 0) return null;
  const growthFactor = (potTotal + 2 * behindStack) / potTotal;
  const fraction = 0.5 * (Math.pow(growthFactor, 1 / streetsRemaining) - 1);
  return Math.round(potTotal * fraction) + streetContribution;
}

const RAW_HAND_SELECT = {
  handNumber: true,
  buttonFixedPos: true,
  levelBigBlind: true,
  board: true,
  tournament: {
    select: {
      gameType: true,
      buyIn: true,
      entries: { select: { userId: true, bustedAtHandNumber: true }, orderBy: { seatIndex: "asc" as const } },
    },
  },
  seats: {
    select: { seatIndex: true, userId: true, startingStack: true, holeCards: true, wasAway: true },
  },
  actions: {
    orderBy: { sequenceNumber: "asc" as const },
    select: { sequenceNumber: true, seatIndex: true, street: true, kind: true, toAmount: true, potBefore: true },
  },
};

type RawHand = Awaited<ReturnType<typeof fetchRawHands>>[number];

async function fetchRawHands() {
  // 全ハンドを対象にする(Botのみの卓も含む)。GEOは「このアプリでプレイされた全プレイヤーの
  // 全アクション」を集計対象とするため、人間在席ハンドへの絞り込みは行わない。
  return prisma.hand.findMany({
    // 明示的に古い順で固定する。expectedPosition(下記参照)は「最初に一致したハンド」の値を
    // 採用するため、この順序が未指定(DB内部の物理格納順まかせ)だと本番でVACUUM等により
    // 結果が不安定になりうる。
    orderBy: { createdAt: "asc" },
    select: RAW_HAND_SELECT,
  });
}

/** そのハンド時点で生存していた参加者数(バスト済みでない人数)を数える。 */
function aliveCountAtHand(entries: { bustedAtHandNumber: number | null }[], handNumber: number): number {
  return entries.filter((e) => e.bustedAtHandNumber === null || e.bustedAtHandNumber >= handNumber).length;
}

/** ハンド単位でバブル段階を判定する(SNG/MTTとも「インマネまでの残り人数」基準)。 */
function computeBubbleStage(hand: RawHand): BubbleStage {
  const { gameType, buyIn, entries } = hand.tournament;
  const alive = aliveCountAtHand(entries, hand.handNumber);
  const paidPlaces = gameType === "sng" ? SNG_PAYOUTS.length : computeMttPrizeStructure(entries.length, buyIn).places.length;
  const remainingUntilMoney = Math.max(0, alive - paidPlaces);

  if (gameType === "mtt" && alive <= 6) return "finalTable";
  if (remainingUntilMoney >= 25 && remainingUntilMoney <= 40) return "30";
  if (remainingUntilMoney >= 15 && remainingUntilMoney < 25) return "20";
  if (remainingUntilMoney >= 7 && remainingUntilMoney < 15) return "10";
  if (remainingUntilMoney === 5) return "5";
  if (remainingUntilMoney === 4) return "4";
  if (remainingUntilMoney === 3) return "3";
  if (remainingUntilMoney === 2) return "2";
  if (remainingUntilMoney === 1) return "1";
  return "normal";
}

function bubbleStageMatches(handStage: BubbleStage, requested: BubbleStage): boolean {
  return requested === "normal" || handStage === requested;
}

/** "10h" → "T" のようにランク1文字へ正規化する。 */
function rankChar(card: string): string {
  const rank = card.slice(0, -1);
  return rank === "10" ? "T" : rank;
}

function classify(cards: string[]): { row: number; col: number } | null {
  if (cards.length !== 2) return null;
  const r1 = RANK_ORDER.indexOf(rankChar(cards[0]!));
  const r2 = RANK_ORDER.indexOf(rankChar(cards[1]!));
  if (r1 === -1 || r2 === -1) return null;
  const suited = cards[0]!.slice(-1) === cards[1]!.slice(-1);
  const hi = Math.min(r1, r2);
  const lo = Math.max(r1, r2);
  if (hi === lo) return { row: hi, col: lo };
  return suited ? { row: hi, col: lo } : { row: lo, col: hi };
}

export function cellLabel(row: number, col: number): string {
  const a = RANK_ORDER[Math.min(row, col)]!;
  const b = RANK_ORDER[Math.max(row, col)]!;
  if (row === col) return `${a}${a}`;
  return row < col ? `${a}${b}s` : `${a}${b}o`;
}

interface ReplayedDecision {
  position: string;
  seatIndex: number;
  bucket: string;
  stackBb: number;
  isGeometric: boolean;
  holeCards: string[];
  /** そのアクションが集計対象か(離席中・偏差値レンジ外の席はfalse。ポジション順の整合性のため
   * シーケンス自体には含める。詳細はreplayPreflopDecisionsのコメント参照)。 */
  isCounted: boolean;
}

/**
 * ハンド1件のプリフロップ意思決定を、座席→ポジション変換・スタック深度(bb)算出・
 * bb倍率バケット分類までまとめて時系列に並べる。ブラインド(postBlind/postAnte)は除外する。
 *
 * 集計対象外の席(離席中など)のアクションも(isCounted: falseとして)シーケンスに含める。
 * 対象席だけを間引くと、シーケンスのインデックスと実際のポジション順がズレてしまい、
 * 例えば「line=[]の次の意思決定」が本来UTGであるべきなのに、たまたま最初の対象席の
 * ポジション(例: BB)にすり替わってしまう。集計(サンプル数・options)はisCountedで絞る。
 */
function replayPreflopDecisions(hand: RawHand, countedSeats: Map<number, string[]>): ReplayedDecision[] {
  const seatCount = 6;
  const bigBlind = hand.levelBigBlind;
  const startingStackBySeat = new Map(hand.seats.map((s) => [s.seatIndex, s.startingStack]));
  // アンティはストリート外拠出、ブラインドはストリート内拠出(後続アクションのtoAmount=ストリート
  // 累計に含まれる)。混ぜて1つのマップで持つと、アクションのtoAmountで上書きした時にアンティ分が
  // 消えたり、ブラインド分が二重計上されたりするため、分けて追跡する。
  const anteContribution = new Map<number, number>();
  const streetContribution = new Map<number, number>();

  const decisions: ReplayedDecision[] = [];

  for (const action of hand.actions) {
    if (action.street !== "preflop") break;
    if (action.kind === "postAnte") {
      anteContribution.set(action.seatIndex, (anteContribution.get(action.seatIndex) ?? 0) + (action.toAmount ?? 0));
      continue;
    }
    if (action.kind === "postBlind") {
      streetContribution.set(action.seatIndex, (streetContribution.get(action.seatIndex) ?? 0) + (action.toAmount ?? 0));
      continue;
    }

    const priorStreet = streetContribution.get(action.seatIndex) ?? 0;
    const priorTotal = priorStreet + (anteContribution.get(action.seatIndex) ?? 0);
    const startingStack = startingStackBySeat.get(action.seatIndex) ?? 0;
    const stackBeforeAction = startingStack - priorTotal;
    const stackBb = bigBlind > 0 ? stackBeforeAction / bigBlind : 0;

    const offset = (((action.seatIndex - hand.buttonFixedPos) % seatCount) + seatCount) % seatCount;
    const position = POSITION_NAMES[offset] ?? "";
    const toAmount = action.toAmount ?? priorStreet;
    const maxPossible = priorStreet + stackBeforeAction;
    const isAllIn = action.kind === "allIn" || toAmount >= maxPossible;

    let bucket: PreflopBucket;
    if (action.kind === "fold") bucket = "fold";
    else if (isAllIn) bucket = "allIn";
    else if (action.kind === "call") bucket = "call";
    else bucket = bucketPreflopRaiseBb(toAmount / bigBlind);

    decisions.push({
      position,
      seatIndex: action.seatIndex,
      bucket,
      stackBb,
      isGeometric: false,
      holeCards: countedSeats.get(action.seatIndex) ?? [],
      isCounted: countedSeats.has(action.seatIndex),
    });

    // toAmountはそのストリート内の累計拠出額そのもの(handEngine.commit()と同じ意味論)。
    if (action.toAmount !== null) {
      streetContribution.set(action.seatIndex, action.toAmount);
    }
  }

  return decisions;
}

function linesMatch(actual: ReplayedDecision[], requested: LineStep[]): boolean {
  if (actual.length < requested.length) return false;
  for (let i = 0; i < requested.length; i++) {
    if (actual[i]!.position !== requested[i]!.position || actual[i]!.bucket !== requested[i]!.bucket) return false;
  }
  return true;
}

export interface ActionOption {
  bucket: string;
  count: number;
  frequency: number;
  geometricRatio: number;
}

export interface TreeNode {
  /** 次に手番が来るポジション。ラインがハンド終端(全員フォールド確定等)に達した場合はnull。 */
  position: string | null;
  sampleSize: number;
  options: ActionOption[];
}

export interface HandClassCell {
  label: string;
  count: number;
  byBucket: Record<string, number>;
}

export interface HandClassMatrixResult {
  cells: HandClassCell[][];
  totalSamples: number;
}

function emptyMatrix(): HandClassCell[][] {
  return Array.from({ length: 13 }, (_, row) =>
    Array.from({ length: 13 }, (_, col) => ({ label: cellLabel(row, col), count: 0, byBucket: {} })),
  );
}

/**
 * `expectedPosition` は、実際に一致したハンドの生シーケンス(bot含む)から得られる「本来この
 * インデックスに来るはずのポジション」。人間分の集計結果(filtered)が0件でも、正しいポジション名で
 * 「サンプルなし」を表示できるようにするための値(サンプルがあればfiltered[0]の値と一致するはず)。
 */
function buildNodeFromDecisions(
  nextDecisions: ReplayedDecision[],
  stackBucket: StackBucket,
  expectedPosition: string | null,
): { node: TreeNode; matrix: HandClassMatrixResult } {
  const filtered = nextDecisions.filter((d) => stackBucketOf(d.stackBb) === stackBucket);
  const tally = new Map<string, { count: number; geometricCount: number }>();
  const cells = emptyMatrix();
  let totalSamples = 0;

  for (const d of filtered) {
    const entry = tally.get(d.bucket) ?? { count: 0, geometricCount: 0 };
    entry.count++;
    if (d.isGeometric) entry.geometricCount++;
    tally.set(d.bucket, entry);
    totalSamples++;

    const coords = classify(d.holeCards);
    if (coords) {
      const cell = cells[coords.row]![coords.col]!;
      cell.count++;
      cell.byBucket[d.bucket] = (cell.byBucket[d.bucket] ?? 0) + 1;
    }
  }

  const options: ActionOption[] = [...tally.entries()].map(([bucket, { count, geometricCount }]) => ({
    bucket,
    count,
    frequency: totalSamples > 0 ? count / totalSamples : 0,
    geometricRatio: count > 0 ? geometricCount / count : 0,
  }));

  const position = filtered[0]?.position ?? expectedPosition ?? null;
  return { node: { position, sampleSize: totalSamples, options }, matrix: { cells, totalSamples } };
}

/**
 * プリフロップのツリーノードを取得する。`line` の通りに実際にプレイされたハンドを絞り込み、
 * 次のポジションの意思決定を、指定スタック帯のものだけ集計して返す。
 */
export async function getPreflopNode(params: {
  stackBucket: StackBucket;
  bubbleStage: BubbleStage;
  line: LineStep[];
  ratingRange?: RatingRange | undefined;
}): Promise<{ node: TreeNode; matrix: HandClassMatrixResult }> {
  const [hands, ratingOk] = await Promise.all([fetchRawHands(), buildRatingFilter(params.ratingRange)]);
  const nextDecisions: ReplayedDecision[] = [];
  let expectedPosition: string | null = null;

  for (const hand of hands) {
    if (!bubbleStageMatches(computeBubbleStage(hand), params.bubbleStage)) continue;
    // 全プレイヤー(Bot含む)を集計対象にする。離席中(wasAway)の席、および偏差値レンジ外の
    // プレイヤーのみGEO集計から除外する。
    const countedSeats = new Map(
      hand.seats.filter((s) => !s.wasAway && ratingOk(s.userId)).map((s) => [s.seatIndex, s.holeCards]),
    );
    if (countedSeats.size === 0) continue;

    const decisions = replayPreflopDecisions(hand, countedSeats);
    if (!linesMatch(decisions, params.line)) continue;
    const next = decisions[params.line.length];
    if (!next) continue;
    // 一致した最初のハンドの値を採用する(全ての正常な6-maxハンドはここで一致するはずなので、
    // 後続のハンドで無条件に上書きすると、万一データに異常のあるハンドが1件混ざっただけで
    // 正しい大多数の結果が塗り替えられてしまう)。
    if (expectedPosition === null) expectedPosition = next.position;
    if (next.isCounted) nextDecisions.push(next);
  }

  return buildNodeFromDecisions(nextDecisions, params.stackBucket, expectedPosition);
}

interface ReplayedPostflopDecision extends ReplayedDecision {
  street: string;
}

/**
 * ハンド1件のポストフロップ意思決定(フォールドせず残った座席のみ、ポジション順)を、
 * 街ごとにベットサイズ(ポット%)バケット分類まで含めて時系列に並べる。
 */
function replayPostflopDecisions(
  hand: RawHand,
  countedSeats: Map<number, string[]>,
  foldedSeats: Set<number>,
): ReplayedPostflopDecision[] {
  const seatCount = 6;
  const bigBlind = hand.levelBigBlind;
  const startingStackBySeat = new Map(hand.seats.map((s) => [s.seatIndex, s.startingStack]));
  const handContribution = new Map<number, number>();
  const streetContribution = new Map<number, number>();
  let currentStreet = "preflop";

  const decisions: ReplayedPostflopDecision[] = [];

  for (const action of hand.actions) {
    if (action.street !== currentStreet) {
      // ストリート切り替え: streetContributionをhandContributionへ繰り込みリセット
      for (const [seatIndex, amt] of streetContribution) {
        handContribution.set(seatIndex, (handContribution.get(seatIndex) ?? 0) + amt);
      }
      streetContribution.clear();
      currentStreet = action.street;
    }

    if (action.kind === "postAnte") {
      // アンティはストリート外拠出なのでhandContributionへ直接足す。
      handContribution.set(action.seatIndex, (handContribution.get(action.seatIndex) ?? 0) + (action.toAmount ?? 0));
      continue;
    }
    if (action.kind === "postBlind") {
      // ブラインドはプリフロップのストリート内拠出。後続アクションのtoAmount(ストリート累計)に
      // 含まれるため、handContributionへ直接足すとストリート切替時の繰り込みと二重計上になる。
      streetContribution.set(action.seatIndex, (streetContribution.get(action.seatIndex) ?? 0) + (action.toAmount ?? 0));
      continue;
    }

    // このアクション自体がfoldかどうかで「まだ生きていたか」の判定が変わるため、
    // foldedSeatsへの追加は判定・記録の後に行う(そうしないとfold自体が記録されなくなる)。
    const wasAlreadyFolded = foldedSeats.has(action.seatIndex);

    // 集計対象外の席も(isCounted: falseとして)シーケンスに含める。理由はreplayPreflopDecisionsのコメント参照
    // (人間だけを間引くとポジション順とシーケンスのインデックスがズレるため)。
    if (currentStreet !== "preflop" && !wasAlreadyFolded) {
      const priorStreetContribution = streetContribution.get(action.seatIndex) ?? 0;
      const priorHandContribution = handContribution.get(action.seatIndex) ?? 0;
      const startingStack = startingStackBySeat.get(action.seatIndex) ?? 0;
      const behindStack = startingStack - priorHandContribution - priorStreetContribution;

      const offset = (((action.seatIndex - hand.buttonFixedPos) % seatCount) + seatCount) % seatCount;
      const position = POSITION_NAMES[offset] ?? "";
      const potBefore = action.potBefore;
      const toAmount = action.toAmount ?? priorStreetContribution;
      const maxPossible = priorStreetContribution + behindStack;
      const isAllIn = action.kind === "allIn" || (behindStack > 0 && toAmount >= maxPossible);
      const betAmount = toAmount - priorStreetContribution;

      let bucket: PostflopBucket;
      if (action.kind === "fold") bucket = "fold";
      else if (isAllIn) bucket = "allIn";
      else if (action.kind === "check" || action.kind === "call") bucket = "checkOrCall";
      else {
        const pct = potBefore > 0 ? (betAmount / potBefore) * 100 : 0;
        bucket = bucketPostflopPct(pct);
      }

      const geoTarget = computeGeometricToAmount({
        street: currentStreet,
        potTotal: potBefore,
        streetContribution: priorStreetContribution,
        behindStack,
      });
      const isGeometric =
        bucket !== "checkOrCall" &&
        bucket !== "fold" &&
        geoTarget !== null &&
        Math.abs(toAmount - geoTarget) <= Math.max(1, geoTarget * 0.15);

      decisions.push({
        position,
        seatIndex: action.seatIndex,
        bucket,
        stackBb: bigBlind > 0 ? behindStack / bigBlind : 0,
        isGeometric,
        holeCards: countedSeats.get(action.seatIndex) ?? [],
        isCounted: countedSeats.has(action.seatIndex),
        street: currentStreet,
      });
    }

    if (action.kind === "fold") {
      foldedSeats.add(action.seatIndex);
    }

    // toAmountはそのストリート内の累計拠出額そのもの(handEngine.commit()と同じ意味論)。
    if (action.toAmount !== null) {
      streetContribution.set(action.seatIndex, action.toAmount);
    }
  }

  return decisions;
}

/**
 * ポストフロップのツリーノードを取得する。プリフロップのライン+正確なボード(厳密一致)+
 * そのストリート内のライン、まで絞り込んだ上で次の意思決定を集計する。
 */
export async function getPostflopNode(params: {
  stackBucket: StackBucket;
  bubbleStage: BubbleStage;
  preflopLine: LineStep[];
  board: string[];
  street: "flop" | "turn" | "river";
  postflopLine: LineStep[];
  ratingRange?: RatingRange | undefined;
}): Promise<{ node: TreeNode; matrix: HandClassMatrixResult }> {
  const boardLenForStreet: Record<string, number> = { flop: 3, turn: 4, river: 5 };
  const requiredBoardLen = boardLenForStreet[params.street]!;
  if (params.board.length !== requiredBoardLen) {
    throw new Error(`board must have exactly ${requiredBoardLen} cards for street ${params.street}`);
  }

  const [hands, ratingOk] = await Promise.all([fetchRawHands(), buildRatingFilter(params.ratingRange)]);
  const nextDecisions: ReplayedPostflopDecision[] = [];
  let expectedPosition: string | null = null;

  for (const hand of hands) {
    if (!bubbleStageMatches(computeBubbleStage(hand), params.bubbleStage)) continue;
    if (hand.board.length < requiredBoardLen) continue;
    if (hand.board.slice(0, requiredBoardLen).join(",") !== params.board.join(",")) continue;

    // 全プレイヤー(Bot含む)を集計対象にする。離席中(wasAway)の席、および偏差値レンジ外の
    // プレイヤーのみGEO集計から除外する。
    const countedSeats = new Map(
      hand.seats.filter((s) => !s.wasAway && ratingOk(s.userId)).map((s) => [s.seatIndex, s.holeCards]),
    );
    if (countedSeats.size === 0) continue;

    const preflopDecisions = replayPreflopDecisions(hand, countedSeats);
    if (!linesMatch(preflopDecisions, params.preflopLine)) continue;

    // フォールド済み座席は「実際のハンドで起きた全プリフロップフォールド」を対象にする
    // (要求ラインの範囲内だけではない。ライン一致判定と実際のゲーム進行は別物)。
    const foldedSeats = new Set(preflopDecisions.filter((d) => d.bucket === "fold").map((d) => d.seatIndex));
    const allPostflop = replayPostflopDecisions(hand, countedSeats, foldedSeats);
    const streetDecisions = allPostflop.filter((d) => d.street === params.street);
    if (!linesMatch(streetDecisions, params.postflopLine)) continue;

    const next = streetDecisions[params.postflopLine.length];
    if (!next) continue;
    // getPreflopNodeと同じ理由で、最初に一致したハンドの値のみ採用する。
    if (expectedPosition === null) expectedPosition = next.position;
    if (next.isCounted) nextDecisions.push(next);
  }

  return buildNodeFromDecisions(nextDecisions, params.stackBucket, expectedPosition);
}
