/**
 * 手札2枚を、解説の用語集(`packages/engine/knowledge/terminology.md`)の言い方で分類する。
 * 例: K4o →「ハイ+ローのオフスート」/ 96s →「ツーギャッパーのロースーテッド」/ A5s →「スーテッドエース(ホイール)」。
 */

const RANKS = "23456789TJQKA";
const SUIT_CHAR: Record<string, string> = { s: "s", h: "h", d: "d", c: "c" };

function rankOf(card: string): number {
  return RANKS.indexOf(card[0]!.toUpperCase()) + 2;
}

/** "Kd","4s" → "K4o"。読めなければ null。 */
export function handLabel(hole: readonly (string | null)[]): string | null {
  const [a, b] = hole;
  if (!a || !b || a.length < 2 || b.length < 2) return null;
  const ra = rankOf(a);
  const rb = rankOf(b);
  if (ra < 2 || rb < 2) return null;
  const hi = Math.max(ra, rb);
  const lo = Math.min(ra, rb);
  const ch = (r: number) => RANKS[r - 2]!;
  if (hi === lo) return `${ch(hi)}${ch(lo)}`;
  const suited = SUIT_CHAR[a.slice(-1).toLowerCase()] === SUIT_CHAR[b.slice(-1).toLowerCase()];
  return `${ch(hi)}${ch(lo)}${suited ? "s" : "o"}`;
}

const GAP_NAME = ["コネクター", "ワンギャッパー", "ツーギャッパー"];

/** 手札の分類。読めなければ null。 */
export function handCategory(hole: readonly (string | null)[]): string | null {
  const label = handLabel(hole);
  if (!label) return null;
  const hi = RANKS.indexOf(label[0]!) + 2;
  const lo = RANKS.indexOf(label[1]!) + 2;
  if (hi === lo) {
    if (hi >= 11) return "ハイポケットペア";
    if (hi >= 7) return "ミドルポケットペア";
    return "スモールポケットペア";
  }
  const suited = label.endsWith("s");
  const broadway = (r: number) => r >= 10;
  if (hi === 14) {
    if (broadway(lo)) return suited ? "スーテッドブロードウェイ" : "オフスートブロードウェイ";
    if (suited) return lo <= 5 ? "スーテッドエース(ホイール)" : "スーテッドエース";
    return "ウィークキッカーのAxオフスート";
  }
  if (broadway(hi) && broadway(lo)) return suited ? "スーテッドブロードウェイ" : "オフスートブロードウェイ";
  const gap = hi - lo - 1;
  if (broadway(hi)) {
    // ブロードウェイ1枚+9以下。つながりが近ければスーテッドコネクター等として扱う。
    if (suited) return gap <= 2 ? `スーテッド${GAP_NAME[gap]}` : `スーテッドの${label[0]}x`;
    return gap <= 1 ? `オフスートの${GAP_NAME[gap]}` : "ハイ+ローのオフスート";
  }
  // どちらも9以下。
  if (suited) return gap <= 2 ? `ロースーテッドの${GAP_NAME[gap]}` : "スリーギャッパー以上のロースーテッド";
  return gap <= 1 ? `オフスートの${GAP_NAME[gap]}` : "ローカードのオフスート";
}
