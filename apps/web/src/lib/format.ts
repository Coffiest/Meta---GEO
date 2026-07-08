/** チップ数をbb(ビッグブラインド)表記の文字列に変換する。例: 150, bb=100 → "1.5bb" */
export function formatBb(chips: number, bigBlind: number): string {
  if (!bigBlind) return "0bb";
  const bb = chips / bigBlind;
  const rounded = Math.round(bb * 10) / 10;
  const str = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${str}bb`;
}

/** 符号付きのbb表記(例: "+1.5bb" / "-2bb" / "±0bb")。ハンド履歴の収支表示用。 */
export function formatSignedBb(chips: number, bigBlind: number): string {
  if (!bigBlind) return "±0bb";
  const bb = chips / bigBlind;
  const rounded = Math.round(bb * 10) / 10;
  if (rounded === 0) return "±0bb";
  const sign = rounded > 0 ? "+" : "";
  const str = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${sign}${str}bb`;
}
