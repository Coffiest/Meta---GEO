/**
 * Google AdSense の設定を1箇所に集約する。
 *
 * ## パブリッシャーID
 *
 * `ca-pub-...` は公開情報で、広告スクリプトのsrcとしてページのソースにそのまま載る。
 * 審査用のスニペットは環境変数の設定漏れで消えてはいけない(消えると所有権確認が通らない)ので、
 * 本番の値をフォールバックとして持つ。`/ads.txt` も同じIDを返す必要があるため、両者でここを共有する。
 *
 * ## スロットID
 *
 * スロットIDは広告ユニットごとに異なり、**AdSenseの審査を通してユニットを作るまで存在しない**。
 * 未設定の枠は何も描画しない(空白やダミー広告を出さない)。
 *
 * ## 解説ページとアプリ内画面でスイッチを分けている理由
 *
 * AdSenseには「**パブリッシャーのコンテンツを含まない画面に Google の広告を出してはいけない**」という
 * ポリシーがあり、同じアカウントの別サイトは実際にこの違反を受けている。ロビー・トーナメント結果画面・
 * 棋譜解析はアプリのUIであって、こちらが書いた本文があるわけではないので、ここに該当しうる。
 *
 * そこで既定スロットID(`NEXT_PUBLIC_ADSENSE_SLOT_ID`)は**解説ページにしか効かない**ようにしてある。
 * アプリ内の枠を出すには、その置き場所専用の環境変数を**明示的に**設定する必要がある。
 * 「解説ページの広告をONにしたつもりが、アプリ全体にも出ていて違反になった」という事故を防ぐため。
 *
 * ## 環境変数(Vercel)
 *
 *   NEXT_PUBLIC_ADSENSE_CLIENT_ID            ca-pub-...(未設定なら下のフォールバック)
 *   NEXT_PUBLIC_ADSENSE_SLOT_ID              解説ページの既定スロットID(アプリ内画面には効かない)
 *   NEXT_PUBLIC_ADSENSE_CONTENT_SLOT_ID      解説ページだけ別ユニットにする場合
 *   --- ここから下は明示的に設定したときだけ広告が出る(上の既定値は効かない) ---
 *   NEXT_PUBLIC_ADSENSE_LOBBY_SLOT_ID        ホーム/ロビー最下部
 *   NEXT_PUBLIC_ADSENSE_RESULT_SLOT_ID       トーナメント結果画面
 *   NEXT_PUBLIC_ADSENSE_REVIEW_SLOT_ID       棋譜解析の無料要約画面
 *   NEXT_PUBLIC_ADSENSE_REVIEW_SCORE_SLOT_ID 棋譜解析の解析結果(GTOスコア)
 *
 * Next.jsは `NEXT_PUBLIC_` で始まる環境変数を**ビルド時に**文字列へ埋め込むので、
 * 値を変えたら再デプロイが必要(実行時に読み直されるわけではない)。
 */

/** 本番のパブリッシャーID。環境変数が未設定でも審査スニペットが出るようにするための既定値。 */
const FALLBACK_CLIENT_ID = "ca-pub-1994465186798216";

export const ADSENSE_CLIENT_ID =
  (process.env["NEXT_PUBLIC_ADSENSE_CLIENT_ID"] ?? "").trim() || FALLBACK_CLIENT_ID;

/** ads.txt が要求する形式("ca-pub-XXXX" → "pub-XXXX")。 */
export const ADSENSE_PUBLISHER_ID = ADSENSE_CLIENT_ID.replace(/^ca-/, "");

/** 広告の置き場所。1つの置き場所につき1つの広告ユニットを割り当てる。 */
export type AdPlacement = "lobby" | "result" | "reviewSummary" | "reviewScore" | "content";

/**
 * 既定スロットIDを使ってよい置き場所 ―― こちらが書いた本文があるページだけ。
 * ここに無い置き場所(アプリのUI画面)は、専用の環境変数を設定しない限り広告を出さない。
 */
const DEFAULT_SLOT_PLACEMENTS: ReadonlySet<AdPlacement> = new Set<AdPlacement>(["content"]);

// `process.env.NEXT_PUBLIC_*` はビルド時に静的な文字列へ置換されるため、キーは必ずリテラルで書く
// (変数でキーを組み立てると置換されず、常に undefined になる)。
const PLACEMENT_SLOT: Record<AdPlacement, string | undefined> = {
  lobby: process.env["NEXT_PUBLIC_ADSENSE_LOBBY_SLOT_ID"],
  result: process.env["NEXT_PUBLIC_ADSENSE_RESULT_SLOT_ID"],
  reviewSummary: process.env["NEXT_PUBLIC_ADSENSE_REVIEW_SLOT_ID"],
  reviewScore: process.env["NEXT_PUBLIC_ADSENSE_REVIEW_SCORE_SLOT_ID"],
  content: process.env["NEXT_PUBLIC_ADSENSE_CONTENT_SLOT_ID"],
};

const DEFAULT_SLOT = process.env["NEXT_PUBLIC_ADSENSE_SLOT_ID"];

/**
 * その置き場所に使うスロットID。未設定(=広告ユニット未作成)なら null で、枠ごと描画しない。
 *
 * 既定スロットIDへのフォールバックは解説ページだけ。アプリのUI画面は専用の環境変数を
 * 設定したときだけ出る(上の「スイッチを分けている理由」参照)。
 */
export function adSlotId(placement: AdPlacement): string | null {
  return resolveAdSlot({ placement, specific: PLACEMENT_SLOT[placement], fallback: DEFAULT_SLOT });
}

/** {@link adSlotId} の中身。環境変数から切り離してテストできるようにしてある。 */
export function resolveAdSlot(params: {
  placement: AdPlacement;
  /** その置き場所専用のスロットID。 */
  specific: string | undefined;
  /** 既定のスロットID(解説ページにしか効かない)。 */
  fallback: string | undefined;
}): string | null {
  const specific = (params.specific ?? "").trim();
  if (specific) return specific;
  if (!DEFAULT_SLOT_PLACEMENTS.has(params.placement)) return null;
  const fallback = (params.fallback ?? "").trim();
  return fallback || null;
}

/**
 * 広告を出してよいか。**有料プラン(使い放題プラン)の加入者には出さない** ―― 課金したのに広告が
 * 出ると解約理由になるし、「広告が消える」こと自体がプランの価値にもなるため。
 *
 * 判定の途中・失敗時にどちらへ倒すかが肝で、倒す向きを2つに分けてある:
 *
 * - **判定中は出さない。** 加入者に一瞬でも広告が見えるより、無料ユーザーへの表示が一拍遅れる方が
 *   害が小さい(加入者に見えてしまうと問い合わせや解約に直結する)。
 * - **判定に失敗したら出す。** ここで出さない側に倒すと、サブスクAPIが不調な間だけ広告収入が
 *   静かにゼロになり、しかも誰も気づけない。失敗は一時的なので、その間だけ加入者に広告が
 *   見えうる方を受け入れる。
 */
export function adsAllowedFor(params: {
  /** ログイン済みか(未ログインなら加入者ではありえないので常に表示)。 */
  hasToken: boolean;
  /** サブスク状態を取得中か。 */
  loading: boolean;
  /** 取得できたサブスク状態。取得に失敗したときは null。 */
  status: { active: boolean } | null;
}): boolean {
  if (!params.hasToken) return true;
  if (params.loading) return false;
  if (!params.status) return true;
  return !params.status.active;
}
