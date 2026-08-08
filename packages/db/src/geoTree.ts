import { computePositionLabels } from "@meta-geo/engine";
import { Prisma } from "@prisma/client";
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

/**
 * ハンド1件のポジション名(席番号→BTN/SB/BB/UTG...)。固定席オフセットではなく、記録された
 * 実際のブラインド席(isSmallBlind/isBigBlind)から blind基準で決める(卓表示と同一ロジック)。
 * これにより人数が減った卓のハンド(3人=BTN/SB/BB、ヘッズアップ=BTN(SB)/BB等)も正しく命名される。
 */
function positionLabelsForHand(hand: RawHand): Map<number, string> {
  const sbSeat = hand.seats.find((s) => s.isSmallBlind)?.seatIndex ?? null;
  const bbSeat = hand.seats.find((s) => s.isBigBlind)?.seatIndex;
  return computePositionLabels({
    seatIndexes: hand.seats.map((s) => s.seatIndex),
    buttonFixedPos: hand.buttonFixedPos,
    smallBlindSeat: sbSeat,
    // 記録不備でBBフラグが無い場合のみ、慣例位置(ボタンの2つ左)へフォールバック。
    bigBlindSeat: bbSeat ?? (hand.buttonFixedPos + 2) % 6,
    seatCount: 6,
  });
}

export type StackBucket = "0-5" | "5-10" | "10-15" | "15-20" | "20-30" | "30+";
export const STACK_BUCKETS: StackBucket[] = ["0-5", "5-10", "10-15", "15-20", "20-30", "30+"];

export type BubbleStage = "normal" | "30" | "20" | "10" | "5" | "4" | "3" | "2" | "1" | "finalTable";
export const BUBBLE_STAGES: BubbleStage[] = ["normal", "30", "20", "10", "5", "4", "3", "2", "1", "finalTable"];

// プリフロップのレイズはサイズ帯を細かく分けず、オープンレンジ(2〜5bb)を1つの "raise2-5" に
// まとめる。5bbを超える大きなレイズ(主に3bet/4bet)は "raise5+" として区別する。allInは別。
export type PreflopBucket = "fold" | "call" | "raise2-5" | "raise5+" | "allIn";
export const PREFLOP_BUCKETS: PreflopBucket[] = ["fold", "call", "raise2-5", "raise5+", "allIn"];

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

/** プリフロップのレイズ額(bb)をバケットへ丸める。fold/call/allInは呼び出し側で先に判定する。
 * オープンレイズ(概ね2〜5bb)は raise2-5 に統合。5bb以上(主に3bet/4bet)は raise5+。 */
