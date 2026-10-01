/**
 * プローブ・ドンク・チェックレイズの場面を、オーナーの Notion の内容で評価する。
 *
 * オーナー確定: **Notion に記載のある場面は、打った手だけでなく、チェック/コール/フォールドも必ず評価して
 * バリィが解説する(対象外を作らない)。** ダブル/トリプルバレルは `barrelPlan.ts`。
 *
 * どの場面かの判定(`readDecisionSpots` / `readBetRoles`)は `betRole.ts`。ここは「その場面で、その手で、
 * その行動はノートに照らしてどうか」を決め、解説の材料(場合分け)を返す。
 *
 * 全席を同じロジックで判定する(種別による分岐は持たない)。
 */

import { parseBoardCard, readBoardTexture } from "./boardTexture.js";
import { readBarrelCard, type BarrelCard } from "./barrelPlan.js";
import type { BetSizeClass, BetStreet } from "./betRole.js";
import { readHandStrength, type HandStrength } from "./handStrength.js";
import type { PotType } from "./potShape.js";
import type { NotionGrade } from "./strategyVerdict.js";

const SIZE_ORDER: readonly BetSizeClass[] = ["block", "small", "medium", "large", "overbet"];

function sizeGap(actual: BetSizeClass, target: BetSizeClass): number {
  return SIZE_ORDER.indexOf(actual) - SIZE_ORDER.indexOf(target);
}

/** サイズのずれ(段数の絶対値) → 評価。ぴったり=最善 / 1段=好手 / 2段以上=緩手。 */
function gradeByGap(gap: number): NotionGrade {
  const g = Math.abs(gap);
  if (g === 0) return "best";
  if (g === 1) return "good";
  return "inaccuracy";
}

const BOARD_CARDS: Record<BetStreet, number> = { flop: 3, turn: 4, river: 5 };

/** ボードでストレートが完成しうるか(3枚が5つの連続した枠に収まる)。エースは 14 と 1 の両方。 */
export function straightPossible(board: readonly string[]): boolean {
  const tex = readBoardTexture(board);
  if (!tex) return false;
  const ranks = new Set(tex.ranks);
  if (ranks.has(14)) ranks.add(1);
  for (let low = 1; low <= 10; low++) {
    let n = 0;
    for (let k = 0; k < 5; k++) if (ranks.has(low + k)) n++;
    if (n >= 3) return true;
  }
  return false;
}

// ───────────────────────────── 手の読み取り(共通) ─────────────────────────────

/** 解説で「きみの手は○○」と言うための、手の名前。 */
export type SpotHandKey =
  | "straightFlush"
  | "quads"
  | "fullHouse"
  | "nutFlush"
  | "flush"
  | "upperStraight"
  | "lowerStraight"
  | "straight"
  | "set"
  | "trips"
  | "strongTrips"
  | "twoPair"
  | "overPair"
  | "topPairTopKicker"
  | "topPair"
  | "middlePair"
  | "bottomPair"
  | "underPair"
  | "comboDraw"
  | "nutFlushDraw"
  | "flushDraw"
  | "openEnded"
  | "gutshot"
  | "doubleBackdoor"
  | "nutDoubleBackdoor"
  | "bottomPairDoubleBackdoor"
  | "missedStraightDraw"
  | "missedFlushDraw"
  | "aceHigh"
  | "air";

interface Facts {
  street: BetStreet;
  hand: HandStrength;
  ranks: number[];
  suits: string[];
  pocketPair: boolean;
  boardHigh: number;
  /** 今のストリートのドロー(リバーは無し)。 */
  fd: boolean;
  nutFd: boolean;
  oesd: boolean;
  gut: boolean;
  /** バックドア(フロップのみ)。 */
  bdfd: boolean;
  nutBdfd: boolean;
  bdsd: boolean;
  /** リバーで、ターンに持っていて外れたドロー(ペアなしのとき)。 */
  missedSd: boolean;
  missedFd: boolean;
}

/** バックドアのストレートドロー: 5つの連続した枠に3枚(手札を1枚以上含む)。完成・4枚のドローは除く。 */
function backdoorStraight(hole: number[], board: number[]): boolean {
  const all = new Set([...hole, ...board]);
  const holeSet = new Set(hole);
  if (all.has(14)) all.add(1);
  if (holeSet.has(14)) holeSet.add(1);
  for (let low = 1; low <= 10; low++) {
    const w = [0, 1, 2, 3, 4].map((k) => low + k);
    const have = w.filter((r) => all.has(r));
    if (have.length === 3 && have.some((r) => holeSet.has(r))) return true;
  }
  return false;
}

