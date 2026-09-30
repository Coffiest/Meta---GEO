import type {
  BarrelCard,
  BarrelHandKey,
  BarrelVerdict,
} from "@meta-geo/engine/src/review/barrelPlan.js";
import type { BetSizeClass } from "@meta-geo/engine/src/review/betRole.js";
import { BARREL_TABLE, DOUBLE_BARREL_BODY, RIVER_NOTE } from "@/data/barrelTable";

/**
 * ダブル/トリプルバレルの評価(`BarrelVerdict`)から、バリィの台詞を組み立てる。
 *
 * オーナー指示: 打つべき手を打たなかった/打たない手で打った/サイズが違う、のどれでも、
 * **なぜダメか**と**どうするべきか**をバリィが話す。打たない手をチェックしたら褒める。
 * ノートのハンド選定とサイズ選定は1つも落とさずに解説へ入れる。
 *
 * 場合分けは組み合わせが多い(ストリート × カード4種 × 手30種 × 場合12種)ので、固定の文章を
 * 並べずに、ここで部品を組み合わせて作る。どの組み合わせでも必ず台詞が出る。
 *
 *  - `summary`: 吹き出しに常時出る台詞(判定の理由と、どうするべきか)
 *  - `points`: その局面のカードの、ノートの打ち方(サイズ・バリュー・ブラフ・チェック)。常時出る
 *  - `body`: 全カードぶんの表(タップで開く)
 */
export interface BarrelComment {
  title: string;
  summary: string;
  points: { label: string; text: string }[];
  body: string;
}

const HAND_NAME: Record<BarrelHandKey, string> = {
  straightFlush: "ストレートフラッシュ",
  quads: "フォーカード",
  nutFullHouse: "ナッツのフルハウス",
  fullHouse: "フルハウス",
  strongFlush: "強いフラッシュ",
  weakFlush: "弱いフラッシュ",
  flush: "フラッシュ",
  straight: "ストレート",
  topSet: "トップセット",
  set: "セット",
  trips: "トリップス",
  twoPair: "ツーペア",
  overPair: "オーバーペア",
  topPairStrong: "キッカーの強いトップペア",
  topPairWeak: "キッカーの弱いトップペア",
  middlePair: "ミドルペア",
  bottomPair: "ボトムペア",
  underPair: "アンダーペア",
  flushDrawWithPair: "ペア付きのフラッシュドロー",
  flushDraw: "フラッシュドロー",
  openEnded: "オープンエンドのストレートドロー",
  gutshot: "ガットショット",
  missedStraightDraw: "外れたストレートドロー",
  missedFlushDraw: "外れたフラッシュドロー",
  aceHighWeak: "キッカーの弱いAハイ",
  aceHighStrong: "キッカーの強いAハイ",
  kingHigh: "Kハイ",
  queenHigh: "Qハイ",
  jackHigh: "Jハイ",
  tenHighOrLower: "Tハイ以下",
};

/** 実際のサイズの言い方(ポット比の段)。 */
const SIZE_NAME: Record<BetSizeClass, string> = {
  block: "33%くらいの小さなベット",
  small: "50%くらいのベット",
  medium: "75%くらいのベット",
  large: "ポットくらいのベット",
  overbet: "オーバーベット",
};

const CARD_NAME: Record<BarrelCard, string> = {
  overcard: "オーバーカード",
  paired: "ペアカード",
  flush: "フラッシュ完成カード",
  rag: "ラグ",
};

const SUIT: Record<string, string> = { s: "♠", h: "♥", d: "♦", c: "♣" };

/** "As" → "A♠"。読めなければそのまま。 */
function cardLabel(card: string | undefined): string | null {
  if (!card || card.length < 2) return null;
  return `${card.slice(0, -1)}${SUIT[card.slice(-1)] ?? card.slice(-1)}`;
}

/** 表でバリューになるトップペアの基準(「キッカーの弱いトップペア」を咎めるとき)。 */
const TOP_PAIR_LINE: Record<BarrelCard, string> = {
  overcard: "トップペアでバリューになるのは、キッカーがT以上(例ならAT以上)のときだけだよ。",
  paired: "トップペアでバリューになるのは、キッカーがT以上(例ならKT以上)のときだけだよ。",
  flush: "トップヒットでバリューになるのは、キッカーがT以上(例ならKT以上)のときだけだよ。",
  rag: "トップペアでバリューになるのは、キッカーがJ以上(例ならKJ以上)のときだけだよ。",
};

