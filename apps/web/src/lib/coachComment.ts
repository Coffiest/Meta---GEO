import type { ReviewedDecision } from "@/lib/reviewApi";

/**
 * コーチのルール(サーバーの `judgeCoach`)の判定を、バリィの台詞と「詳しく見る」の本文にする。
 * 言葉は `packages/engine/knowledge/terminology.md` に揃える。
 *
 * 出典:
 *  - コミット: 木原直哉「コミットとは何か」/ ゼロポーカー「ポットコミットとは?」
 *  - BMCB: ゼロポーカー「CBを打たなかった相手にIPが打つ BMCB の使い方と対策」
 *  - MDF: ポーカーアカデミー「MDF(最小ディフェンス頻度)」
 *  - リバーのブラフレイズ: SauloCosta「リバーブラフレイズについての究極のガイド」(てっぺー訳)
 */

export type CoachData = NonNullable<ReviewedDecision["coach"]>;

export interface CoachNote {
  title: string;
  summary: string;
  body: string;
  points?: { label: string; text: string }[];
  sourceUrl?: string;
}

const SRC = {
  kihara: "https://kihara-poker.hatenablog.com/entry/2018/01/30/144658",
  potcommit: "https://zero-poker.com/potcommit/",
  bmcb: "https://zero-poker.com/bmcb/",
  mdf: "https://pokeracademy.jp/glossary/mdf/",
  riverRaise: "https://note.com/liz3rdtp/n/nf29e745eec66",
};

const pct = (v: number | undefined | null) => (v == null ? "-" : `${Math.round(v * 100)}%`);
const bb = (v: number | undefined | null) => (v == null ? "-" : `${v.toFixed(1)}bb`);

const SUIT: Record<string, string> = { s: "♠", h: "♥", d: "♦", c: "♣" };
/** "Ah" → "A♥" / "QJ" → "QJ" / "Kx" → "Kx"。 */
function keyLabel(key: string): string {
  const s = key.slice(-1);
  return key.length === 2 && SUIT[s] ? `${key[0]}${SUIT[s]}` : key;
}

function nutList(c: CoachData): string {
  return (c.nutExamples ?? []).map((e) => `${keyLabel(e.key)} の${e.made}`).join("、");
}
function blockedList(c: CoachData): string {
  return (c.blocked ?? []).map(keyLabel).join("・");
}

const MDF_BODY =
  "MDF(最小ディフェンス頻度)は、相手のベットにエクスプロイトされないために、最低どれくらいの頻度でコールかレイズで守るべきかの目安。\n" +
  "式は「ベット前のポット ÷(ベット前のポット + ベット額)」。たとえば 100 のポットに 50 のベットなら 100 ÷ 150 = 66% 以上は守る。\n" +
  "MDF より降りすぎると、相手はどんな2枚でもブラフで打てば儲かってしまう。ただし完璧な指標ではなく、相手のブラフが少ないと分かっていれば守る頻度を下げてもいい。あくまで目安として使おう。";

const POLARIZE_BODY =
  "ポラライズとは、ベットするレンジを「とても強い手(バリュー)」と「勝てない手(ブラフ)」の両極端に分けること。中くらいの強さの手(ショーダウンで勝てるかもしれない手)はチェックに回す。\n" +
  "フロップで打ってターン・リバーでもベットする(ダブルバレル・トリプルバレル)頃には、コールしてきた相手のレンジは「降りない手」に絞られている。ここで安いベットを打っても、相手の弱い手は降りないし、強い手からは少ししか取れない。\n" +
  "だからバレルは大きく打つ。大きく打つほど、バリューの手からは多く取れて、ブラフでは相手のブラフキャッチャーを降ろせる。バレルで安いサイズ(40% 以下)を使うと、バリューもブラフもどちらも中途半端になるんだ。\n" +
  "IP のシンバリュー(薄いバリュー)も安いサイズを使うわけではなく、75% くらいが主流。安く打っていいのは OOP のブロックベット・ドンクベット・シンバリューだけだよ。";

