import { describe, expect, it } from "vitest";
import {
  judgeBarrel,
  type BarrelCard,
  type BarrelVerdict,
} from "@meta-geo/engine/src/review/barrelPlan.js";
import type { BetSizeClass } from "@meta-geo/engine/src/review/betRole.js";
import { BARREL_TABLE, DOUBLE_BARREL_BODY } from "../src/data/barrelTable";
import { barrelComment } from "../src/lib/barrelComment";

/**
 * ダブル/トリプルバレルのバリィの台詞。
 *
 * 見ること:
 *  - どの場合分けでも台詞が出る(空にならない・口調が崩れない)
 *  - ずれた手では「どうするべきか」(表のサイズ or チェック)まで言う
 *  - ノートのハンド選定とサイズ選定が1つも落ちていない
 */

// 例のフロップ K♥8♦3♥ に、カードの種類ごとのターン/リバー。
const BOARDS: Record<BarrelCard, { turn: string[]; river: string[] }> = {
  overcard: { turn: ["Kh", "8d", "3h", "As", "2c"], river: ["Kh", "8d", "3h", "6s", "Ac"] },
  paired: { turn: ["Kh", "8d", "3h", "8s", "2c"], river: ["Kh", "8d", "3h", "6s", "8c"] },
  flush: { turn: ["Kh", "8d", "3h", "Jh", "2c"], river: ["Kh", "8d", "3h", "6s", "2h"] },
  rag: { turn: ["Kh", "8d", "3h", "6s", "2c"], river: ["Kh", "8d", "3h", "6s", "Qd"] },
};

// いろいろな強さの手(役・ドロー・ハイカード)。
const HOLES = [
  ["Kc", "Ks"], ["8c", "8s"], ["3c", "3s"], ["Ad", "Td"], ["Ad", "5c"], ["Kd", "Jc"], ["Kd", "Tc"], ["Kd", "5c"],
  ["Qc", "Jc"], ["9h", "7h"], ["Th", "4c"], ["Kd", "Th"], ["7h", "6h"], ["Ah", "5h"], ["Ac", "4d"], ["Ac", "Qd"],
  ["9c", "7c"], ["6c", "5d"], ["Qs", "Qd"], ["8h", "7c"], ["5c", "4c"], ["Jd", "Tc"],
];
const SIZES: BetSizeClass[] = ["block", "small", "medium", "large", "overbet"];

function allVerdicts(): { v: BarrelVerdict; board: string[] }[] {
  const out: { v: BarrelVerdict; board: string[] }[] = [];
  for (const card of Object.keys(BOARDS) as BarrelCard[]) {
    for (const street of ["turn", "river"] as const) {
      const board = BOARDS[card][street];
      for (const hole of HOLES) {
        if (hole.some((c) => board.includes(c))) continue;
        const check = judgeBarrel(street, hole, board, { kind: "check" });
        if (check) out.push({ v: check, board });
        for (const size of SIZES) {
          const bet = judgeBarrel(street, hole, board, { kind: "bet", size });
          if (bet) out.push({ v: bet, board });
        }
      }
    }
  }
  return out;
}

