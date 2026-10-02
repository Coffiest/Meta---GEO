/**
 * ダブルバレル(ターン)とトリプルバレル(リバー)を、Notion【ダブルバレル】の表で評価する。
 *
 * オーナー確定:
 *  - **トリプルバレル(リバーのベット)も、ダブルバレルと同じ表を使う。** リバーでは
 *    「直前のストリート(ターン)のボード」に対して、落ちたカードの種類を読む。
 *  - 表に当てはまるバリュー/ブラフの手を**打たなかった(チェックした)**、表に無い手で打った、
 *    サイズが表と違う、のいずれも、**ずれの大きさでバッジを付けて**バリィが理由と直し方を話す。
 *  - 打つべきでない手をチェックしたときは褒める。
 *
 * 表(例はフロップ K♥8♦3♥。どのカードも頻度50%):
 *  - オーバーカード(A♠): 75%。強いワンペア以上とドローでポラライズ。
 *    バリュー=セット・ツーペア・AT以上のトップペア(トップセットはチェックに回してチェックレンジを強化し、それ以外をバリューに)
 *    ブラフ=全てのガットショットと一部のフラドロ(フラドロは半分くらいチェックレンジに残す)、Qハイ・Jハイ
 *  - ペアカード(8♠): 75%。ポラライズさせてトリップス+とドロー。
 *    バリュー=フルハウス・トリップス・KT以上のトップペア(ナッツのフルハウスのみチェックしてチェックレンジを強化)
 *    ブラフ=全てのフラドロ、キッカーの弱いA〜Tハイ(Tハイ以下は任意)
 *  - フラッシュ完成カード(J♥): 50%。
 *    バリュー=弱いフラッシュ・一部のセット・全てのツーペア・キッカーの強いトップヒット(KT以上)
 *    チェック=強いフラッシュ・ワンペア以上のフラドロ・トップセット
 *    ブラフ=全てのストドロ・ペアなしのフラドロ。ピュアブラフはしない
 *  - ラグ(6♠): 180%。
 *    バリュー=トップセット以外の全てのセット・ツーペア・キッカーが強いトップペア(KJ以上)
 *    ブラフ=全てのストドロ・ペアなしのフラドロ・キッカーが弱いA/Q/Jハイ
 *
 * 表に書かれていないところの扱い(ここで決めたもの):
 *  - ストレートの目ができるカードは表に見出しが無いので、ランクで「オーバーカード」(前のボードの最高ランクより上)か
 *    「ラグ」(それ以外)に入れる。**ダブル/トリプルバレルの場面では、必ずどれかの見出しで評価する**(オーナー確定)。
 *  - 表のバリューより強い役(ストレート・フラッシュ・フルハウス …)はバリューに入れる。
 *    ただしフラッシュ完成カードでは「強いフラッシュはチェック」に合わせて、フルハウス以上もチェックの手とする。
 *  - オーバーペアは「キッカーの強いトップペア」より強いのでバリューに入れる。
 *  - 「強いフラッシュ」は、手札のそのスートの最高ランクが Q 以上のもの(ノートに定義が無い)。
 *  - 「キッカーの弱いAハイ」はキッカーが9以下。キッカーの強いAハイはショーダウンバリューのある手とする。
 *  - リバーにはドローが無いので、ブラフの「ストレートドロー」は**外れたストレートドロー**と読む。
 *    外れたフラッシュドローは、相手の外れたフラッシュドローをブロックしてしまうので(Notion【ブロッカー】)、
 *    リバーではブラフに回さない手とする。
 *  - 表の手に入らないペアは「ショーダウンバリューのある手」、何も無い手は「エアー」。どちらもチェックする手。
 *
 * 全席を同じロジックで判定する(種別による分岐は持たない)。
 */

import { parseBoardCard, readBoardTexture } from "./boardTexture.js";
import type { BetSizeClass } from "./betRole.js";
import { readHandStrength, type HandStrength } from "./handStrength.js";
import type { NotionGrade } from "./strategyVerdict.js";

/** 落ちたカードの種類(表の見出し)。ストレート完成カードは表に無いので含めない。 */
export type BarrelCard = "overcard" | "paired" | "flush" | "rag";

export type BarrelStreet = "turn" | "river";

