import { prisma } from "./client.js";
import type { Prisma } from "@prisma/client";

/**
 * ユーザーが「運営に報告する」を押したときのエラー報告の保存と取得。
 *
 * 目的は「画面に出た文言だけでは直せない」を無くすこと。ユーザー向けの一文に加えて、
 * 原因特定に必要な技術詳細(エラー種別・HTTPステータス・所要時間・通信状態など)を
 * そのまま残し、運営が後から読んで修正できるようにする。
 */

/** 1件あたりの保存上限。悪意/バグでログを丸ごと送られてもDBを圧迫しないよう切り詰める。 */
const MAX_MESSAGE_LEN = 2_000;
const MAX_DETAIL_LEN = 4_000;
const MAX_SCOPE_LEN = 64;
const MAX_UA_LEN = 500;
const MAX_URL_LEN = 500;
const MAX_VERSION_LEN = 32;
/** context(JSON)の文字数上限。超える場合は保存せず、超過した旨だけ残す。 */
const MAX_CONTEXT_CHARS = 20_000;

function clamp(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, max);
}

export interface CreateErrorReportInput {
  scope: string;
  message: string;
  detail?: string | null;
  context?: unknown;
  appVersion?: string | null;
  userAgent?: string | null;
  url?: string | null;
  userId?: string | null;
}

export interface ErrorReportRow {
  id: string;
  createdAt: Date;
  scope: string;
  message: string;
  detail: string | null;
  context: Prisma.JsonValue | null;
  appVersion: string | null;
  userAgent: string | null;
  url: string | null;
  userId: string | null;
  resolvedAt: Date | null;
}

/**
 * エラー報告を1件保存する。
 * scope と message は必須(どちらか欠けると後から読んでも何のことか分からないため)。
 */
export async function createErrorReport(input: CreateErrorReportInput): Promise<{ id: string }> {
  const scope = clamp(input.scope, MAX_SCOPE_LEN);
  const message = clamp(input.message, MAX_MESSAGE_LEN);
  if (!scope || !message) throw new Error("scope and message are required");

  // context は JSON として保存する。巨大すぎる場合は捨てて、捨てたこと自体を残す
  // (「なぜ context が無いのか」が後から分かるようにする)。
  let context: Prisma.InputJsonValue | undefined;
  if (input.context !== undefined && input.context !== null) {
    try {
      const serialized = JSON.stringify(input.context);
      context =
        serialized.length > MAX_CONTEXT_CHARS
          ? ({ omitted: "context too large", sizeChars: serialized.length } as Prisma.InputJsonValue)
          : (JSON.parse(serialized) as Prisma.InputJsonValue);
    } catch {
      context = { omitted: "context not serializable" } as Prisma.InputJsonValue;
    }
  }

  const created = await prisma.errorReport.create({
    data: {
      scope,
      message,
      detail: clamp(input.detail, MAX_DETAIL_LEN),
      ...(context !== undefined ? { context } : {}),
      appVersion: clamp(input.appVersion, MAX_VERSION_LEN),
      userAgent: clamp(input.userAgent, MAX_UA_LEN),
      url: clamp(input.url, MAX_URL_LEN),
      userId: input.userId ?? null,
    },
    select: { id: true },
  });
  return created;
}

/** 運営画面用の一覧。新しい順。未対応のみに絞り込める。 */
export async function listErrorReports(params?: {
  limit?: number;
  scope?: string;
  /** true=未対応のみ / false=対応済みのみ / 未指定=すべて */
  unresolvedOnly?: boolean;
}): Promise<ErrorReportRow[]> {
  const limit = Math.min(Math.max(1, params?.limit ?? 100), 500);
  return prisma.errorReport.findMany({
    where: {
      ...(params?.scope ? { scope: params.scope } : {}),
      ...(params?.unresolvedOnly ? { resolvedAt: null } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

/** 同じ内容がどれだけ報告されているかの集計(scope×message)。優先度づけに使う。 */
export async function summarizeErrorReports(limit = 50): Promise<
  { scope: string; message: string; count: number; lastAt: Date }[]
> {
  const rows = await prisma.errorReport.groupBy({
    by: ["scope", "message"],
    _count: { _all: true },
    _max: { createdAt: true },
    orderBy: { _count: { id: "desc" } },
    take: Math.min(Math.max(1, limit), 200),
  });
  return rows.map((r) => ({
    scope: r.scope,
    message: r.message,
    count: r._count._all,
    lastAt: r._max.createdAt ?? new Date(0),
  }));
}

/** 運営が対応済み/未対応を切り替える。 */
export async function setErrorReportResolved(id: string, resolved: boolean): Promise<void> {
  await prisma.errorReport.update({
    where: { id },
    data: { resolvedAt: resolved ? new Date() : null },
  });
}
