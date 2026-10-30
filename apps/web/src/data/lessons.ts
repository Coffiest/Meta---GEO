import { RULES_STEPS } from "./lessonRules";
import { TOURNEY_VS_CASH_STEPS } from "./lessonTourneyCash";
import { COMMIT_STEPS, DONK_STEPS, LIMP_STEPS, MARGINAL_STEPS } from "./lessonBasics";

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
  /** 真ん中のポット(確定済みの額)。ページごとに変えると、増えたり減ったりして見える。 */
  pot?: number;
  /** 席の前に出ているチップ(あなた = SB、バリィ = BB)。 */
  bets?: { hero?: number; bally?: number };
  /** 6人卓の局面(額はすべて BB 単位)。あると pot / bets より優先する。席0が「あなた」。 */
  table?: LessonTable;
  /** 光らせて目立たせる席(最初の1つ)。 */
  focus?: number[];
  /** 解説の箱に出す評価のバッジ(棋譜解析と同じ見た目)。 */
  badge?: "best" | "blunder";
}

export type LessonAct = "check" | "bet" | "call" | "raise" | "fold" | "allIn";

/** 6人卓の1席。席0は「あなた」。名前が「バリィ」ならバリィの絵。額は BB 単位。 */
export interface LessonSeat {
  seat: number;
  name?: string;
  /** 残りのスタック(BB)。省略は 100。 */
  stack?: number;
  /** このストリートに出しているチップ(BB)。 */
  bet?: number;
  folded?: boolean;
  /** 表で見せる手札。 */
  cards?: string[];
  /** 席に出すアクションの札。 */
  act?: LessonAct;
}

export interface LessonTable {
  /** ボタンの席(SB = +1、BB = +2)。 */
  button: number;
  seats: LessonSeat[];
  /** 真ん中のポット(BB。前のストリートまでの分とアンティ)。 */
  pot?: number;
}

export type LessonStep =
  /** バリィが話す(「次へ」で次のページ)。ページごとに卓の場面を変えられる。 */
  | { kind: "talk"; pages: { text: string; scene?: LessonScene }[] }
  /** 手札どうしの勝負を見せるだけ(配る → ボードを開けて勝ち負け)。 */
  | { kind: "flip"; hero: string[]; bally: string[]; board: string[]; intro: string; result: string }
  /** バリィと1ハンドを決まった流れで打ち、あなたが言われたボタンを押す(チップの掛け方)。 */
  | { kind: "guided" }
  /** 練習相手と卓を1周(6ハンド)打つ。 */
  | { kind: "practice"; hands: number }
  /** 卓の局面で、本物のアクションバーを押して答える問題。size は正解にするレイズ額の範囲(BB、そこまで上げる額)。 */
  | { kind: "spot"; scene: LessonScene; prompt: string; expect: LessonAct; size?: [number, number]; hint: string; explain: string }
  /** 選択肢から1つ選ぶ問題。一発で正解した数で星が付く。 */
  | { kind: "quiz"; question: string; choices: string[]; answer: number; hint: string; explain: string; scene?: LessonScene };

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
  { title: "1. トナメとキャッシュ", lessons: [{ id: "tourney-vs-cash", title: "トナメとキャッシュの違いを知る", steps: TOURNEY_VS_CASH_STEPS }] },
  {
    title: "2. 基礎編: やってはいけないこと",
    lessons: [
      { id: "donk-bet", title: "ドンクベット", steps: DONK_STEPS },
      { id: "limp", title: "プリフロップで「コールする」", steps: LIMP_STEPS },
      { id: "commit", title: "コミット", steps: COMMIT_STEPS },
      { id: "marginal-bet", title: "マージナルベット", steps: MARGINAL_STEPS },
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
