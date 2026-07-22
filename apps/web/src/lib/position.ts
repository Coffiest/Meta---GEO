import type { PublicHandState } from "@meta-geo/engine";
// 値のimportはバレル(index)経由にしない: index.tsがdeck.ts(node:crypto)を巻き込み、
// クライアントバンドルのビルドが失敗するため、直接ファイルを指定する(他のweb内importと同じ流儀)。
import { computePositionLabels } from "@meta-geo/engine/src/positionLabels.js";

/**
 * 現在のハンド状態から、席番号→ポジション名(BTN/SB/BB/UTG/HJ/CO...)のマップを作る。
 *
 * ポジション名は固定席オフセットではなく実際のブラインド位置から決める(エンジンの
 * computePositionLabels に委譲):
 * - ボタンの後ろ2席は必ずSB・BB。BBの左隣(最初にアクションする人)がUTG。
 * - ヘッズアップはボタンがSBを兼ねるため「BTN(SB)」表記。
 * - デッドボタンのハンドは誰もBTNを持たず、SBデッドのハンドは誰もSBを持たない。
 * ハンドに参加していない席(バスト済み等)はマップに含まれない(空文字表示にする)。
 */
export function positionLabelsForState(state: PublicHandState, seatCount: number): Map<number, string> {
  return computePositionLabels({
    seatIndexes: state.seats.map((s) => s.seatIndex),
    buttonFixedPos: state.buttonFixedPos,
    smallBlindSeat: state.smallBlindSeat,
    bigBlindSeat: state.bigBlindSeat,
    seatCount,
  });
}
