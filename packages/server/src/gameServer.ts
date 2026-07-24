import { randomUUID } from "node:crypto";
import type { Server, Socket } from "socket.io";
import { HandEngine, Tournament, cardToString, type Card, type PlayerAction, type PublicHandState } from "@meta-geo/engine";
import { prisma, recordHand, recordBuyIn, recordPayout, SNG_PAYOUTS } from "@meta-geo/db";
import { decideBotAction, lastAggressorSeat } from "./bot.js";
import { computeRevealedSeats } from "./showdown.js";
import { activeGames } from "./activeGames.js";

const NEXT_HAND_DELAY_MS = 3500;
/** 全人間の結果確定後にBOT同士の消化を高速化するときのディレイ */
const FAST_BOT_DELAY_MS = 25;
const FAST_NEXT_HAND_DELAY_MS = 50;
/** 1アクションの基本持ち時間(ショットクロック) */
export const ACTION_CLOCK_MS = 20_000;
/** タイムバンクカード1枚で追加される考慮時間 */
export const TIME_BANK_EXTENSION_MS = 30_000;
/** SNG/MTTのタイムバンクカード枚数 */
export const SNG_TIME_BANK_CARDS = 5;
export const MTT_TIME_BANK_CARDS = 10;
export const SNG_BUY_IN = 1000;
export const SNG_SEAT_COUNT = 6;
/** オールインランアウト: 手札をテーブルアップしてから最初のストリートが開くまでの待ち時間 */
export const SHOWDOWN_TABLE_PAUSE_MS = 1400;
/** オールインランアウト: ストリート1つ開くごとの待ち時間 */
export const RUNOUT_STREET_PAUSE_MS = 1100;

// 対戦相手として着席する自動プレイヤーの名前プール。人間と絶対に見分けがつかないよう、実在プレイヤーに
// ありがちな「系統」を4つに分け、同卓時にどの系統も均等に混じるようにする(選出は下記 pickBotProfiles で
// 系統ごとにシャッフル→ラウンドロビン)。avatarKey は null(人間と同じ共通アイコンで表示)。
const BOT_NAME_GROUPS: readonly (readonly string[])[] = [
  // A. ゆるいハンドル(食べ物・動物・かわいい造語)
  [
    "たこやき", "こんぶ", "あんこ", "きなこ", "おもち", "プリン", "メロンパン", "なっとう", "せんべい", "だんご",
    "ずんだ", "らむね", "はちみつ", "みるく", "でどだむ", "ぷにぷに", "もふもふ", "ぽんず", "ぺんぎん", "くらげ",
    "しろくま", "らっこ", "ぱんだ", "たぬき", "ふくろう", "きのこ",
  ],
  // B. テキトーに付けた風(雑・打ち間違い・未設定っぽさ)
  [
    "あああああ", "ああ", "あー", "てすと", "なまえ", "ゲスト", "ぬ", "ん", "ほげ", "ふが",
    "aaaa", "asdf", "qwerty", "wwww", "zzz", "・・・", "123", "てきとう", "あいうえお", "うぇ",
    "っっ", "ぽぽ", "なし", "aaの",
  ],
  // C. ネタ(ポーカー用語いじり・お笑い系)
  [
    "オナホールデム", "全ツッパ", "降りない男", "とりまコール", "ぶっぱ太郎", "沼", "養分", "レイズしか勝たん",
    "課金は正義", "ノールック", "フロップの妖精", "おりたくない", "万年ドベ", "初手オールイン", "チップは飾り",
    "気合いでコール", "運だけ", "まくり最強", "リバー爆弾", "実質勝ち", "たぶん勝てる", "おっつけ番長",
    "ベット魔", "全部乗せ",
  ],
  // D. ローマ字ハンドル/名前
  [
    "Akira", "ChanYasu", "Kenji", "Hiro", "Yuto", "Sho", "Kaz", "Ryo", "Taku", "NaoK",
    "DaiG", "MasaP", "Shinji", "Tatsu", "koba", "yktk", "TKG", "aki_p", "Ken1", "Shun",
    "Ryu", "Mao", "GotoH", "nabe",
  ],
];

export interface BotProfile {
  readonly name: string;
  readonly avatarKey: string | null;
}

/** 全系統をまとめた一覧(互換用)。avatarKey は常に null。 */
export const BOT_PROFILES: readonly BotProfile[] = BOT_NAME_GROUPS.flat().map((name) => ({ name, avatarKey: null }));

// 自動プレイヤーがたまに送る自然な短いチャット。人間は勝ったときなどに一言つぶやくが、bot が完全に
// 無言だと不自然なため、低頻度で文脈に合った短文を送る(過剰にならないよう頻度は抑える)。
const BOT_CHAT_LINES = {
  win: ["ナイスポット", "もらった", "よし", "ふぅ", "取れた〜", "ありがと", "らっき", "ここは取りたかった", "gg"],
  steal: ["ごめんね", "いただき", "降ろせた", "よしよし", "もらっとく"],
} as const;

export function pickBotChatLine(kind: keyof typeof BOT_CHAT_LINES): string {
  const pool = BOT_CHAT_LINES[kind];
  return pool[Math.floor(Math.random() * pool.length)]!;
}

/** 配列をコピーしてFisher-Yatesでシャッフルした新配列を返す。 */
function shuffled<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/**
 * count人ぶんのBOTプロフィールを、名前の系統(ハンドル/テキトー/ネタ/ローマ字)がなるべく均等に
 * 混ざる順序で返す。各系統を個別にシャッフルし、ラウンドロビンで先頭から取り出すため、5人程度の
 * 卓でも必ず複数系統が混在し「全員同じ雰囲気=BOTっぽさ」が出ない。count が総数を超える場合は循環する。
 */
