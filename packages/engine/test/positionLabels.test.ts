import { describe, expect, it } from "vitest";
import { computePositionLabels } from "../src/positionLabels.js";

describe("computePositionLabels", () => {
  it("labels a full 6-max ring BTN/SB/BB/UTG/HJ/CO from the blinds", () => {
    const labels = computePositionLabels({
      seatIndexes: [0, 1, 2, 3, 4, 5],
      buttonFixedPos: 0,
      smallBlindSeat: 1,
      bigBlindSeat: 2,
      seatCount: 6,
    });
    expect(labels.get(0)).toBe("BTN");
    expect(labels.get(1)).toBe("SB");
    expect(labels.get(2)).toBe("BB");
    expect(labels.get(3)).toBe("UTG");
    expect(labels.get(4)).toBe("HJ");
    expect(labels.get(5)).toBe("CO");
  });

  it("3-handed: the two seats after the button are always SB and BB (no HJ/CO)", () => {
    // 席が飛び飛び(バスト済みの空席がある)でも、ラベルはブラインド基準。
    const labels = computePositionLabels({
      seatIndexes: [0, 2, 5],
      buttonFixedPos: 5,
      smallBlindSeat: 0,
      bigBlindSeat: 2,
      seatCount: 6,
    });
    expect(labels.get(5)).toBe("BTN");
    expect(labels.get(0)).toBe("SB");
    expect(labels.get(2)).toBe("BB");
    expect([...labels.values()].sort()).toEqual(["BB", "BTN", "SB"]);
  });

  it("4-handed: positions are UTG/BTN/SB/BB (first to act left of BB is UTG)", () => {
    const labels = computePositionLabels({
      seatIndexes: [1, 2, 4, 5],
      buttonFixedPos: 1,
      smallBlindSeat: 2,
      bigBlindSeat: 4,
      seatCount: 6,
    });
    expect(labels.get(1)).toBe("BTN");
    expect(labels.get(2)).toBe("SB");
    expect(labels.get(4)).toBe("BB");
    expect(labels.get(5)).toBe("UTG");
  });

  it("5-handed: UTG and CO fill between BB and BTN", () => {
    const labels = computePositionLabels({
      seatIndexes: [0, 1, 2, 3, 4],
      buttonFixedPos: 0,
      smallBlindSeat: 1,
      bigBlindSeat: 2,
      seatCount: 6,
    });
    expect(labels.get(0)).toBe("BTN");
    expect(labels.get(1)).toBe("SB");
    expect(labels.get(2)).toBe("BB");
    expect(labels.get(3)).toBe("UTG");
    expect(labels.get(4)).toBe("CO");
  });

  it("heads-up: button doubles as small blind and is labeled BTN(SB)", () => {
    const labels = computePositionLabels({
      seatIndexes: [1, 4],
      buttonFixedPos: 4,
      smallBlindSeat: 4,
      bigBlindSeat: 1,
      seatCount: 6,
    });
    expect(labels.get(4)).toBe("BTN(SB)");
    expect(labels.get(1)).toBe("BB");
  });

  it("dead small blind: nobody is labeled SB that hand", () => {
    // SB予定席のプレイヤーが直前にバスト → SBデッド(smallBlindSeat=null)。
    const labels = computePositionLabels({
      seatIndexes: [0, 2, 3, 5],
      buttonFixedPos: 0,
      smallBlindSeat: null,
      bigBlindSeat: 2,
      seatCount: 6,
    });
    expect(labels.get(0)).toBe("BTN");
    expect(labels.get(2)).toBe("BB");
    expect([...labels.values()]).not.toContain("SB");
    // BBの左隣から順にUTG、ボタンの右隣がCO。
    expect(labels.get(3)).toBe("UTG");
    expect(labels.get(5)).toBe("CO");
  });

  it("dead button: the button position is an empty seat and nobody is labeled BTN", () => {
    const labels = computePositionLabels({
      seatIndexes: [1, 2, 3, 5],
      buttonFixedPos: 0, // 席0は空席(デッドボタン)
      smallBlindSeat: 1,
      bigBlindSeat: 2,
      seatCount: 6,
    });
    expect(labels.get(1)).toBe("SB");
    expect(labels.get(2)).toBe("BB");
    expect([...labels.values()]).not.toContain("BTN");
    expect(labels.get(3)).toBe("UTG");
    expect(labels.get(5)).toBe("CO");
  });
});
