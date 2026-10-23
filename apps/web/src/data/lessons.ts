import { RULES_STEPS } from "./lessonRules";

/**
 * Lesson タブのカリキュラム(オーナー指定の項目と順番)。中身はオーナーと1項目ずつ決めて足していく。
 * 中身(steps)が空のレッスンは「準備中」として一覧に出し、押せない(回数にも数えない)。
 * 回数に数えないレッスン(ルール説明)は、サーバー(packages/server/src/lessonApi.ts の FREE_LESSON_IDS)とそろえる。
 *
 * 1レッスンの流れ(オーナー確定):
 *  - talk: バリィ先生が話す。棋譜解析の解説と同じ枠に出し、「次へ」で続きを読む(何ページでも)。
 *  - quiz: 卓に局面が配られ、本番と同じアクションバーで答える。間違えたら「答えを見る」か「もう一度解く」を選べる。
 *  - 一発で正解した数で星(0〜3)を付ける。
 * バリィの口調は普段どおり(くだけた話し方。関西弁はラフくんだけ)。出典はアプリに出さない。
 */
/** 卓に出す場面(手札・バリィの手・ボード)。カードは "Ah" "10s" の形。 */
export interface LessonScene {
  hero?: string[];
  /** バリィの手札(表で見せる)。 */
  bally?: string[];
  board?: string[];
  /** 勝った側(「Win !」と勝者の5枚の枠を出す)。 */
  winner?: "hero" | "bally";
}

export type LessonStep =
  /** バリィが話す(「次へ」で次のページ)。ページごとに卓の場面を変えられる。 */
  | { kind: "talk"; pages: { text: string; scene?: LessonScene }[] }
  /** 手札どうしの勝負を見せるだけ(配る → ボードを開けて勝ち負け)。 */
  | { kind: "flip"; hero: string[]; bally: string[]; board: string[]; intro: string; result: string }
  /** バリィと1ハンドを決まった流れで打ち、あなたが言われたボタンを押す(チップの掛け方)。 */
  | { kind: "guided" }
  /** 練習相手と卓を1周(6ハンド)打つ。 */
  | { kind: "practice"; hands: number };

export interface Lesson {
  id: string;
  title: string;
  /** 回数に数えない(ルール説明)。 */
  free?: boolean;
  steps: LessonStep[];
}

export interface LessonSection {
  title: string;
  lessons: Lesson[];
}

export const CURRICULUM: LessonSection[] = [
  { title: "0. ルール説明", lessons: [{ id: "rules", title: "ルール説明", free: true, steps: RULES_STEPS }] },
  { title: "1. トナメとキャッシュ", lessons: [{ id: "tourney-vs-cash", title: "トナメとキャッシュの違いを知る", steps: [] }] },
  {
    title: "2. 基礎編: やってはいけないこと",
    lessons: [
      { id: "donk-bet", title: "ドンクベット", steps: [] },
      { id: "limp", title: "リンプ", steps: [] },
      { id: "commit", title: "コミット", steps: [] },
      { id: "marginal-bet", title: "マージナルベット", steps: [] },
    ],
  },
  { title: "3. オッズ", lessons: [{ id: "odds", title: "オッズと必要勝率、勝率計算", steps: [] }] },
  {
    title: "4. プリフロップ基礎編",
    lessons: [
      { id: "preflop-ranges", title: "オープン・3bet・コールドコールのレンジとレイズサイズ", steps: [] },
      { id: "bb-defense", title: "BBディフェンス", steps: [] },
    ],
  },
  {
    title: "5. IP(インポジション)戦略",
    lessons: [
      { id: "cb-bmcb", title: "CB と BMCB(スタブ)", steps: [] },
      { id: "barrels", title: "ターンバレル・リバーバレルとポラライズ", steps: [] },
      { id: "thin-value", title: "シンバリューベット", steps: [] },
      { id: "check-range", title: "チェックレンジを強くする", steps: [] },
      { id: "what-is-gto", title: "GTOとは?", steps: [] },
    ],
  },
  {
    title: "6. OOP戦略",
    lessons: [
      { id: "check-raise", title: "チェックレイズと CB 頻度の調整", steps: [] },
      { id: "probe-bet", title: "ターンとリバーのプローブベット", steps: [] },
      { id: "bluff-catch", title: "ブラフキャッチとリバーのブラフレイズ", steps: [] },
    ],
  },
  {
    title: "7. トナメ戦略",
    lessons: [
      { id: "short-stack", title: "ショートスタック戦術", steps: [] },
      { id: "icm", title: "ICM", steps: [] },
    ],
  },
  {
    title: "8. プリフロップ応用編",
    lessons: [
      { id: "light-3bet", title: "ライト3bet", steps: [] },
      { id: "squeeze", title: "スクイーズ", steps: [] },
      { id: "bb-polar-3bet", title: "BBからのポラーな3bet", steps: [] },
      { id: "bvb", title: "BvB", steps: [] },
    ],
  },
  {
    title: "9. GTO戦略とエクスプロイト戦略",
    lessons: [
      { id: "nash-gto", title: "ナッシュ均衡とGTO", steps: [] },
      { id: "exploit-what", title: "エクスプロイト戦略とは", steps: [] },
      { id: "exploit-practice", title: "実際のエクスプロイト戦略", steps: [] },
    ],
  },
];

export const ALL_LESSONS: Lesson[] = CURRICULUM.flatMap((s) => s.lessons);