/** 1つの判定 → バリィの台詞と本文。 */
export function coachComment(c: CoachData): CoachNote {
  switch (c.id) {
    case "commit":
      return {
        title: "ポットコミット(大悪手)",
        summary: `このベットのあと、残りは ${bb(c.remainingBb)}。相手にオールインされたら、勝率 ${pct(c.requiredEquity)} あればコールしないといけない=もう降りられない「コミット」した状態だよ。コミットするくらいなら、最初からオールインしよう。`,
        points: [
          { label: "ベット後の残り", text: bb(c.remainingBb) },
          { label: "ベット後のポット", text: bb(c.potBb) },
          { label: "オールインへのコールに必要な勝率", text: `${pct(c.requiredEquity)}(残り ÷ コール後のポット)` },
        ],
        body:
          "コミットとは「オールインされても、オッズ的にコールしないといけないくらいのチップをポットに入れてしまった状態」のこと。チップを入れすぎて「降りられない」と思っているだけではなく、数学的に降りると損になる状態だ。\n" +
          "たとえば 10bb 前後で 2bb ちょっとにオープンすると、残りのスタックで相手のオールインにコールするのに必要な勝率は 35% 前後。ドミネイトされていなければ、ほとんどの手がこれを超えるので、実質オールインと同じリスクを負っている。\n" +
          "それなのに全部は打たないと、相手に「安くコールしてフロップを見る」選択肢を与えてしまう。同じリスクを負うなら、最初からオールインした方が、相手を降ろせる(フォールドエクイティ)ぶん得なんだ。\n" +
          "3ベットポットやフロップの CB でも、いつの間にかポットとスタックが同じくらいになってコミットしていることがある。打つ前に「このあと全部入れる覚悟があるか」を考えて、あるならオールイン、ないならチェックやフォールドを選ぼう。\n" +
          "ただし入賞(インマネ)直前のように飛ばないことの価値が大きい場面では、オッズが合っても降りるのが正しいこともあるよ。",
        sourceUrl: SRC.kihara,
      };
    case "oddsCall": {
      const ok = (c.equity ?? 0) >= (c.requiredEquity ?? 1);
      const formula = `${bb(c.callBb)} ÷(${bb(c.potBb)} + ${bb(c.callBb)})= ${pct(c.requiredEquity)}`;
      const summary = ok
        ? `必要勝率 = ${formula}。相手のレンジに対する勝率は ${pct(c.equity)} くらいあるから、オッズに合ったコールだよ。ナイス！`
        : `必要勝率 = ${formula} なのに、相手のレンジに対する勝率は ${pct(c.equity)} くらいしかないんだ。オッズが合っていないから、ここは降りた方がよかったよ。`;
      const cr = c.checkRaiseOk ? "\nこれだけ勝率があるなら、コールだけでなくチェックレイズで大きくしにいくのもアリだよ。" : "";
      return {
        title: "オッズと必要勝率",
        summary: summary + (c.checkRaiseOk ? " チェックレイズしてもよかったね。" : ""),
        points: [
          { label: "オッズの式", text: `コール額 ÷(ポット + コール額)= ${formula}` },
          { label: "推定勝率", text: `${pct(c.equity)}(相手のアクションから見積もったレンジに対して)` },
          ...(c.mdf != null ? [{ label: "MDF", text: `${pct(c.mdf)} 以上は守る(コールかレイズ)` }] : []),
        ],
        body:
          "コールするかどうかは「ポットオッズ」で決める。必要勝率 = コール額 ÷(コール後のポット)。自分の勝率がこれを上回ればコールは得、下回れば損。\n" +
          "勝率は、相手のプリフロップのアクション(オープン・3ベット・コール)と、ポストフロップのベット・コール・チェックから相手のレンジを見積もって計算している。強い手ほどベットしやすく、エアーはブラフの分だけ混ぜる、という重み付けだ。\n" +
          "必要勝率との差が小さければ緩手、大きいほど悪手・大悪手になるよ。" +
          (c.mdf != null ? `\n\n${MDF_BODY}` : "") +
          cr,
        sourceUrl: c.mdf != null ? SRC.mdf : undefined,
      };
    }
    case "oddsFold": {
      const ok = (c.equity ?? 0) < (c.requiredEquity ?? 0);
      const formula = `${bb(c.callBb)} ÷(${bb(c.potBb)} + ${bb(c.callBb)})= ${pct(c.requiredEquity)}`;
      const hand = c.handLabel ? `${c.handLabel}で` : "";
      const summary = ok
        ? `必要勝率 = ${formula}。相手のレンジに対する勝率は ${pct(c.equity)} くらいしかないから、${hand}降りるのが正解だよ。ナイスフォールド！`
        : `必要勝率 = ${formula} に対して、相手のレンジに対する勝率は ${pct(c.equity)} くらいあるんだ。オッズが合っているから、${hand}降りずにコールしよう。`;
      return {
        title: "オッズと必要勝率",
        summary,
        points: [
          { label: "オッズの式", text: `コール額 ÷(ポット + コール額)= ${formula}` },
          { label: "推定勝率", text: `${pct(c.equity)}(相手のアクションから見積もったレンジに対して)` },
          { label: "正解", text: ok ? "フォールド" : "コール" },
        ],
        body:
          "降りるかどうかも「ポットオッズ」で決める。必要勝率 = コール額 ÷(コール後のポット)。自分の勝率がこれを下回れば降りるのが正解、上回っていればコールした方が得。\n" +
          "勝率は、相手のプリフロップのアクション(オープン・3ベット・コール)と、ポストフロップのベット・コール・チェックから相手のレンジを見積もって計算している。\n" +
          "勝率が足りているのに降りると、取れたはずのポットを捨てることになる。差が 10% 未満なら悪手、10% 以上なら大悪手だよ。",
      };
    }
    case "bmcb": {
      const size = pct(c.sizePct);
      const summary =
        c.grade === "best"
          ? `相手(プリフロップのレイザー)の CB のチェックを見て、IP から ${size} のベット。これが「BMCB」だね。安いサイズでばっちり！`
          : c.grade === "excellent"
            ? `相手の CB のチェックを見て IP から打つ「BMCB」。打つのはいいけど、BMCB は 1/3 ポットくらいの安いサイズが主流だよ。`
            : `相手の CB のチェックを見て IP から打つ「BMCB」。打つのはいいけど、${size} は大きすぎるかな。1/3 ポットくらいで十分だよ。`;
      return {
        title: "BMCB(ベット・トゥ・ミスド CB)",
        summary,
        points: [{ label: "サイズ", text: `${size}(主流は 1/3 ポット)` }],
        body:
          "BMCB は「Bet to Missed CB」。プリフロップのレイザー(アグレッサー)がフロップで CB を打たずにチェックしたのを見て、IP のコーラーがベットすること。\n" +
          "IP でコールした側は、相手のアクションを見てから動けるのが強み。OOP のレイザーがチェックするボード(ドライ・ローボードなど)では、レイザーは強い手でもチェックを混ぜるので、IP は 6 割くらいの頻度で、ほとんど 1/3 ポットの安いサイズで打つ。\n" +
          "当たっている手はバリューに、当たっていない手でも、コーラー側のレンジはポケットペアが多いので相手のハイカードを安く降ろせる。\n" +
          "これは OOP が先に打つ「ドンクベット」とは別物。相手が BMCB を多用するなら、強い手でチェックしてチェックレイズを返すのが対策になるよ。",
        sourceUrl: SRC.bmcb,
      };
    }
    case "bmcbCheck":
      return {
        title: "BMCB を打てる場面",
        summary: "相手(レイザー)が CB を打たずにチェックしたね。IP のこの場面は「BMCB」で 1/3 ポットくらいを打てる場面だよ。チェックバックも混ぜていいけど、6 割くらいは打っていくのが目安。",
        body:
          "BMCB は「Bet to Missed CB」。プリフロップのレイザーがフロップで CB を打たずにチェックしたのを見て、IP のコーラーがベットすること。\n" +
          "レイザーがチェックするボードでは、IP は 6 割くらいの頻度で、ほとんど 1/3 ポットの安いサイズで打つ。当たっていない手でも、相手のハイカードを安く降ろせるよ。",
        sourceUrl: SRC.bmcb,
      };
    case "polarize":
      return {
        title: "ポラライズ(バレルは大きく)",
        summary: `${c.street === "river" ? "トリプルバレル" : "ダブルバレル"}で ${pct(c.sizePct)} は安すぎるよ。ここまで打ってきたら、レンジをポラライズして大きく打とう。`,
        points: [{ label: "サイズ", text: `${pct(c.sizePct)}(40% 以下は大悪手)` }],
        body: POLARIZE_BODY,
      };
    case "thinValue":
      return {
        title: "シンバリューベット(IP)",
        summary:
          (c.sizePct ?? 0) >= 0.6
            ? `${c.handLabel ?? "ワンペア"}でリバーのシンバリュー。リバーでブラフレイズが少ない相手や、コールしすぎる相手によく刺さるよ。IP のシンバリューは 75% くらいが主流で、サイズもいいね。`
            : `${c.handLabel ?? "ワンペア"}でリバーのシンバリュー。ブラフレイズが少ない相手やコールしすぎる相手に刺さるけど、IP のシンバリューは安いサイズを使うわけじゃないんだ。75% くらいが主流だよ。`,
        points: [{ label: "サイズ", text: `${pct(c.sizePct)}(IP の主流は 75% 前後)` }],
        body:
          "シンバリュー(薄いバリュー)は、勝っている確率がそれほど高くない手で、さらに弱い手からのコールを取りにいくベット。\n" +
          "リバーでブラフレイズを打ってこない相手には、レイズされる心配がほとんどないので、薄いバリューを打てる。コールしすぎる相手にも、弱いワンペアやハイカードから取れる。\n" +
          "IP のシンバリューは 75% くらいのサイズが主流。ダブルバレル・トリプルバレルのあとに 40% 以下で打つと、シンバリューとして成立していてもポラライズできていない(大悪手)。安くてよいのは OOP のシンバリュー・ドンクベット・ブロックベットだけ。",
      };
    case "blockBet":
      return {
        title: "ブロックベット(OOP)",
        summary: `OOP の${c.handLabel ?? "この手"}で、${pct(c.sizePct)} のブロックベット。そこそこ強いけどレイズされたくない手を安く打って、相手の大きいベットを防ぐ。絶妙だね！`,
        points: [{ label: "サイズ", text: `${pct(c.sizePct)}(33〜50%)` }],
        body:
          "ブロックベットは、OOP が先に安く(33〜50%)打って、相手に大きいベットを打たせないようにするベット。\n" +
          "使う手は「セミナッツ」(そこそこ強いけどレイズされたくない手。ミドルペア、フラッシュボードのツーペアなど)と、「ガチナッツ」(A ハイフラッシュ・クワッズなど、強すぎてバリューの相手がいない手)を混ぜる。ブラフは無くてもいい。\n" +
          "チェックすると、IP に大きく打たれてコールするかどうかで困る。先に安く打てば、安いコストでショーダウンまで行けるし、ナッツが混ざっているので相手もレイズしにくい。ドンクベットが有効な場面で使うのもいいよ。",
      };
    case "blockBetMissed":
      return {
        title: "ブロックベットを打てる場面",
        summary:
          c.sizePct != null
            ? `OOP の${c.handLabel ?? "この手"}は、レイズされたくない手。大きく打つより 33〜50% のブロックベットで安く打つ場面だよ。`
            : `OOP の${c.handLabel ?? "この手"}は、33〜50% のブロックベットを打つ場面だよ。チェックすると IP に大きく打たれて困っちゃう。`,
        body:
          "ブロックベットは、OOP が先に安く(33〜50%)打って、相手に大きいベットを打たせないようにするベット。\n" +
          "使う手は「セミナッツ」(ミドルペア、フラッシュボードのツーペアなど、そこそこ強いけどレイズされたくない手)と、「ガチナッツ」(A ハイフラッシュ・クワッズなど)。チェックして大きく打たれるより、先に安く打った方がショーダウンまで安く行けるよ。",
      };
    case "riverCatch":
      return {
        title: "リバーのブラフキャッチ(ブロッカー)",
        summary: `リバーのベットに対する MDF は ${pct(c.mdf)}。最低でも ${pct(c.mdf)} はコールする必要があるよ。相手がこのベットで打ってくるナッツ級は ${nutList(c)}。その ${blockedList(c)} を自分が持っているから、相手のバリューが減ってブラフの割合が増える。最高のブラフキャッチだよ、すごい！`,
        points: [
          { label: "MDF", text: `${pct(c.mdf)} 以上はコールかレイズで守る` },
          { label: "相手のナッツ級", text: nutList(c) },
          { label: "ブロックしている", text: blockedList(c) },
        ],
        body:
          `${MDF_BODY}\n\n` +
          "どの手で守るかは「ブロッカー」で選ぶ。相手のナッツ級(バリュー)の手に使われるカードを自分が持っていれば、相手がその手を持っている組み合わせが減り、相手のレンジの中でブラフの割合が上がる。\n" +
          "だから同じくらいの強さの手なら、ナッツ級をブロックしている手でコールするのが正解。結果として相手がバリューだったとしても、この選び方は正しいんだ。",
        sourceUrl: SRC.mdf,
      };
    case "riverRaise":
      return {
        title: "リバーのブラフレイズ",
        summary: `${c.handLabel ?? "この手"}でリバーのブラフレイズ！相手のナッツ級(${nutList(c)})の ${blockedList(c)} をブロックしつつ、相手のブラフ(降りる手)はブロックしていない、理想的なブラフレイズの候補だよ。完璧！`,
        points: [
          { label: "MDF", text: `${pct(c.mdf)}` },
          { label: "相手のナッツ級", text: nutList(c) },
          { label: "ブロックしている", text: blockedList(c) },
        ],
        body:
          "リバーのブラフレイズは、相手のシンバリューへの対策。ブラフレイズが無いと、相手は安心して薄いバリューを打ち放題になる。\n" +
          "レイズに直面した相手の手は「自動でフォールドする手(ブラフ)」「ブラフキャッチャー」「自動でコールかレイズする手(バリューのトップ)」に分かれる。ブラフレイズに使う手は、相手のフォールドする手(ブラフ)をブロックせず、コールかレイズする手(ナッツ級)をブロックしている手がいい。\n" +
          "そこで使いやすいのが、ボードとペアになっているワンペアと、A ハイ。相手はペアや A ハイでブラフを打つことが少ないので、自分のカードが相手のブラフと被りにくく、2ペアやセットなどのナッツ級はブロックできる。\n" +
          "サイズはバリューでレイズするときと同じにする(ブラフだけ別のサイズにすると読まれる)。似たような候補が多いときは、それぞれ低い頻度で使おう。",
        sourceUrl: SRC.riverRaise,
      };
    case "riverRaiseMissed":
      return {
        title: "ブラフレイズの候補",
        summary: `MDF は ${pct(c.mdf)}。${c.handLabel ?? "この手"}は、相手のナッツ級(${nutList(c)})の ${blockedList(c)} をブロックしているブラフレイズの候補だったよ。リバーで一定の頻度ブラフレイズしないと、相手からシンバリューを打たれまくっちゃう。`,
        points: [
          { label: "MDF", text: `${pct(c.mdf)} 以上は守る` },
          { label: "相手のナッツ級", text: nutList(c) },
          { label: "ブロックしている", text: blockedList(c) },
        ],
        body:
          "リバーのブラフレイズは、相手のシンバリューへの対策。ブラフレイズが無いと、相手は安心して薄いバリューを打ち放題になる。\n" +
          "ブラフレイズに使う手は、相手のブラフ(降りる手)をブロックせず、ナッツ級をブロックしている手。具体的には「ナッツ級をブロックしている A ハイ」や「ナッツ級をブロックしているワンペア(ボードとのペア)」。\n" +
          "サイズはバリューでレイズするときと同じにして、似たような候補が多いときはそれぞれ低い頻度で使おう。\n\n" +
          MDF_BODY,
        sourceUrl: SRC.riverRaise,
      };
    case "riverCallNoBlock":
      return {
        title: "リバーの MDF とブロッカー",
        summary: `このベットに対する MDF は ${pct(c.mdf)}。レンジの ${pct(c.mdf)} くらいはコールで守る必要があるけど、守るのはブロッカーが優秀な手から。相手のナッツ級は ${nutList(c)} で、きみの手はどれも抑えていないから、ここは降りる側の手だったよ。`,
        points: [
          { label: "MDF", text: `レンジの ${pct(c.mdf)} くらいはコールかレイズで守る` },
          { label: "相手のナッツ級", text: nutList(c) },
          { label: "ブロック", text: "どれも抑えていない → 守る順番は後ろ(フォールド候補)" },
        ],
        body:
          MDF_BODY +
          "\n\nどの手で守るかは「ブロッカー」で選ぶ。相手のナッツ級に使われるカードを自分が持っていれば、相手がその手を持っている組み合わせが減り、相手のレンジの中でブラフの割合が上がる。\n" +
          "同じくらいの強さなら、ナッツ級を抑えている手からコールし、抑えていない手から降りる。",
        sourceUrl: SRC.mdf,
      };
    case "riverFoldBlocker":
      return {
        title: "リバーの MDF とブロッカー",
        summary: `このベットに対する MDF は ${pct(c.mdf)}。相手のナッツ級は ${nutList(c)} で、きみは ${blockedList(c)} を抑えているんだ。ブロッカーが優秀な手はコールで守る側だから、ここはコールしたかったね。`,
        points: [
          { label: "MDF", text: `レンジの ${pct(c.mdf)} くらいはコールかレイズで守る` },
          { label: "相手のナッツ級", text: nutList(c) },
          { label: "ブロックしている", text: blockedList(c) },
        ],
        body:
          MDF_BODY +
          "\n\nナッツ級を抑えている手は、相手のバリューを減らしてブラフの割合を上げる。守る手を選ぶときは、まずこういう手からコールする。",
        sourceUrl: SRC.mdf,
      };
    case "riverFoldOk":
      return {
        title: "リバーの MDF とブロッカー",
        summary: `このベットに対する MDF は ${pct(c.mdf)}。相手のナッツ級は ${nutList(c)} で、きみはどれも抑えていないから、守る順番は後ろ。ここは降りてOKだよ。`,
        points: [
          { label: "MDF", text: `レンジの ${pct(c.mdf)} くらいはコールかレイズで守る` },
          { label: "相手のナッツ級", text: nutList(c) },
          { label: "ブロック", text: "どれも抑えていない → フォールドでよい" },
        ],
        body: MDF_BODY + "\n\n守る手はブロッカーが優秀なものから選ぶ。抑えていない手は降りる側に回す。",
        sourceUrl: SRC.mdf,
      };
    case "riverMdf":
      return {
        title: "リバーの MDF",
        summary: `このベットに対する MDF は ${pct(c.mdf)}。最低でも ${pct(c.mdf)} はコールかレイズで守らないと、相手にブラフで打たれ放題になるよ。相手のナッツ級は ${nutList(c)} あたりだね。`,
        points: [
          { label: "MDF", text: `${pct(c.mdf)} 以上は守る` },
          { label: "相手のナッツ級", text: nutList(c) },
        ],
        body:
          MDF_BODY +
          "\n\nどの手で守るかは、ナッツ級をブロックしている手を優先しよう。ブロックしていれば相手のバリューが減り、ブラフの割合が上がるよ。",
        sourceUrl: SRC.mdf,
      };
    case "flopCb":
      return flopCbComment(c);
    case "oopFlopCheck": {
      const board = c.handLabel === "モノトーン" ? "モノトーンのボード" : "J ハイ以下のボード";
      const ok = c.grade === "great";
      return {
        title: "OOP のオリジナルはチェック",
        summary: ok
          ? `${board}で、OOP のオリジナルレイザーとしてチェック。ここはチェックが唯一の好手だよ！`
          : `${board}で OOP から打ってしまったね。ここはオリジナルレイザーでも絶対にチェックする場面。打つのは大悪手だよ。`,
        points: [
          { label: "ボード", text: board },
          { label: "正解", text: "チェック(オリジナルでも CB を打たない)" },
        ],
        body:
          "OOP(先に動く側)では、プリフロップのオリジナルレイザーでも、フロップが J ハイ以下のボードとモノトーンのボードでは必ずチェックする。\n" +
          "J ハイ以下のボードは、IP でコールしてきた相手のレンジ(スーテッドコネクター・ミドルのポケットペアなど)によく当たる。モノトーンのボードは、相手のフラッシュやフラッシュドローが多く、レイザー側のレンジの有利が小さい。\n" +
          "そのうえ OOP は、打ったあとターン・リバーで常に先に動かされる。レンジの有利もポジションも無い場面で CB を打つと、強い手にはレイズされ、弱い手には降りられて、打った分だけ損をしやすい。\n" +
          "強い手もいったんチェックし、相手のベットにチェックレイズやコールで応えるのが基本。チェックしたレンジにも強い手が混ざるので、相手は気軽に打てなくなるよ。",
      };
    }
  }
}