function readFacts(street: BetStreet, hole: readonly (string | null)[], board: readonly string[]): Facts | null {
  const cur = board.slice(0, BOARD_CARDS[street]);
  const hand = readHandStrength(hole, cur);
  const parsed = hole
    .map((h) => (typeof h === "string" ? parseBoardCard(h) : null))
    .filter((x): x is { rank: number; suit: string } => x !== null);
  const tex = readBoardTexture(cur);
  if (!hand || parsed.length < 2 || !tex) return null;
  const onRiver = street === "river";
  const prevHand = onRiver ? readHandStrength(hole, board.slice(0, 4)) : null;
  const noPair = hand.made === "highCard";
  const d = hand.draws;
  const bdfd = street === "flop" && d.backdoorFlushDraw;
  const bdSuit = bdfd
    ? ["s", "h", "d", "c"].find(
        (su) => cur.filter((b) => parseBoardCard(b)?.suit === su).length + parsed.filter((p) => p.suit === su).length === 3
      )
    : undefined;
  const ranks = parsed.map((x) => x.rank);
  return {
    street,
    hand,
    ranks,
    suits: parsed.map((x) => x.suit),
    pocketPair: ranks[0] === ranks[1],
    boardHigh: tex.highRank,
    fd: !onRiver && (d.flushDraw || d.nutFlushDraw),
    nutFd: !onRiver && d.nutFlushDraw,
    oesd: !onRiver && d.openEnded,
    gut: !onRiver && d.gutshot,
    bdfd,
    nutBdfd: bdfd && parsed.some((p) => p.suit === bdSuit && p.rank === 14),
    bdsd:
      street === "flop" &&
      !d.openEnded &&
      !d.gutshot &&
      hand.made !== "straight" &&
      backdoorStraight(ranks, tex.ranks),
    missedSd: onRiver && noPair && !!prevHand && (prevHand.draws.openEnded || prevHand.draws.gutshot),
    missedFd: onRiver && noPair && !!prevHand && (prevHand.draws.flushDraw || prevHand.draws.nutFlushDraw),
  };
}

const STRONG: readonly string[] = ["straightFlush", "quads", "fullHouse", "flush", "straight", "trips", "twoPair"];

/** 手の名前を1つ選ぶ(強い順)。 */
function labelHand(f: Facts): SpotHandKey {
  const m = f.hand.made;
  if (m === "straightFlush") return "straightFlush";
  if (m === "quads") return "quads";
  if (m === "fullHouse") return "fullHouse";
  if (m === "flush") return "flush";
  if (m === "straight") return "straight";
  if (m === "trips") return f.pocketPair ? "set" : "trips";
  if (m === "twoPair") return "twoPair";
  if (m === "overPair") return "overPair";
  if (m === "topPair") return f.hand.kicker === "top" ? "topPairTopKicker" : "topPair";
  if (m === "middlePair") return "middlePair";
  if (m === "bottomPair") return "bottomPair";
  if (m === "pocketPairBelow") return "underPair";
  if (f.fd && (f.oesd || f.gut)) return "comboDraw";
  if (f.nutFd) return "nutFlushDraw";
  if (f.fd) return "flushDraw";
  if (f.oesd) return "openEnded";
  if (f.gut) return "gutshot";
  if (f.missedFd) return "missedFlushDraw";
  if (f.missedSd) return "missedStraightDraw";
  if (f.ranks.includes(14)) return "aceHigh";
  return "air";
}

// ═════════════════════════════ プローブ ═════════════════════════════

/** 落ちたカードの種類(Notion【プローブベット】の見出し)。上から優先。 */
export type ProbeCard = "repeat" | "flush" | "straight" | "ace" | "overcard" | "rag";
/** @deprecated 互換のための別名。 */
export type ProbeTurn = ProbeCard;

/** ターン(またはリバー)に落ちたカードを、ひとつ前のボードと比べて読む。 */
export function readProbeCard(street: "turn" | "river", board: readonly string[]): ProbeCard | null {
  const n = street === "turn" ? 4 : 5;
  if (board.length < n) return null;
  const prevBoard = board.slice(0, n - 1);
  const curBoard = board.slice(0, n);
  const prev = readBoardTexture(prevBoard);
  const cur = readBoardTexture(curBoard);
  const card = parseBoardCard(board[n - 1]!);
  if (!prev || !cur || !card) return null;
  if (prev.ranks.includes(card.rank)) return "repeat";
  if (cur.maxSuitCount >= 3 && prev.maxSuitCount < 3) return "flush";
  if (straightPossible(curBoard) && !straightPossible(prevBoard)) return "straight";
  if (card.rank > prev.highRank) return card.rank === 14 ? "ace" : "overcard";
  return "rag";
}

