import { stackBucketOf, bucketPreflopRaiseBb, bucketPostflopPct } from "./geoTree.js";

/**
 * 局後検討のためのノード抽出。保存済みの1ハンド(全アクション・全席)から、
 * hero(レビュー対象プレイヤー)の意思決定ノードを時系列で復元する。
 *
 * geoTree.ts の replay と同じ座席→ポジション変換・スタック計算・ベットサイズバケット化を用いるが、
 * こちらは「1ハンド・1hero・フルコンテキスト(pot/facing/board/生存人数)」を出力する点が異なる。
 * DB非依存(素のオブジェクトを受け取る)なのでユニットテスト可能。
 *
 * スコープ規則(確定仕様):
 *   - プリフロップ: 常に解析対象(analyzable=true)。
 *   - ポストフロップ: そのストリート開始時にHU(生存2人)なら解析対象。3人以上なら
 *     analyzable=false, outOfScopeReason="multiway"(「多人数のため対象外」)。
 */

const SEAT_COUNT = 6;
const POSITION_NAMES = ["BTN", "SB", "BB", "UTG", "HJ", "CO"] as const;
const STREET_ORDER = ["preflop", "flop", "turn", "river"] as const;

export interface ExtractSeat {
  seatIndex: number;
  userId: string;
  startingStack: number;
  holeCards: string[];
  wasAway?: boolean;
}

export interface ExtractAction {
  sequenceNumber: number;
  seatIndex: number;
  street: string;
  kind: string; // fold|check|call|bet|raise|allIn|postBlind|postAnte
  toAmount: number | null;
  potBefore: number;
}

export interface ExtractHand {
  buttonFixedPos: number;
  levelBigBlind: number;
  board: string[];
  seats: ExtractSeat[];
  actions: ExtractAction[];
}

export interface HeroDecision {
  sequenceNumber: number;
  street: string;
  heroPos: string;
  /** ポストフロップの相対ポジション。HUのときのみ意味を持つ("IP"|"OOP")。 */
  relPos: "IP" | "OOP" | null;
  effStackBb: number;
  potBb: number;
  facingSizeBb: number;
  holeCards: string[];
  boardSoFar: string[];
  liveCount: number;
  actionTaken: { kind: string; bucket: string; toAmount: number | null };
  /** この決定より前の、現ストリート内の全プレイヤーのアクション(バケット名)列。ソルバーのノード特定に使う。 */
  streetLineBefore: string[];
  analyzable: boolean;
  outOfScopeReason?: string;
}

function positionOf(seatIndex: number, buttonFixedPos: number): string {
  const offset = (((seatIndex - buttonFixedPos) % SEAT_COUNT) + SEAT_COUNT) % SEAT_COUNT;
  return POSITION_NAMES[offset] ?? "";
}

function boardForStreet(board: string[], street: string): string[] {
  if (street === "flop") return board.slice(0, 3);
  if (street === "turn") return board.slice(0, 4);
  if (street === "river") return board.slice(0, 5);
  return [];
}

/** そのストリートで最後に手番が来る(=ポジションが最も後ろ)席がIP。HU前提でheroがIPか判定。 */
function isHeroInPosition(heroSeat: number, otherSeat: number, buttonFixedPos: number): boolean {
  // ポストフロップの行動順は SB,BB,UTG,HJ,CO,BTN(=ボタンが最後)。offsetが大きいほど後ろ。
  const order = (seat: number) => {
    const offset = (((seat - buttonFixedPos) % SEAT_COUNT) + SEAT_COUNT) % SEAT_COUNT;
    // BTN(offset0)を最後(=5)へ、SB(offset1)を先頭(=0)へ。
    return (offset + SEAT_COUNT - 1) % SEAT_COUNT;
  };
  return order(heroSeat) > order(otherSeat);
}