export function pickBotProfiles(count: number): BotProfile[] {
  const groups = BOT_NAME_GROUPS.map((g) => shuffled(g));
  const order: string[] = [];
  for (let i = 0; order.length < BOT_PROFILES.length; i++) {
    for (const g of groups) if (i < g.length) order.push(g[i]!);
  }
  return Array.from({ length: count }, (_, i) => ({ name: order[i % order.length]!, avatarKey: null }));
}

/**
 * 自動プレイヤーが「実際にアクションするまでの時間(ms)」を人間らしく決める。持ち時間そのものは
 * 人間と同じ20秒(ACTION_CLOCK_MS)固定で、その中の"どこで"動くかをストリートごとにばらけさせる。
 * 返り値が20秒を超えると、呼び出し側(scheduleBotTurn)がタイムバンクを使って延長する。
 * - チェック: どのストリートでも長考しない(0.2〜0.9秒)。相手のベットが無く考える材料が少ないため、テンポ優先。
 * - プリフロップ: フォールドは半分がx/f(即降り)、半分は0.5〜2秒考えてからフォールド。参加は0.8〜5秒。
 * - フロップ: 全アクション0〜5秒でランダム。
 * - ターン以降: 2〜20秒で考える。たまに20秒を超えてタイムバンクを使う。
 */
export function botDecisionMs(street: string, action: PlayerAction, rand: () => number = Math.random): number {
  const isFold = action.kind === "fold";

  // チェックはストリートを問わず1秒以内に即チェック(0.2〜0.9秒)。
  if (action.kind === "check") return 200 + rand() * 700;

  if (street === "preflop") {
    if (isFold) {
      // 半分はx/fで即降り、半分は0.5〜2秒考えてからフォールド。
      return rand() < 0.5 ? 100 + rand() * 200 : 500 + rand() * 1500;
    }
    return 800 + rand() * 4200; // 参加: 0.8〜5秒
  }

  if (street === "flop") {
    return rand() * 5000; // 0〜5秒でランダム
  }

  // ターン/リバー: 2〜20秒で考える。たまにタイムバンクで延長。
  if (rand() < 0.15) {
    return ACTION_CLOCK_MS + 1500 + rand() * 8000; // 21.5〜約29.5秒(タイムバンク使用)
  }
  return 2000 + rand() * 18000; // 2〜20秒
}

/** クライアントの席バッジ表示用に、実行したアクションを表示種別+bb換算前の額に正規化する。 */
export interface SeatActionEvent {
  seatIndex: number;
  kind: "bet" | "raise" | "call" | "check" | "fold" | "allIn";
  toAmount: number;
}

/**
 * 適用したアクションを、アクション前の公開状態を使って表示用に組み立てる。
 * コール額は「マッチした額(アクション前のcurrentBetToMatch)」、オールインは「投入後の総拠出額」。
 * ポストフロップで最初のアグレッションだけを bet、それ以外(プリフロップ/ベットに直面時)は raise と表記する。
 */
export function buildSeatAction(seatIndex: number, action: PlayerAction, pre: PublicHandState): SeatActionEvent {
  const preSeat = pre.seats.find((s) => s.seatIndex === seatIndex);
  const contribBefore = preSeat?.streetContribution ?? 0;
  const wasFacingBet = pre.currentBetToMatch > contribBefore;
  const isPreflop = pre.street === "preflop";
  const amt = action.toAmount ?? 0;
  switch (action.kind) {
    case "fold":
      return { seatIndex, kind: "fold", toAmount: 0 };
    case "call":
      return { seatIndex, kind: "call", toAmount: pre.currentBetToMatch };
    case "bet":
      return { seatIndex, kind: isPreflop || wasFacingBet ? "raise" : "bet", toAmount: amt };
    case "raise":
      return { seatIndex, kind: "raise", toAmount: amt };
    case "allIn":
      return { seatIndex, kind: "allIn", toAmount: contribBefore + (preSeat?.stack ?? 0) };
    // check・postBlind・postAnte はいずれもバッジ上は「Check」相当(強制ポストはここに来ない)。
    default:
      return { seatIndex, kind: "check", toAmount: 0 };
  }
}

export interface StagedRunoutParams {
  hand: HandEngine;
  /** オールインコールが成立した時点(=残りボード展開前)のボード枚数 */
  boardLenBefore: number;
  emitState: (state: PublicHandState) => void;
  emitShowdown: (holeCards: Record<number, string[]>) => void;
  /** ディレイ後もまだこのハンド/セッションが生きているか(次のハンドに進んでいたら中断) */
  isStillCurrent: () => boolean;
  onDone: () => void;
}

/**
 * オールインでベッティングが閉じてハンドが完了した場合の公開順の演出。TDAルール16
 * 「プレイヤーがオールインで他全員のベッティングアクションが完了したら、残りのボードが
 * 配られる前に全ハンドを直ちにテーブルアップする」に従い、
 *  1) ボードは増やさずに、公開義務のある全員の手札を先にテーブルアップ(showdownReveal)
 *  2) フロップ/ターン/リバーを1ストリートずつ間を置いて公開
 *  3) 最後に結果処理(handEnded)へ進む
 * の順でクライアントへ配信する。エンジン自体は既に完了済みなので、途中経過のstateは
 * 最終stateのボードを切り詰めたスナップショットとして合成する。
 */
