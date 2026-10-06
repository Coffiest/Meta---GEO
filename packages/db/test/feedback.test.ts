import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/client.js";
import {
  countRecentFeedback,
  createFeedback,
  getFeedbackImage,
  listFeedback,
  setFeedbackRead,
} from "../src/feedback.js";

/** ご意見フォームの保存・一覧・写真の取り出し・既読(実Postgres)。 */
describe("feedback (integration, real Postgres)", () => {
  const userIds: string[] = [];

  afterAll(async () => {
    await prisma.feedback.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("本文と写真を保存し、一覧では写真の中身を読まずに並べる", async () => {
    const user = await prisma.user.create({ data: { displayName: "FeedbackUser", isBot: false } });
    userIds.push(user.id);
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    const { id } = await createFeedback({
      userId: user.id,
      kind: "bug",
      body: "  卓が固まりました  ",
      appVersion: "4.99.0",
      images: [{ mime: "image/png", data: png }],
    });

    const list = await listFeedback({ unreadOnly: true });
    const item = list.find((f) => f.id === id)!;
    expect(item.body).toBe("卓が固まりました");
    expect(item.kind).toBe("bug");
    expect(item.user.displayName).toBe("FeedbackUser");
    expect(item.images).toHaveLength(1);
    expect(item.images[0]!.bytes).toBe(png.length);

    const img = await getFeedbackImage(item.images[0]!.id);
    expect(img?.mime).toBe("image/png");
    expect(Buffer.compare(img!.data, png)).toBe(0);

    await setFeedbackRead(id, true);
    expect((await listFeedback({ unreadOnly: true })).some((f) => f.id === id)).toBe(false);
    expect(await countRecentFeedback(user.id, new Date(Date.now() - 60_000))).toBe(1);
  });

  it("本文も写真も無い投稿は受け付けない", async () => {
    const user = await prisma.user.create({ data: { displayName: "FeedbackEmpty", isBot: false } });
    userIds.push(user.id);
    await expect(createFeedback({ userId: user.id, kind: "other", body: "   " })).rejects.toThrow();
  });
});