export function readProbeTurn(board: readonly string[]): ProbeCard | null {
  return readProbeCard("turn", board);
}

/**
 * フロップがプローブする側(OOPのコーラー)に有利だったか。
 * ノートは「有利ボード / 不利ボード」で頻度を分けているが、定義は書かれていない。
 * コーラー(BBなど)のレンジが強くなりやすい、9ハイ以下かコネクトしたフロップを有利とみなす。
 */
export function probeFlopFavorable(board: readonly string[]): boolean {
  const flop = readBoardTexture(board.slice(0, 3));
  if (!flop) return false;
  return flop.bands[0] !== "H" || flop.draws === "drawHeavy";
}

/**
 * 2e(2ストリートのジオメトリックサイズ)のポット比。ターンとリバーの2回、同じ比率で打つと
 * ちょうどオールインになるサイズ。SPR を s として (1+2f)^2 = 1+2s → f = (√(1+2s) − 1) / 2。
 */
export function geometricFraction(spr: number, streets: number): number {
  return (Math.pow(1 + 2 * spr, 1 / streets) - 1) / 2;
}

export type ProbeSize = "33" | "50" | "2e";

/** ノートの頻度(%)。不利ボードのA以外のオーバーカードはノートに記載が無い(null)。 */
export const PROBE_FREQUENCY: Record<"favorable" | "unfavorable", Record<ProbeCard, number | null>> = {
  favorable: { straight: 50, rag: 50, overcard: 30, ace: 10, flush: 50, repeat: 0 },
  unfavorable: { straight: 20, rag: 20, overcard: null, ace: 20, flush: 20, repeat: 0 },
};

export type ProbeHandKey =
  | "tpNotTk"
  | "twoPair"
  | "twoPairPlus"
  | "gutshot"
  | "oesd"
  | "midBottomHit"
  | "bottomHit"
  | "underPair"
  | "set"
  | "flushCardBet";

export type ProbeSituation =
  | "betOk"
  | "betOtherSize"
  | "betSizeOff"
  | "betNotListed"
  | "betRepeat"
  | "checkRepeatOk"
  | "checkNotListedOk"
  | "checkListedLowFreqOk"
  | "checkListedMissed";

export interface ProbeVerdict {
  kind: "probe";
  street: "turn" | "river";
  card: ProbeCard;
  favorable: boolean;
  /** ノートの頻度(%)。記載が無ければ null。 */
  frequency: number | null;
  action: "bet" | "check";
  /** その手が入る組(打つ手)。打たない手なら null。 */
  handKey: ProbeHandKey | null;
  /** 手の名前(打たない手の説明用)。 */
  handLabel: SpotHandKey;
  /** その手の推奨サイズ。 */
  sizes: ProbeSize[];
  situation: ProbeSituation;
  grade: NotionGrade;
}

/**
 * プローブの場面(ターン・リバー)の評価。ノートの「今日から使える簡易戦略」をそのまま表にした。
 * リバーはターンと同じ表で、落ちたカードをターンのボードと比べて読む(ドローは外れたドローとして読む)。
 *
 * @param bet 打ったならサイズの判定材料、チェックなら null
 */