export function scheduleStagedRunout(params: StagedRunoutParams): void {
  const finalState = params.hand.getPublicState();
  const stateAt = (boardLen: number): PublicHandState => ({
    ...finalState,
    board: finalState.board.slice(0, boardLen),
    isComplete: false,
  });

  // 1) まずショウダウン: ボードはオールイン成立時点のまま、手札だけを公開する
  params.emitState(stateAt(params.boardLenBefore));
  const revealedSeats = computeRevealedSeats(params.hand);
  const holeCards = Object.fromEntries(
    [...params.hand.getAllHoleCards()]
      .filter(([seat]) => revealedSeats.has(seat))
      .map(([seat, cards]) => [seat, cards.map(cardToString)]),
  );
  params.emitShowdown(holeCards);

  // 2) 残りのストリートを1つずつ公開し、3) 最後に結果処理へ進む
  let delay = SHOWDOWN_TABLE_PAUSE_MS;
  for (const boardLen of [3, 4, 5]) {
    if (boardLen <= params.boardLenBefore || boardLen > finalState.board.length) continue;
    const at = delay;
    setTimeout(() => {
      if (params.isStillCurrent()) params.emitState(stateAt(boardLen));
    }, at);
    delay += RUNOUT_STREET_PAUSE_MS;
  }
  setTimeout(() => {
    if (params.isStillCurrent()) params.onDone();
  }, delay);
}

/** 自動プレイヤー用のUserレコードを確保して返す(名前をキーにupsert)。
 * プールからランダムに重複なく選ぶため、同じ卓に「見覚えのある名前」ばかり並ばない。
 * countがプール数を超える場合のみ循環して補う。 */
export async function ensureBotUsers(
  count: number,
  offset = 0,
): Promise<{ id: string; displayName: string; avatarKey: string | null }[]> {
  void offset; // 互換のため引数は残すが、選出は系統均等のラウンドロビン化した
  const profiles = pickBotProfiles(count);
  return Promise.all(
    profiles.map(async (p) => {
      const u = await prisma.user.upsert({
        where: { email: `${p.name}@bots.meta-geo.local` },
        update: { avatarKey: p.avatarKey },
        create: { email: `${p.name}@bots.meta-geo.local`, displayName: p.name, isBot: true, avatarKey: p.avatarKey },
      });
      return { id: u.id, displayName: u.displayName, avatarKey: p.avatarKey };
    }),
  );
}

export interface HumanPlayer {
  readonly userId: string;
  readonly displayName: string;
  readonly avatarKey: string | null;
}

/** 同卓チャットの1メッセージ。プレイヤーカードの吹き出し表示・チャットログ表示に使う。 */
export interface ChatMessage {
  seatIndex: number;
  userId: string;
  displayName: string;
  text: string;
  ts: number;
}

/** チャット本文の正規化(前後空白除去・改行を空白化・最大120文字)。空なら null。 */
export function sanitizeChatText(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.replace(/\s+/g, " ").trim().slice(0, 120);
  return text.length > 0 ? text : null;
}

interface HumanSeat {
  readonly userId: string;
  readonly displayName: string;
  readonly avatarKey: string | null;
  socket: Socket | null;
  timeBankCards: number;
  timeBankArmed: boolean;
  /** 離席中(自動チェック/フォールド)。他プレイヤーの画面にも「離席中」を表示するため
   * サーバーが状態を保持しplayersペイロードでブロードキャストする。 */
  away: boolean;
  left: boolean;
  done: boolean;
  /** 連続タイムアウト回数。2回連続でアクションが時間切れになると自動で離席状態にする。
   * 自分でアクションすると0にリセット。 */
  consecutiveTimeouts: number;
}

interface SeatPlayer {
  readonly seatIndex: number;
  readonly userId: string;
  readonly displayName: string;
  readonly avatarKey: string | null;
  readonly isBot: boolean;
}

export interface TableSessionConfig {
  readonly io: Server;
  readonly seatCount: number;
  readonly humans: HumanPlayer[];
}

/** ロビーが扱うゲームセッションの共通インターフェース(SNG/MTT)。 */
export interface GameSession {
  isFinished(): boolean;
  /** 指定ユーザーの結果が確定済みか(バスト/離脱後)。trueなら新しいゲームに参加できる。 */
  isUserDone(userId: string): boolean;
  attachHuman(socket: Socket, userId: string): void;
  /** チップを破棄してゲームから離脱する(以降は自動フォールドで消化)。 */
  leave(userId: string): void;
}

/**
 * 1卓分(SNG)のゲーム進行を管理する。マッチングで集まった複数の人間プレイヤー+BOTで
 * 6人卓を構成する。プライズは固定(1位$4,000 / 2位$2,000)。
 */
export class TableSession implements GameSession {
  private tournament: Tournament | null = null;
  private hand: HandEngine | null = null;
  private dbTournamentId: string | null = null;
  private players = new Map<number, SeatPlayer>();
  private humansBySeat = new Map<number, HumanSeat>();
  // 自主的にハンドを公開(ショウ)する席。プレイ中に本人がカードをタップして意思表示し、
  // ハンド終了時に公開義務の有無にかかわらず手札を公開する。ハンド開始ごとにリセットする。
  private readonly showRequests = new Set<number>();
  /** 同卓チャットのログ(直近50件)。再接続時にまとめて送る。 */
  private chatLog: ChatMessage[] = [];
  private finished = false;
  private turnTimer: ReturnType<typeof setTimeout> | null = null;
  /** 直近に配信した手番クロック。再接続(attachHuman)時に、まだ有効なら新ソケットへ再送して復帰後の時計を正しく動かす。 */
  private lastTurn: { seatIndex: number; endsAt: number; durationMs: number } | null = null;
  private levelEndsAt = 0;
  private acceleratedHands = 0;

  readonly gameType = "sng";
  readonly buyIn = SNG_BUY_IN;
  private readonly seatCount: number;
  private readonly configHumans: HumanPlayer[];
  private readonly io: Server;
  private readonly roomId = `table:${randomUUID()}`;

