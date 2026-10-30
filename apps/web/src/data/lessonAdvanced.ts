import type { LessonScene, LessonSeat, LessonStep } from "./lessons";
import { six } from "./lessonBasics";

/**
 * 5〜9章の残りのレッスン(こちらで作成。オーナー指示: ここまでの形式で全部書く)。
 * 中身は棋譜解析の知識ベース(packages/engine/knowledge/*.md)と計算済みの表(data/gtow/70)・パワーナンバーの表に合わせた。
 * 額は BB 単位、席0が「あなた」。全ページに局面を出し、重要な語は **…**(アクセント)/ !!…!!(赤)。
 */
const F = { folded: true };

/**
 * ヘッズアップの局面。button の席から SB/BB が決まる。ballySeat にバリィ、ほかは降りている。
 * hero / bally は { bet, act, stack, cards } を上書きできる。
 */
function duel(
  button: number,
  ballySeat: number,
  hero: string[],
  board: string[],
  pot: number,
  me: Partial<LessonSeat> = {},
  bally: Partial<LessonSeat> = {},
  extra: Partial<LessonScene> = {},
): LessonScene {
  const seats = [0, 1, 2, 3, 4, 5].map((s) =>
    s === 0 ? { stack: 90, ...me } : s === ballySeat ? { name: "バリィ", stack: 90, ...bally } : F,
  );
  return { hero, board, table: six(button, seats, pot), ...extra };
}

// ───────── 5. シンバリューベット ─────────
// あなた = BTN(席0)、バリィ = BB(席2)。リバーでバリィがチェック。
const RV = ["Kc", "9d", "6s", "3h", "2c"];
const TV = (hero: string[], bet = 0, extra: Partial<LessonScene> = {}) =>
  duel(0, 2, hero, RV, 12, bet ? { bet, act: "bet", stack: 90 - bet } : {}, { act: "check" }, extra);

export const THIN_VALUE_STEPS: LessonStep[] = [
  {
    kind: "talk",
    pages: [
      { text: "**シンバリューベット**は、「**ギリギリ勝ってる**」手で、**相手のもっと弱い手からチップを取る**ベットだよ。", scene: TV(["Kd", "8h"]) },
      { text: "リバー、ボードは K・9・6・3・2。きみは**K8**で**トップペア**。僕はチェックした。", scene: TV(["Kd", "8h"], 0, { focus: [0] }) },
      { text: "K8は強くはないね。でも、僕が**9のペアや6のペア**でコールしてくれるなら、そこからは取れる。", scene: TV(["Kd", "8h"]) },
      { text: "マージナルベットとのちがいは、**コールしてくる相手の手より、こっちが上かどうか**。上なら**シンバリュー**、下なら**マージナルベット**だよ。", scene: TV(["Kd", "8h"], 9, { focus: [0] }) },
      { text: "シンバリューが特に効くのは、**コールしすぎる相手**と、**リバーでレイズしてこない相手**だよ。", scene: TV(["Kd", "8h"], 9, { badge: "best", focus: [0] }) },
      { text: "サイズは席で決まる。後ろの席(**IP**)なら**ポットの75%以上**。75%以上なら**サイズは何でもいい**よ。", scene: TV(["Kd", "8h"], 9, { badge: "best", focus: [0], chart: { title: "シンバリューのサイズ", rows: [{ label: "後ろの席(IP)", value: "75% 以上(それ以上は何でもいい)", tone: "accent" }, { label: "前の席(OOP)", value: "20〜33% の小さめ", tone: "warn" }] } }) },
      { text: "前の席(**OOP**)なら**20〜33%の小さめ**。OOPで大きく打つと!!マージナルベット!!になっちゃう。", scene: duel(4, 4, ["Kd", "8h"], RV, 12, { bet: 3.5, act: "bet", stack: 86.5 }, { stack: 90 }, { badge: "best", focus: [0] }) },
      { text: "逆に、**降りてばかりの相手**には打っても取れない。そういう相手には!!チェック!!でいいよ。", scene: TV(["Kd", "8h"]) },
    ],
  },
  {
    kind: "spot",
    scene: TV(["Kd", "Th"]),
    prompt: "僕は**何でもコールする**タイプ。リバーで**KT(トップペア)**、僕はチェック。どうする?",
    expect: "bet",
    size: [9, 90],
    hint: "相手は**弱いペアでもコール**してくれる。きみは後ろの席だから**75%以上**で打とう。",
    explain: "正解!コールしすぎる相手には**シンバリュー**。IPなら**75%以上**で取りにいこう。",
  },
  {
    kind: "quiz",
    question: "シンバリューベットが特に効く相手は?",
    choices: ["コールしすぎる相手", "すぐ降りる相手", "リバーでよくレイズする相手", "ブラフばかりする相手"],
    answer: 0,
    hint: "ギリギリの手でも、もっと弱い手でコールしてくれる相手だよ。",
    explain: "**コールしすぎる相手**!弱い手でコールしてくれるから、ギリギリの手でも取れるんだ。",
    scene: TV(["Kd", "Th"], 9),
  },
];

// ───────── 5. チェックレンジを強くする ─────────
const CR = (hero: string[], bet = 0, extra: Partial<LessonScene> = {}) =>
  duel(0, 2, hero, ["Kh", "8d", "3h", "As"], 9, bet ? { bet, act: "bet", stack: 96 - bet } : { stack: 96 }, { act: "check", stack: 96 }, extra);

