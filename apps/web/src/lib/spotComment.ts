import type { BetSizeClass } from "@meta-geo/engine/src/review/betRole.js";
import type {
  AfterCheckRaiseVerdict,
  CheckRaiseVerdict,
  DonkVerdict,
  ProbeHandKey,
  ProbeSize,
  ProbeVerdict,
  SpotHandKey,
} from "@meta-geo/engine/src/review/spotPlans.js";
import type { SpotVerdict } from "@meta-geo/engine/src/review/strategyVerdict.js";
import {
  AFTER_CHECK_RAISE_BODY,
  AFTER_CHECK_RAISE_TABLE,
  CHECK_RAISE_BODY,
  CHECK_RAISE_SHORT_STACK,
  CHECK_RAISE_TABLE,
  DONK_BODY,
  DONK_REASON_TEXT,
  PROBE_BODY,
  PROBE_DEFINITION,
  PROBE_TABLE,
} from "@/data/spotTables";
import type { BarrelComment } from "./barrelComment";

/**
 * プローブ・ドンク・チェックレイズの評価(`SpotVerdict`)から、バリィの台詞を組み立てる。
 *
 * オーナー指示: Notion に記載のある場面では、打った/打たなかった/コールした/降りたのどれでも、
 * **必ず**なぜ良い(悪い)か・どうするべきかをバリィが話す。ノートの手の選び方・サイズ・頻度は落とさない。
 * 形は `barrelComment.ts` と同じ(台詞 + その局面の表の行 + 節全体の詳細)。
 */

const HAND: Record<SpotHandKey, string> = {
  straightFlush: "ストレートフラッシュ",
  quads: "フォーカード",
  fullHouse: "フルハウス",
  nutFlush: "ナッツフラッシュ",
  flush: "フラッシュ",
  upperStraight: "上のストレート",
  lowerStraight: "下のストレート",
  straight: "ストレート",
  set: "セット",
  trips: "トリップス",
  strongTrips: "キッカーの強いトリップス",
  twoPair: "ツーペア",
  overPair: "オーバーペア",
  topPairTopKicker: "トップペア・トップキッカー",
  topPair: "トップペア",
  middlePair: "ミドルペア",
  bottomPair: "ボトムペア",
  underPair: "アンダーペア",
  comboDraw: "コンボドロー",
  nutFlushDraw: "ナッツフラッシュドロー",
  flushDraw: "フラッシュドロー",
  openEnded: "オープンエンドのストレートドロー",
  gutshot: "ガットショット",
  doubleBackdoor: "ダブルバックドア",
  nutDoubleBackdoor: "ナッツのダブルバックドア",
  bottomPairDoubleBackdoor: "ダブルバックドア付きのボトムヒット",
  missedStraightDraw: "外れたストレートドロー",
  missedFlushDraw: "外れたフラッシュドロー",
  aceHigh: "Aハイ",
  air: "何も無い手",
};

const PROBE_HAND: Record<ProbeHandKey, string> = {
  tpNotTk: "TPTK以外のトップペア",
  twoPair: "ツーペア",
  twoPairPlus: "ツーペア以上",
  gutshot: "ガットショット",
  oesd: "オープンエンドのストレートドロー",
  midBottomHit: "ミドル〜ボトムヒット",
  bottomHit: "ボトムヒット",
  underPair: "アンダーペア",
  set: "セット",
  flushCardBet: "ショーダウンバリューもエアーでもない手",
};

const SIZE_NAME: Record<BetSizeClass, string> = {
  block: "33%くらいの小さなベット",
  small: "50%くらいのベット",
  medium: "75%くらいのベット",
  large: "ポットくらいのベット",
  overbet: "オーバーベット",
};

const PROBE_SIZE: Record<ProbeSize, string> = { "33": "33%", "50": "50%", "2e": "2e(リバーでちょうどオールインになるサイズ)" };

const SUIT: Record<string, string> = { s: "♠", h: "♥", d: "♦", c: "♣" };