/**
 * 表の中での手の扱い。
 *  - value / bluff: 打つ手
 *  - mixedBluff: 打つ手だが、半分くらいはチェックレンジに残す(オーバーカードのフラドロ)
 *  - optionalBluff: 打っても打たなくてもよい(ペアカードのTハイ以下「任意」)
 *  - checkHand: チェックに回してチェックレンジを守る手(トップセットなど)
 *  - showdown: 表に無いペアなど。ショーダウンバリューがあるのでチェック
 *  - air: 何も無い手。打たない
 */
export type BarrelHandClass = "value" | "bluff" | "mixedBluff" | "optionalBluff" | "checkHand" | "showdown" | "air";

/** 手の名前(バリィが「きみの手は○○だから」と言うため)。 */
export type BarrelHandKey =
  | "straightFlush"
  | "quads"
  | "nutFullHouse"
  | "fullHouse"
  | "strongFlush"
  | "weakFlush"
  | "flush"
  | "straight"
  | "topSet"
  | "set"
  | "trips"
  | "twoPair"
  | "overPair"
  | "topPairStrong"
  | "topPairWeak"
  | "middlePair"
  | "bottomPair"
  | "underPair"
  | "flushDrawWithPair"
  | "flushDraw"
  | "openEnded"
  | "gutshot"
  | "missedStraightDraw"
  | "missedFlushDraw"
  | "aceHighWeak"
  | "aceHighStrong"
  | "kingHigh"
  | "queenHigh"
  | "jackHigh"
  | "tenHighOrLower";

/** 評価の場合分け。解説はこれで言い分ける。 */
export type BarrelSituation =
  /** 表の手を表のサイズで打った。 */
  | "betOk"
  /** 表の手だが、サイズが小さい。 */
  | "betTooSmall"
  /** 表の手だが、サイズが大きい。 */
  | "betTooBig"
  /** チェックに回す手(トップセットなど)で打った。 */
  | "betCheckHand"
  /** ショーダウンバリューのある手で打った(ブラフに変えてしまった)。 */
  | "betShowdown"
  /** 表に無い何も無い手で打った。 */
  | "betAir"
  /** バリューの手をチェックした。 */
  | "checkValue"
  /** ブラフの手をチェックした。 */
  | "checkBluff"
  /** 半分チェックに残す手(フラドロ)/任意の手をチェックした。 */
  | "checkMixedOk"
  /** チェックに回す手をチェックした。 */
  | "checkHandOk"
  /** ショーダウンバリューのある手をチェックした。 */
  | "checkShowdownOk"
  /** 何も無い手をチェックした。 */
  | "checkAirOk";

export interface BarrelVerdict {
  street: BarrelStreet;
  card: BarrelCard;
  action: "bet" | "check";
  hand: BarrelHandClass;
  handKey: BarrelHandKey;
  /** 表のサイズ(オーバーカード/ペア=75% → medium、フラッシュ=50% → small、ラグ=180% → overbet)。 */
  recommended: BetSizeClass;
  /** 実際のサイズ。チェックは null。 */
  actual: BetSizeClass | null;
  /** 実際 − 表 のサイズの段数(負 = 小さい)。チェックは 0。 */
  sizeGap: number;
  situation: BarrelSituation;
  grade: NotionGrade;
}

/** 表のサイズ。 */
export const BARREL_SIZE: Record<BarrelCard, BetSizeClass> = {
  overcard: "medium",
  paired: "medium",
  flush: "small",
  rag: "overbet",
};

const SIZE_ORDER: readonly BetSizeClass[] = ["block", "small", "medium", "large", "overbet"];

/** 表のトップペアのキッカーの下限(AT / KT / KT / KJ)。 */
const TOP_PAIR_KICKER_MIN: Record<BarrelCard, number> = { overcard: 10, paired: 10, flush: 10, rag: 11 };

/** 「キッカーの弱いAハイ」のキッカーの上限。 */
const WEAK_ACE_KICKER_MAX = 9;

/** 「強いフラッシュ」の、手札のそのスートの最高ランクの下限(Q)。 */
const STRONG_FLUSH_MIN_RANK = 12;

/**
 * そのストリートに落ちたカードが、表のどの見出しに当たるか。上から優先。
 * ストレートの目ができるカードもランクでオーバーカードかラグに入れる(表に見出しが無いため)。読めなければ null。
 */
