import type { PostflopBucket, PreflopBucket } from "@/lib/geoApi";

/**
 * GTO Wizardの実際の配色に合わせたアクションカラー。Fold=青、Call/Check=緑、
 * ベット/レイズはサイズが大きくなるほどオレンジ→赤→血のような濃い赤へ推移し、
 * ジオメトリックサイズ以上は紫、Allinは最も濃い紫にする。
 */
const FOLD_COLOR = "#2F6FED";
const CALL_COLOR = "#3AA655";
const GEOMETRIC_COLOR = "#8E24AA";
const ALLIN_COLOR = "#2D1B69";

export const PREFLOP_BUCKET_COLOR: Record<PreflopBucket, string> = {
  fold: FOLD_COLOR,
  call: CALL_COLOR,
  "raise2-2.5": "#E8821E",
  "raise2.5-3": "#D8342E",
  "raise3-4": "#C81E63",
  "raise4+": "#8E1F52",
  allIn: ALLIN_COLOR,
};

export const POSTFLOP_BUCKET_COLOR: Record<PostflopBucket, string> = {
  fold: FOLD_COLOR,
  checkOrCall: CALL_COLOR,
  "bet20-40": "#E8821E",
  "bet40-60": "#DC5B23",
  "bet60-80": "#D8342E",
  "bet80-100": "#C81E63",
  "bet100+": "#7A1030",
  allIn: ALLIN_COLOR,
};

/**
 * geometricRatio(そのバケットの中でジオメトリックサイズだった割合)が高い場合は
 * サイズ帯の色より優先して紫を返す。Allinは常に最も濃い紫。
 */
export function bucketColor(bucket: string, geometricRatio = 0): string {
  if (bucket === "allIn") return ALLIN_COLOR;
  if (bucket !== "fold" && bucket !== "call" && bucket !== "checkOrCall" && geometricRatio >= 0.5) {
    return GEOMETRIC_COLOR;
  }
  return (
    (PREFLOP_BUCKET_COLOR as Record<string, string>)[bucket] ??
    (POSTFLOP_BUCKET_COLOR as Record<string, string>)[bucket] ??
    "#4b5563"
  );
}
