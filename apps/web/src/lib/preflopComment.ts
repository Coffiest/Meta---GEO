import type { ReviewedDecision } from "./reviewApi";

/**
 * プリフロップの一般論の解説。GTO の表(サーバーが決定に載せた `gtoActions`)と手札の分類から組み立てる。
 * 記事・Notion・局面の解説のどれも当たらないプリフロップの決定(オープンレンジ外の手など)に出す。
 */
type Group = "fold" | "call" | "raise" | "allIn";

function groupOf(bucket: string): Group {
  if (bucket === "fold") return "fold";
  if (bucket === "call") return "call";
  if (bucket === "allIn") return "allIn";
  return "raise";
}

/** GTO の頻度を、サイズをまとめたアクションごとに合計して多い順に並べる。 */
function groupActions(acts: { bucket: string; frequency: number }[]): { group: Group; frequency: number }[] {
  const sum = new Map<Group, number>();
  for (const a of acts) sum.set(groupOf(a.bucket), (sum.get(groupOf(a.bucket)) ?? 0) + a.frequency);
  return [...sum].map(([group, frequency]) => ({ group, frequency })).sort((x, y) => y.frequency - x.frequency);
}

function groupName(g: Group, facing: boolean): string {
  if (g === "fold") return "フォールド";
  if (g === "call") return "コール";
  if (g === "allIn") return "オールイン";
  return facing ? "3bet" : "オープン";
}

/** 「このハンドはGTOでは3betが推奨されるよ」の型(オーナー指示の言い方)。 */
function recommend(g: Group, facing: boolean): string {
  if (facing && g === "call") return "GTOでは3betを打たずにコールが推奨されているよ";
  return `GTOでは${groupName(g, facing)}が推奨されているよ`;
}

function pct(f: number): string {
  return `${Math.round(f * 100)}%`;
}

export function preflopComment(
  d: ReviewedDecision,
  v: { hand?: string; pos?: string }
): { title: string; summary: string; body: string } | undefined {
  if (d.street !== "preflop" || !d.gtoActions || d.gtoActions.length === 0) return undefined;
  const acts = d.gtoActions.filter((a) => a.frequency > 0);
  if (acts.length === 0) return undefined;
  const hero = d.actionTaken.bucket;
  const facing = facingRaise(d);
  const who = [v.pos, v.hand].filter(Boolean).join("の");
  // 手札の分類(「ハイ+ローのオフスート」など)は言わない(オーナー指示)。
  const subject = who || "このハンド";
  // サイズには触れない(オーナー指示)。レイズのサイズ違いは1つにまとめ、レイズに直面していれば 3bet と呼ぶ。
  const groups = groupActions(acts);
  const name = (g: Group) => groupName(g, facing);
  const heroGroup = groupOf(hero);
  const [first, second] = groups;
  const heroFreqG = groups.find((g) => g.group === heroGroup)?.frequency ?? 0;
  const close = second !== undefined && first.frequency - second.frequency <= 0.1;

  let summary: string;
  if (close && (heroGroup === first.group || heroGroup === second!.group)) {
    summary = `${subject}は、GTOでは${name(first.group)}と${name(second!.group)}のどちらもありのハンドだよ。${name(heroGroup)}を選んだのは定石どおりだね。`;
  } else if (close) {
    summary = `${subject}は、GTOでは${name(first.group)}と${name(second!.group)}のどちらかが推奨されているよ。${name(heroGroup)}ではなく、どちらかを選ぼうね。`;
  } else if (heroGroup === first.group) {
    summary = `${subject}は、${recommend(first.group, facing)}。定石どおりだね。`;
  } else if (first.group === "fold") {
    summary = facing
      ? `${subject}は、GTOでは${pct(first.frequency)}降りるハンドなんだ。ここはコールも3betもせずにフォールドしよう。`
      : `${subject}はオープンしないよ。GTOでは${pct(first.frequency)}降りるハンドだから、ここはフォールドしよう。`;
  } else if (heroGroup === "fold" && !facing) {
    summary = `${subject}は${v.pos ?? ""}のオープンレンジに入るハンドだよ。${recommend(first.group, facing)}。降りずにオープンしようね。`;
  } else if (heroFreqG >= 0.3) {
    summary = `${subject}は、${recommend(first.group, facing)}。${name(heroGroup)}も${pct(heroFreqG)}使うけど、${name(first.group)}を多めにしようね。`;
  } else {
    summary = `${subject}は、${recommend(first.group, facing)}。${name(heroGroup)}ではなく${name(first.group)}を選ぼうね。`;
  }
  // A5s・A4s は 3bet に回せることを普段から教える(オーナー指示)。
  if (facing && (v.hand === "A5s" || v.hand === "A4s") && heroGroup !== "raise" && heroGroup !== "allIn") {
    summary += `${v.hand}は、ライトな3betに回すこともできるよ。`;
  }
  const lines = groups.map((g) => `・${name(g.group)}: ${pct(g.frequency)}`).join("\n");
  return {
    title: "GTO のレンジで見ると",
    summary,
    body:
      `この局面の GTO の頻度:\n${lines}\n\n` +
      "プリフロップは、ポジション(後ろに何人残っているか)とスタックの深さで参加するハンドレンジが決まる。" +
      "前のポジションほどタイトに、BTN や SB は広くオープンする。スタックが浅くなるほど、コールが減りオールインかフォールドの二択が増える。",
  };
}

/**
 * 誰かのレイズ(またはリンプ)に直面しているか。`facingSizeBb` は未参加でもブラインドとの差額
 * (UTG なら 1bb、SB なら 0.5bb)が入るので、それを超えたときだけ「直面している」とみなす。
 */
function facingRaise(d: ReviewedDecision): boolean {
  const f = d.facingSizeBb ?? 0;
  const blindGap = d.heroPos === "BB" ? 0 : d.heroPos === "SB" ? 0.5 : 1;
  return f > blindGap + 1e-6;
}
