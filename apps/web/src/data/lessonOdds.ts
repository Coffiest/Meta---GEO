import type { LessonScene, LessonStep } from "./lessons";
import { six } from "./lessonBasics";

/**
 * レッスン「3. オッズと必要勝率、勝率計算」(オーナーの指示した流れで、こちらで作成)。
 * オッズの考え方 → 必要勝率 = コール額 ÷ コール後のポット → アウツ → 2倍・4倍の法則 → 実際に解く。
 * あなた = BB(席0)、バリィ = BTN(席4)。額は BB 単位。
 */
const F = { folded: true };

/** フロップ以降のヘッズアップ。pot = 前のストリートまでのポット、bally = バリィのベット、hero = あなたのコール。 */
function hu(hero: string[], board: string[], pot: number, bally = 0, heroBet = 0, extra: Partial<LessonScene> = {}): LessonScene {
  return {
    hero,
    board,
    table: six(4, [
      { bet: heroBet, act: heroBet ? "call" : undefined, stack: 100 - heroBet },
      F,
      F,
      F,
      { name: "バリィ", bet: bally, act: bally ? "bet" : undefined, stack: 100 - bally },
      F,
    ], pot),
    ...extra,
  };
}

const KK = ["Kd", "Qc"];
const B1 = ["Ks", "8d", "3c"];
const FD = ["7h", "6h"];
const FD_TURN = ["Kh", "9h", "2c", "4s"];

