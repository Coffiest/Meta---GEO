import { Dealer, createShuffledDeck } from "./deck.js";
import { evaluateBest, type HandRank } from "./handEvaluator.js";
import { buildPots, settlePots, type Pot } from "./pots.js";
import { classifyRaise } from "./bettingLogic.js";
import { computeStreetOrder } from "./seatOrder.js";
import type { Card } from "./types/card.js";
import type { PlayerAction, Street } from "./types/action.js";

export interface HandSeatInput {
  readonly seatIndex: number;
  readonly playerId: string;
  readonly stack: number;
}

export interface HandEngineConfig {
  readonly seats: readonly HandSeatInput[];
  /** テーブル全体の固定席数(6-maxなら6)。デッドボタン計算の円環サイズに使用。 */
  readonly seatCount: number;
  readonly buttonFixedPos: number;
  /** デッドスモールブラインドの場合は null(このハンドはSB徴収なし) */
  readonly smallBlindSeat: number | null;
  readonly bigBlindSeat: number;
  readonly smallBlind: number;
  readonly bigBlind: number;
  /** BBアンテ方式: BB席のプレイヤーのみが追加で払うアンテ額(通常 bigBlind と同額) */
  readonly bbAnte: number;
  /** テスト用にデッキを注入できる(未指定ならシャッフル済みデッキを生成) */
  readonly deck?: Card[];
}

interface SeatState {
  readonly seatIndex: number;
  readonly playerId: string;
  stack: number;
  status: "active" | "folded" | "allIn";
  /** そのハンド全体での拠出累計(アンテ含む)。サイドポット計算に使用。 */
  handContribution: number;
  /** 現在のストリートでの拠出累計(アンテは含まない、ベットのマッチ判定用) */
  streetContribution: number;
  hasActedThisStreet: boolean;
  holeCards: Card[];
}

export interface HandEvent {
  readonly type: string;
  readonly [key: string]: unknown;
}

export interface HandResult {
  readonly board: readonly Card[];
  readonly pots: readonly Pot[];
  readonly payouts: ReadonlyMap<string, number>;
  readonly showdownHands: ReadonlyMap<string, HandRank>;
  readonly wonByFold: boolean;
}

const STREET_ORDER: readonly Street[] = ["preflop", "flop", "turn", "river"];

export class HandEngine {
  private readonly seats = new Map<number, SeatState>();
  private readonly smallBlind: number;
  private readonly bigBlind: number;
  private readonly bbAnte: number;
  private readonly dealer: Dealer;
  private readonly postflopOrder: readonly number[];
  private readonly preflopOrder: readonly number[];
  private readonly events: HandEvent[] = [];

  private board: Card[] = [];
  private street: Street = "preflop";
  private currentBetToMatch = 0;
  private lastFullRaiseSize: number;
  /** 直近のフルレイズ以降に積み重なった、まだ再オープンに達していない不完全レイズの増分合計 */
  private incompleteRaiseAccumulator = 0;
  private actingSeatIndex: number | null = null;
  private result: HandResult | null = null;

  constructor(config: HandEngineConfig) {
    if (config.seats.length < 2) throw new Error("A hand requires at least 2 seats");
    this.smallBlind = config.smallBlind;
    this.bigBlind = config.bigBlind;
    this.bbAnte = config.bbAnte;
    this.lastFullRaiseSize = config.bigBlind;
    this.dealer = new Dealer(config.deck ?? createShuffledDeck());

    for (const s of config.seats) {
      this.seats.set(s.seatIndex, {
        seatIndex: s.seatIndex,
        playerId: s.playerId,
        stack: s.stack,
        status: "active",
        handContribution: 0,
        streetContribution: 0,
        hasActedThisStreet: false,
        holeCards: [],
      });
    }

    const seatIndices = config.seats.map((s) => s.seatIndex);
    const order = computeStreetOrder({
      occupiedSeats: seatIndices,
      buttonFixedPos: config.buttonFixedPos,
      smallBlindSeat: config.smallBlindSeat,
      bigBlindSeat: config.bigBlindSeat,
      seatCount: config.seatCount,
    });
    this.preflopOrder = order.preflopOrder;
    this.postflopOrder = order.postflopOrder;

    this.dealHoleCards();
    this.postBlindsAndAntes(config.smallBlindSeat, config.bigBlindSeat);
    this.actingSeatIndex = this.firstEligibleInOrder(this.preflopOrder);
    this.maybeAutoRunOut();
  }