  constructor(config: TableSessionConfig) {
    this.io = config.io;
    this.seatCount = config.seatCount;
    this.configHumans = config.humans;

    // 人間の席とHumanSeatはコンストラクタで同期的に確保する(start()を待つとattachHumanが
    // start()より先に呼ばれた場合に無視されてしまうため)。BOT席とトーナメント作成は
    // start()側で非同期に行う。
    this.configHumans.forEach((h, i) => {
      this.players.set(i, { seatIndex: i, userId: h.userId, displayName: h.displayName, avatarKey: h.avatarKey, isBot: false });
      this.humansBySeat.set(i, {
        userId: h.userId,
        displayName: h.displayName,
        avatarKey: h.avatarKey,
        socket: null,
        timeBankCards: SNG_TIME_BANK_CARDS,
        timeBankArmed: false,
        away: false,
        left: false,
        done: false,
        consecutiveTimeouts: 0,
      });
    });
  }

  isFinished(): boolean {
    return this.finished;
  }

  isUserDone(userId: string): boolean {
    if (this.finished) return true;
    const h = [...this.humansBySeat.values()].find((x) => x.userId === userId);
    return h ? h.done || h.left : true;
  }

  private allHumansDone(): boolean {
    return [...this.humansBySeat.values()].every((h) => h.done || h.left);
  }

  /** マッチング完了後に呼ばれる: 残りの席をBOTで埋めてトーナメントを即座に開始する。 */
  async start(): Promise<void> {
    const botCount = this.seatCount - this.configHumans.length;
    const botUsers = await ensureBotUsers(botCount);
    botUsers.forEach((u, i) => {
      const seatIndex = this.configHumans.length + i;
      this.players.set(seatIndex, { seatIndex, userId: u.id, displayName: u.displayName, avatarKey: u.avatarKey, isBot: true });
    });

    this.tournament = new Tournament({
      seatCount: this.seatCount,
      players: [...this.players.values()].map((p) => ({ playerId: p.userId, displayName: p.displayName, seatIndex: p.seatIndex })),
    });

    const dbTournament = await prisma.tournament.create({
      data: {
        seatCount: this.seatCount,
        startingStack: this.tournament.getSeats()[0]!.stack,
        status: "running",
        gameType: this.gameType,
        buyIn: this.buyIn,
      },
    });
    this.dbTournamentId = dbTournament.id;
    await prisma.tournamentEntry.createMany({
      data: [...this.players.values()].map((p) => ({ tournamentId: dbTournament.id, userId: p.userId, seatIndex: p.seatIndex })),
    });

    for (const h of this.configHumans) {
      await recordBuyIn({ userId: h.userId, tournamentId: dbTournament.id, amount: this.buyIn });
    }

    this.io.to(this.roomId).emit("players", { players: this.playersPayload() });
    this.scheduleLevelAdvance();
    this.beginNextHand();
  }

  attachHuman(socket: Socket, userId: string): void {
    const entry = [...this.humansBySeat.entries()].find(([, h]) => h.userId === userId);
    if (!entry) return;
    const [seatIndex, human] = entry;
    human.socket = socket;
    // 再接続したら離席状態を解除し、連続タイムアウトもリセット(戻ってきたので通常プレイに復帰)。
    human.consecutiveTimeouts = 0;
    if (human.away) {
      human.away = false;
      this.io.to(this.roomId).emit("players", { players: this.playersPayload() });
    }
    void socket.join(this.roomId);
    socket.on("action", (action: PlayerAction) => {
      // 自分でアクションしたら連続タイムアウトをリセット。タイムアウトで離席状態になっていた
      // 場合は自動的に復帰させる(全員の画面の「離席中」も解除)。
      human.consecutiveTimeouts = 0;
      if (human.away) {
        human.away = false;
        this.io.to(this.roomId).emit("players", { players: this.playersPayload() });
      }
      this.handlePlayerAction(seatIndex, action);
    });
    socket.on("timeBankArm", (payload: { armed?: boolean }) => {
      human.timeBankArmed = Boolean(payload?.armed);
    });
    socket.on("sitOut", (payload: { away?: boolean }) => {
      human.away = Boolean(payload?.away);
      // 離席状態は全員の画面に反映する(座席に「離席中」を表示するため)。
      this.io.to(this.roomId).emit("players", { players: this.playersPayload() });
    });
    socket.on("chat", (payload: { text?: string }) => {
      const text = sanitizeChatText(payload?.text);
      if (!text) return;
      const msg: ChatMessage = { seatIndex, userId: human.userId, displayName: human.displayName, text, ts: Date.now() };
      this.chatLog.push(msg);
      if (this.chatLog.length > 50) this.chatLog.shift();
      this.io.to(this.roomId).emit("chat", msg);
    });
    // ハンドショウ: 本人がプレイ中にカードをタップして自主公開の意思をトグルする。
    // 記録のみ行い(他者へは即時通知しない)、ハンド終了時にまとめて公開する。
    socket.on("showCards", (payload: { show?: boolean }) => {
      if (!this.hand || this.hand.isHandComplete()) return;
      if (payload?.show === false) this.showRequests.delete(seatIndex);
      else this.showRequests.add(seatIndex);
    });
    socket.on("disconnect", () => {
      if (human.socket !== socket) return;
      human.socket = null;
      // タスクキル/アプリ終了/リフレッシュなどで切断された場合は自動で離席状態にする(全員の画面に
      // 「離席中」表示)。手番は時間切れで自動チェック/フォールドされるが、席そのものは保持し続ける。
      if (!human.away && !human.left) {
        human.away = true;
        this.io.to(this.roomId).emit("players", { players: this.playersPayload() });
      }
      // 重要: 切断だけでは絶対にトーナメントから離脱させない(オーナー指示)。ページのリフレッシュや
      // 一時的な回線断で持ちチップを失わないよう、離脱は「チップ破棄」ボタン(明示的なleaveGame)か
      // バスト時のみとする。切断中もバストするまで席は残り、再接続すればいつでも卓へ戻れる。
    });

    if (this.players.size > 0) socket.emit("players", { players: this.playersPayload() });
    if (this.tournament) socket.emit("levelUp", { level: this.tournament.getCurrentLevel(), endsAt: this.levelEndsAt });
    this.broadcastTournamentInfo();
    if (this.chatLog.length > 0) socket.emit("chatLog", { messages: this.chatLog });
    socket.emit("timeBank", { cards: human.timeBankCards, armed: human.timeBankArmed });
    if (this.hand) {
      socket.emit("state", this.hand.getPublicState());
      socket.emit("yourCards", { seatIndex, cards: this.hand.getSeatHoleCards(seatIndex).map(cardToString) });
      // 復帰後の手番クロックを正しく動かすため、まだ有効な手番タイマーを新ソケットへ再送する。
      if (this.lastTurn && this.lastTurn.endsAt > Date.now() && this.hand.getActingSeatIndex() === this.lastTurn.seatIndex) {
        socket.emit("turnTimer", this.lastTurn);
      }
    }
  }