export function readBarrelCard(street: BarrelStreet, board: readonly string[]): BarrelCard | null {
  const n = street === "turn" ? 4 : 5;
  if (board.length < n) return null;
  const prevBoard = board.slice(0, n - 1);
  const curBoard = board.slice(0, n);
  const prev = readBoardTexture(prevBoard);
  const cur = readBoardTexture(curBoard);
  const card = parseBoardCard(board[n - 1]!);
  if (!prev || !cur || !card) return null;
  if (prev.ranks.includes(card.rank)) return "paired";
  const sameSuit = curBoard.filter((b) => parseBoardCard(b)?.suit === card.suit).length;
  if (sameSuit >= 3) return "flush";
  if (card.rank > prev.highRank) return "overcard";
  return "rag";
}

/** 手の扱いを決めるための材料。 */
interface HandFacts {
  hand: HandStrength;
  /** ひとつ前のストリートの手(リバーで「外れたドロー」を読むため)。 */
  prevHand: HandStrength | null;
  ranks: number[];
  suits: string[];
  pocketPair: boolean;
  /** ひとつ前のストリートのボードの最高ランク(トップセット・ナッツのフルハウスの基準)。 */
  prevHigh: number;
  /** 今のボードの最高ランク(トップペアの基準)。 */
  curHigh: number;
  /** 今のボードで同じスートが3枚以上あるスート。 */
  flushSuit: string | null;
}

/** 手の扱いと名前を決める。表の見出しごとに、上から順に当てはめる。 */
export function classifyBarrelHand(
  street: BarrelStreet,
  card: BarrelCard,
  hole: readonly (string | null)[],
  board: readonly string[]
): { hand: BarrelHandClass; handKey: BarrelHandKey } | null {
  const n = street === "turn" ? 4 : 5;
  const curBoard = board.slice(0, n);
  const prevBoard = board.slice(0, n - 1);
  const hand = readHandStrength(hole, curBoard);
  const parsed = hole
    .map((h) => (typeof h === "string" ? parseBoardCard(h) : null))
    .filter((x): x is { rank: number; suit: string } => x !== null);
  const prevTex = readBoardTexture(prevBoard);
  const curTex = readBoardTexture(curBoard);
  if (!hand || parsed.length < 2 || !prevTex || !curTex) return null;
  const flushSuit =
    ["s", "h", "d", "c"].find((su) => curBoard.filter((b) => parseBoardCard(b)?.suit === su).length >= 3) ?? null;
  const f: HandFacts = {
    hand,
    prevHand: street === "river" ? readHandStrength(hole, prevBoard) : null,
    ranks: parsed.map((x) => x.rank),
    suits: parsed.map((x) => x.suit),
    pocketPair: parsed[0]!.rank === parsed[1]!.rank,
    prevHigh: prevTex.highRank,
    curHigh: curTex.highRank,
    flushSuit,
  };
  return classify(street, card, f);
}

