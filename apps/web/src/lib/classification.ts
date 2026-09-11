/**
 * 分類(9段階)の表示メタ情報(クライアント側)。packages/db の reviewClassify.ts と対応させる。
 * web は @meta-geo/db に依存しないため、表示用のラベル/色/グリフはここで再定義する。
 * 色はチェスドットコム風のデータ可視化配色(絵文字は使わず、SVGの色付き丸バッジに用いる)。
 */

export type Classification =
  | "artistic"
  | "best"
  | "great"
  | "excellent"
  | "good"
  | "book"
  | "inaccuracy"
  | "mistake"
  | "blunder";

export interface ClassificationMeta {
  label: string;
  /** バッジ内のグリフ(記号)。空文字ならアイコン形状のみ。 */
  glyph: string;
  color: string;
}

export const CLASSIFICATION_META: Record<Classification, ClassificationMeta> = {
  artistic: { label: "芸術的", glyph: "!!", color: "#14b8a6" },
  best: { label: "最善", glyph: "★", color: "#22a06b" },
  great: { label: "素晴らしい", glyph: "!", color: "#3b82f6" },
  excellent: { label: "良手", glyph: "", color: "#34a853" },
  // 「好手」は「良手」に統合(ラベル・色を excellent に揃える)。個別バッジも同一表示になる。
  good: { label: "良手", glyph: "", color: "#34a853" },
  book: { label: "常識", glyph: "", color: "#a97142" },
  inaccuracy: { label: "緩手", glyph: "?!", color: "#f2c744" },
  mistake: { label: "悪手", glyph: "?", color: "#ef8a3c" },
  blunder: { label: "大悪手", glyph: "??", color: "#e5484d" },
};

export const CLASSIFICATION_ORDER: Classification[] = [
  "artistic",
  "best",
  "great",
  "excellent",
  "good",
  "book",
  "inaccuracy",
  "mistake",
  "blunder",
];

/**
 * 表示上の分類順。「好手」(good)は「良手」(excellent)へ統合するため除外する。
 * カウント表示では good の件数を excellent に合算する({@link displayCount})。
 */
export const DISPLAY_CLASSIFICATION_ORDER: Classification[] = [
  "artistic",
  "best",
  "great",
  "excellent",
  "book",
  "inaccuracy",
  "mistake",
  "blunder",
];

/** 表示用の件数。excellent は good を合算した「良手」の合計を返す。 */
export function displayCount(counts: Record<Classification, number>, c: Classification): number {
  if (c === "excellent") return counts.excellent + counts.good;
  return counts[c];
}

/**
 * 分類対象外(classification===null)スポットの日本語説明。「なぜ対象外か」を示す。
 * reason==="solving" はスピナー表示のため、呼び出し側で別処理すること。
 */
export function outOfScopeLabel(reason: string | null, analyzable: boolean): string {
  if (!analyzable) return "多人数のため対象外";
  switch (reason) {
    case "3bet-line":
      return "3ベット以降のライン";
    case "squeeze":
      return "スクイーズ";
    case "limped-pot":
      return "リンプポット";
    case "reopened-line":
      return "自分のオープンにリレイズ";
    case "out-of-range":
      return "GTOレンジ外のプリフロップ";
    case "solver-failed":
      return "ソルバー解析に失敗";
    default:
      return "未対応スポット";
  }
}
