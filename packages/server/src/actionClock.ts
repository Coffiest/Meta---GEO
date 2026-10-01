import type { HandEngine } from "@meta-geo/engine";
import type { ActionTiming } from "@meta-geo/db";

/**
 * 1ハンドの間の、各アクションの時刻を記録する(研究用。データベースタブの「データ研究」)。
 *
 * 手番が回ってきた時刻・行動した時刻・時間切れの自動処理か・タイムバンクを使ったかを、
 * HandAction の sequenceNumber ごとに残す。ハンド終了時に `recordHand` へ渡す。
 *
 * 自動で卓を埋めるプレイヤーの行は思考時間を null にする(作り物の遅延なので研究に使わない)。
 * この区別は DB の中だけに留まり、画面や通信には一切出ない。
 */
export class HandActionClock {
  readonly startedAt = new Date();
  readonly timings = new Map<number, ActionTiming>();
  private turn: { seatIndex: number; startedAt: number; timeBank: boolean } | null = null;
  private autoNext = false;

  /** 手番がその席に回った(同じ手番の途中で呼ばれても開始時刻は変えない)。 */
  turnStarted(seatIndex: number): void {
    if (!this.turn || this.turn.seatIndex !== seatIndex) {
      this.turn = { seatIndex, startedAt: Date.now(), timeBank: false };
    }
  }

  /** その席がタイムバンクで延長した。 */
  timeBankUsed(seatIndex: number): void {
    if (this.turn?.seatIndex === seatIndex) this.turn.timeBank = true;
  }

  /** 次に記録するアクションは、時間切れ(または離脱)による自動処理。 */
  markAuto(): void {
    this.autoNext = true;
  }

  /** アクションを適用した直後に呼ぶ。そのアクションの sequenceNumber に時刻を結び付ける。 */
  recorded(hand: HandEngine, seatIndex: number, isHuman: boolean): void {
    const now = Date.now();
    const events = hand.getEvents();
    let seq: number | null = null;
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i]!;
      if (e["seatIndex"] === seatIndex && typeof e["sequenceNumber"] === "number" && typeof e["street"] === "string") {
        seq = e["sequenceNumber"] as number;
        break;
      }
    }
    const startedAt = this.turn?.seatIndex === seatIndex ? this.turn.startedAt : now;
    if (seq !== null) {
      this.timings.set(seq, {
        turnStartedAt: new Date(startedAt),
        actedAt: new Date(now),
        thinkMs: isHuman ? Math.max(0, now - startedAt) : null,
        timedOut: this.autoNext,
        timeBankUsed: this.turn?.seatIndex === seatIndex ? this.turn.timeBank : false,
      });
    }
    this.turn = null;
    this.autoNext = false;
  }
}