export function judgeProbe(
  street: "turn" | "river",
  hole: readonly (string | null)[],
  board: readonly string[],
  bet: { size: BetSizeClass | null; f: number | null; spr: number | null; isAllIn: boolean } | null
): ProbeVerdict | null {
  const card = readProbeCard(street, board);
  const f = readFacts(street, hole, board);
  if (!card || !f) return null;
  const favorable = probeFlopFavorable(board);
  const frequency = PROBE_FREQUENCY[favorable ? "favorable" : "unfavorable"][card];
  const h = f.hand;
  const m = h.made;
  const twoPairPlus = STRONG.includes(m);
  const tpNotTk = m === "topPair" && h.kicker !== "top";
  const midBottom = m === "middlePair" || m === "bottomPair";
  const set = m === "trips";
  // リバーのドローは外れたドロー。
  const oesd = f.oesd || (street === "river" && f.missedSd);
  const gut = f.gut || (street === "river" && f.missedSd);

  type Item = [ProbeHandKey, boolean];
  const groups: { items: Item[]; size: ProbeSize }[] = [];
  if (card === "flush") {
    // ショーダウンバリューのある手(Aハイ・ミドルペア系)と完全なエアー以外の全てで33%。TPも含む。
    const anyDraw = f.fd || f.oesd || f.gut || f.bdfd || f.missedSd || f.missedFd;
    const sdb = midBottom || m === "pocketPairBelow" || (m === "highCard" && f.ranks.includes(14) && !anyDraw);
    const air = m === "highCard" && !anyDraw;
    groups.push({ items: [["flushCardBet", !sdb && !air]], size: "33" });
  } else if (card === "straight" || card === "rag") {
    groups.push({
      items: [["tpNotTk", tpNotTk], ["twoPair", m === "twoPair"], ["gutshot", gut]],
      size: card === "straight" ? "50" : "2e",
    });
    groups.push({
      items: [["midBottomHit", midBottom], ["underPair", m === "pocketPairBelow"], ["set", set], ["oesd", oesd]],
      size: "33",
    });
  } else if (card === "ace") {
    groups.push({
      items: [["twoPairPlus", twoPairPlus], ["oesd", oesd], ["gutshot", gut], ["bottomHit", m === "bottomPair"]],
      size: "2e",
    });
  } else if (card === "overcard") {
    // A以外のオーバーカード。ノートは有利ボードにしか書かれていないので、不利ボードでも同じ手で見る。
    groups.push({
      items: [["twoPairPlus", twoPairPlus], ["gutshot", gut], ["bottomHit", m === "bottomPair"]],
      size: "2e",
    });
    groups.push({
      items: [["midBottomHit", midBottom], ["underPair", m === "pocketPairBelow"], ["set", set], ["oesd", oesd]],
      size: "33",
    });
  }

  const mine = groups.filter((g) => g.items.some(([, on]) => on));
  const handKey = mine[0]?.items.find(([, on]) => on)?.[0] ?? null;
  const sizes = mine.map((g) => g.size);
  const base = { kind: "probe" as const, street, card, favorable, frequency, handKey, handLabel: labelHand(f), sizes };

  if (!bet) {
    if (card === "repeat") return { ...base, action: "check", situation: "checkRepeatOk", grade: "best" };
    if (mine.length === 0) return { ...base, action: "check", situation: "checkNotListedOk", grade: "best" };
    // 打つ手でも、頻度が低い(3割以下)カードではチェックが多数派。頻度が半分のカードは打つのも十分ある。
    if (frequency === null || frequency < 50) {
      return { ...base, action: "check", situation: "checkListedLowFreqOk", grade: "best" };
    }
    return { ...base, action: "check", situation: "checkListedMissed", grade: "good" };
  }

  const matches = (target: ProbeSize): boolean => {
    if (bet.f === null || !bet.size) return false;
    if (target === "33") return bet.size === "block";
    if (target === "50") return bet.size === "small";
    if (bet.spr === null || bet.isAllIn) return false;
    const g = geometricFraction(bet.spr, 2);
    return bet.f >= g * 0.75 && bet.f <= g * 1.35;
  };
  if (card === "repeat") return { ...base, action: "bet", situation: "betRepeat", grade: "mistake" };
  if (mine.length === 0) return { ...base, action: "bet", situation: "betNotListed", grade: "inaccuracy" };
  if (mine.some((g) => matches(g.size))) return { ...base, action: "bet", situation: "betOk", grade: "best" };
  // 手は合っているがサイズが違う: カテゴリ内の別のサイズなら好手、どれとも違えば緩手。
  const other = groups.some((g) => !mine.includes(g) && matches(g.size));
  return other
    ? { ...base, action: "bet", situation: "betOtherSize", grade: "good" }
    : { ...base, action: "bet", situation: "betSizeOff", grade: "inaccuracy" };
}

// ═════════════════════════════ ドンク ═════════════════════════════

/**
 * ドンクが成立する理由(Notion【ドンクベット】の「ドンクが存在するスポット」)。
 *  - フロップのローボード / コネクトボード
 *  - ターンリピート
 *  - 3betPot のリバーのロー1枚ストレートボード
 *  - フラッシュ完成カード / ストレート完成カード
 *  - ナッツが変化しOOP側にナッツ級ができた時(リバーでボードがペアになる)
 */
export type DonkReason =
  | "flushCompleted"
  | "straightCompleted"
  | "turnRepeat"
  | "nutChange"
  | "threeBetStraight"
  | "lowBoard"
  | "connectBoard";

/** その理由のドンクで打つ手(ノートの「均衡的ドンク戦略」)。 */
export type DonkFit = "draw" | "nutClass" | "block";

export type DonkSituation =
  | "betGood"
  | "betGoodTooBig"
  | "betNoFit"
  | "betNoReason"
  | "betNoReasonTurnDraw"
  | "betNoReasonRiverBlock"
  | "betNoReasonRag"
  | "checkShouldDonk"
  | "checkOkNoFit"
  | "checkOkNoReason";

