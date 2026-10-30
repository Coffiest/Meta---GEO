"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { SPRING_MOVE, SPRING_SNAPPY } from "@/lib/motion";
import type { PublicHandState } from "@meta-geo/engine";
// deck.ts(node:crypto に依存)を含むバレル経由だとブラウザバンドルが壊れるため、
// cardToString は依存の少ないサブモジュールから直接インポートする。
import { cardToString } from "@meta-geo/engine/src/types/card.js";
import { bestFiveCards, describeMadeHand } from "@/lib/handRank";
import { useI18n } from "@/lib/i18n";
import { PlayingCard } from "./PlayingCard";
import { Seat, type SeatBadge, type SeatHud } from "./Seat";
import { positionLabelsForState } from "@/lib/position";
import { formatAmount, formatSignedAmount, type AmountDisplayMode } from "@/lib/format";
import type { SeatAction, SeatPlayerInfo, TurnTimerInfo } from "@/lib/socket";
import { designHeightFor, tableLayout, type TableLayout } from "./table3d/geometry";

// 3D の卓(three.js)は重いので、卓画面に来たときだけ読み込む。
const TableScene3D = dynamic(() => import("./table3d/TableScene3D"), { ssr: false });

/* 卓の設計寸法。座席・ボード・ポットの位置は全てこの箱に対する%で書かれているので、
   この比率が崩れると卓画像と座席がズレる。

   以前は `w-full max-w-md max-h-full aspect-[3/4]` で組んでいたが、`aspect-ratio` と
   `max-height` を同時に効かせると**高さだけが切り詰められて幅は保たれる**。
   結果、比率の崩れた箱の中で座席は横に広がり、卓画像は object-contain で高さに合わせて
   縮むため、卓だけが小さくなって座席がその外へはみ出していた
   (実機で 414×552 になるはずが 414×333 になっていた)。

   そこで、設計寸法のまま描画して、空いている領域に収まる倍率で全体を縮小する。
   中の固定pxも一緒に縮むので、卓・座席・カード・文字の相対関係が設計どおりに保たれる。
   CSSだけでは「幅と高さの両方に収まる倍率」を書けない(zoom に
   min(100cqw/448, 100cqh/597) は渡せない)ため、実測して倍率を出す。 */
const DESIGN_WIDTH = 448;

