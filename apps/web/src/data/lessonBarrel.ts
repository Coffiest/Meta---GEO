import type { LessonScene, LessonStep } from "./lessons";
import { six } from "./lessonBasics";
import { BARREL_TABLE } from "./barrelTable";

/**
 * 「5. IP戦略: ターンバレル・リバーバレルとポラライズ」(こちらで作成。オーナー指示: 既存のバレルの表を使い、ポラライズの考え方から)。
 * 表は棋譜解析と同じ `barrelTable.ts`(例はフロップ K♥8♦3♥)。あなた = BTN(席0)がオープンしてフロップで 33% の CB、
 * バリィ = BB(席2)がコールしてターンでチェック。額は BB 単位(ターンのポットは 9BB)。
 */
const F = { folded: true };
const FLOP = ["Kh", "8d", "3h"];

const T = (hero: string[], turn: string | null, heroBet = 0, extra: Partial<LessonScene> = {}, river: string | null = null): LessonScene => ({
  hero,
  board: [...FLOP, ...(turn ? [turn] : []), ...(river ? [river] : [])],
  table: six(0, [
    { bet: heroBet, act: heroBet ? "bet" : undefined, stack: 96 - heroBet },
    F,
    { name: "バリィ", act: turn ? "check" : undefined, stack: 96 },
    F,
    F,
    F,
  ], 9),
  ...extra,
});

const tone = (s: string) => (s.includes("75") || s.includes("ジオメトリック") ? ("warn" as const) : ("accent" as const));
const BARREL_CHART = {
  title: "ターンに落ちたカードで決める(フロップ K・8・3)",
  rows: (["overcard", "paired", "flush", "rag"] as const).map((k) => ({
    label: `${BARREL_TABLE[k].title}(例 ${BARREL_TABLE[k].example})`,
    value: `半分くらい打つ・${BARREL_TABLE[k].size}`,
    tone: tone(BARREL_TABLE[k].size),
  })),
};

export const BARREL_STEPS: LessonStep[] = [
  {
    kind: "talk",
    pages: [
      { text: "今日は**ポラライズ**から。ポラライズっていうのは、ベットする手を**とても強い手**と**ブラフ**の**両端だけ**にすることだよ。", scene: T(["Ks", "Qd"], null) },
      { text: "**真ん中くらいの手はチェック**。打っても、負けてる強い手にしかコールされないからね(マージナルベットの回を思い出して)。", scene: T(["9s", "9d"], "As", 0, { badge: "best", focus: [0] }) },
      { text: "強い手とブラフの両方で大きく打つと、相手は**どっちか分からなくて困る**。これがポラライズの強さなんだ。", scene: T(["Jc", "Tc"], "As", 6.8, { focus: [0] }) },
      { text: "BTNのきみがオープン、BBの僕がコール。フロップ**K・8・3**できみがCB、僕がコール。ターンで僕は**チェック**したよ。", scene: T(["Ks", "Qd"], null, 0, { focus: [2] }) },
      { text: "ターンでもう一度打つのが**ターンバレル(ダブルバレル)**。**落ちたカードの種類**で打ち方が決まるよ。", scene: T(["Ks", "Qd"], "As", 0, { chart: BARREL_CHART }) },
      { text: `**${BARREL_TABLE.overcard.title}**(A など)。${BARREL_TABLE.overcard.sizeLine}。**強いワンペア以上とドロー**で打つよ。`, scene: T(["Jc", "Tc"], "As", 6.8, { badge: "best", focus: [0] }) },
      { text: "J・Tは何も当たってないけど、**Qが来ればストレート**(ガットショット)。だから**ブラフで75%**!", scene: T(["Jc", "Tc"], "As", 6.8, { focus: [0] }) },
      { text: "**KK(トップセット)**はあえて**チェック**。チェックした手の中にも強い手を残しておくと、相手が攻めにくくなるんだ。", scene: T(["Kc", "Kd"], "As", 0, { badge: "best", focus: [0] }) },
      { text: `**${BARREL_TABLE.paired.title}**(8 など)も**75%**。**トリップス以上とドロー**で打つよ。`, scene: T(["Ah", "5h"], "8s", 6.8, { badge: "best" }) },
      { text: `**${BARREL_TABLE.flush.title}**(ハートの J など)は**50%**の小さめ。ピュアブラフはしないよ。`, scene: T(["Ad", "Kc"], "Jh", 4.5, { badge: "best" }) },
      { text: `**${BARREL_TABLE.rag.title}**(6 など、何も変わらないカード)は、**ジオメトリックサイズ**(リバーでちょうどオールインになる大きさ)で大きく打つよ。`, scene: T(["Kc", "Jd"], "6s", 14, { badge: "best" }) },
      { text: "**リバーバレル(トリプルバレル)**も**同じ表**でいいよ。ちがうのは**ブラフの選び方**だけ。", scene: T(["Jc", "Tc"], "6s", 0, {}, "2c") },
      { text: "リバーのブラフは**外れたストレートドロー**で打つ。**外れたフラッシュドローではブラフしない**!相手の降りてくれる手(同じく外れたフラッシュドロー)を自分で消しちゃうからね。", scene: T(["Ah", "5h"], "6s", 0, { focus: [0] }, "2c") },
    ],
  },
  {
    kind: "spot",
    scene: T(["Jc", "Tc"], "As"),
    prompt: "ターンに**A**が落ちて、僕はチェック。きみは**J・T**(Qが来ればストレート)。どうする?",
    expect: "bet",
    size: [5.5, 8.5],
    hint: "オーバーカードは**75%でポラライズ**。ガットショットは**ブラフ**で打つよ。",
    explain: "正解!ガットショットは**75%のブラフ**。強い手と同じサイズで打つのがポラライズだよ。",
  },
  {
    kind: "spot",
    scene: T(["9s", "9d"], "As"),
    prompt: "同じターンで、今度は**99**。どうする?",
    expect: "check",
    hint: "99は**真ん中の手**。強くもないし、ブラフでもないよね。",
    explain: "そのとおり!**真ん中の手はチェック**。ポラライズでは両端だけ打つよ。",
  },
  {
    kind: "spot",
    scene: T(["Ah", "5h"], "6s", 0, {}, "2c"),
    prompt: "リバーで**フラッシュドローが外れた**。Aハイだけ。僕はチェック。どうする?",
    expect: "check",
    hint: "外れたフラッシュドローでブラフすると、相手の降りてくれる手を自分で消しちゃうよ。",
    explain: "正解!**外れたフラッシュドローはリバーのブラフに使わない**。チェックしよう。",
  },
];