export const CHECK_RANGE_STEPS: LessonStep[] = [
  {
    kind: "talk",
    pages: [
      { text: "強い手は全部打つ…と思ってない?実は、**強い手の一部はあえてチェック**するんだ。", scene: CR(["Kc", "Kd"]) },
      { text: "もし**チェックした手が全部弱い**と、相手は「チェックしたら弱い!」と分かって、**どんどんベットしてくる**よね。", scene: CR(["9s", "9d"], 0, { focus: [2] }) },
      { text: "だから**強い手もチェックに混ぜる**。これを**チェックレンジを強くする**っていうよ。", scene: CR(["Kc", "Kd"], 0, { badge: "best", focus: [0] }) },
      { text: "バレルの表でも、Aが落ちたターンでは**KK(トップセット)をチェック**に回していたよね。", scene: CR(["Kc", "Kd"], 0, { badge: "best" }) },
      { text: "選ぶのは、**相手の手をたくさん潰している手**や、**打たなくても後で取り返せる手**。ナッツの一番上を回すことが多いよ。", scene: CR(["Kc", "Kd"]) },
      { text: "こうしておくと、相手は**チェックされても安心してベットできない**。きみの弱いチェックも守られるんだ。", scene: CR(["9s", "9d"], 0, { badge: "best" }) },
    ],
  },
  {
    kind: "spot",
    scene: CR(["Kc", "Kd"]),
    prompt: "フロップ K・8・3 でCB、ターンに**A**。きみは**KK(トップセット)**。表どおりにいこう。",
    expect: "check",
    hint: "オーバーカードのターンでは、**トップセットはチェックに回す**んだったね。",
    explain: "正解!**トップセットをチェック**して、チェックレンジを強くするよ。",
  },
  {
    kind: "quiz",
    question: "チェックした手が全部弱いと、何が起きる?",
    choices: ["相手にどんどんベットされる", "相手が降りてくれる", "何も変わらない", "ポットが小さくなる"],
    answer: 0,
    hint: "「チェックしたら弱い」と相手に分かったら…?",
    explain: "**どんどんベットされる**。だから強い手もチェックに混ぜるんだ。",
    scene: CR(["9s", "9d"], 0, { focus: [2] }),
  },
];

// ───────── 5. GTOとは? ─────────
const G = (hero: string[], bet = 0, extra: Partial<LessonScene> = {}) => CR(hero, bet, extra);

export const WHAT_IS_GTO_STEPS: LessonStep[] = [
  {
    kind: "talk",
    pages: [
      { text: "**GTO**は「**相手にどう対策されても、負けない戦略**」のことだよ。", scene: G(["Jc", "Tc"], 6.8) },
      { text: "じゃんけんで考えてみよう。いつもグーを出す人には、パーで勝てるよね。**かたよると、対策される**んだ。", scene: G(["Jc", "Tc"], 6.8) },
      { text: "でも、グー・チョキ・パーを**3分の1ずつランダム**に出すと、相手はどうやっても勝ち越せない。これがじゃんけんの**GTO**。", scene: G(["Kc", "Kd"]) },
      { text: "ポーカーも同じ。**強い手とブラフをちょうどいい割合**で混ぜると、相手はコールしても降りても得をしない。", scene: G(["Jc", "Tc"], 6.8, { focus: [0] }) },
      { text: "これまで覚えた表(オープンのレンジ・CB・バレル)は、全部この**GTO**の計算から来ているんだ。", scene: G(["Kc", "Kd"], 0, { badge: "best" }) },
      { text: "GTOは**負けない土台**。そこから相手のクセに合わせてずらすのが**エクスプロイト**。それは9章で学ぶよ。", scene: G(["Jc", "Tc"], 6.8) },
    ],
  },
  {
    kind: "quiz",
    question: "GTOとは、どんな戦略?",
    choices: ["相手にどう対策されても負けない戦略", "相手のクセを突いて一番勝つ戦略", "強い手だけで打つ戦略", "いつもブラフする戦略"],
    answer: 0,
    hint: "じゃんけんを3分の1ずつ出すのと同じ考え方だったね。",
    explain: "**対策されても負けない戦略**がGTO。クセを突くのはエクスプロイトだよ。",
    scene: G(["Kc", "Kd"]),
  },
];

// ───────── 6. チェックレイズと CB 頻度の調整 ─────────
// あなた = BB(席0)、バリィ = BTN(席4)がオープンして CB。
const XR = (hero: string[], board: string[], heroBet = 0, ballyBet = 1.8, heroAct?: "raise" | "call" | "check", extra: Partial<LessonScene> = {}) =>
  duel(4, 4, hero, board, 5.5, { bet: heroBet, act: heroAct, stack: 98 - heroBet }, { bet: ballyBet, act: ballyBet ? "bet" : "check", stack: 98 - ballyBet }, extra);
// あなた = UTG(席0)がオープン、バリィ = BTN(席3)がコール。フロップであなたが先に話す(OOP)。
const OOPR = (hero: string[], board: string[], heroBet = 0, extra: Partial<LessonScene> = {}) =>
  duel(3, 3, hero, board, 5.5, heroBet ? { bet: heroBet, act: "bet", stack: 98 - heroBet } : { stack: 98 }, { stack: 98 }, extra);

