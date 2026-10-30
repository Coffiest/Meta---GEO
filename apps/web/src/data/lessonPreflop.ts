import type { LessonScene, LessonStep } from "./lessons";
import { six } from "./lessonBasics";

/**
 * 「4. プリフロップ基礎編」の2本(こちらで作成。オーナー指示: レンジを覚える回)。
 * 数字と手の例は、アプリに入っている計算済みの表(packages/engine/data/gtow/70、トーナメント・アンティあり・70BB)から取った。
 * 表の場面名: RFI_LJ(= UTG)/ RFI_HJ / RFI_CO / RFI_BTN / vsOpen_BB_vs_BTN。
 */
const F = { folded: true };

/** オープンの局面。heroSeat 0 の位置は button で決まる(UTG = ボタン+3、BTN = ボタン)。 */
const OPEN = (button: number, hero: string[], act?: "raise" | "fold", extra: Partial<LessonScene> = {}): LessonScene => {
  const sb = (button + 1) % 6;
  const bb = (button + 2) % 6;
  const seats = [0, 1, 2, 3, 4, 5].map((s) => (s === 0 ? { act, bet: act === "raise" ? 2 : 0, folded: act === "fold" } : s === sb ? { bet: 0.5 } : s === bb ? { bet: 1, name: "バリィ" } : {}));
  return { hero, table: six(button, seats, 1), ...extra };
};
const UTG = (hero: string[], act?: "raise" | "fold", extra: Partial<LessonScene> = {}) => OPEN(3, hero, act, extra);
const BTN = (hero: string[], act?: "raise" | "fold", extra: Partial<LessonScene> = {}) => OPEN(0, hero, act, extra);

export const PREFLOP_RANGE_STEPS: LessonStep[] = [
  {
    kind: "talk",
    pages: [
      { text: "今日は**どの手でオープンするか(レンジ)**を覚えよう。**席によって、参加していい手の数がぜんぜん違う**んだ。", scene: UTG(["Ks", "Jd"]) },
      { text: "まずはUTG。**いちばん最初に話す席**だね。後ろに**5人**も控えてるから、強い手がいるかもしれない。", scene: UTG(["Ks", "Jd"], undefined, { focus: [0] }) },
      { text: "だからUTGは**かたく**。オープンするのは**全体の約4分の1(23%)**だけ。表の**赤いところ**がオープン、青いところはフォールドだよ。", scene: UTG(["Ks", "Jd"], undefined, { range: { scene: "RFI_LJ" } }) },
      { text: "**KJo**ならUTGでもオープン。**2BB**でレイズだ。", scene: UTG(["Ks", "Jd"], "raise", { badge: "best", focus: [0] }) },
      { text: "でも**K9o**はUTGでは!!フォールド!!。後ろの人に強い手がいたら、勝ち目が薄いんだ。", scene: UTG(["Ks", "9d"], "fold", { focus: [0] }) },
      { text: "席が後ろになるほど、後ろの人が減るから**広く**なるよ。\n**UTG 23% → HJ 28% → CO 37% → BTN 55%**", scene: BTN(["Js", "8d"], undefined, { range: { scene: "RFI_CO" } }) },
      { text: "**BTN(ボタン)**は後ろがSBとBBの2人だけ。しかもフロップから**いつも最後に話せる**。だから**半分以上**の手でオープンしていいんだ。", scene: BTN(["Js", "8d"], undefined, { range: { scene: "RFI_BTN" }, focus: [0] }) },
      { text: "BTNなら**J8o**もオープン!", scene: BTN(["Js", "8d"], "raise", { badge: "best", focus: [0] }) },
      { text: "ただし**J7o**まで行くと、BTNでも!!フォールド!!。ここが境目だよ。", scene: BTN(["Js", "7d"], "fold", { focus: [0] }) },
      { text: "サイズは、オープンは**2BB**、相手のオープンに返す**3bet**は、相手の額の**3〜4倍**。自分が後ろの席(IP)なら**3倍**、前の席(OOP)なら**4倍**が目安だよ。", scene: UTG(["Ks", "Jd"], "raise") },
      { text: "**コールドコール**っていうのは、誰かのオープンに**BB以外の席からコール**すること。表では、後ろの席から前の席のオープンに、**1割くらいの手でコール**もあるよ。", scene: UTG(["Ks", "Jd"]) },
      { text: "たとえばCOから、UTGのオープンには、**3betが約1割、コールが約1割、残りの8割はフォールド**。コールするのは、3betするほどではないけど**降りるには惜しい手**だよ。", scene: UTG(["Ks", "Jd"]) },
      { text: "まとめ!**前の席はかたく、後ろの席は広く**。オープンは**2BB**。問題を解いてみよう!", scene: BTN(["Js", "8d"], "raise") },
    ],
  },
  {
    kind: "spot",
    scene: UTG(["Ks", "9d"]),
    prompt: "**UTG**で**K9o**。どうする?",
    expect: "fold",
    hint: "UTGは後ろに5人。オープンは23%だけの**かたい席**だよ。",
    explain: "そのとおり!UTGの**K9o**は**フォールド**。前の席はかたくいこう。",
  },
  {
    kind: "spot",
    scene: BTN(["Js", "8d"]),
    prompt: "**BTN**で**J8o**。どうする?",
    expect: "raise",
    size: [2, 2.5],
    hint: "BTNは半分以上の手でオープンする**広い席**。**2BB**でレイズしよう。",
    explain: "正解!BTNなら**J8o**も**2BBでオープン**だよ。",
  },
  {
    kind: "quiz",
    question: "いちばん広くオープンしていい席はどれ?",
    choices: ["UTG", "HJ", "CO", "BTN"],
    answer: 3,
    hint: "後ろに控えている人がいちばん少なくて、フロップからいつも最後に話せる席だよ。",
    explain: "**BTN**!後ろが2人だけで、いつも最後に話せるから、いちばん広くオープンできるよ。",
    scene: BTN(["Js", "8d"], undefined, { range: { scene: "RFI_BTN" } }),
  },
];

