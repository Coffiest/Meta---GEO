import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Server, Socket } from "socket.io";

// 卓そのもの(DB に書く TableSession)は偽物に差し替え、ルームの出入りだけを確かめる。
const sessions: { config: { humans: { userId: string }[]; private: { autoSeats: number; startingStack: number; levelDurationMs: number; onFinished: (s: unknown[]) => void } }; left: string[] }[] = [];
vi.mock("../src/gameServer.js", () => ({
  SNG_SEAT_COUNT: 6,
  TableSession: class {
    left: string[] = [];
    constructor(public config: never) {
      sessions.push(this as never);
    }
    attachHuman() {}
    isUserDone() {
      return false;
    }
    isFinished() {
      return false;
    }
    leave(userId: string) {
      this.left.push(userId);
    }
    async start() {}
  },
}));

const { PrivateRoomManager, normalizePrivateSettings, generateRoomCode, BLIND_PRESETS } = await import("../src/privateRoom.js");

type Handler = (payload: unknown, ack?: (res: unknown) => void) => void;

function fakeSocket(userId: string) {
  const handlers = new Map<string, Handler>();
  const emitted: { event: string; payload: unknown }[] = [];
  const socket = {
    data: {} as Record<string, unknown>,
    emit: (event: string, payload: unknown) => emitted.push({ event, payload }),
    on: (event: string, h: Handler) => handlers.set(event, h),
  };
  const call = async (event: string, payload: unknown = {}) => {
    let res: unknown;
    handlers.get(event)!(payload, (r) => (res = r));
    // ハンドラは非同期(ユーザーの確認を待つ)なので、片付くまで回す。
    for (let i = 0; i < 10 && res === undefined; i++) await Promise.resolve();
    return res as { ok: boolean; code?: string; error?: string };
  };
  const lastRoom = () =>
    emitted.filter((e) => e.event === "privateRoom").at(-1)?.payload as
      | { code: string; isHost: boolean; hostUserId: string; phase: string; members: { userId: string }[]; settings: { maxPlayers: number } }
      | undefined;
  return { socket: socket as unknown as Socket, userId, call, emitted, lastRoom };
}

function setup() {
  const busy = new Set<string>();
  const started: string[][] = [];
  const manager = new PrivateRoomManager(
    {} as Server,
    async (socket) => {
      const id = (socket as unknown as { __user: string }).__user;
      return { userId: id, displayName: id.toUpperCase(), avatarKey: null };
    },
    { onSessionStarted: (_s, ids) => started.push(ids), isBusyElsewhere: (id) => busy.has(id) },
  );
  const connect = (userId: string) => {
    const s = fakeSocket(userId);
    (s.socket as unknown as { __user: string }).__user = userId;
    manager.handleConnection(s.socket);
    return s;
  };
  return { manager, connect, busy, started };
}

describe("ルームの設定", () => {
  it("範囲の外の値は丸め、届かなかった項目は元のまま", () => {
    const s = normalizePrivateSettings({ maxPlayers: 9, blind: "fast", lateEntryUntilLevel: 0, reentryLimit: 8, autoSeats: 7 });
    expect(s.maxPlayers).toBe(6);
    expect(s.blind).toBe("normal");
    expect(s.lateEntryUntilLevel).toBe(1);
    expect(s.reentryLimit).toBe(5);
    // 自動で埋める席は「最大人数 − 1」まで(最低1人は人間)。
    expect(s.autoSeats).toBe(5);
    expect(normalizePrivateSettings({ reentryLimit: null }).reentryLimit).toBeNull();
    expect(normalizePrivateSettings({ maxPlayers: 2, autoSeats: 3 }).autoSeats).toBe(1);
  });

  it("ブラインドの3択(ターボ3分 / ノーマル5分 / ディープロング10分・200BB)", () => {
    expect(BLIND_PRESETS.turbo).toEqual({ levelDurationMs: 180_000, startingStack: 20_000 });
    expect(BLIND_PRESETS.normal).toEqual({ levelDurationMs: 300_000, startingStack: 20_000 });
    expect(BLIND_PRESETS.deep).toEqual({ levelDurationMs: 600_000, startingStack: 40_000 });
  });

  it("コードは数字6桁で、開いているルームと重ならない", () => {
    const seq = [123, 123, 45];
    const code = generateRoomCode((c) => c === "000123", () => seq.shift()!);
    expect(code).toBe("000045");
  });
});