export const CHECK_RAISE_STEPS: LessonStep[] = [
  {
    kind: "talk",
    pages: [
      { text: "前の席(OOP)の武器が**チェックレイズ**。いったんチェックして、相手のベットに**レイズを返す**ことだよ。", scene: XR(["8c", "8s"], ["8h", "7d", "2c"], 0, 1.8, "check") },
      { text: "BBのきみ。BTNの僕がオープン、きみがコール。フロップ 8・7・2 できみはチェック、僕がCB。", scene: XR(["8c", "8s"], ["8h", "7d", "2c"], 0, 1.8, "check", { focus: [4] }) },
      { text: "きみは**8のセット**!ここで**レイズ**を返そう。サイズは相手のベットの**3.5倍くらい**だよ。", scene: XR(["8c", "8s"], ["8h", "7d", "2c"], 6.3, 1.8, "raise", { badge: "best", focus: [0] }) },
      { text: "チェックレイズは**強い手**と**ドロー**(ストレート・フラッシュを待つ手)でやる。**ポラライズ**だね。", scene: XR(["9c", "6c"], ["8h", "7d", "2c"], 6.3, 1.8, "raise", { badge: "best", focus: [0] }) },
      { text: "次は、**自分がOOPでオープンした**とき。前の席だから、CBの**頻度を下げる**んだ。", scene: OOPR(["As", "Kd"], ["9h", "6d", "3c"], 0, { focus: [0] }) },
      { text: "特に、**Jハイ以下のボード**と**モノトーン**は、OOPのレイザーは**必ずチェック**!", scene: OOPR(["As", "Kd"], ["9h", "6d", "3c"], 0, { badge: "best", focus: [0] }) },
      { text: "低いボードは、後ろでコールした相手の手(ポケットペアやつながった手)に当たりやすいからね。打つと!!大悪手!!だよ。", scene: OOPR(["As", "Kd"], ["9h", "6d", "3c"], 1.8, { badge: "blunder", focus: [0] }) },
    ],
  },
  {
    kind: "spot",
    scene: XR(["8c", "8s"], ["8h", "7d", "2c"], 0, 1.8, "check"),
    prompt: "チェックしたら僕がCB。きみは**8のセット**。どうする?",
    expect: "raise",
    size: [5, 8],
    hint: "強い手は**チェックレイズ**。相手のベットの**3.5倍**くらいだよ。",
    explain: "正解!**チェックレイズ**で大きく取りにいこう。",
  },
  {
    kind: "spot",
    scene: OOPR(["As", "Kd"], ["9h", "6d", "3c"]),
    prompt: "UTGでオープン、BTNの僕がコール。フロップ **9・6・3**。きみが先に話す。どうする?",
    expect: "check",
    hint: "OOPのレイザーは、**Jハイ以下のボードは必ず**…?",
    explain: "そのとおり!**Jハイ以下はチェック**。OOPのCBは減らすよ。",
  },
];

// ───────── 6. プローブベット ─────────
// あなた = BB(席0)、バリィ = BTN(席4)がオープン。フロップは両方チェック。ターンであなたが先に打つ。
const PB = (hero: string[], board: string[], heroBet = 0, extra: Partial<LessonScene> = {}) =>
  duel(4, 4, hero, board, 5.5, heroBet ? { bet: heroBet, act: "bet", stack: 98 - heroBet } : { stack: 98 }, { stack: 98 }, extra);

export const PROBE_STEPS: LessonStep[] = [
  {
    kind: "talk",
    pages: [
      { text: "**プローブベット**は、前の席(OOP)のきみが、**相手がCBを打たなかった次のストリート**で先に打つベットだよ。", scene: PB(["Qd", "9d"], ["Qh", "7c", "4s", "2d"]) },
      { text: "BTNの僕がオープン、BBのきみがコール。フロップ Q・7・4 は**2人ともチェック**。", scene: PB(["Qd", "9d"], ["Qh", "7c", "4s"], 0, { focus: [4] }) },
      { text: "レイザーの僕がCBを打たなかった。ってことは、**僕の手は弱いことが多い**んだ(強い手はたいてい打つからね)。", scene: PB(["Qd", "9d"], ["Qh", "7c", "4s"], 0, { focus: [4] }) },
      { text: "だからターンでは、きみが先に**ベット**して取りにいこう。これが**プローブベット**。", scene: PB(["Qd", "9d"], ["Qh", "7c", "4s", "2d"], 2.8, { badge: "best", focus: [0] }) },
      { text: "ドンクベットとはちがうよ。ドンクは**相手が打つ前に**先に打つこと。プローブは**相手が打たなかったのを見てから**打つことだ。", scene: PB(["Qd", "9d"], ["Qh", "7c", "4s", "2d"], 2.8) },
      { text: "サイズは**ポットの半分くらい**。当たった手も、ドローも、**広く**打っていいよ。", scene: PB(["Qd", "9d"], ["Qh", "7c", "4s", "2d"], 2.8, { focus: [0] }) },
      { text: "リバーも同じ。ターンで相手がチェックしてきたら、リバーで先に打つ**リバーのプローブ**もあるよ。", scene: PB(["Qd", "9d"], ["Qh", "7c", "4s", "2d", "8s"], 5) },
    ],
  },
  {
    kind: "spot",
    scene: PB(["Qd", "9d"], ["Qh", "7c", "4s", "2d"]),
    prompt: "フロップは2人ともチェック。ターン、きみは**Qのペア**で先に話す。どうする?",
    expect: "bet",
    size: [2, 4.5],
    hint: "レイザーがCBを打たなかった = 相手は弱いことが多い。**ポットの半分くらい**で打とう。",
    explain: "正解!**プローブベット**で取りにいこう。",
  },
];

