import type { LessonScene, LessonSeat, LessonStep } from "./lessons";

/**
 * 「2. 基礎編: やってはいけないこと」の4本(オーナーの原稿をもとに、バリィの口調へそろえた)。
 * 額はすべて BB 単位。席0が「あなた」。**…** は色付きの太字、!!…!! は赤い太字。
 * 全ページに卓の局面を出す(文字を読ませるだけにしない。オーナー指示)。
 */

const N = ["ミナト", "ソラ", "ハル", "リク", "ユイ"];

/** 6人卓を作る。others は席1〜5の上書き(名前は既定で練習相手)。 */
function six(button: number, seats: Partial<LessonSeat>[], pot?: number): LessonScene["table"] {
  const all: LessonSeat[] = [0, 1, 2, 3, 4, 5].map((seat) => ({ seat, name: seat === 0 ? undefined : N[seat - 1], ...(seats[seat] ?? {}) }));
  return { button, seats: all, pot };
}
const F = { folded: true };

// ───────── ドンクベット ─────────
// あなた = BB(席0)、バリィ = BTN(席4)。ほかは降りている。
const DONK_PRE = (heroAct?: "call"): LessonScene => ({
  hero: ["7h", "6h"],
  table: six(4, [
    { bet: heroAct ? 2 : 1, act: heroAct },
    F,
    F,
    F,
    { name: "バリィ", bet: 2, act: "raise" },
    { ...F, bet: 0.5 },
  ], 1),
});
const DONK_FLOP = (extra: Partial<LessonScene> = {}, heroAct?: "bet" | "check"): LessonScene => ({
  hero: ["7h", "6h"],
  board: ["7c", "7s", "6d"],
  table: six(4, [{ act: heroAct, bet: heroAct === "bet" ? 3 : 0, stack: heroAct === "bet" ? 95 : 98 }, F, F, F, { name: "バリィ", stack: 98 }, F], 5.5),
  ...extra,
});

export const DONK_STEPS: LessonStep[] = [
  {
    kind: "talk",
    pages: [
      { text: "まずはこの呪文を覚えよう。\n**「コールしたらチェック!」**", scene: DONK_FLOP() },
      { text: "ドンクベットっていうのは、**前のストリートでコールしたのに、相手より先にベットすること**だよ。", scene: DONK_FLOP() },
      { text: "具体的に見てみよう。プリフロップで、ボタンの僕が**2BBにレイズ**したよ。", scene: { ...DONK_PRE(), focus: [4] } },
      { text: "BBのきみは、僕のレイズに**コール**した。", scene: { ...DONK_PRE("call"), focus: [0] } },
      { text: "フロップが開いて…7・7・6!きみは**フルハウス**、めちゃくちゃ強い役ができたね。きみの番だよ。", scene: { ...DONK_FLOP(), focus: [0] } },
      { text: "強い役だから、ベットしたくなるよね。でも…", scene: DONK_FLOP() },
      { text: "ここで僕より先にベットするのが**ドンクベット**。!!大悪手!!だよ。", scene: { ...DONK_FLOP({}, "bet"), badge: "blunder", focus: [0] } },
      { text: "ドンクベットは、たまたまうまくいくことはあっても、**長い目で見ると負ける打ち方**なんだ。", scene: DONK_FLOP({}, "bet") },
      { text: "プリフロップを思い出してみて。きみは僕の**レイズにコール**したよね。", scene: { ...DONK_PRE("call"), focus: [4] } },
      { text: "レイズした僕と、コールしたきみ。持っている手の**平均的な強さは、レイズした僕の方が上**なんだ。", scene: { ...DONK_PRE("call"), focus: [4] } },
      { text: "だからフロップでは、**どんな手を持っていてもチェック**。これが最善だよ。", scene: { ...DONK_FLOP({}, "check"), badge: "best", focus: [0] } },
      { text: "**前のストリートでコールしたら、次はチェック!**\nいちばん最初に覚える、基礎の基礎だよ。", scene: DONK_FLOP({}, "check") },
    ],
  },
  {
    kind: "spot",
    scene: { hero: ["Kd", "Kc"], board: ["Ks", "8h", "3c"], table: six(4, [{ stack: 98 }, F, F, F, { name: "バリィ", stack: 98 }, F], 5.5) },
    prompt: "僕のレイズにコールして、フロップで**Kのスリーカード**ができたよ。きみの番。どうする?",
    expect: "check",
    hint: "前のストリートで何をしたか思い出して。**コールしたら…?**",
    explain: "**コールしたらチェック!** 強い役でも、僕より先にベットしないのが正解だよ。",
  },
  {
    kind: "quiz",
    question: "ドンクベットとは、どんなベット?",
    choices: ["前のストリートでコールしたのに、相手より先にベットすること", "相手のベットに上乗せすること", "持っているチップを全部出すこと", "最初にベットすること"],
    answer: 0,
    hint: "呪文を思い出して。「コールしたら…」",
    explain: "そう!コールしたのに先にベットするのがドンクベット。だからコールしたらチェックだよ。",
    scene: DONK_FLOP({}, "bet"),
  },
];

