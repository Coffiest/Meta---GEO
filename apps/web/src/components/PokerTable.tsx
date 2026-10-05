"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { SPRING_MOVE, SPRING_SNAPPY } from "@/lib/motion";
import type { PublicHandState } from "@meta-geo/engine";
// deck.ts(node:crypto に依存)を含むバレル経由だとブラウザバンドルが壊れるため、
// cardToString は依存の少ないサブモジュールから直接インポートする。
import { cardToString } from "@meta-geo/engine/src/types/card.js";
import { describeMadeHand } from "@/lib/handRank";
import { useI18n } from "@/lib/i18n";
import { PlayingCard } from "./PlayingCard";
import { Seat, type SeatBadge } from "./Seat";
import { positionLabelsForState } from "@/lib/position";
import { formatAmount, formatSignedAmount, type AmountDisplayMode } from "@/lib/format";
import type { SeatAction, SeatPlayerInfo, TurnTimerInfo } from "@/lib/socket";
import { designHeightFor, tableLayout, type TableLayout } from "./table3d/geometry";

// 3D の卓(three.js)は重いので、卓画面に来たときだけ読み込む。
const TableScene3D = dynamic(() => import("./table3d/TableScene3D"), { ssr: false });

/** WebGL が使えるか(使えなければ 2D の卓画像に戻す)。 */
function supportsWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    return false;
  }
}

// felt.png(スーパー楕円デザイン、幅:高さ = 1000:1500 = 2:3)の実ピクセルを解析し、
// 外枠のコンテナがその比率と正確に一致するよう算出してある(18%/10%/18% → 幅64%:高さ72% → 2:3)。
// 一致させることで、画像自体の形がそのままテーブルの形になり、余白や別枠のクロップが生じない。
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
const DESIGN_HEIGHT = 597; // 448 * 4 / 3

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

/* 卓画像の箱。以前は x 18〜82% / y 10〜82% に収めていて、スマホでは卓が画面幅の6割ほどしか使えず
   左右が大きく余っていた(オーナー指摘)。画像は 2:3 のまま(縦横比は変えない)、設計枠いっぱいまで
   大きくし、席の名前プレートは卓の縁(レール)の上に載せる。object-contain なので、実際の卓は
   この箱の高さで決まり、幅 x 約7〜93% に中央寄せで描かれる。 */
const FELT_BOX = "inset-x-[2%] top-[1.5%] bottom-[1.5%]";

// 画像内のロゴ帯(上部 約5-31%)・破線カードスロット帯(約44-56%)・ワードマーク/下部ロゴ帯
// (約59-78%)を実測し、それに合わせた「表示スロット」配置。スロット0=常に自分(画面下)。
const SEAT_LAYOUT: Record<number, string> = {
  0: "bottom-0 left-1/2 -translate-x-1/2",
  1: "top-[50%] left-0",
  2: "top-[15%] left-0",
  3: "top-0 left-1/2 -translate-x-1/2",
  4: "top-[15%] right-0",
  5: "top-[50%] right-0",
};

/**
 * ディーラーボタンの置き場所は、固定の座標ではなく**描いたあとに実測して決める**。
 *
 * 以前は表示スロットごとの固定%(設計枠で実測した値)で置いていたが、名前プレートの幅は
 * 表示名の長さで変わり、実機では BTN の席の名前プレートや手札にボタンが重なっていた(オーナー指摘)。
 * 固定値では「絶対に被らない」は保証できないので、次の手順で毎回求める(`findDealerSpot`)。
 *
 * 1. BTN の席(席ブロック=手札+名前プレート+ベット表示)の中心から、卓の中心へ向かう直線をたどる
 * 2. ボタンの円(余白込み)が、どの席ブロック・自席の補助トグル・ポット・ボード・ベット表示とも
 *    重ならない最初の点に置く(邪魔なものは `data-table-obstacle` を付けた要素)
 * 3. 直線上に空きが無ければ、左右に少しずらした直線も試す
 *
 * 座標は設計枠(448×597)の px。卓全体は zoom で縮むので、実測値を倍率で割って設計枠に戻す。
 */
