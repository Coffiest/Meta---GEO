import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/client.js";
import { getOrCreateUserByAuthId } from "../src/bankroll.js";
import {
  TRIAL_OFFER_WINDOW_MS,
  isTrialEligible,
  markTrialUsed,
  refreshTrialOffer,
  trialOfferMilestone,
} from "../src/plans.js";

/**
 * 7日間無料の特別オファー(オーナー確定 2026-10-12)。実DB(Postgres)が必要。
 *  - インマネ10回ごとに1回だけ出る(10, 20, 30…)。出てから1時間だけ有効
 *  - 使ったら消える。次の区切り(20回)でまた出る
 */

const RUN = Date.now();
const authIds: string[] = [];
const tournamentIds: string[] = [];

afterAll(async () => {
  const users = await prisma.user.findMany({ where: { authId: { in: authIds } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await prisma.tournamentEntry.deleteMany({ where: { userId: { in: ids } } });
  await prisma.tournament.deleteMany({ where: { id: { in: tournamentIds } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

async function addItm(userId: string, n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    const t = await prisma.tournament.create({
      data: { payouts: [1000], seatCount: 2, startingStack: 1000, status: "finished" },
      select: { id: true },
    });
    tournamentIds.push(t.id);
    await prisma.tournamentEntry.create({ data: { tournamentId: t.id, userId, seatIndex: 0, finishPosition: 1, payout: 1000 } });
  }
}

describe("trial offer", () => {
  it("区切りは10回ごと", () => {
    expect(trialOfferMilestone(9)).toBe(0);
    expect(trialOfferMilestone(10)).toBe(10);
    expect(trialOfferMilestone(27)).toBe(20);
  });

  it("インマネ10回で1時間だけ出て、使ったら消え、20回でまた出る", async () => {
    const authId = `trial-offer-${RUN}`;
    authIds.push(authId);
    const user = await getOrCreateUserByAuthId({ authId, email: null, displayName: "TO" });
    const t0 = new Date();

    await addItm(user.id, 9);
    expect(await refreshTrialOffer(user.id, t0)).toBeNull();
    expect(await isTrialEligible(user.id, t0)).toBe(false);

    await addItm(user.id, 1);
    const until = await refreshTrialOffer(user.id, t0);
    expect(until?.getTime()).toBe(t0.getTime() + TRIAL_OFFER_WINDOW_MS);
    expect(await isTrialEligible(user.id, t0)).toBe(true);
    // 何度見ても同じオファー(期限は延びない)
    expect((await refreshTrialOffer(user.id, new Date(t0.getTime() + 60_000)))?.getTime()).toBe(until?.getTime());

    // 1時間を過ぎたら消える(同じ区切りでは出ない)
    const later = new Date(t0.getTime() + TRIAL_OFFER_WINDOW_MS + 1);
    expect(await refreshTrialOffer(user.id, later)).toBeNull();
    expect(await isTrialEligible(user.id, later)).toBe(false);

    // 20回でまた出る。使ったら消える
    await addItm(user.id, 10);
    expect(await refreshTrialOffer(user.id, later)).not.toBeNull();
    await markTrialUsed(user.id, later);
    expect(await isTrialEligible(user.id, later)).toBe(false);
    expect(await refreshTrialOffer(user.id, later)).toBeNull();
  });
});