export function bucketPreflopRaiseBb(raiseBb: number): PreflopBucket {
  if (raiseBb < 5) return "raise2-5";
  return "raise5+";
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

// 注意: トーナメント情報(gameType/buyIn/entries)はここに含めない。
// 以前は各ハンドに `tournament.entries` をぶら下げて取得していたため、同一トーナメントの
// ハンド数だけ同じ entries 行が転送されていた(100ハンドのトナメなら100回重複)。
// 現在はトーナメント単位で1回だけ取得し(fetchTournamentInfos)、tournamentId でメモリjoinする。
const RAW_HAND_SELECT = {
  id: true,
  tournamentId: true,
  handNumber: true,
  buttonFixedPos: true,
  levelBigBlind: true,
  board: true,
  seats: {
    select: {
      id: true,
      seatIndex: true,
      userId: true,
      startingStack: true,
      holeCards: true,
      wasAway: true,
      excludedFromGeo: true,
      isSmallBlind: true,
      isBigBlind: true,
      user: { select: { isBot: true } },
    },
  },
  actions: {
    orderBy: { sequenceNumber: "asc" as const },
    select: { sequenceNumber: true, seatIndex: true, street: true, kind: true, toAmount: true, potBefore: true },
  },
};

/**
 * 集計テーブル(GeoDecision)経由で読むかどうか。
 *
 * バックフィルが済むまでは旧経路(全履歴リプレイ)のままにしておきたいので、環境変数で切り替える。
 * 有効化は GEO_USE_DECISION_TABLE=1。問題が出たら外すだけで即座に旧経路へ戻せる。
 */
function useDecisionTable(): boolean {
  return process.env["GEO_USE_DECISION_TABLE"] === "1";
}

/** BOTのみの卓は人間のサンプルを1つも生まないので、取得段階で落とす。 */
const HUMAN_SEATED = { seats: { some: { user: { isBot: false } } } } as const;

/**
 * 明示的に古い順で固定する。expectedPosition(下記参照)は「最初に一致したハンド」の値を
 * 採用するため、この順序が未指定(DB内部の物理格納順まかせ)だと本番でVACUUM等により
 * 結果が不安定になりうる。createdAt が同値のハンド同士でも順序が決まるよう、
 * カーソルページング(下記 forEachRawHand)の要件も兼ねて id を第2キーに置く。
 */
const RAW_HAND_ORDER = [{ createdAt: "asc" as const }, { id: "asc" as const }];

/**
 * 1回のクエリで読むハンド件数。
 *
 * 以前は該当ハンドを一度に全件メモリへ載せていた。本番のVMは 512MB しかないため、
 * 履歴が1万件規模になった時点で読み込み中にOOMでプロセスごと落ち、Fly側は502を返していた。
 * サーバーが再起動すると進行中の卓(インメモリ)も道連れになるため、GEOを開くだけで
 * 対戦中のプレイヤーが飛ぶという最悪の壊れ方をしていた。
 * ページ単位で読んで捨てれば、履歴が何件になってもメモリ使用量は一定に保てる。
 */
const HAND_PAGE_SIZE = 300;

function fetchHandPage(where: Prisma.HandWhereInput, cursorId: string | null) {
  return prisma.hand.findMany({
    where,
    orderBy: RAW_HAND_ORDER,
    select: RAW_HAND_SELECT,
    take: HAND_PAGE_SIZE,
    ...(cursorId === null ? {} : { cursor: { id: cursorId }, skip: 1 }),
  });
}

type RawHand = Awaited<ReturnType<typeof fetchHandPage>>[number];

/**
 * 条件に合うハンドを古い順に1件ずつ渡す。ページを読み終えるたびに前のページは捨てる。
 *
 * ページ境界の await が自然にイベントループを解放するので、走査中も他のリクエスト
 * (ヘルスチェックや対戦卓のSocket.IO)がさばける。1ページ分のリプレイは同期処理だが、
 * HAND_PAGE_SIZE 件ぶんなので占有時間は数十ms程度に収まる。
 */
async function forEachRawHand(where: Prisma.HandWhereInput, onHand: (hand: RawHand) => void): Promise<void> {
  let cursorId: string | null = null;
  for (;;) {
    const page = await fetchHandPage(where, cursorId);
    if (page.length === 0) return;
    for (const hand of page) onHand(hand);
    if (page.length < HAND_PAGE_SIZE) return;
    cursorId = page[page.length - 1]!.id;
  }
}

/** バブル段階の判定に必要なトーナメント単位の情報(ハンドごとではなくトーナメントごとに1件)。 */
interface TournamentInfo {
  gameType: string;
  buyIn: number;
  entries: { bustedAtHandNumber: number | null }[];
}

const TOURNAMENT_SELECT = {
  id: true,
  gameType: true,
  buyIn: true,
  // userId は集計に使わない(生存者数と延べエントリー数だけを見る)ので取得しない。
  entries: { select: { bustedAtHandNumber: true }, orderBy: { seatIndex: "asc" as const } },
};

function toTournamentMap(rows: { id: string; gameType: string; buyIn: number; entries: { bustedAtHandNumber: number | null }[] }[]) {
  return new Map<string, TournamentInfo>(
    rows.map((t) => [t.id, { gameType: t.gameType, buyIn: t.buyIn, entries: t.entries }]),
  );
}

/**
 * 指定の板面を含むハンドだけを取得する(ポストフロップ用)。
 *
 * `hasEvery` は「その配列の全要素を含む」であって順序も位置も保証しないため、これは
 * 候補を絞る粗いフィルタとして使い、街ごとの厳密一致(board.slice(0,n)の完全一致)は
 * 呼び出し側で確認する。それでも、指定フロップに無関係なハンドの大半をDB側で落とせる。
 */
function boardWhere(board: string[]): Prisma.HandWhereInput {
  return { ...HUMAN_SEATED, board: { hasEvery: board } };
}

/** 指定IDのトーナメント情報だけを取得する(板面で絞り込んだ少数のハンド用)。 */
async function fetchTournamentInfos(ids: string[]): Promise<Map<string, TournamentInfo>> {
  if (ids.length === 0) return new Map();
  const rows = await prisma.tournament.findMany({ where: { id: { in: ids } }, select: TOURNAMENT_SELECT });
  return toTournamentMap(rows);
}

/**
 * トーナメント情報だけはメモ化する。
 *
 * ハンド本体と違い、トーナメントは「1トナメ1行 + 参加者の bustedAtHandNumber だけ」なので
 * 全件持っても数百KB規模に収まる。一方でバブル段階の判定に全ハンドで参照されるため、
 * ここをページごとに引き直すとDB往復が跳ねる。メモリが問題になるのはハンド側だけ。
 */
const TOURNAMENTS_TTL_MS = 60_000;
let tournamentsCache: { at: number; data: Map<string, TournamentInfo> } | null = null;
/** 再構築中のPromise。同時アクセスで多重に走るのを防ぐ(single-flight)。 */
let tournamentsInFlight: Promise<Map<string, TournamentInfo>> | null = null;
// テスト(vitest)は1プロセス内でDBを繰り返しseed→集計するため、キャッシュがstaleになり結果が壊れる。
// テスト時はキャッシュを無効化し、常に最新を取得する(本番はTTLで有効)。
const TOURNAMENTS_CACHE_ENABLED = !process.env["VITEST"];

async function loadAllTournaments(): Promise<Map<string, TournamentInfo>> {
  return toTournamentMap(await prisma.tournament.findMany({ select: TOURNAMENT_SELECT }));
}

/** バブル段階の判定に使うトーナメント情報を返す(TTL付きメモ化)。 */
async function fetchAllTournaments(): Promise<Map<string, TournamentInfo>> {
  if (!TOURNAMENTS_CACHE_ENABLED) return loadAllTournaments();

  const cached = tournamentsCache;
  if (cached && Date.now() - cached.at < TOURNAMENTS_TTL_MS) return cached.data;

  if (!tournamentsInFlight) {
    tournamentsInFlight = loadAllTournaments()
      .then((data) => {
        tournamentsCache = { at: Date.now(), data };
        return data;
      })
      .finally(() => {
        tournamentsInFlight = null;
      });
  }
  // 古い値があるなら待たずに返す(裏で更新中)。無ければ完成を待つ。
  return cached ? cached.data : tournamentsInFlight;
}

/** キャッシュを明示的に破棄する(直近のプレイ/管理者の除外操作を即時反映したい場合)。 */
export function clearRawHandsCache(): void {
  tournamentsCache = null;
}

/** そのハンド時点で生存していた参加者数(バスト済みでない人数)を数える。 */
function aliveCountAtHand(entries: { bustedAtHandNumber: number | null }[], handNumber: number): number {
  return entries.filter((e) => e.bustedAtHandNumber === null || e.bustedAtHandNumber >= handNumber).length;
}

/**
 * ハンド単位でバブル段階を判定する(SNG/MTTとも「インマネまでの残り人数」基準)。
 * トーナメント情報が引けないハンド(データ不整合)は "normal" 扱いにして集計から落とさない。
 */
function computeBubbleStage(hand: RawHand, tournaments: Map<string, TournamentInfo>): BubbleStage {
  const info = tournaments.get(hand.tournamentId);
  if (!info) return "normal";
  const { gameType, buyIn, entries } = info;
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
  /** 元アクションのsequenceNumber(棋譜解析からGEOノードを引く際、対象決定を特定するのに使う)。 */
  sequenceNumber: number;
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
  const positionLabels = positionLabelsForHand(hand);
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

    const position = positionLabels.get(action.seatIndex) ?? "";
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
      sequenceNumber: action.sequenceNumber,
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
  /** 卓の参加人数(2〜6)で絞り込む。未指定なら全人数のハンドを対象にする。 */
  playerCount?: number | undefined;
}): Promise<{ node: TreeNode; matrix: HandClassMatrixResult }> {
  if (useDecisionTable()) {
    return nodeFromDecisionTable({
      street: "preflop",
      lineKey: lineKeyOf(params.line),
      boardKey: "",
      preflopKey: null,
      stackBucket: params.stackBucket,
      bubbleStage: params.bubbleStage,
      playerCount: params.playerCount,
      ratingRange: params.ratingRange,
    });
  }

  const [tournaments, ratingOk] = await Promise.all([fetchAllTournaments(), buildRatingFilter(params.ratingRange)]);
  const nextDecisions: ReplayedDecision[] = [];
  let expectedPosition: string | null = null;

  await forEachRawHand(HUMAN_SEATED, (hand) => {
    if (params.playerCount !== undefined && hand.seats.length !== params.playerCount) return;
    if (!bubbleStageMatches(computeBubbleStage(hand, tournaments), params.bubbleStage)) return;
    // 実プレイヤーのみを集計対象にする。BOT・離席中(wasAway)・管理者が除外(論理削除)した席・
    // 偏差値レンジ外のプレイヤーはGEO集計から除外する(BOT席はライン順の整合のためシーケンスには残す)。
    const countedSeats = new Map(
      hand.seats
        .filter((s) => !s.user.isBot && !s.wasAway && !s.excludedFromGeo && ratingOk(s.userId))
        .map((s) => [s.seatIndex, s.holeCards]),
    );
    if (countedSeats.size === 0) return;

    const decisions = replayPreflopDecisions(hand, countedSeats);
    if (!linesMatch(decisions, params.line)) return;
    const next = decisions[params.line.length];
    if (!next) return;
    // 一致した最初のハンドの値を採用する(全ての正常な6-maxハンドはここで一致するはずなので、
    // 後続のハンドで無条件に上書きすると、万一データに異常のあるハンドが1件混ざっただけで
    // 正しい大多数の結果が塗り替えられてしまう)。
    if (expectedPosition === null) expectedPosition = next.position;
    if (next.isCounted) nextDecisions.push(next);
  });

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
  const positionLabels = positionLabelsForHand(hand);
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

      const position = positionLabels.get(action.seatIndex) ?? "";
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
        sequenceNumber: action.sequenceNumber,
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
  /** 卓の参加人数(2〜6)で絞り込む。未指定なら全人数のハンドを対象にする。 */
  playerCount?: number | undefined;
}): Promise<{ node: TreeNode; matrix: HandClassMatrixResult }> {
  const boardLenForStreet: Record<string, number> = { flop: 3, turn: 4, river: 5 };
  const requiredBoardLen = boardLenForStreet[params.street]!;
  if (params.board.length !== requiredBoardLen) {
    throw new Error(`board must have exactly ${requiredBoardLen} cards for street ${params.street}`);
  }

  if (useDecisionTable()) {
    return nodeFromDecisionTable({
      street: params.street,
      lineKey: lineKeyOf(params.postflopLine),
      boardKey: params.board.join(","),
      preflopKey: lineKeyOf(params.preflopLine),
      stackBucket: params.stackBucket,
      bubbleStage: params.bubbleStage,
      playerCount: params.playerCount,
      ratingRange: params.ratingRange,
    });
  }

  // 板面の絞り込みはDB側で行う。指定フロップに一致するハンドは全履歴のごく一部(多くはゼロ件)
  // なのに、以前は全ハンドを読み出してからJSで捨てていた。ここが効くとポストフロップは
  // 履歴の総量にほとんど依存しなくなる。
  const [tournaments, ratingOk] = await Promise.all([fetchAllTournaments(), buildRatingFilter(params.ratingRange)]);
  const nextDecisions: ReplayedPostflopDecision[] = [];
  let expectedPosition: string | null = null;

  await forEachRawHand(boardWhere(params.board), (hand) => {
    if (params.playerCount !== undefined && hand.seats.length !== params.playerCount) return;
    if (!bubbleStageMatches(computeBubbleStage(hand, tournaments), params.bubbleStage)) return;
    if (hand.board.length < requiredBoardLen) return;
    // hasEvery は順序を保証しないため、街ごとの厳密一致はここで確認する。
    if (hand.board.slice(0, requiredBoardLen).join(",") !== params.board.join(",")) return;

    // 実プレイヤーのみを集計対象にする。BOT・離席中(wasAway)・管理者が除外(論理削除)した席・
    // 偏差値レンジ外のプレイヤーはGEO集計から除外する(BOT席はライン順の整合のためシーケンスには残す)。
    const countedSeats = new Map(
      hand.seats
        .filter((s) => !s.user.isBot && !s.wasAway && !s.excludedFromGeo && ratingOk(s.userId))
        .map((s) => [s.seatIndex, s.holeCards]),
    );
    if (countedSeats.size === 0) return;

    const preflopDecisions = replayPreflopDecisions(hand, countedSeats);
    if (!linesMatch(preflopDecisions, params.preflopLine)) return;

    // フォールド済み座席は「実際のハンドで起きた全プリフロップフォールド」を対象にする
    // (要求ラインの範囲内だけではない。ライン一致判定と実際のゲーム進行は別物)。
    const foldedSeats = new Set(preflopDecisions.filter((d) => d.bucket === "fold").map((d) => d.seatIndex));
    const allPostflop = replayPostflopDecisions(hand, countedSeats, foldedSeats);
    const streetDecisions = allPostflop.filter((d) => d.street === params.street);
    if (!linesMatch(streetDecisions, params.postflopLine)) return;

    const next = streetDecisions[params.postflopLine.length];
    if (!next) return;
    // getPreflopNodeと同じ理由で、最初に一致したハンドの値のみ採用する。
    if (expectedPosition === null) expectedPosition = next.position;
    if (next.isCounted) nextDecisions.push(next);
  });

  return buildNodeFromDecisions(nextDecisions, params.stackBucket, expectedPosition);
}

