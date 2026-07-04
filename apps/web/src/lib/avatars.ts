/**
 * プリセットアバター定義。DBにはキー文字列(avatarKey)だけを保存し、見た目はここで解決する。
 * 画像アップロード基盤なしでアバター機能を成立させるための方式。
 */
export interface AvatarDef {
  key: string;
  emoji: string;
  /** 円形背景のグラデーションクラス */
  bg: string;
}

export const HUMAN_AVATARS: AvatarDef[] = [
  { key: "fox", emoji: "🦊", bg: "bg-gradient-to-br from-orange-400 to-amber-600" },
  { key: "tiger", emoji: "🐯", bg: "bg-gradient-to-br from-yellow-400 to-orange-600" },
  { key: "panda", emoji: "🐼", bg: "bg-gradient-to-br from-slate-300 to-slate-500" },
  { key: "frog", emoji: "🐸", bg: "bg-gradient-to-br from-green-400 to-emerald-600" },
  { key: "cat", emoji: "🐱", bg: "bg-gradient-to-br from-amber-300 to-yellow-500" },
  { key: "dog", emoji: "🐶", bg: "bg-gradient-to-br from-amber-500 to-orange-700" },
  { key: "owl", emoji: "🦉", bg: "bg-gradient-to-br from-stone-400 to-stone-600" },
  { key: "penguin", emoji: "🐧", bg: "bg-gradient-to-br from-sky-400 to-blue-600" },
  { key: "octopus", emoji: "🐙", bg: "bg-gradient-to-br from-rose-400 to-pink-600" },
  { key: "dragon", emoji: "🐲", bg: "bg-gradient-to-br from-teal-400 to-cyan-600" },
  { key: "alien", emoji: "👽", bg: "bg-gradient-to-br from-lime-400 to-green-600" },
  { key: "ghost", emoji: "👻", bg: "bg-gradient-to-br from-indigo-400 to-violet-600" },
];

const BOT_AVATARS: AvatarDef[] = [
  { key: "bot1", emoji: "🤖", bg: "bg-gradient-to-br from-navy-600 to-navy-800" },
  { key: "bot2", emoji: "🤖", bg: "bg-gradient-to-br from-slate-600 to-slate-800" },
  { key: "bot3", emoji: "🤖", bg: "bg-gradient-to-br from-zinc-600 to-zinc-800" },
  { key: "bot4", emoji: "🤖", bg: "bg-gradient-to-br from-gray-600 to-gray-800" },
  { key: "bot5", emoji: "🤖", bg: "bg-gradient-to-br from-stone-600 to-stone-800" },
  { key: "bot6", emoji: "🤖", bg: "bg-gradient-to-br from-neutral-600 to-neutral-800" },
];

const ALL = new Map<string, AvatarDef>([...HUMAN_AVATARS, ...BOT_AVATARS].map((a) => [a.key, a]));

const FALLBACK: AvatarDef = { key: "default", emoji: "🙂", bg: "bg-gradient-to-br from-navy-500 to-navy-700" };

export function avatarFor(key: string | null | undefined): AvatarDef {
  if (!key) return FALLBACK;
  return ALL.get(key) ?? FALLBACK;
}
