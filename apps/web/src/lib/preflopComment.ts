import type { ReviewedDecision } from "./reviewApi";

/**
 * プリフロップの一般論の解説。GTO の表(サーバーが決定に載せた `gtoActions`)と手札の分類から組み立てる。
 * 記事・Notion・局面の解説のどれも当たらないプリフロップの決定(オープンレンジ外の手など)に出す。
 */
const VERB: Record<string, string> = {
  fold: "降りる",
  call: "コール",
  "raise2-5": "レイズ",
  "raise5+": "大きめのレイズ",
  allIn: "オールイン",
};

function pct(f: number): string {
  return `${Math.round(f * 100)}%`;
}

export function preflopComment(
  d: ReviewedDecision,
  v: { hand?: string; handCategory?: string; pos?: string }
): { title: string; summary: string; body: string } | undefined {
  if (d.street !== "preflop" || !d.gtoActions || d.gtoActions.length === 0) return undefined;
  const acts = d.gtoActions.filter((a) => a.frequency > 0);
  if (acts.length === 0) return undefined;
  const top = acts.reduce((a, b) => (b.frequency > a.frequency ? b : a));
  const hero = d.actionTaken.bucket;
  const heroFreq = acts.find((a) => a.bucket === hero)?.frequency ?? 0;
  const facing = (d.facingSizeBb ?? 0) > 0;
  const who = [v.pos, v.hand].filter(Boolean).join("の");
  const cat = v.handCategory ? `(${v.handCategory})` : "";
  const subject = who ? `${who}${cat}` : "このハンド";
  const range = facing ? "コンティニューするレンジ" : `${v.pos ?? ""}のオープンレンジ`.trim();

  let summary: string;
  if (heroFreq >= 0.3) {
    summary = `${subject}は、GTOで${VERB[hero] ?? hero}が${pct(heroFreq)}のハンドだよ。定石どおりだね。`;
  } else if (top.bucket === "fold") {
    summary = `${subject}は${range}の外なんだ。GTOでは${pct(top.frequency)}降りるハンドだから、ここはフォールドしよう。`;
  } else if (hero === "fold") {
    summary = `${subject}は${range}に入るハンドだよ。GTOでは${VERB[top.bucket] ?? top.bucket}が${pct(top.frequency)}だから、降りずにオープンしようね。`;
  } else {
    summary = `${subject}は、GTOでは${VERB[top.bucket] ?? top.bucket}が${pct(top.frequency)}のハンドなんだ。${VERB[hero] ?? hero}より${VERB[top.bucket] ?? top.bucket}を選ぼうね。`;
  }
  const lines = acts
    .slice()
    .sort((a, b) => b.frequency - a.frequency)
    .map((a) => `・${VERB[a.bucket] ?? a.bucket}: ${pct(a.frequency)}(EV ${a.evBb >= 0 ? "+" : ""}${a.evBb.toFixed(2)}bb)`)
    .join("\n");
  return {
    title: "GTO のレンジで見ると",
    summary,
    body:
      `この局面の GTO の頻度とEV:\n${lines}\n\n` +
      "プリフロップは、ポジション(後ろに何人残っているか)とスタックの深さで参加するハンドレンジが決まる。" +
      "前のポジションほどタイトに、BTN や SB は広くオープンする。スタックが浅くなるほど、コールが減りオールインかフォールドの二択が増える。",
  };
}
