import { computeButtonAssignment, nextPreviousBlinds, type PreviousBlindPositions } from "./buttonRotation.js";
import { getBlindLevel, STARTING_STACK, type BlindLevel } from "./blindStructure.js";
import { HandEngine, type HandResult } from "./handEngine.js";
import type { Card } from "./types/card.js";

export interface TournamentSeatState {
  readonly seatIndex: number;
  readonly playerId: string;
  readonly displayName: string;
  stack: number;
  bustedAtHand: number | null;
}

export interface TournamentConfig {
  readonly seatCount: number;
  readonly players: readonly { playerId: string; displayName: string; seatIndex: number }[];
  readonly startingStack?: number;
  /**
   * 1ハンド目のボタンの位置を決める乱数(0以上1未満)。省略時は従来どおり「席番号の最も小さい人が BB」。
   * フレンド対戦はスタート時にボタンの位置もランダムにする(公正さのため。オーナー指示)。
   */
  readonly random?: () => number;
}

export interface HandStartedEvent {
  readonly type: "handStarted";
  readonly handNumber: number;
  readonly level: BlindLevel;
  readonly buttonFixedPos: number;
  readonly smallBlindSeat: number | null;
  readonly bigBlindSeat: number;
}

export interface HandFinishedEvent {
  readonly type: "handFinished";
  readonly handNumber: number;
  readonly result: HandResult;
  readonly bustedSeats: readonly number[];
}

export type TournamentEvent = HandStartedEvent | HandFinishedEvent;

/** `seat` が `from` から時計回りに `to` まで(両端を含む)の範囲にあるか。 */
function isClockwiseBetween(seat: number, from: number, to: number, seatCount: number): boolean {
  const offset = (x: number) => (((x - from) % seatCount) + seatCount) % seatCount;
  return offset(seat) <= offset(to);
}

/**
 * SnG(単卓)トーナメントの進行を管理する。ブラインドレベルの実際の経過時間管理や
 * ネットワーク越しのアクション入力は呼び出し側(サーバー)の責務とし、ここでは
 * 「次のハンドを組み立てる」「結果を反映する」という純粋な状態遷移のみを扱う。
 */
export class Tournament {
  private readonly seatCount: number;
  private readonly seats = new Map<number, TournamentSeatState>();
  private handNumber = 0;
  private levelIndex = 1;
  // 次のハンドのSB席は「前のハンドのBB席」、BTN席は「前のハンドのSB席」になる(buttonRotation.ts 参照)。
  // そのため前のハンドのSB位置も覚えておく必要がある(デッドSBで空席だった場合もその位置を保持する)。
  private previousBlinds: PreviousBlindPositions | null = null;
  private readonly events: TournamentEvent[] = [];
  private currentHand: HandEngine | null = null;
  private currentHandButtonInfo: { buttonFixedPos: number; smallBlindSeat: number | null; bigBlindSeat: number } | null =
    null;
  /**
   * 途中から座った(レイトイン・リエントリー)が、まだ配られていない席。TDA ルールどおり、
   * ボタンと SB の間に座った人はボタンが通り過ぎるまで配られない(`startNextHand` 参照)。
   */
  private readonly waitingSeats = new Set<number>();
  /** 席を譲った過去の参加(リエントリーで同じ席・別の席に座り直す前の記録)。着順の計算に使う。 */
  private readonly retired: TournamentSeatState[] = [];
  private readonly startingStack: number;
  private readonly random: (() => number) | null;

  constructor(config: TournamentConfig) {
    this.seatCount = config.seatCount;
    const startingStack = config.startingStack ?? STARTING_STACK;
    this.startingStack = startingStack;
    this.random = config.random ?? null;
    for (const p of config.players) {
      if (p.seatIndex < 0 || p.seatIndex >= this.seatCount) {
        throw new Error(`seatIndex ${p.seatIndex} is out of range for a ${this.seatCount}-max table`);
      }
      this.seats.set(p.seatIndex, {
        seatIndex: p.seatIndex,
        playerId: p.playerId,
        displayName: p.displayName,
        stack: startingStack,
        bustedAtHand: null,
      });
    }
  }

  getCurrentLevel(): BlindLevel {
    return getBlindLevel(this.levelIndex);
  }

  advanceToNextLevel(): void {
    this.levelIndex += 1;
  }

  private occupiedSeats(): TournamentSeatState[] {
    return [...this.seats.values()].filter((s) => s.bustedAtHand === null);
  }

  isTournamentOver(): boolean {
    return this.occupiedSeats().length <= 1;
  }

  getWinnerPlayerId(): string | null {
    const remaining = this.occupiedSeats();
    return remaining.length === 1 ? remaining[0]!.playerId : null;
  }

  getSeats(): readonly TournamentSeatState[] {
    return [...this.seats.values()];
  }

