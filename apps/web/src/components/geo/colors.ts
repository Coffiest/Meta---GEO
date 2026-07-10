import { PREFLOP_BUCKETS, POSTFLOP_BUCKETS, type PostflopBucket, type PreflopBucket } from "@/lib/geoApi";

/**
 * 各バケットの色相/彩度(OKLCH)。明度(L)はバケット表(弱→強)の並び順から機械的に算出し、
 * Fold(左端)を最も明るく、Allinに近づくほど暗くする。
 *
 * 以前はHSLで明度を割り当てていたが、HSLの"L"は色相をまたぐと知覚輝度と一致しない
 * (人間の目は同じHSL明度でもオレンジ/黄色を青よりずっと明るく感じる)。そのため
 * Fold(青, HSL L58%)よりCallの次に弱いRaise(オレンジ, HSL L44%)の方が実際には明るく見え、
 * 「セル内で強いアクションの方が薄い色に見える」逆転が起きていた。OKLCHのLは
 * 知覚的に均一(色相が変わってもLが同じなら同じ明るさに見える)なので、ここでLだけを
 * 単調減少させれば、色相をまたいでも必ず右(強いアクション)ほど暗く見えるようになる。
 */
const HUE_CHROMA: Record<string, { h: number; c: number }> = {
  fold: { h: 250, c: 0.14 },
  call: { h: 150, c: 0.13 },
  checkOrCall: { h: 150, c: 0.13 },
  "raise2-2.5": { h: 55, c: 0.15 },
  "bet20-40": { h: 55, c: 0.15 },
  "raise2.5-3": { h: 35, c: 0.16 },
  "bet40-60": { h: 38, c: 0.16 },
  "raise3-4": { h: 20, c: 0.16 },
  "bet60-80": { h: 25, c: 0.16 },
  "raise4+": { h: 10, c: 0.15 },
  "bet80-100": { h: 12, c: 0.15 },
  "bet100+": { h: 5, c: 0.14 },
  allIn: { h: 330, c: 0.1 },
};

/** 知覚明度(OKLCH L, %)の単調減少レンジ。左端(Fold)は白文字とのコントラストを保てる範囲でできるだけ明るく。 */
const LIGHTNESS_MAX = 72;
const LIGHTNESS_MIN = 20;

/** ジオメトリックサイズ(ポットに対して幾何級数的なベットサイズ)を示す固定の強調色。強さのランプとは独立。 */
const GEOMETRIC_COLOR = "#8E24AA";

function lightnessForIndex(index: number, stepCount: number): number {
  if (stepCount <= 1) return LIGHTNESS_MAX;
  const ratio = index / (stepCount - 1);
  return LIGHTNESS_MAX - ratio * (LIGHTNESS_MAX - LIGHTNESS_MIN);
}

function rampColor(bucket: string, order: readonly string[]): string {
  const hc = HUE_CHROMA[bucket] ?? { h: 0, c: 0 };
  const index = order.indexOf(bucket);
  const l = lightnessForIndex(index === -1 ? order.length - 1 : index, order.length);
  return `oklch(${l}% ${hc.c} ${hc.h}deg)`;
}

export const PREFLOP_BUCKET_COLOR: Record<PreflopBucket, string> = Object.fromEntries(
  PREFLOP_BUCKETS.map((b) => [b, rampColor(b, PREFLOP_BUCKETS)]),
) as Record<PreflopBucket, string>;

export const POSTFLOP_BUCKET_COLOR: Record<PostflopBucket, string> = Object.fromEntries(
  POSTFLOP_BUCKETS.map((b) => [b, rampColor(b, POSTFLOP_BUCKETS)]),
) as Record<PostflopBucket, string>;

/**
 * geometricRatio(そのバケットの中でジオメトリックサイズだった割合)が高い場合は
 * サイズ帯の色より優先して紫を返す。それ以外は弱→強の知覚明度ランプ通りの色を返す
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