// ============================================================================
// 棋譜解析(局後検討)からGEO母集団ノードを引く
// ============================================================================

/** 棋譜解析の1決定に対応するGEO母集団ノード(母集団のアクション頻度+169レンジ表)。 */
export interface GeoReviewNode {
  position: string | null;
  sampleSize: number;
  options: ActionOption[];
  matrix: HandClassMatrixResult;
}

/**
 * 棋譜解析の1つの意思決定(handId + そのアクションのsequenceNumber + street)に対応する、
 * GEO母集団の同一スポットのノードを返す。
 *
 * ライン復元は「対象ハンド自身を geoTree と同じ関数(replay*Decisions + positionLabelsForHand)で
 * リプレイし、対象決定の直前までを line として切り出す」ことで行う。これにより、集計側
 * (getPreflopNode/getPostflopNode)の母集団ハンドと同一のブラインド基準ポジション命名・
 * バケット分類が保証され、ライン一致がぶれない。
 *
 * ICM段階は "normal"(=全段階を集計)で引き、人数は対象ハンドと同数に絞る(スポットの
 * ストラテジー的同一性を保つ)。母集団に対象ハンド自身が1件含まれるが、数千規模の集計では無視できる。
 */
export async function getGeoNodeForReviewSpot(params: {
  handId: string;
  sequenceNumber: number;
  street: string;
  /** 集計する卓の人数。未指定なら対象ハンドの席数に一致させる。 */
  playerCount?: number;
}): Promise<GeoReviewNode | null> {
  const hand = await prisma.hand.findUnique({ where: { id: params.handId }, select: RAW_HAND_SELECT });
  if (!hand) return null;

  // holeCardsはライン一致に不要。全席を counted に入れて、全アクションの position/bucket 系列を得る。
  const allSeats = new Map(hand.seats.map((s) => [s.seatIndex, s.holeCards]));
  const preflop = replayPreflopDecisions(hand, allSeats);
  const playerCount = params.playerCount ?? hand.seats.length;

  if (params.street === "preflop") {
    const idx = preflop.findIndex((d) => d.sequenceNumber === params.sequenceNumber);
    if (idx < 0) return null;
    const target = preflop[idx]!;
    const line: LineStep[] = preflop.slice(0, idx).map((d) => ({ position: d.position, bucket: d.bucket }));
    const { node, matrix } = await getPreflopNode({
      stackBucket: stackBucketOf(target.stackBb),
      bubbleStage: "normal",
      line,
      playerCount,
    });
    return { position: node.position, sampleSize: node.sampleSize, options: node.options, matrix };
  }

  const boardLenForStreet: Record<string, number> = { flop: 3, turn: 4, river: 5 };
  const requiredLen = boardLenForStreet[params.street];
  if (!requiredLen || hand.board.length < requiredLen) return null;

  const preflopLine: LineStep[] = preflop.map((d) => ({ position: d.position, bucket: d.bucket }));
  const foldedSeats = new Set(preflop.filter((d) => d.bucket === "fold").map((d) => d.seatIndex));
  const postflop = replayPostflopDecisions(hand, allSeats, foldedSeats);
  const streetDecisions = postflop.filter((d) => d.street === params.street);
  const idx = streetDecisions.findIndex((d) => d.sequenceNumber === params.sequenceNumber);
  if (idx < 0) return null;
  const target = streetDecisions[idx]!;
  const postflopLine: LineStep[] = streetDecisions.slice(0, idx).map((d) => ({ position: d.position, bucket: d.bucket }));

  const { node, matrix } = await getPostflopNode({
    stackBucket: stackBucketOf(target.stackBb),
    bubbleStage: "normal",
    preflopLine,
    board: hand.board.slice(0, requiredLen),
    street: params.street as "flop" | "turn" | "river",
    postflopLine,
    playerCount,
  });
  return { position: node.position, sampleSize: node.sampleSize, options: node.options, matrix };
}

