import { prisma } from "./client.js";

/**
 * ホームの「ご意見フォーム」(要望・不具合・その他)。送り主はログイン中のユーザー。
 * 写真は FeedbackImage に分けて保存し、一覧では中身を読まない(管理者画面が1枚ずつ取りに行く)。
 */

export const FEEDBACK_KINDS = ["request", "bug", "other"] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

export const FEEDBACK_MAX_BODY = 4000;
export const FEEDBACK_MAX_IMAGES = 3;
/** 1枚あたりの上限(端末側で縮小・JPEG 化して 1MB 以下にしてから送る。少し余裕を持たせる)。 */
export const FEEDBACK_MAX_IMAGE_BYTES = 1_300_000;
export const FEEDBACK_IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp"] as const;

export interface FeedbackImageInput {
  mime: string;
  data: Buffer;
}

export function isFeedbackKind(v: unknown): v is FeedbackKind {
  return typeof v === "string" && (FEEDBACK_KINDS as readonly string[]).includes(v);
}

export async function createFeedback(input: {
  userId: string;
  kind: FeedbackKind;
  body: string;
  appVersion?: string | null;
  userAgent?: string | null;
  images?: FeedbackImageInput[];
}): Promise<{ id: string }> {
  const body = input.body.trim().slice(0, FEEDBACK_MAX_BODY);
  const images = (input.images ?? []).slice(0, FEEDBACK_MAX_IMAGES);
  if (!body && images.length === 0) throw new Error("empty feedback");
  const created = await prisma.feedback.create({
    data: {
      userId: input.userId,
      kind: input.kind,
      body,
      appVersion: input.appVersion?.slice(0, 32) ?? null,
      userAgent: input.userAgent?.slice(0, 400) ?? null,
      images: {
        create: images.map((img, i) => ({
          mime: img.mime,
          data: img.data,
          bytes: img.data.length,
          position: i,
        })),
      },
    },
    select: { id: true },
  });
  return created;
}

export interface FeedbackListItem {
  id: string;
  createdAt: Date;
  kind: string;
  body: string;
  appVersion: string | null;
  userAgent: string | null;
  readAt: Date | null;
  user: { id: string; displayName: string; email: string | null };
  images: { id: string; mime: string; bytes: number }[];
}

export async function listFeedback(params: { limit?: number; unreadOnly?: boolean } = {}): Promise<FeedbackListItem[]> {
  const rows = await prisma.feedback.findMany({
    where: params.unreadOnly ? { readAt: null } : {},
    orderBy: { createdAt: "desc" },
    take: Math.max(1, Math.min(200, params.limit ?? 100)),
    select: {
      id: true,
      createdAt: true,
      kind: true,
      body: true,
      appVersion: true,
      userAgent: true,
      readAt: true,
      user: { select: { id: true, displayName: true, email: true } },
      images: { select: { id: true, mime: true, bytes: true }, orderBy: { position: "asc" } },
    },
  });
  return rows;
}

export async function countUnreadFeedback(): Promise<number> {
  return prisma.feedback.count({ where: { readAt: null } });
}

export async function getFeedbackImage(id: string): Promise<{ mime: string; data: Buffer } | null> {
  const row = await prisma.feedbackImage.findUnique({ where: { id }, select: { mime: true, data: true } });
  return row ? { mime: row.mime, data: Buffer.from(row.data) } : null;
}

export async function setFeedbackRead(id: string, read: boolean): Promise<void> {
  await prisma.feedback.update({ where: { id }, data: { readAt: read ? new Date() : null } });
}

/** この時刻以降にこのユーザーが送った件数(連投の制限に使う)。 */
export async function countRecentFeedback(userId: string, since: Date): Promise<number> {
  return prisma.feedback.count({ where: { userId, createdAt: { gte: since } } });
}