  private seat(seatIndex: number): SeatState {
    const s = this.seats.get(seatIndex);
    if (!s) throw new Error(`Unknown seat ${seatIndex}`);
    return s;
  }

  private dealHoleCards(): void {
    const seatIndices = this.postflopOrder;
    for (let round = 0; round < 2; round++) {
      for (const idx of seatIndices) {
        this.seat(idx).holeCards.push(...this.dealer.draw(1));
      }
    }
  }

  private postBlindsAndAntes(sbSeatIndex: number | null, bbSeatIndex: number): void {
    if (sbSeatIndex !== null) {
      const sb = this.seat(sbSeatIndex);
      const sbPost = Math.min(this.smallBlind, sb.stack);
      sb.stack -= sbPost;
      sb.streetContribution += sbPost;
      sb.handContribution += sbPost;
      if (sb.stack === 0) sb.status = "allIn";
      this.events.push({ type: "postBlind", seatIndex: sbSeatIndex, amount: sbPost, blind: "small" });
    } else {
      this.events.push({ type: "deadSmallBlind" });
    }

    const bb = this.seat(bbSeatIndex);
    const bbBlindPost = Math.min(this.bigBlind, bb.stack);
    bb.stack -= bbBlindPost;
    bb.streetContribution += bbBlindPost;
    bb.handContribution += bbBlindPost;
    this.events.push({ type: "postBlind", seatIndex: bbSeatIndex, amount: bbBlindPost, blind: "big" });

    const antePost = Math.min(this.bbAnte, bb.stack);
    bb.stack -= antePost;
    bb.handContribution += antePost; // アンテはポットに直行し、streetContribution(マッチ判定)には含めない
    if (bb.stack === 0) bb.status = "allIn";
    this.events.push({ type: "postAnte", seatIndex: bbSeatIndex, amount: antePost });

    this.currentBetToMatch = bb.streetContribution;
  }

  private activeContenderSeats(): SeatState[] {
    return [...this.seats.values()].filter((s) => s.status !== "folded");
  }

  private seatsThatCanStillAct(): SeatState[] {
    return [...this.seats.values()].filter((s) => s.status === "active");
  }

  private firstEligibleInOrder(order: readonly number[]): number | null {
    for (const idx of order) {
      const s = this.seat(idx);
      if (s.status === "active") return idx;
    }
    return null;
  }

  getActingSeatIndex(): number | null {
    return this.actingSeatIndex;
  }

  getStreet(): Street {
    return this.street;
  }

  isHandComplete(): boolean {
    return this.result !== null;
  }

  getResult(): HandResult {
    if (!this.result) throw new Error("Hand is not complete yet");
    return this.result;
  }

  private currentOrder(): readonly number[] {
    return this.street === "preflop" ? this.preflopOrder : this.postflopOrder;
  }

