/**
 * ⑥ 過去投稿を作り直して再利用する。
 *
 * 伸びた投稿は、同じ文章をそのまま再投稿しても伸びない(既に見た人には新規性が無く、
 * プラットフォーム側も重複を嫌う)。効いていたのは文章そのものではなく**構造**なので、
 * 構造だけを残して切り口を変える。
 *
 * ここが返すのは「完成した投稿」ではなく**書き直しの指示**。文章の最終的な言い回しは
 * 人が決めるべきで、機械が勝手に断定調の文を作ると、事実と違うことを書いてしまう。
 */
import { analyzePost, type PostStructure } from "./structure.js";

/** 切り口。同じ主張を別の入口から出すためのパターン。 */
export type Angle =
  | "contrarian"
  | "beginner"
  | "data"
  | "story"
  | "checklist"
  | "question";

export interface AngleSpec {
  angle: Angle;
  label: string;
  /** 1行目の作り方。 */
  hookRecipe: string;
  /** 本文の組み立て方。 */
  bodyRecipe: string;
}

export const ANGLES: AngleSpec[] = [
  {
    angle: "contrarian",
    label: "逆張り",
    hookRecipe: "世間の通説を1行で否定する(「〜は間違い」)。ただし本文で必ず根拠を出せる範囲に留める。",
    bodyRecipe: "通説 → なぜ成り立たないか → 代わりに何を見るか、の3段。",
  },
  {
    angle: "beginner",
    label: "初心者向け",
    hookRecipe: "初心者がつまずく具体的な場面を1行で描く(「BBでオープンに直面したとき」)。",
    bodyRecipe: "つまずき → 最短の判断基準 → 次に見る指標、の3段。専門語は初出で言い換える。",
  },
  {
    angle: "data",
    label: "データ提示",
    hookRecipe: "自分のDBから取れた数字を1行目に置く(「6人卓のUTGは全体の◯%」)。",
    bodyRecipe: "数字 → その数字が意味すること → 打ち手、の3段。出典(自社DB)を明記する。",
  },
  {
    angle: "story",
    label: "体験談",
    hookRecipe: "1ハンドの結末から書き出す(「AAで全部飛ばした話」)。",
    bodyRecipe: "結末 → 何を見落としたか → 一般化できる教訓、の3段。",
  },
  {
    angle: "checklist",
    label: "チェックリスト",
    hookRecipe: "「◯個」と個数を明示する(「降りるべき3つのサイン」)。",
    bodyRecipe: "箇条書き。1項目1行、各行に判断基準を1つだけ入れる。",
  },
  {
    angle: "question",
    label: "問いかけ",
    hookRecipe: "読み手が即答したくなる二択を出す(「ここ、コール？フォールド？」)。",
    bodyRecipe: "状況提示 → 少し置いてから答え → 理由。答えを先に書かない。",
  },
];

export interface RecycleBrief {
  angle: Angle;
  label: string;
  /** 元投稿から引き継ぐ構造。 */
  keep: string[];
  /** 変える点。 */
  change: string[];
  hookRecipe: string;
  bodyRecipe: string;
}

/**
 * 元投稿の構造から、切り口違いの書き直し指示を作る。
 *
 * `keep`(引き継ぐもの)は元投稿の実際の構造から埋める。効いていた要素を落とさないため。
 */
export function buildRecycleBriefs(source: string, angles: Angle[] = ANGLES.map((a) => a.angle)): RecycleBrief[] {
  const s: PostStructure = analyzePost(source);

  // まず「効いていた実体」を拾う。フックの長さはそれ単体では資産にならない
  // (挨拶だけの投稿も短いフックを持つ)ので、他に引き継ぐ要素がある場合にだけ添える。
  const keep: string[] = [];
  if (s.numbers.length > 0) keep.push(`具体的な数字を${s.numbers.length}個以上入れる(元: ${s.numbers.slice(0, 3).join(", ")})`);
  if (s.bulletLines > 0) keep.push(`箇条書き${s.bulletLines}行の構成`);
  if (s.hasCta) keep.push("末尾のCTA");
  if (s.hasQuestion) keep.push("読み手への問いかけ");
  if (s.hashtags.length > 0) keep.push(`ハッシュタグ ${s.hashtags.slice(0, 3).join(" ")}`);

  if (keep.length === 0) {
    keep.push("(元投稿に引き継ぐべき構造が見当たらない。新規に組み直す)");
  } else if (s.hookLength > 0 && s.hookLength <= 28) {
    keep.push(`1行目は${s.hookLength}文字程度に収める`);
  }

  return angles.map((angle) => {
    const spec = ANGLES.find((a) => a.angle === angle)!;
    return {
      angle,
      label: spec.label,
      keep,
      change: [
        "1行目を丸ごと書き換える(同じフックの再投稿は伸びない)",
        `切り口を「${spec.label}」に変える`,
        "例示するハンド/場面を別のものへ差し替える",
      ],
      hookRecipe: spec.hookRecipe,
      bodyRecipe: spec.bodyRecipe,
    };
  });
}