const DEALER_BUTTON_GAP = 6;

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function overlaps(a: Box, b: Box): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

/** ディーラーボタンの中心(設計枠の px)。置ける場所が見つからなければ null。純関数(テスト可能)。 */
export function findDealerSpot(params: {
  anchor: Box;
  obstacles: readonly Box[];
  center: { x: number; y: number };
  radius: number;
  bounds: { width: number; height: number };
}): { x: number; y: number } | null {
  const { anchor, obstacles, center, radius, bounds } = params;
  const start = { x: (anchor.left + anchor.right) / 2, y: (anchor.top + anchor.bottom) / 2 };
  const dx = center.x - start.x;
  const dy = center.y - start.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const r = radius + DEALER_BUTTON_GAP;
  // 正面の直線を最優先にし、だめなら少しずつ横へずらした直線を試す。
  for (const side of [0, 18, -18, 36, -36, 54, -54]) {
    const ox = -uy * side;
    const oy = ux * side;
    for (let t = 0; t <= len; t += 2) {
      const x = start.x + ux * t + ox;
      const y = start.y + uy * t + oy;
      const box = { left: x - r, top: y - r, right: x + r, bottom: y + r };
      if (box.left < 0 || box.top < 0 || box.right > bounds.width || box.bottom > bounds.height) continue;
      if (obstacles.some((o) => overlaps(box, o))) continue;
      return { x, y };
    }
  }
  return null;
}

/** ディーラーボタンの画像。オーナー支給の原画(`public/table/dealer_button_source.png`)から
 *  `scripts/table-markers.py` で書き出した版(円の外の台紙を透過・縮小)。原画を差し替えたら再実行する。 */
const DEALER_BUTTON_SRC = "/table/dealer_button_v1.png";
/** 表示の直径(px)。刻印の「DEALER」が読める大きさ。 */
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

/* 卓画像。黒地に白い輪郭で描かれた、暗い背景に置く前提の絵(1024×1536 = 2:3)。
   比率が table_v2.png と同じなので、座席・ボード・ポットの%配置は再調整不要。

   読むのは支給された `table_v3.png` そのものではなく、そこから生成した版
   (`scripts/table-alpha.py`)。支給ファイルは黒地が不透明なまま残してある。 */
const TABLE_IMAGE_SRC = "/table/table_v3_filled.png";

/**
 * 卓面。卓画像を卓の形そのものとして描画する。
 *
 * 画像は2段階の加工を焼き込んである(どちらも `scripts/table-alpha.py`)。
 *
 * 1. **黒地 → 透明。** 支給画像はアルファを持たない不透明な黒い台紙なので、そのまま
 *    重ねると背景の上に黒い長方形が乗る。以前は `mix-blend-mode: screen`(黒を透過として
 *    扱う)で消していたが、**実機の WebKit では効かなかった**。mix-blend-mode は同じ
 *    合成の文脈の中の背面としか混ざらないところ、卓を縮小している `zoom` の箱が WebKit では
 *    文脈を作ってしまい、合成の相手が背景ではなく「何も無い箱の中」になっていたため
 *    (Blink の標準化後の zoom は文脈を作らないので Chromium では消えており、見落とした)。
 *    合成に頼るのをやめ、同じ結果をアルファへ焼き込んである。**この img に
 *    `mix-blend-mode` を足し直さないこと。**
 * 2. **卓の内部を不透明な #3A3A3C(旧 `--n-4`。背景を暗くした後も卓の内部はこの灰色のまま)で塗りつぶし。** 内部が透明のままだと、
 *    背景のサーキット基板グリッド(`.circuit-bg-grid`)が卓を突き抜けて見えてしまう。
 *    CSSで裏に面を敷くのでは駄目で、卓はスーパー楕円(角を強く丸めた長方形)なので
 *    `border-radius` では同じ形にならず、縁からはみ出すか隙間が空く。画像から導けば
 *    形は定義上ぴったり一致する。
 */