  leave(userId: string): void {
    const entry = [...this.humansBySeat.entries()].find(([, h]) => h.userId === userId);
    if (!entry || this.finished) return;
    const [seatIndex, human] = entry;
    if (human.left) return;
    human.left = true;
    // チップを破棄しての離脱は即敗退扱いにする(自動フォールドで生き残らせない)。
    this.tournament?.forceEliminate(seatIndex);
    // 参加費(バイイン)を確実に成績へ反映するため、離脱時点で着順を確定・記録する
    // (トーナメント全体の終了を待たない=サーバー再起動でも取りこぼさない)。
    void this.recordHumanFinish(seatIndex, human);
    if (this.hand && !this.hand.isHandComplete() && this.hand.getActingSeatIndex() === seatIndex) {
      this.handlePlayerAction(seatIndex, { kind: "fold" });
    }
  }

  private playersPayload(): { seatIndex: number; userId: string; displayName: string; avatarKey: string | null; isBot: boolean; away: boolean }[] {
    return [...this.players.values()].map((p) => ({
      seatIndex: p.seatIndex,
      // BOTのuserIdは合成IDなのでクライアント側では詳細スタッツを引かない(isBotで判定)。
      userId: p.userId,
      displayName: p.displayName,
      avatarKey: p.avatarKey,
      isBot: p.isBot,
      away: this.humansBySeat.get(p.seatIndex)?.away ?? false,
    }));
  }

  /** トーナメントクロック画面用の集計情報(残り人数/総数/アベレージスタック/プライズ)を配信する。 */
  private broadcastTournamentInfo(): void {
    if (!this.tournament) return;
    const seats = this.tournament.getSeats();
    const alive = seats.filter((s) => s.bustedAtHand === null);
    const remaining = alive.length;
    const totalChips = alive.reduce((sum, s) => sum + s.stack, 0);
    const averageStack = remaining > 0 ? Math.round(totalChips / remaining) : 0;
    this.io.to(this.roomId).emit("tournamentInfo", {
      remaining,
      total: seats.length,
      averageStack,
      prizePool: SNG_PAYOUTS,
      tournamentId: this.dbTournamentId ?? null,
    });
  }

  private isAccelerated(): boolean {
    return this.allHumansDone();
  }

  private scheduleLevelAdvance(): void {
    const tournament = this.tournament;
    if (!tournament) return;
    const level = tournament.getCurrentLevel();
    this.levelEndsAt = Date.now() + level.durationMinutes * 60_000;
    this.io.to(this.roomId).emit("levelUp", { level, endsAt: this.levelEndsAt });
    this.broadcastTournamentInfo();
    setTimeout(() => {
      if (!this.tournament || this.tournament.isTournamentOver() || this.finished) return;
      this.tournament.advanceToNextLevel();
      this.scheduleLevelAdvance();
    }, level.durationMinutes * 60_000);
  }

  /**
   * 次のハンドを開始する。startNextHand が万一失敗しても卓が永久に止まらないよう、
   * 再試行(最大5回・2秒間隔)と、クライアントへの理由通知(tableNotice)を行う。
   * 初回失敗時は「直前ハンドの清算が未了のまま残っている」ケースに備えて清算を一度だけ再試行する。
   */
  private beginNextHand(attempt = 0): void {
    if (!this.tournament || this.finished) return;
    if (this.tournament.isTournamentOver()) {
      void this.finishTournament();
      return;
    }
    try {
      this.hand = this.tournament.startNextHand();
    } catch (err) {
      console.error(`[sng] beginNextHand failed (attempt ${attempt}):`, err);
      if (attempt === 0) {
        try {
          this.tournament.settleFinishedHand();
        } catch {
          /* 清算済み・清算対象なしなら無視 */
        }
      }
      if (attempt < 5) {
        this.io.to(this.roomId).emit("tableNotice", {
          kind: "retrying",
          message: "サーバー内部エラーのため、次のハンドの開始を再試行しています…",
        });
        setTimeout(() => this.beginNextHand(attempt + 1), 2000);
      } else {
        this.io.to(this.roomId).emit("tableNotice", {
          kind: "stalled",
          message: "サーバー内部エラーで次のハンドを開始できませんでした。アプリを再読み込みして卓へ復帰してください。",
        });
      }
      return;
    }
    this.showRequests.clear();
    this.broadcastState();
    this.broadcastTournamentInfo();
    this.scheduleTurn();
  }

