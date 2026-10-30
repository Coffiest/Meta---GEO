"use client";

import { formatEquity } from "@/lib/runoutEquity";
import type { ReactNode } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { SPRING_MOVE, SPRING_SNAPPY, SPRING_THROW } from "@/lib/motion";

/** オールインマーカーの画像。原画 public/table/allin_marker_source.png から scripts/table-markers.py で書き出した版。 */
const ALLIN_MARKER_SRC = "/table/allin_marker_v1.png";
import { PlayingCard } from "./PlayingCard";
import { Avatar } from "./Avatar";
import { formatAmount, formatBb, formatChips, type AmountDisplayMode } from "@/lib/format";

/**
 * 席ピル用のスタック表記。100bb以上は小数を落として桁を詰める。
 * 席ピルは席の幅(w-24)に収める必要があり、"148.8bb" の1桁が隣席との重なりを生むため。
 * 点数(chips)モードでは素の点数を表示する(100万点以上だけ "1.2M" に丸めて幅を守る)。
 */
function compactStack(stack: number, bigBlind: number, mode: AmountDisplayMode): string {
  // 点数表示は全部の桁を出す(オーナー指示)。名札が桁に合わせて広がるので、はみ出さない。
  if (mode === "chips") return formatChips(stack);
  if (!bigBlind) return "0bb";
  const bb = stack / bigBlind;
  // 10bb以上は小数を落とす。深いスタックで0.1bbの差を読む場面は無く、
  // 桁が1つ増えるだけで席ピルが隣席へはみ出す。10bb未満はプッシュ判断に効くので残す。
  if (bb >= 10) return `${Math.round(bb)}bb`;
  return formatBb(stack, bigBlind);
}
import { useI18n } from "@/lib/i18n";
import { Icon } from "./Icon";

/** 席の下に出す参加率・レイズ率(0〜1)。 */
export interface SeatHud {
  vpip: number;
  pfr: number;
}

/** 卓上バッジの種別。敗北を宣言するトーンは持たない(負けはスタックが語る)。 */
export type SeatBadgeTone = "raise" | "call" | "fold" | "win";

export interface SeatBadge {
  text: string;
  tone: SeatBadgeTone;
  /** チップを出すアクション(ベット/レイズ/コール/オールイン)か。出すときはチップのアイコンを添える。 */
  chips?: boolean;
}

/** チップを出すアイコン。原画 public/table/chip_bet_source.png から scripts/table-markers.py で書き出した版。 */
const CHIP_BET_ICON_SRC = "/table/chip_bet_v1.png";

/**
 * 金額の左に添えるチップのアイコン(装飾。読み上げは金額の文字で足りる)。
 * アイコンはティール1色なので、緑(コール)や赤(レイズ)のバッジの上でも沈まないよう、暗い円盤に載せる。
 */
function ChipIcon({ size }: { size: number }) {
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full bg-n-0/80"
      style={{ width: size, height: size }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={CHIP_BET_ICON_SRC}
        alt=""
        draggable={false}
        className="select-none"
        style={{ width: Math.round(size * 0.74), height: Math.round(size * 0.74) }}
      />
    </span>
  );
}

/**
 * ハンドショウ/ショウダウンで公開されるカードの「ペラッ」めくり演出。
 * 3Dの Y軸回転で、伏せた裏面(前面)→表面(背面)へ半回転して表を見せる。
 * reduced-motion 時やカード未確定時は演出せず、そのまま表示する。
 */