// ───────── 6. ブラフキャッチとリバーのブラフレイズ ─────────
// あなた = BB(席0)、バリィ = BTN(席4)。リバーでバリィがベット。
const BC_BOARD = ["Kh", "9h", "5c", "2d", "3h"];
const BC = (hero: string[], heroBet = 0, heroAct?: "call" | "raise" | "fold", ballyBet = 5, extra: Partial<LessonScene> = {}) =>
  duel(4, 4, hero, BC_BOARD, 10, { bet: heroBet, act: heroAct, folded: heroAct === "fold", stack: 80 - heroBet }, { bet: ballyBet, act: "bet", stack: 80 - ballyBet }, extra);

export const BLUFF_CATCH_STEPS: LessonStep[] = [
  {
    kind: "talk",
    pages: [
      { text: "**ブラフキャッチ**は、相手のブラフを捕まえるために、**勝ってるか分からない手でコール**することだよ。", scene: BC(["Ah", "Kc"]) },
      { text: "まず**MDF(最小ディフェンス頻度)**。\n**MDF = ポット ÷(ポット + 相手のベット)**", scene: BC(["Ah", "Kc"], 0, undefined, 5, { focus: [4] }) },
      { text: "ポット10BBに5BBのベットなら、**10 ÷ 15 = 67%**。これより降りすぎると、相手は**何でもブラフで勝てちゃう**んだ。", scene: BC(["Ah", "Kc"], 0, undefined, 5, { focus: [4] }) },
      { text: "どの手で守るか。決め手は**ブロッカー**。相手の**強い手に使われるカードを自分が持っている**と、相手が強い手を持つ確率が下がる。", scene: BC(["Ah", "Kc"], 0, undefined, 5, { focus: [0] }) },
      { text: "ここではハートが3枚で**フラッシュ**が完成。きみの**A♥**は、相手の一番強いフラッシュ(Aハイフラッシュ)を**ブロック**している!", scene: BC(["Ah", "Kc"], 0, undefined, 5, { focus: [0] }) },
      { text: "だから**A♥を持ったKのペア**は、**コール**で守る。ブロッカーで選ぶのがコツだよ。", scene: BC(["Ah", "Kc"], 5, "call", 5, { badge: "best", focus: [0] }) },
      { text: "もう1つの武器が**リバーのブラフレイズ**。相手のベットに**ブラフでレイズ**を返すんだ。", scene: BC(["Ah", "Qs"], 17, "raise", 5, { focus: [0] }) },
      { text: "使う手は**Aハイ**や**ボードと同じ数字のペア**。相手の**降りてくれる手をブロックしない**こと、**相手の一番強い手をブロックする**ことが大事だよ。", scene: BC(["Ah", "Qs"], 17, "raise", 5, { badge: "best", focus: [0] }) },
      { text: "サイズは**強い手でレイズするときと同じ**。サイズを変えると、ブラフだとバレちゃうからね。", scene: BC(["Ah", "Qs"], 17, "raise") },
    ],
  },
  {
    kind: "quiz",
    question: "ポット10BBに、相手が5BBベット。MDFは?",
    choices: ["33%", "50%", "67%", "75%"],
    answer: 2,
    hint: "MDF = ポット ÷(ポット + ベット)= 10 ÷ 15。",
    explain: "**10 ÷ 15 = 67%**。これくらいは守らないと、ブラフで勝たれ放題になるよ。",
    scene: BC(["Ah", "Kc"]),
  },
  {
    kind: "spot",
    scene: BC(["Ah", "Kc"]),
    prompt: "リバーでフラッシュが完成。僕が**5BB**ベット。きみは**A♥とKのペア**。どうする?",
    expect: "call",
    hint: "きみの**A♥**は、相手の一番強いフラッシュを**ブロック**しているよ。",
    explain: "正解!**ブロッカーを持ったブラフキャッチャーはコール**。",
  },
];

// ───────── 7. ショートスタック戦術 ─────────
// プッシュ/フォールド。アンティは BB が払う(ポット 1)。M = スタック ÷(SB + BB + アンティ = 2.5)。
const SHORT = (button: number, hero: string[], stack: number, act?: "allIn" | "fold", extra: Partial<LessonScene> = {}): LessonScene => {
  const sb = (button + 1) % 6;
  const bb = (button + 2) % 6;
  const seats = [0, 1, 2, 3, 4, 5].map((s) =>
    s === 0
      ? { stack: act === "allIn" ? 0 : stack, bet: act === "allIn" ? stack : 0, act, folded: act === "fold" }
      : s === sb
        ? { bet: 0.5 }
        : s === bb
          ? { bet: 1, name: "バリィ" }
          : {},
  );
  return { hero, table: six(button, seats, 1), ...extra };
};

