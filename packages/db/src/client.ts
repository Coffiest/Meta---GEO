import { fileURLToPath } from "node:url";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

// ローカル開発では packages/db/.env を読み込む(本番は環境変数を直接注入する想定なのでファイルが無くても無視する)
if (!process.env["DATABASE_URL"]) {
  try {
    const envPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".env");
    process.loadEnvFile(envPath);
  } catch {
    // .env が無い場合は環境側で DATABASE_URL が設定されている前提
  }
}

/** サーバープロセス内で使い回す単一のPrismaClientインスタンス */
export const prisma = new PrismaClient();

export { PrismaClient } from "@prisma/client";
export type * from "@prisma/client";
