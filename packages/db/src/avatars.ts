import { prisma } from "./client.js";

/**
 * 選べるアイコン(動物の絵10枚)。画面側の一覧は apps/web/src/lib/animalAvatars.ts(同じ id に揃える)。
 * avatarKey は `animal:<id>`。写真は data URI。アイコン無し(人型の共通アイコン)は廃止(オーナー指示)。
 */
export const ANIMAL_AVATAR_IDS = ["sheep", "shark", "pig", "penguin", "parrot", "mouse", "lion", "flamingo", "fish", "cat"] as const;

export function randomAnimalKey(): string {
  return `animal:${ANIMAL_AVATAR_IDS[Math.floor(Math.random() * ANIMAL_AVATAR_IDS.length)]}`;
}

/** 名前から決まる1枚(誰でも同じ規則)。 */
export function animalKeyFromSeed(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return `animal:${ANIMAL_AVATAR_IDS[Math.abs(h) % ANIMAL_AVATAR_IDS.length]}`;
}

/**
 * アイコン未設定のプレイヤーへ、10枚からランダムに1枚を割り当てて保存する(一度だけ。以後は固定)。
 * 起動時に呼ぶ。対象が無ければ何もしない(行は読み戻さない)。
 */
export async function assignMissingAvatars(): Promise<number> {
  const ids = ANIMAL_AVATAR_IDS.map((id) => `'animal:${id}'`).join(",");
  return prisma.$executeRawUnsafe(
    `UPDATE "User" SET "avatarKey" = (ARRAY[${ids}])[floor(random() * ${ANIMAL_AVATAR_IDS.length})::int + 1] WHERE "avatarKey" IS NULL`,
  );
}