  private currentButtonInfo(): { smallBlindSeat: number | null; bigBlindSeat: number } {
    const events = this.tournament!.getEvents();
    const started = [...events].reverse().find((e) => e.type === "handStarted") as
      | { smallBlindSeat: number | null; bigBlindSeat: number }
      | undefined;
    return started ?? { smallBlindSeat: null, bigBlindSeat: 0 };
  }

  private handlePlayerAction(seatIndex: number, action: PlayerAction): void {
    const hand = this.hand;
    if (!hand || hand.isHandComplete()) return;
    if (hand.getActingSeatIndex() !== seatIndex) return;
    const human = this.humansBySeat.get(seatIndex);
    const preState = hand.getPublicState();
    const boardLenBefore = preState.board.length;
    let effectiveAction = action;
    try {
      hand.applyAction(seatIndex, action);
    } catch (err) {
      if (!human || human.left) {
        // 想定外の不正アクションでテーブルが止まらないよう、必ず合法なfoldにフォールバックする
        hand.applyAction(seatIndex, { kind: "fold" });
        effectiveAction = { kind: "fold" };
      } else {
        human.socket?.emit("actionError", { message: (err as Error).message });
        return;
      }
    }
    // ストリートを閉じるアクション(コール/チェック等)もアイコンに一瞬表示されるよう、状態更新とは
    // 別に seatAction イベントを発火する。状態のstreet変化でアクションが即消える問題を解消する。
    if (!this.isAccelerated()) {
      this.io.to(this.roomId).emit("seatAction", buildSeatAction(seatIndex, effectiveAction, preState));
    }
    if (hand.isHandComplete()) {
      const boardGrew = hand.getPublicState().board.length > boardLenBefore;
      // ボードが自動展開された=オールインでベッティングが閉じたケース。ルール上の順序どおり
      // 「先にショウダウン→ストリートごとにボード公開→結果処理」で配信する。
      // 全人間の結果確定後の高速消化中は演出を省いて即座に処理する。
      if (boardGrew && !this.isAccelerated()) {
        scheduleStagedRunout({
          hand,
          boardLenBefore,
          emitState: (state) => this.io.to(this.roomId).emit("state", state),
          emitShowdown: (holeCards) => this.io.to(this.roomId).emit("showdownReveal", { holeCards }),
          isStillCurrent: () => this.hand === hand && !this.finished,
          onDone: () => void this.finishHand(),
        });
      } else {
        this.broadcastState();
        void this.finishHand();
      }
    } else {
      this.broadcastState();
      this.scheduleTurn();
    }
  }

  /**
   * 手番の進行管理。BOTはディレイ後に自動アクション。人間はショットクロック(20秒)を起動し、
   * 時間切れ時にタイムバンクカードが有効(チェックON)なら1枚消費して30秒延長、
   * 使えなければ自動チェック(不可ならフォールド)。
   */
  private scheduleTurn(): void {
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }
    const hand = this.hand;
    if (!hand || hand.isHandComplete()) return;
    const actingSeat = hand.getActingSeatIndex();
    if (actingSeat === null) return;
    const human = this.humansBySeat.get(actingSeat);

    if (!human) {
      // 実際に選ぶアクションを先に確定し、人間と同じ20秒のショットクロックの中で動かす。
      const botAction = this.computeBotAction(actingSeat);
      this.scheduleBotTurn(actingSeat, botAction);
      return;
    }

    if (human.left) {
      this.turnTimer = setTimeout(() => {
        if (!this.hand || this.hand.isHandComplete() || this.hand.getActingSeatIndex() !== actingSeat) return;
        this.handlePlayerAction(actingSeat, { kind: "fold" });
      }, FAST_BOT_DELAY_MS);
      return;
    }