// ---------------------------------------------------------------------------
// GeoDecision(集計テーブル)の行生成
//
// GEOのノードを開くたびに全履歴をリプレイするのをやめ、ハンド記録時に「1意思決定 = 1行」へ
// 展開しておく。ここで作る行の意味論は、既存のリプレイ経路(getPreflopNode/getPostflopNode)と
// 完全に一致していなければならない。両者の一致は packages/db/test/geoDecision.test.ts で検証する。
// ---------------------------------------------------------------------------

/** 街ごとに、板面として意味を持つカード枚数。 */
const BOARD_LEN_FOR_STREET: Record<string, number> = { flop: 3, turn: 4, river: 5 };

/** ライン系列を1本のキー文字列にする。要求ラインと突き合わせるための正規形。 */
export function lineKeyOf(line: { position: string; bucket: string }[]): string {
  return line.map((s) => `${s.position}:${s.bucket}`).join("|");
}

/** GeoDecision に書き込む1行(idはDB側で採番するため持たない)。 */
export interface GeoDecisionRow {
  handId: string;
  handSeatId: string;
  userId: string;
  street: string;
  lineKey: string;
  boardKey: string;
  preflopKey: string;
  position: string;
  bucket: string;
  stackBucket: string;
  bubbleStage: string;
  playerCount: number;
  isGeometric: boolean;
  handClassRow: number | null;
  handClassCol: number | null;
  sequenceNumber: number;
}

