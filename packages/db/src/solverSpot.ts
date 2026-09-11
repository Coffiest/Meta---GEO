import { createHash } from "node:crypto";

/**
 * 局面(スポット)の正規化。GTO解のキャッシュ命中率を決める最重要モジュール。
 * ノード抽出パス(ルックアップ)とソルバー入力パス(解析)の両方が「同じ正規化」を通ることで
 * 初めてキャッシュが効く。したがって正規化ロジックはここに一本化し、両パスから import する。
 *
 * board正規化(スート正規化)の考え方:
 *   - フロップの3枚は集合(順不同)なのでランク降順に並べ替えてから正規化する
 *     (同じフロップが入力順違いで別キーにならないように)。
 *   - ターン/リバーは各ストリート固有の1枚なので、そのまま末尾に付ける。
 *   - スートは「初出順」に a,b,c,d へ写像する。ランクは保持。
 *     これによりフラッシュ構造・ペア構造を保ったまま 4! 通りのスート順列を1キーへ集約する。
 */

const RANK_ORDER = "AKQJT98765432";

/** カード文字列 "As" / "10h" / "Th" からスート1文字を取り出す。 */
function suitOf(card: string): string {
  return card.slice(-1);
}

/** カード文字列からランク1文字を取り出す("10" は "T" に正規化)。 */
function rankOf(card: string): string {
  const r = card.slice(0, -1);
  return r === "10" ? "T" : r;
}

function rankIndex(card: string): number {
  const i = RANK_ORDER.indexOf(rankOf(card));
  return i === -1 ? RANK_ORDER.length : i;
}

/**
 * スート正規化済みのボード文字列を返す(例: "AaKb7c")。
 * board は現在のストリートまでの全カード。0枚(プリフロップ)なら空文字。
 */
export function canonicalizeBoard(board: readonly string[]): string {
  if (board.length === 0) return "";

  // フロップ(先頭3枚)はランク降順にソート、ターン/リバーはそのまま。
  const flop = board.slice(0, 3).slice().sort((a, b) => rankIndex(a) - rankIndex(b));
  const rest = board.slice(3);
  const ordered = [...flop, ...rest];

  const suitMap = new Map<string, string>();
  const letters = "abcd";
  let out = "";
  for (const card of ordered) {
    const s = suitOf(card);
    if (!suitMap.has(s)) suitMap.set(s, letters[suitMap.size] ?? "z");
    out += rankOf(card) + suitMap.get(s);
  }
  return out;
}

export interface SpotComponents {
  /** "preflop" | "flop" | "turn" | "river" */
  street: string;
  /** 有効スタック帯(stackBucketと同区分、または SPR帯)。 */
  effStackBucket: string;
  /** 相対ポジション。ポストフロップHUは "IP" | "OOP"。プリフロップは絶対ポジション。 */
  heroPos: string;
  /** canonicalizeBoard() の出力。 */
  boardCanon: string;
  /** そのストリート内で直面したアクションライン(バケット列を連結)。 */
  actionLine: string;
  /** ベットサイズ抽象化ID。 */
  betTree: string;
}

/** 正規化済みコンポーネントから決定的な spotKey(sha1) を生成する。 */
export function spotKeyOf(c: SpotComponents): string {
  const joined = [c.street, c.effStackBucket, c.heroPos, c.boardCanon, c.actionLine, c.betTree].join("|");
  return createHash("sha1").update(joined).digest("hex");
}
