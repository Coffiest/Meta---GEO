import { PREFLOP_BUCKETS, POSTFLOP_BUCKETS, type PostflopBucket, type PreflopBucket } from "@/lib/geoApi";

/**
 * GTO Wizardの実際の配色を再現したアクションカラー(Fold=青、Call/Check=緑、ベット/レイズは
 * サイズが大きくなるほどオレンジ→赤→ローズ→ピンク→フューシャ、Allinは深いインディゴ)。
 * dataviz skillのvalidate_palette.jsで検証済み(暗背景 #0d0d10 に対し、明度帯・彩度下限・
 * CVD分離・コントラストの全チェックを通過)。
 */
const FOLD_COLOR = "#3B82F6";
const CALL_COLOR = "#16A34A";
const ALLIN_COLOR = "#4F46E5";
const GEOMETRIC_COLOR = "#8E24AA";

export const PREFLOP_BUCKET_COLOR: Record<PreflopBucket, string> = {
  fold: FOLD_COLOR,
  call: CALL_COLOR,
  "raise2-2.5": "#EA580C",
  "raise2.5-3": "#DC2626",
  "raise3-4": "#DB2777",
  "raise4+": "#C026D3",
  allIn: ALLIN_COLOR,
};

export const POSTFLOP_BUCKET_COLOR: Record<PostflopBucket, string> = {
  fold: FOLD_COLOR,
  checkOrCall: CALL_COLOR,
  "bet20-40": "#EA580C",
  "bet40-60": "#DC2626",
  "bet60-80": "#F43F5E",
  "bet80-100": "#DB2777",
  "bet100+": "#C026D3",
  allIn: ALLIN_COLOR,
};

/**
 * geometricRatio(そのバケットの中でジオメトリックサイズだった割合)が高い場合は
 * サイズ帯の色より優先して紫を返す。Allinは常にインディゴ。
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

/**
 * バケットの「弱→強」順のインデックス。頻度でなくこの順でセル/バーを並べるために使う
 * (一番激しいアクションを左端に配置する、という表示要件)。未知のバケットは最後尾扱い。
 */
export function bucketOrderIndex(bucket: string): number {
  const preflopIndex = (PREFLOP_BUCKETS as string[]).indexOf(bucket);
  if (preflopIndex !== -1) return preflopIndex;
  const postflopIndex = (POSTFLOP_BUCKETS as string[]).indexOf(bucket);
  if (postflopIndex !== -1) return postflopIndex;
  return 999;
}
