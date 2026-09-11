import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/client.js";
import {
  createErrorReport,
  listErrorReports,
  setErrorReportResolved,
  summarizeErrorReports,
} from "../src/errorReport.js";

/**
 * 「運営に報告する」で送られたエラー報告が、原因特定に必要な情報を落とさずに
 * 保存・取得できることを担保する。ここが壊れると報告が届いても直せない。
 */
describe("error reports (integration, real Postgres)", () => {
  const createdIds: string[] = [];
  const scope = `test-scope-${Date.now()}`;

  afterAll(async () => {
    if (createdIds.length > 0) await prisma.errorReport.deleteMany({ where: { id: { in: createdIds } } });
    await prisma.$disconnect();
  });

  it("技術詳細とコンテキストを保存し、新しい順で取り出せる", async () => {
    const first = await createErrorReport({
      scope,
      message: "サーバーが12.0秒以内に応答しませんでした（サーバーが混雑しています）。",
      detail: "timeout /api/geo-tree/preflop-node elapsed=12003ms",
      context: { mode: "geo", street: "preflop", attempt: 6 },
      appVersion: "3.20.0",
      userAgent: "Mozilla/5.0 (iPhone)",
      url: "https://meta-geo-poker.vercel.app/geo",
    });
    createdIds.push(first.id);

    const second = await createErrorReport({ scope, message: "2件目", detail: null });
    createdIds.push(second.id);

    const rows = await listErrorReports({ scope, limit: 10 });
    expect(rows.length).toBe(2);
    // 新しい順。
    expect(rows[0]!.id).toBe(second.id);

    const saved = rows.find((r) => r.id === first.id)!;
    expect(saved.detail).toBe("timeout /api/geo-tree/preflop-node elapsed=12003ms");
    expect(saved.appVersion).toBe("3.20.0");
    expect(saved.url).toBe("https://meta-geo-poker.vercel.app/geo");
    expect(saved.context).toMatchObject({ mode: "geo", street: "preflop", attempt: 6 });
    expect(saved.resolvedAt).toBeNull();
  });

  it("scope と message は必須", async () => {
    await expect(createErrorReport({ scope: "", message: "x" })).rejects.toThrow();
    await expect(createErrorReport({ scope: "x", message: "   " })).rejects.toThrow();
  });

  it("巨大なcontextは丸ごと保存せず、省いた事実を残す", async () => {
    const huge = { blob: "x".repeat(30_000) };
    const created = await createErrorReport({ scope, message: "巨大context", context: huge });
    createdIds.push(created.id);
    const row = (await listErrorReports({ scope, limit: 10 })).find((r) => r.id === created.id)!;
    expect(row.context).toMatchObject({ omitted: "context too large" });
  });

  it("長すぎるメッセージ/詳細は切り詰めて保存する", async () => {
    const created = await createErrorReport({
      scope,
      message: "あ".repeat(5_000),
      detail: "い".repeat(9_000),
    });
    createdIds.push(created.id);
    const row = (await listErrorReports({ scope, limit: 10 })).find((r) => r.id === created.id)!;
    expect(row.message.length).toBe(2_000);
    expect(row.detail!.length).toBe(4_000);
  });

  it("未対応のみの絞り込みと、対応済みへの切り替えができる", async () => {
    const created = await createErrorReport({ scope, message: "対応テスト" });
    createdIds.push(created.id);

    await setErrorReportResolved(created.id, true);
    const unresolved = await listErrorReports({ scope, limit: 50, unresolvedOnly: true });
    expect(unresolved.some((r) => r.id === created.id)).toBe(false);

    await setErrorReportResolved(created.id, false);
    const again = await listErrorReports({ scope, limit: 50, unresolvedOnly: true });
    expect(again.some((r) => r.id === created.id)).toBe(true);
  });

  it("同じ内容の報告件数を集計できる(優先度づけ用)", async () => {
    const repeated = `repeat-${Date.now()}`;
    for (let i = 0; i < 3; i++) {
      const created = await createErrorReport({ scope, message: repeated });
      createdIds.push(created.id);
    }
    const summary = await summarizeErrorReports(200);
    const row = summary.find((r) => r.scope === scope && r.message === repeated);
    expect(row?.count).toBe(3);
  });
});
