/**
 * X(Twitter)共有まわりの共通ヘルパー。
 * 結果画面(TournamentResultScreen)とハンド履歴(GameHandHistorySheet)の両方から使う。
 */

/** 共有URLに載せる本番URL(常時固定)。OGPは本番ドメインでしか展開されないため定数で持つ。 */
export const PROD_URL = "https://meta-geo-poker.vercel.app";

/**
 * Xのintentツイートを新規タブで開く。
 * ポップアップブロック等で開けなかった場合は false を返す(呼び出し側でトースト等に使う)。
 */
export function openTweetIntent({ text, url, hashtags }: { text: string; url: string; hashtags?: string[] }): boolean {
  if (typeof window === "undefined") return false;
  const p = new URLSearchParams();
  p.set("text", text);
  p.set("url", url);
  if (hashtags && hashtags.length > 0) p.set("hashtags", hashtags.join(","));
  try {
    window.open(`https://twitter.com/intent/tweet?${p.toString()}`, "_blank", "noopener,noreferrer");
    return true;
  } catch {
    return false;
  }
}

/** チップ収支をBB単位の共有用文字列(+42.5 / -12.3 / 0)にする。小数第1位まで。 */
export function toBbValue(chips: number, bigBlind: number): number {
  if (!bigBlind) return 0;
  return Math.round((chips / bigBlind) * 10) / 10;
}

/** BB値の表示文字列(+42.5bb / -12.3bb / ±0bb)。 */
export function formatBbValue(bb: number): string {
  if (bb === 0) return "±0bb";
  const str = Number.isInteger(bb) ? String(Math.abs(bb)) : Math.abs(bb).toFixed(1);
  return `${bb > 0 ? "+" : "-"}${str}bb`;
}

/**
 * 1ハンドのシェアURL(/share/hand?...)を組み立てる。
 * 展開時にOGP画像として /api/og/hand の動的カード(白+ゴールド、実カード絵)が表示される。
 */
export function buildHandShareUrl(params: {
  displayName?: string;
  heroCards: string[];
  board: string[];
  bb: number;
  wonByFold?: boolean;
}): string {
  const p = new URLSearchParams();
  if (params.displayName) p.set("name", params.displayName);
  if (params.heroCards.length > 0) p.set("h", params.heroCards.join(","));
  if (params.board.length > 0) p.set("b", params.board.join(","));
  p.set("bb", String(params.bb));
  if (params.wonByFold) p.set("fold", "1");
  return `${PROD_URL}/share/hand?${p.toString()}`;
}

/** 1ハンドのシェア本文。勝ち/負けで一言を変え、リプライを誘う。 */
export function buildHandShareText(bb: number): string {
  const amount = formatBbValue(bb);
  if (bb > 0) return `Poker ARTでこのハンド、${amount} 取れました。`;
  if (bb < 0) return `Poker ARTでこのハンド、${amount}。あなたならどうしますか？`;
  return "Poker ARTのこのハンド、あなたならどうしますか？";
}