function cardLabel(card: string | undefined): string | null {
  if (!card || card.length < 2) return null;
  return `${card.slice(0, -1)}${SUIT[card.slice(-1)] ?? card.slice(-1)}`;
}

const STREET: Record<string, string> = { flop: "フロップ", turn: "ターン", river: "リバー" };

// ═════════════════════════════ プローブ ═════════════════════════════

function probeComment(v: ProbeVerdict, board: readonly string[]): BarrelComment {
  const row = PROBE_TABLE[v.card];
  const label = cardLabel(board[v.street === "turn" ? 3 : 4]);
  const cardText = `${row.title}${label ? `(${label})` : ""}が落ちた${STREET[v.street]}`;
  const hand = v.handKey ? PROBE_HAND[v.handKey] : HAND[v.handLabel];
  const sizes = [...new Set(v.sizes)].map((s) => PROBE_SIZE[s]).join("か");
  const boardKind = v.favorable ? "有利ボード" : "不利ボード";
  const freq = v.frequency === null ? "ノートに記載が無い" : `${v.frequency}%`;

  let summary: string;
  switch (v.situation) {
    case "betOk":
      summary = `${cardText}で、${hand}を${sizes}でプローブ。ノートどおり、ばっちりだね！${boardKind}だから頻度は${freq}だよ。`;
      break;
    case "betOtherSize":
      summary = `${hand}はプローブで打つ手だから、打ったのはいいね。でも${cardText}では、${hand}は${sizes}で打つ手なんだ。今のサイズは別の手の組のサイズだから、${sizes}で打とうね。`;
      break;
    case "betSizeOff":
      summary = `${hand}はプローブで打つ手だから、打ったのはいいね。でもサイズが表と違うよ。${cardText}では、${hand}は${sizes}で打とうね。`;
      break;
    case "betNotListed":
      summary = `${HAND[v.handLabel]}は、${cardText}のプローブで打つ手に入っていないんだ。表に無い手は打たずに、チェックしようね。`;
      break;
    case "betRepeat":
      summary = `${STREET[v.street]}でボードがペアになったら、プローブはせずにレンジでチェックするんだ。ここは打たずにチェックしようね。`;
      break;
    case "checkRepeatOk":
      summary = `ボードがペアになった${STREET[v.street]}は、レンジでチェック。ノートどおり、ナイスチェック！`;
      break;
    case "checkNotListedOk":
      summary = `${HAND[v.handLabel]}は、${cardText}のプローブで打つ手じゃないから、チェックで正解だよ。ナイス！`;
      break;
    case "checkListedLowFreqOk":
      summary = `${hand}は、打つなら${sizes}でプローブする手だよ。でも${cardText}の頻度は${freq}(${boardKind})で、チェックが多い場面だから、チェックでも大丈夫。ナイス判断だね！`;
      break;
    case "checkListedMissed":
      summary = `${hand}は、${cardText}で${sizes}のプローブを打つ手だよ。頻度は${freq}(2回に1回くらい)だから、打つのも十分ある場面なんだ。次は${sizes}で打つのも混ぜてみよう。`;
      break;
  }

  return {
    title: `プローブ: ${row.title}(${boardKind})`,
    summary,
    points: [
      { label: "場面", text: PROBE_DEFINITION },
      { label: "カード", text: `${row.title}(${boardKind})` },
      { label: "打つ手", text: row.hands },
      { label: "頻度", text: `有利ボード ${row.favorable} / 不利ボード ${row.unfavorable ?? "ノートに記載なし(有利ボードと同じ手で見る)"}` },
    ],
    body: PROBE_BODY,
  };
}

// ═════════════════════════════ ドンク ═════════════════════════════

