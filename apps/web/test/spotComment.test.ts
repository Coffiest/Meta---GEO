import { describe, expect, it } from "vitest";
import type { BetSizeClass } from "@meta-geo/engine/src/review/betRole.js";
import {
  judgeAfterCheckRaise,
  judgeCheckRaise,
  judgeDonk,
  judgeProbe,
  type ProbeCard,
} from "@meta-geo/engine/src/review/spotPlans.js";
import type { SpotVerdict } from "@meta-geo/engine/src/review/strategyVerdict.js";
import { CHECK_RAISE_BODY, DONK_BODY, PROBE_BODY } from "../src/data/spotTables";
import { spotComment } from "../src/lib/spotComment";

/**
 * プローブ・ドンク・チェックレイズのバリィの台詞。
 *  - どの場面・どの手・どの行動でも台詞が出る(空にならない・口調が崩れない)
 *  - 全ての場合分けを通っている
 *  - ノートの手の選び方・サイズ・頻度が解説に入っている
 */

const BOARDS = [
  ["9c", "8d", "2h", "3s", "Kd"], // ローボード(有利)
  ["Ks", "8d", "3c", "8h", "2s"], // ターンリピート
  ["Ks", "8s", "3c", "2s", "5h"], // フラッシュ完成のターン
  ["Kc", "9d", "5h", "7s", "2c"], // ストレート完成のターン
  ["Ks", "8d", "3c", "Ah", "2c"], // Aのターン
  ["Qs", "7d", "2c", "Kh", "3s"], // A以外のオーバーカード(不利)
  ["Kd", "7c", "2h", "5s", "9d"], // ドライなKハイ
  ["9d", "9c", "4h", "Ks", "2d"], // ペアボード
  ["Js", "Th", "3c", "2d", "5s"], // ドライなJTハイ
  ["Kh", "8h", "3h", "2d", "5s"], // モノトーン
  ["9s", "8s", "7d", "Kc", "3h"], // ストレート完成ボード
  ["As", "7h", "2d", "Kc", "9s"], // 何も起きないリバー
  ["6s", "5h", "2d", "Kc", "6c"], // リバーでペア(ナッツが変化)
];

const HOLES = [
  ["Ah", "Kd"], ["8h", "7h"], ["7d", "7s"], ["Ts", "9s"], ["Js", "Ts"], ["Qh", "Jh"], ["Ah", "5h"],
  ["9s", "Ah"], ["9s", "5h"], ["3h", "3d"], ["Kd", "Qc"], ["6h", "4h"], ["2c", "2d"], ["Ac", "Qc"], ["5c", "4c"],
];

const SIZES: (BetSizeClass | null)[] = ["block", "small", "medium", "large", "overbet"];
const STREETS = ["flop", "turn", "river"] as const;

function allVerdicts(): { v: SpotVerdict; board: string[] }[] {
  const out: { v: SpotVerdict; board: string[] }[] = [];
  const push = (v: SpotVerdict | null, board: string[]) => v && out.push({ v, board });
  for (const board of BOARDS) {
    for (const hole of HOLES) {
      if (hole.some((c) => board.includes(c))) continue;
      for (const street of STREETS) {
        push(judgeDonk(street, hole, board, "srp", null), board);
        push(judgeDonk(street, hole, board, "threeBet", null), board);
        for (const size of SIZES) push(judgeDonk(street, hole, board, "srp", { size }), board);
        for (const spr of [8, 2]) {
          push(judgeCheckRaise(street, hole, board, { kind: "call" }, spr), board);
          push(judgeCheckRaise(street, hole, board, { kind: "fold" }, spr), board);
          for (const size of SIZES) push(judgeCheckRaise(street, hole, board, { kind: "raise", size, isAllIn: false }, spr), board);
        }
        if (street !== "flop") {
          push(judgeProbe(street, hole, board, null), board);
          for (const [size, f] of [["block", 0.33], ["small", 0.5], ["large", 1.0], ["overbet", 1.6]] as const) {
            push(judgeProbe(street, hole, board, { size, f, spr: 4, isAllIn: false }), board);
          }
        }
      }
      push(judgeAfterCheckRaise(hole, board, null), board);
      for (const size of SIZES) push(judgeAfterCheckRaise(hole, board, { size }), board);
    }
  }
  return out;
}