export function extractHeroDecisions(hand: ExtractHand, heroUserId: string): HeroDecision[] {
  const bb = hand.levelBigBlind;
  const heroSeatEntry = hand.seats.find((s) => s.userId === heroUserId);
  if (!heroSeatEntry || bb <= 0) return [];
  const heroSeat = heroSeatEntry.seatIndex;

  const startingStackBySeat = new Map(hand.seats.map((s) => [s.seatIndex, s.startingStack]));
  const handContribution = new Map<number, number>(); // 過去ストリートまでの拠出累計
  const streetContribution = new Map<number, number>(); // 現ストリートの拠出累計
  const foldedSeats = new Set<number>();
  const seatsDealt = hand.seats.length;

  let currentStreet = "preflop";
  // ストリート開始時の生存人数スナップショット。
  const liveAtStreetStart: Record<string, number> = { preflop: seatsDealt };
  // 現ストリート内の(全プレイヤーの)アクションのバケット列。ソルバーのノード特定に使う。
  let streetLine: string[] = [];

  const decisions: HeroDecision[] = [];

  /** 任意の席のアクションをバケット化する(heroの分類と同一ロジック)。 */
  function bucketOfAction(action: ExtractAction, isPreflop: boolean): string {
    const priorStreet = streetContribution.get(action.seatIndex) ?? 0;
    const priorHand = handContribution.get(action.seatIndex) ?? 0;
    const startingStack = startingStackBySeat.get(action.seatIndex) ?? 0;
    const behindStack = startingStack - priorHand - priorStreet;
    const toAmount = action.toAmount ?? priorStreet;
    const maxPossible = priorStreet + behindStack;
    const isAllIn = action.kind === "allIn" || (behindStack > 0 && toAmount >= maxPossible);
    if (action.kind === "fold") return "fold";
    if (isAllIn) return "allIn";
    if (action.kind === "check" || action.kind === "call") return isPreflop ? "call" : "checkOrCall";
    if (isPreflop) return bucketPreflopRaiseBb(toAmount / bb);
    const betAmount = toAmount - priorStreet;
    const pct = action.potBefore > 0 ? (betAmount / action.potBefore) * 100 : 0;
    return bucketPostflopPct(pct);
  }

  for (const action of hand.actions) {
    // ストリート切り替え: streetContributionをhandContributionへ繰り込み、生存人数を記録。
    if (action.street !== currentStreet) {
      for (const [seat, amt] of streetContribution) {
        handContribution.set(seat, (handContribution.get(seat) ?? 0) + amt);
      }
      streetContribution.clear();
      currentStreet = action.street;
      liveAtStreetStart[currentStreet] = seatsDealt - foldedSeats.size;
      streetLine = [];
    }

    if (action.kind === "postBlind") {
      streetContribution.set(action.seatIndex, (streetContribution.get(action.seatIndex) ?? 0) + (action.toAmount ?? 0));
      continue;
    }
    if (action.kind === "postAnte") {
      handContribution.set(action.seatIndex, (handContribution.get(action.seatIndex) ?? 0) + (action.toAmount ?? 0));
      continue;
    }

    const alreadyFolded = foldedSeats.has(action.seatIndex);

    // heroの、まだ生きている意思決定のみ記録する。
    if (action.seatIndex === heroSeat && !alreadyFolded) {
      const priorStreet = streetContribution.get(action.seatIndex) ?? 0;
      const priorHand = handContribution.get(action.seatIndex) ?? 0;
      const startingStack = startingStackBySeat.get(action.seatIndex) ?? 0;
      const behindStack = startingStack - priorHand - priorStreet;
      const isPreflop = currentStreet === "preflop";

      // facing(コールに必要な額) = 他席の現ストリート最大拠出 - hero拠出。
      let maxOther = 0;
      for (const [seat, amt] of streetContribution) {
        if (seat !== action.seatIndex && !foldedSeats.has(seat)) maxOther = Math.max(maxOther, amt);
      }
      const facing = Math.max(0, maxOther - priorStreet);

      const toAmount = action.toAmount ?? priorStreet;
      const maxPossible = priorStreet + behindStack;
      const isAllIn = action.kind === "allIn" || (behindStack > 0 && toAmount >= maxPossible);

      let bucket: string;
      if (action.kind === "fold") bucket = "fold";
      else if (isAllIn) bucket = "allIn";
      else if (action.kind === "check" || action.kind === "call") bucket = isPreflop ? "call" : "checkOrCall";
      else if (isPreflop) bucket = bucketPreflopRaiseBb(toAmount / bb);
      else {
        const betAmount = toAmount - priorStreet;
        const pct = action.potBefore > 0 ? (betAmount / action.potBefore) * 100 : 0;
        bucket = bucketPostflopPct(pct);
      }

      const liveNow = liveAtStreetStart[currentStreet] ?? seatsDealt - foldedSeats.size;
      const analyzable = isPreflop || liveNow === 2;

      // 相対ポジション(HUポストフロップのみ)。相手席は生存する非hero席。
      let relPos: "IP" | "OOP" | null = null;
      if (!isPreflop && liveNow === 2) {
        const otherSeat = hand.seats.find((s) => s.seatIndex !== heroSeat && !foldedSeats.has(s.seatIndex));
        if (otherSeat) relPos = isHeroInPosition(heroSeat, otherSeat.seatIndex, hand.buttonFixedPos) ? "IP" : "OOP";
      }

      decisions.push({
        sequenceNumber: action.sequenceNumber,
        street: currentStreet,
        heroPos: positionOf(heroSeat, hand.buttonFixedPos),
        relPos,
        effStackBb: behindStack / bb,
        potBb: action.potBefore / bb,
        facingSizeBb: facing / bb,
        holeCards: heroSeatEntry.holeCards,
        boardSoFar: boardForStreet(hand.board, currentStreet),
        liveCount: liveNow,
        actionTaken: { kind: action.kind, bucket, toAmount: action.toAmount },
        streetLineBefore: [...streetLine],
        analyzable,
        ...(analyzable ? {} : { outOfScopeReason: "multiway" }),
      });
    }

    // 現ストリートのアクション列へ追記(全プレイヤー。hero決定のsnapshotの後)。
    if (!alreadyFolded) streetLine.push(bucketOfAction(action, currentStreet === "preflop"));

    if (action.kind === "fold") foldedSeats.add(action.seatIndex);

    // toAmountは現ストリートの累計拠出そのもの(handEngine.commitと同義)。
    if (action.toAmount !== null) streetContribution.set(action.seatIndex, action.toAmount);
  }

  return decisions;
}

/** 有効スタック帯(GtoSolution.effStackBucket 用)。 */
export function effStackBucketOf(effStackBb: number): string {
  return stackBucketOf(effStackBb);
}

export { STREET_ORDER };
