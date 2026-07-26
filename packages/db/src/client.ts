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

/**
 * Prismaのコネクションプール上限を明示する。既定値は「CPUコア数×2+1」で、Fly.ioの共有CPU上では
 * 卓数が増えたときにSupabaseのpooler側の上限を先に食い潰し、ハンド保存が
 * 「Timed out fetching a new connection from the connection pool」で落ちる。
 * URLに既に指定がある場合は環境側の設定を優先し、無い場合だけ補う。
 */
const DEFAULT_CONNECTION_LIMIT = "10";
const DEFAULT_POOL_TIMEOUT = "20";

function withPoolSettings(raw: string | undefined): string | undefined {
  if (!raw) return raw;
  try {
    const url = new URL(raw);
    if (!url.searchParams.has("connection_limit")) url.searchParams.set("connection_limit", DEFAULT_CONNECTION_LIMIT);
    if (!url.searchParams.has("pool_timeout")) url.searchParams.set("pool_timeout", DEFAULT_POOL_TIMEOUT);
    return url.toString();
  } catch {
    // URLとして解釈できない形式(想定外)なら、触らずそのまま使う。
    return raw;
  }
}

const datasourceUrl = withPoolSettings(process.env["DATABASE_URL"]);

/** サーバープロセス内で使い回す単一のPrismaClientインスタンス */
export const prisma = datasourceUrl ? new PrismaClient({ datasourceUrl }) : new PrismaClient();

export { PrismaClient } from "@prisma/client";
export type * from "@prisma/client";