/**
 * ハンド1件を GeoDecision の行へ展開する。
 *
 * 行を書くのは「実プレイヤーの意思決定」だけ(自動プレイヤー・離席中の席は書かない)。これらは
 * ハンド確定時に決まる不変の事実なので焼き込んで問題ない。一方 excludedFromGeo は管理者が後から
 * 切り替えられるため焼き込まず、読み出し時に HandSeat をJOINして除外する。
 *
 * ライン系列(lineKey)は、集計対象外の席の行動も含めた**全シーケンス**から作る。対象席だけを
 * 間引くとポジション順がずれるため(replayPreflopDecisions のコメント参照)。
 */
export function buildGeoDecisionRows(hand: RawHand, tournaments: Map<string, TournamentInfo>): GeoDecisionRow[] {
  const seatById = new Map(hand.seats.map((s) => [s.seatIndex, s]));
  // ライン再生には全席を渡す(ホールカードも全席ぶん引けるようにする)。
  const allSeats = new Map(hand.seats.map((s) => [s.seatIndex, s.holeCards]));
  const bubbleStage = computeBubbleStage(hand, tournaments);
  const playerCount = hand.seats.length;
  const rows: GeoDecisionRow[] = [];

  /** その席の意思決定を行として書き出す対象か(自動プレイヤー・離席中は書かない)。 */
  const writable = (seatIndex: number): boolean => {
    const seat = seatById.get(seatIndex);
    return Boolean(seat && !seat.user.isBot && !seat.wasAway);
  };

  const push = (
    d: ReplayedDecision,
    street: string,
    lineKey: string,
    boardKey: string,
    preflopKey: string,
  ): void => {
    const seat = seatById.get(d.seatIndex);
    if (!seat) return;
    const coords = classify(d.holeCards);
    rows.push({
      handId: hand.id,
      handSeatId: seat.id,
      userId: seat.userId,
      street,
      lineKey,
      boardKey,
      preflopKey,
      position: d.position,
      bucket: d.bucket,
      stackBucket: stackBucketOf(d.stackBb),
      bubbleStage,
      playerCount,
      isGeometric: d.isGeometric,
      handClassRow: coords?.row ?? null,
      handClassCol: coords?.col ?? null,
      sequenceNumber: d.sequenceNumber,
    });
  };

  const preflop = replayPreflopDecisions(hand, allSeats);
  preflop.forEach((d, i) => {
    if (!writable(d.seatIndex)) return;
    push(d, "preflop", lineKeyOf(preflop.slice(0, i)), "", "");
  });

  // ポストフロップ。プリフロップ全系列を preflopKey として持たせ、要求プリフロップラインの
  // 前方一致判定を読み出し側で行えるようにする。
  const preflopKey = lineKeyOf(preflop);
  const foldedSeats = new Set(preflop.filter((d) => d.bucket === "fold").map((d) => d.seatIndex));
  const postflop = replayPostflopDecisions(hand, allSeats, foldedSeats);

  for (const street of ["flop", "turn", "river"]) {
    const requiredLen = BOARD_LEN_FOR_STREET[street]!;
    if (hand.board.length < requiredLen) continue;
    const boardKey = hand.board.slice(0, requiredLen).join(",");
    const streetDecisions = postflop.filter((d) => d.street === street);
    streetDecisions.forEach((d, i) => {
      if (!writable(d.seatIndex)) return;
      push(d, street, lineKeyOf(streetDecisions.slice(0, i)), boardKey, preflopKey);
    });
  }

  return rows;
}