// ───────── プリフロップで「コールする」(リンプ) ─────────
// あなた = UTG(席0)。ボタンは席3(SB 4 / BB 5)。BB はアンティも払う(ポット 1)。
const UTG = (heroAct?: "call" | "raise"): LessonScene => ({
  hero: ["Ks", "Kh"],
  table: six(3, [{ act: heroAct, bet: heroAct === "call" ? 1 : heroAct === "raise" ? 2 : 0 }, {}, {}, { name: "バリィ" }, { bet: 0.5 }, { bet: 1 }], 1),
});
// あなた = CO(席0)。ボタンは席1(SB 2 / BB 3)、UTG は席4、HJ は席5。
const CO = (heroBet = 0, heroAct?: "call" | "raise" | "allIn", utgBet = 2, utgAct: "raise" | "call" = "raise"): LessonScene => ({
  hero: ["Ks", "Kh"],
  table: six(1, [
    { act: heroAct, bet: heroBet, stack: 100 - heroBet },
    {},
    { bet: 0.5 },
    { bet: 1 },
    { name: "バリィ", bet: utgBet, act: utgAct, stack: 100 - utgBet },
    F,
  ], 1),
});

export const LIMP_STEPS: LessonStep[] = [
  {
    kind: "talk",
    pages: [
      { text: "**最初の2枚はレイズで参加!コールは禁止!**\nこれを守るだけで、ぐっと勝てるようになるよ。", scene: UTG() },
      { text: "6人の卓で、いちばん最初に話すUTGのきみに**KK**が来たよ。どうする?", scene: { ...UTG(), focus: [0] } },
      { text: "KKで降りるのはもったいないよね。参加するなら、**コールかレイズ**だ。", scene: UTG() },
      { text: "ここでコールで参加することを**リンプ**っていうよ。これは!!大悪手!!。", scene: { ...UTG("call"), badge: "blunder", focus: [0] } },
      { text: "強い手のときは、相手から**なるべくたくさん取りたい**よね。だから**レイズで参加**して、少しでも多くチップを入れてもらうんだ。", scene: UTG("raise") },
      { text: "「強いから相手を降ろしたくない」って思った?大丈夫。弱い手からは、どうせ大きくは取れないよ。", scene: UTG("call") },
      { text: "弱い相手から小さく取るのはあきらめて、**強い相手から大きく取る**。この考え方が大事なんだ。", scene: UTG("raise") },
      { text: "最初の2枚は、**レイズかフォールドの2択**。レイズするなら、だいたい**2倍(2BB)**がちょうどいいよ。", scene: { ...UTG("raise"), badge: "best", focus: [0] } },
      { text: "こうしてレイズで参加することを**オープン**とか**オープンレイズ**っていうよ。じゃあ、やってみよう!", scene: UTG() },
    ],
  },
  {
    kind: "spot",
    scene: UTG(),
    prompt: "UTGでKK。**2BBでオープン**してみよう。",
    expect: "raise",
    size: [2, 2.5],
    hint: "コールは禁止!**レイズ**を押して、**2BB(×2)**を選んでね。",
    explain: "ばっちり!**2BBのオープン**が、ちょうどいい大きさだよ。",
  },
  {
    kind: "talk",
    pages: [
      { text: "誰かがもうレイズしているときも同じだよ。100BBずつ持っていて、UTGの僕が**2BBでオープン**した。", scene: { ...CO(), focus: [4] } },
      { text: "COのきみは**KK**。ここで**コールするのは大悪手**!", scene: { ...CO(2, "call", 2, "raise"), badge: "blunder", focus: [0] } },
      { text: "僕のレイズに、**もう一回レイズを返そう**。これを**3bet**っていうよ。超基本の技だ。", scene: { ...CO(6, "raise"), focus: [0] } },
      { text: "3betは、相手の額(今は**2BB**)の**3〜4倍**がおすすめ。だからここでは**6BB**がちょうどいいよ。", scene: { ...CO(6, "raise"), badge: "best", focus: [0] } },
      { text: "数え方はこうだよ。最初のレイズが**2bet**。", scene: { ...CO(), focus: [4] } },
      { text: "それにレイズを返すのが**3bet**。", scene: { ...CO(6, "raise"), focus: [0] } },
      { text: "その3betにさらにレイズを返すのが**4bet**。", scene: { ...CO(6, "raise", 15, "raise"), focus: [4] } },
      { text: "それにまたレイズを返すのが**5bet**…と続いていくよ。", scene: { ...CO(100, "allIn", 15, "raise"), focus: [0] } },
      { text: "強い手のときは、コールじゃなくて**3bet・4bet・5bet…とレイズを返していこう**。勝てないと思ったら**フォールド**。", scene: CO(6, "raise") },
      { text: "**プリフロップでは、コールという選択肢そのものが最悪!**これだけは覚えておいてね。", scene: { ...CO(2, "call"), badge: "blunder" } },
    ],
  },
  {
    kind: "spot",
    scene: CO(),
    prompt: "UTGの僕が**2BB**でオープン。COのきみは**KK**。どうする?",
    expect: "raise",
    size: [5.5, 8.5],
    hint: "コールは禁止!相手の2BBの**3〜4倍**で**3bet**しよう。",
    explain: "そのとおり!**6〜8BBの3bet**だね。強い手はレイズを返していくよ。",
  },
  {
    kind: "quiz",
    question: "相手のオープン(2bet)に、さらにレイズを返すことを何という?",
    choices: ["リンプ", "3bet", "4bet", "オープン"],
    answer: 1,
    hint: "最初のレイズが2bet。それに返すから…?",
    explain: "正解は**3bet**。そのまた上が4bet、5betだよ。",
    scene: CO(6, "raise"),
  },
];