export const SHORT_STACK_STEPS: LessonStep[] = [
  {
    kind: "talk",
    pages: [
      { text: "スタックが**15BB以下**になったら、**オールインかフォールド**の2択で戦うよ(プッシュ/フォールド)。", scene: SHORT(0, ["As", "2d"], 10) },
      { text: "少ないスタックでレイズすると、**コミット(ちょい残し)**になっちゃう。だから最初から**オールイン**なんだ。", scene: SHORT(0, ["As", "2d"], 10, "allIn", { focus: [0] }) },
      { text: "どの手で押すかは**パワーナンバー**で決める。まず**M** = スタック ÷(SB + BB + アンティ)。", scene: SHORT(0, ["As", "2d"], 10) },
      { text: "BTNで10BBなら、**M = 10 ÷ 2.5 = 4**。", scene: SHORT(0, ["As", "2d"], 10, undefined, { focus: [0] }) },
      { text: "次に**有効M** = M × **後ろに控えている人数**。BTNの後ろはSBとBBの**2人**だから、**4 × 2 = 8**。", scene: SHORT(0, ["As", "2d"], 10, undefined, { focus: [0] }) },
      { text: "**A2oのパワーナンバーは15**。**有効M(8)が15より小さい**から、**オールイン**だ!", scene: SHORT(0, ["As", "2d"], 10, "allIn", { badge: "best", focus: [0] }) },
      { text: "UTGで10BBの**K8o**なら?後ろは**5人**で、有効M = 4 × 5 = **20**。K8oのナンバーは**17**。20は17より大きいから!!フォールド!!。", scene: SHORT(3, ["Ks", "8d"], 10, "fold", { focus: [0] }) },
      { text: "まとめ!**有効M < パワーナンバーならオールイン**。後ろの人数が少ない席ほど、広く押せるよ。", scene: SHORT(0, ["As", "2d"], 10, "allIn") },
    ],
  },
  {
    kind: "spot",
    scene: SHORT(0, ["As", "2d"], 10),
    prompt: "BTNで**10BB**、手は**A2o**(パワーナンバー15)。みんな降りてきた。どうする?",
    expect: "allIn",
    hint: "有効M = 10 ÷ 2.5 × 2 = 8。15より小さい?",
    explain: "正解!**有効M 8 < 15** だから**オールイン**。",
  },
  {
    kind: "spot",
    scene: SHORT(3, ["Ks", "8d"], 10),
    prompt: "UTGで**10BB**、手は**K8o**(パワーナンバー17)。どうする?",
    expect: "fold",
    hint: "有効M = 4 × 5人 = 20。17より大きいよ。",
    explain: "正解!**有効M 20 > 17** だから**フォールド**。前の席は押せる手が少ないよ。",
  },
];

// ───────── 7. ICM ─────────
export const ICM_STEPS: LessonStep[] = [
  {
    kind: "talk",
    pages: [
      { text: "**ICM**は、トーナメントの**チップを賞金の価値に置き換える**考え方だよ。", scene: SHORT(0, ["Ah", "Jd"], 20) },
      { text: "トーナメントでは、**チップが2倍になっても、賞金の期待値は2倍にならない**。優勝しても全部の賞金はもらえないからね。", scene: SHORT(0, ["Ah", "Jd"], 20, "allIn") },
      { text: "だから、**チップを失う痛み**の方が、**同じだけ増える喜び**より**大きい**んだ。", scene: SHORT(0, ["Ah", "Jd"], 20, "fold", { focus: [0] }) },
      { text: "特に**賞金が出る直前(バブル)**や**最終テーブル**では、飛ぶと賞金がゼロ。**オールインへのコールはかなりきつく**するよ。", scene: SHORT(0, ["Ah", "Jd"], 20, "fold", { badge: "best", focus: [0] }) },
      { text: "反対に、**自分がたくさん持っている(カバーしている)**ときは、相手が飛ぶのを怖がるから、**どんどん押していい**。", scene: SHORT(0, ["Ks", "9d"], 20, "allIn", { focus: [0] }) },
      { text: "まとめ!ICMでは、**守るときはかたく**、**攻めるときは強気に**。チップの多さで立場が変わるよ。", scene: SHORT(0, ["Ah", "Jd"], 20) },
    ],
  },
  {
    kind: "quiz",
    question: "賞金が出る直前(バブル)で、相手のオールインへのコールはどうする?",
    choices: ["ふだんよりかなりきつくする", "ふだんより広くする", "ふだんと同じ", "何でもコールする"],
    answer: 0,
    hint: "飛ぶと賞金がゼロ。チップを失う痛みは大きいよ。",
    explain: "**ふだんよりきつく**。ICMでは、失う痛みの方が大きいからね。",
    scene: SHORT(0, ["Ah", "Jd"], 20, "fold"),
  },
  {
    kind: "quiz",
    question: "トーナメントでチップが2倍になると、賞金の期待値は?",
    choices: ["2倍より少なく増える", "ちょうど2倍になる", "2倍より多く増える", "変わらない"],
    answer: 0,
    hint: "優勝しても、賞金の全部はもらえないよね。",
    explain: "**2倍より少なく**しか増えない。だから失わないことが大事なんだ。",
    scene: SHORT(0, ["Ah", "Jd"], 20),
  },
];

