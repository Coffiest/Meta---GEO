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

  it("counts bot actions as first-class GEO samples on a bot-mixed table", async () => {
    // GEOは「全プレイヤー(Bot含む)の全アクション」を集計対象にする。BBだけ人間・他5席がbotの
    // 卓でも、root node(line=[])は正しくUTGを指し、かつUTG(bot)のオープンレイズが実測サンプル
    // として計上される。ライン追跡のシーケンス整合(ポジション順)の回帰確認も兼ねる。
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

    // root node(line=[])は、たまたま最初に人間が座っていたBBではなく、正しくUTGを指す。
    // UTG(bot)のオープンレイズも全プレイヤー集計の対象なので、サンプルとして計上される。
    const { node: rootNode } = await getPreflopNode({ stackBucket: "10-15", bubbleStage: "normal", line: [] });
    expect(rootNode.position).toBe("UTG");
    expect(rootNode.sampleSize).toBeGreaterThanOrEqual(1);
    const utgRaise = rootNode.options.find((o) => o.bucket === "raise2-2.5");
    expect(utgRaise).toBeDefined();
    expect(utgRaise!.count).toBeGreaterThanOrEqual(1);

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

  it("does not let a later, atypical (short-handed) hand override the root position from an earlier, normal hand", async () => {
    // 回帰テスト: 以前はline=[]に一致する全ハンドをループし、一致するたびにexpectedPositionを
    // 無条件に上書きしていた(「最後に処理されたハンドの値」が最終結果になる)。MTTで人数が減った
    // 短縮卓(6席全部埋まっていない)では、最初のアクションのseatIndexがオフセット計算上「BB」等
    // 別のポジションに化けることがあり、そのハンドがたまたま後から処理されると、本来UTGであるべき
    // root nodeの答えが誤ったポジション名にすり替わってしまっていた。
    // 修正後は「最初に一致したハンド」の値のみを採用するため、この上書きが起きない。
    //
    // 両ハンドともroot決定(decisions[0])を打つ席をwasAway(離席扱い=集計対象外)にして、
    // 実測サンプル(filtered)を空に保つことで、expectedPositionのフォールバック経路自体を
    // 確実に検証する(サンプルがあるとbuildNodeFromDecisionsはfiltered[0]の値を優先するため、
    // この経路を通らなくなってしまう)。

    // ハンド1(先に作成): 正常な6-max。UTG(bot)が2.2bbオープンし、BB(人間)以外は全員フォールド
    // -> root=UTGが正解。
    const humanUser1 = await prisma.user.create({ data: { displayName: "GeoTreeTest-Overwrite-Human1", isBot: false } });
    const botUsers1 = await Promise.all(
      Array.from({ length: 5 }, (_, i) => prisma.user.create({ data: { displayName: `GeoTreeTest-Overwrite-Bot1-${i}`, isBot: true } })),
    );
    createdUserIds.push(humanUser1.id, ...botUsers1.map((u) => u.id));
    // seat2=BB(人間)、他はbot。buttonFixedPos=0 -> seat0=BTN,1=SB,2=BB,3=UTG,4=HJ,5=CO
    const normalSeatUsers = [botUsers1[0]!, botUsers1[1]!, humanUser1, botUsers1[2]!, botUsers1[3]!, botUsers1[4]!];

    const normalTournament = await prisma.tournament.create({
      data: { seatCount: 6, startingStack: 4_000, status: "running", gameType: "sng" },
    });
    createdTournamentIds.push(normalTournament.id);
    await prisma.tournamentEntry.createMany({
      data: normalSeatUsers.map((u, i) => ({ tournamentId: normalTournament.id, userId: u.id, seatIndex: i })),
    });

    const normalHand = new HandEngine({
      seats: normalSeatUsers.map((u, i) => ({ seatIndex: i, playerId: u.id, stack: 4_000 })),
      seatCount: 6,
      buttonFixedPos: 0,
      smallBlindSeat: 1,
      bigBlindSeat: 2,
      smallBlind: 100,
      bigBlind: 200,
      bbAnte: 0,
    });
    normalHand.applyAction(3, { kind: "raise", toAmount: 440 }); // UTG(bot)オープン
    normalHand.applyAction(4, { kind: "fold" });
    normalHand.applyAction(5, { kind: "fold" });
    normalHand.applyAction(0, { kind: "fold" });
    normalHand.applyAction(1, { kind: "fold" });
    normalHand.applyAction(2, { kind: "fold" }); // BB(人間)フォールド
    expect(normalHand.isHandComplete()).toBe(true);

    await recordHand({
      tournamentId: normalTournament.id,
      handNumber: 1,
      buttonFixedPos: 0,
      levelSmallBlind: 100,
      levelBigBlind: 200,
      levelAnte: 0,
      seats: normalSeatUsers.map((u, i) => ({
        seatIndex: i,
        userId: u.id,
        startingStack: 4_000,
        isSmallBlind: i === 1,
        isBigBlind: i === 2,
        wasAway: i === 3, // root決定を打つUTG席を離席扱いにして集計対象外に保つ
      })),
      hand: normalHand,
    });

    // ハンド2(後に作成): 短縮卓(seat2とseat5の2人しか座っていない、MTTでの人数減少を想定)。
    // buttonFixedPos=0のオフセット式ではseat2 = BB。最初のアクション(seat2, bot)がroot決定
    // となるため、このハンド単体を見るとdecisions[0].position = "BB"になる
    // (=root=UTGとは異なる異常値)。seat5だけ人間にして、このハンド自体は集計対象から
    // 除外されないようにする(seat5の意思決定はdecisions[1]なのでroot判定には影響しない)。
    const botUser2 = await prisma.user.create({ data: { displayName: "GeoTreeTest-Overwrite-Bot2", isBot: true } });
    const humanUser2 = await prisma.user.create({ data: { displayName: "GeoTreeTest-Overwrite-Human2", isBot: false } });
    createdUserIds.push(botUser2.id, humanUser2.id);

    const shortTournament = await prisma.tournament.create({
      data: { seatCount: 6, startingStack: 4_000, status: "running", gameType: "mtt" },
    });
    createdTournamentIds.push(shortTournament.id);
    await prisma.tournamentEntry.createMany({
      data: [
        { tournamentId: shortTournament.id, userId: botUser2.id, seatIndex: 2 },
        { tournamentId: shortTournament.id, userId: humanUser2.id, seatIndex: 5 },
      ],
    });

    const shortHand = new HandEngine({
      seats: [
        { seatIndex: 2, playerId: botUser2.id, stack: 4_000 },
        { seatIndex: 5, playerId: humanUser2.id, stack: 4_000 },
      ],
      seatCount: 6,
      buttonFixedPos: 0,
      smallBlindSeat: 2,
      bigBlindSeat: 5,
      smallBlind: 100,
      bigBlind: 200,
      bbAnte: 0,
    });
    shortHand.applyAction(2, { kind: "raise", toAmount: 440 }); // seat2(bot, offset上"BB") オープン
    shortHand.applyAction(5, { kind: "fold" }); // seat5(人間)フォールド
    expect(shortHand.isHandComplete()).toBe(true);

    await recordHand({
      tournamentId: shortTournament.id,
      handNumber: 1,
      buttonFixedPos: 0,
      levelSmallBlind: 100,
      levelBigBlind: 200,
      levelAnte: 0,
      seats: [
        // root決定を打つseat2を離席扱いにして集計対象外に保つ
        { seatIndex: 2, userId: botUser2.id, startingStack: 4_000, isSmallBlind: true, isBigBlind: false, wasAway: true },
        { seatIndex: 5, userId: humanUser2.id, startingStack: 4_000, isSmallBlind: false, isBigBlind: true },
      ],
      hand: shortHand,
    });

    // 4,000チップ/200bb = 20bb -> "15-20"バケット。他テストのバケットと衝突しないよう分離。
    // root決定を打った席は両ハンドともwasAway(集計対象外)なので、実測サンプルは0件(filteredは空)
    // -> 返る position は expectedPosition のフォールバック値そのものになる。
    const { node: rootNode } = await getPreflopNode({ stackBucket: "15-20", bubbleStage: "normal", line: [] });
    expect(rootNode.sampleSize).toBe(0);
    expect(rootNode.position).toBe("UTG");
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
