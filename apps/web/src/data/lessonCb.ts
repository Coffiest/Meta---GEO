import type { LessonScene, LessonStep } from "./lessons";
import { six } from "./lessonBasics";

/**
 * 「5. IP戦略: CB と BMCB(スタブ)」(こちらで作成。オーナー指示: 基本はレンジで33%、例外だけ表で覚える)。
 * 中身は棋譜解析の判定と同じ表: CB = knowledge/flop-cb.md(review/flopCb.ts)、BMCB = review/bmcb.ts。
 * 額は BB 単位。シングルレイズドポット(BTN 2BB オープン → BB コール)でフロップのポットは 5.5BB。
 */
const F = { folded: true };

/** CB: あなた = BTN(席0)がオープン、バリィ = BB(席2)がコールしてフロップでチェック。 */
const CB = (hero: string[], board: string[], heroBet = 0, extra: Partial<LessonScene> = {}): LessonScene => ({
  hero,
  board,
  table: six(0, [
    { bet: heroBet, act: heroBet ? "bet" : undefined, stack: 98 - heroBet },
    F,
    { name: "バリィ", act: "check", stack: 98 },
    F,
    F,
    F,
  ], 5.5),
  ...extra,
});

/** BMCB: バリィ = UTG(席4)がオープン、あなた = BTN(席0)がコール。フロップでバリィがチェック。 */
const BM = (hero: string[], board: string[], heroBet = 0, extra: Partial<LessonScene> = {}): LessonScene => ({
  hero,
  board,
  table: six(0, [
    { bet: heroBet, act: heroBet ? "bet" : undefined, stack: 98 - heroBet },
    F,
    F,
    F,
    { name: "バリィ", act: "check", stack: 98 },
    F,
  ], 5.5),
  ...extra,
});

const CB_CHART = {
  title: "CB(自分がオープン → 相手がチェック)",
  rows: [
    { label: "基本(ほとんどのボード)", value: "レンジで 33%", tone: "accent" as const },
    { label: "例外1 モノトーン(3枚同じマーク)", value: "あまり打たない(4回に1回)", tone: "warn" as const },
    { label: "例外2 3枚同じ数字", value: "全部の手で打つ", tone: "accent" as const },
    { label: "例外3 A〜Jハイで上2枚がつながる(AKQ・KQ9 など)", value: "大きく(ポットより大きく)", tone: "warn" as const },
    { label: "例外4 Tハイ・9ハイ", value: "大きいサイズも混ぜる", tone: "warn" as const },
  ],
};

const BM_CHART = {
  title: "BMCB(相手のオープンにコール → 相手がチェック)",
  rows: [
    { label: "基本(低い・つながったボード / ペアのボード / モノトーン)", value: "レンジで 33%", tone: "accent" as const },
    { label: "例外1 高いボード(K72・AJ4 など)", value: "強い手とブラフだけ 80% で大きく", tone: "warn" as const },
    { label: "例外2 AかKのモノトーン", value: "全部チェック", tone: "danger" as const },
    { label: "例外3 絵札だけのペアボード(KKQ など)", value: "全部チェック", tone: "danger" as const },
  ],
};