// ───────── 8. ライト3bet ─────────
// あなた = BTN(席0)、バリィ = CO(席5)が 2BB でオープン。
const L3 = (hero: string[], heroBet = 0, heroAct?: "raise" | "fold", extra: Partial<LessonScene> = {}): LessonScene => ({
  hero,
  table: six(0, [{ bet: heroBet, act: heroAct, folded: heroAct === "fold", stack: 100 - heroBet }, { bet: 0.5 }, { bet: 1 }, F, F, { name: "バリィ", bet: 2, act: "raise", stack: 98 }], 1),
  ...extra,
});

export const LIGHT_3BET_STEPS: LessonStep[] = [
  {
    kind: "talk",
    pages: [
      { text: "**ライト3bet**は、**そこまで強くない手**で3betすることだよ。", scene: L3(["As", "5s"]) },
      { text: "COの僕が**2BBでオープン**。BTNのきみは**A5s**。", scene: L3(["As", "5s"], 0, undefined, { focus: [5] }) },
      { text: "A5sは**コールするには弱い**けど、**Aを持っている**から相手のAAやAKが減る(ブロッカー)。しかもストレートやフラッシュの夢もある。", scene: L3(["As", "5s"], 0, undefined, { focus: [0] }) },
      { text: "こういう手は**3bet**!相手が降りればそのまま勝ち、コールされても戦える。サイズは**3倍(6BB)**だよ。", scene: L3(["As", "5s"], 6, "raise", { badge: "best", focus: [0] }) },
      { text: "表でも、BTNからCOのオープンには、**A5s**や**76s**を**3betする割合が高い**んだ。", scene: L3(["7s", "6s"], 6, "raise", { range: { scene: "vsOpen_BTN_vs_CO" } }) },
      { text: "ポイント!ライト3betは**後ろの席(IP)**から、**後ろの方の席のオープン**に対してやるのが基本だよ。", scene: L3(["As", "5s"], 6, "raise") },
    ],
  },
  {
    kind: "spot",
    scene: L3(["As", "5s"]),
    prompt: "COの僕が2BBでオープン。BTNのきみは**A5s**。どうする?",
    expect: "raise",
    size: [5, 7],
    hint: "Aのブロッカーと夢のある手。**3倍(6BB)**で**ライト3bet**だよ。",
    explain: "正解!**A5sはライト3bet**の代表だよ。",
  },
];

// ───────── 8. スクイーズ ─────────
// バリィ = UTG(席3)が 2BB でオープン、HJ(席4)がコール。あなた = BTN(席0)。
const SQ = (hero: string[], heroBet = 0, heroAct?: "raise", extra: Partial<LessonScene> = {}): LessonScene => ({
  hero,
  table: six(0, [{ bet: heroBet, act: heroAct, stack: 100 - heroBet }, { bet: 0.5 }, { bet: 1 }, { name: "バリィ", bet: 2, act: "raise", stack: 98 }, { bet: 2, act: "call", stack: 98 }, F], 1),
  ...extra,
});

export const SQUEEZE_STEPS: LessonStep[] = [
  {
    kind: "talk",
    pages: [
      { text: "**スクイーズ**は、**オープンとコール**が入ったところに**3bet**を打つことだよ。", scene: SQ(["Ac", "Qd"]) },
      { text: "UTGの僕が**2BBでオープン**、HJの**リク**が**コール**。BTNのきみは**AQo**。", scene: SQ(["Ac", "Qd"], 0, undefined, { focus: [3] }) },
      { text: "コールした人は、**3betしなかった = そこまで強くない**ことが多い。挟まれた(スクイーズされた)2人は、**どっちも続けにくい**んだ。", scene: SQ(["Ac", "Qd"], 0, undefined, { focus: [4] }) },
      { text: "サイズは**ふつうの3bet + コールした人数ぶん**。3倍の6BBに、コール1人ぶんの2BBを足して**8BB**くらい。", scene: SQ(["Ac", "Qd"], 8, "raise", { badge: "best", focus: [0] }) },
      { text: "ポットに**チップがたくさん入っている**から、降りてもらうだけで大きく取れる。スクイーズは**強い手**と**ライト3betの手**でやるよ。", scene: SQ(["As", "5s"], 8, "raise", { badge: "best" }) },
    ],
  },
  {
    kind: "spot",
    scene: SQ(["Ac", "Qd"]),
    prompt: "UTGの僕が2BBでオープン、HJがコール。BTNのきみは**AQo**。どうする?",
    expect: "raise",
    size: [7, 10.5],
    hint: "**スクイーズ**!3倍の6BBに、コールした人の分を足そう。",
    explain: "正解!**8BBくらいのスクイーズ**だよ。",
  },
];

// ───────── 8. BBからのポラーな3bet ─────────
const BB3 = (hero: string[], heroBet = 1, heroAct?: "raise" | "call", extra: Partial<LessonScene> = {}): LessonScene => ({
  hero,
  table: six(4, [{ bet: heroBet, act: heroAct, stack: 100 - heroBet }, F, F, F, { name: "バリィ", bet: 2, act: "raise", stack: 98 }, { ...F, bet: 0.5 }], 1),
  ...extra,
});