  applyAction(seatIndex: number, action: PlayerAction): void {
    if (this.isHandComplete()) throw new Error("Hand is already complete");
    if (this.actingSeatIndex !== seatIndex) {
      throw new Error(`It is seat ${this.actingSeatIndex}'s turn, not ${seatIndex}`);
    }
    const seat = this.seat(seatIndex);
    if (seat.status !== "active") throw new Error(`Seat ${seatIndex} cannot act (status=${seat.status})`);

    switch (action.kind) {
      case "fold": {
        seat.status = "folded";
        seat.hasActedThisStreet = true;
        this.events.push({ type: "fold", seatIndex });
        break;
      }
      case "check": {
        if (seat.streetContribution !== this.currentBetToMatch) {
          throw new Error(`Seat ${seatIndex} cannot check while facing a bet`);
        }
        seat.hasActedThisStreet = true;
        this.events.push({ type: "check", seatIndex });
        break;
      }
      case "call": {
        const maxPossible = seat.streetContribution + seat.stack;
        const toAmount = Math.min(this.currentBetToMatch, maxPossible);
        this.commit(seat, toAmount);
        seat.hasActedThisStreet = true;
        this.events.push({ type: "call", seatIndex, toAmount });
        break;
      }
      case "bet":
      case "raise":
      case "allIn": {
        // TDA Rule 47相当: hasActedThisStreet が true のままこの席の番が再び回ってきた場合、
        // それは直前に不完全レイズ(再オープンしないショートオールイン)が発生したことを意味する。
        // その場合この席はフォールドかコール(kind: "call")のみ可能で、新たなベット/レイズはできない。
        if (seat.hasActedThisStreet) {
          throw new Error(
            `Seat ${seatIndex} already acted and the betting round was not reopened (incomplete raise) — only fold/call is allowed`,
          );
        }
        const maxPossible = seat.streetContribution + seat.stack;
        const toAmount = action.kind === "allIn" ? maxPossible : action.toAmount;
        if (toAmount === undefined) throw new Error("toAmount is required for bet/raise");
        if (toAmount > maxPossible) throw new Error("Cannot wager more than the seat's stack");
        if (toAmount <= seat.streetContribution) throw new Error("bet/raise must increase the street contribution");

        const legality = classifyRaise({
          toAmount,
          currentBetToMatch: this.currentBetToMatch,
          roundLastFullRaiseSize: this.lastFullRaiseSize,
        });

        const isAllIn = toAmount === maxPossible;
        if (legality.type !== "fullRaise" && !isAllIn) {
          throw new Error("Raise is below the minimum raise size");
        }

        const increment = toAmount - this.currentBetToMatch;

        this.commit(seat, toAmount);
        seat.hasActedThisStreet = true;
        this.currentBetToMatch = Math.max(this.currentBetToMatch, toAmount);

        if (legality.type === "fullRaise") {
          this.lastFullRaiseSize = legality.newMinRaiseSize;
          this.incompleteRaiseAccumulator = 0;
          this.resetActedFlagsExcept(seatIndex);
        } else {
          // 不完全レイズ(ショートオールイン)。単体では既アクション済みプレイヤーへの再オープンはしない。
          // ただし複数のショートオールインが積み重なり、合計増分が直近の正当なレイズ幅に達したら再オープンする。
          this.incompleteRaiseAccumulator += increment;
          if (this.incompleteRaiseAccumulator >= this.lastFullRaiseSize) {
            this.lastFullRaiseSize = this.incompleteRaiseAccumulator;
            this.incompleteRaiseAccumulator = 0;
            this.resetActedFlagsExcept(seatIndex);
          }
        }
        this.events.push({ type: action.kind, seatIndex, toAmount, legality: legality.type });
        break;
      }
    }

    this.advance();
  }

  private commit(seat: SeatState, toAmount: number): void {
    const delta = toAmount - seat.streetContribution;
    if (delta < 0) throw new Error("Cannot decrease a seat's street contribution");
    if (delta > seat.stack) throw new Error("Insufficient stack for this commitment");
    seat.stack -= delta;
    seat.streetContribution = toAmount;
    seat.handContribution += delta;
    if (seat.stack === 0) seat.status = "allIn";
  }

  private resetActedFlagsExcept(seatIndex: number): void {
    for (const s of this.seats.values()) {
      if (s.seatIndex !== seatIndex && s.status === "active") {
        s.hasActedThisStreet = false;
      }
    }
  }

  private isBettingComplete(): boolean {
    const contenders = this.activeContenderSeats();
    if (contenders.length <= 1) return true;
    const canAct = this.seatsThatCanStillAct();
    if (canAct.length === 0) return true;
    return canAct.every((s) => s.hasActedThisStreet && s.streetContribution === this.currentBetToMatch);
  }

  private advance(): void {
    if (this.isBettingComplete()) {
      this.finalizeStreet();
      return;
    }
    const order = this.currentOrder();
    const startPos = order.indexOf(this.actingSeatIndex!);
    for (let step = 1; step <= order.length; step++) {
      const idx = order[(startPos + step) % order.length]!;
      const s = this.seat(idx);
      if (s.status === "active" && !(s.hasActedThisStreet && s.streetContribution === this.currentBetToMatch)) {
        this.actingSeatIndex = idx;
        return;
      }
    }
    // 見つからなければベッティング完了とみなす
    this.finalizeStreet();
  }