export interface DonkVerdict {
  kind: "donk";
  street: BetStreet;
  action: "bet" | "check";
  reason: DonkReason | null;
  /** その理由のドンクで打つ手か。 */
  fit: DonkFit | null;
  handLabel: SpotHandKey;
  actual: BetSizeClass | null;
  situation: DonkSituation;
  grade: NotionGrade;
}

/** ドンクのフロップのローボード(最高ランクがこれ以下)。Notion に数値の定義が無いので暫定(8ハイ以下)。 */
export const DONK_LOW_BOARD_MAX_RANK = 8;

/** ロー1枚ストレートボード: 4枚が5つの連続した枠に収まり、その枠の最上位が9以下。 */
function lowOneCardStraightBoard(board: readonly string[]): boolean {
  const tex = readBoardTexture(board);
  if (!tex) return false;
  const ranks = new Set(tex.ranks);
  if (ranks.has(14)) ranks.add(1);
  for (let low = 1; low <= 5; low++) {
    let n = 0;
    for (let k = 0; k < 5; k++) if (ranks.has(low + k)) n++;
    if (n >= 4) return true;
  }
  return false;
}

export function readDonkReason(street: BetStreet, board: readonly string[], potType?: PotType): DonkReason | null {
  const n = BOARD_CARDS[street];
  const cur = board.slice(0, n);
  const tex = readBoardTexture(cur);
  if (!tex) return null;
  if (street === "flop") {
    if (tex.highRank <= DONK_LOW_BOARD_MAX_RANK) return "lowBoard";
    if (tex.hmGap !== null && tex.hmGap <= 1) return "connectBoard";
    return null;
  }
  const prevBoard = board.slice(0, n - 1);
  const prev = readBoardTexture(prevBoard);
  const card = parseBoardCard(board[n - 1] ?? "");
  if (!prev || !card) return null;
  if (tex.maxSuitCount >= 3 && tex.maxSuitCount > prev.maxSuitCount && cur.filter((b) => b.endsWith(card.suit)).length >= 3) {
    return "flushCompleted";
  }
  if (straightPossible(cur) && !straightPossible(prevBoard)) return "straightCompleted";
  if (prev.ranks.includes(card.rank)) return street === "turn" ? "turnRepeat" : "nutChange";
  if (street === "river" && (potType === "threeBet" || potType === "fourBetPlus") && lowOneCardStraightBoard(cur)) {
    return "threeBetStraight";
  }
  return null;
}

function donkFit(reason: DonkReason, street: BetStreet, f: Facts): DonkFit | null {
  const m = f.hand.made;
  const draw = f.fd || f.oesd || f.gut;
  switch (reason) {
    case "lowBoard":
    case "connectBoard":
    case "turnRepeat":
      return draw ? "draw" : null;
    case "flushCompleted":
      if (m === "flush" || m === "fullHouse" || m === "quads" || m === "straightFlush") return "nutClass";
      // 2Pでダブルバレルを打たれ、リバーでフラッシュ完成カード → ドンクブロック。
      if (street === "river" && (m === "twoPair" || m === "trips" || m === "straight")) return "block";
      return null;
    case "straightCompleted":
      return m === "straight" || m === "flush" || m === "fullHouse" || m === "quads" || m === "straightFlush"
        ? "nutClass"
        : null;
    case "nutChange":
      return m === "fullHouse" || m === "quads" || m === "straightFlush" ? "nutClass" : null;
    case "threeBetStraight":
      return m !== "highCard" ? "block" : null;
  }
}

/**
 * ドンクの場面(自分がオリジナルより先に打てる。フロップ・ターン・リバー)の評価。
 *
 *  - 打った: 理由あり+打つ手 → 良手 / 理由ありだが打つ手でない → 好手 / 理由なし → 悪手
 *  - チェック: 理由あり+打つ手 → 緩手(ここは○○だからドンクを打つべき)/ それ以外 → 最善(チェックで正解)
 */