function donkComment(v: DonkVerdict): BarrelComment {
  const r = v.reason ? DONK_REASON_TEXT[v.reason] : null;
  const hand = HAND[v.handLabel];
  const street = STREET[v.street];
  const miss =
    v.fit === "draw"
      ? "安くオッズを合わせてカードを見る機会を逃しちゃう"
      : v.fit === "nutClass"
        ? "相手にチェックバックされて、バリューを取り逃しちゃう"
        : "相手に大きく打たれて、大きなポットで判断させられちゃう";

  let summary: string;
  switch (v.situation) {
    case "betGood":
      summary = `${r!.title}でのドンク、ナイス！${r!.why}から、相手(オリジナル)はチェックバックしたくなる場面なんだ。${hand}は「${r!.hands}」の手だね。`;
      break;
    case "betGoodTooBig":
      summary = `${r!.title}でドンクが成立する場面で、${hand}を打ったのはいいね。でもドローのドンクは、無理やりオッズを合わせる目的で安く打つものなんだ。${SIZE_NAME[v.actual ?? "large"]}は大きすぎるよ。33〜50%くらいで打とうね。`;
      break;
    case "betNoFit":
      summary = `${r!.why}から、ここはドンクが成立する場面だよ。ただ、ここでドンクを打つのは「${r!.hands}」。${hand}はその手じゃないから、チェックでもよかったね。`;
      break;
    case "betNoReason":
      summary = `ここはドンクが成立しない場面なんだ。ドンクが成立するのは、オリジナルがチェックバックしたいスポット(きみの側にナッツ級が移ったスポット)だけ。ここはチェックから入ろうね。`;
      break;
    case "betNoReasonTurnDraw":
      summary = `ターンでドローを、無理やりオッズを合わせるために打つドンクは、リピートボード以外ではやらないんだ。ここは打たずにチェックしようね。`;
      break;
    case "betNoReasonRiverBlock":
      summary = `ドンクが許されない場面での、純粋なリバーブロックベットになってるよ。ブロックベットもドンクの条件を満たすときだけ打って、ここはチェックしようね。`;
      break;
    case "betNoReasonRag":
      summary = `ラグでのドンクベットは、血迷った謎ドンクになっちゃう。きみの側にナッツ級が移ったわけじゃないから、チェックから入ろうね。`;
      break;
    case "checkShouldDonk":
      summary = `${r!.why}から、ここはドンクを打つべき場面だよ。ここで打つのは「${r!.hands}」で、${hand}はまさにその手。チェックだと${miss}。${v.fit === "draw" ? "33〜50%くらいで安く打とうね。" : "先に打っていこうね。"}`;
      break;
    case "checkOkNoFit":
      summary = `${r!.why}から、ドンクが成立する場面ではあるね。でもドンクで打つのは「${r!.hands}」で、${hand}はその手じゃないから、チェックで正解だよ。ナイス！`;
      break;
    case "checkOkNoReason":
      summary = `${street}のこの場面はドンクが成立しないから、チェックで正解！ドンクが成立するのは、オリジナルがチェックバックしたい(きみの側にナッツ級が移った)場面だけなんだ。`;
      break;
  }

  return {
    title: r ? `ドンク: ${r.title}` : "ドンク: 成立しない場面",
    summary,
    points: [
      { label: "理由", text: r ? `${r.title}。${r.why}` : "ドンクが成立する条件に当たらない" },
      { label: "打つ手", text: r ? r.hands : "打たない(チェックから入る)" },
      {
        label: "成立",
        text: "フロップのローボード・コネクトボード / ターンリピート / 3betPotのロー1枚ストレートボード / フラッシュ完成カード / ストレート完成カード / ナッツが変化しOOP側にナッツ級ができた時",
      },
      {
        label: "誤り",
        text: "ドンクが許されない場面での純粋なリバーブロック / ターンでドローを無理やりオッズ合わせで打つのを、リピートボード以外で打つ / ラグでのドンク",
      },
    ],
    body: DONK_BODY,
  };
}

// ═════════════════════════════ チェックレイズ ═════════════════════════════