/** 指定ハンドのGeoDecisionを作り直す(冪等)。ハンド記録直後とバックフィルの両方から使う。 */
export async function rebuildGeoDecisionsForHand(handId: string): Promise<number> {
  const hand = await prisma.hand.findUnique({ where: { id: handId }, select: RAW_HAND_SELECT });
  if (!hand) return 0;
  const tournaments = await fetchTournamentInfos([hand.tournamentId]);
  const rows = buildGeoDecisionRows(hand, tournaments);
  await prisma.$transaction([
    prisma.geoDecision.deleteMany({ where: { handId } }),
    ...(rows.length > 0 ? [prisma.geoDecision.createMany({ data: rows })] : []),
  ]);
  return rows.length;
}

// ---------------------------------------------------------------------------
// GeoDecision(集計テーブル)からの読み出し
//
// 全履歴のリプレイではなく、インデックス1本 + GROUP BY で答える。返す値の意味は
// buildNodeFromDecisions と完全に一致させる(options / matrix / position)。
// ---------------------------------------------------------------------------

/** 集計クエリの共通WHERE。ratingUserIds は null なら偏差値フィルタ無し。 */
function decisionWhere(params: {
  street: string;
  lineKey: string;
  boardKey: string;
  preflopKey: string | null;
  bubbleStage: BubbleStage;
  playerCount: number | undefined;
  ratingUserIds: string[] | null;
  stackBucket: StackBucket | null;
}): Prisma.Sql {
  const parts: Prisma.Sql[] = [
    Prisma.sql`d."street" = ${params.street}`,
    Prisma.sql`d."lineKey" = ${params.lineKey}`,
    Prisma.sql`d."boardKey" = ${params.boardKey}`,
    // 管理者がGEOから除外した席は集計しない(後から切り替わるためJOINで見る)。
    Prisma.sql`s."excludedFromGeo" = false`,
  ];
  if (params.stackBucket !== null) parts.push(Prisma.sql`d."stackBucket" = ${params.stackBucket}`);
  // 要求が "normal" のときは全バブル段階が対象(bubbleStageMatches と同じ意味)。
  if (params.bubbleStage !== "normal") parts.push(Prisma.sql`d."bubbleStage" = ${params.bubbleStage}`);
  if (params.playerCount !== undefined) parts.push(Prisma.sql`d."playerCount" = ${params.playerCount}`);
  // プリフロップラインは前方一致(linesMatch は「要求が実際の先頭に一致」で判定するため)。
  if (params.preflopKey !== null) {
    parts.push(
      params.preflopKey === ""
        ? Prisma.sql`TRUE`
        : Prisma.sql`(d."preflopKey" = ${params.preflopKey} OR d."preflopKey" LIKE ${params.preflopKey + "|%"})`,
    );
  }
  if (params.ratingUserIds !== null) parts.push(Prisma.sql`d."userId" = ANY(${params.ratingUserIds}::text[])`);
  return Prisma.join(parts, " AND ");
}

/** 偏差値レンジに入るユーザーIDの一覧。範囲未指定なら null(フィルタ無し)。 */
async function ratingUserIdsFor(range?: RatingRange): Promise<string[] | null> {
  if (!range) return null;
  const ratings = await computeRRRatings();
  return ratings.filter((r) => r.rrRating >= range.min && r.rrRating <= range.max).map((r) => r.userId);
}