// ───────────── フロップの CB(オリジナル・IP)。出典: Amu「Flop CBの基礎 (BTN vs BB)」 ─────────────

type FlopCbData = NonNullable<CoachData["flopCb"]>;

const CB_CLASS_NAME: Record<number, string> = {
  1: "Class1 モノトーン",
  2: "Class2 トリップス",
  3: "Class3 ペア",
  4: "Class4 A〜Jハイ HMSD",
  5: "Class5 A〜Jハイ HMnSD",
  6: "Class6 T・9ハイ",
  7: "Class7 8ハイ以下",
};

/** ボードの分類ごとの、レンジ全体の打ち方(記事の Step1 を自分の言葉で)。 */
function cbClassText(f: FlopCbData): string {
  switch (f.cls) {
    case 1:
      return "モノトーンのボードは「低い頻度で安く打つ」。レンジの 25% くらいを 33%、5% くらいを 50% で打ち、残りはチェック。";
    case 2:
      return "トリップスのボードはオリジナルレイザーの有利がとても大きいので、レンジ全体で打ってよい(CB 率ほぼ 100%)。サイズは 999 以上なら 33% か 50%、888 以下なら 50% か 75%。";
    case 3:
      return "ペアのボードは安いサイズでたくさん打つ。目安は 50% の頻度で 33%、15% の頻度で 50%。迷ったら 70% くらいを 33% で打つ、で大きく外さない。";
    case 4:
      return f.hmTier === "strong"
        ? "A〜Jハイで、ハイとミドルの2枚でストレートドローができるボード(HMSD)。AK・AQ のように上の2枚がとても強いボードは、打つなら 125%(ポットオーバー)だけのポラーな戦略になる。頻度は 50% くらい。"
        : f.hmTier === "weak"
          ? "A〜Jハイの HMSD のボード。上の2枚の幅が広い(Q8・J7 のような)ボードは 125% をあまり使わず、33・50・75% を混ぜる(15:15:15、125% は 5%)。"
          : "A〜Jハイの HMSD のボード。KJ・Q9 のような平均的なボードは全サイズを混ぜる(33:50:75:125 = 15:10:10:15)。";
    case 5:
      return "A〜Jハイで、ハイとミドルでストレートドローができないボード(HMnSD)。K ハイのボードと同じく「安く打つ」。目安は 33% を 35%、50% を 20% くらい。";
    case 6:
      return f.connected
        ? "T・9ハイのボード。コネクトしている(何らかの2枚でストレートが完成しうる)ので、125% を外して安いサイズを多めに使う。"
        : "T・9ハイのボード。125% まで含めて全サイズを混ぜる(33:50:75:125 = 15:10:10:15)。";
    case 7:
      return f.connected
        ? "8ハイ以下でコネクトしているボード。125% は使わず、33% を 30%、50% を 15% くらいで打つ。"
        : "8ハイ以下のボード。33・50・75% を同じくらい混ぜる(15:15:15)。";
    default:
      return "";
  }
}

