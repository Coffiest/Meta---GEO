import { describe, expect, it } from "vitest";
import { computeButtonAssignment, nextPreviousBlinds } from "../src/buttonRotation.js";

const SEATS = 6;

function assign(occupied: number[], previous: { smallBlindFixedPos: number; bigBlindFixedPos: number } | null) {
  return computeButtonAssignment({ occupiedSeats: new Set(occupied), seatCount: SEATS, previous });
}

describe("computeButtonAssignment", () => {
  it("advances BB to the next occupied seat, with SB/BTN inheriting the previous BB/SB seats", () => {
    // 前のハンド: BTN=0 SB=1 BB=2 → 次は BTN=1 SB=2 BB=3
    const a = assign([0, 1, 2, 3, 4, 5], { smallBlindFixedPos: 1, bigBlindFixedPos: 2 });
    expect(a.bigBlindSeat).toBe(3);
    expect(a.smallBlindSeat).toBe(2);
    expect(a.buttonFixedPos).toBe(1);
    expect(a.buttonIsDead).toBe(false);
  });

  it("wraps around the table", () => {
    const a = assign([0, 1, 2, 3, 4, 5], { smallBlindFixedPos: 4, bigBlindFixedPos: 5 });
    expect(a.bigBlindSeat).toBe(0);
    expect(a.smallBlindSeat).toBe(5);
    expect(a.buttonFixedPos).toBe(4);
  });

  it("produces a dead button when the previous small blind just busted", () => {
    // 前のハンド: BTN=0 SB=1 BB=2。SBだった席1のプレイヤーがバスト。
    // BBは次の生存者=3へ、SBは前のBB席=2、BTNは前のSB席=1(空席)=デッドボタン。
    const a = assign([0, 2, 3, 4, 5], { smallBlindFixedPos: 1, bigBlindFixedPos: 2 });
    expect(a.bigBlindSeat).toBe(3);
    expect(a.smallBlindSeat).toBe(2);
    expect(a.buttonFixedPos).toBe(1);
    expect(a.buttonIsDead).toBe(true);
  });

  it("produces a dead small blind when the previous big blind just busted", () => {
    // 前のハンド: BTN=0 SB=1 BB=2。BBだった席2のプレイヤーがバスト。
    // BBは次の生存者=3へ、SBは前のBB席=2(空席)=デッドSB、BTNは前のSB席=1。
    const a = assign([0, 1, 3, 4, 5], { smallBlindFixedPos: 1, bigBlindFixedPos: 2 });
    expect(a.bigBlindSeat).toBe(3);
    expect(a.smallBlindSeat).toBeNull();
    expect(a.smallBlindFixedPos).toBe(2);
    expect(a.buttonFixedPos).toBe(1);
    expect(a.buttonIsDead).toBe(false);
  });

  it("does not create a dead seat when the busted player was neither the SB nor the BB", () => {
    // 前のハンド: BTN=0 SB=1 BB=2。UTG(席3)がバスト。BB=4 SB=2 BTN=1 で欠けは出ない。
    const a = assign([0, 1, 2, 4, 5], { smallBlindFixedPos: 1, bigBlindFixedPos: 2 });
    expect(a.bigBlindSeat).toBe(4);
    expect(a.smallBlindSeat).toBe(2);
    expect(a.buttonFixedPos).toBe(1);
    expect(a.buttonIsDead).toBe(false);
  });

  it("assigns SB = button in heads-up play", () => {
    const a = assign([2, 5], { smallBlindFixedPos: 1, bigBlindFixedPos: 2 });
    expect(a.bigBlindSeat).toBe(5);
    expect(a.buttonFixedPos).toBe(2);
    expect(a.smallBlindSeat).toBe(2);
    expect(a.buttonIsDead).toBe(false);
  });

  it("puts BTN/SB/BB on the lowest seats in order on the very first hand", () => {
    const a = assign([0, 1, 2, 3, 4, 5], null);
    expect(a.bigBlindSeat).toBe(0);
    expect(a.smallBlindSeat).toBe(5);
    expect(a.buttonFixedPos).toBe(4);
  });

  it("keeps BTN/SB/BB distinct when the table grows back from heads-up", () => {
    // ヘッズアップ(席0と席3、BB=0/BTN=SB=3)の卓へ席5に1人着席した直後。
    // 前のSB席(=3)をそのままBTNにすると新しいBB(=3)と衝突するので、BBから生存者を遡って置き直す。
    const a = assign([0, 3, 5], { smallBlindFixedPos: 3, bigBlindFixedPos: 0 });
    expect(a.bigBlindSeat).toBe(3);
    expect(a.smallBlindSeat).toBe(0);
    expect(a.buttonFixedPos).toBe(5);
    expect(a.buttonIsDead).toBe(false);
  });

  it("throws with fewer than 2 occupied seats", () => {
    expect(() => assign([0], { smallBlindFixedPos: 5, bigBlindFixedPos: 0 })).toThrow();
  });
});

/**
 * ここからは「回り方」そのものの検証。単発の割り当てが正しくても、ハンドをまたいで回したときに
 * BBを飛ばす人・2回払う人・BTNが一生回ってこない人が出てはいけない。
 */