describe("ダブル/トリプルバレルのバリィの台詞", () => {
  const all = allVerdicts();

  it("テストの局面は、全ての場合分けとカードの種類を通っている", () => {
    const situations = new Set(all.map(({ v }) => v.situation));
    expect([...situations].sort()).toEqual(
      [
        "betAir",
        "betCheckHand",
        "betOk",
        "betShowdown",
        "betTooBig",
        "betTooSmall",
        "checkAirOk",
        "checkBluff",
        "checkHandOk",
        "checkMixedOk",
        "checkShowdownOk",
        "checkValue",
      ].sort()
    );
    expect(new Set(all.map(({ v }) => `${v.street}:${v.card}`)).size).toBe(8);
  });

  it("どの場合でも台詞が出て、バリィの口調(です・ます調を使わない)", () => {
    for (const { v, board } of all) {
      const c = barrelComment(v, board);
      const where = `${v.street}/${v.card}/${v.handKey}/${v.situation}`;
      expect(c.summary.length, where).toBeGreaterThan(20);
      expect(/です|ます|ください|undefined|null/.test(c.summary), `${where}: ${c.summary}`).toBe(false);
    }
  });

  it("ずれた手は「どうするべきか」まで言う(サイズ違い・打ち逃しは表のサイズ、打たない手はチェック)", () => {
    for (const { v, board } of all) {
      const c = barrelComment(v, board);
      const size = BARREL_TABLE[v.card].size;
      const where = `${v.street}/${v.card}/${v.handKey}/${v.situation}: ${c.summary}`;
      if (["betTooSmall", "betTooBig", "checkValue", "checkBluff"].includes(v.situation)) {
        expect(c.summary.includes(`${size}で打とうね`), where).toBe(true);
      }
      if (["betCheckHand", "betShowdown", "betAir"].includes(v.situation)) {
        expect(/チェック/.test(c.summary), where).toBe(true);
      }
    }
  });

  it("打たない手をチェックしたら褒める", () => {
    for (const { v, board } of all) {
      if (!v.situation.endsWith("Ok") || v.action !== "check") continue;
      expect(/ナイス|いい判断/.test(barrelComment(v, board).summary)).toBe(true);
    }
  });

  it("落ちたカードの名前と、その行のノートの打ち方(サイズ・バリュー・ブラフ・チェック)が必ず出る", () => {
    const v = judgeBarrel("turn", ["8c", "8s"], BOARDS.rag.turn, { kind: "check" })!;
    const c = barrelComment(v, BOARDS.rag.turn);
    expect(c.summary).toContain("ラグ(6♠)が落ちたターン");
    expect(c.points.map((p) => p.label)).toEqual(["サイズ", "バリュー", "ブラフ", "チェック"]);
    const o = judgeBarrel("turn", ["8c", "8s"], BOARDS.overcard.turn, { kind: "check" })!;
    expect(barrelComment(o, BOARDS.overcard.turn).points.map((p) => p.label)).toEqual(["サイズ", "方針", "バリュー", "ブラフ", "チェック"]);
    expect(c.points[0]!.text).toContain("180%");
    const r = judgeBarrel("river", ["9c", "7c"], BOARDS.rag.river, { kind: "check" })!;
    expect(barrelComment(r, BOARDS.rag.river).points.map((p) => p.label)).toContain("リバー");
  });

  it("ノートのハンド選定とサイズ選定が1つも落ちていない(詳細の本文に全カードぶん入っている)", () => {
    const notion = [
      // オーバーカード
      "頻度50%、75%ベット。ポラライズ戦略", "強いワンペア以上とドロー", "セット、ツーペア、AT以上のトップペア",
      "全てのガットショットと一部のフラッシュドロー", "半分くらいチェックレンジに残す", "Qハイ、Jハイ", "トップセット",
      // ペアカード
      "トリップス以上とドロー", "フルハウス、トリップス、KT以上のトップペア", "ナッツのフルハウス",
      "全てのフラッシュドロー、キッカーの弱いA〜Tハイ", "Tハイ以下は任意",
      // フラッシュ完成カード
      "頻度50%、サイズ50%ベット", "弱いフラッシュ、一部のセット、全てのツーペア、キッカーの強いトップヒット",
      "強いフラッシュ、ワンペア以上のフラッシュドロー", "全てのストレートドロー、ペアなしのフラッシュドロー。ピュアブラフはしない",
      // ラグ
      "頻度50%、180%ベット", "トップセット以外の全てのセット、ツーペア、キッカーが強いトップペア(例ならKJ以上)",
      "キッカーが弱いA・Q・Jハイ",
      // トリプルバレル
      "トリプルバレル", "ダブルバレルと全く同じ",
    ];
    for (const phrase of notion) expect(DOUBLE_BARREL_BODY, phrase).toContain(phrase);
  });
});