export function judgeDonk(
  street: BetStreet,
  hole: readonly (string | null)[],
  board: readonly string[],
  potType: PotType | undefined,
  bet: { size: BetSizeClass | null } | null
): DonkVerdict | null {
  const f = readFacts(street, hole, board);
  if (!f) return null;
  const reason = readDonkReason(street, board, potType);
  const fit = reason ? donkFit(reason, street, f) : null;
  const base = { kind: "donk" as const, street, reason, fit, handLabel: labelHand(f) };
  if (!bet) {
    if (reason && fit) return { ...base, action: "check", actual: null, situation: "checkShouldDonk", grade: "inaccuracy" };
    return {
      ...base,
      action: "check",
      actual: null,
      situation: reason ? "checkOkNoFit" : "checkOkNoReason",
      grade: "best",
    };
  }
  const actual = bet.size;
  const out = (situation: DonkSituation, grade: NotionGrade): DonkVerdict => ({ ...base, action: "bet", actual, situation, grade });
  if (reason && fit) {
    // ドローのドンクは「無理やりオッズを合わせる目的で安く」打つもの。
    if (fit === "draw" && actual && SIZE_ORDER.indexOf(actual) > 1) return out("betGoodTooBig", "good");
    return out("betGood", "excellent");
  }
  if (reason) return out("betNoFit", "good");
  const draw = f.fd || f.oesd || f.gut;
  if (street === "turn" && draw) return out("betNoReasonTurnDraw", "mistake");
  if (street === "river" && actual === "block") return out("betNoReasonRiverBlock", "mistake");
  const tex = readBoardTexture(board.slice(0, BOARD_CARDS[street]));
  if (tex?.draws === "dry") return out("betNoReasonRag", "mistake");
  return out("betNoReason", "mistake");
}

// ═════════════════════════════ チェックレイズ ═════════════════════════════

/**
 * チェックレイズの表の見出し(Notion【チェックレイズ(call側)】と【ドライJTハイボード】)。上から優先。
 * どれにも当たらないボードは「general」(【チェックレイズサイズ･頻度】と、15%以上混ぜる・ブラフの優先順の一般論)。
 */
export type CheckRaiseBoard = "monotone" | "paired" | "straightBoard" | "dryKQ" | "dryJT" | "general";

/** 表の中での手の扱い。value / bluff = レイズする手、valueCall = コールに回す手、none = 表に無い手。 */
export type CheckRaiseHand = "value" | "valueCall" | "bluff" | "none";

export type CheckRaiseSituation =
  | "raiseOk"
  | "raiseSizeOff"
  | "raiseValueCall"
  | "raiseNotListed"
  | "raiseMonotone"
  | "callRaiseHand"
  | "callValueCallOk"
  | "foldValue"
  | "foldBluff"
  | "callNotListed"
  | "foldNotListed";

export interface CheckRaiseVerdict {
  kind: "checkRaise";
  street: BetStreet;
  board: CheckRaiseBoard;
  action: "raise" | "call" | "fold";
  hand: CheckRaiseHand;
  handLabel: SpotHandKey;
  /** 表のレイズサイズ(小さく=50% → small、ポットレイズ → large)。 */
  recommended: BetSizeClass;
  actual: BetSizeClass | null;
  sizeGap: number;
  /** 浅いスタック(SPR3以下)で、ワンペアもチェックレイズの候補に入れたか。 */
  shortStack: boolean;
  situation: CheckRaiseSituation;
  grade: NotionGrade;
  /**
   * ノートに「その手でコール/フォールドしてよいか」の記載が無い場面。GTOの格付けがあればそちらを残し、
   * 無ければ grade(常識的な手)を出す。
   */
  keepGto: boolean;
}

/** 浅いスタックとみなす SPR(Notion「浅スタックのトナメではワンペアで頻繁にチェックレイズしていい」)。 */
export const CHECK_RAISE_SHORT_SPR = 3;

export function readCheckRaiseBoard(street: BetStreet, board: readonly string[]): CheckRaiseBoard | null {
  const cur = board.slice(0, BOARD_CARDS[street]);
  const tex = readBoardTexture(cur);
  if (!tex) return null;
  if (tex.maxSuitCount >= 3) return "monotone";
  if (tex.isPaired) return "paired";
  if (straightPossible(cur)) return "straightBoard";
  if (tex.draws === "dry" && (tex.highRank === 13 || tex.highRank === 12)) return "dryKQ";
  if (tex.draws === "dry" && (tex.highRank === 11 || tex.highRank === 10)) return "dryJT";
  return "general";
}

