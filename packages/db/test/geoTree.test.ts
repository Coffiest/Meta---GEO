import { afterAll, describe, expect, it } from "vitest";
import { HandEngine } from "@meta-geo/engine";
import { prisma } from "../src/client.js";
import { recordHand } from "../src/recordHand.js";
import { getPreflopNode, getPostflopNode } from "../src/geoTree.js";

describe("geoTree (integration, real Postgres)", () => {
  const createdUserIds: string[] = [];
  const createdTournamentIds: string[] = [];

  afterAll(async () => {
    for (const tournamentId of createdTournamentIds) {
      await prisma.handAction.deleteMany({ where: { hand: { tournamentId } } });
      await prisma.handSeat.deleteMany({ where: { hand: { tournamentId } } });
      await prisma.handPot.deleteMany({ where: { hand: { tournamentId } } });
      await prisma.hand.deleteMany({ where: { tournamentId } });
      await prisma.tournamentEntry.deleteMany({ where: { tournamentId } });
      await prisma.tournament.delete({ where: { id: tournamentId } });
    }
    for (const userId of createdUserIds) {
      await prisma.user.delete({ where: { id: userId } });
    }
    await prisma.$disconnect();
  });

  it("aggregates a human UTG open-raise into the preflop tree's first node", async () => {
    const users = await Promise.all(
      Array.from({ length: 6 }, (_, i) => prisma.user.create({ data: { displayName: `GeoTreeTest-${i}`, isBot: false } })),
    );
    createdUserIds.push(...users.map((u) => u.id));

    const tournament = await prisma.tournament.create({
      data: { seatCount: 6, startingStack: 20_000, status: "running", gameType: "sng" },
    });
    createdTournamentIds.push(tournament.id);
    await prisma.tournamentEntry.createMany({
      data: users.map((u, i) => ({ tournamentId: tournament.id, userId: u.id, seatIndex: i })),
    });

    // buttonFixedPos=0 -> offsets: seat0=BTN, seat1=SB, seat2=BB, seat3=UTG, seat4=HJ, seat5=CO
    const hand = new HandEngine({
      seats: users.map((u, i) => ({ seatIndex: i, playerId: u.id, stack: 20_000 })),
      seatCount: 6,
      buttonFixedPos: 0,
      smallBlindSeat: 1,
      bigBlindSeat: 2,
      smallBlind: 100,
      bigBlind: 200,
      bbAnte: 0,
    });

    // UTG(seat3, 100bb深いスタック)が2.2bb(=440)にオープンレイズ -> 全員フォールド。
    hand.applyAction(3, { kind: "raise", toAmount: 440 });
    hand.applyAction(4, { kind: "fold" });
    hand.applyAction(5, { kind: "fold" });
    hand.applyAction(0, { kind: "fold" });
    hand.applyAction(1, { kind: "fold" });
    hand.applyAction(2, { kind: "fold" });
    expect(hand.isHandComplete()).toBe(true);

    await recordHand({
      tournamentId: tournament.id,
      handNumber: 1,
      buttonFixedPos: 0,
      levelSmallBlind: 100,
      levelBigBlind: 200,
      levelAnte: 0,
      seats: users.map((u, i) => ({
        seatIndex: i,
        userId: u.id,
        startingStack: 20_000,
        isSmallBlind: i === 1,
        isBigBlind: i === 2,
      })),
      hand,
    });

    // 20,000スタック / 200bb = 100bb深いので "30+" バケットに入るはず。
    const { node } = await getPreflopNode({ stackBucket: "30+", bubbleStage: "normal", line: [] });
    expect(node.position).toBe("UTG");
    expect(node.sampleSize).toBeGreaterThanOrEqual(1);
    const raiseOption = node.options.find((o) => o.bucket === "raise2-2.5");
    expect(raiseOption).toBeDefined();
    expect(raiseOption!.count).toBeGreaterThanOrEqual(1);

    // 次のノード(HJ)はUTGのraise2-2.5に対してfoldしたはず。
    const { node: hjNode } = await getPreflopNode({
      stackBucket: "30+",
      bubbleStage: "normal",
      line: [{ position: "UTG", bucket: "raise2-2.5" }],
    });
    expect(hjNode.position).toBe("HJ");
    const foldOption = hjNode.options.find((o) => o.bucket === "fold");
    expect(foldOption).toBeDefined();
    expect(foldOption!.count).toBeGreaterThanOrEqual(1);

    // 誰も一致しないラインを要求すると空のノードが返る。
    const { node: emptyNode } = await getPreflopNode({
      stackBucket: "0-5",
      bubbleStage: "normal",
      line: [],
    });
    expect(emptyNode.sampleSize).toBe(0);
  });

  it("keeps the root node correctly labeled UTG even when only the BB seat is human (bot-mixed table)", async () => {
    // 回帰テスト: 以前はbot席のアクションをシーケンスから完全に除外していたため、
    // 「人間が最初に登場するポジション」がline=[]の答えとしてすり替わってしまうバグがあった
    // (例: BBだけ人間・他5席がbotの卓では、本来UTGであるべきroot nodeがBBとして返っていた)。
    const humanUser = await prisma.user.create({ data: { displayName: "GeoTreeTest-BBOnly", isBot: false } });
    const botUsers = await Promise.all(
      Array.from({ length: 5 }, (_, i) => prisma.user.create({ data: { displayName: `GeoTreeTest-Bot-${i}`, isBot: true } })),
    );
    createdUserIds.push(humanUser.id, ...botUsers.map((u) => u.id));

    // seat2=BB(人間)、それ以外はbot。buttonFixedPos=0 -> seat0=BTN,1=SB,2=BB,3=UTG,4=HJ,5=CO
    const seatUsers = [botUsers[0]!, botUsers[1]!, humanUser, botUsers[2]!, botUsers[3]!, botUsers[4]!];

    // 他のテストは全て100bb("30+"バケット)のデータを作るため、このテストは12bb("10-15"バケット)を
    // 使ってバケットを分離し、他テストのデータと集計が混ざらないようにする。
    const tournament = await prisma.tournament.create({
      data: { seatCount: 6, startingStack: 2_400, status: "running", gameType: "sng" },
    });
    createdTournamentIds.push(tournament.id);
    await prisma.tournamentEntry.createMany({
      data: seatUsers.map((u, i) => ({ tournamentId: tournament.id, userId: u.id, seatIndex: i })),
    });

    const hand = new HandEngine({
      seats: seatUsers.map((u, i) => ({ seatIndex: i, playerId: u.id, stack: 2_400 })),
      seatCount: 6,
      buttonFixedPos: 0,
      smallBlindSeat: 1,
      bigBlindSeat: 2,
      smallBlind: 100,
      bigBlind: 200,
      bbAnte: 0,
    });

    // UTG(bot)が2.2bbオープン、HJ/CO/BTN/SB(全bot)フォールド、BB(人間)がコール。
    // その後フロップ/ターン/リバーはチェック通しでショウダウンまで進める。
    hand.applyAction(3, { kind: "raise", toAmount: 440 });
    hand.applyAction(4, { kind: "fold" });
    hand.applyAction(5, { kind: "fold" });
    hand.applyAction(0, { kind: "fold" });
    hand.applyAction(1, { kind: "fold" });
    hand.applyAction(2, { kind: "call", toAmount: 440 });
    hand.applyAction(2, { kind: "check" });
    hand.applyAction(3, { kind: "check" });
    hand.applyAction(2, { kind: "check" });
    hand.applyAction(3, { kind: "check" });
    hand.applyAction(2, { kind: "check" });
    hand.applyAction(3, { kind: "check" });
    expect(hand.isHandComplete()).toBe(true);

    await recordHand({
      tournamentId: tournament.id,
      handNumber: 1,
      buttonFixedPos: 0,
      levelSmallBlind: 100,
      levelBigBlind: 200,
      levelAnte: 0,
      seats: seatUsers.map((u, i) => ({
        seatIndex: i,
        userId: u.id,
        startingStack: 2_400,
        isSmallBlind: i === 1,
        isBigBlind: i === 2,
      })),
      hand,
    });

    // root node(line=[])は、たまたま最初に人間が座っていたBBではなく、正しくUTGを指すべき。
    // UTGはbotなのでサンプルは0件(「サンプルなし」)だが、ポジション名は正しくUTG。
    const { node: rootNode } = await getPreflopNode({ stackBucket: "10-15", bubbleStage: "normal", line: [] });
    expect(rootNode.position).toBe("UTG");
    expect(rootNode.sampleSize).toBe(0);

    // bot達の実際のアクションでラインを辿ってBBまで到達すると、人間(BB)の実測コールが見える。
    const { node: bbNode } = await getPreflopNode({
      stackBucket: "10-15",
      bubbleStage: "normal",
      line: [
        { position: "UTG", bucket: "raise2-2.5" },
        { position: "HJ", bucket: "fold" },
        { position: "CO", bucket: "fold" },
        { position: "BTN", bucket: "fold" },
        { position: "SB", bucket: "fold" },
      ],
    });
    expect(bbNode.position).toBe("BB");
    expect(bbNode.sampleSize).toBeGreaterThanOrEqual(1);
    const callOption = bbNode.options.find((o) => o.bucket === "call");
    expect(callOption).toBeDefined();
    expect(callOption!.count).toBeGreaterThanOrEqual(1);
  });

  it("returns an empty postflop node when the exact board never occurred", async () => {
    const { node } = await getPostflopNode({
      stackBucket: "30+",
      bubbleStage: "normal",
      preflopLine: [],
      board: ["2c", "2d", "2h"],
      street: "flop",
      postflopLine: [],
    });
    expect(node.sampleSize).toBe(0);
  });
});
