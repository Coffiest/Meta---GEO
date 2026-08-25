/**
 * 共有リンクに流入元を埋める。
 *
 * どの画面からの共有が実際に人を連れてきたかを測るために付ける。これが無いと
 * 「共有ボタンは押されているが流入していない」のか「そもそも押されていない」のかを
 * 区別できず、導線をどこから直せばいいか決められない。
 *
 * apps/web から import して使う。アプリ側に写して持つとテストが実物を守れなくなるため、
 * ロジックはここに1つだけ置く。
 */

/** 共有元の識別子。 */
export type ShareSurface = "hand" | "result" | "milestone" | "invite" | "rating";

/** 既に同名のパラメータがあれば尊重する(呼び出し側や広告側の指定を上書きしない)。 */
export function withShareTracking(url: string, surface: ShareSurface): string {
  try {
    const u = new URL(url);
    if (!u.searchParams.has("utm_source")) u.searchParams.set("utm_source", "share");
    if (!u.searchParams.has("utm_medium")) u.searchParams.set("utm_medium", "social");
    if (!u.searchParams.has("utm_campaign")) u.searchParams.set("utm_campaign", surface);
    return u.toString();
  } catch {
    // URLとして解釈できない場合は触らない(壊れたリンクを共有させない)。
    return url;
  }
}