function FlipRevealCard({ card, size, delay, highlight = false }: { card?: string; size: "sm" | "xl"; delay: number; highlight?: boolean }) {
  const reduced = useReducedMotion();
  if (reduced || !card) {
    return <PlayingCard card={card} faceDown={!card} size={size} highlight={highlight} />;
  }
  return (
    <div style={{ perspective: 700 }}>
      <motion.div
        className="relative"
        style={{ transformStyle: "preserve-3d" }}
        initial={{ rotateY: 0 }}
        animate={{ rotateY: 180 }}
        transition={{ duration: 0.5, delay, ease: [0.2, 0.7, 0.25, 1] }}
      >
        {/* 前面: 裏面(めくり始めに見えている面) */}
        <div style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}>
          <PlayingCard faceDown size={size} />
        </div>
        {/* 背面: 表面(半回転しきると見える面) */}
        <div
          className="absolute inset-0"
          style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
        >
          <PlayingCard card={card} size={size} highlight={highlight} />
        </div>
      </motion.div>
    </div>
  );
}

/**
 * 卓上バッジの配色。プレイヤーが行ったアクションは色で意味を分ける(オーナー指示により、
 * 一度無彩色へ統一したものを元の配色へ戻した)。輪郭(ring-line-strong)は全バッジ共通で、
 * アプリの面構えを保ったまま塗りだけを色分けする。ActionBar のボタン配色と同じ言語:
 *  - コール/チェックはミント(応答)
 *  - ベット/レイズ/オールインはクリムゾン(強い意思表示)
 *  - ポット獲得はアクセント(卓上で唯一の"結果"の色。アクションではないので据え置き)
 *  - フォールドは輪郭も文字も落として静かに引く
 */
const BADGE_TONE_CLASS: Record<SeatBadgeTone, string> = {
  win: "bg-accent text-on-accent ring-accent/30 shadow-glow",
  // 塗りの濃さは「暗地でバッジ自体が3:1以上」かつ「その上の白文字が4.5:1以上」を
  // 同時に満たす段を選んである(明るくすると文字が、暗くするとバッジが読めなくなる)。
  raise: "bg-crimson-600 text-white ring-line-strong",
  call: "bg-mint-700 text-white ring-line-strong",
  fold: "bg-surface text-fg-3 ring-line",
};

export interface SeatViewProps {
  name: string;
  avatarKey: string | null;
  /** High Roller / Super High Roller の資格者のアイコン枠。 */
  frame?: "silver" | "gold" | null;
  position: string;
  stack: number;
  streetContribution: number;
  bigBlind: number;
  status: "active" | "folded" | "allIn" | "empty";
  isActingSeat: boolean;
  isHero: boolean;
  holeCards: (string | null)[];
  revealCards: boolean;
  badge?: SeatBadge | null;
  /** 手番の残り時間(アバター周囲のリングで表示)。この席がアクティブなときだけ渡す。 */
  timer?: { endsAt: number; durationMs: number; timeBank?: boolean } | null;
  size?: "sm" | "lg";
  /** 離席中(自分・他プレイヤー双方に表示)。 */
  away?: boolean;
  /** プレイヤーメモのマーキング色(HEX)。設定時はアバター右上に小さなドットを出す。 */
  markingColor?: string | null;
  /** 同卓チャットの直近吹き出し(数秒表示)。 */
  chatBubble?: string | null;
  /** 自分の席のとき、カード右側にチャット入力ボタンを出すためのハンドラ。 */
  onChatClick?: () => void;
  /** 自分の席のとき、現在成立している役(例: 「ツーペア」)を手札の直下に表示する。 */
  handRankLabel?: string | null;
  /** いまの役を作っているカード(オレンジ枠を付ける)。 */
  highlightCards?: ReadonlySet<string> | null;
  /** ショーダウンでこの席の手をめくり始めるまでの秒数(TDA の順番。0.6 秒ずつ)。 */
  revealDelay?: number;
  /** 勝ちの「Win !」を出すまでの秒数(全員がめくり終わってから)。 */
  winDelay?: number;
  /** ハンドショウで公開された席。フォールド済みでも手札を表示し、相手席なら裏返る演出を再生する。 */
  shown?: boolean;
  /** 自席のハンドショウ意思。カードごとに独立してON/OFFできる(index 0/1に対応)。 */
  heroShowArmed?: [boolean, boolean];
  /** 自席のカードをタップしたとき(タップしたカードのindexを渡す。ハンドショウのトグル)。 */
  onCardTap?: (cardIndex: number) => void;
  /** 卓上の金額表示モード(bb換算/点数)。 */
  displayMode?: AmountDisplayMode;
  /** 自席のスタック表示をタップしたとき(bb/点数の切り替え)。自席にだけ渡す。 */
  onStackTap?: () => void;
  /** 席ピルの左外に積む補助操作(タイムバンク・離席)。自席にだけ渡す。 */
  aside?: ReactNode;
  /** ショーダウンで手を見せずに捨てた(マックした)。手札の上に「Muck」を出す。 */
  mucked?: boolean;
  /** トーナメントから飛んだ(スタックが0になった)。席ピルの上に「PLAYER OUT」を貼る。誰の席でも同じ条件・同じ見た目。 */
  out?: boolean;
  /** オールインのランアウト中の勝率(0〜1)。ピルの右横に出す。誰の席でも同じ条件・同じ見た目。 */
  equity?: number | null;
  /** 卓の右側の席は、勝率を名前の左横に出す(右横だと画面の外へはみ出す)。 */
  equityOnLeft?: boolean;
  /** 名札の下段に出す参加率・レイズ率。誰の席でも同じ見た目。 */
  hud?: SeatHud | null;
}

