/**
 * X(Twitter)共有まわりの共通ヘルパー。
 * 結果画面(TournamentResultScreen)とハンド履歴(GameHandHistorySheet)の両方から使う。
 */

// 流入元の埋め込みは packages/marketing に1つだけ置いてある(テストが実物を守れるように)。
import { withShareTracking, type ShareSurface } from "@meta-geo/marketing";

export { withShareTracking };
export type { ShareSurface };

/** 共有URLに載せる本番URL(常時固定)。OGPは本番ドメインでしか展開されないため定数で持つ。 */
export const PROD_URL = "https://meta-geo-poker.vercel.app";

/**
 * Xのポスト作成画面を新規タブで開く。
 * ポップアップブロック等で開けなかった場合は false を返す(呼び出し側でトースト等に使う)。
 *
 * ドメインは x.com。旧 twitter.com/intent/tweet も転送されるが、余分なリダイレクトが1回挟まり、
 * モバイルではアプリへの引き渡しに失敗することがある。
 */
export function openTweetIntent({ text, url, hashtags }: { text: string; url: string; hashtags?: string[] }): boolean {
  if (typeof window === "undefined") return false;
  const p = new URLSearchParams();
  p.set("text", text);
  p.set("url", url);
  if (hashtags && hashtags.length > 0) p.set("hashtags", hashtags.join(","));
  try {
    window.open(`https://x.com/intent/post?${p.toString()}`, "_blank", "noopener,noreferrer");
    return true;
  } catch {
    return false;
  }
}

/** 共有の結果。呼び出し側が文言を出し分けられるよう、どの経路で共有したかを返す。 */
export type ShareOutcome = "shared" | "tweet" | "cancelled" | "failed";

/**
 * 端末の共有シートを優先して共有する。使えない環境ではXのポスト作成へ落とす。
 *
 * 日本のモバイルではLINEが圧倒的で、Xのintentだけを置くと大半の共有経路を捨てることになる。
 * navigator.share を使えばLINE・Instagram・メッセージ・Xがすべて1タップで出る。
 * デスクトップは対応が薄いので、その場合だけ従来どおりXへ流す。
 *
 * ユーザーがシートを閉じた場合(AbortError)は失敗ではないので "cancelled" を返す。
 * ここを failed 扱いにすると、閉じただけでエラートーストが出てしまう。
 */
export async function shareOrTweet(params: {
  text: string;
  url: string;
  surface: ShareSurface;
  hashtags?: string[];
}): Promise<ShareOutcome> {
  if (typeof window === "undefined") return "failed";
  const url = withShareTracking(params.url, params.surface);

  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ text: params.text, url });
      return "shared";
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return "cancelled";
      // 共有シートが出せない環境(権限・非セキュアコンテキスト等)はXへ落とす。
    }
  }

  return openTweetIntent({ text: params.text, url, ...(params.hashtags ? { hashtags: params.hashtags } : {}) })
    ? "tweet"
    : "failed";
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

/**
 * マイルストーン(節目到達)のシェアURL(/share/milestone?...)を組み立てる。
 * 展開時にOGP画像として /api/og/milestone の動的カードが表示される。
 */
export function buildMilestoneShareUrl(params: {
  displayName?: string;
  kind: "tournaments" | "rank";
  n: number;
  totalRankedPlayers: number;
}): string {
  const p = new URLSearchParams();
  if (params.displayName) p.set("name", params.displayName);
  p.set("kind", params.kind);
  p.set("n", String(params.n));
  if (params.kind === "rank") p.set("total", String(params.totalRankedPlayers));
  return `${PROD_URL}/share/milestone?${p.toString()}`;
}

/** 1ハンドのシェア本文。勝ち/負けで一言を変え、リプライを誘う。 */
export function buildHandShareText(bb: number): string {
  const amount = formatBbValue(bb);
  if (bb > 0) return `Poker ARTでこのハンド、${amount} 取れました。`;
  if (bb < 0) return `Poker ARTでこのハンド、${amount}。あなたならどうしますか？`;
  return "Poker ARTのこのハンド、あなたならどうしますか？";
}