    this.armHumanClock(actingSeat, human, ACTION_CLOCK_MS);
  }

  /**
   * 自動プレイヤーの手番。人間と同じ20秒のショットクロックを表示し、その中の決めた時刻でアクション
   * する(早め〜ギリギリ)。20秒で決めきれない場合はタイムバンクで延長する(他プレイヤーの画面では
   * リングが延びて見える)。人間不在の卓は演出を省いて即消化する。
   */
  /** 手番クロックを卓へ配信しつつ、再接続時の再送用に最新値を保持する。 */
  private emitTurnTimer(seatIndex: number, endsAt: number, durationMs: number): void {
    this.lastTurn = { seatIndex, endsAt, durationMs };
    this.io.to(this.roomId).emit("turnTimer", { seatIndex, endsAt, durationMs });
  }

  private scheduleBotTurn(actingSeat: number, botAction: PlayerAction): void {
    const act = () => {
      if (!this.hand || this.hand.isHandComplete() || this.hand.getActingSeatIndex() !== actingSeat) return;
      this.handlePlayerAction(actingSeat, botAction);
    };
    if (this.isAccelerated()) {
      this.turnTimer = setTimeout(act, FAST_BOT_DELAY_MS);
      return;
    }
    const street = this.hand?.getPublicState().street ?? "preflop";
    const decision = botDecisionMs(street, botAction);
    // 人間と全く同じ20秒のショットクロックを表示する。
    this.emitTurnTimer(actingSeat, Date.now() + ACTION_CLOCK_MS, ACTION_CLOCK_MS);
    if (decision <= ACTION_CLOCK_MS) {
      this.turnTimer = setTimeout(act, decision);
      return;
    }
    // 20秒で決めきれず、タイムバンクを使って延長する。
    this.turnTimer = setTimeout(() => {
      if (!this.hand || this.hand.isHandComplete() || this.hand.getActingSeatIndex() !== actingSeat) return;
      this.emitTurnTimer(actingSeat, Date.now() + TIME_BANK_EXTENSION_MS, TIME_BANK_EXTENSION_MS);
      this.turnTimer = setTimeout(act, Math.min(decision - ACTION_CLOCK_MS, TIME_BANK_EXTENSION_MS - 1000));
    }, ACTION_CLOCK_MS);
  }

  private armHumanClock(actingSeat: number, human: HumanSeat, durationMs: number): void {
    const endsAt = Date.now() + durationMs;
    this.emitTurnTimer(actingSeat, endsAt, durationMs);
    this.turnTimer = setTimeout(() => {
      const current = this.hand;
      if (!current || current.isHandComplete() || current.getActingSeatIndex() !== actingSeat) return;

      // タイムバンクカード: チェックONかつ残枚数があれば1枚消費して延長
      if (human.timeBankArmed && human.timeBankCards > 0 && !human.left) {
        human.timeBankCards -= 1;
        human.socket?.emit("timeBank", { cards: human.timeBankCards, armed: human.timeBankArmed, consumed: true });
        this.armHumanClock(actingSeat, human, TIME_BANK_EXTENSION_MS);
        return;
      }

      // 連続タイムアウトを数え、2回連続で時間切れになったら自動で離席状態にする。
      human.consecutiveTimeouts += 1;
      if (human.consecutiveTimeouts >= 2 && !human.away) {
        human.away = true;
        this.io.to(this.roomId).emit("players", { players: this.playersPayload() });
      }

      const seat = current.getPublicState().seats.find((s) => s.seatIndex === actingSeat);
      const toCall = seat ? Math.max(0, current.getPublicState().currentBetToMatch - seat.streetContribution) : 0;
      this.handlePlayerAction(actingSeat, toCall <= 0 ? { kind: "check" } : { kind: "fold" });
    }, durationMs);
  }

  private computeBotAction(seatIndex: number): PlayerAction {
    const hand = this.hand!;
    const state = hand.getPublicState();
    const seat = state.seats.find((s) => s.seatIndex === seatIndex)!;
    const holeCards = hand.getSeatHoleCards(seatIndex);
    if (holeCards.length !== 2) return { kind: "fold" };
    const activeOpponentCount = state.seats.filter(
      (s) => s.seatIndex !== seatIndex && (s.status === "active" || s.status === "allIn"),
    ).length;
    return decideBotAction({
      street: state.street,
      holeCards: holeCards as unknown as readonly [Card, Card],
      board: state.board,
      currentBetToMatch: state.currentBetToMatch,
      streetContribution: seat.streetContribution,
      minRaiseToAmount: hand.getMinRaiseToAmount(),
      potBefore: state.potTotal,
      stack: seat.stack,
      canRaise: !seat.hasActedThisStreet,
      activeOpponentCount,
      bigBlind: this.tournament?.getCurrentLevel().bigBlind,
      isAggressor: lastAggressorSeat(hand.getEvents()) === seatIndex,
    });
  }

  private async finishHand(): Promise<void> {
    const hand = this.hand;
    const tournament = this.tournament;
    if (!hand || !tournament || !this.dbTournamentId) return;

    // このメソッドの途中で何が失敗しても、末尾の「次のハンドをスケジュールする」処理には
    // 必ず到達させる(ここが飛ぶと、ショウダウン直後に卓が永久に固まる)。
    try {
      await this.finishHandInner(hand, tournament);
    } catch (err) {
      console.error("[sng] finishHand failed (proceeding to next hand):", err);
      // 清算(settleFinishedHand)前に失敗した可能性に備えて一度だけ清算を試みる。
      try {
        tournament.settleFinishedHand();
      } catch {
        /* 清算済みなら無視 */
      }
    }

    if (tournament.isTournamentOver()) {
      void this.finishTournament();
      return;
    }

    if (this.isAccelerated()) {
      this.acceleratedHands += 1;
      if (this.acceleratedHands % 10 === 0) tournament.advanceToNextLevel();
    }

    const delay = this.isAccelerated() ? FAST_NEXT_HAND_DELAY_MS : NEXT_HAND_DELAY_MS;
    setTimeout(() => this.beginNextHand(), delay);
  }

  private async finishHandInner(hand: HandEngine, tournament: Tournament): Promise<void> {
    const dbTournamentId = this.dbTournamentId;
    if (!dbTournamentId) return;
    const { smallBlindSeat, bigBlindSeat } = this.currentButtonInfo();
    const events = tournament.getEvents();
    const started = [...events].reverse().find((e) => e.type === "handStarted") as
      | { handNumber: number; level: { smallBlind: number; bigBlind: number; bbAnte: number }; buttonFixedPos: number }
      | undefined;

    if (started) {
      const startingStacks = new Map<number, number>();
      for (const seat of tournament.getSeats()) startingStacks.set(seat.seatIndex, seat.stack);

      await recordHand({
        tournamentId: dbTournamentId,
        handNumber: started.handNumber,
        buttonFixedPos: started.buttonFixedPos,
        levelSmallBlind: started.level.smallBlind,
        levelBigBlind: started.level.bigBlind,
        levelAnte: started.level.bbAnte,
        seats: [...this.players.values()]
          .filter((p) => tournament.getSeats().find((s) => s.seatIndex === p.seatIndex && s.bustedAtHand === null))
          .map((p) => ({
            seatIndex: p.seatIndex,
            userId: p.userId,
            startingStack: startingStacks.get(p.seatIndex) ?? 0,
            isSmallBlind: p.seatIndex === smallBlindSeat,
            isBigBlind: p.seatIndex === bigBlindSeat,
            wasAway: this.humansBySeat.get(p.seatIndex)?.away ?? false,
          })),
        hand,
      }).catch((err) => console.error("[sng] recordHand failed:", err));
    }

    // 公開義務のある席 + 自主公開(ショウ)を選んだ席をクライアントへ公開する(それ以外はマック)
    const revealedSeats = new Set([...computeRevealedSeats(hand), ...this.showRequests]);
    const revealedHoleCards = Object.fromEntries(
      [...hand.getAllHoleCards()].filter(([seat]) => revealedSeats.has(seat)).map(([seat, cards]) => [seat, cards.map(cardToString)]),
    );
    this.showRequests.clear();

    tournament.settleFinishedHand();
    this.io.to(this.roomId).emit("handEnded", {
      result: this.serializeResult(hand),
      holeCards: revealedHoleCards,
    });
    this.maybeBotHandEndChat(hand);

    // このハンドでバストした人間の着順・賞金を確定して個別に通知する。
    // DB障害等で失敗しても「次のハンドへ進む」流れを絶対に止めない(以前はここの例外で
    // beginNextHandのスケジュールに到達せず、ショウダウン直後に卓が固まる原因になっていた)。
    for (const [seatIndex, human] of this.humansBySeat) {
      const seat = tournament.getSeats().find((s) => s.seatIndex === seatIndex);
      if (!human.done && seat && seat.bustedAtHand !== null) {
        await this.recordHumanFinish(seatIndex, human).catch((err) =>
          console.error("[sng] recordHumanFinish failed:", err),
        );
      }
    }
  }

  /** 指定人間の着順確定(バスト時 or 優勝時)。SNG固定プライズを記帳し、本人へ通知する。 */
  private async recordHumanFinish(seatIndex: number, human: HumanSeat): Promise<void> {
    const tournament = this.tournament;
    if (!tournament || !this.dbTournamentId || human.done) return;
    human.done = true;

    const seat = tournament.getSeats().find((s) => s.seatIndex === seatIndex)!;
    const remaining = tournament.getSeats().filter((s) => s.bustedAtHand === null).length;
    const place = seat.bustedAtHand === null ? 1 : remaining + 1;
    const payout = SNG_PAYOUTS.find((p) => p.place === place)?.amount ?? 0;

    // DB書き込みが失敗しても、本人への結果通知とゲーム進行は止めない。
    try {
      await prisma.tournamentEntry.updateMany({
        where: { tournamentId: this.dbTournamentId, seatIndex },
        data: { finishPosition: place, payout },
      });
      if (payout > 0) {
        await recordPayout({ userId: human.userId, tournamentId: this.dbTournamentId, amount: payout });
      }
    } catch (err) {
      console.error("[sng] recordHumanFinish db write failed:", err);
    }

    human.socket?.emit("tournamentOver", {
      winnerPlayerId: place === 1 ? human.userId : null,
      yourFinishPosition: place,
      yourPayout: payout,
    });
    // 離席/切断中に終了した場合に備えて結果を保存(復帰時に結果サジェスト表示)。
    activeGames.recordResult(human.userId, {
      winnerPlayerId: place === 1 ? human.userId : null,
      yourFinishPosition: place,
      yourPayout: payout,
      gameKey: "sng",
    });
  }

  private async finishTournament(): Promise<void> {
    const tournament = this.tournament;
    if (!tournament || !this.dbTournamentId || this.finished) return;
    this.finished = true;
    if (this.turnTimer) clearTimeout(this.turnTimer);

    for (const [seatIndex, human] of this.humansBySeat) {
      if (!human.done) await this.recordHumanFinish(seatIndex, human);
    }

    // bustedAtHandが遅い(=nullなら優勝)ほど着順が良い、として並べる。
    const seats = [...tournament.getSeats()].sort((a, b) => {
      const aRank = a.bustedAtHand ?? Number.POSITIVE_INFINITY;
      const bRank = b.bustedAtHand ?? Number.POSITIVE_INFINITY;
      return bRank - aRank;
    });

    await Promise.all(
      seats.map(async (seat, index) => {
        if (this.humansBySeat.has(seat.seatIndex)) return; // 人間はrecordHumanFinishで確定済み
        const place = index + 1;
        await prisma.tournamentEntry.updateMany({
          where: { tournamentId: this.dbTournamentId!, seatIndex: seat.seatIndex },
          data: { finishPosition: place, payout: SNG_PAYOUTS.find((p) => p.place === place)?.amount ?? 0 },
        });
      }),
    );

    await prisma.tournament.update({
      where: { id: this.dbTournamentId },
      data: { status: "finished", finishedAt: new Date() },
    });
  }

  /** ハンド終了時のBotの一言。オーナー指示によりBotのチャット発言は全面無効化(no-op)。 */
  private maybeBotHandEndChat(_hand: HandEngine): void {
    // Botはチャットを一切発言しない。
  }

  private serializeResult(hand: HandEngine) {
    const result = hand.getResult();
    return {
      board: result.board.map(cardToString),
      pots: result.pots.map((p) => ({ amount: p.amount, eligiblePlayerIds: p.eligiblePlayerIds })),
      payouts: Object.fromEntries(result.payouts),
      wonByFold: result.wonByFold,
    };
  }

  private broadcastState(): void {
    if (!this.hand) return;
    this.io.to(this.roomId).emit("state", this.hand.getPublicState());

    for (const [seatIndex, human] of this.humansBySeat) {
      if (!human.socket) continue;
      // ショーダウン前でも自分自身のホールカードだけは常に見える
      human.socket.emit("yourCards", { seatIndex, cards: this.hand.getSeatHoleCards(seatIndex).map(cardToString) });
    }
  }
}