/** 親(卓に使える領域)の大きさを測る。設計枠の高さと倍率はこの値から決める。 */
function useAvailableSize(ref: React.RefObject<HTMLElement>): { width: number; height: number } {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const apply = (w: number, h: number) => {
      if (w <= 0 || h <= 0) return;
      setSize((prev) => (prev.width === w && prev.height === h ? prev : { width: w, height: h }));
    };
    apply(el.clientWidth, el.clientHeight);
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      apply(entry.contentRect.width, entry.contentRect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

/** 設計枠(448×高さ)が領域に収まる倍率(拡大はしない)。 */
function fitScaleOf(available: { width: number; height: number }, designHeight: number): number {
  if (available.width <= 0 || available.height <= 0) return 1;
  return Math.min(available.width / DESIGN_WIDTH, available.height / designHeight, 1);
}


/** 自分の席(スロット0)は常に画面の下の中央。他の席は 3D と同じカメラで投影した位置に置く。 */
const HERO_SEAT_CLASS = "bottom-0 left-1/2 -translate-x-1/2";

const DEALER_BUTTON_SRC = "/table/dealer_button_v1.png";
const DEALER_BUTTON_SIZE = 28;

/**
 * フェルト上に置かれたディーラーボタン(オーナー支給の画像)。ボタンが移動する卓では
 * ハンドごとに位置が変わるため、layout アニメーションで席から席へ滑らせる
 * (reduced-motion 時は移動アニメーションを切る)。
 */
function DealerButton({ x, y, reduced }: { x: number; y: number; reduced: boolean }) {
  return (
    <motion.div
      // key を固定して同一要素として扱わせることで、位置の変化が layout で補間される(席から席へ滑る)。
      layout={!reduced}
      transition={reduced ? { duration: 0 } : SPRING_MOVE}
      aria-hidden
      // 中心合わせは負のマージンで行う(translate だと layout アニメーションが transform を
      // 上書きするため、移動中だけ半径ぶんズレてしまう)。
      className="pointer-events-none absolute z-20"
      style={{ left: x, top: y, marginLeft: -DEALER_BUTTON_SIZE / 2, marginTop: -DEALER_BUTTON_SIZE / 2 }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={DEALER_BUTTON_SRC}
        alt=""
        width={DEALER_BUTTON_SIZE}
        height={DEALER_BUTTON_SIZE}
        draggable={false}
        className="block select-none rounded-full shadow-e1"
        style={{ width: DEALER_BUTTON_SIZE, height: DEALER_BUTTON_SIZE }}
      />
    </motion.div>
  );
}

function badgeForSeat(params: {
  seatIndex: number;
  seatStatus: string;
  lastActionBySeat: Record<number, SeatAction>;
  lastHandDeltaBySeat: Record<number, number> | null;
  bigBlind: number;
  displayMode: AmountDisplayMode;
  /** この席の今のストリートの拠出と残りスタック。表示する額をこの席が出せる額までに抑える。 */
  streetContribution: number;
  stack: number;
}): SeatBadge | null {
  const { seatIndex, seatStatus, lastActionBySeat, lastHandDeltaBySeat, bigBlind, displayMode, streetContribution, stack } = params;

  // ポットを取ったことは「獲得額」だけで伝える。Won/Lostのような勝敗ラベルは置かない
  // (卓上に英単語の宣言を並べるのは他社アプリの語彙で、Poker ARTの静かな面構えに合わない)。
  // 負けた側にバッジを出さないのも意図的 —— 減った分は自分のスタックが語るので、
  // 卓上に敗北を貼り出す必要はない。
  if (lastHandDeltaBySeat && seatStatus !== "folded" && seatStatus !== "empty") {
    const delta = lastHandDeltaBySeat[seatIndex];
    if (delta && delta > 0) {
      return { text: `Win ! ${formatSignedAmount(delta, bigBlind, displayMode)}`, tone: "win" };
    }
  }

  const action = lastActionBySeat[seatIndex];
  // この席がこのストリートに出せる上限(いま出している額+残りのスタック)。サーバーから届く額は
  // 「コールした相手のベット額」なので、スタックが足りずにオールインでコールした席では、
  // 持っていた額より大きく出てしまう(3000 しか無いのに「Call 5000」)。表示はここで抑える。
  const capOf = (toAmount: number) => Math.min(toAmount, streetContribution + stack);

  // オールインした席は、額が 1BB に満たなくても、コールでオールインになっても、
  // ショーダウン(ハンドの終わり)まで「All In」を赤で出し続ける。ストリートが進んで額が 0 に戻ったら額は書かない。
  if (seatStatus === "allIn" && !lastHandDeltaBySeat) {
    const amount = streetContribution > 0 ? streetContribution : action ? capOf(action.toAmount) : 0;
    return amount > 0
      ? { text: `All In ${formatAmount(amount, bigBlind, displayMode)}`, tone: "raise", chips: true }
      : { text: "All In", tone: "raise" };
  }

  if (action) {
    const bb = formatAmount(capOf(action.toAmount), bigBlind, displayMode);
    switch (action.kind) {
      case "raise":
        return { text: `Raise ${bb}`, tone: "raise", chips: true };
      case "bet":
        return { text: `Bet ${bb}`, tone: "raise", chips: true };
      case "call":
        return { text: `Call ${bb}`, tone: "call", chips: true };
      case "check":
        return { text: "Check", tone: "call" };
      case "fold":
        return { text: "Fold", tone: "fold" };
      case "allIn":
        return { text: `All In ${bb}`, tone: "raise", chips: true };
    }
  }

  return null;
}

/** 3D の卓のボード。縦位置は投影で決めるので top は style で渡す。 */
const BOARD_ROW_3D_CLASS = "absolute inset-x-0 flex justify-center gap-[1.2%] [transform-origin:50%_50%]";

/** 3D の卓での相手の席。レールの上の投影点に席ブロックの中心を合わせ、奥の席ほど少し小さくする。 */
function seatStyle3d(layout: TableLayout, slot: number): CSSProperties {
  const p = layout.seats[slot]!;
  // 遠近どおりに縮めると奥の席の文字が読めなくなるので、縮みは 0.86 で止める。
  const k = Math.max(0.86, Math.min(1, p.depthScale + 0.12));
  // 画面の端からはみ出さないよう、中心を左右の余白の内側に寄せる。
  const x = Math.min(Math.max(p.x, SEAT_EDGE_MARGIN), DESIGN_WIDTH - SEAT_EDGE_MARGIN);
  return { left: x, top: p.y, transform: `translate(-50%, -50%) scale(${k.toFixed(3)})` };
}
/** 相手の席の中心が画面の端に寄れる限界(席ブロックの半分ほどの幅)。 */
const SEAT_EDGE_MARGIN = 46;
const BOARD_CELL_CLASS = "w-[10.5%]";

export function PokerTable({
  state,
  yourSeatIndex,
  yourCards,
  seatCount,
  revealedHoleCards,
  players,
  bigBlind,
  lastActionBySeat,
  lastHandDeltaBySeat,
  showOrder = null,
  equityBySeat = null,
  focusSeat = null,
  turnTimer,
  onPlayerTap,
  markingBySeat,
  hudByUser,
  centerInfo,
  seatBubbles,
  onHeroChatClick,
  heroShowIntent = [false, false],
  onToggleHeroShow,
  displayMode = "bb",
  onToggleDisplayMode,
  heroAside,
  muckedSeats = null,
  outSeats = null,
  waitingRoom = null,
}: {
  state: PublicHandState | null;
  yourSeatIndex: number | null;
  yourCards: string[];
  seatCount: number;
  revealedHoleCards: Record<number, (string | null)[]> | null;
  players: Record<number, SeatPlayerInfo>;
  bigBlind: number;
  lastActionBySeat: Record<number, SeatAction>;
  lastHandDeltaBySeat: Record<number, number> | null;
  /** ショーダウンで手を開く順番(TDA)。この順に 0.6 秒ずつめくる。 */
  showOrder?: number[] | null;
  /** オールインで手札が開いたあとの、いまのボードからの勝率(0〜1)。 */
  equityBySeat?: Record<number, number> | null;
  /** 棋譜解析で、いま解説している決定の席と評価。その席を太い枠で囲む。 */
  focusSeat?: { seatIndex: number; classification: string | null } | null;
  turnTimer: TurnTimerInfo | null;
  /** 相手(自分以外・非BOT)の席タップ時に呼ばれる。プレイヤー詳細モーダルを開く。 */
  onPlayerTap?: (info: SeatPlayerInfo) => void;
  /** 席ごとのマーキング色(HEX)。プレイヤーメモで色付けした相手の席に小さなドットを出す。 */
  markingBySeat?: Record<string, string | null>;
  /** 席の下に出す参加率・レイズ率(userId → 値)。誰の席でも同じ形で出す。 */
  hudByUser?: Record<string, SeatHud>;
  /** 卓の真ん中(ポットの上)に出す大会の情報(次のレベル・平均・入賞・順位など)。 */
  centerInfo?: ReactNode;
  /** 座席ごとの直近チャット吹き出し。 */
  seatBubbles?: Record<number, { text: string; ts: number }>;
  /** 自分の席のチャット入力ボタンを押したとき。 */
  onHeroChatClick?: () => void;
  /** ハンドショウ: 自席の各カード(index 0/1)をハンド終了時に公開する意思がONか。 */
  heroShowIntent?: [boolean, boolean];
  /** ハンドショウ: 自席のカードをタップしたとき(タップしたカードのindexを渡す。意思のトグル)。 */
  onToggleHeroShow?: (cardIndex: number) => void;
  /** 卓上の金額表示モード(bb換算/点数)。ポット/ベット/スタック全てに適用。 */
  displayMode?: AmountDisplayMode;
  /** 自席スタックのタップで表示モードを切り替えるハンドラ。 */
  onToggleDisplayMode?: () => void;
  /** 自席の席ピルの左外に積む補助操作(タイムバンク・離席)。 */
  heroAside?: ReactNode;
  /** ショーダウンで手を見せずにマックした席。 */
  muckedSeats?: ReadonlySet<number> | null;
  /** トーナメントから飛んだ席(「PLAYER OUT」を貼る)。 */
  outSeats?: ReadonlySet<number> | null;
  /**
   * ハンドが始まる前の待合(フレンド対戦)。盤面(state)が無い間、`players` の席を開始スタックで座っている
   * ように描く(手札・ボタン・ポジションは出さない)。
   */
  waitingRoom?: { startingStack: number; bigBlind: number } | null;
}) {
  const { t } = useI18n();
  const reducedMotion = useReducedMotion() ?? false;
  const seatsByIndex = new Map((state?.seats ?? []).map((s) => [s.seatIndex, s]));

  // 自分の席が常に画面下(スロット0)に来るよう、実席番号→表示スロットへ回転させる。
  // MTTでは卓移動により自分の席番号が変わるため、この回転が必須になる。
  // いまの自分の役を作っている5枚(プリフロップは手札2枚)。オレンジ枠で囲む(オーナー指示)。降りたら出さない。
  const heroStatus = yourSeatIndex !== null ? state?.seats?.find((s) => s.seatIndex === yourSeatIndex)?.status : undefined;
  const heroBestFive = new Set(
    yourSeatIndex !== null && yourCards.length >= 2 && heroStatus !== "folded" && heroStatus !== undefined
      ? bestFiveCards(yourCards, (state?.board ?? []).map(cardToString))
      : [],
  );
  // ショーダウンで勝者が決まったら、枠は勝者の5枚(手札+ボード)に移す(オーナー指示)。
  const boardStrs = (state?.board ?? []).map(cardToString);
  const winnerSeat = (() => {
    if (!lastHandDeltaBySeat || boardStrs.length < 5) return null;
    let best: number | null = null;
    for (const [k, v] of Object.entries(lastHandDeltaBySeat)) {
      const seat = Number(k);
      const cards = seat === yourSeatIndex ? yourCards : revealedHoleCards?.[seat];
      if (v > 0 && cards && cards.filter(Boolean).length === 2 && (best === null || v > (lastHandDeltaBySeat[best] ?? 0))) best = seat;
    }
    return best;
  })();
  const winnerFive =
    winnerSeat !== null
      ? new Set(bestFiveCards((winnerSeat === yourSeatIndex ? yourCards : revealedHoleCards?.[winnerSeat]) ?? [], boardStrs))
      : null;
  const boardHighlight = winnerFive ?? heroBestFive;
  // 全員がめくり終わってから「Win !」。
  const winDelay = (showOrder?.length ?? 0) * 0.6;
  const heroSeat = yourSeatIndex ?? 0;
  const displaySlotOf = (seatIndex: number) => (((seatIndex - heroSeat) % seatCount) + seatCount) % seatCount;

  const activeStacks = (state?.seats ?? [])
    .filter((s) => s.status === "active" || s.status === "allIn")
    .map((s) => s.stack + s.streetContribution);
  const effectiveStack = activeStacks.length ? Math.min(...activeStacks) : 0;
  const spr = state && state.potTotal > 0 ? effectiveStack / state.potTotal : null;

  // ポジション名はブラインド位置基準(BTN/SB/BB/UTG...)。ハンド不参加の席はラベルなし。
  const positionLabels = state ? positionLabelsForState(state, seatCount) : null;

  // 卓は設計寸法のまま描き、空いている領域に収まる倍率で全体を縮小する。
  const fitRef = useRef<HTMLDivElement>(null);
  const available = useAvailableSize(fitRef);

  // 卓は常に 3D で描く(2D の卓はオーナー指示 2026-10-30 で廃止)。
  // 空いている領域の縦横比に合わせて設計枠を縦に伸ばす(上下に帯を余らせない)。
  const designHeight = designHeightFor(available.width, available.height);
  const fitScale = fitScaleOf(available, designHeight);
  const layout3d = tableLayout(designHeight);

  // ディーラーボタンはスロットごとの固定の点(geometry.ts の dealer)。実測しないので、ハンドの途中で一切動かない。
  const buttonSlot = state ? displaySlotOf(state.buttonFixedPos) : null;
  const dealerSpot = buttonSlot === null ? null : layout3d.dealer[buttonSlot] ?? null;

  return (
    <div ref={fitRef} className="relative flex h-full w-full items-center justify-center">
      {/* 3D の卓は zoom の箱の外に、同じ実寸で敷く(zoom の中に置くと WebGL が測る寸法と描く寸法がずれる)。 */}
      {(
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{ width: DESIGN_WIDTH * fitScale, height: designHeight * fitScale }}
        >
          <TableScene3D height={designHeight} />
        </div>
      )}
      <div
        className="no-image-actions relative"
        style={{
          width: DESIGN_WIDTH,
          height: designHeight,
          // 縮小には transform ではなく zoom を使う。transform はレイアウト上の寸法を変えないので、
          // 箱は 448×597 のまま親をはみ出し、flex の中央寄せが効かなくなる。zoom は寸法ごと縮む。
          // (なお zoom が合成の文脈を作るかはエンジンによって違う。以前は「作らない」前提で
          //  卓画像の mix-blend-mode を効かせていたが、WebKit では作るため実機で破綻した。
          //  今は画像側にアルファを持たせていて合成に依存しないので、この差は無害。)
          zoom: fitScale,
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
      {/* 大会の情報(アップルデザインの試作に合わせてポットの上に置く。オーナー指示 v1.25.0)。 */}
      {centerInfo && (
        <div
          className="pointer-events-none absolute inset-x-0 flex justify-center"
          style={{ top: layout3d.pot.y, transform: "translateY(calc(-100% - 22px))" }}
        >
          {centerInfo}
        </div>
      )}

      {/* ポット表示: 3D の卓の投影で決めた位置に置く。
          カード面で統一。ポットが増減するたびにキーが変わり、軽く跳ねて更新される。
          表示するのは「確定済み」のポット(collectedPot)のみ — 現在のストリートのベットは
          各席の前に置かれたまま、ストリートが締まった瞬間にここへ移動する(実卓と同じ挙動)。 */}
      <div
        className="absolute inset-x-0 flex flex-col items-center gap-1 -translate-y-1/2"
        style={{ top: layout3d.pot.y }}
      >
        {/* 実測の邪魔もの判定は中身(ポット表示)の大きさで行う(行全体の幅ではなく)。 */}
        <AnimatePresence mode="popLayout">
          {state && state.collectedPot > 0 && (
            <motion.div
              key={state.collectedPot}
              initial={{ opacity: 0, y: -6, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={SPRING_SNAPPY}
              data-table-obstacle
              className="flex items-center gap-2 rounded-full bg-surface border border-line-strong pl-3 pr-3.5 py-1.5 shadow-e0"
            >
              {/* サイドポットがある間は、この枠が「合計」であることを明示する
                  (内訳のメイン枠と取り違えて「計算がおかしい」と見えないように)。 */}
              <span className="text-[9.5px] font-black tracking-[0.08em] text-n-9 uppercase">
                {state.pots.length > 1 ? "合計" : "Pot"}
              </span>
              <span className="text-[16px] font-black tracking-[-0.01em] text-fg tabular-nums leading-none">{formatAmount(state.collectedPot, bigBlind, displayMode)}</span>
              {spr !== null && (
                <span className="text-[11px] font-bold text-fg-2 tabular-nums leading-none border-l border-line pl-2">
                  SPR {spr.toFixed(1)}
                </span>
              )}
            </motion.div>
          )}
        </AnimatePresence>
        {/* サイドポットの内訳(オールインが絡み2本以上に分かれたときだけ表示)。
            合計のPOT枠と同じ意匠(カード面+輪郭+くすんだラベル/明るい太字の金額)の枠を1ポットにつき
            1つ並べる。ラベルと金額を書体・色で明確に分離し、「サイド1 2bb」が「サイド12bb」に
            読めてしまう誤読を防ぐ。 */}
        {state && state.pots.length > 1 && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-wrap justify-center gap-1"
          >
            {state.pots.map((pot, i) => (
              <span
                key={i}
                className="flex items-center gap-1.5 rounded-full bg-surface border border-line-strong px-2.5 py-1 shadow-e0"
              >
                <span className="text-[9.5px] font-black text-n-9">
                  {i === 0 ? "メイン" : `サイド ${i}`}
                </span>
                <span className="text-[12px] font-black text-fg tabular-nums leading-none">
                  {formatAmount(pot.amount, bigBlind, displayMode)}
                </span>
              </span>
            ))}
          </motion.div>
        )}
      </div>

      {/* 3D の卓では、ボードを卓面に寝かせて見せる(カメラの見下ろし角の6割。全部寝かせると数字が読みにくい)。
          空きスロットの破線枠も同じ箱の中に描き、配られたカードと枠が必ず重なるようにする。 */}
      <div
        className={BOARD_ROW_3D_CLASS}
        style={{
          top: layout3d.board.y,
          transform: `translateY(-50%) perspective(720px) rotateX(${(layout3d.boardTiltDeg * 0.6).toFixed(1)}deg) scale(${layout3d.board.depthScale.toFixed(3)})`,
        }}
      >
        {Array.from({ length: 5 }).map((_, i) => {
          const card = state?.board[i];
          return (
            <div key={i} className={BOARD_CELL_CLASS} data-table-obstacle={card ? true : undefined}>
              {card ? (
                <PlayingCard card={cardToString(card)} size="board" dealDelay={i * 0.06} highlight={boardHighlight.has(cardToString(card))} />
              ) : (
                <div aria-hidden className="aspect-[744/1039] w-full rounded-[6px] border border-dashed border-white/[0.16]" />
              )}
            </div>
          );
        })}
      </div>

      {/* ディーラーボタン: プレイヤーではなく、その席の前のフェルト上に置く(実卓と同じ扱い)。
          座席の描画とは独立させているので、表示名の長さや席ピルの幅に一切影響されない。 */}
      {state && dealerSpot && <DealerButton x={dealerSpot.x} y={dealerSpot.y} reduced={reducedMotion} />}

      {/* 全座席(スロット0=自分が常に下) */}
      {Array.from({ length: seatCount }).map((_, seatIndex) => {
        const slot = displaySlotOf(seatIndex);
        const isHero = yourSeatIndex !== null && seatIndex === yourSeatIndex;
        if (slot === 0 && !isHero && yourSeatIndex !== null) return null;
        const seat = seatsByIndex.get(seatIndex);
        const player = players[seatIndex];
        const waiting = !state && waitingRoom && player;
        const status = seat?.status ?? (waiting ? "active" : "empty");
        if (!player && !seat) return null;
        const revealed = revealedHoleCards?.[seatIndex];
        const timerForSeat =
          turnTimer && turnTimer.seatIndex === seatIndex && state?.actingSeatIndex === seatIndex
            ? {
                endsAt: turnTimer.endsAt,
                durationMs: turnTimer.durationMs,
                timeBank: turnTimer.timeBank === true,
              }
            : null;

        // 相手(自分以外)の席はタップで詳細モーダルを開ける。BOT/未ログイン相手でも
        // モーダル側で「統計なし」を出せるよう、ここではisBot/userIdでゲートしない
        // (タップしても何も起きない、という不具合を防ぐ)。
        const tappable = Boolean(!isHero && player && onPlayerTap);
        const markingColor = player?.userId ? markingBySeat?.[player.userId] ?? null : null;

        // 自分の席は、現在成立している役(ハンドランク)を手札の直下に表示する。
        const heroHandLabel =
          isHero && yourCards.length >= 2 && status !== "folded" && status !== "empty"
            ? ((k) => (k ? t(k) : null))(describeMadeHand(yourCards, (state?.board ?? []).map(cardToString)))
            : null;

        // ショーダウンで相手の手が開いたら、その手札の下にも役を出す(オーナー指示)。
        const oppHandLabel =
          !isHero && revealed && revealed.filter(Boolean).length === 2 && boardStrs.length >= 3
            ? ((k) => (k ? t(k) : null))(describeMadeHand(revealed, boardStrs))
            : null;
        // ハンドショウ: 相手席はrevealedHoleCardsに含まれれば(フォールド公開含む)裏返す。
        // 自席は「フォールド後もショウ意思(どちらかのカード)があれば自分の画面にも表示」する
        // (演出はしない)。
        const seatRevealed = Boolean(revealedHoleCards?.[seatIndex]);
        const shown = isHero ? (heroShowIntent[0] || heroShowIntent[1]) && status === "folded" : seatRevealed;
        // 自席かつハンド進行中(フォールド前後どちらでも可)はカードを1枚ずつタップしてショウを
        // トグルできる。
        const canToggleShow =
          isHero && Boolean(onToggleHeroShow) && Boolean(state) && !state!.isComplete && status !== "empty";

        const seatNode = (
          <Seat
            hud={player?.userId ? hudByUser?.[player.userId] ?? null : null}
            handRankLabel={heroHandLabel ?? oppHandLabel}
            highlightCards={winnerFive ? (seatIndex === winnerSeat ? winnerFive : null) : heroHandLabel ? heroBestFive : null}
            revealDelay={showOrder && showOrder.indexOf(seatIndex) >= 0 ? showOrder.indexOf(seatIndex) * 0.6 : 0}
            winDelay={winDelay}
            equity={status !== "folded" ? equityBySeat?.[seatIndex] ?? null : null}
            equityOnLeft={slot === 4 || slot === 5}
            focus={focusSeat && focusSeat.seatIndex === seatIndex ? { classification: focusSeat.classification } : null}
            shown={shown}
            mucked={muckedSeats?.has(seatIndex) ?? false}
            out={outSeats?.has(seatIndex) ?? false}
            heroShowArmed={isHero ? heroShowIntent : undefined}
            onCardTap={canToggleShow ? onToggleHeroShow : undefined}
            name={player?.displayName ?? (isHero ? "YOU" : `Seat ${seatIndex + 1}`)}
            avatarKey={player?.avatarKey ?? null}
            frame={player?.frame ?? null}
            markingColor={markingColor}
            chatBubble={seatBubbles?.[seatIndex]?.text ?? null}
            onChatClick={isHero ? onHeroChatClick : undefined}
            position={positionLabels?.get(seatIndex) ?? ""}
            stack={seat?.stack ?? (waiting ? waitingRoom.startingStack : 0)}
            streetContribution={seat?.streetContribution ?? 0}
            bigBlind={waiting ? waitingRoom.bigBlind : bigBlind}
            status={status}
            isActingSeat={state?.actingSeatIndex === seatIndex}
            isHero={isHero}
            holeCards={waiting ? [] : isHero ? (yourCards.length ? yourCards : [null, null]) : revealed ? revealed : [null, null]}
            revealCards={isHero || Boolean(revealed)}
            timer={timerForSeat}
            size={isHero ? "lg" : "sm"}
            away={player?.away ?? false}
            displayMode={displayMode}
            onStackTap={isHero ? onToggleDisplayMode : undefined}
            aside={isHero ? heroAside : undefined}
            badge={badgeForSeat({
              seatIndex,
              seatStatus: status,
              lastActionBySeat,
              lastHandDeltaBySeat,
              bigBlind,
              displayMode,
              streetContribution: seat?.streetContribution ?? 0,
              stack: seat?.stack ?? 0,
            })}
          />
        );

        return (
          <div
            key={seatIndex}
            data-seat-slot={slot}
            data-table-obstacle
            className={`absolute ${slot === 0 ? HERO_SEAT_CLASS : ""}`}
            style={slot !== 0 ? seatStyle3d(layout3d, slot) : undefined}
          >
            {tappable && player ? (
              <button
                type="button"
                onClick={() => onPlayerTap?.(player)}
                className="cursor-pointer appearance-none bg-transparent p-0 pressable"
                aria-label={t("seat.detailAria", { name: player.displayName })}
              >
                {seatNode}
              </button>
            ) : (
              seatNode
            )}
          </div>
        );
      })}
      </div>
    </div>
  );
}