interface DecisionGroupRow {
  bucket: string;
  position: string;
  handClassRow: number | null;
  handClassCol: number | null;
  isGeometric: boolean;
  n: number;
}

/** GeoDecision を集計してノード(options + 13x13マトリクス)を組み立てる。 */
async function nodeFromDecisionTable(params: {
  street: string;
  lineKey: string;
  boardKey: string;
  preflopKey: string | null;
  stackBucket: StackBucket;
  bubbleStage: BubbleStage;
  playerCount?: number | undefined;
  ratingRange?: RatingRange | undefined;
}): Promise<{ node: TreeNode; matrix: HandClassMatrixResult }> {
  const ratingUserIds = await ratingUserIdsFor(params.ratingRange);
  const base = { ...params, ratingUserIds, playerCount: params.playerCount };

  const groups = await prisma.$queryRaw<DecisionGroupRow[]>(Prisma.sql`
    SELECT d."bucket", d."position", d."handClassRow", d."handClassCol", d."isGeometric", COUNT(*)::int AS n
    FROM "GeoDecision" d
    JOIN "HandSeat" s ON s."id" = d."handSeatId"
    WHERE ${decisionWhere({ ...base, stackBucket: params.stackBucket })}
    GROUP BY 1, 2, 3, 4, 5
  `);

  const tally = new Map<string, { count: number; geometricCount: number }>();
  const cells = emptyMatrix();
  let totalSamples = 0;
  let position: string | null = null;

  for (const g of groups) {
    const entry = tally.get(g.bucket) ?? { count: 0, geometricCount: 0 };
    entry.count += g.n;
    if (g.isGeometric) entry.geometricCount += g.n;
    tally.set(g.bucket, entry);
    totalSamples += g.n;
    position ??= g.position;
    if (g.handClassRow !== null && g.handClassCol !== null) {
      const cell = cells[g.handClassRow]![g.handClassCol]!;
      cell.count += g.n;
      cell.byBucket[g.bucket] = (cell.byBucket[g.bucket] ?? 0) + g.n;
    }
  }

  const options: ActionOption[] = [...tally.entries()].map(([bucket, { count, geometricCount }]) => ({
    bucket,
    count,
    frequency: totalSamples > 0 ? count / totalSamples : 0,
    geometricRatio: count > 0 ? geometricCount / count : 0,
  }));

  // 該当スタック帯にサンプルが1件も無い場合でも、そのノードのポジション名は出す
  // (旧経路の expectedPosition と同じ。スタック帯を外して1件だけ引く)。
  if (position === null) {
    const fallback = await prisma.$queryRaw<{ position: string }[]>(Prisma.sql`
      SELECT d."position"
      FROM "GeoDecision" d
      JOIN "HandSeat" s ON s."id" = d."handSeatId"
      WHERE ${decisionWhere({ ...base, stackBucket: null })}
      LIMIT 1
    `);
    position = fallback[0]?.position ?? null;
  }

  return { node: { position, sampleSize: totalSamples, options }, matrix: { cells, totalSamples } };
}

/** バックフィルの進捗。管理画面から状況を見られるようにするため、呼び出し側へ逐次通知する。 */
export interface GeoBackfillProgress {
  /** 対象ハンド総数。 */
  total: number;
  /** ここまでに処理したハンド数。 */
  processed: number;
  /** ここまでに書き込んだ意思決定の行数。 */
  rows: number;
}

/** 1回のDB往復で取り出すハンド数。 */
const GEO_BACKFILL_BATCH_SIZE = 200;

/** GEO集計の対象となるハンドの条件(GEO集計側と同じく「人間が最低1人着席」)。 */
function backfillWhere(onlyMissing: boolean) {
  return {
    ...HUMAN_SEATED,
    // まだ1行も無いハンドだけに絞ると、中断したバックフィルの再開が速い。
    ...(onlyMissing ? { decisions: { none: {} } } : {}),
  };
}

/** バックフィルの対象ハンド数と、既に展開済みのハンド数を返す(進捗表示用)。 */
export async function getGeoBackfillStatus(): Promise<{ totalHands: number; missingHands: number }> {
  const [totalHands, missingHands] = await Promise.all([
    prisma.hand.count({ where: backfillWhere(false) }),
    prisma.hand.count({ where: backfillWhere(true) }),
  ]);
  return { totalHands, missingHands };
}

/**
 * 既存ハンドを GeoDecision へ展開し直す。
 *
 * 冪等: ハンド単位で delete → insert するため、何度実行しても結果は同じ。途中で止まっても
 * もう一度流せば続きから埋まる。CLIスクリプトと管理APIの両方からこの関数を使う
 * (処理を二重に持たない)。
 */