  /**
   * チップを破棄しての離脱など、ハンドの結果によらず強制的にその席を「今バストした」扱いにする。
   * 呼ばない場合、離脱者は以降のハンドで自動フォールドし続けるだけの席として残り、ブラインドで
   * 少しずつ減る以外は負けないため、実際にプレイして敗退した他のプレイヤーより良い着順になって
   * しまう(離脱=即敗退という直感に反する)。既にバスト済みなら何もしない。
   */
  forceEliminate(seatIndex: number): void {
    const seat = this.seats.get(seatIndex);
    if (!seat || seat.bustedAtHand !== null) return;
    seat.bustedAtHand = this.handNumber;
    this.waitingSeats.delete(seatIndex);
  }

  getEvents(): readonly TournamentEvent[] {
    return this.events;
  }

  /** いまのハンド番号(最後に始めたハンド。まだ1つも始めていなければ 0)。 */
  getHandNumber(): number {
    return this.handNumber;
  }

  /** 生きているが、まだ配られていない(ボタンが通り過ぎるのを待っている)席。 */
  getWaitingSeats(): readonly number[] {
    return [...this.waitingSeats];
  }

  /** リエントリーで席を空けた、過去の参加の記録(バストした順の情報を残す)。 */
  getRetiredEntries(): readonly TournamentSeatState[] {
    return this.retired;
  }

  /**
   * 進行中のトーナメントに途中から座らせる(レイトイン・リエントリー)。開始スタックで座る。
   * ハンドとハンドの間に呼ぶこと。席は空席(誰も座っていないか、バストした人の席)でなければならない。
   * バストした人の席に座らせるときは、その人の記録を `getRetiredEntries` へ移す。
   *
   * 配られるのは次のハンドから。ただしボタンと SB の間の席なら、ボタンが通り過ぎるまで待つ(TDA)。
   */
  addPlayer(player: { playerId: string; displayName: string; seatIndex: number }): void {
    const { seatIndex } = player;
    if (seatIndex < 0 || seatIndex >= this.seatCount) {
      throw new Error(`seatIndex ${seatIndex} is out of range for a ${this.seatCount}-max table`);
    }
    if (this.currentHand && !this.currentHand.isHandComplete()) {
      throw new Error("Players can only be seated between hands");
    }
    const existing = this.seats.get(seatIndex);
    if (existing && existing.bustedAtHand === null) throw new Error(`Seat ${seatIndex} is occupied`);
    if ([...this.seats.values()].some((s) => s.playerId === player.playerId && s.bustedAtHand === null)) {
      throw new Error(`Player ${player.playerId} is already seated`);
    }
    if (existing) this.retired.push(existing);
    this.seats.set(seatIndex, {
      seatIndex,
      playerId: player.playerId,
      displayName: player.displayName,
      stack: this.startingStack,
      bustedAtHand: null,
    });
    // 1ハンドもまだ始まっていなければ、最初から居たのと同じ扱い(待たせる基準のボタンが無い)。
    if (this.previousBlinds !== null) this.waitingSeats.add(seatIndex);
  }

  /**
   * 次のハンドで配る席と、ボタン/ブラインドの位置を決める。
   *
   * TDA(Rule 8: 途中から座った人は、SB とボタンの間でなければすぐに配られる)に合わせて:
   * - 途中から座った人は、ボタンから SB までの席(両端を含む。デッドボタン・デッド SB の空席に座った場合も
   *   ここに入る)なら、このハンドは配らない(1回休み)。ブラインドを払わずにボタンを取る「ただ乗り」を防ぐ。
   *   ボタンが通り過ぎた次のハンドからは、ボタンの右隣として配られる。
   * - SB からは入れない。SB は「前のハンドの BB の席」なので、来たばかりの人は仕組み上 SB にならない。
   * - BB の位置に当たる席(前の BB の次)なら、そのまま BB で入れる(BB イン)。
   * - 待っている人はボタン・ブラインドの計算から外すので、ブラインドの流れは誰も来なかったときと同じ。
   *
   * ヘッズアップから人が増えると、配る人によってボタンの決め方(ヘッズアップの特例)が変わるため、
   * 配ると決めた人がボタン〜SB に入らなくなるまで決め直す(配る人は減る一方なので必ず止まる)。
   */
  private planNextHand(alive: TournamentSeatState[]): {
    dealt: TournamentSeatState[];
    assignment: ReturnType<typeof computeButtonAssignment>;
  } {
    const established = alive.filter((s) => !this.waitingSeats.has(s.seatIndex));
    const newcomers = alive.filter((s) => this.waitingSeats.has(s.seatIndex));

    // 待たせる基準(前のハンドのボタン)が無い、または確定した人が1人以下でハンドが成り立たないときは全員配る。
    if (this.previousBlinds === null || established.length < 2 || newcomers.length === 0) {
      const previous = this.previousBlinds ?? this.randomFirstBlinds(alive);
      return {
        dealt: alive,
        assignment: computeButtonAssignment({
          occupiedSeats: new Set(alive.map((s) => s.seatIndex)),
          seatCount: this.seatCount,
          previous,
        }),
      };
    }

    let dealtNewcomers = newcomers;
    for (;;) {
      const dealt = [...established, ...dealtNewcomers];
      const assignment = computeButtonAssignment({
        occupiedSeats: new Set(dealt.map((s) => s.seatIndex)),
        seatCount: this.seatCount,
        previous: this.previousBlinds,
      });
      const kept = dealtNewcomers.filter(
        (s) => !isClockwiseBetween(s.seatIndex, assignment.buttonFixedPos, assignment.smallBlindFixedPos, this.seatCount),
      );
      if (kept.length === dealtNewcomers.length) return { dealt, assignment };
      dealtNewcomers = kept;
    }
  }

