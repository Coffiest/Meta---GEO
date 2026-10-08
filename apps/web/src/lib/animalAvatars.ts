/**
 * 選べるアイコン(動物の絵10枚。オーナー支給。scripts/animal-avatars.py で書き出し)。
 * avatarKey は `animal:<id>`。写真は従来どおり data URI。
 * 地の色は絵の主な色をごく暗くしたもの(暗い画面で浮きすぎない明るさ)。
 * サーバー側の一覧は packages/db/src/avatars.ts(同じ id・同じ順番に揃える)。
 */
export const ANIMAL_AVATARS = [
  { id: "sheep", bg: "#3a3128" },
  { id: "shark", bg: "#26323a" },
  { id: "pig", bg: "#3d2a30" },
  { id: "penguin", bg: "#2a3238" },
  { id: "parrot", bg: "#1f3528" },
  { id: "mouse", bg: "#34302f" },
  { id: "lion", bg: "#40241a" },
  { id: "flamingo", bg: "#3d2630" },
  { id: "fish", bg: "#3d2329" },
  { id: "cat", bg: "#25333a" },
] as const;

export type AnimalId = (typeof ANIMAL_AVATARS)[number]["id"];

export function animalKey(id: AnimalId): string {
  return `animal:${id}`;
}

export function animalSrc(id: AnimalId): string {
  return `/avatars/animal_${id}_v1.png`;
}

/** avatarKey が動物の絵ならその定義を返す。 */
export function animalOf(avatarKey: string | null | undefined): (typeof ANIMAL_AVATARS)[number] | null {
  if (typeof avatarKey !== "string" || !avatarKey.startsWith("animal:")) return null;
  const id = avatarKey.slice("animal:".length);
  return ANIMAL_AVATARS.find((a) => a.id === id) ?? null;
}

/** アイコンが無い場合の保険: 名前から決まる1枚(誰でも同じ規則)。 */
export function animalFromSeed(seed: string): (typeof ANIMAL_AVATARS)[number] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return ANIMAL_AVATARS[Math.abs(h) % ANIMAL_AVATARS.length]!;
}