function TableFelt() {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const showFrame = failed || !loaded;

  // ブラウザキャッシュ済みの画像は、Reactがonloadリスナーを付ける前にloadイベントが
  // 発火してしまい、onLoadが一生呼ばれないことがある。マウント時にcompleteを直接確認する。
  useEffect(() => {
    if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) {
      setLoaded(true);
    }
  }, []);

  return (
    <div
      className={`absolute ${FELT_BOX} overflow-hidden transition-[border-radius,box-shadow] duration-300 ${
        showFrame ? "rounded-[46%] bg-surface ring-[1.5px] ring-line-strong" : ""
      }`}
    >
      {!failed && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={imgRef}
          src={TABLE_IMAGE_SRC}
          alt=""
          draggable={false}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full object-contain transition-opacity duration-300"
          style={{ opacity: loaded ? 1 : 0 }}
        />
      )}
    </div>
  );
}

function badgeForSeat(params: {
  seatIndex: number;
  seatStatus: string;
  lastActionBySeat: Record<number, SeatAction>;
  lastHandDeltaBySeat: Record<number, number> | null;
  bigBlind: number;
  displayMode: AmountDisplayMode;
}): SeatBadge | null {
  const { seatIndex, seatStatus, lastActionBySeat, lastHandDeltaBySeat, bigBlind, displayMode } = params;

  // ポットを取ったことは「獲得額」だけで伝える。Won/Lostのような勝敗ラベルは置かない
  // (卓上に英単語の宣言を並べるのは他社アプリの語彙で、Poker ARTの静かな面構えに合わない)。
  // 負けた側にバッジを出さないのも意図的 —— 減った分は自分のスタックが語るので、
  // 卓上に敗北を貼り出す必要はない。
  if (lastHandDeltaBySeat && seatStatus !== "folded" && seatStatus !== "empty") {
    const delta = lastHandDeltaBySeat[seatIndex];
    if (delta && delta > 0) {
      return { text: formatSignedAmount(delta, bigBlind, displayMode), tone: "win" };
    }
  }

  const action = lastActionBySeat[seatIndex];
  if (action) {
    const bb = formatAmount(action.toAmount, bigBlind, displayMode);
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

/*
 * ボードのコミュニティカード欄: felt.png内の5つの破線カードスロットの実ピクセル位置を
 * 解析して合わせてある。
 *  - スロット群のbbox(画像内): x=14.7〜85.2%, y=43.9〜58.3%
 *  - コンテナ換算: 帯の幅 = 70.5% × 64%(felt幅) = 45.1%、1スロット幅 = 12.65% × 64% ≒ 8.1%
 *  - スロット間ギャップ = 1.8125% × 64% ≒ 1.16%
 *  - 縦中心 = 10% + 51.1% × 72%(felt高) ≒ 46.8% → カード上端 ≒ 42.5%
 */
const BOARD_ROW_CLASS = "absolute inset-x-0 top-[40%] flex justify-center gap-[1.2%]";
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
  turnTimer,
  onPlayerTap,
  markingBySeat,
  seatBubbles,
  onHeroChatClick,
  heroShowIntent = [false, false],
  onToggleHeroShow,
  displayMode = "bb",
  onToggleDisplayMode,
  heroAside,
  view3d = true,
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
  turnTimer: TurnTimerInfo | null;
  /** 相手(自分以外・非BOT)の席タップ時に呼ばれる。プレイヤー詳細モーダルを開く。 */
  onPlayerTap?: (info: SeatPlayerInfo) => void;
  /** 席ごとのマーキング色(HEX)。プレイヤーメモで色付けした相手の席に小さなドットを出す。 */
  markingBySeat?: Record<string, string | null>;
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
  /** 卓を 3D で描くか(設定の「卓の表示」)。WebGL が使えない端末では 2D に戻す。 */
  view3d?: boolean;
}) {
  const { t } = useI18n();
  const reducedMotion = useReducedMotion() ?? false;
  const seatsByIndex = new Map((state?.seats ?? []).map((s) => [s.seatIndex, s]));

  // 自分の席が常に画面下(スロット0)に来るよう、実席番号→表示スロットへ回転させる。
  // MTTでは卓移動により自分の席番号が変わるため、この回転が必須になる。
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

  // 3D の卓。WebGL が使えるかはマウント後にしか分からないので、分かるまでは 3D の配置で何も描かない
  // (2D の卓画像を一瞬出してから切り替わる、というちらつきを避ける)。
  const [webgl, setWebgl] = useState<boolean | null>(null);
  useEffect(() => setWebgl(supportsWebGL()), []);
  const use3d = view3d && webgl !== false;
  // 3D の卓は、空いている領域の縦横比に合わせて設計枠を縦に伸ばす(上下に帯を余らせない)。
  // 2D の卓画像は比率が固定なので 597 のまま。
  const designHeight = use3d ? designHeightFor(available.width, available.height) : DESIGN_HEIGHT;
  const fitScale = fitScaleOf(available, designHeight);
  const layout3d = use3d ? tableLayout(designHeight) : null;

  // ディーラーボタンの位置は描いたあとに実測して決める(findDealerSpot の説明を参照)。
  const designRef = useRef<HTMLDivElement>(null);
  const [measuredSpot, setMeasuredSpot] = useState<{ slot: number; x: number; y: number } | null>(null);
  const buttonSlot = state ? displaySlotOf(state.buttonFixedPos) : null;
  // 3D の卓: スロットごとの固定の点(geometry.ts の dealer)。実測しないので、ハンドの途中で一切動かない。
  // 2D の卓: ボタンの席が変わったときに1回だけ実測し、そのハンドの間は固定する。
  // (以前は描画のたびに測り直していて、誰かが降りて「Fold」が出るとボタンが跳ねていた。オーナー指摘)
  const dealerSpot =
    buttonSlot === null
      ? null
      : layout3d
        ? layout3d.dealer[buttonSlot] ?? null
        : measuredSpot && measuredSpot.slot === buttonSlot
          ? measuredSpot
          : null;
  useLayoutEffect(() => {
    const root = designRef.current;
    if (!root || buttonSlot === null || layout3d) return;
    if (measuredSpot && measuredSpot.slot === buttonSlot) return;
    const measure = () => {
      const rootRect = root.getBoundingClientRect();
      if (rootRect.width <= 0) return;
      const k = rootRect.width / DESIGN_WIDTH;
      const toDesign = (r: DOMRect): Box => ({
        left: (r.left - rootRect.left) / k,
        top: (r.top - rootRect.top) / k,
        right: (r.right - rootRect.left) / k,
        bottom: (r.bottom - rootRect.top) / k,
      });
      const anchorEl = root.querySelector<HTMLElement>(`[data-seat-slot="${buttonSlot}"]`);
      if (!anchorEl) return;
      const obstacles = [...root.querySelectorAll<HTMLElement>("[data-table-obstacle]")]
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.height > 0)
        .map(toDesign);
      const spot = findDealerSpot({
        anchor: toDesign(anchorEl.getBoundingClientRect()),
        obstacles,
        center: { x: DESIGN_WIDTH / 2, y: DESIGN_HEIGHT * 0.5 },
        radius: DEALER_BUTTON_SIZE / 2,
        bounds: { width: DESIGN_WIDTH, height: DESIGN_HEIGHT },
      });
      if (spot) setMeasuredSpot({ slot: buttonSlot, x: spot.x, y: spot.y });
    };
    measure();
  });

  return (
    <div ref={fitRef} className="relative flex h-full w-full items-center justify-center">
      {/* 3D の卓は zoom の箱の外に、同じ実寸で敷く(zoom の中に置くと WebGL が測る寸法と描く寸法がずれる)。 */}
      {use3d && webgl && (
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{ width: DESIGN_WIDTH * fitScale, height: designHeight * fitScale }}
        >
          <TableScene3D height={designHeight} />
        </div>
      )}
      <div
        ref={designRef}
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
      {!use3d && <TableFelt />}

      {/* ポット表示: felt.png内の水平破線(画像内 約32-35%)のあたりに合わせてある。
          カード面で統一。ポットが増減するたびにキーが変わり、軽く跳ねて更新される。
          表示するのは「確定済み」のポット(collectedPot)のみ — 現在のストリートのベットは
          各席の前に置かれたまま、ストリートが締まった瞬間にここへ移動する(実卓と同じ挙動)。 */}
      <div
        className={`absolute inset-x-0 flex flex-col items-center gap-1 ${layout3d ? "-translate-y-1/2" : "top-[31%]"}`}
        style={layout3d ? { top: layout3d.pot.y } : undefined}
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
                  (内訳のメイン枠と取り違えて「計算がおかしい」と見えないように)。
                  左のドットは進行中のハンドであることを示す小さな「オンライン」点滅
                  (Header.tsxのterm-ledと同じ意匠)。 */}
              <span className="flex items-center gap-1 text-[8px] font-black tracking-[0.22em] text-n-9 uppercase">
                <span className="term-led" aria-hidden="true" />
                {state.pots.length > 1 ? "合計" : "Pot"}
              </span>
              <span className="text-[13px] font-black text-fg tabular-nums leading-none">{formatAmount(state.collectedPot, bigBlind, displayMode)}</span>
              {spr !== null && (
                <span className="text-[10px] font-bold text-n-9 tabular-nums leading-none border-l border-line pl-2">
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
                <span className="text-[8px] font-black tracking-[0.18em] text-n-9">
                  {i === 0 ? "メイン" : `サイド ${i}`}
                </span>
                <span className="text-[11px] font-black text-fg tabular-nums leading-none">
                  {formatAmount(pot.amount, bigBlind, displayMode)}
                </span>
              </span>
            ))}
          </motion.div>
        )}
      </div>

      {/* コミュニティカード。空きスロットはfelt.png自体に描かれた破線枠が見えるので何も描かない */}
      {/* 3D の卓では、ボードを卓面に寝かせて見せる(カメラの見下ろし角の6割。全部寝かせると数字が読みにくい)。
          空きスロットの破線枠も同じ箱の中に描き、配られたカードと枠が必ず重なるようにする。 */}
      <div
        className={layout3d ? BOARD_ROW_3D_CLASS : BOARD_ROW_CLASS}
        style={
          layout3d
            ? {
                top: layout3d.board.y,
                transform: `translateY(-50%) perspective(720px) rotateX(${(layout3d.boardTiltDeg * 0.6).toFixed(1)}deg) scale(${layout3d.board.depthScale.toFixed(3)})`,
              }
            : undefined
        }
      >
        {Array.from({ length: 5 }).map((_, i) => {
          const card = state?.board[i];
          return (
            <div key={i} className={BOARD_CELL_CLASS} data-table-obstacle={card ? true : undefined}>
              {card ? (
                <PlayingCard card={cardToString(card)} size="board" dealDelay={i * 0.06} />
              ) : (
                layout3d && <div aria-hidden className="aspect-[744/1039] w-full rounded-[6px] border border-dashed border-white/[0.16]" />
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
        const status = seat?.status ?? "empty";
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
            handRankLabel={heroHandLabel}
            shown={shown}
            heroShowArmed={isHero ? heroShowIntent : undefined}
            onCardTap={canToggleShow ? onToggleHeroShow : undefined}
            name={player?.displayName ?? (isHero ? "YOU" : `Seat ${seatIndex + 1}`)}
            avatarKey={player?.avatarKey ?? null}
            frame={player?.frame ?? null}
            markingColor={markingColor}
            chatBubble={seatBubbles?.[seatIndex]?.text ?? null}
            onChatClick={isHero ? onHeroChatClick : undefined}
            position={positionLabels?.get(seatIndex) ?? ""}
            stack={seat?.stack ?? 0}
            streetContribution={seat?.streetContribution ?? 0}
            bigBlind={bigBlind}
            status={status}
            isActingSeat={state?.actingSeatIndex === seatIndex}
            isHero={isHero}
            holeCards={isHero ? (yourCards.length ? yourCards : [null, null]) : revealed ? revealed : [null, null]}
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
            })}
          />
        );

        return (
          <div
            key={seatIndex}
            data-seat-slot={slot}
            data-table-obstacle
            className={`absolute ${layout3d && slot !== 0 ? "" : SEAT_LAYOUT[slot]}`}
            style={layout3d && slot !== 0 ? seatStyle3d(layout3d, slot) : undefined}
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