function classify(
  street: BarrelStreet,
  card: BarrelCard,
  f: HandFacts
): { hand: BarrelHandClass; handKey: BarrelHandKey } {
  const h = f.hand;
  const made = h.made;
  const set = made === "trips" && f.pocketPair;
  const topSet = set && f.ranks[0] === f.prevHigh;
  const trips = made === "trips" && !f.pocketPair;
  const fullHouse = made === "fullHouse";
  const nutFullHouse = fullHouse && f.pocketPair && f.ranks[0] === f.prevHigh;
  const topHit = made === "topPair";
  const kicker = topHit ? Math.max(...f.ranks.filter((r) => r !== f.curHigh), 0) : 0;
  const topPairStrong = topHit && kicker >= TOP_PAIR_KICKER_MIN[card];
  const noPair = made === "highCard";
  const high = Math.max(...f.ranks);
  const low = Math.min(...f.ranks);
  const suited = f.flushSuit ? f.ranks.filter((_, i) => f.suits[i] === f.flushSuit) : [];
  const strongFlush = made === "flush" && Math.max(...suited, 0) >= STRONG_FLUSH_MIN_RANK;

  // ドロー。ターンは今のドロー、リバーは「ターンで持っていて外れたドロー」。
  const onTurn = street === "turn";
  const fd = onTurn && (h.draws.flushDraw || h.draws.nutFlushDraw);
  const oesd = onTurn && h.draws.openEnded;
  const gut = onTurn && h.draws.gutshot;
  const prevDraws = f.prevHand?.draws;
  const missedFd = !onTurn && noPair && !!prevDraws && (prevDraws.flushDraw || prevDraws.nutFlushDraw);
  const missedSd = !onTurn && noPair && !!prevDraws && (prevDraws.openEnded || prevDraws.gutshot);

  const madeKey = (): BarrelHandKey | null => {
    if (made === "straightFlush") return "straightFlush";
    if (made === "quads") return "quads";
    if (nutFullHouse) return "nutFullHouse";
    if (fullHouse) return "fullHouse";
    if (made === "flush") return card === "flush" ? (strongFlush ? "strongFlush" : "weakFlush") : "flush";
    if (made === "straight") return "straight";
    if (topSet) return "topSet";
    if (set) return "set";
    if (trips) return "trips";
    if (made === "twoPair") return "twoPair";
    if (made === "overPair") return "overPair";
    if (topHit) return topPairStrong ? "topPairStrong" : "topPairWeak";
    if (made === "middlePair") return "middlePair";
    if (made === "bottomPair") return "bottomPair";
    if (made === "pocketPairBelow") return "underPair";
    return null;
  };
  const highKey = (): BarrelHandKey => {
    if (high === 14) return low <= WEAK_ACE_KICKER_MAX ? "aceHighWeak" : "aceHighStrong";
    if (high === 13) return "kingHigh";
    if (high === 12) return "queenHigh";
    if (high === 11) return "jackHigh";
    return "tenHighOrLower";
  };
  const drawKey = (): BarrelHandKey | null => {
    if (fd) return noPair ? "flushDraw" : "flushDrawWithPair";
    if (oesd) return "openEnded";
    if (gut) return "gutshot";
    return null;
  };
  const pairKey = madeKey();
  const strongMade =
    made === "straightFlush" || made === "quads" || fullHouse || made === "flush" || made === "straight";
  const fallback = (): { hand: BarrelHandClass; handKey: BarrelHandKey } => {
    // 表に入らない手。ペア以上ならショーダウンバリュー、何も無ければエアー。
    // キッカーの強いAハイもショーダウンバリューがある手として扱う。
    if (pairKey) return { hand: "showdown", handKey: pairKey };
    if (missedFd) return { hand: "air", handKey: "missedFlushDraw" };
    const hk = highKey();
    return { hand: hk === "aceHighStrong" ? "showdown" : "air", handKey: hk };
  };

  if (card === "overcard") {
    if (topSet) return { hand: "checkHand", handKey: "topSet" };
    if (strongMade || set || trips || made === "twoPair" || made === "overPair" || topPairStrong) {
      return { hand: "value", handKey: pairKey! };
    }
    if (gut || oesd) return { hand: "bluff", handKey: drawKey()! };
    if (fd) return { hand: "mixedBluff", handKey: drawKey()! };
    if (missedSd && !missedFd) return { hand: "bluff", handKey: "missedStraightDraw" };
    if (noPair && !missedFd && (high === 12 || high === 11)) return { hand: "bluff", handKey: highKey() };
    return fallback();
  }

  if (card === "paired") {
    if (nutFullHouse) return { hand: "checkHand", handKey: "nutFullHouse" };
    if (strongMade || set || trips || made === "twoPair" || made === "overPair" || topPairStrong) {
      return { hand: "value", handKey: pairKey! };
    }
    if (fd || oesd || gut) return { hand: "bluff", handKey: drawKey()! };
    if (missedSd && !missedFd) return { hand: "bluff", handKey: "missedStraightDraw" };
    if (noPair && !missedFd) {
      const hk = highKey();
      if (hk === "aceHighWeak" || hk === "kingHigh" || hk === "queenHigh" || hk === "jackHigh") {
        return { hand: "bluff", handKey: hk };
      }
      if (hk === "tenHighOrLower") return { hand: "optionalBluff", handKey: hk };
    }
    return fallback();
  }

  if (card === "flush") {
    if (made === "straightFlush" || made === "quads" || fullHouse || strongFlush || topSet) {
      return { hand: "checkHand", handKey: pairKey! };
    }
    if (fd && !noPair) return { hand: "checkHand", handKey: "flushDrawWithPair" };
    if (made === "flush" || made === "straight" || set || trips || made === "twoPair" || made === "overPair" || topPairStrong) {
      return { hand: "value", handKey: pairKey! };
    }
    if (oesd || gut) return { hand: "bluff", handKey: drawKey()! };
    if (fd) return { hand: "bluff", handKey: "flushDraw" };
    if (missedSd && !missedFd) return { hand: "bluff", handKey: "missedStraightDraw" };
    return fallback();
  }

  // ラグ
  if (topSet) return { hand: "checkHand", handKey: "topSet" };
  if (strongMade || set || trips || made === "twoPair" || made === "overPair" || topPairStrong) {
    return { hand: "value", handKey: pairKey! };
  }
  if (oesd || gut) return { hand: "bluff", handKey: drawKey()! };
  if (fd && noPair) return { hand: "bluff", handKey: "flushDraw" };
  if (missedSd && !missedFd) return { hand: "bluff", handKey: "missedStraightDraw" };
  if (noPair && !missedFd) {
    const hk = highKey();
    if (hk === "aceHighWeak" || hk === "queenHigh" || hk === "jackHigh") return { hand: "bluff", handKey: hk };
  }
  return fallback();
}