export async function backfillGeoDecisions(options?: {
  onlyMissing?: boolean;
  onProgress?: (progress: GeoBackfillProgress) => void;
}): Promise<GeoBackfillProgress> {
  const onlyMissing = options?.onlyMissing ?? false;
  const where = backfillWhere(onlyMissing);
  const total = await prisma.hand.count({ where });

  let processed = 0;
  let rows = 0;
  let cursor: string | undefined;

  for (;;) {
    const batch = await prisma.hand.findMany({
      where,
      orderBy: { id: "asc" },
      take: GEO_BACKFILL_BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true },
    });
    if (batch.length === 0) break;

    for (const h of batch) {
      rows += await rebuildGeoDecisionsForHand(h.id);
      processed += 1;
    }
    cursor = batch[batch.length - 1]!.id;
    options?.onProgress?.({ total, processed, rows });
  }

  return { total, processed, rows };
}

// ---------------------------------------------------------------------------
// ポジション別の偏りを測る診断
//
// 「GEOのプリフロップがUTGばかりで、BTN/SB/BBのデータが集まらない」という症状は、
// 原因が3つに分かれる。数字を見ずに直すと的を外すので、切り分けられる形で測る。
//
//  (a) 母集団の偏り   — 人間が座るポジションそのものが偏っている(席割当・ボタン回転の問題)
//  (b) 木構造による分散 — 母集団は均等でも、ラインを1段掘るごとにサンプルが枝分かれして減る。
//                        後ろのポジションほど深い階層にあるので「集まっていない」ように見える
//  (c) 卓人数による分断 — 6人卓のUTG/HJ/COと5人卓のUTG/COは別ラインになる。人数で絞らずに
//                        見ると、同じ「BTN」でも到達に必要なラインが人数ごとに違う
//
// (a)なら実装を直す。(b)(c)は仕様なので、見せ方(人数の明示・到達しやすいライン)で解く。
// ---------------------------------------------------------------------------

/** ポジション×卓人数ごとの、プリフロップ意思決定の集まり具合。 */
export interface GeoPositionStatRow {
  position: string;
  playerCount: number;
  /** GeoDecision の行数(1ハンドで同じ人が複数回行動すれば複数行)。 */
  decisions: number;
  /** そのポジションで人間が行動したハンド数(重複なし)。母集団の偏りはこちらで見る。 */
  hands: number;
}

/** 集計母数の内訳。ポジション偏りの原因が「そもそも集計対象外」かを切り分ける。 */
export interface GeoPositionStats {
  /** プリフロップのポジション×人数の内訳(hands の多い順)。 */
  preflop: GeoPositionStatRow[];
  /** ストリート別の行数(プリフロップ以外も含めた全体像)。 */
  byStreet: { street: string; rows: number }[];
  /** 席の内訳。人間席のうち、離席・管理者除外で集計から落ちた数。 */
  seats: { total: number; bot: number; human: number; humanAway: number; humanExcluded: number };
  /** GeoDecision が1行も無いハンド数。バックフィル漏れと「0行が正常」の区別に使う。 */
  handsWithoutDecisions: number;
  totalHands: number;
}

/**
 * ポジション別の集まり具合を返す。
 *
 * `hands`(重複なしのハンド数)が人数ごとにおおむね揃っていれば母集団は健全で、
 * 「UTGばかり」に見えるのは木構造(b)と人数分断(c)が理由だと判断できる。
 * 逆にここが偏っていれば、席割当かボタン回転の実装を疑う。
 */
export async function getGeoPositionStats(): Promise<GeoPositionStats> {
  const preflopRows = await prisma.$queryRaw<
    { position: string; playerCount: number; decisions: bigint; hands: bigint }[]
  >`
    SELECT d."position"                        AS "position",
           d."playerCount"                     AS "playerCount",
           COUNT(*)                            AS "decisions",
           COUNT(DISTINCT d."handId")          AS "hands"
      FROM "GeoDecision" d
      JOIN "HandSeat" s ON s."id" = d."handSeatId"
     WHERE d."street" = 'preflop'
       AND s."excludedFromGeo" = false
     GROUP BY 1, 2
     ORDER BY 4 DESC
  `;

  const streetRows = await prisma.$queryRaw<{ street: string; rows: bigint }[]>`
    SELECT d."street" AS "street", COUNT(*) AS "rows"
      FROM "GeoDecision" d
     GROUP BY 1
     ORDER BY 2 DESC
  `;

  const [total, bot, humanAway, humanExcluded, totalHands, handsWithDecisions] = await Promise.all([
    prisma.handSeat.count(),
    prisma.handSeat.count({ where: { user: { isBot: true } } }),
    prisma.handSeat.count({ where: { user: { isBot: false }, wasAway: true } }),
    prisma.handSeat.count({ where: { user: { isBot: false }, excludedFromGeo: true } }),
    prisma.hand.count({ where: HUMAN_SEATED }),
    prisma.hand.count({ where: { ...HUMAN_SEATED, decisions: { some: {} } } }),
  ]);

  return {
    preflop: preflopRows.map((r) => ({
      position: r.position,
      playerCount: r.playerCount,
      decisions: Number(r.decisions),
      hands: Number(r.hands),
    })),
    byStreet: streetRows.map((r) => ({ street: r.street, rows: Number(r.rows) })),
    seats: { total, bot, human: total - bot, humanAway, humanExcluded },
    handsWithoutDecisions: totalHands - handsWithDecisions,
    totalHands,
  };
}