export const BB_POLAR_STEPS: LessonStep[] = [
  {
    kind: "talk",
    pages: [
      { text: "BBの3betは**ポラー(両端)**にするよ。**とても強い手**と**ブラフ**だけで3betして、**真ん中はコール**。", scene: BB3(["Ah", "Ad"], 8, "raise", { range: { scene: "vsOpen_BB_vs_BTN" } }) },
      { text: "反対は**リニア**。強い順に上から3betする作り方だね。BBは**コールが安い**から、真ん中の手はコールで十分なんだ。", scene: BB3(["Qs", "Jh"], 2, "call", { badge: "best" }) },
      { text: "上の端は **AA・KK・QQ・AK・AQ** など。", scene: BB3(["Ah", "Ad"], 8, "raise", { badge: "best", focus: [0] }) },
      { text: "下の端(ブラフ)は **54s・T7s** みたいな、**弱いけどスーテッドでつながった手**。降りてもらえれば勝ち、コールされても当たれば大きいよ。", scene: BB3(["5s", "4s"], 8, "raise", { badge: "best", focus: [0] }) },
      { text: "サイズは**相手の4倍(8BB)**くらい。BBは前の席(OOP)だから大きめだよ。", scene: BB3(["5s", "4s"], 8, "raise") },
    ],
  },
  {
    kind: "spot",
    scene: BB3(["5s", "4s"]),
    prompt: "BTNの僕が2BBでオープン。BBのきみは**54s**。表どおりにいこう。",
    expect: "raise",
    size: [7, 10],
    hint: "ポラーな3betの**下の端(ブラフ)**だよ。4倍が目安。",
    explain: "正解!**54sはポラーな3betのブラフ**側だよ。",
  },
  {
    kind: "spot",
    scene: BB3(["Qs", "Jh"]),
    prompt: "今度は**QJo**。どうする?",
    expect: "call",
    hint: "**真ん中の手**はどうするんだったかな?",
    explain: "正解!**真ん中はコール**。ポラーな3betは両端だけだよ。",
  },
];

// ───────── 8. BvB ─────────
// あなた = SB(席0)、バリィ = BB(席1)。ボタンは席5(降りた)。
const BVB = (hero: string[], heroBet = 0.5, heroAct?: "raise" | "fold" | "call", extra: Partial<LessonScene> = {}): LessonScene => ({
  hero,
  table: six(5, [{ bet: heroBet, act: heroAct, folded: heroAct === "fold", stack: 40 - heroBet }, { name: "バリィ", bet: 1, stack: 39 }, F, F, F, F], 1),
  ...extra,
});

export const BVB_STEPS: LessonStep[] = [
  {
    kind: "talk",
    pages: [
      { text: "**BvB(ブラインドバトル)**は、みんな降りて**SBとBBの2人だけ**になった勝負だよ。", scene: BVB(["Jd", "4c"]) },
      { text: "復習!プリフロップでは**コールで参加しない**、**レイズかフォールド**って教えたよね。", scene: BVB(["Jd", "4c"], 2.5, "raise") },
      { text: "でも**BvBのSBだけは例外**。SBは**リンプ(コール)をたくさんしてOK**なんだ!", scene: BVB(["Jd", "4c"], 1, "call", { badge: "best", focus: [0] }) },
      { text: "理由は2つ。SBは**もう0.5BB払っている**から、あと**0.5BB足すだけ**で参加できる。しかも相手は**BBの1人だけ**。", scene: BVB(["Jd", "4c"], 1, "call", { focus: [0] }) },
      { text: "表を見て。SBは**ほとんどの手でリンプ**(緑)。**J4o**みたいな手もリンプでいいんだ。", scene: BVB(["Jd", "4c"], 1, "call", { range: { scene: "RFI_SB" } }) },
      { text: "**レイズ**(赤)は**AJs・ATs・KQs**のような手が中心。**AAやKKでもリンプを混ぜる**んだよ。", scene: BVB(["Ks", "Qs"], 2.5, "raise", { badge: "best", focus: [0] }) },
      { text: "降りるのは**72o・92o・83o**みたいな、**本当に弱い手だけ**!", scene: BVB(["7d", "2c"], 0.5, "fold", { focus: [0] }) },
      { text: "まとめ!**BvBのSBは、リンプをたくさん**。弱すぎる手だけフォールド。ほかの席ではこれまでどおり**レイズかフォールド**だよ。", scene: BVB(["Jd", "4c"], 1, "call") },
    ],
  },
  {
    kind: "spot",
    scene: BVB(["Jd", "4c"]),
    prompt: "みんな降りてBvB。SBのきみは**J4o**。どうする?",
    expect: "call",
    hint: "BvBのSBだけは例外。**あと0.5BBで参加**できるよ。",
    explain: "正解!BvBのSBは**リンプ(コール)**をたくさんしてOK。",
  },
  {
    kind: "spot",
    scene: BVB(["7d", "2c"]),
    prompt: "今度は**72o**。どうする?",
    expect: "fold",
    hint: "SBでも、**本当に弱い手**は降りるんだったね。",
    explain: "正解!**72o**は**フォールド**。降りるのはこういう手だけだよ。",
  },
];