function checkRaiseComment(v: CheckRaiseVerdict): BarrelComment {
  const r = CHECK_RAISE_TABLE[v.board];
  const hand = HAND[v.handLabel];
  const where = `${r.title}の${STREET[v.street]}`;
  const recText = v.recommended === "large" ? "ポットレイズ(100%)" : "小さく(50%)";
  const role = v.hand === "bluff" ? "ブラフ" : "バリュー";
  const short = v.shortStack ? `スタックが浅い(SPR3以下)から、ワンペアもチェックレイズの候補だよ。` : "";

  let summary: string;
  switch (v.situation) {
    case "raiseOk":
      summary = `${where}で、${hand}を${role}でチェックレイズ。ノートどおりで、サイズも${recText}でばっちりだね！${short}`;
      break;
    case "raiseSizeOff":
      summary = `${hand}は${where}でチェックレイズする手だから、レイズはいいね。でもサイズは${recText}が基本なんだ。${SIZE_NAME[v.actual ?? "overbet"]}だと${v.sizeGap > 0 ? "大きすぎる" : "小さすぎる"}よ。${short}`;
      break;
    case "raiseValueCall":
      summary =
        v.board === "paired"
          ? `${hand}は、${where}ではコールに回す手なんだ。キッカーの強いトリップスだけを半分チェックレイズに回して、残りのトリップスはコールしようね。`
          : v.board === "straightBoard"
            ? `${hand}は、${where}ではコールに回す手なんだ。上のストレートでレイズ、下のストレートはコールしようね。`
            : `${hand}は、${where}ではコールに回す手なんだ。チェックレイズはセットとツーペア以上で打とうね。`;
      break;
    case "raiseNotListed":
      summary = `${hand}は、${where}のチェックレイズの表に入っていない手なんだ。チェックレイズは下の「バリュー」と「ブラフ」の手で打って、この手はコールかフォールドにしようね。`;
      break;
    case "raiseMonotone":
      summary = `モノトーンボードはパッシブにプレイするんだ(チェックレイズは頻度5%で小さく)。ここはレイズせずに、コールで受けようね。`;
      break;
    case "callRaiseHand":
      summary = `${hand}は、${where}でチェックレイズの${role}候補になる手だよ。頻度は控えめだから毎回じゃないけど、チェックレイズが少ないと相手にたくさんベットされて降ろされちゃう。ときどきレイズを混ぜようね。${short}`;
      break;
    case "callValueCallOk":
      summary = `${hand}をコール、ナイス！${where}では、この手はレイズせずにコールに回す手なんだ。`;
      break;
    case "foldValue":
      summary = `${hand}は、${where}でバリューになる手だよ。ここで降りるのはもったいない！チェックレイズかコールで続けようね。${short}`;
      break;
    case "foldBluff":
      summary = `${hand}は、チェックレイズのブラフに使う手なんだ。降りると、5枚目までカードを引ければ逆転できたかもしれないエクイティを捨てちゃう(エクイティの放棄)。チェックレイズかコールで続けようね。`;
      break;
    case "callNotListed":
      summary = `${hand}は、${where}のチェックレイズの表には入っていない手だから、レイズしないのはノートどおりだよ。コールで良いかは、ノートに記載が無いからGTOの評価も見てみよう。`;
      break;
    case "foldNotListed":
      summary = `${hand}は、${where}のチェックレイズの表には入っていない手だから、レイズしないのはノートどおりだよ。降りて良いかは、ノートに記載が無いからGTOの評価も見てみよう。`;
      break;
  }

  const points: BarrelComment["points"] = [
    { label: "ボード", text: r.title },
    { label: "サイズ", text: r.size },
    { label: "バリュー", text: r.value },
    { label: "ブラフ", text: r.bluff },
  ];
  if (r.note) points.push({ label: "メモ", text: r.note });
  points.push({ label: "なぜ", text: "エクイティの放棄を避けるため、チェックレイズは最低でも頻度15%必要。適切な頻度で混ぜると、相手のベットを抑制できる" });
  if (v.shortStack) points.push({ label: "浅い", text: CHECK_RAISE_SHORT_STACK });

  return { title: `チェックレイズ: ${r.title}`, summary, points, body: CHECK_RAISE_BODY };
}

