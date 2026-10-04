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
 * 置き場所ごとに別ユニットを作るとAdSenseのレポートが置き場所ごとに分かれて便利だが、
 * 最初から5つ作らせるのは手間なので、`NEXT_PUBLIC_ADSENSE_SLOT_ID` を1つ設定するだけで
 * 全ての枠が有効になるようにしてある(個別に設定した置き場所はそちらが優先)。
 *
 * ## 環境変数(Vercel)
 *
 *   NEXT_PUBLIC_ADSENSE_CLIENT_ID            ca-pub-...(未設定なら下のフォールバック)
 *   NEXT_PUBLIC_ADSENSE_SLOT_ID              全ての枠の既定スロットID
 *   NEXT_PUBLIC_ADSENSE_LOBBY_SLOT_ID        ホーム/ロビー最下部だけ別ユニットにする場合
 *   NEXT_PUBLIC_ADSENSE_RESULT_SLOT_ID       トーナメント結果画面だけ別ユニットにする場合
 *   NEXT_PUBLIC_ADSENSE_REVIEW_SLOT_ID       棋譜解析の無料要約画面だけ別ユニットにする場合
 *   NEXT_PUBLIC_ADSENSE_REVIEW_SCORE_SLOT_ID 棋譜解析の解析結果(GTOスコア)だけ別ユニットにする場合
 *   NEXT_PUBLIC_ADSENSE_CONTENT_SLOT_ID      ガイド等のコンテンツページだけ別ユニットにする場合
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

/** その置き場所に使うスロットID。未設定(=広告ユニット未作成)なら null で、枠ごと描画しない。 */
export function adSlotId(placement: AdPlacement): string | null {
  const id = (PLACEMENT_SLOT[placement] ?? DEFAULT_SLOT ?? "").trim();
  return id || null;
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
