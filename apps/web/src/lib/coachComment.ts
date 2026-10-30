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
  "IP のシンバリュー(薄いバリュー)は安いサイズを使わない。75% 以上ならサイズは何でもいい。安く打っていいのは OOP のブロックベット・ドンクベット・シンバリュー(20〜33%)だけだよ。";

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
      const raise = c.raiseOption ?? c.checkRaiseOk ?? false;
      const raiseWord = c.checkRaiseOk || c.raiseOption ? "チェックレイズ" : "レイズ";
      // まずレイズの判定、次にオッズ(オーナー指示)。
      const first = raise
        ? `${c.handLabel ? `${c.handLabel}は` : "この手は"}${raiseWord}する手だよ。コールではなく${raiseWord}で大きくしにいこう。`
        : `${c.handLabel ? `${c.handLabel}は` : "この手は"}${raiseWord}する手ではないから、コールかフォールドの二択。`;
      const second = ok
        ? `必要勝率 = ${formula} に対して、相手のレンジへの勝率は ${pct(c.equity)} くらいあるから、${raise ? "コールでも損はしないけどね。" : "オッズが合ってコール、OK！"}`
        : `必要勝率 = ${formula} なのに、相手のレンジへの勝率は ${pct(c.equity)} くらいしかないから、降りた方がよかったよ。`;
      return {
        title: "レイズの判定とオッズ",
        summary: first + second,
        points: [
          { label: "レイズ", text: raise ? `${raiseWord}する手(コールより${raiseWord})` : `${raiseWord}しない手 → コールかフォールド` },
          { label: "オッズの式", text: `コール額 ÷(ポット + コール額)= ${formula}` },
          { label: "推定勝率", text: `${pct(c.equity)}(相手のアクションから見積もったレンジに対して)` },
          ...(c.mdf != null ? [{ label: "MDF", text: `${pct(c.mdf)} 以上は守る(コールかレイズ)` }] : []),
        ],
        body:
          "ベットを受けたら、まずレイズ(チェックレイズ)する手かを考える。バリューで大きくしたい強い手や、チェックレイズの表に入っている手はレイズ。レイズする手なのにコールで終わると、取れるはずの額を逃す。\n" +
          "レイズしない手は、コールかフォールドの二択。これは「ポットオッズ」で決める。必要勝率 = コール額 ÷(コール後のポット)。自分の勝率がこれを上回ればコール、下回ればフォールド。\n" +
          "勝率は、相手のプリフロップのアクション(オープン・3ベット・コール)と、ポストフロップのベット・コール・チェックから相手のレンジを見積もって計算している。" +
          (c.mdf != null ? `\n\n${MDF_BODY}` : ""),
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
    case "bmcb":
    case "bmcbCheck":
      return bmcbComment(c);
    case "squeeze":
      return squeezeComment(c);
    case "raisedPot":
      return raisedPotComment(c);
    case "oopKingCb": {
      const dryK = c.handLabel === "dryK";
      const bet = c.sizePct != null;
      const board = dryK ? "ドライでモノトーンでない K ハイ" : c.handLabel === "wetK" ? "ドライではない K ハイ" : c.handLabel === "A" ? "A ハイ" : "Q ハイ";
      const summary = dryK
        ? bet
          ? (c.sizePct ?? 0) <= 0.45
            ? `${board}は、OOP からでもレンジで 33% の CB を打つボードだよ。ばっちりだね！`
            : `${board}で CB を打つのは正解。サイズは 33% で十分だよ。`
          : `${board}は、OOP からでもレンジで 33% の CB を打つボードなんだ。ここは打っていこう。`
        : bet
          ? `${board}のボードは、OOP のオリジナルレイザーはレンジでチェックする場面なんだ。ここはチェックしよう。`
          : `${board}のボードは、OOP からはレンジでチェック。チェック、ナイス！`;
      return {
        title: "SRP の OOP の CB",
        summary,
        points: [
          { label: "ボード", text: board },
          { label: "正解", text: dryK ? "33% で CB" : "チェック" },
        ],
        body:
          "シングルレイズドポットで OOP のオリジナルレイザーになったら、ドライかつモノトーンでない K ハイのボードだけ 33% で CB を打ち、それ以外はどの手でもチェックする。\n" +
          "K ハイで打てるのは、IP のコールレンジに K を含む手が少ない(K の強い手は 3bet かフォールドに回りやすい)から。\n" +
          "それ以外のボードは GTO でもチェックが多く、強い手も含めてチェックすることでチェックレンジが弱くならず、相手の弱い手でのベットを誘える。SB vs BB には使わないよ。",
      };
    }
    case "lightAce": {
      const lv = c.raiseLevel ?? 3;
      const name = lv >= 5 ? "5bet" : `${lv}bet`;
      const hand = c.handLabel ?? "A5s";
      return {
        title: "A5s・A4s のライトなレイズ",
        summary: `ナイスなライト${name}！${hand}はいつでも使えるんだ！`,
        points: [
          { label: "ハンド", text: `${hand}(A のブロッカー + ホイールのストレート・ナッツフラッシュの可能性)` },
          { label: "レイズ", text: name },
        ],
        body:
          "A5s・A4s は、3bet・4bet・5bet のブラフ(ライトなレイズ)にいちばん向いているハンド。\n" +
          "A を1枚持っているので、相手の AA・AK・AQ などの強い手の組み合わせを減らせる(ブロッカー)。\n" +
          "コールされても、ホイール(A〜5)のストレートやナッツフラッシュになる可能性があり、まったく勝てない手ではない。\n" +
          "だから、コミットしていない(降りても大きく損しない)スタックなら、いつでもライトなレイズに使っていいよ。",
      };
    }
    case "polarize":
      return {
        title: "ポラライズ(バレルは大きく)",
        summary: `${c.street === "river" ? "トリプルバレル" : "ダブルバレル"}で ${pct(c.sizePct)} は安すぎるよ。ここまで打ってきたら、レンジをポラライズして大きく打とう。`,
        points: [{ label: "サイズ", text: `${pct(c.sizePct)}(40% 以下は大悪手)` }],
        body: POLARIZE_BODY,
      };
    case "thinValue": {
      const bet = c.sizePct != null;
      const eq = pct(c.equity);
      const hand = c.handLabel ?? "ワンペア";
      const ok = (c.equity ?? 0) >= 0.5;
      const summary = bet
        ? ok
          ? c.grade === "best"
            ? `${hand}でリバーのシンバリュー。相手がコールしてくるレンジに ${eq} 勝てるから、${pct(c.sizePct)} のベットはばっちりだよ！`
            : `${hand}でシンバリューを打つのは正解(コールされても ${eq} 勝てる)。IP ならサイズは 75% 以上にしよう(それ以上なら何でもいい)。`
          : `${hand}でベットしたけど、相手がコールしてくるレンジには ${eq} しか勝てないんだ。コールされたら負けている方が多いから、ここはチェックしよう。`
        : ok && c.grade !== "best"
          ? `${hand}は、相手がコールしてくるレンジに ${eq} 勝てるからシンバリューで打てたよ。迷ったらベット、75% 以上で打とう。`
          : `${hand}は、相手がコールしてくるレンジに ${eq} しか勝てないから、チェックで正解だよ。`;
      return {
        title: "シンバリューベット(IP)",
        summary,
        points: [
          { label: "コールされたときの勝率", text: `${eq}(50% 以上ならベット)` },
          ...(bet ? [{ label: "サイズ", text: `${pct(c.sizePct)}(IP は 75% 以上)` }] : []),
        ],
        body:
          "シンバリューベットは、ワンペアのようなマージナルな手で、相手がコールしてきたときに 50% 以上勝てるならベットすること。\n" +
          "相手がコールしてくるのは、相手のレンジのうち強い方の MDF% くらい。そのレンジに対する勝率で決める。サイズは IP なら 75% 以上(何でもいい)、OOP なら 20〜33%。\n" +
          "コールしすぎる相手(コーリングステーション)には薄めに打ち、ブラフは減らす。ドローが外れたボードは相手が広くコールしやすいので、薄く打ちやすい。迷ったらベットしよう。",
      };
    }
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
      return riverMdfComment(c);
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
      return riverMdfComment(c);
    case "riverMdf":
      return riverMdfComment(c);
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

const BMCB_BOARD: Record<string, string> = {
  high: "ハイボード",
  connect: "コネクト・ローボード",
  monotone: "モノトーンのボード",
  paired: "ペアボード",
  monotoneAK: "A・K ハイのモノトーン",
  pairedBroadway: "全部ブロードウェイのペアボード",
};

const BMCB_BODY =
  "BMCB は、プリフロップのレイザーがフロップで CB を打たずにチェックしたのを見て、IP のコーラーが打つベット。\n" +
  "【ハイボード系】ポラライズして 80% くらいの大きいサイズ。バリューは TPTK 以上、ブラフはボトムヒット・ローポケ・ガットショット(ガットショットはターンで止める)。それ以外はチェック。ベット頻度は全体で約 20%。\n" +
  "【コネクト・ロー系】レンジで 33% を頻度 60%。2オーバー(ペアもドローも無い手)は全部チェックに回す。\n" +
  "【モノトーン系】ハンドに関係なく 33% を頻度 50%。ただし A・K ハイのモノトーンはレンジチェック。\n" +
  "【ペアボード系】ハンドに関係なく 33% を頻度 60%。ただし全部ブロードウェイのペアボード(AKK など)はレンジチェック。\n" +
  "CB をよく打つ相手がチェックしてきたら BMCB を打とう。チェックが多い相手がチェックしたら BMCB は控えよう。";

/** BMCB の判定(スライド「BMCB簡易戦略」)→ 打つべきだったか・サイズを言う。 */
function bmcbComment(c: CoachData): CoachNote {
  const j = c.bmcb;
  const bet = c.id === "bmcb";
  const size = pct(c.sizePct);
  const board = j ? BMCB_BOARD[j.board] ?? "このボード" : "このボード";
  const hand = c.handLabel ?? "この手";
  const good = c.grade === "best" || c.grade === "excellent" || c.grade === "great" || c.grade === "artistic";
  let summary: string;
  if (!j) {
    summary = bet ? `相手の CB のチェックを見て BMCB(${size})。` : "相手が CB を打たずにチェックした場面だね。";
  } else if (j.correct === "check" && (j.board === "monotoneAK" || j.board === "pairedBroadway")) {
    summary = bet
      ? `${board}は、BMCB を打たずにレンジでチェックする場面なんだ。ここはチェックしよう。`
      : `${board}は、BMCB を打たずにレンジでチェックする場面。チェック、ナイス！`;
  } else if (j.board === "high" && j.hand === "value") {
    summary = !bet
      ? `ハイボードの${hand}は TPTK 以上のバリューだよ。80% くらいの大きいサイズで BMCB を打とう。`
      : good
        ? `ハイボードの${hand}は TPTK 以上のバリュー。${size}の大きい BMCB、ばっちりだね！`
        : `ハイボードの${hand}で BMCB を打つのは正解。ただ、ハイボードはポラライズして 80% くらいの大きいサイズで打とう。`;
  } else if (j.board === "high" && j.hand === "bluff") {
    summary = !bet
      ? `${hand}はハイボードの BMCB のブラフ候補(ボトムヒット・ローポケ・ガットショット)だよ。80% くらいで打っていこう。`
      : good
        ? `${hand}はハイボードの BMCB のブラフ候補。${size}の大きい BMCB、ナイス！`
        : `${hand}をブラフで打つのは正解。サイズはバリューと同じ 80% くらいにしよう。`;
  } else if (j.board === "high") {
    summary = bet
      ? `ハイボードの BMCB は、TPTK 以上とブラフ候補(ボトムヒット・ローポケ・ガットショット)だけで打つんだ。${hand}はチェックしよう。`
      : `ハイボードの BMCB は、TPTK 以上とブラフ候補だけで打つ。${hand}はチェックが正解、ナイス！`;
  } else if (j.hand === "twoOver") {
    summary = bet
      ? `コネクト・ローボードでは、2オーバー(ペアもドローも無い手)は BMCB を打たずにチェックに回そう。`
      : `コネクト・ローボードの2オーバーはチェックに回す手。チェック、ナイス！`;
  } else {
    summary = !bet
      ? `${board}は、ハンドに関係なく 33% で広く BMCB を打つ場面だよ。チェックも混ぜるから悪くないけど、半分以上は 33% で打っていこう。`
      : good
        ? `${board}は、ハンドに関係なく 33% で広く打つ場面。${size}の BMCB、ばっちりだね！`
        : `${board}で BMCB を打つのは正解。ただサイズは 33% で十分だよ。`;
  }
  const how =
    j?.correct === "bigBet" ? "80% くらいで打つ" : j?.correct === "smallBet" ? "33% で打つ(頻度 50〜60%)" : "チェック";
  return {
    title: "BMCB(相手が打たなかった CB の代わりに打つベット)",
    summary,
    points: [
      { label: "ボード", text: board },
      { label: "この手は", text: how },
      ...(bet ? [{ label: "サイズ", text: size }] : []),
    ],
    body: BMCB_BODY,
  };
}

/** スクイーズ(オープン + コールのあと)→ オープンレンジの上位半分か・コールの手か・降りる手か。 */
function squeezeComment(c: CoachData): CoachNote {
  const q = c.squeeze;
  const good = c.grade === "best";
  const correctText = q?.correct === "squeeze" ? "スクイーズ" : q?.correct === "call" ? "コール" : "フォールド";
  let summary: string;
  if (!q) summary = "オープンとコールが入った、スクイーズできる場面だね。";
  else if (good && q.correct === "squeeze") summary = "相手のオープンレンジの上位半分に入る強さだから、スクイーズで正解！ナイススクイーズ！";
  else if (good && q.correct === "call") summary = "スクイーズするには、相手のオープンレンジの上位半分の強さが必要。このハンドは届かないけど、GTO ではコールする手だから、コールで正解だよ。";
  else if (good) summary = "スクイーズするには、相手のオープンレンジの上位半分の強さが必要。このハンドは届かないし、コールする手でもないから、フォールドで正解だよ。";
  else if (q.correct === "squeeze") summary = "このハンドは相手のオープンレンジの上位半分に入る強さだよ。ここはスクイーズしよう。";
  else if (q.correct === "call") summary = "このハンドは相手のオープンレンジの上位半分に届かないから、スクイーズには広すぎるんだ。GTO ではコールする手だから、コールしよう。";
  else summary = "このハンドは相手のオープンレンジの上位半分に届かないし、コールする手でもないんだ。ここは降りよう。";
  return {
    title: "スクイーズの基準",
    summary,
    points: [
      { label: "オープンレンジの上位半分", text: q?.inTopHalf ? "入る" : "入らない" },
      { label: "GTO のコールの手", text: q?.inCallRange ? "そう" : "ちがう" },
      { label: "正解", text: correctText },
    ],
    body:
      "スクイーズ = オープンにコールが入ったあとの 3bet。コーラーのレンジは「3bet するほど強くない手」でキャップされているので通りやすい。\n" +
      "目安は、オープナーのレンジの上位半分くらいの強さ。それより弱い手で打つと、オープナーとコーラーの2人を相手に広すぎるスクイーズになる。\n" +
      "届かない手は、GTO でコールの手ならコール、そうでなければ降りる。A5s・A4s はブロッカーとして、いつでもライトにスクイーズできる。\n" +
      "ショートスタックのときは、スクイーズ(オールイン)の範囲が広くなるよ。",
  };
}

/** リバーでベットに直面: MDF と、自分のレンジの中での手の位置(上位何%か)で、守る側か降りる側かを言う。 */
function riverMdfComment(c: CoachData): CoachNote {
  const top = c.equity != null ? 1 - c.equity : null;
  const inMdf = top !== null && c.mdf != null && top <= c.mdf;
  const where = top !== null ? `きみの手はレンジの上位 ${pct(top)}` : "きみの手の位置";
  const good = c.grade === "best";
  const act = c.id === "riverCallNoBlock" ? "コール" : c.id === "riverFoldOk" ? "フォールド" : "レイズ";
  const summary = inMdf
    ? good
      ? `このベットに対する MDF は ${pct(c.mdf)}。${where}で、守る側の手だから${act}で正解！`
      : `このベットに対する MDF は ${pct(c.mdf)}。${where}で守る側の手だから、降りずにコールしよう。`
    : good
      ? `このベットに対する MDF は ${pct(c.mdf)}。${where}で、守る範囲の外だから降りて正解だよ。`
      : `このベットに対する MDF は ${pct(c.mdf)}。${where}で守る範囲の外だから、ここは降りよう。`;
  return {
    title: "リバーの MDF",
    summary,
    points: [
      { label: "MDF", text: `レンジの上位 ${pct(c.mdf)} はコールかレイズで守る` },
      { label: "きみの手", text: top !== null ? `レンジの上位 ${pct(top)}(${inMdf ? "守る側" : "降りる側"})` : "不明" },
      { label: "相手のナッツ級", text: nutList(c) },
    ],
    body:
      MDF_BODY +
      "\n\nきみのレンジ(プリフロップとここまでのアクションから見積もったもの)を強い順に並べて、上位 MDF% に入る手は守り、入らない手は降りる。\n" +
      "守る手の境目にいる手は、相手のナッツ級をブロックしているものを優先しよう。境目からの差が 10% 未満の間違いは悪手、10% 以上は大悪手だよ。",
    sourceUrl: SRC.mdf,
  };
}

const RP_SPOT: Record<string, string> = {
  ip3bettor: "3bet ポットの IP の 3ベッター",
  oop3bettor: "3bet ポットの OOP の 3ベッター",
  oop4betCaller: "4bet ポットの OOP のコーラー",
  vsDonkJam: "4bet ポットでドンクオールインを受けた側",
};
const RP_BOARD: Record<string, string> = {
  aceHigh: "A ハイ",
  twoBroadway: "ブロードウェイ2枚",
  lowConnect: "ロー・コネクト",
  kingHigh: "K ハイ",
  amm: "A-M-M / Q-M-M",
  tenOrLower: "T ハイ以下",
  other: "その他",
};
const RP_CORRECT: Record<string, string> = {
  check: "チェック",
  smallBet: "安ベット(33% 以下)",
  halfBet: "ハーフ(40〜60%)",
  bigBet: "大きいベット(75〜100%)",
  jam: "オールイン",
  betAny: "ベット(絶対に打つ)",
  checkOrSmall: "チェックか安ベット",
  call: "コール",
  fold: "フォールド",
};

/** 3bet / 4bet ポットのフロップ(スライドゼミ4 + GTO Wizard)。 */
function raisedPotComment(c: CoachData): CoachNote {
  const j = c.raisedPot;
  const spot = j ? RP_SPOT[j.spot] ?? "" : "";
  const board = j ? RP_BOARD[j.board] ?? "" : "";
  const correct = j ? RP_CORRECT[j.correct] ?? j.correct : "";
  const role = j?.handRole ?? "";
  const depth = j?.spot === "oop3bettor" || j?.spot === "ip3bettor" ? (j.deep ? "(SPR 2.5 以上の深いスタック)" : "(SPR 2.5 未満の浅いスタック)") : "";
  const summary =
    c.grade === "best"
      ? `${spot}${depth}、${board}のボードで「${role}」は${correct}。正解だよ、ナイス！`
      : c.grade === "inaccuracy"
        ? `${spot}${depth}、${board}のボードで「${role}」は${correct}が正解。打つのはいいけど、サイズを合わせよう。`
        : `${spot}${depth}、${board}のボードで「${role}」は${correct}が正解だよ。`;
  return {
    title: "3bet ポット・4bet ポットのフロップ",
    summary,
    points: [
      { label: "場面", text: spot + depth },
      { label: "ボード", text: board },
      { label: "この手は", text: `${role} → ${correct}` },
    ],
    body:
      "【3bet ポットの IP(3ベッター)】スタックが浅いほど安く広く打つ。A ハイ・ブロードウェイ2枚のボードはチェックか安ベットで、ポケット・A ヒットの弱いキッカー・セカンドペア・ボトムペアはチェック。深いときの 2BW はハーフでポットを大きくしてリバーのオールインを目指す。ロー・コネクトボードはセット・ストレート・2P・99〜QQ を必ず打つ。ES 40bb 以下ではポラライズしない。\n" +
      "【3bet ポットの OOP(3ベッター)】OOP の方がレンジが強く、SPR が低いほどポジションの不利が薄れるので、高い頻度で安く CB を打つ。浅いローボードはワンペアでジャム、オーバーペアとエアーは安ベット。深いローボードはチェック中心で、まくられやすい 77〜TT だけ 75〜100%。A ハイはレンジで安ベット(深いときはポケットと弱い A をチェック)。\n" +
      "【4bet ポットの OOP(コーラー)】A-M-M・Q-M-M はとても安いドンク、K ハイはレンジチェック、T ハイ以下はワンペア・オーバーペア・ストレートドローでたまにドンクオールイン。ローボードのドンクオールインには、ワンペア以上と AK はコールする。\n" +
      "SPR 2.5 未満を浅い、2.5 以上を深いとしている。",
  };
}
