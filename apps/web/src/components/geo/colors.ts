import { PREFLOP_BUCKETS, POSTFLOP_BUCKETS, type PostflopBucket, type PreflopBucket } from "@/lib/geoApi";

/**
 * 各バケットの色相/彩度。明度(L)はバケット表(弱→強)の並び順から機械的に算出し、
 * Fold(左端)を最も明るく、Allin(右端)を最も暗くする。以前は色ごとに個別の16進値を
 * 手で割り当てていたため、中間の小さいレイズ(オレンジ系)がCallの緑より明るくなってしまい、
 * 「セル内で強いアクションの方が左側の色より明るく見える」逆転が起きていた。
 * 頻度の混合比に関わらず明度が単調に減少するようにして、この見た目の逆転を構造的に防ぐ。
 */
const HUE_SAT: Record<string, { h: number; s: number }> = {
  fold: { h: 217, s: 82 },
  call: { h: 150, s: 45 },
  checkOrCall: { h: 150, s: 45 },
  "raise2-2.5": { h: 38, s: 88 },
  "bet20-40": { h: 38, s: 88 },
  "raise2.5-3": { h: 22, s: 82 },
  "bet40-60": { h: 22, s: 82 },
  "raise3-4": { h: 8, s: 78 },
  "bet60-80": { h: 8, s: 78 },
  "raise4+": { h: 355, s: 75 },
  "bet80-100": { h: 355, s: 75 },
  "bet100+": { h: 340, s: 72 },
  allIn: { h: 322, s: 60 },
};

/** 明度の単調減少レンジ。左端(Fold)は白文字とのコントラストを保てる範囲でできるだけ明るく。 */
const LIGHTNESS_MAX = 58;
const LIGHTNESS_MIN = 15;

/** ジオメトリックサイズ(ポットに対して幾何級数的なベットサイズ)を示す固定の強調色。強さのランプとは独立。 */
const GEOMETRIC_COLOR = "#8E24AA";

function lightnessForIndex(index: number, stepCount: number): number {
  if (stepCount <= 1) return LIGHTNESS_MAX;
  const ratio = index / (stepCount - 1);
  return LIGHTNESS_MAX - ratio * (LIGHTNESS_MAX - LIGHTNESS_MIN);
}

function rampColor(bucket: string, order: readonly string[]): string {
  const hs = HUE_SAT[bucket] ?? { h: 0, s: 0 };
  const index = order.indexOf(bucket);
  const l = lightnessForIndex(index === -1 ? order.length - 1 : index, order.length);
  return `hsl(${hs.h}deg ${hs.s}% ${l}%)`;
}

export const PREFLOP_BUCKET_COLOR: Record<PreflopBucket, string> = Object.fromEntries(
  PREFLOP_BUCKETS.map((b) => [b, rampColor(b, PREFLOP_BUCKETS)]),
) as Record<PreflopBucket, string>;

export const POSTFLOP_BUCKET_COLOR: Record<PostflopBucket, string> = Object.fromEntries(
  POSTFLOP_BUCKETS.map((b) => [b, rampColor(b, POSTFLOP_BUCKETS)]),
) as Record<PostflopBucket, string>;

/**
 * geometricRatio(そのバケットの中でジオメトリックサイズだった割合)が高い場合は
 * サイズ帯の色より優先して紫を返す。それ以外は弱→強の明度ランプ通りの色を返す
 * (Fold/Callは明るく、Allinに近づくほど暗くなる)。
 */
export function bucketColor(bucket: string, geometricRatio = 0): string {
  if (bucket !== "allIn" && bucket !== "fold" && bucket !== "call" && bucket !== "checkOrCall" && geometricRatio >= 0.5) {
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
 * (一番激しいアクションを右端に配置する、という表示要件)。未知のバケットは最後尾扱い。
 */
export function bucketOrderIndex(bucket: string): number {
  const preflopIndex = (PREFLOP_BUCKETS as string[]).indexOf(bucket);
  if (preflopIndex !== -1) return preflopIndex;
  const postflopIndex = (POSTFLOP_BUCKETS as string[]).indexOf(bucket);
  if (postflopIndex !== -1) return postflopIndex;
  return 999;
}
