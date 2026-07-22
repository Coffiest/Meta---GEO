import { PREFLOP_BUCKETS, POSTFLOP_BUCKETS, type PostflopBucket, type PreflopBucket } from "@/lib/geoApi";

/**
 * アクションカラー。紫はAllinだけの特別色として予約し、ベット/レイズはサイズが大きくなるほど
 * オレンジ → 赤 → 濃い赤 → 血のような暗赤 と、赤系のまま深くなる:
 *   Fold=ブルー / Call・Check=グリーン /
 *   Small=オレンジ → Medium=レッド → Large=ダークレッド → Overbet=ブラッドレッド、
 *   Allin=ディープパープル(紫はここのみ)。
 */
const FOLD_COLOR = "#4C86C6"; // ブルー(Fold)
const CALL_COLOR = "#57A64A"; // グリーン(Call/Check)
const ALLIN_COLOR = "#4A1D96"; // ディープパープル(Allin専用。他では紫を使わない)
/** ジオメトリックサイズの強調色。紫はAllin専用のため、深いティールで区別する。 */
const GEOMETRIC_COLOR = "#0F766E";

// サイズ帯の色(小→大で赤が深くなる)。
const SMALL_ORANGE = "#E8823C";
const RAISE_RED = "#E15361";
const MEDIUM_RED = "#C62F3B";
const LARGE_DARK_RED = "#8E1B1B";
const OVERBET_BLOOD_RED = "#5E0B0B";

export const PREFLOP_BUCKET_COLOR: Record<PreflopBucket, string> = {
  fold: FOLD_COLOR,
  call: CALL_COLOR,
  "raise2-2.5": SMALL_ORANGE,
  "raise2.5-3": MEDIUM_RED,
  "raise3-4": LARGE_DARK_RED,
  "raise4+": OVERBET_BLOOD_RED,
  allIn: ALLIN_COLOR,
};

export const POSTFLOP_BUCKET_COLOR: Record<PostflopBucket, string> = {
  fold: FOLD_COLOR,
  checkOrCall: CALL_COLOR,
  "bet20-40": SMALL_ORANGE,
  "bet40-60": RAISE_RED,
  "bet60-80": MEDIUM_RED,
  "bet80-100": LARGE_DARK_RED,
  "bet100+": OVERBET_BLOOD_RED,
  allIn: ALLIN_COLOR,
};

/**
 * geometricRatio(そのバケットの中でジオメトリックサイズだった割合)が高い場合は
 * サイズ帯の色より優先してティールを返す。Allinは常にディープパープル(紫はAllin専用)。
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