// ───────── 9. ナッシュ均衡とGTO ─────────
export const NASH_STEPS: LessonStep[] = [
  {
    kind: "talk",
    pages: [
      { text: "**ナッシュ均衡**は、「**全員が、自分だけ作戦を変えても得しない**」状態のことだよ。", scene: SHORT(0, ["As", "2d"], 10, "allIn") },
      { text: "ポーカーの**GTO**は、このナッシュ均衡の戦略のこと。お互いがGTOだと、**どっちもずらす理由がない**んだ。", scene: SHORT(0, ["As", "2d"], 10, "allIn", { badge: "best" }) },
      { text: "ショートスタックの**パワーナンバー**も、ナッシュ均衡の計算から作られた表なんだよ。", scene: SHORT(0, ["As", "2d"], 10, "allIn", { focus: [0] }) },
      { text: "大事なのは、GTOは**相手がどう来ても大負けしない**こと。でも、**相手のミスから最大に取る**戦略ではないんだ。", scene: SHORT(3, ["Ks", "8d"], 10, "fold") },
      { text: "相手のミスから最大に取るのが**エクスプロイト**。次の回で学ぼう!", scene: SHORT(0, ["As", "2d"], 10) },
    ],
  },
  {
    kind: "quiz",
    question: "ナッシュ均衡とは?",
    choices: ["全員が、自分だけ作戦を変えても得しない状態", "一番強い人が必ず勝つ状態", "全員がブラフしない状態", "全員が同じ手を持つ状態"],
    answer: 0,
    hint: "誰も「ずらす理由」がない状態だよ。",
    explain: "**自分だけ変えても得しない状態**。ポーカーのGTOはこれだよ。",
    scene: SHORT(0, ["As", "2d"], 10, "allIn"),
  },
];

// ───────── 9. エクスプロイト戦略とは ─────────
const EX = (hero: string[], bet = 0, extra: Partial<LessonScene> = {}) => TV(hero, bet, extra);

export const EXPLOIT_WHAT_STEPS: LessonStep[] = [
  {
    kind: "talk",
    pages: [
      { text: "**エクスプロイト**は、**相手のクセを見つけて、そこを突く**戦略だよ。", scene: EX(["Kd", "Th"], 9) },
      { text: "じゃんけんで、いつもグーを出す人にはパー。ポーカーでも**かたよった相手には、かたよりで返す**んだ。", scene: EX(["Kd", "Th"], 9) },
      { text: "ただし注意!エクスプロイトは**自分もかたよる**から、**相手に気づかれると逆に突かれる**。", scene: EX(["Qd", "Jh"], 9, { badge: "blunder" }) },
      { text: "だから基本は**GTO**。相手のクセが**はっきり見えたときだけ**、少しずつずらすのがコツだよ。", scene: EX(["Kd", "Th"], 0, { badge: "best" }) },
    ],
  },
  {
    kind: "quiz",
    question: "エクスプロイト戦略とは?",
    choices: ["相手のクセを突く戦略", "対策されても負けない戦略", "いつも同じ打ち方をする戦略", "強い手しか使わない戦略"],
    answer: 0,
    hint: "いつもグーの人にはパー、だったね。",
    explain: "**相手のクセを突く**のがエクスプロイト。対策されても負けないのはGTOだよ。",
    scene: EX(["Kd", "Th"], 9),
  },
];

// ───────── 9. 実際のエクスプロイト戦略 ─────────
export const EXPLOIT_PRACTICE_STEPS: LessonStep[] = [
  {
    kind: "talk",
    pages: [
      { text: "よくいる相手のタイプと、その突き方を覚えよう。", scene: EX(["Kd", "Th"]) },
      { text: "①**何でもコールする人(コーリングステーション)**。→ **バリューを増やす**(シンバリューも打つ)、!!ブラフは減らす!!。", scene: EX(["Kd", "Th"], 9, { badge: "best", focus: [0] }) },
      { text: "②**すぐ降りる人(タイトな人)**。→ **ブラフを増やす**。オープンやCBで、どんどんチップを取ろう。", scene: EX(["Qd", "Jh"], 9, { badge: "best", focus: [0] }) },
      { text: "③**攻めてばかりの人(アグレッシブ)**。→ 強い手で**チェックして打たせる**。ブラフキャッチを**広く**。", scene: EX(["Kc", "Kd"], 0, { badge: "best" }) },
      { text: "④**めったに攻めない人がレイズしてきた**とき。→ **本当に強い**ことが多いから、!!降りてOK!!。", scene: EX(["Kd", "Th"], 0) },
      { text: "まとめ!**相手のかたよりと反対に、自分をずらす**。それがエクスプロイトだよ。", scene: EX(["Kd", "Th"], 9) },
    ],
  },
  {
    kind: "spot",
    scene: TV(["Qd", "Jh"]),
    prompt: "相手は**何でもコールする人**。リバーで**Qハイ(何もない)**、相手はチェック。どうする?",
    expect: "check",
    hint: "コールしすぎる相手には**ブラフを減らす**んだったね。",
    explain: "正解!コーリングステーションには**ブラフしない**。チェックでいいよ。",
  },
  {
    kind: "quiz",
    question: "すぐ降りるタイトな相手には、どうする?",
    choices: ["ブラフを増やす", "バリューだけで打つ", "何でもコールする", "全部チェックする"],
    answer: 0,
    hint: "相手が降りてくれるなら…?",
    explain: "**ブラフを増やす**!降りてくれる相手からは、どんどん取れるよ。",
    scene: EX(["Qd", "Jh"], 9),
  },
];