/** 手の振り分け(記事の Step2 を自分の言葉で)。 */
function cbGroupText(f: FlopCbData, hand: string): string {
  switch (f.group) {
    case "all":
      return `${hand}も含めて、このボードではどの手も打ってよい。`;
    case "high":
      return `${hand}は、このボードで打つ頻度が高い手。`;
    case "mid":
      return `${hand}は、レンジの平均くらいの頻度で打つ手。打ってもチェックしてもよい。`;
    case "low":
      return `${hand}は、打つ頻度がとても低い手。ショーダウンで勝てる見込みはあるが、打ってもバリューにならないのでチェックに回す。`;
    case "typeB":
      return `${hand}は「B type」= 最大サイズを中心に、高い頻度で打つ手(セット・オーバーペア・トップペアのグッドキッカー・ストレートドロー・当たっていないハイ+ロー)。`;
    case "typeA":
      return `${hand}は「A type」= レンジの頻度どおりに、全サイズを混ぜて打つ手。`;
    case "typeC":
      return `${hand}は「C type」= 安いベットかチェックの手(セカンドペア・ポケットペア・トップペアのウィークキッカー・トップのハイカード+ミドルのキッカー)。`;
    case "value":
      return `${hand}は、このポラーなボードのバリュー(トップペア・グッドキッカー以上)。125% で打つ。`;
    case "bluff":
      return `${hand}は、このポラーなボードのブラフ側(ボトムペア・ストレートドロー・弱いポケット・フラッシュドロー・ミドルより下の2枚・バックドア)。思ったより多くの手をブラフに入れるのがコツ。`;
    case "check":
      return `${hand}は、このポラーなボードでは打たない中くらいの手。チェックに回す。`;
    default:
      return "";
  }
}