function classifyCheckRaiseHand(
  board: CheckRaiseBoard,
  f: Facts,
  boardTex: { suit: string; ranks: number[] },
  shortStack: boolean
): CheckRaiseHand {
  const m = f.hand.made;
  const set = m === "trips" && f.pocketPair;
  const tripsKicker = m === "trips" && !f.pocketPair ? Math.max(...f.ranks.filter((r) => !boardTex.ranks.includes(r)), 0) : 0;
  const strongMade = m === "straightFlush" || m === "quads" || m === "fullHouse" || m === "flush" || m === "straight";
  const doubleBackdoor = f.bdfd && f.bdsd;
  const onePair = m === "overPair" || m === "topPair" || m === "middlePair";
  switch (board) {
    case "monotone":
      // ノート: モノトーンボードはパッシブにプレイする(頻度5%で小さく)。打つ手の記載は無い。
      return "none";
    case "paired":
      if (strongMade || set) return "value";
      if (m === "trips") return tripsKicker >= 10 ? "value" : "valueCall";
      if (doubleBackdoor) return "bluff";
      // スケアカードの多いポケットペア(ここで言う6ポケ)はプロテクトレイズ。
      if (f.pocketPair && f.ranks[0]! <= 9) return "bluff";
      return shortStack && onePair ? "value" : "none";
    case "straightBoard": {
      if (m === "straight") return Math.max(...f.ranks) > f.boardHigh ? "value" : "valueCall";
      if (m === "flush" || m === "fullHouse" || m === "quads" || m === "straightFlush") return "value";
      if (f.fd && (f.oesd || f.gut)) return "bluff";
      if (f.nutFd) return "bluff";
      // レインボーボードでは、バックドアフラッシュドローの付いたストレートドローもレイズ。
      if (boardTex.suit === "rainbow" && (f.oesd || f.gut) && f.bdfd) return "bluff";
      return shortStack && (set || m === "twoPair" || onePair) ? "value" : set || m === "twoPair" ? "valueCall" : "none";
    }
    case "dryKQ":
      if (set || m === "twoPair" || strongMade || m === "trips") return "value";
      if (f.oesd) return "bluff";
      // 全てのナッツストドロ(ここではブロードウェイのガットショットとみなす)。
      if (f.gut && Math.min(...f.ranks) >= 10) return "bluff";
      if (doubleBackdoor && f.nutBdfd) return "bluff";
      if (m === "bottomPair" && doubleBackdoor) return "bluff";
      return shortStack && onePair ? "value" : "none";
    case "dryJT":
      // 【ドライJTハイボード】セットはCR、フラドロは全てCR。
      if (set || strongMade || m === "trips") return "value";
      if (f.fd) return "bluff";
      return shortStack && (onePair || m === "twoPair") ? "value" : "none";
    case "general":
      if (set || m === "trips" || m === "twoPair" || strongMade) return "value";
      // ブラフの優先順: ボトムヒット → ストドロ → 弱ポケ → フラドロ。
      if (m === "bottomPair" || f.oesd || f.gut || m === "pocketPairBelow" || f.fd) return "bluff";
      return shortStack && onePair ? "value" : "none";
  }
}

/**
 * チェックレイズの場面(自分がチェック → 相手のベットに直面)の評価。フロップ・ターン・リバー。
 *
 *  - レイズ: 表の手でサイズが合えば最善(ずれで好手〜緩手)。コールに回す手は好手。表に無い手は緩手
 *  - コール: レイズ候補の手 → 好手(頻度は10%前後なので毎回ではない)/ コールに回す手 → 最善
 *  - フォールド: バリューの手 → 悪手 / ブラフ候補(ドロー)→ 緩手(エクイティの放棄)
 *  - 表に無い手のコール/フォールドはノートに記載が無いので、GTOの格付けを残す(無ければ常識的な手)
 */
export function judgeCheckRaise(
  street: BetStreet,
  hole: readonly (string | null)[],
  board: readonly string[],
  action: { kind: "raise"; size: BetSizeClass | null; isAllIn: boolean } | { kind: "call" } | { kind: "fold" },
  spr: number | null
): CheckRaiseVerdict | null {
  const cb = readCheckRaiseBoard(street, board);
  const f = readFacts(street, hole, board);
  const tex = readBoardTexture(board.slice(0, BOARD_CARDS[street]));
  if (!cb || !f || !tex) return null;
  const shortStack = spr !== null && spr <= CHECK_RAISE_SHORT_SPR;
  const hand = classifyCheckRaiseHand(cb, f, tex, shortStack);
  const recommended: BetSizeClass = cb === "dryKQ" ? "large" : "small";
  const base = { kind: "checkRaise" as const, street, board: cb, hand, handLabel: labelHand(f), recommended, shortStack };

  if (action.kind === "raise") {
    const actual = action.isAllIn ? "overbet" : action.size;
    const gap = actual ? sizeGap(actual, recommended) : 0;
    const out = (situation: CheckRaiseSituation, grade: NotionGrade): CheckRaiseVerdict => ({
      ...base,
      action: "raise",
      actual,
      sizeGap: gap,
      situation,
      grade,
      keepGto: false,
    });
    if (cb === "monotone") return out("raiseMonotone", "inaccuracy");
    if (hand === "none") return out("raiseNotListed", "inaccuracy");
    if (hand === "valueCall") return out("raiseValueCall", "good");
    // オールインは浅いスタックの「ワンペアでのALLIN」ならサイズを咎めない。
    if (!actual || gap === 0 || (action.isAllIn && shortStack)) return out("raiseOk", "best");
    return out("raiseSizeOff", gradeByGap(gap));
  }
  const out = (situation: CheckRaiseSituation, grade: NotionGrade, keepGto = false): CheckRaiseVerdict => ({
    ...base,
    action: action.kind,
    actual: null,
    sizeGap: 0,
    situation,
    grade,
    keepGto,
  });
  if (action.kind === "call") {
    if (hand === "value" || hand === "bluff") return out("callRaiseHand", "good");
    if (hand === "valueCall") return out("callValueCallOk", "best");
    return out("callNotListed", "book", true);
  }
  if (hand === "value" || hand === "valueCall") return out("foldValue", "mistake");
  if (hand === "bluff") return out("foldBluff", "inaccuracy");
  return out("foldNotListed", "book", true);
}