// ───────── コミット ─────────
const COMMIT = (heroBet = 0, heroAct?: "raise" | "allIn"): LessonScene => ({
  hero: ["Ks", "Kh"],
  table: six(1, [
    { act: heroAct, bet: heroBet, stack: 15 - heroBet },
    {},
    { bet: 0.5 },
    { bet: 1 },
    { name: "バリィ", bet: 2, act: "raise" },
    F,
  ], 1),
});

export const COMMIT_STEPS: LessonStep[] = [
  {
    kind: "talk",
    pages: [
      { text: "**持っているスタックの「ちょい残し」は絶対禁止!**", scene: COMMIT(6, "raise") },
      { text: "6人の卓で、COのきみは**15BB**しか持っていなくて、手は**KK**。UTGの僕が**2BBでオープン**したよ。", scene: { ...COMMIT(), focus: [4] } },
      { text: "強いからレイズしたいよね。3倍だ!と思って**6BB**にレイズすると…", scene: { ...COMMIT(6, "raise"), focus: [0] } },
      { text: "残りのスタックは**9BB**。ちょっとだけ残った「ちょい残し」だね。これが**コミット**っていう状態で、!!大悪手!!。", scene: { ...COMMIT(6, "raise"), badge: "blunder", focus: [0] } },
      { text: "ちょい残ししても、**どうせどこかでオールインになる**んだ。それに、残った9BBでオールインしても、相手は全然こわくないよね。", scene: COMMIT(6, "raise") },
      { text: "だったら、まだ**意味のある大きさのうちにオールイン**した方が、相手はずっと嫌なんだ。", scene: COMMIT(15, "allIn") },
      { text: "**レイズしたらちょい残しになるなら、オールイン!**\nだからここでは、**15BBのオールイン**が最善だよ。", scene: { ...COMMIT(15, "allIn"), badge: "best", focus: [0] } },
    ],
  },
  {
    kind: "spot",
    scene: COMMIT(),
    prompt: "15BBでKK。UTGの僕が**2BB**でオープンしたよ。どうする?",
    expect: "allIn",
    hint: "3倍の6BBだと、残りは9BBの**ちょい残し**になっちゃうよ。",
    explain: "そのとおり!ちょい残しになるなら**オールイン**。これが最善だよ。",
  },
];

