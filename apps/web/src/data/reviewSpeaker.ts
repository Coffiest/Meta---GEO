/**
 * 棋譜解析の解説を話すキャラクター。
 *
 * 解説は「キャラクターがやさしくアドバイスをくれる」形で書いてある(`reviewKnowledge.ts` の summary)。
 * キャラクターはオーナー確定の「バリィ」。
 *
 * `null` の間は、解説カードに情報アイコンだけが出る(名前も画像も出さない)。
 * 入れるときは、画像を `public/` に置いてその URL を `avatarSrc` に書くだけでよい。
 */
export interface ReviewSpeaker {
  name: string;
  /** `public/` 配下の画像 URL(例 "/characters/guide.png")。 */
  avatarSrc: string;
}

export const REVIEW_SPEAKER: ReviewSpeaker | null = {
  name: "バリィ",
  // オーナー支給の `bally_source.jpg` から `scripts/character-alpha.py` で書き出したもの。
  avatarSrc: "/characters/bally_v1.png",
};