describe("button/blind rotation over many hands", () => {
  /** バストを指定しながらハンドを回し、各ハンドの割り当て列を返す。 */
  function rotate(params: {
    seatCount: number;
    initialSeats: number[];
    hands: number;
    /** ハンド番号(1始まり)→ そのハンドの終わりにバストする席 */
    bustsAfterHand?: Record<number, number[]>;
  }) {
    const { seatCount, hands } = params;
    let occupied = new Set(params.initialSeats);
    let previous: { smallBlindFixedPos: number; bigBlindFixedPos: number } | null = null;
    const log: { btn: number; sb: number | null; bb: number; live: number[] }[] = [];

    for (let h = 1; h <= hands; h++) {
      if (occupied.size < 2) break;
      const a = computeButtonAssignment({ occupiedSeats: occupied, seatCount, previous });
      log.push({ btn: a.buttonFixedPos, sb: a.smallBlindSeat, bb: a.bigBlindSeat, live: [...occupied].sort((x, y) => x - y) });
      previous = nextPreviousBlinds(a);
      for (const seat of params.bustsAfterHand?.[h] ?? []) {
        const next = new Set(occupied);
        next.delete(seat);
        occupied = next;
      }
    }
    return log;
  }

  it("never makes the same player post the big blind twice in a row", () => {
    const log = rotate({ seatCount: 6, initialSeats: [0, 1, 2, 3, 4, 5], hands: 40, bustsAfterHand: { 3: [4], 7: [1], 12: [0], 20: [5] } });
    for (let i = 1; i < log.length; i++) {
      expect(log[i]!.bb).not.toBe(log[i - 1]!.bb);
    }
  });

  it("gives every live player exactly one big blind per orbit", () => {
    // バスト無し・6人。6ハンド(=1周)で全員がちょうど1回ずつBBを払う。
    const log = rotate({ seatCount: 6, initialSeats: [0, 1, 2, 3, 4, 5], hands: 12 });
    for (const start of [0, 6]) {
      const orbit = log.slice(start, start + 6).map((h) => h.bb);
      expect([...orbit].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5]);
    }
  });

  it("gives every live player the button once per orbit when the table has gaps", () => {
    // 6席の卓に席0・1・3の3人だけが残った状態。以前の実装ではここで席0と席3に
    // BTNが永久に回ってこなかった(空席にBTN/SBが居座り続けた)。
    const log = rotate({ seatCount: 6, initialSeats: [0, 1, 3], hands: 9 });
    // 1ハンド目は基準が無いので初期配置。2ハンド目以降の3ハンド単位で全員に回る。
    for (const start of [1, 4]) {
      const orbit = log.slice(start, start + 3);
      expect(orbit.map((h) => h.btn).sort((a, b) => a - b)).toEqual([0, 1, 3]);
      expect(orbit.map((h) => h.bb).sort((a, b) => a - b)).toEqual([0, 1, 3]);
      expect(orbit.map((h) => h.sb).sort()).toEqual([0, 1, 3]);
    }
  });

  it("clears dead seats within two hands of a bust", () => {
    // 席2(BB)と席1(SB)が続けて落ちても、空席がBTN/SBに現れるのは一時的で、
    // 3ハンド後には全ての席が生存者で埋まる。
    const log = rotate({ seatCount: 6, initialSeats: [0, 1, 2, 3, 4, 5], hands: 10, bustsAfterHand: { 3: [3], 4: [4] } });
    const tail = log.slice(7);
    for (const h of tail) {
      expect(h.live).toContain(h.btn);
      expect(h.sb).not.toBeNull();
      expect(h.live).toContain(h.sb!);
    }
  });

  it("keeps BTN/SB/BB as three consecutive live-or-just-busted seats", () => {
    const log = rotate({ seatCount: 9, initialSeats: [0, 1, 2, 3, 4, 5, 6, 7, 8], hands: 30, bustsAfterHand: { 2: [5], 5: [0], 9: [7], 14: [2], 18: [8] } });
    for (const h of log) {
      if (h.live.length === 2) continue; // ヘッズアップは BTN=SB
      expect(h.btn).not.toBe(h.bb);
      expect(h.btn).not.toBe(h.sb);
      // BTN → SB → BB の間に生存プレイヤーが挟まらない(3席が連続している)
      const between = (from: number, to: number) => {
        const out: number[] = [];
        for (let s = 1; s < 9; s++) {
          const pos = (from + s) % 9;
          if (pos === to) break;
          if (h.live.includes(pos)) out.push(pos);
        }
        return out;
      };
      const sbPos = h.sb ?? (h.bb - 1 + 9) % 9;
      expect(between(h.btn, sbPos)).toEqual([]);
      expect(between(sbPos, h.bb)).toEqual([]);
    }
  });

  it("hands the button and blinds over cleanly when the table drops to heads-up", () => {
    const log = rotate({ seatCount: 6, initialSeats: [0, 1, 2, 3, 4, 5], hands: 20, bustsAfterHand: { 2: [0, 1], 4: [2], 6: [3] } });
    const hu = log.filter((h) => h.live.length === 2);
    expect(hu.length).toBeGreaterThan(0);
    for (const h of hu) {
      expect(h.btn).toBe(h.sb); // ヘッズアップは SB=ボタン
      expect(h.btn).not.toBe(h.bb);
      expect(h.live).toContain(h.btn);
    }
    // ヘッズアップでもBBは交互に移る
    for (let i = 1; i < hu.length; i++) expect(hu[i]!.bb).not.toBe(hu[i - 1]!.bb);
  });
});
