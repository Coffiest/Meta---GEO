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

/**
 * 卓上の金額表示モード。bb=ビッグブラインド換算 / chips=素の点数(チップ)。
 * トーナメントでは点数でスタックを把握したい場面があるため、自席スタックのタップで切り替える。
 */
export type AmountDisplayMode = "bb" | "chips";

/** チップ数を点数表記の文字列に変換する。例: 20400 → "20,400" */
export function formatChips(chips: number): string {
  return Math.round(chips).toLocaleString("en-US");
}

/** 表示モードに応じたbb/点数表記。卓上の金額表示(ポット/ベット/スタック)を一括で切り替える。 */
export function formatAmount(chips: number, bigBlind: number, mode: AmountDisplayMode): string {
  return mode === "chips" ? formatChips(chips) : formatBb(chips, bigBlind);
}

/** 符号付きの表示モード対応表記(例: "+1.5bb" / "+2,400")。ポット獲得バッジ用。 */
export function formatSignedAmount(chips: number, bigBlind: number, mode: AmountDisplayMode): string {
  if (mode !== "chips") return formatSignedBb(chips, bigBlind);
  const rounded = Math.round(chips);
  if (rounded === 0) return "±0";
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded.toLocaleString("en-US")}`;
}
