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
  artistic: { label: "芸術的", glyph: "✦", color: "#14b8a6" },
  best: { label: "最善", glyph: "★", color: "#22a06b" },
  great: { label: "Great", glyph: "!", color: "#3b82f6" },
  excellent: { label: "良手", glyph: "", color: "#34a853" },
  good: { label: "好手", glyph: "", color: "#86b817" },
  book: { label: "Book", glyph: "B", color: "#a97142" },
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