/** サイズが小さすぎるときの理由(カードごと)。 */
const TOO_SMALL_WHY: Record<BarrelCard, string> = {
  overcard:
    "ここは強い手とドローだけで打つポラライズの場面だから、しっかり大きく打ってバリューを取り、ブラフでも降りてもらうんだ。小さいと、どちらも取り切れないよ",
  paired:
    "トリップス以上とドローに絞って打つポラライズの場面だから、しっかり大きく打ってバリューを取り、ブラフでも降りてもらうんだ。小さいと、どちらも取り切れないよ",
  flush:
    "小さすぎると、相手のフラッシュドローやペアに安く付いてこられて、バリューもフォールドエクイティも足りなくなるよ",
  rag:
    "ラグは相手の手が強くならないカード。大きく打つと、バリューを最大化できて、レイズも返されにくく、リバーでちょうどオールインまで持っていけるんだ(ジオメトリックサイズ)",
};

/** サイズが大きすぎるときの理由(カードごと)。ラグは表のサイズが最大なので無い。 */
const TOO_BIG_WHY: Record<BarrelCard, string> = {
  overcard: "大きすぎると、バリューを取りたい弱い手が全部降りて、強い手にだけコールされちゃうよ",
  paired: "大きすぎると、バリューを取りたい弱い手が全部降りて、強い手にだけコールされちゃうよ",
  flush:
    "フラッシュが完成しうるカードでは相手にもフラッシュがあるから、大きく打つとフラッシュにしかコールされず、ブラフも通りにくいんだ",
  rag: "",
};

/** どうするべきか(表のサイズで打つ)。 */
function betAdvice(card: BarrelCard): string {
  return `${BARREL_TABLE[card].size}で打とうね。`;
}