// ───────── マージナルベット ─────────
// あなた = BTN(席0)、バリィ = BB(席2)。リバーでバリィがチェックしてきた。
const RIVER = (hero: string[], heroAct?: "bet" | "check"): LessonScene => ({
  hero,
  board: ["Ah", "Kd", "8c", "3s", "2h"],
  table: six(0, [
    { act: heroAct, bet: heroAct === "bet" ? 7 : 0, stack: heroAct === "bet" ? 83 : 90 },
    F,
    { name: "バリィ", act: "check", stack: 90 },
    F,
    F,
    F,
  ], 21),
});

export const MARGINAL_STEPS: LessonStep[] = [
  {
    kind: "talk",
    pages: [
      { text: "**「勝ってるかどうか怪しい役」でベットするのは大悪手!**", scene: RIVER(["Qc", "8d"]) },
      { text: "リバーでボードは A・K・8・3・2。きみは**Q8**で、**8のワンペア**ができているよ。僕はチェックした。", scene: { ...RIVER(["Qc", "8d"]), focus: [0] } },
      { text: "8のワンペアは、**勝ってるか負けてるか怪しい**役なんだ。AやKのワンペアやツーペアには負けてる。でも3や2のペアには勝ってる。", scene: RIVER(["Qc", "8d"]) },
      { text: "こういう役でベットするのが**マージナルベット**。!!大悪手!!だよ。", scene: { ...RIVER(["Qc", "8d"], "bet"), badge: "blunder", focus: [0] } },
      { text: "ベットすると、**負けてるAやKのペアにだけコール**されて、**勝ってる3や2のペアには降りられる**。チップが減るだけの無駄打ちなんだ。", scene: RIVER(["Qc", "8d"], "bet") },
      { text: "ベットするのは、**「ほぼ勝ってるだろ!」**っていう手。たとえば**AKのツーペア**ならベットだよ。", scene: { ...RIVER(["As", "Ks"], "bet"), badge: "best", focus: [0] } },
      { text: "それか、**「絶対負けてるわ」**っていう手。**QTのハイカード**なら、ブラフでベットしていいんだ。", scene: { ...RIVER(["Qd", "10s"], "bet"), badge: "best", focus: [0] } },
      { text: "**「ワンチャン勝ってるかも」でベットは絶対禁止!** 中途半端な手は**チェック**しよう。", scene: { ...RIVER(["Qc", "8d"], "check"), badge: "best", focus: [0] } },
    ],
  },
  {
    kind: "spot",
    scene: RIVER(["Qc", "8d"]),
    prompt: "リバーで**8のワンペア**。僕はチェックしたよ。どうする?",
    expect: "check",
    hint: "8のワンペアは**勝ってるか怪しい**役だったよね。",
    explain: "正解!中途半端な手は**チェック**。勝ってる相手にだけコールされる無駄打ちをしないでね。",
  },
  {
    kind: "spot",
    scene: RIVER(["As", "Ks"]),
    prompt: "同じリバーで、今度は**AKのツーペア**。どうする?",
    expect: "bet",
    hint: "AKのツーペアは**ほぼ勝ってる**手だよ。",
    explain: "そのとおり!**ほぼ勝ってる手はベット**して、チップを取りにいこう。",
  },
];