// ═════════════════════════════ チェックレイズ後のターン ═════════════════════════════

export type AfterCheckRaiseSituation =
  | "checkRangeOk"
  | "betRangeCheck"
  | "betFlushOk"
  | "betFlushSize"
  | "checkFlush"
  | "betOk"
  | "betSizeOff"
  | "checkValueOk"
  | "checkBluff"
  | "betNotListed"
  | "checkNotListedOk";

export interface AfterCheckRaiseVerdict {
  kind: "afterCheckRaise";
  card: BarrelCard;
  action: "bet" | "check";
  hand: "value" | "bluff" | "none";
  handLabel: SpotHandKey;
  recommended: BetSizeClass | null;
  actual: BetSizeClass | null;
  sizeGap: number;
  situation: AfterCheckRaiseSituation;
  grade: NotionGrade;
}

/**
 * フロップでチェックレイズしてコールされたあとのターン(Notion【チェックレイズ後のターン戦略(call側)】)。
 *  - オーバーカード / ペアカード: レンジ全体でチェック
 *  - フラッシュ完成カード: 全てのハンドで安くベット
 *  - ラグ: バリュー(全てのセットとツーペア)でポットベット、リバーのオールインを目指す(降りられそうならチェック)。
 *    ブラフは全てのドローとボトムペア
 */
export function judgeAfterCheckRaise(
  hole: readonly (string | null)[],
  board: readonly string[],
  bet: { size: BetSizeClass | null } | null
): AfterCheckRaiseVerdict | null {
  const card = readBarrelCard("turn", board);
  const f = readFacts("turn", hole, board);
  if (!card || !f) return null;
  const m = f.hand.made;
  const value = m === "trips" || m === "twoPair" || m === "straight" || m === "flush" || m === "fullHouse" || m === "quads" || m === "straightFlush";
  const bluff = !value && (f.fd || f.oesd || f.gut || m === "bottomPair");
  const hand = value ? "value" : bluff ? "bluff" : "none";
  const recommended: BetSizeClass | null = card === "flush" ? "block" : card === "rag" ? "large" : null;
  const actual = bet?.size ?? null;
  const gap = actual && recommended ? sizeGap(actual, recommended) : 0;
  const out = (situation: AfterCheckRaiseSituation, grade: NotionGrade): AfterCheckRaiseVerdict => ({
    kind: "afterCheckRaise",
    card,
    action: bet ? "bet" : "check",
    hand,
    handLabel: labelHand(f),
    recommended,
    actual,
    sizeGap: gap,
    situation,
    grade,
  });
  if (card === "overcard" || card === "paired") return bet ? out("betRangeCheck", "inaccuracy") : out("checkRangeOk", "best");
  if (card === "flush") {
    if (!bet) return out("checkFlush", "inaccuracy");
    // 「安く」= 33%(block)と50%(small)まで。
    return actual === null || SIZE_ORDER.indexOf(actual) <= 1 ? out("betFlushOk", "best") : out("betFlushSize", gradeByGap(gap - 1));
  }
  // ラグ
  if (!bet) {
    if (hand === "value") return out("checkValueOk", "good");
    if (hand === "bluff") return out("checkBluff", "inaccuracy");
    return out("checkNotListedOk", "best");
  }
  if (hand === "none") return out("betNotListed", "inaccuracy");
  return gap === 0 || actual === null ? out("betOk", "best") : out("betSizeOff", gradeByGap(gap));
}