export const ODDS_STEPS: LessonStep[] = [
  {
    kind: "talk",
    pages: [
      { text: "今日は**オッズ**の話。「このコール、していいの?」が**計算で分かる**ようになるよ。", scene: hu(KK, B1, 2) },
      { text: "ポットは**2BB**。そこへ僕が**2BBをベット**したよ。", scene: hu(KK, B1, 2, 2, 0, { focus: [4] }) },
      { text: "きみがコールするには**2BB**払う。コールすると、ポットは全部で**6BB**になるね。", scene: hu(KK, B1, 2, 2, 2, { focus: [0] }) },
      { text: "つまり、**2BB払って、勝てば6BBが返ってくる**。払った額の**3倍**だ。これが**オッズ**の考え方だよ。", scene: hu(KK, B1, 2, 2, 2) },
      { text: "3倍で返ってくるなら、**3回に1回勝てれば**、負けた2回の分を取り返せるよね。", scene: hu(KK, B1, 2, 2, 2) },
      { text: "だから**3回に1回以上勝てるならコール**。それより勝てないなら**フォールド**だよ。", scene: hu(KK, B1, 2, 2, 2, { badge: "best" }) },
      { text: "この「最低これだけ勝てればいい」が**必要勝率**。\n**必要勝率 = コール額 ÷ コール後のポット**", scene: hu(KK, B1, 2, 2, 2) },
      { text: "今なら **2 ÷ 6 = 33%**。**33%以上勝てるならコール**だね。", scene: hu(KK, B1, 2, 2, 2, { focus: [0] }) },
    ],
  },
  {
    kind: "quiz",
    question: "ポット4BBに、僕が2BBベット。コールに2BB。必要勝率は?",
    choices: ["20%", "25%", "33%", "50%"],
    answer: 1,
    hint: "コール後のポットは 4 + 2 + 2 = 8BB。コール額 ÷ コール後のポットだよ。",
    explain: "**2 ÷ 8 = 25%**。ポットの半分のベットなら、必要勝率は25%だよ。",
    scene: hu(KK, B1, 4, 2),
  },
  {
    kind: "quiz",
    question: "ポット4BBに、僕がポットと同じ4BBをベット。必要勝率は?",
    choices: ["25%", "33%", "40%", "50%"],
    answer: 1,
    hint: "コール後のポットは 4 + 4 + 4 = 12BB。",
    explain: "**4 ÷ 12 = 33%**。ポットと同じ額のベットなら、33%勝てればコールできるよ。",
    scene: hu(KK, B1, 4, 4),
  },
  {
    kind: "talk",
    pages: [
      { text: "じゃあ、自分の勝率はどう見積もるの?そこで使うのが**アウツ**だよ。", scene: hu(FD, FD_TURN, 8) },
      { text: "きみは**7と6のハート**。ボードにハートが**2枚**。あと1枚ハートが来れば**フラッシュ**だ!", scene: hu(FD, FD_TURN, 8, 0, 0, { focus: [0] }) },
      { text: "**アウツ**っていうのは、「次に来たら勝てるカード」の枚数のこと。", scene: hu(FD, FD_TURN, 8) },
      { text: "数え方。ハートは全部で**13枚**。きみの手に**2枚**、ボードに**2枚**見えてるから、残りは **13 − 4 = 9枚**。アウツは**9枚**だよ。", scene: hu(FD, FD_TURN, 8, 0, 0, { focus: [0] }) },
      { text: "トランプは**ジョーカーを抜いた52枚**で遊ぶよ。見えていないカードの中に、アウツが9枚まざってるんだ。", scene: hu(FD, FD_TURN, 8) },
      { text: "ここで便利なのが**2倍・4倍の法則**。\n**あと1枚**開くなら、勝率は**アウツ × 2**%。", scene: hu(FD, FD_TURN, 8) },
      { text: "**あと2枚**開く(フロップでオールインしてリバーまで見られる)なら、**アウツ × 4**%。", scene: hu(FD, ["Kh", "9h", "2c"], 8) },
      { text: "いまはターンで、あと1枚。だから **9 × 2 = 18%**。きみの勝率は**だいたい18%**だね。", scene: hu(FD, FD_TURN, 8, 0, 0, { focus: [0] }) },
      { text: "最後は組み合わせ。**勝率(18%)が必要勝率より大きければコール、小さければフォールド**。やってみよう!", scene: hu(FD, FD_TURN, 8) },
    ],
  },
  {
    kind: "quiz",
    question: "9と8を持っていて、ボードは 7・6・2。5か10が来ればストレート。アウツは何枚?",
    choices: ["4枚", "6枚", "8枚", "9枚"],
    answer: 2,
    hint: "5は4枚、10も4枚あるよ。",
    explain: "**5が4枚 + 10が4枚 = 8枚**。両側が開いたストレートの待ちは8アウツだよ。",
    scene: { ...hu(["9c", "8d"], ["7h", "6s", "2c"], 4), focus: [0] },
  },
  {
    kind: "quiz",
    question: "アウツ8枚で、あと1枚(リバー)だけ開く。勝率はだいたい?",
    choices: ["8%", "16%", "24%", "32%"],
    answer: 1,
    hint: "あと1枚なら、アウツ × 2 だよ。",
    explain: "**8 × 2 = 16%**。あと2枚なら × 4 で32%になるよ。",
    scene: hu(["9c", "8d"], ["7h", "6s", "2c", "Kd"], 4),
  },
  {
    kind: "spot",
    scene: hu(FD, FD_TURN, 8, 2),
    prompt: "ターン。ポット8BBに僕が**2BB**ベット。きみはハートの**9アウツ**。どうする?",
    expect: "call",
    hint: "必要勝率は 2 ÷ 12 = 17%。勝率は 9 × 2 = 18%。どっちが大きい?",
    explain: "**勝率18% > 必要勝率17%** だから**コール**!小さいベットなら、ドローでもついていけるよ。",
  },
  {
    kind: "spot",
    scene: hu(FD, FD_TURN, 8, 8),
    prompt: "今度は、ポット8BBに僕が**8BB**ベット。同じ9アウツ。どうする?",
    expect: "fold",
    hint: "必要勝率は 8 ÷ 24 = 33%。勝率は18%しかないよ。",
    explain: "**勝率18% < 必要勝率33%** だから**フォールド**。大きいベットには、ドローでついていくと損だよ。",
  },
];
