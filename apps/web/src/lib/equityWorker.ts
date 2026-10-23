// オールインのランアウト中の勝率を、画面の描画を止めないよう別スレッドで計算する。
import { computeAllInEquity, type EquityInput } from "@meta-geo/engine/src/equity.js";

self.onmessage = (e: MessageEvent<{ key: string; input: EquityInput }>) => {
  const map = computeAllInEquity(e.data.input);
  const equity: Record<number, number> = {};
  for (const [seat, v] of map) equity[Number(seat)] = v;
  self.postMessage({ key: e.data.key, equity });
};