describe("ルームの出入り", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sessions.length = 0;
  });
  afterEach(() => vi.useRealTimers());

  it("作るとコードが返り、そのコードで入れる。2人そろうとホストがスタートできる", async () => {
    const { connect, started } = setup();
    const host = connect("h");
    const created = await host.call("privateCreate", { settings: { maxPlayers: 4, blind: "turbo" } });
    expect(created.ok).toBe(true);
    expect(created.code).toMatch(/^\d{6}$/);
    expect(host.lastRoom()).toMatchObject({ isHost: true, phase: "lobby" });

    // 1人ではスタートできない。
    expect(await host.call("privateStart")).toMatchObject({ ok: false, error: "NOT_ENOUGH" });

    const guest = connect("g");
    expect(await guest.call("privateJoin", { code: created.code })).toMatchObject({ ok: true });
    expect(guest.lastRoom()).toMatchObject({ isHost: false });
    expect(host.lastRoom()!.members.map((m) => m.userId)).toEqual(["h", "g"]);

    // ホスト以外はスタートできない。
    expect(await guest.call("privateStart")).toMatchObject({ ok: false, error: "NOT_HOST" });
    expect(await host.call("privateStart")).toMatchObject({ ok: true });
    expect(started).toEqual([["h", "g"]]);
    expect(sessions[0]!.config.private.levelDurationMs).toBe(180_000);
    expect(host.lastRoom()!.phase).toBe("playing");
  });

  it("違うコード・満員・始まった後は入れない", async () => {
    const { connect } = setup();
    const host = connect("h");
    const { code } = await host.call("privateCreate", { settings: { maxPlayers: 2 } });
    expect(await connect("x").call("privateJoin", { code: "999999" === code ? "999998" : "999999" })).toMatchObject({ error: "NOT_FOUND" });
    await connect("g").call("privateJoin", { code });
    expect(await connect("z").call("privateJoin", { code })).toMatchObject({ error: "FULL" });
    await host.call("privateStart");
    expect(await connect("y").call("privateJoin", { code })).toMatchObject({ error: "STARTED" });
  });

  it("間違ったコードを続けて入れると、しばらく入力できなくなる", async () => {
    const { connect } = setup();
    const s = connect("x");
    for (let i = 0; i < 10; i++) expect(await s.call("privateJoin", { code: "000000" })).toMatchObject({ error: "NOT_FOUND" });
    expect(await s.call("privateJoin", { code: "000000" })).toMatchObject({ error: "TOO_MANY_TRIES" });
    vi.advanceTimersByTime(61_000);
    expect(await s.call("privateJoin", { code: "000000" })).toMatchObject({ error: "NOT_FOUND" });
  });

  it("ホストが抜けると、次に入った人がホストになる。全員抜けるとルームは消える", async () => {
    const { connect, manager } = setup();
    const host = connect("h");
    const { code } = await host.call("privateCreate");
    const a = connect("a");
    const b = connect("b");
    await a.call("privateJoin", { code });
    await b.call("privateJoin", { code });
    await host.call("privateLeave");
    expect(a.lastRoom()).toMatchObject({ hostUserId: "a", isHost: true });
    await a.call("privateLeave");
    await b.call("privateLeave");
    expect(manager.roomCount()).toBe(0);
  });

  it("ホストは参加者を外せる・設定を変えられる・解散できる", async () => {
    const { connect } = setup();
    const host = connect("h");
    const { code } = await host.call("privateCreate");
    const g = connect("g");
    await g.call("privateJoin", { code });
    expect(await g.call("privateKick", { userId: "h" })).toMatchObject({ error: "NOT_HOST" });
    expect(await host.call("privateKick", { userId: "g" })).toMatchObject({ ok: true });
    expect(g.emitted.at(-1)).toMatchObject({ event: "privateRoomClosed", payload: { reason: "KICKED" } });

    expect(await host.call("privateSettings", { settings: { maxPlayers: 3 } })).toMatchObject({ ok: true });
    expect(host.lastRoom()!.settings.maxPlayers).toBe(3);
    expect(await host.call("privateDisband")).toMatchObject({ ok: true });
    expect(host.emitted.at(-1)).toMatchObject({ event: "privateRoomClosed", payload: { reason: "DISBANDED" } });
  });

  it("待合で通信が切れても60秒は席とホストを保ち、戻らなければ外す", async () => {
    const { connect } = setup();
    const host = connect("h");
    const { code } = await host.call("privateCreate");
    const g = connect("g");
    await g.call("privateJoin", { code });
    // ホストの切断。
    (host.socket as unknown as { emit: unknown }).emit = () => {};
    const disconnect = (s: ReturnType<typeof fakeSocket>) => {
      // handleConnection が登録した disconnect を呼ぶ。
      void s.call("disconnect");
    };
    disconnect(host);
    vi.advanceTimersByTime(59_000);
    expect(g.lastRoom()!.hostUserId).toBe("h");
    vi.advanceTimersByTime(2_000);
    expect(g.lastRoom()).toMatchObject({ hostUserId: "g", isHost: true });
    expect(g.lastRoom()!.members.map((m) => m.userId)).toEqual(["g"]);
  });

  it("スタートされずに30分たったルームは消える", async () => {
    const { connect, manager } = setup();
    const host = connect("h");
    await host.call("privateCreate");
    vi.advanceTimersByTime(30 * 60_000 + 1);
    expect(manager.roomCount()).toBe(0);
    expect(host.emitted.at(-1)).toMatchObject({ event: "privateRoomClosed", payload: { reason: "EXPIRED" } });
  });

  it("優勝が決まるとホストは「もう一度」で同じコードの待合に戻せる", async () => {
    const { connect } = setup();
    const host = connect("h");
    const { code } = await host.call("privateCreate");
    await connect("g").call("privateJoin", { code });
    await host.call("privateStart");
    expect(await host.call("privateRematch")).toMatchObject({ ok: false });
    sessions[0]!.config.private.onFinished([{ userId: "g", displayName: "G", avatarKey: null, place: 1 }]);
    expect(host.lastRoom()).toMatchObject({ phase: "finished" });
    expect(await host.call("privateRematch")).toMatchObject({ ok: true, code });
    expect(host.lastRoom()).toMatchObject({ phase: "lobby", code });
  });

  it("SNG / MTT の対局中はルームを作れない", async () => {
    const { connect, busy } = setup();
    busy.add("h");
    expect(await connect("h").call("privateCreate")).toMatchObject({ ok: false, error: "BUSY" });
  });

  it("ルームの情報に、席の種別を示す項目を含めない", async () => {
    const { connect } = setup();
    const host = connect("h");
    await host.call("privateCreate", { settings: { autoSeats: 2 } });
    const json = JSON.stringify(host.lastRoom());
    expect(json).not.toMatch(/bot/i);
    expect(Object.keys(host.lastRoom()!.members[0]!).sort()).toEqual(["avatarKey", "displayName", "userId"]);
  });
});