export const CB_BMCB_STEPS: LessonStep[] = [
  {
    kind: "talk",
    pages: [
      { text: "**CB(コンティニュエーションベット)**は、プリフロップで**レイズした人が、フロップでも続けて打つベット**だよ。", scene: CB(["As", "Jd"], ["Kc", "7h", "2d"], 0, { focus: [0] }) },
      { text: "BTNのきみが2BBでオープン、BBの僕がコール。フロップで僕は**チェック**したよ。", scene: CB(["As", "Jd"], ["Kc", "7h", "2d"], 0, { focus: [2] }) },
      { text: "覚えることはシンプル。**基本はレンジ(どの手でも)で33%**のベット!例外だけ覚えよう。", scene: CB(["As", "Jd"], ["Kc", "7h", "2d"], 1.8, { chart: CB_CHART, badge: "best" }) },
      { text: "K・7・2なら**例外じゃない**。だから手に関係なく**ポットの33%**。", scene: CB(["As", "Jd"], ["Kc", "7h", "2d"], 1.8, { badge: "best", focus: [0] }) },
      { text: "例外1 **モノトーン**。3枚とも同じマークだと、相手のフラッシュがこわいから**あまり打たない**よ。", scene: CB(["As", "Jd"], ["9h", "6h", "3h"], 0, { focus: [0] }) },
      { text: "例外2 **3枚同じ数字**。ほとんどの手が何も持っていないから、**全部の手で打つ**よ。", scene: CB(["As", "Jd"], ["8c", "8h", "8d"], 1.8) },
      { text: "例外3 **A〜Jハイで、上の2枚がつながっている**ボード(A・K・Q など)。レイズした側がとても有利だから**大きく**打つ!", scene: CB(["As", "Jd"], ["Ac", "Kh", "4d"], 7, { focus: [0] }) },
      { text: "例外4 **Tハイ・9ハイ**のボードは、**大きいサイズも混ぜる**よ。", scene: CB(["As", "Jd"], ["Tc", "8h", "3d"], 4) },
    ],
  },
  {
    kind: "spot",
    scene: CB(["Qs", "Jd"], ["Kc", "7h", "2d"]),
    prompt: "BTNでオープンして、K・7・2で僕がチェック。きみは**QJ**(何も当たってない)。どうする?",
    expect: "bet",
    size: [1.5, 2.3],
    hint: "例外じゃないボードは**手に関係なくレンジで33%**だよ。",
    explain: "正解!例外じゃないから、何も当たってなくても**33%のCB**だよ。",
  },
  {
    kind: "talk",
    pages: [
      { text: "次は**BMCB**。プリフロップで**相手がレイズ、きみがコール**。フロップで**相手がCBを打たずにチェック**したときのベットだよ。**スタブ**とも言うね。", scene: BM(["9s", "8s"], ["7c", "6h", "2d"], 0, { focus: [4] }) },
      { text: "相手がCBを打たないのは、**強い手が少ない**しるし。だから**基本はレンジで33%**で、どんどん打っていこう!", scene: BM(["9s", "8s"], ["7c", "6h", "2d"], 1.8, { chart: BM_CHART, badge: "best" }) },
      { text: "例外1 **高いボード**(K・7・2 など)。ここは**強い手とブラフだけ**、**80%くらいの大きいサイズ**で打つ。それ以外はチェック。", scene: BM(["Ah", "Ks"], ["Kc", "7h", "2d"], 4.4, { focus: [0], badge: "best" }) },
      { text: "例外2 **AかKのモノトーン**は、**全部チェック**。", scene: BM(["9s", "8s"], ["Kh", "8h", "3h"], 0, { badge: "best" }) },
      { text: "例外3 **絵札だけのペアボード**(K・K・Q など)も、**全部チェック**だよ。", scene: BM(["9s", "8s"], ["Kc", "Kh", "Qd"], 0, { badge: "best" }) },
    ],
  },
  {
    kind: "spot",
    scene: BM(["As", "Jd"], ["7c", "6h", "2d"]),
    prompt: "僕がオープン、きみがBTNでコール。7・6・2で僕がチェック。きみは**AJ**。どうする?",
    expect: "bet",
    size: [1.5, 2.3],
    hint: "低くてつながったボードは**基本どおり、レンジで33%**だよ。",
    explain: "正解!BMCBの基本は**レンジで33%**。",
  },
  {
    kind: "spot",
    scene: BM(["9s", "8s"], ["Kh", "8h", "3h"]),
    prompt: "今度はK・8・3のハートのモノトーン。僕がチェック。きみは**98**。どうする?",
    expect: "check",
    hint: "**Kのモノトーン**は例外だったよね。",
    explain: "そのとおり!**AかKのモノトーンは全部チェック**だよ。",
  },
];
