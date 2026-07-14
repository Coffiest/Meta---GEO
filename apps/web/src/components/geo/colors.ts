import { PREFLOP_BUCKETS, POSTFLOP_BUCKETS, type PostflopBucket, type PreflopBucket } from "@/lib/geoApi";

/**
 * GTO Wizardの配色に合わせたアクションカラー。ユーザー提供のGTO Wizardスクリーンショット
 * (Actions凡例)から色を採取して一致させている:
 *   Fold=ブルー / Call・Check=グリーン / Raise=レッド /
 *   Small=オレンジ → Medium=クリムゾン → Large=マゼンタ → Overbet=パープル、Allin=ディープパープル。
 * ベット/レイズはサイズが大きくなるほど オレンジ→赤→クリムゾン→マゼンタ→パープル と暖色から寒色へ推移。
 */
const FOLD_COLOR = "#4C86C6"; // ブルー(Fold)
const CALL_COLOR = "#57A64A"; // グリーン(Call/Check)
const ALLIN_COLOR = "#4A1D96"; // ディープパープル(Allin)
const GEOMETRIC_COLOR = "#8E24AA";

// GTO Wizard凡例のサイズ色。
const SMALL_ORANGE = "#E8823C";
const RAISE_RED = "#E15361";
const MEDIUM_CRIMSON = "#D42D6B";
const LARGE_MAGENTA = "#A32BA0";
const OVERBET_PURPLE = "#6D2BB0";

export const PREFLOP_BUCKET_COLOR: Record<PreflopBucket, string> = {
  fold: FOLD_COLOR,
  call: CALL_COLOR,
  "raise2-2.5": SMALL_ORANGE,
  "raise2.5-3": MEDIUM_CRIMSON,
  "raise3-4": LARGE_MAGENTA,
  "raise4+": OVERBET_PURPLE,
  allIn: ALLIN_COLOR,
};

export const POSTFLOP_BUCKET_COLOR: Record<PostflopBucket, string> = {
  fold: FOLD_COLOR,
  checkOrCall: CALL_COLOR,
  "bet20-40": SMALL_ORANGE,
  "bet40-60": RAISE_RED,
  "bet60-80": MEDIUM_CRIMSON,
  "bet80-100": LARGE_MAGENTA,
  "bet100+": OVERBET_PURPLE,
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