// ───────── BBディフェンス ─────────
// あなた = BB(席0)、バリィ = BTN(席4)が2BBでオープン。SB は降りた。
const BB = (hero: string[], heroBet = 1, heroAct?: "call" | "raise" | "fold", extra: Partial<LessonScene> = {}): LessonScene => ({
  hero,
  table: six(4, [
    { bet: heroBet, act: heroAct, folded: heroAct === "fold", stack: 100 - heroBet },
    F,
    F,
    F,
    { name: "バリィ", bet: 2, act: "raise", stack: 98 },
    { ...F, bet: 0.5 },
  ], 1),
  ...extra,
});

export const BB_DEFENSE_STEPS: LessonStep[] = [
  {
    kind: "talk",
    pages: [
      { text: "BBは**もう1BB払ってる**席だよ。だから、相手のオープンには**広く守る(ディフェンス)**んだ。", scene: BB(["Qs", "Jh"], 1, undefined, { focus: [0] }) },
      { text: "BTNの僕が**2BBでオープン**。BBのきみは、あと**1BB**足すだけでコールできる。**安く参加できる**よね。", scene: BB(["Qs", "Jh"], 1, undefined, { focus: [4] }) },
      { text: "だからBBは**たくさんコール**。表を見て。**緑っぽいところ(コール)が7割**もあるんだ。", scene: BB(["Qs", "Jh"], 1, undefined, { range: { scene: "vsOpen_BB_vs_BTN" } }) },
      { text: "**K2o**や**95o**みたいな、ちょっと弱そうな手まで**コール**でいいんだよ。", scene: BB(["Kc", "2d"], 2, "call", { badge: "best", focus: [0] }) },
      { text: "**QJs**や**A5s**みたいな**そこそこ強い手もコール**。ここでレイズしなくていいんだ。", scene: BB(["Qs", "Jh"], 2, "call", { badge: "best", focus: [0] }) },
      { text: "レイズ(3bet)するのは**2種類だけ**。1つめは**げきつよ**。**AA・KK・AK・AQ**みたいな手は**レイズ**して、たくさん取りにいこう。", scene: BB(["Ah", "Qd"], 8, "raise", { badge: "best", focus: [0] }) },
      { text: "2つめは**げきよわの中の当たりくじ**。**54s**みたいな手は、コールより**レイズ**がいいんだ。相手が降りれば勝ち、コールされてもストレートやフラッシュの夢がある。", scene: BB(["5s", "4s"], 8, "raise", { badge: "best", focus: [0] }) },
      { text: "BBのレイズは、相手より前の席(OOP)だから**相手の額の4倍(8BB)**くらいが目安だよ。", scene: BB(["Ah", "Qd"], 8, "raise") },
      { text: "**72o**みたいな本当にどうしようもない手だけ!!フォールド!!。降りるのは**1割ちょっと**しかないんだ。", scene: BB(["7c", "2d"], 1, "fold", { focus: [0] }) },
      { text: "まとめ!BBは**広く守る**。**たくさんコール**、**そこそこ強い手もコール**。**げきつよとげきよわ(の当たりくじ)はレイズ**!", scene: BB(["Qs", "Jh"], 1, undefined, { range: { scene: "vsOpen_BB_vs_BTN" } }) },
    ],
  },
  {
    kind: "spot",
    scene: BB(["Kc", "2d"]),
    prompt: "BTNの僕が2BBでオープン。BBのきみは**K2o**。どうする?",
    expect: "call",
    hint: "BBは**広く守る**席。あと1BBで参加できるよ。",
    explain: "正解!BBなら**K2o**も**コール**で守るよ。",
  },
  {
    kind: "spot",
    scene: BB(["Ah", "Qd"]),
    prompt: "今度は**AQo**。どうする?",
    expect: "raise",
    size: [6, 10],
    hint: "**げきつよ**の手だよ。レイズで取りにいこう。相手の額の**4倍**が目安。",
    explain: "そのとおり!**げきつよはレイズ**。8BBくらいの3betだよ。",
  },
  {
    kind: "spot",
    scene: BB(["7c", "2d"]),
    prompt: "**72o**。どうする?",
    expect: "fold",
    hint: "BBでも、本当にどうしようもない手は降りていいんだよ。",
    explain: "正解!**72o**は**フォールド**。BBで降りるのはこういう手だけだよ。",
  },
];