/** バリューのうち、打ち逃すと大きく損をする手(トップペア・オーバーペアより強い手)。 */
function isStrongValue(key: BarrelHandKey): boolean {
  return key !== "topPairStrong" && key !== "overPair";
}

/** サイズのずれ(段数の絶対値) → 評価。ぴったり=最善 / 1段=好手 / 2段=緩手 / 3段以上=悪手。 */
function gradeByGap(gap: number): NotionGrade {
  const g = Math.abs(gap);
  if (g === 0) return "best";
  if (g === 1) return "good";
  if (g === 2) return "inaccuracy";
  return "mistake";
}

/**
 * 1つの決定(ベット or チェック)を表で評価する。
 *
 * @param action ベットならそのサイズ(オールインは overbet で渡す)、チェックなら null
 */
export function judgeBarrel(
  street: BarrelStreet,
  hole: readonly (string | null)[],
  board: readonly string[],
  action: { kind: "bet"; size: BetSizeClass } | { kind: "check" }
): BarrelVerdict | null {
  const card = readBarrelCard(street, board);
  if (!card) return null;
  const cls = classifyBarrelHand(street, card, hole, board);
  if (!cls) return null;
  const recommended = BARREL_SIZE[card];
  const base = { street, card, hand: cls.hand, handKey: cls.handKey, recommended };

  if (action.kind === "check") {
    const out = (situation: BarrelSituation, grade: NotionGrade): BarrelVerdict => ({
      ...base,
      action: "check",
      actual: null,
      sizeGap: 0,
      situation,
      grade,
    });
    switch (cls.hand) {
      case "value":
        return out("checkValue", isStrongValue(cls.handKey) ? "mistake" : "inaccuracy");
      case "bluff":
        return out("checkBluff", "inaccuracy");
      case "mixedBluff":
      case "optionalBluff":
        return out("checkMixedOk", "best");
      case "checkHand":
        return out("checkHandOk", "best");
      case "showdown":
        return out("checkShowdownOk", "best");
      case "air":
        return out("checkAirOk", "best");
    }
  }

  const actual = action.size;
  const sizeGap = SIZE_ORDER.indexOf(actual) - SIZE_ORDER.indexOf(recommended);
  const out = (situation: BarrelSituation, grade: NotionGrade): BarrelVerdict => ({
    ...base,
    action: "bet",
    actual,
    sizeGap,
    situation,
    grade,
  });
  switch (cls.hand) {
    case "value":
    case "bluff":
    case "mixedBluff":
    case "optionalBluff":
      return out(sizeGap === 0 ? "betOk" : sizeGap < 0 ? "betTooSmall" : "betTooBig", gradeByGap(sizeGap));
    case "checkHand":
      return out("betCheckHand", "inaccuracy");
    case "showdown": {
      // 大きく打つほど、降りるのは弱い手・コールするのは強い手だけになり、損が膨らむ。
      const i = SIZE_ORDER.indexOf(actual);
      return out("betShowdown", i === 0 ? "inaccuracy" : i <= 2 ? "mistake" : "blunder");
    }
    case "air": {
      // 外れたフラドロ(ブロッカー)と、フラッシュ完成カードのピュアブラフは、ノートで明確に「しない」。
      if (cls.handKey === "missedFlushDraw" || card === "flush") return out("betAir", "mistake");
      return out("betAir", SIZE_ORDER.indexOf(actual) <= 1 ? "inaccuracy" : "mistake");
    }
  }
}