  private finalizeStreet(): void {
    const contenders = this.activeContenderSeats();
    if (contenders.length <= 1) {
      const winner = contenders[0];
      if (winner) this.awardUncontested(winner.seatIndex);
      return;
    }

    if (this.street === "river") {
      this.showdown();
      return;
    }

    this.dealNextStreet();
    this.maybeAutoRunOut();
  }

  private dealNextStreet(): void {
    const currentIdx = STREET_ORDER.indexOf(this.street);
    const nextStreet = STREET_ORDER[currentIdx + 1];
    if (!nextStreet) {
      this.showdown();
      return;
    }
    this.street = nextStreet;
    this.dealer.burn();
    const drawCount = nextStreet === "flop" ? 3 : 1;
    this.board.push(...this.dealer.draw(drawCount));

    for (const s of this.seats.values()) {
      s.streetContribution = 0;
      s.hasActedThisStreet = s.status !== "active";
    }
    this.currentBetToMatch = 0;
    this.lastFullRaiseSize = this.bigBlind;
    this.incompleteRaiseAccumulator = 0;
    this.actingSeatIndex = this.firstEligibleInOrder(this.postflopOrder);
    this.events.push({ type: "dealStreet", street: nextStreet, board: [...this.board] });
  }

  /** 全員オールイン(=これ以上アクションできる人がいない)なら、TDA同様に残りを一括ランナウトする */
  private maybeAutoRunOut(): void {
    while (!this.isHandComplete() && this.seatsThatCanStillAct().length === 0 && this.activeContenderSeats().length > 1) {
      if (this.street === "river") {
        this.showdown();
        return;
      }
      this.dealNextStreet();
    }
  }

  private awardUncontested(winnerSeatIndex: number): void {
    const winner = this.seat(winnerSeatIndex);
    const contributions = new Map<string, number>();
    for (const s of this.seats.values()) contributions.set(s.playerId, s.handContribution);

    const otherContributions = [...this.seats.values()]
      .filter((s) => s.seatIndex !== winnerSeatIndex)
      .map((s) => s.handContribution);
    const nextHighest = otherContributions.length > 0 ? Math.max(...otherContributions) : 0;
    const uncalledReturn = Math.max(0, winner.handContribution - nextHighest);
    if (uncalledReturn > 0) {
      winner.stack += uncalledReturn;
      winner.handContribution -= uncalledReturn;
      contributions.set(winner.playerId, winner.handContribution);
    }

    const potTotal = [...contributions.values()].reduce((a, b) => a + b, 0);
    winner.stack += potTotal;

    this.result = {
      board: this.board,
      pots: [{ amount: potTotal, eligiblePlayerIds: [winner.playerId] }],
      payouts: new Map([[winner.playerId, potTotal]]),
      showdownHands: new Map(),
      wonByFold: true,
    };
    this.events.push({ type: "handComplete", wonByFold: true, winner: winner.playerId });
  }

  private showdown(): void {
    const contenders = this.activeContenderSeats();
    const contributions = new Map<string, number>();
    const folded = new Set<string>();
    for (const s of this.seats.values()) {
      contributions.set(s.playerId, s.handContribution);
      if (s.status === "folded") folded.add(s.playerId);
    }

    const handRanks = new Map<string, HandRank>();
    for (const s of contenders) {
      handRanks.set(s.playerId, evaluateBest([...s.holeCards, ...this.board]));
    }

    const pots = buildPots(contributions, folded);
    const seatOrderFromButton = this.postflopOrder.map((idx) => this.seat(idx).playerId);
    const payouts = settlePots({ pots, handRanks, seatOrderFromButton });

    for (const [playerId, amount] of payouts) {
      const seat = [...this.seats.values()].find((s) => s.playerId === playerId)!;
      seat.stack += amount;
    }

    this.result = {
      board: this.board,
      pots,
      payouts,
      showdownHands: handRanks,
      wonByFold: false,
    };
    this.events.push({ type: "handComplete", wonByFold: false });
  }

  getStacks(): Map<number, number> {
    return new Map([...this.seats.entries()].map(([idx, s]) => [idx, s.stack]));
  }

  getEvents(): readonly HandEvent[] {
    return this.events;
  }
}
