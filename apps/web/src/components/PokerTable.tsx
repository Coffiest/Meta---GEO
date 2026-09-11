"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
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

/** 親の大きさを測り、設計寸法が収まる倍率を返す(拡大はしない)。 */
function useFitScale(ref: React.RefObject<HTMLElement>): number {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const apply = (w: number, h: number) => {
      if (w <= 0 || h <= 0) return;
      setScale(Math.min(w / DESIGN_WIDTH, h / DESIGN_HEIGHT, 1));
    };
    apply(el.clientWidth, el.clientHeight);
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      apply(entry.contentRect.width, entry.contentRect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return scale;
}

const FELT_BOX = "inset-x-[18%] top-[10%] bottom-[18%]";

// 画像内のロゴ帯(上部 約5-31%)・破線カードスロット帯(約44-56%)・ワードマーク/下部ロゴ帯
// (約59-78%)を実測し、それに合わせた「表示スロット」配置。スロット0=常に自分(画面下)。
const SEAT_LAYOUT: Record<number, string> = {
  0: "bottom-0 left-1/2 -translate-x-1/2",
  1: "top-[55%] left-[4%]",
  2: "top-[17%] left-[7%]",
  3: "top-[2%] left-1/2 -translate-x-1/2",
  4: "top-[17%] right-[7%]",
  5: "top-[55%] right-[4%]",
};

/**
 * ディーラーボタンの置き場所(表示スロットごと)。実卓と同じように、プレイヤーに貼り付けるのではなく
 * 「その席の前のフェルト上」に置く。
 *
 * フェルトは FELT_BOX のとおりコンテナ内 x:18〜82% / y:10〜82% の楕円(中心 50%,46% / 半径 32%,36%)。
 * 以前は「画像のロゴ帯・カードスロット帯・ワードマーク帯を避ける」ことを優先しすぎて、
 * 各席の実際の位置(SEAT_LAYOUT)からかなり離れてしまい、特に自席(スロット0)は卓中央寄りに
 * 浮いて見え「誰の前のボタンか分かりにくい」という指摘を受けた。SEAT_LAYOUTのアンカーから
 * 卓中心へごくわずかだけ寄せた座標(各席の目の前、卓の意匠帯は避けつつ最短距離)に引き直してある。
 */
const DEALER_BUTTON_LAYOUT: Record<number, string> = {
  0: "top-[77%] left-[60%]",
  1: "top-[57%] left-[23%]",
  2: "top-[28%] left-[25%]",
  3: "top-[16%] left-[56%]",
  // 左右は left-% の鏡像で指定する(right-% と混在させると中心合わせのマージン分だけ左右非対称になる)。
  4: "top-[28%] left-[75%]",
  5: "top-[57%] left-[77%]",
};

/**
 * フェルト上に置かれたディーラーボタン。実物のボタン(白い樹脂ディスクに"D"の刻印)に寄せつつ、
 * アクセント色の輪郭+発光で「今どこにあるか」を目で追いやすくした(卓の意匠は無彩色なので、
 * このアプリで唯一のアクセント色の物体として卓上で浮き上がる)。ボタンが移動する卓では
 * ハンドごとに位置が変わるため、layout アニメーションで席から席へ滑らせる
 * (reduced-motion 時は移動アニメーションを切る)。
 */
function DealerButton({ slot, reduced }: { slot: number; reduced: boolean }) {
  return (
    <motion.div
      // key を固定して同一要素として扱わせることで、position の変化が layout で補間される。
      layout={!reduced}
      transition={reduced ? { duration: 0 } : SPRING_MOVE}
      aria-hidden
      // 中心合わせは負のマージンで行う(translate だと layout アニメーションが transform を
      // 上書きするため、移動中だけ半径ぶんズレてしまう)。
      className={`pointer-events-none absolute z-20 -ml-[12px] -mt-[12px] ${DEALER_BUTTON_LAYOUT[slot]}`}
    >
      <span
        className="flex h-[24px] w-[24px] items-center justify-center rounded-full border-[1.5px] border-accent bg-surface shadow-e1"
        style={{ boxShadow: "0 0 0 3px rgba(38,194,163,0.18), 0 0 8px 1px rgba(38,194,163,0.35)" }}
      >
        <span className="flex h-[16px] w-[16px] items-center justify-center rounded-full border border-accent/50 text-[9px] font-black leading-none text-accent">
          D
        </span>
      </span>
    </motion.div>
  );
}

/* 卓画像。黒地に白い輪郭で描かれた、暗い背景に置く前提の絵(1024×1536 = 2:3)。
   比率が table_v2.png と同じなので、座席・ボード・ポットの%配置は再調整不要。

   読むのは支給された `table_v3.png` そのものではなく、そこから生成した透過版
   (`scripts/table-alpha.py`)。支給ファイルは黒地が不透明なまま残してある。 */
const TABLE_IMAGE_SRC = "/table/table_v3_alpha.png";

/**
 * 卓面。卓画像を卓の形そのものとして描画する。
 *
 * 支給画像はアルファを持たない**不透明な黒い台紙**なので、そのまま重ねると星空の上に
 * 黒い長方形が乗る。以前は `mix-blend-mode: screen`(黒を透過として扱う)で消していたが、
 * **実機の WebKit では効かなかった**。mix-blend-mode は同じ合成の文脈の中の背面としか
 * 混ざらないところ、卓を縮小している `zoom` の箱が WebKit では文脈を作ってしまい、
 * 合成の相手が星空ではなく「何も無い箱の中」になっていたため(Blink の標準化後の zoom は
 * 文脈を作らないので Chromium では消えており、それで見落とした)。
 *
 * 合成に頼るのをやめ、同じ結果を画像のアルファへ焼き込んである。無彩色の画素では
 * アルファ合成の結果は screen 合成と数学的に一致する(実測の差は丸めの 1/255 のみ)。
 * これでブラウザごとの合成の違いに一切依存しなくなった。**この img に
 * `mix-blend-mode` を足し直さないこと。**
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
        return { text: `Raise ${bb}`, tone: "raise" };
      case "bet":
        return { text: `Bet ${bb}`, tone: "raise" };
      case "call":
        return { text: `Call ${bb}`, tone: "call" };
      case "check":
        return { text: "Check", tone: "call" };
      case "fold":
        return { text: "Fold", tone: "fold" };
      case "allIn":
        return { text: `All In ${bb}`, tone: "raise" };
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
const BOARD_ROW_CLASS = "absolute inset-x-0 top-[42.5%] flex justify-center gap-[1.16%]";
const BOARD_CELL_CLASS = "w-[8.1%]";

/**
 * オールインが発生した瞬間に一度だけ走る、テーブル全体の電撃バースト演出。
 * 既存のアバター電撃リング(Seat.AllInElectric)と同じシアン〜白のエレクトリック言語で統一し、
 * 「テーブル外周の青白フラッシュ」+「中央のALL INワードマーク」+「走る稲妻ライン」を重ねる。
 * pointer-events-none で操作は透過。reduced-motion 時は静かなフェードのみに落とす。
 */
function AllInBurst({ reduced }: { reduced: boolean }) {
  if (reduced) {
    return (
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 0] }}
        transition={{ duration: 1.1, times: [0, 0.25, 1] }}
      >
        <span
          className="font-black italic tracking-[0.08em] text-white text-[54px]"
          style={{ textShadow: "0 0 16px rgba(56,189,248,0.9), 0 0 3px #fff" }}
        >
          ALL IN
        </span>
      </motion.div>
    );
  }
  return (
    <motion.div aria-hidden className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
      {/* テーブル外周の青白フラッシュ(内側シャドウ) */}
      <motion.div
        className="absolute inset-0 rounded-[46%]"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 0.45, 0] }}
        transition={{ duration: 1.3, times: [0, 0.12, 0.5, 1], ease: "easeOut" }}
        style={{ boxShadow: "inset 0 0 70px 14px rgba(56,189,248,0.75), inset 0 0 22px 2px rgba(255,255,255,0.55)" }}
      />
      {/* 中央から広がるリングパルス */}
      <motion.div
        className="absolute left-1/2 top-1/2 rounded-full"
        style={{ width: 40, height: 40, border: "2px solid rgba(191,240,255,0.9)", boxShadow: "0 0 18px rgba(56,189,248,0.8)" }}
        initial={{ opacity: 0.9, scale: 0.4, x: "-50%", y: "-50%" }}
        animate={{ opacity: 0, scale: 9 }}
        transition={{ duration: 0.9, ease: "easeOut" }}
      />
      {/* 中央のALL INワードマーク */}
      <motion.div
        className="absolute inset-0 flex items-center justify-center"
        initial={{ opacity: 0, scale: 0.55 }}
        animate={{ opacity: [0, 1, 1, 0], scale: [0.55, 1.12, 1, 1.06] }}
        transition={{ duration: 1.35, times: [0, 0.18, 0.72, 1], ease: [0.22, 1, 0.36, 1] }}
      >
        <span
          className="font-black italic tracking-[0.06em] text-white leading-none whitespace-nowrap"
          style={{
            fontSize: "clamp(44px, 15vw, 84px)",
            textShadow: "0 0 22px rgba(56,189,248,0.95), 0 0 6px rgba(255,255,255,0.9), 0 2px 0 rgba(37,99,235,0.6)",
          }}
        >
          ALL IN
        </span>
      </motion.div>
    </motion.div>
  );
}

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
  heroShowIntent = false,
  onToggleHeroShow,
  displayMode = "bb",
  onToggleDisplayMode,
  heroAside,
}: {
  state: PublicHandState | null;
  yourSeatIndex: number | null;
  yourCards: string[];
  seatCount: number;
  revealedHoleCards: Record<number, string[]> | null;
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
  /** ハンドショウ: 自席のカードをハンド終了時に公開する意思がONか。 */
  heroShowIntent?: boolean;
  /** ハンドショウ: 自席のカードをタップしたとき(意思のトグル)。 */
  onToggleHeroShow?: () => void;
  /** 卓上の金額表示モード(bb換算/点数)。ポット/ベット/スタック全てに適用。 */
  displayMode?: AmountDisplayMode;
  /** 自席スタックのタップで表示モードを切り替えるハンドラ。 */
  onToggleDisplayMode?: () => void;
  /** 自席の席ピルの左外に積む補助操作(タイムバンク・離席)。 */
  heroAside?: ReactNode;
}) {
  const { t } = useI18n();
  const reducedMotion = useReducedMotion() ?? false;
  const seatsByIndex = new Map((state?.seats ?? []).map((s) => [s.seatIndex, s]));

  // オールインの瞬間を検知して、一度だけテーブル全体の電撃バーストを出す。
  // lastActionBySeat はハンド中「直近アクション」を保持し続けるため、オールインの
  // 署名(席:額)が新しく変わったときだけ発火し、同じオールインで再発火しないようにする。
  const [allInFxId, setAllInFxId] = useState<number | null>(null);
  const lastAllInSig = useRef<string>("");
  const fxSeq = useRef(0);
  useEffect(() => {
    const sig = Object.entries(lastActionBySeat)
      .filter(([, a]) => a.kind === "allIn")
      .map(([i, a]) => `${i}:${a.toAmount}`)
      .sort()
      .join("|");
    if (!sig) {
      lastAllInSig.current = "";
      return;
    }
    if (sig === lastAllInSig.current) return;
    lastAllInSig.current = sig;
    fxSeq.current += 1;
    const id = fxSeq.current;
    setAllInFxId(id);
    const timer = setTimeout(() => setAllInFxId((cur) => (cur === id ? null : cur)), 1500);
    return () => clearTimeout(timer);
  }, [lastActionBySeat]);

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
  const fitScale = useFitScale(fitRef);

  return (
    <div ref={fitRef} className="relative flex h-full w-full items-center justify-center">
      <div
        className="no-image-actions relative"
        style={{
          width: DESIGN_WIDTH,
          height: DESIGN_HEIGHT,
          // 縮小には transform ではなく zoom を使う。transform はレイアウト上の寸法を変えないので、
          // 箱は 448×597 のまま親をはみ出し、flex の中央寄せが効かなくなる。zoom は寸法ごと縮む。
          // (なお zoom が合成の文脈を作るかはエンジンによって違う。以前は「作らない」前提で
          //  卓画像の mix-blend-mode を効かせていたが、WebKit では作るため実機で破綻した。
          //  今は画像側にアルファを持たせていて合成に依存しないので、この差は無害。)
          zoom: fitScale,
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
      <TableFelt />

      {/* ポット表示: felt.png内の水平破線(画像内 約32-35%)のあたりに合わせてある。
          カード面で統一。ポットが増減するたびにキーが変わり、軽く跳ねて更新される。
          表示するのは「確定済み」のポット(collectedPot)のみ — 現在のストリートのベットは
          各席の前に置かれたまま、ストリートが締まった瞬間にここへ移動する(実卓と同じ挙動)。 */}
      <div className="absolute inset-x-0 top-[33%] flex flex-col items-center gap-1">
        <AnimatePresence mode="popLayout">
          {state && state.collectedPot > 0 && (
            <motion.div
              key={state.collectedPot}
              initial={{ opacity: 0, y: -6, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={SPRING_SNAPPY}
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
      <div className={BOARD_ROW_CLASS}>
        {Array.from({ length: 5 }).map((_, i) => {
          const card = state?.board[i];
          return (
            <div key={i} className={BOARD_CELL_CLASS}>
              {card && <PlayingCard card={cardToString(card)} size="board" dealDelay={i * 0.06} />}
            </div>
          );
        })}
      </div>

      {/* ディーラーボタン: プレイヤーではなく、その席の前のフェルト上に置く(実卓と同じ扱い)。
          座席の描画とは独立させているので、表示名の長さや席ピルの幅に一切影響されない。 */}
      {state && <DealerButton slot={displaySlotOf(state.buttonFixedPos)} reduced={reducedMotion} />}

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
        // 自席は「フォールド後もショウ意思があれば自分の画面にも表示」する(演出はしない)。
        const seatRevealed = Boolean(revealedHoleCards?.[seatIndex]);
        const shown = isHero ? heroShowIntent && status === "folded" : seatRevealed;
        // 自席かつハンド進行中(フォールド前後どちらでも可)はカードをタップしてショウをトグルできる。
        const canToggleShow =
          isHero && Boolean(onToggleHeroShow) && Boolean(state) && !state!.isComplete && status !== "empty";

        const seatNode = (
          <Seat
            handRankLabel={heroHandLabel}
            shown={shown}
            showEyeIcon={isHero && heroShowIntent}
            onCardsTap={canToggleShow ? onToggleHeroShow : undefined}
            name={player?.displayName ?? (isHero ? "YOU" : `Seat ${seatIndex + 1}`)}
            avatarKey={player?.avatarKey ?? null}
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
          <div key={seatIndex} className={`absolute ${SEAT_LAYOUT[slot]}`}>
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

      {/* オールイン瞬間の電撃バースト(既存のアバター電撃リングと調和・操作は透過) */}
      <AnimatePresence>
        {allInFxId !== null && <AllInBurst key={allInFxId} reduced={reducedMotion} />}
      </AnimatePresence>
      </div>
    </div>
  );
}