function afterCheckRaiseComment(v: AfterCheckRaiseVerdict, board: readonly string[]): BarrelComment {
  const r = AFTER_CHECK_RAISE_TABLE[v.card];
  const hand = HAND[v.handLabel];
  const label = cardLabel(board[3]);
  const cardText = `${r.title.replace("が落ちた時", "")}${label ? `(${label})` : ""}`;

  let summary: string;
  switch (v.situation) {
    case "checkRangeOk":
      summary = `チェックレイズしてコールされたあと、${cardText}が落ちたターンはレンジ全体でチェック。ノートどおり、ナイス！`;
      break;
    case "betRangeCheck":
      summary = `チェックレイズしてコールされたあと、${cardText}が落ちたらレンジ全体でチェックするんだ。ここは打たずにチェックしようね。`;
      break;
    case "betFlushOk":
      summary = `チェックレイズのあとのフラッシュ完成カード${label ? `(${label})` : ""}は、全てのハンドで安くベット。ノートどおり、ナイス！`;
      break;
    case "betFlushSize":
      summary = `チェックレイズのあとのフラッシュ完成カードでは、全てのハンドで安くベットするんだ。${SIZE_NAME[v.actual ?? "large"]}は大きすぎるよ。33〜50%くらいで打とうね。`;
      break;
    case "checkFlush":
      summary = `チェックレイズのあとフラッシュ完成カードが落ちたら、全てのハンドで安くベットするんだ。チェックせずに、33〜50%くらいで打とうね。`;
      break;
    case "betOk":
      summary =
        v.hand === "value"
          ? `ラグ${label ? `(${label})` : ""}で${hand}をポットベット。リバーでのオールインを目指す、ノートどおりの打ち方だね！`
          : `ラグ${label ? `(${label})` : ""}で${hand}をブラフでベット。全てのドローとボトムペアはブラフで打つ手、ノートどおりだね！`;
      break;
    case "betSizeOff":
      summary = `ラグでは、${hand}はポットくらいでベットする手なんだ。${SIZE_NAME[v.actual ?? "block"]}だと${v.sizeGap > 0 ? "大きすぎる" : "小さすぎる"}よ。ポットくらいで打って、リバーでのオールインを目指そうね。`;
      break;
    case "checkValueOk":
      summary = `${hand}をチェック。ラグではバリューでポットベットが基本だけど、相手に降りられそうな時はチェックもありなんだ。`;
      break;
    case "checkBluff":
      summary = `${hand}は、ラグでブラフのベットに使う手だよ(全てのドローとボトムペア)。チェックせずに、ポットくらいで打とうね。`;
      break;
    case "betNotListed":
      summary = `${hand}は、ラグでベットする手(バリューは全てのセットとツーペア、ブラフは全てのドローとボトムペア)に入っていないんだ。ここはチェックしようね。`;
      break;
    case "checkNotListedOk":
      summary = `${hand}をチェック、ナイス！ラグで打つのはセット・ツーペアと、ドロー・ボトムペア。この手は打たない手だよ。`;
      break;
  }

  const points: BarrelComment["points"] = [
    { label: "カード", text: r.title },
    { label: "打ち方", text: r.plan },
  ];
  points.push({
    label: "全体",
    text: "オーバーカード・ペアカード → レンジ全体でチェック / フラッシュ完成カード → 全てのハンドで安くベット / ラグ → バリューでポットベット",
  });
  if (r.value) points.push({ label: "バリュー", text: r.value });
  if (r.bluff) points.push({ label: "ブラフ", text: r.bluff });
  return { title: `チェックレイズ後のターン: ${r.title}`, summary, points, body: AFTER_CHECK_RAISE_BODY };
}

/** 評価から、バリィの解説を作る。 */
export function spotComment(v: SpotVerdict, board: readonly string[] = []): BarrelComment {
  switch (v.kind) {
    case "probe":
      return probeComment(v, board);
    case "donk":
      return donkComment(v);
    case "checkRaise":
      return checkRaiseComment(v);
    case "afterCheckRaise":
      return afterCheckRaiseComment(v, board);
  }
}