describe("プローブ・ドンク・チェックレイズのバリィの台詞", () => {
  const all = allVerdicts();

  it("全ての場合分けを通っている", () => {
    const seen = new Set(all.map(({ v }) => `${v.kind}:${v.situation}`));
    const expected = [
      "probe:betOk", "probe:betOtherSize", "probe:betSizeOff", "probe:betNotListed", "probe:betRepeat",
      "probe:checkRepeatOk", "probe:checkNotListedOk", "probe:checkListedLowFreqOk", "probe:checkListedMissed",
      "donk:betGood", "donk:betGoodTooBig", "donk:betNoFit", "donk:betNoReason", "donk:betNoReasonTurnDraw",
      "donk:betNoReasonRiverBlock", "donk:betNoReasonRag", "donk:checkShouldDonk", "donk:checkOkNoFit", "donk:checkOkNoReason",
      "checkRaise:raiseOk", "checkRaise:raiseSizeOff", "checkRaise:raiseValueCall", "checkRaise:raiseNotListed",
      "checkRaise:raiseMonotone", "checkRaise:callRaiseHand", "checkRaise:callValueCallOk", "checkRaise:foldValue",
      "checkRaise:foldBluff", "checkRaise:callNotListed", "checkRaise:foldNotListed",
      "afterCheckRaise:checkRangeOk", "afterCheckRaise:betRangeCheck", "afterCheckRaise:betFlushOk",
      "afterCheckRaise:betFlushSize", "afterCheckRaise:checkFlush", "afterCheckRaise:betOk", "afterCheckRaise:betSizeOff",
      "afterCheckRaise:checkValueOk", "afterCheckRaise:checkBluff", "afterCheckRaise:betNotListed",
      "afterCheckRaise:checkNotListedOk",
    ];
    for (const e of expected) expect(seen.has(e), e).toBe(true);
  });

  it("どの場合でも台詞が出て、バリィの口調(です・ます調を使わない)", () => {
    for (const { v, board } of all) {
      const c = spotComment(v, board);
      const where = `${v.kind}/${v.situation}`;
      expect(c.summary.length, where).toBeGreaterThan(20);
      expect(/です|ます|ください|undefined|null/.test(c.summary), `${where}: ${c.summary}`).toBe(false);
      expect(c.points.length, where).toBeGreaterThan(2);
      expect(c.points.every((p) => p.text.length > 0), where).toBe(true);
    }
  });

  it("ずれた手は、どうするべきかまで言う", () => {
    const shouldFix = new Set([
      "betOtherSize", "betSizeOff", "betNotListed", "betRepeat", "betGoodTooBig", "betNoReason", "betNoReasonTurnDraw",
      "betNoReasonRiverBlock", "betNoReasonRag", "checkShouldDonk", "raiseSizeOff", "raiseValueCall", "raiseNotListed",
      "raiseMonotone", "foldValue", "foldBluff", "betRangeCheck", "betFlushSize", "checkFlush", "checkBluff",
    ]);
    for (const { v, board } of all) {
      if (!shouldFix.has(v.situation)) continue;
      const s = spotComment(v, board).summary;
      expect(/うね|基本なんだ/.test(s), `${v.kind}/${v.situation}: ${s}`).toBe(true);
    }
  });

  it("ノートの手の選び方・サイズ・頻度が、詳細の本文に入っている", () => {
    for (const phrase of [
      "TPTK以外のTP、2P、ガットショットで50%", "ミドル〜ボトムヒット、アンダーペア、セット、OESDで33%",
      "2P以上、ガットショット、ボトムヒットで2e", "2P以上、OESD、ガットショット、ボトムヒットで2e",
      "乱数で2回に1回", "TPもベットに含む", "頻度30%", "頻度10%", "頻度は20%", "レンジでチェック",
    ]) {
      expect(PROBE_BODY, phrase).toContain(phrase);
    }
    for (const phrase of [
      "バリューの取り逃し回避", "フロップのローボード、コネクトボード", "ターンリピート", "3betPotのロー1枚ストレートボード",
      "ドローで安くベット", "2Pでダブルバレルを打たれて", "純粋なリバーブロックベット", "リピートボード以外で打つ",
      "血迷った謎ドンク", "マージナルベッター",
    ]) {
      expect(DONK_BODY, phrase).toContain(phrase);
    }
    for (const phrase of [
      "頻度10%で小さくレイズ", "キッカーが強いトリップスを半分チェックレイズに回し", "全てのダブルバックドア", "6ポケ",
      "上のストレートでレイズ、下のストレートでコール", "全てのコンボドロー", "全てのナッツフラッシュドロー",
      "レインボーボード", "頻度10%でポットレイズ", "全てのセットとツーペア", "全てのオープンエンドストドロ",
      "ダブルバックドアの付いたボトムヒット", "頻度5%で小さくレイズ", "パッシブ", "チェックレイズサイズは50%",
      "ドライなKハイ、Qハイのみ100%レイズ", "相手のCBサイズが上がるほど", "最低でも頻度15%", "エクイティの放棄",
      "ワンペアくらいで頻繁にチェックレイズ",
    ]) {
      expect(CHECK_RAISE_BODY, phrase).toContain(phrase);
    }
  });

  it("プローブの頻度は、有利/不利ボードで出し分ける(不利ボードのA以外のオーバーカードは記載なし)", () => {
    const card: ProbeCard = "overcard";
    const v = judgeProbe("turn", ["Jh", "Jd"], ["Qs", "7d", "2c", "Kh", "3s"], null)!;
    expect(v.card).toBe(card);
    expect(spotComment(v, ["Qs", "7d", "2c", "Kh", "3s"]).summary).toContain("ノートに記載が無い");
  });
});