/** 台詞を組み立てる。 */
function sentence(v: BarrelVerdict, cardText: string, barrelName: string): string {
  const hand = HAND_NAME[v.handKey];
  const size = BARREL_TABLE[v.card].size;
  const river = v.street === "river";

  switch (v.situation) {
    case "betOk": {
      if (v.hand === "mixedBluff") {
        return `${cardText}で、${hand}を${size}でブラフ。フラッシュドローは半分くらいチェックレンジに残す手だけど、打つ半分としてノートどおりの${barrelName}だよ。ナイス！`;
      }
      if (v.hand === "optionalBluff") {
        return `${cardText}で、${hand}を${size}でブラフ。Tハイ以下は打つかどうか任意の手で、打つなら${size}でばっちりだよ！`;
      }
      const kind = v.hand === "value" ? "バリューベット" : "ブラフ";
      return `${cardText}で、${hand}を${size}で${kind}。ノートどおりの${barrelName}、ばっちりだね！`;
    }
    case "betTooSmall":
      return (
        `${hand}は${barrelName}で打つ手だから、打ったのはいいね。でも${cardText}のサイズは${size}なんだ。` +
        `${SIZE_NAME[v.actual ?? "block"]}だと小さすぎるよ。${TOO_SMALL_WHY[v.card]}。${betAdvice(v.card)}`
      );
    case "betTooBig":
      return (
        `${hand}は${barrelName}で打つ手だから、打ったのはいいね。でも${cardText}のサイズは${size}なんだ。` +
        `${SIZE_NAME[v.actual ?? "overbet"]}は大きすぎるよ。${TOO_BIG_WHY[v.card]}。${betAdvice(v.card)}`
      );
    case "betCheckHand": {
      if (v.handKey === "flushDrawWithPair") {
        return `${cardText}では、${hand}はチェックに回す手なんだ。ペアでショーダウンバリューもあるから、打たずにチェックレンジに入れて、チェックレンジを強くしておこうね。`;
      }
      return (
        `${cardText}では、${hand}はチェックに回す手なんだ。強い手を全部打っちゃうと、チェックしたときのレンジが弱くなって狙われやすくなるよ。` +
        `この手はチェックして、チェックレンジを強化しようね。`
      );
    }
    case "betShowdown": {
      const base =
        v.handKey === "topPairWeak"
          ? `${hand}は、${cardText}ではバリューに届かないんだ。${TOP_PAIR_LINE[v.card]}`
          : `${hand}は、${cardText}のバリューにもブラフにも入らない手なんだ。`;
      const big = v.actual === "large" || v.actual === "overbet" ? `しかも${SIZE_NAME[v.actual]}だと、負けたときの損が大きくなるよ。` : "";
      return (
        base +
        `打つと、降りるのは自分より弱い手で、コールしてくるのは強い手ばかりになっちゃう。${big}` +
        `ショーダウンバリューがあるから、ここはチェックしようね。`
      );
    }
    case "betAir": {
      if (v.handKey === "missedFlushDraw") {
        return (
          `外れたフラッシュドローでブラフするのは悪手だよ。自分がそのスートを持っていると、相手の外れたフラッシュドロー(降りてくれる手)が減っちゃうんだ(ブロッカー)。` +
          `リバーのブラフは外れたストレートドローで打って、この手はチェックであきらめようね。`
        );
      }
      if (v.card === "flush") {
        return (
          `${cardText}では、ピュアブラフはしないんだ。${hand}はまだ勝ち目の無い手だから、打っても強い手にコールされるだけ。` +
          `この手はチェックであきらめて、` +
          (river
            ? `ブラフは外れたストレートドローで打とうね。`
            : `ブラフはストレートドローやペアなしのフラッシュドローみたいな、完成の目がある手で打とうね。`)
        );
      }
      return (
        `${hand}は、${cardText}のブラフに使う手じゃないんだ。ブラフは下の「ブラフ」の手で打つから、` +
        `この手はチェックであきらめようね。`
      );
    }
    case "checkValue": {
      const strong = v.handKey !== "topPairStrong" && v.handKey !== "overPair";
      return (
        `${hand}は${barrelName}でバリューを取る手なのに、チェックしちゃったね。` +
        (strong
          ? `ここで打たないと、相手のもっと弱い手からバリューが取れず、大きく取り逃しちゃうよ。`
          : `チェックすると、弱いペアやドローからのバリューを取り逃しちゃうよ。`) +
        `${cardText}では${size}で打とうね。`
      );
    }
    case "checkBluff": {
      const draw = v.handKey === "gutshot" || v.handKey === "openEnded" || v.handKey === "flushDraw";
      return (
        `${hand}は${barrelName}のブラフで打つ手だよ。` +
        (draw
          ? `打てば相手を降ろせるし、コールされても完成すれば勝てるんだ(セミブラフ)。チェックだと、そのチャンスを逃しちゃう。`
          : `ショーダウンでは勝てないから、打って相手を降ろすしか勝ち方が無いんだ。チェックだと、そのままあきらめることになっちゃう。`) +
        `${cardText}では${size}で打とうね。`
      );
    }
    case "checkMixedOk":
      return v.hand === "mixedBluff"
        ? `${hand}は、半分くらいはチェックレンジに残す手だよ。チェックもノートどおり、ナイスだね！打つなら${size}だよ。`
        : `${hand}は、打つかどうか任意の手だよ。チェックでも大丈夫、ナイス判断だね！打つなら${size}だよ。`;
    case "checkHandOk":
      return v.handKey === "flushDrawWithPair"
        ? `${hand}をチェック、ナイス！${cardText}では、ワンペア以上のフラッシュドローはチェックに回す手なんだ。`
        : `${hand}をチェック、ナイス！${cardText}では、この手はチェックに回してチェックレンジを強化する手なんだ。ノートどおりだね！`;
    case "checkShowdownOk":
      return (
        `${hand}をチェック、いい判断だね！${hand}は${cardText}のバリューにもブラフにも入らない手。` +
        `打つと強い手にだけコールされちゃうから、打たずにショーダウンを目指すのが正解だよ。`
      );
    case "checkAirOk":
      if (v.handKey === "missedFlushDraw") {
        return `外れたフラッシュドローをチェック、ナイス！相手の外れたフラッシュドローをブロックしちゃうから、リバーのブラフには回さない手なんだ。`;
      }
      if (v.card === "flush") {
        return `${hand}をチェック、ナイス！${cardText}ではピュアブラフはしないから、チェックであきらめるのがノートどおりだよ。`;
      }
      return `${hand}をチェック、ナイス！バリューにもブラフにも入らない手だから、無理に打たずにあきらめるのが正解だよ。`;
  }
}

/**
 * 評価から、バリィの解説を作る。
 *
 * @param board 最終ボード(落ちたカードの名前を入れるため)。無ければカードの種類だけで言う。
 */
export function barrelComment(v: BarrelVerdict, board: readonly string[] = []): BarrelComment {
  const row = BARREL_TABLE[v.card];
  const streetName = v.street === "turn" ? "ターン" : "リバー";
  const barrelName = v.street === "turn" ? "ダブルバレル" : "トリプルバレル";
  const label = cardLabel(board[v.street === "turn" ? 3 : 4]);
  const cardText = `${CARD_NAME[v.card]}${label ? `(${label})` : ""}が落ちた${streetName}`;

  const points: BarrelComment["points"] = [
    { label: "サイズ", text: row.sizeLine },
    ...(row.policy ? [{ label: "方針", text: row.policy }] : []),
    { label: "バリュー", text: row.value },
    { label: "ブラフ", text: row.bluff },
    { label: "チェック", text: row.check },
  ];
  if (v.street === "river") points.push({ label: "リバー", text: RIVER_NOTE });

  return {
    title: `${barrelName}: ${row.title}(例 K♥8♦3♥ → ${row.example})`,
    summary: sentence(v, cardText, barrelName),
    points,
    body: DOUBLE_BARREL_BODY,
  };
}
