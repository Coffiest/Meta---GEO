import type { PostflopBucket, PreflopBucket } from "@/lib/geoApi";

/**
 * GEO DATABASEのアクション配色。dataviz skillのvalidate_palette.jsでダーク背景 #0d0d10 に対し
 * 全チェックPASSした8色を「Fold=青→パッシブ=アクア→強度が増す5段階→Allin=オレンジ」の
 * 一貫した並びでプリフロップ/ポストフロップ両方に再利用する(plan参照)。
 */
export const PREFLOP_BUCKET_COLOR: Record<PreflopBucket, string> = {
  fold: "#3987e5",
  call: "#199e70",
  "raise2-2.5": "#c98500",
  "raise2.5-3": "#008300",
  "raise3-4": "#9085e9",
  "raise4+": "#e66767",
  allIn: "#d95926",
};

export const POSTFLOP_BUCKET_COLOR: Record<PostflopBucket, string> = {
  fold: "#3987e5",
  checkOrCall: "#199e70",
  "bet20-40": "#c98500",
  "bet40-60": "#008300",
  "bet60-80": "#9085e9",
  "bet80-100": "#e66767",
  "bet100+": "#d55181",
  allIn: "#d95926",
};

export function bucketColor(bucket: string): string {
  return (
    (PREFLOP_BUCKET_COLOR as Record<string, string>)[bucket] ??
    (POSTFLOP_BUCKET_COLOR as Record<string, string>)[bucket] ??
    "#4b5563"
  );
}