const CB_SIZE_LABEL: Record<string, string> = { "33": "33%", "50": "50%", "75": "75%", "125": "125%" };

function flopCbComment(c: CoachData): CoachNote {
  const f = c.flopCb!;
  const hand = c.handLabel ?? "この手";
  const sizes = (["33", "50", "75", "125"] as const)
    .filter((k) => (f.freq[k] ?? 0) > 0)
    .map((k) => `${CB_SIZE_LABEL[k]}(${Math.round((f.freq[k] ?? 0) * 100)}%)`)
    .join(" / ");
  const did = f.action === "check" ? "チェック" : `${CB_SIZE_LABEL[f.action]} のベット`;
  const verdict =
    c.grade === "best"
      ? "ソリューションどおりの選択だよ。ナイス！"
      : c.grade === "excellent" || c.grade === "good"
        ? "悪くない選択。頻度の範囲に入っているよ。"
        : f.action !== "check" && !(f.freq[f.action] ?? 0)
          ? "このボードでは使わないサイズだね。"
          : f.action === "check"
            ? "ここは打っていきたい手だったね。"
            : "ここはチェックに回したい手だったね。";
  return {
    title: `フロップの CB(${CB_CLASS_NAME[f.cls] ?? ""})`,
    summary: `${CB_CLASS_NAME[f.cls]}${f.connected && f.cls !== 2 && f.cls !== 3 ? "・コネクト" : ""}のボード。${hand}で${did}。${verdict}`,
    points: [
      { label: "ボードの分類", text: `${CB_CLASS_NAME[f.cls]}${f.connected ? "(コネクト)" : ""}` },
      { label: "使うサイズ(レンジ全体の頻度)", text: sizes || "-" },
      { label: "この手", text: cbGroupText(f, hand) },
    ],
    body:
      "フロップの CB は、手札を見る前にまず「ボードから決まるレンジ全体の打ち方」を考え、そのあとで手札を振り分ける。\n" +
      "1. ボードを7つに分ける: モノトーン / トリップス / ペア / A〜Jハイでハイとミドルにストレートドローがある(HMSD)/ ない(HMnSD)/ T・9ハイ / 8ハイ以下。何らかの2枚でストレートが完成しうるボード(コネクト)では、125% を外して安いサイズを多めに使う。\n" +
      `2. このボードの打ち方: ${cbClassText(f)}\n` +
      `3. この手の振り分け: ${cbGroupText(f, hand)}\n` +
      "サイズの候補は 33 / 50 / 75 / 125% の4つ。安いサイズが中心のボードはレンジの頻度を全部の手に配ってから上げ下げし、全サイズを混ぜるボードは A type(全サイズ混合)/ B type(最大サイズ中心)/ C type(安いベットかチェック)に分けて組み立てる。\n" +
      "出典: Amu「Flop CBの基礎 (BTN vs BB)」(note)。GTO Wizard 100bb のソリューションを覚えやすく整理したもの。BTN vs BB 以外でも、オリジナルレイザーが IP のシングルレイズドポットに当てはめている。",
  };
}