  /**
   * 1ハンド目のボタンを乱数で決めるための「仮の前のハンド」。BB にしたい席の1つ手前を前の BB、
   * そのさらに手前を前の SB とすると、通常の回し方(BB は前の BB の次へ、SB は前の BB、ボタンは前の SB)で
   * 選んだ席がちょうど BB になる。乱数が無ければ null(従来どおり席番号の最も小さい人が BB)。
   */
  private randomFirstBlinds(alive: TournamentSeatState[]): PreviousBlindPositions | null {
    if (!this.random || alive.length < 2) return null;
    const live = alive.map((s) => s.seatIndex).sort((a, b) => a - b);
    const bbIndex = Math.min(live.length - 1, Math.floor(this.random() * live.length));
    const at = (i: number) => live[(i + live.length) % live.length]!;
    return { bigBlindFixedPos: at(bbIndex - 1), smallBlindFixedPos: at(bbIndex - 2) };
  }

  /** 次のハンドを開始する(ボタン移動 + HandEngine構築)。呼び出し側でアクションを流し込んでいく。 */
  startNextHand(deck?: Card[]): HandEngine {
    if (this.isTournamentOver()) throw new Error("Tournament is already over");
    if (this.currentHand && !this.currentHand.isHandComplete()) {
      throw new Error("The current hand has not finished yet");
    }

    this.handNumber += 1;
    const { dealt: occupied, assignment } = this.planNextHand(this.occupiedSeats());
    for (const s of occupied) this.waitingSeats.delete(s.seatIndex);
    this.previousBlinds = nextPreviousBlinds(assignment);
    this.currentHandButtonInfo = assignment;

    const level = this.getCurrentLevel();
    const hand = new HandEngine({
      seats: occupied.map((s) => ({ seatIndex: s.seatIndex, playerId: s.playerId, stack: s.stack })),
      seatCount: this.seatCount,
      buttonFixedPos: assignment.buttonFixedPos,
      smallBlindSeat: assignment.smallBlindSeat,
      bigBlindSeat: assignment.bigBlindSeat,
      smallBlind: level.smallBlind,
      bigBlind: level.bigBlind,
      bbAnte: level.bbAnte,
      ...(deck ? { deck } : {}),
    });

    this.currentHand = hand;
    this.events.push({
      type: "handStarted",
      handNumber: this.handNumber,
      level,
      buttonFixedPos: assignment.buttonFixedPos,
      smallBlindSeat: assignment.smallBlindSeat,
      bigBlindSeat: assignment.bigBlindSeat,
    });
    return hand;
  }

  /** ハンド完了後に呼び出し、スタックをトーナメント状態へ反映し、バストしたプレイヤーを除外する */
  settleFinishedHand(): void {
    const hand = this.currentHand;
    if (!hand) throw new Error("No hand in progress");
    if (!hand.isHandComplete()) throw new Error("The current hand has not finished yet");

    const stacks = hand.getStacks();
    const bustedSeats: number[] = [];
    for (const [seatIndex, stack] of stacks) {
      const seat = this.seats.get(seatIndex)!;
      seat.stack = stack;
      if (stack === 0) {
        seat.bustedAtHand = this.handNumber;
        bustedSeats.push(seatIndex);
      }
    }
    // 配られなかった人(待っている間)がバストすることは無いが、念のため待ちの印は生存者だけに残す。
    for (const seatIndex of [...this.waitingSeats]) {
      if (this.seats.get(seatIndex)?.bustedAtHand !== null) this.waitingSeats.delete(seatIndex);
    }

    this.events.push({
      type: "handFinished",
      handNumber: this.handNumber,
      result: hand.getResult(),
      bustedSeats,
    });
    this.currentHand = null;
    this.currentHandButtonInfo = null;
  }
}