export function Seat({
  name,
  avatarKey,
  frame,
  position,
  stack,
  streetContribution,
  bigBlind,
  status,
  isActingSeat,
  isHero,
  holeCards,
  revealCards,
  badge,
  timer,
  size = "sm",
  away = false,
  markingColor = null,
  chatBubble = null,
  onChatClick,
  handRankLabel = null,
  highlightCards = null,
  revealDelay = 0,
  winDelay = 0,
  shown = false,
  heroShowArmed,
  onCardTap,
  displayMode = "bb",
  onStackTap,
  aside = null,
  mucked = false,
  out = false,
  equity = null,
  equityOnLeft = false,
  hud = null,
}: SeatViewProps) {
  const { t } = useI18n();
  const reducedMotion = useReducedMotion();
  const isEmpty = status === "empty";
  const folded = status === "folded";
  // フォールドした席は通常伏せカードごと表示しないが、ハンドショウで公開された席は表示する。
  const showCards = !isEmpty && (!folded || shown);

  return (
    <div
      /* フォールドした席を薄くするのは「誰がこのハンドから降りたか」を一目で伝えるため。
         ただし自席だけは薄くしない ―― 自席の左外にはタイムバンク/チェック・フォールドの
         予約トグル(aside)が乗っており、これは「次の手番」に効かせる操作なので、降りている間こそ
         触りたい。CSSのopacityは子孫側で打ち消せないため、ここで薄くすると必ずトグルまで
         道連れになり、手番以外は常に暗くて押せなさそうに見えていた(ユーザー報告)。
         自分が降りたことは手札が伏せられることとアクションバーの表示で既に分かるので、
         自席を薄くする必要はない。 */
      className={`relative flex flex-col items-center gap-1 transition-opacity duration-300 ${size === "lg" ? "w-32" : "w-24"} ${
        folded && !isHero ? "opacity-55" : "opacity-100"
      }`}
    >
      {/* 同卓チャットの吹き出し。自分の手札の真上にふわっと浮かせ、尻尾(菱形)を下=手札方向へ。
          黒縁ではなくヘアライン+柔らかいドロップシャドウでApple的な浮遊感を出す。数秒表示。 */}
      <AnimatePresence>
        {chatBubble && !isEmpty && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.9, x: "-50%" }}
            animate={{ opacity: 1, y: 0, scale: 1, x: "-50%" }}
            exit={{ opacity: 0, scale: 0.9, x: "-50%" }}
            transition={SPRING_SNAPPY}
            className="pointer-events-none absolute bottom-full left-1/2 z-40 mb-2 w-max max-w-[170px] break-words rounded-[14px] border border-line-strong/[0.06] bg-surface/80 px-3 py-1.5 text-center text-[12px] font-semibold leading-[1.35] text-fg backdrop-blur-[6px] shadow-e3"
          >
            {chatBubble}
            {/* 尻尾: 本体と同じ白の菱形を回転して縁取り2辺+影で自然に接続する */}
            <span
              aria-hidden
              className="absolute left-1/2 top-full -mt-1.5 h-3 w-3 -translate-x-1/2 rotate-45 rounded-br-[3px] border-b border-r border-line-strong/[0.06] bg-surface/80"
              style={{ boxShadow: "4px 4px 8px -4px rgba(3,18,17,0.24)" }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {(() => {
        const cardSize = size === "lg" ? "xl" : "sm";
        const anyArmed = Boolean(heroShowArmed?.[0] || heroShowArmed?.[1]);
        return (
          // オールインしている間は、手札が鼓動で震えるように小刻みに揺れる(オーナー指示。
          // 出典: uiverse.io by xbeat_5120 の glitch。CSS は globals.css の .allin-tremble)。
          <div className={`relative z-30 flex gap-1 ${status === "allIn" && showCards ? "allin-tremble" : ""}`}>
            {showCards &&
              holeCards.map((c, i) => {
                if (shown && !isHero) {
                  // 相手席のハンドショウ/ショウダウン公開: 裏面→表面の「ペラッ」フリップ。
                  return <FlipRevealCard key={i} card={c ?? undefined} size={cardSize} delay={revealDelay + i * 0.05} highlight={!!c && !!highlightCards?.has(c)} />;
                }
                if (isHero && onCardTap) {
                  // 自席はカード1枚ずつ個別にタップしてハンドショウをトグルできる(2枚同時ではなく、
                  // タップした方だけを終了時に公開する)。armed中はカードの縁が光る
                  // (出典: uiverse.io by ElSombrero2。原案は:hoverで光るが、この光りは
                  // 「ONの間ずっと効いている予約」を表すものなので、押した瞬間だけの
                  // フィードバックではなくdata-on属性で駆動する)。
                  const armed = heroShowArmed?.[i] ?? false;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => onCardTap(i)}
                      aria-label={armed ? "このカードのショウを取り消す" : "このカードをショウする"}
                      aria-pressed={armed}
                      data-on={armed}
                      className="hero-card-slot appearance-none bg-transparent p-0 pressable"
                    >
                      <PlayingCard
                        card={revealCards ? c ?? undefined : undefined}
                        faceDown={!revealCards}
                        size={cardSize}
                        dealDelay={i * 0.05}
                        highlight={!!c && !!highlightCards?.has(c)}
                      />
                    </button>
                  );
                }
                return (
                  <PlayingCard
                    key={i}
                    card={revealCards ? c ?? undefined : undefined}
                    faceDown={!revealCards}
                    size={cardSize}
                    dealDelay={i * 0.05}
                    highlight={!!c && !!highlightCards?.has(c)}
                  />
                );
              })}
            {/* ショーダウンでマックした手: 手札の上に「Muck」。手を見せなかったことを卓の全員に示す。 */}
            {mucked && showCards && (
              <motion.span
                initial={{ opacity: 0, y: 4, x: "-50%" }}
                animate={{ opacity: 1, y: 0, x: "-50%" }}
                transition={SPRING_SNAPPY}
                className="pointer-events-none absolute -top-2.5 left-1/2 z-40 rounded-full bg-n-4 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-white shadow-e1 ring-1 ring-canvas"
              >
                {t("seat.muck")}
              </motion.span>
            )}
            {/* ハンドショウ意思ON(どちらか1枚でも): 押した本人にだけ分かる目のアイコンをカード束の
                右上に重ねる(相手には何も伝わらない ― 意思は終了時にまとめて公開される)。 */}
            {anyArmed && showCards && (
              <motion.span
                aria-hidden
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                className="pointer-events-none absolute -top-1.5 -right-1.5 z-40 flex h-5 w-5 items-center justify-center rounded-full bg-n-4 text-white ring-2 ring-canvas"
              >
                <Icon name="eye" className="h-3 w-3" />
              </motion.span>
            )}
          </div>
        );
      })()}

      {/* 自分の現在の役(手札の直下)。ボードが進むたびに更新される。 */}
      {handRankLabel && showCards && (
        <motion.div
          key={handRankLabel}
          initial={{ opacity: 0, y: -3, scale: 0.92 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ ...SPRING_SNAPPY, delay: isHero ? 0 : revealDelay + 0.5 }}
          className="z-30 -mt-0.5 rounded-full bg-n-4 px-2.5 py-0.5 text-[10px] font-black tracking-wide text-white shadow-e1"
        >
          {handRankLabel}
        </motion.div>
      )}

      {/* 名前+スタックの識別ピル。中身の自然幅に任せると、表示名やスタック桁数によっては
          席の枠(w-24/w-32)を左右にはみ出し、テーブルが小さい端末で隣席のピルと重なって
          読めなくなる。max-w-full で必ず席の幅に収め、あふれる分は表示名を削る。 */}
      {/* 手番の席は少し大きく。ばね(SPRING_SNAPPY)で動かすので、手番がすぐ移っても途中から戻る。 */}
      <motion.div
        animate={{ scale: isActingSeat && !reducedMotion ? 1.06 : 1 }}
        transition={SPRING_SNAPPY}
        className={`relative flex flex-col items-center ${isActingSeat ? "z-10" : ""}`}
      >
        {/* 手番の席の拡散リング。手番中ずっと回り続けるアニメーションなので、JS(framer-motion)ではなく
            CSSキーフレームで動かす(コンポジタで完結し、端末の発熱を抑える)。 */}

        {/* タイムバンク使用の告知。誰の席でも同じ条件・同じ見た目で出す
            (出方に差があると、それ自体が相手の種別を推測する手掛かりになってしまう)。
            アイコンは使わず、金色のピルに文字だけを載せる。 */}
        {isActingSeat && timer?.timeBank && (
          // 中央寄せ(-translate-x-1/2)とアニメーションを同じ要素に置くと、キーフレームの
          // transform が中央寄せを打ち消してしまう。外側で位置決め、内側でアニメーションする。
          <span className="pointer-events-none absolute -top-3 left-1/2 z-40 -translate-x-1/2">
            <span
              role="status"
              className="block animate-time-bank-badge whitespace-nowrap rounded-full bg-accent px-2 py-[2px] text-[9px] font-black uppercase tracking-[0.1em] text-on-accent shadow-e1"
            >
              {t("seat.timeBankUsed")}
            </span>
          </span>
        )}

        {/* オールインのランアウト中の勝率。ボードが開くたびに書き換わる。 */}
        {equity != null && (
          <motion.span
            key={formatEquity(equity)}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={SPRING_SNAPPY}
            data-table-obstacle
            className={`pointer-events-none absolute top-1/2 z-40 -translate-y-1/2 ${equityOnLeft ? "right-full mr-1" : "left-full ml-1"} rounded-full bg-canvas/90 px-1.5 py-0.5 text-[12px] font-black tabular-nums text-accent shadow-e1 ring-1 ring-accent/60`}
          >
            {formatEquity(equity)}
          </motion.span>
        )}

        {/* 飛んだ席に貼る「PLAYER OUT」のスタンプ(オーナー指示。ピルの上から斜めに押す)。 */}
        <AnimatePresence>
          {out && (
            <motion.span
              aria-label="PLAYER OUT"
              initial={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 1.8, rotate: -14 }}
              animate={{ opacity: 1, scale: 1, rotate: -8 }}
              exit={{ opacity: 0 }}
              transition={{ type: "spring", bounce: 0.35, duration: 0.35 }}
              className="pointer-events-none absolute inset-x-[-6px] top-1/2 z-50 -mt-[11px] flex h-[22px] items-center justify-center whitespace-nowrap rounded-md border-2 border-crimson-300 bg-canvas/90 text-[11px] font-black uppercase tracking-[0.12em] text-crimson-300 shadow-e2"
            >
              Player Out
            </motion.span>
          )}
        </AnimatePresence>

        {/* オールインマーカー(オーナー支給の画像)。オールインした席のピルの左上に置き、ハンドが終わるまで残す。
            誰の席でも同じ条件・同じ見た目。画像は scripts/table-markers.py で台紙を透過・縮小した版。 */}
        <AnimatePresence>
          {status === "allIn" && (
            <motion.img
              key="allin-marker"
              src={ALLIN_MARKER_SRC}
              alt="All in"
              draggable={false}
              initial={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.4, y: -8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.6 }}
              transition={SPRING_THROW}
              className="pointer-events-none absolute -left-4 -top-6 z-30 select-none drop-shadow-[0_1px_2px_rgb(0_0_0/0.6)]"
              style={{ width: size === "lg" ? 42 : 32 }}
            />
          )}
        </AnimatePresence>

        {/* 自分の席: 席ピルの左外に、タイムバンクと離席のトグルを縦に積む。
            以前はアクションバーに専用の行を持っていたが、その1行(36px)がそのまま卓の
            大きさを削っていた。自分だけに関わる補助操作なので、自分の席の横が本来の居場所。
            右外のチャットボタンと対称の位置になる。 */}
        {aside && (
          <div data-table-obstacle className="absolute right-full top-1/2 z-40 mr-1.5 flex -translate-y-1/2 flex-col items-end gap-1">
            {aside}
          </div>
        )}

        {/* 自分の席: カード右側の丸いチャット入力ボタン。 */}
        {onChatClick && (
          <button
            type="button"
            onClick={onChatClick}
            aria-label={t("seat.chat")}
            className="absolute left-full top-1/2 z-40 ml-1.5 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full glass-panel text-n-10 transition-transform pressable"
          >
            <Icon name="chat" className="h-3.5 w-3.5" />
          </button>
        )}
        {!isEmpty && (
          <>
            {/* アップルデザインの試作に合わせた形(オーナー指示 v1.23.0): 丸い顔の下に、すりガラスの名札を少し重ねる。
                手番の席は、顔の残り時間の輪に加えて、ティールの光をにじませる。 */}
            <div className={`relative z-20 rounded-full ${isActingSeat ? "shadow-glow" : "shadow-e3"}`}>
              <div className="relative z-10">
                <Avatar
                  avatarKey={avatarKey}
                  displayName={name}
                  size={size === "lg" ? 46 : 36}
                  timer={isActingSeat ? timer : null}
                  frame={frame ?? null}
                />
              </div>
              {/* ポジションは顔の左上に重ねる白いピル(下は名札と重なるため)。 */}
              {position && (
                <span className="absolute -left-2 top-0 z-20 whitespace-nowrap rounded-full bg-fg px-[5px] text-[9px] font-black leading-[13px] text-canvas ring-[1.5px] ring-canvas">
                  {position}
                </span>
              )}
              {markingColor && (
                <span
                  aria-hidden
                  className="absolute -top-0.5 -right-0.5 z-20 h-3 w-3 rounded-full ring-[1.5px] ring-canvas"
                  style={{ backgroundColor: markingColor }}
                />
              )}
            </div>
            {/* 名札。幅は席の幅を下限に、中身(点数表示の桁)に合わせて広がる。点数表示に切り替えても数字が枠からはみ出さない(オーナー指示)。 */}
            <div
              className={`relative -mt-2 flex min-w-full flex-col items-center whitespace-nowrap rounded-[14px] px-2 pb-1.5 pt-2.5 text-center transition-[box-shadow] duration-200 ${
                folded ? "bg-surface/80 border border-line-strong/30" : "glass-panel"
              } ${isActingSeat ? "ring-1 ring-accent/60" : ""}`}
            >
              {/* 名前は小さく控えめに、スタックはいちばん大きく太く(卓で最も読む数字)。 */}
              <div className={`${size === "lg" ? "text-[12px] max-w-[104px]" : "text-[10.5px] max-w-[84px]"} font-medium leading-tight truncate text-fg-2`}>
                {name}
              </div>
              {(() => {
                const label = compactStack(stack, bigBlind, displayMode);
                // 点数表示で桁が多いときだけ一段小さくして、席の幅に収める。
                const cls = `${size === "lg" ? "text-[16px]" : "text-[14px]"} block font-black leading-none tracking-[-0.02em] text-fg tabular-nums`;
                return onStackTap ? (
                  // 自席のスタックはタップでbb表示⇄点数表示を切り替えられる(卓上の全金額に反映)。
                  <button
                    type="button"
                    onClick={onStackTap}
                    aria-label={displayMode === "chips" ? "bb表示に切り替える" : "点数表示に切り替える"}
                    className={`${cls} mt-[2px] appearance-none rounded bg-transparent p-0 underline decoration-fg-faint decoration-dotted underline-offset-2 pressable`}
                  >
                    {label}
                  </button>
                ) : (
                  <span className={`${cls} mt-[2px]`}>{label}</span>
                );
              })()}
              {hud && (
                <div className="mt-1 flex gap-1.5 text-[9px] font-semibold leading-none tabular-nums text-fg-3">
                  <span>
                    VPIP <span className="text-fg-2">{Math.round(hud.vpip * 100)}</span>
                  </span>
                  <span>
                    PFR <span className="text-fg-2">{Math.round(hud.pfr * 100)}</span>
                  </span>
                </div>
              )}
              {away && status !== "allIn" && (
                <div className="flex items-center gap-1 text-[9px] font-bold text-fg-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-n-5" />
                  {t("seat.away")}
                </div>
              )}
            </div>
          </>
        )}
      </motion.div>

      {/* バッジ/ベット額表示の行。どちらも出ない瞬間(フォールド直後で街道コントリビューションが
          0、かつ直近アクションバッジも無いとき)に高さ0へ潰れないよう、min-hで場所を確保しておく。
          潰れると、名前ピルがこの席ブロックの最下端になり(このアプリの外側は無いので)、名前ピル
          を基準に配置している自席横のトグル(タイムバンク・チェック/フォールド予約)の中心が
          卓の下端(y=597)を超えて、<main>のoverflow-hiddenで下端が欠けて見える不具合があった。 */}
      <div className="min-h-[23px]">
        <AnimatePresence mode="popLayout">
          {badge && !isEmpty ? (
            <motion.div
              key={`badge-${badge.tone}-${badge.text}`}
              // ポット獲得は「結果」なので、アクションより一段大きく、下から浮き上がって収まる。
              initial={reducedMotion ? { opacity: 0 } : badge.tone === "win" ? { opacity: 0, scale: 0.4, y: 10 } : { opacity: 0, scale: 0.5, y: -4 }}
              animate={{ opacity: 1, scale: badge.tone === "win" ? 1.08 : 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.5 }}
              transition={badge.tone === "win" ? { ...SPRING_MOVE, delay: winDelay } : SPRING_SNAPPY}
              className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full py-1 text-[12px] font-bold tabular-nums ring-2 ${badge.chips ? "pl-1 pr-3" : "px-3"} ${BADGE_TONE_CLASS[badge.tone]}`}
            >
              {badge.chips && <ChipIcon size={18} />}
              {badge.text}
            </motion.div>
          ) : (
            streetContribution > 0 &&
            !isEmpty && (
              <motion.div
                key="contribution"
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.6 }}
                className="inline-flex items-center gap-1 whitespace-nowrap rounded-full glass-panel py-0.5 pl-0.5 pr-2.5 text-[12px] font-bold text-fg tabular-nums"
              >
                <ChipIcon size={17} />
                {formatAmount(streetContribution, bigBlind, displayMode)}
              </motion.div>
            )
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
