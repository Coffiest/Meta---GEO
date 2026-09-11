"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import type { GameKey } from "@/lib/socket";
import { SPRING_MOVE, SPRING_SHEET } from "@/lib/motion";
import { APP_VERSION } from "@/lib/version";
import { useI18n } from "@/lib/i18n";
import { Avatar } from "./Avatar";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { HamburgerIcon, Header, HeaderIconButton, HeaderLogo } from "./Header";
import { Footer } from "./Footer";
import { SideNav } from "./SideNav";
import { Icon } from "./Icon";
import { PlayingCard } from "./PlayingCard";
import { PasscodeModal } from "./PasscodeModal";
import { GAME_TYPE_LABEL, RRRatingCard, RuleLabel, displayRating, type RRRatingData, type TournamentHistoryPoint } from "./RRRatingCard";
import { RRPokerPromoBanner } from "./RRPokerPromoBanner";
import { InviteCard } from "./InviteCard";
import { CouponWallet } from "./CouponWallet";
import { PlayerDetailModal } from "./PlayerDetailModal";
import { PushOptInCard } from "./PushOptInCard";
import { ChartSkeleton, ListSkeleton } from "./Skeleton";
import { SegmentedTabs } from "./ui/SegmentedTabs";
import { EmptyState } from "./EmptyState";
import { TournamentReviewModal } from "./review/TournamentReviewModal";
import { useCountUp } from "@/lib/useCountUp";
import { SpotlightCard } from "./effects/SpotlightCard";

interface PlayerStats {
  tournamentsPlayed: number;
  itmCount: number;
  itmRate: number;
  totalBuyIns: number;
  totalPayouts: number;
  profit: number;
  /** 得た金額÷かけた金額(150%なら1.5倍で返ってきたという意味) */
  roi: number;
  nationalRank: number | null;
  totalRankedPlayers: number;
  vpipCount: number;
  vpipOpportunities: number;
  vpipRate: number;
  pfrCount: number;
  pfrOpportunities: number;
  pfrRate: number;
  threeBetCount: number;
  threeBetOpportunities: number;
  threeBetRate: number;
}

interface BankrollGraphPoint {
  tournamentIndex: number;
  cumulativeProfit: number;
  cumulativePayout: number;
  /** 累計ROI(1.5なら150%) */
  roi: number;
}

interface LeaderboardUser {
  userId: string;
  displayName: string;
  avatarKey: string | null;
  profit: number;
  roi: number;
  itmRate: number;
  rrRating: number;
  tournamentsPlayed: number;
}

interface Leaderboards {
  weekly: LeaderboardUser[];
  allTime: LeaderboardUser[];
  last10: LeaderboardUser[];
  minTournaments: number;
}

type LbPeriod = "weekly" | "allTime" | "last10";
type LbMetric = "profit" | "roi" | "rrRating" | "itmRate";

const LB_PERIODS: { key: LbPeriod; labelKey: string }[] = [
  { key: "weekly", labelKey: "lobby.lb.weekly" },
  { key: "allTime", labelKey: "lobby.lb.allTime" },
  { key: "last10", labelKey: "lobby.lb.last10" },
];

const LB_METRICS: { key: LbMetric; labelKey: string }[] = [
  { key: "profit", labelKey: "lobby.metric.profit" },
  { key: "roi", labelKey: "lobby.metric.roi" },
  { key: "rrRating", labelKey: "lobby.metric.rrRating" },
  { key: "itmRate", labelKey: "lobby.metric.itmRate" },
];

/** 指標に応じた表示値の整形。 */
function formatLbMetric(u: LeaderboardUser, metric: LbMetric): string {
  switch (metric) {
    case "profit":
      return formatSigned(u.profit);
    case "roi":
      return `${(u.roi * 100).toFixed(0)}%`;
    case "rrRating":
      return u.rrRating.toFixed(1);
    case "itmRate":
      return `${(u.itmRate * 100).toFixed(1)}%`;
  }
}

interface HistoryRow {
  handId: string;
  playedAt: string;
  position: string;
  holeCards: string[];
  board: string[];
  deltaChips: number;
  bigBlind: number;
  tournamentId: string;
  tournamentLabel: string;
  isFavorite: boolean;
}

const SERVER_URL = process.env["NEXT_PUBLIC_SERVER_URL"] ?? "http://localhost:4000";

/** 準備中(MTT)の開発者向け入室パスコード。 */
const DEV_UNLOCK_CODE = "2357";

/** 対局スタートカードのCTA矢印(右向き)。絵文字禁止のためSVGストロークで実装。 */
function EnterArrow({ className }: { className?: string }) {
  return (
    <Icon name="arrow-right" className={className} />
  );
}

/**
 * ホーム上部の対局スタートカード。Sit&Go / MTT を最初から横並びで見せ、ワンタップで卓へ入る。
 * 意匠はダークテーマ:カード面+ヘアライン+角丸を土台に、
 *  - 上辺のアクセント帯(SnG=アクセント / MTT=クリムゾン)+その下の発光で一瞬で識別、
 *  - 左肩の連番(01/02)+種別ラベルで版面のリズムを作り、
 *  - 特大タイトル+一言説明、
 *  - 下辺に区切り線を挟んで「バイイン」と「入室 →」のCTA行、
 * で構成する。装飾は上辺バーと矢印のみに限定(絵文字不使用)。
 */
/**
 * ホームの主行動。
 *
 * 種別を選ばせる2枚のカードをやめ、「対局を始める」という1つの動作だけを置く。
 * 選択肢が1つしかないところに選択のUIを出すのは、簡潔さではなく手数を増やしているだけ。
 *
 * MTTは一般公開前。ボタンは出さず、`?mtt=dev` で開発者向けのパスコード導線だけ開く。
 */
function GameStartButton({
  onJoin,
  devMtt = false,
}: {
  onJoin: (key: GameKey, unlockCode?: string) => void;
  /** `?mtt=dev` が付いていたか。クエリの読み取りは呼び出し側(Lobby)に一本化してある。 */
  devMtt?: boolean;
}) {
  const { t } = useI18n();
  const [devMttOpen, setDevMttOpen] = useState(devMtt);

  return (
    <>
      <motion.button
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={SPRING_MOVE}
        whileTap={{ scale: 0.98 }}
        onClick={() => onJoin("sng")}
        aria-label={t("play.enter")}
        className="pressable-lg group relative flex w-full items-center gap-4 overflow-hidden rounded-[22px] bg-gradient-to-b from-accent-hi to-accent-lo text-left text-on-accent shadow-glow"
      >
        {/* カーソル追従の淡い白光。既に塗り自体がアクセント色のグラデーションなので、
            スポットライトはteal系ではなく白を選び、上端のスペキュラと役割を分ける
            (スペキュラ=常時の質感、こちらはポインタに反応する主役の合図)。 */}
        <SpotlightCard className="!h-full !w-full !rounded-[22px] !border-0 !bg-transparent px-5 py-4" spotlightColor="rgba(255, 255, 255, 0.28)">
        <span className="flex w-full items-center gap-4">
        {/* 上端のスペキュラ。塗りの面にも光が当たっていると読ませ、板ではなく物として見せる。 */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/25 to-transparent"
        />
        {/* アイコン枠: 既存のトランプ意匠(エース・スペード)をそのまま使い、ホバーで
            わずかに拡大+起こして「物」として反応させる
            (出典: uiverse.io by barisdogansutcu。オリジナルのキャラクターSVGを
            アプリに既に存在するトランプ画像へ置き換え、寸法をこのボタンに合わせて調整)。 */}
        <span className="relative grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-2xl bg-on-accent/10">
          <span className="transition-transform duration-500 ease-out group-hover:-rotate-6 group-hover:scale-110">
            <PlayingCard card="As" size="sm" />
          </span>
        </span>
        <span className="relative min-w-0 flex-1">
          <span className="block text-[19px] font-black leading-none tracking-[-0.02em]">Play</span>
          <span className="mt-1.5 block text-[12px] font-bold uppercase tracking-[0.08em] opacity-70">Sit &amp; Go (6-Max)</span>
        </span>
        <EnterArrow className="relative h-5 w-5 shrink-0 transition-transform group-active:translate-x-0.5" />
        </span>
        </SpotlightCard>
      </motion.button>

      <AnimatePresence>
        {devMttOpen && (
          <PasscodeModal
            expected={DEV_UNLOCK_CODE}
            title={t("lobby.comingSoon.devTitle")}
            onSuccess={() => {
              setDevMttOpen(false);
              onJoin("mtt", DEV_UNLOCK_CODE);
            }}
            onClose={() => setDevMttOpen(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

export type Tab = "home" | "stats" | "leaderboard" | "history" | "tournaments";

/** URLの?tabクエリから有効なタブ名だけを取り出す(それ以外はnull)。/geo等の他画面からの遷移用。 */
export function tabFromQuery(value: string | null): Tab | null {
  return value === "home" || value === "stats" || value === "leaderboard" || value === "history" || value === "tournaments"
    ? value
    : null;
}

function formatSigned(n: number): string {
  return `${n > 0 ? "+" : ""}${n.toLocaleString()}`;
}

function signedClass(n: number): string {
  return n > 0 ? "text-mint-400" : n < 0 ? "text-crimson-300" : "text-fg";
}

function SectionCard({ children }: { children: React.ReactNode }) {
  return <div className="rounded-[20px] glass-panel shadow-e1 p-4">{children}</div>;
}

/** 棋譜解析(レビュー)導線を示すSVGグリフ。虫眼鏡+チャート。絵文字は使わずSVGで統一。 */
function ReviewGlyph({ className }: { className?: string }) {
  return (
    <Icon name="search" className={className} />
  );
}

/**
 * 各タブ共通の大胆なヘッダー。アクセントのアイブロウ(マイクロラベル)+特大のタイトル+
 * アクセントのピリオドで、Stats/History/Leaderboard を統一した見出しにする。
 * ホーム画面と同じタイポ言語(特大・字間タイト)。 */
function TabHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="mb-5 mt-1"
    >
      {/* eyebrowの "//" はコードコメント風の飾り、見出し末尾は句点の代わりに点滅する
          端末カーソルにしている(出典: uiverse.io by Jarol20cb / kamehame-haのハッカー/
          コンソール演出をこのアプリの全タブ見出しへさりげなく適用)。 */}
      <div className="flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-accent" />
        <span className="text-[10px] font-black uppercase tracking-[0.28em] text-fg-3">{`// ${eyebrow}`}</span>
      </div>
      <h1 className="mt-1.5 text-[34px] font-black leading-none tracking-tight text-fg">
        {title}
        <span className="term-cursor bg-accent" aria-hidden="true" />
      </h1>
    </motion.div>
  );
}

/** ホーム画面のRRRatingCardと同じカード意匠。フェードアップで順にstagger表示する。 */
function AnimatedCard({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-[20px] glass-panel shadow-e1 p-4"
    >
      {children}
    </motion.div>
  );
}

/**
 * RRPokerの/home/tournaments一覧カードと同じ構成(名前・日付→着順バッジ→バイイン/獲得/収支)。
 * タップするとトナメ偏差値の推移(その回の変動)まで含めた詳細シートが開く。
 */
/** トーナメント成績セクション(集計タイル+履歴カード一覧)。tournamentsタブとHistoryタブの切替の両方で使う。 */
function TournamentResultsSection({
  accessToken,
  tournamentHistory,
}: {
  accessToken?: string | undefined;
  tournamentHistory: TournamentHistoryPoint[] | null;
}) {
  const { t } = useI18n();
  const [reviewTournamentId, setReviewTournamentId] = useState<string | null>(null);
  if (!accessToken) {
    return (
      <SectionCard>
        <div className="py-10 text-center text-n-9 text-sm">{t("lobby.needLoginTourneys")}</div>
      </SectionCard>
    );
  }
  if (tournamentHistory === null) {
    return (
      <SectionCard>
        <ListSkeleton />
      </SectionCard>
    );
  }
  if (tournamentHistory.length === 0) {
    return (
      <SectionCard>
        <EmptyState icon="chart" title={t("lobby.tourneys.emptyTitle")} subtitle={t("lobby.tourneys.emptySub")} />
      </SectionCard>
    );
  }
  // 一覧の上の集計(エントリー数/インマネ回数/インマネ率)はここでは不要なため表示しない。
  return (
    <>
      <div className="space-y-2.5">
        {[...tournamentHistory].reverse().map((p, i) => (
          <TournamentHistoryCard
            key={p.tournamentId}
            point={p}
            delay={Math.min(i * 0.03, 0.4)}
            onOpenReview={setReviewTournamentId}
          />
        ))}
      </div>

      <AnimatePresence>
        {reviewTournamentId && (
          <TournamentReviewModal
            tournamentId={reviewTournamentId}
            accessToken={accessToken}
            onClose={() => setReviewTournamentId(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function TournamentHistoryCard({
  point,
  delay = 0,
  onOpenReview,
}: {
  point: TournamentHistoryPoint;
  delay?: number;
  onOpenReview?: (tournamentId: string) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const date = new Date(point.finishedAt);
  const pnlClass = point.pnl > 0 ? "text-mint-400" : point.pnl < 0 ? "text-crimson-300" : "text-n-9";

  return (
    <>
      <motion.button
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay }}
        whileTap={{ scale: 0.985 }}
        onClick={() => setOpen(true)}
        className="w-full text-left rounded-[18px] glass-panel shadow-e1 p-3.5"
      >
        <div className="flex items-start justify-between mb-2.5">
          <div className="min-w-0">
            <p className="text-[13px] font-bold text-fg">{GAME_TYPE_LABEL[point.gameType] ?? point.gameType}</p>
            <p className="text-[10px] text-n-9 mt-0.5">
              {date.toLocaleDateString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit" })} ・ {t("lobby.seats", { n: point.seatCount })}
            </p>
          </div>
          {point.finishPosition != null && (
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-accent-hi to-accent-lo flex items-center justify-center shrink-0">
              <span className="text-[11px] font-black text-white">{t("result.place", { n: point.finishPosition })}</span>
            </div>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2 mb-2">
          <div className="rounded-xl glass-panel p-2 text-center">
            <p className="text-[9px] text-n-9 mb-0.5">{t("play.buyIn")}</p>
            <p className="text-[12px] font-bold text-fg tabular-nums">{point.buyIn.toLocaleString()}</p>
          </div>
          <div className="rounded-xl glass-panel p-2 text-center">
            <p className="text-[9px] text-n-9 mb-0.5">{t("lobby.payout")}</p>
            <p className="text-[12px] font-bold text-fg tabular-nums">{point.payout.toLocaleString()}</p>
          </div>
          <div className="rounded-xl glass-panel p-2 text-center">
            <p className="text-[9px] text-n-9 mb-0.5">{t("result.m.profit")}</p>
            <p className={`text-[12px] font-bold tabular-nums ${pnlClass}`}>{formatSigned(point.pnl)}</p>
          </div>
        </div>
        <div className="text-right text-[10px] text-fg-2">{t("lobby.tapDetail")}</div>
      </motion.button>

      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setOpen(false)}>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/70"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={SPRING_SHEET}
              className="relative w-full max-w-sm glass-sheet rounded-t-sheet pb-[calc(env(safe-area-inset-bottom)+20px)] pt-5 px-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <p className="text-[16px] font-bold text-fg">{GAME_TYPE_LABEL[point.gameType] ?? point.gameType}</p>
                <button onClick={() => setOpen(false)} className="pressable text-[13px] text-fg-2">
                  {t("common.close")}
                </button>
              </div>
              <p className="text-[12px] text-n-9 mb-4">
                {date.toLocaleDateString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit" })} ・ {t("lobby.seats", { n: point.seatCount })}
                {point.finishPosition != null && ` ・ ${t("result.place", { n: point.finishPosition })}`}
              </p>
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="rounded-xl glass-panel p-3 text-center">
                  <p className="text-[10px] text-n-9 mb-1">{t("play.buyIn")}</p>
                  <p className="text-[14px] font-bold text-fg tabular-nums">{point.buyIn.toLocaleString()}</p>
                </div>
                <div className="rounded-xl glass-panel p-3 text-center">
                  <p className="text-[10px] text-n-9 mb-1">{t("lobby.payout")}</p>
                  <p className="text-[14px] font-bold text-fg tabular-nums">{point.payout.toLocaleString()}</p>
                </div>
                <div className="rounded-xl glass-panel p-3 text-center">
                  <p className="text-[10px] text-n-9 mb-1">{t("result.m.profit")}</p>
                  <p className={`text-[14px] font-bold tabular-nums ${pnlClass}`}>{formatSigned(point.pnl)}</p>
                </div>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-accent bg-surface px-3.5 py-3">
                <span className="text-[12px] font-semibold text-accent">{t("lobby.metric.rrRating")}</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[16px] font-black text-accent tabular-nums">{displayRating(point.rrRatingAfter)}</span>
                  {point.rrRatingDelta != null && Math.abs(point.rrRatingDelta) >= 0.01 && (
                    <span
                      className={`text-[11px] font-bold rounded-md px-1.5 py-0.5 tabular-nums ${
                        point.rrRatingDelta >= 0 ? "text-mint-400 bg-mint-500/10" : "text-crimson-300 bg-crimson-500/10"
                      }`}
                    >
                      {point.rrRatingDelta >= 0 ? "+" : ""}
                      {point.rrRatingDelta.toFixed(2)}
                    </span>
                  )}
                </div>
              </div>
              {/* 過去トナメの棋譜解析(局後検討)への導線。モーダルで開く。 */}
              {onOpenReview && point.tournamentId && (
                <button
                  onClick={() => {
                    setOpen(false);
                    onOpenReview(point.tournamentId);
                  }}
                  className="pressable mt-3 block w-full rounded-xl bg-accent py-3 text-center text-[13px] font-bold text-on-accent shadow-glow"
                >
                  {t("result.reviewCta")}
                </button>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

function InfoIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <Icon name="info" className={className} />
  );
}

/** シンタックスハイライト風の1行分。indentは20px単位。 */
type CodeLine = { n: number; indent?: number; parts: { text: string; cls?: string }[] };

const HACKER_CARD_LINES: CodeLine[] = [
  { n: 1, parts: [{ text: "public static object ", cls: "text-[#ff79c6]" }, { text: "GetTableStatus", cls: "text-[#50fa7b]" }, { text: "()", cls: "text-[#8be9fd]" }] },
  { n: 2, parts: [{ text: "{", cls: "text-[#8be9fd]" }] },
  { n: 3, indent: 1, parts: [{ text: "return new", cls: "text-[#ff79c6]" }] },
  { n: 4, indent: 1, parts: [{ text: "{", cls: "text-[#50fa7b]" }] },
  { n: 5, indent: 2, parts: [{ text: "Engine " }, { text: "= ", cls: "text-[#ff79c6]" }, { text: '"GEO Solver"', cls: "text-[#f1fa8c]" }, { text: "," }] },
  { n: 6, indent: 2, parts: [{ text: "Table " }, { text: "= ", cls: "text-[#ff79c6]" }, { text: '"Poker ART"', cls: "text-[#f1fa8c]" }, { text: "," }] },
  { n: 7, indent: 2, parts: [{ text: "Status " }, { text: "= ", cls: "text-[#ff79c6]" }, { text: '"LIVE"', cls: "text-[#f1fa8c]" }, { text: "," }] },
  { n: 8, indent: 1, parts: [{ text: "}", cls: "text-[#50fa7b]" }, { text: ";" }] },
  { n: 9, parts: [{ text: "}", cls: "text-[#8be9fd]" }] },
];

/**
 * ハッカー/コンソール演出の装飾カード(出典: uiverse.io by kamehame-ha の行番号+
 * シンタックスハイライト付きコードブロックと、Jarol20cbのフロートアニメーションを
 * 組み合わせ、このアプリのダーク面(n-0)へそのまま適用したもの。機能は持たない
 * 雰囲気付けのイースターエッグで、ホーム画面にさりげなく1枚だけ置く)。
 */
function HackerCodeCard() {
  return (
    <div className="hacker-card-float rounded-2xl bg-n-0 p-4 shadow-e2 ring-1 ring-white/[0.06]">
      <div className="mb-3 flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
        <span className="ml-2 text-[10px] text-fg-3">poker-art.geo</span>
      </div>
      <div className="space-y-1 overflow-x-auto">
        {HACKER_CARD_LINES.map((l) => (
          <div key={l.n} className="flex gap-3 whitespace-pre text-[11px] leading-5">
            <span className="w-4 shrink-0 text-right text-white/20 tabular-nums">{l.n}</span>
            <span style={{ paddingLeft: (l.indent ?? 0) * 20 }}>
              {l.parts.map((p, i) => (
                <span key={i} className={p.cls ?? "text-fg-2"}>
                  {p.text}
                </span>
              ))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** ラベルの右に(i)ボタンが付いたスタッツタイル。押すと該当スタッツの説明モーダルが開く。 */
function StatTile({
  label,
  value,
  valueClass,
  onInfo,
  countTo,
  format,
  valueSize = "base",
  captionValue,
  captionClass,
  onCaptionInfo,
}: {
  label: string;
  value: string;
  valueClass?: string;
  onInfo?: () => void;
  /** 指定すると 0→countTo をカウントアップ表示する(表示は format で整形)。 */
  countTo?: number;
  format?: (n: number) => string;
  /** 大きめの数字で強調したいとき用("base"は従来どおりの大きさ)。 */
  valueSize?: "base" | "lg";
  /** 値の下に添える小さな差分表記(出典: uiverse.io by Gidarxの「金額+増減率」表記を、
   *  このアプリの各スタッツに合わせて置き換えたもの)。 */
  captionValue?: string;
  captionClass?: string;
  onCaptionInfo?: () => void;
}) {
  const { t } = useI18n();
  const animated = useCountUp(0, countTo ?? 0, 1100, 200);
  const display = countTo !== undefined && format ? format(animated) : value;
  return (
    <div>
      <div className="flex items-center gap-1 text-[11px] text-n-9">
        <span>{label}</span>
        {onInfo && (
          <button onClick={onInfo} className="pressable text-n-9 active:text-n-10" aria-label={t("stat.infoAria", { label })}>
            <InfoIcon />
          </button>
        )}
      </div>
      <div
        className={`${valueSize === "lg" ? "text-xl font-black" : "text-lg font-bold"} tabular-nums ${valueClass ?? "text-fg"}`}
      >
        {display}
      </div>
      {captionValue &&
        (onCaptionInfo ? (
          <button
            onClick={onCaptionInfo}
            className={`pressable mt-1 block text-[11px] font-bold tabular-nums ${captionClass ?? "text-fg-3"}`}
            aria-label={t("stat.infoAria", { label })}
          >
            {captionValue}
          </button>
        ) : (
          <div className={`mt-1 text-[11px] font-bold tabular-nums ${captionClass ?? "text-fg-3"}`}>{captionValue}</div>
        ))}
    </div>
  );
}

interface StatInfoDef {
  title: string;
  subtitle?: string;
  value: string;
  description: string;
  breakdown?: { execLabel: string; execDesc: string; oppLabel: string; oppDesc: string };
  notes?: string[];
}

type StatInfoKey =
  | "buyIns"
  | "payouts"
  | "profit"
  | "roi"
  | "tournamentsPlayed"
  | "itmCount"
  | "itmRate"
  | "vpip"
  | "pfr"
  | "threeBet"
  | "graphRoi"
  | "graphProfit";

type TFn = (key: string, vars?: Record<string, string | number>) => string;

function buildStatInfo(key: StatInfoKey, s: PlayerStats, t: TFn): StatInfoDef {
  switch (key) {
    case "buyIns":
      return {
        title: t("stat.buyIns"),
        value: s.totalBuyIns.toLocaleString(),
        description: t("statinfo.buyIns.desc"),
      };
    case "payouts":
      return {
        title: t("stat.payouts"),
        value: s.totalPayouts.toLocaleString(),
        description: t("statinfo.payouts.desc"),
      };
    case "profit":
      return {
        title: t("stat.profit"),
        value: formatSigned(s.profit),
        description: t("statinfo.profit.desc"),
      };
    case "roi":
      return {
        title: t("stat.roi"),
        subtitle: t("statinfo.roi.sub"),
        value: `${(s.roi * 100).toFixed(1)}%`,
        description: t("statinfo.roi.desc"),
      };
    case "tournamentsPlayed":
      return {
        title: t("stat.tournamentsPlayed"),
        value: s.tournamentsPlayed.toLocaleString(),
        description: t("statinfo.tournamentsPlayed.desc"),
      };
    case "itmCount":
      return {
        title: t("stat.itmCount"),
        subtitle: t("statinfo.itmCount.sub"),
        value: s.itmCount.toLocaleString(),
        description: t("statinfo.itmCount.desc"),
      };
    case "itmRate":
      return {
        title: t("stat.itmRate"),
        value: `${(s.itmRate * 100).toFixed(1)}%`,
        description: t("statinfo.itmRate.desc"),
      };
    case "vpip":
      return {
        title: t("stat.vpip"),
        subtitle: t("statinfo.vpip.sub"),
        value: `${(s.vpipRate * 100).toFixed(0)} (${s.vpipCount.toLocaleString()}/${s.vpipOpportunities.toLocaleString()})`,
        description: t("statinfo.vpip.desc"),
        breakdown: {
          execLabel: t("statinfo.execLabel"),
          execDesc: t("statinfo.vpip.execDesc"),
          oppLabel: t("statinfo.oppLabel"),
          oppDesc: t("statinfo.vpip.oppDesc"),
        },
        notes: [t("statinfo.vpip.note1"), t("statinfo.vpip.note2")],
      };
    case "pfr":
      return {
        title: t("stat.pfr"),
        subtitle: t("statinfo.pfr.sub"),
        value: `${(s.pfrRate * 100).toFixed(0)} (${s.pfrCount.toLocaleString()}/${s.pfrOpportunities.toLocaleString()})`,
        description: t("statinfo.pfr.desc"),
        breakdown: {
          execLabel: t("statinfo.execLabel"),
          execDesc: t("statinfo.pfr.execDesc"),
          oppLabel: t("statinfo.oppLabel"),
          oppDesc: t("statinfo.pfr.oppDesc"),
        },
        notes: [t("statinfo.pfr.note1")],
      };
    case "threeBet":
      return {
        title: t("stat.threeBet"),
        subtitle: t("statinfo.threeBet.sub"),
        value: `${(s.threeBetRate * 100).toFixed(0)} (${s.threeBetCount.toLocaleString()}/${s.threeBetOpportunities.toLocaleString()})`,
        description: t("statinfo.threeBet.desc"),
        breakdown: {
          execLabel: t("statinfo.execLabel"),
          execDesc: t("statinfo.threeBet.execDesc"),
          oppLabel: t("statinfo.oppLabel"),
          oppDesc: t("statinfo.threeBet.oppDesc"),
        },
        notes: [t("statinfo.threeBet.note1"), t("statinfo.threeBet.note2")],
      };
    case "graphRoi":
      return {
        title: t("statinfo.graphRoi.title"),
        subtitle: t("statinfo.roi.sub"),
        value: "",
        description: t("statinfo.graphRoi.desc"),
      };
    case "graphProfit":
      return {
        title: t("statinfo.graphProfit.title"),
        value: "",
        description: t("statinfo.graphProfit.desc"),
      };
  }
}

function StatInfoModal({ info, onClose }: { info: StatInfoDef; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md rounded-t-3xl bg-n-2 ring-1 ring-line p-5 pb-[calc(env(safe-area-inset-bottom)+20px)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-3">
          <div>
            <h2 className="text-base font-bold text-fg">{info.title}</h2>
            {info.subtitle && <p className="text-[11px] text-n-9">{info.subtitle}</p>}
          </div>
          <button onClick={onClose} className="pressable text-n-9 text-xl leading-none px-2" aria-label={t("common.close")}>
            ×
          </button>
        </div>

        {info.value && <div className="text-2xl font-bold tabular-nums text-fg mb-3">{info.value}</div>}
        <p className="text-sm text-n-10 mb-4">{info.description}</p>

        {info.breakdown && (
          <div className="rounded-xl bg-n-5/70 divide-y divide-line mb-3">
            <div className="px-3 py-2.5">
              <div className="text-[11px] text-mint-400 font-semibold">{info.breakdown.execLabel}</div>
              <div className="text-xs text-n-10 mt-0.5">{info.breakdown.execDesc}</div>
            </div>
            <div className="px-3 py-2.5">
              <div className="text-[11px] text-mint-400 font-semibold">{info.breakdown.oppLabel}</div>
              <div className="text-xs text-n-10 mt-0.5">{info.breakdown.oppDesc}</div>
            </div>
          </div>
        )}

        {info.notes && info.notes.length > 0 && (
          <div className="rounded-xl bg-n-5/40 px-3 py-2.5 space-y-1">
            {info.notes.map((n, i) => (
              <p key={i} className="text-[11px] text-n-9">
                ※ {n}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const TOURNEY_GRAPH_RANGES: { key: string; label: string; limit: number }[] = [
  { key: "10", label: "10", limit: 10 },
  { key: "50", label: "50", limit: 50 },
  { key: "100", label: "100", limit: 100 },
  { key: "500", label: "500", limit: 500 },
  { key: "all", label: "All", limit: 1_000_000 },
];

/** 値域spanを4分割前後になるキリの良い目盛り間隔にする(1/2/5×10^n)。 */
function niceTickStep(span: number): number {
  if (span <= 0) return 1;
  const rough = span / 4;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
  const normalized = rough / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

function pickTickIndices(count: number, maxTicks: number): number[] {
  if (count <= maxTicks) return Array.from({ length: count }, (_, i) => i);
  const ticks: number[] = [];
  for (let i = 0; i < maxTicks; i++) {
    ticks.push(Math.round((i * (count - 1)) / (maxTicks - 1)));
  }
  return [...new Set(ticks)];
}

function formatAxisValue(v: number): string {
  return v >= 1000 || v <= -1000 ? `${(v / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}k` : v.toLocaleString();
}

/**
 * 1系列だけの折れ線グラフ(ROI・収支・得た金額でそれぞれ1つずつ使う)。
 * x軸は「何トーナメント目か」、baselineは損益分岐の破線(収支なら0、ROIなら100%)。
 */
function SingleLineChart({
  title,
  color,
  points,
  baseline,
  formatValue,
  deltaFormat,
  onInfo,
}: {
  title: string;
  color: string;
  points: { x: number; y: number }[];
  baseline: number;
  formatValue: (v: number) => string;
  /** タイトル横に出す期間内差分の整形(出典: uiverse.io by Gidarxの「金額+増減率」表記。
   *  未指定時は formatValue をそのまま使う)。 */
  deltaFormat?: (v: number) => string;
  onInfo?: () => void;
}) {
  const { t } = useI18n();
  const delta = points.length >= 2 ? points[points.length - 1]!.y - points[0]!.y : 0;
  const deltaClass = delta > 0 ? "text-mint-400" : delta < 0 ? "text-crimson-300" : "text-fg-3";
  const header = (
    <div className="flex items-center gap-1.5 mb-1">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      <span className="text-xs font-semibold text-n-10">{title}</span>
      {points.length >= 2 && (
        <span className="ml-auto flex items-baseline gap-1.5">
          <span className="text-base font-black tabular-nums text-fg">{formatValue(points[points.length - 1]!.y)}</span>
          <span className={`text-[10px] font-bold tabular-nums ${deltaClass}`}>{(deltaFormat ?? formatValue)(delta)}</span>
        </span>
      )}
      {onInfo && (
        <button onClick={onInfo} className={`pressable text-n-9 active:text-n-10 ${points.length >= 2 ? "" : "ml-auto"}`} aria-label={t("stat.infoAria", { label: title })}>
          <InfoIcon />
        </button>
      )}
    </div>
  );

  if (points.length < 2) {
    return (
      <div>
        {header}
        <div className="py-6 text-center text-n-9 text-xs">{t("lobby.chartNeedMore")}</div>
      </div>
    );
  }

  const width = 320;
  const height = 140;
  const padLeft = 46;
  const padBottom = 16;
  const plotWidth = width - padLeft;
  const plotHeight = height - padBottom;

  const values = [...points.map((p) => p.y), baseline];
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (max === min) {
    max += 1;
    min -= 1;
  }
  const margin = (max - min) * 0.08;
  min -= margin;
  max += margin;

  const toY = (v: number) => plotHeight - ((v - min) / (max - min)) * plotHeight;
  const xStep = plotWidth / (points.length - 1);
  const toX = (i: number) => padLeft + i * xStep;

  const tickStep = niceTickStep(max - min);
  const yTicks: number[] = [];
  for (let v = Math.ceil(min / tickStep) * tickStep; v <= max; v += tickStep) yTicks.push(Math.round(v * 100) / 100);
  const xTickIdx = pickTickIndices(points.length, 6);

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(p.y).toFixed(1)}`).join(" ");
  // 面塗り: 折れ線の下をプロット下端まで塗り、色→透明のグラデーションで陰影を付ける。
  const areaPath = `${linePath} L${toX(points.length - 1).toFixed(1)},${plotHeight} L${toX(0).toFixed(1)},${plotHeight} Z`;
  const gradId = `area-grad-${color.replace("#", "")}`;

  return (
    <div>
      {header}
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height: 130 }} preserveAspectRatio="none">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.22} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        {yTicks.map((tick) => (
          <g key={tick}>
            <line x1={padLeft} y1={toY(tick)} x2={width} y2={toY(tick)} stroke="currentColor" strokeWidth={0.5} className="text-fg-3" />
            <text x={padLeft - 6} y={toY(tick) + 3} textAnchor="end" className="fill-n-9" style={{ fontSize: 8 }}>
              {formatAxisValue(tick)}
            </text>
          </g>
        ))}

        {/* 損益分岐ライン(収支=0 / ROI=100%) */}
        <line
          x1={padLeft}
          y1={toY(baseline)}
          x2={width}
          y2={toY(baseline)}
          stroke="currentColor"
          strokeWidth={1}
          strokeDasharray="3 3"
          className="text-n-9"
        />

        <path d={areaPath} fill={`url(#${gradId})`} stroke="none" />
        <path d={linePath} fill="none" stroke={color} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />

        {xTickIdx.map((i) => (
          <text key={i} x={toX(i)} y={height - 2} textAnchor="middle" className="fill-n-9" style={{ fontSize: 8 }}>
            {points[i]!.x}
          </text>
        ))}

        {/* 最新値の発光ドット(出典: uiverse.io by Gidarx)。常時ゆっくり脈打つ輪+芯の点。 */}
        <circle cx={toX(points.length - 1)} cy={toY(points[points.length - 1]!.y)} r={5} fill={color} opacity={0.32} />
        <circle
          cx={toX(points.length - 1)}
          cy={toY(points[points.length - 1]!.y)}
          r={7}
          fill={color}
          opacity={0.25}
          className="chart-pulse-ring"
        />
        <circle cx={toX(points.length - 1)} cy={toY(points[points.length - 1]!.y)} r={2.5} fill={color} />
      </svg>
    </div>
  );
}

export { Icon };

/** ヘッダー右上のハンバーガーメニューから開くボトムシート。旧Mypageタブの機能をここに集約する。 */
/** "google" → "Google" のようにプロバイダ名を表示用ラベルに変換する。 */
function providerLabel(provider: string, t: TFn): string {
  if (provider === "google") return "Google";
  if (provider === "apple") return "Apple";
  if (provider === "email") return t("lobby.provider.email");
  return provider;
}

function HamburgerMenu({
  displayName,
  avatarKey,
  email,
  providers,
  isGuest,
  accessToken,
  onClose,
  onEditProfile,
  onSignOut,
  onAccountDeleted,
}: {
  displayName: string;
  avatarKey: string | null;
  email?: string | null;
  providers?: string[];
  isGuest: boolean;
  accessToken?: string;
  onClose: () => void;
  onEditProfile: () => void;
  onSignOut?: () => void;
  /** 退会が完了したときに呼ぶ(呼び出し側でサインアウトしてホームへ戻す)。 */
  onAccountDeleted?: () => void;
}) {
  const { t } = useI18n();
  // 退会は取り消せないため、必ず2段階(ボタン→確認パネル)にする。
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const runDelete = async () => {
    if (!accessToken || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`${SERVER_URL}/api/lobby/delete-account`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        let reason = `HTTP ${res.status}`;
        try {
          const parsed = JSON.parse(body) as { error?: unknown };
          if (typeof parsed.error === "string") reason = parsed.error;
        } catch {
          /* 本文が読めなければステータスだけ */
        }
        setDeleteError(reason);
        setDeleting(false);
        return;
      }
      onAccountDeleted?.();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : String(err));
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={SPRING_SHEET}
        className="relative h-full w-[82%] max-w-sm bg-n-2 ring-1 ring-line pt-6 pb-[calc(env(safe-area-inset-bottom)+20px)] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 flex items-center gap-3 mb-2">
          <Avatar avatarKey={avatarKey} displayName={displayName} size={48} />
          <div className="min-w-0">
            <div className="text-base font-semibold text-fg truncate">{displayName}</div>
            {email ? (
              <div className="text-xs text-n-9 truncate">{email}</div>
            ) : (
              isGuest && <div className="text-xs text-n-9">{t("lobby.guestPlaying")}</div>
            )}
            {/* どのアカウントでログイン中かを常に確認できるよう、連携済みプロバイダを明示する */}
            {providers && providers.length > 0 && (
              <div className="text-[10px] text-n-9 truncate">
                {t("lobby.loggedInWith", { p: providers.map((p) => providerLabel(p, t)).join(" / ") })}
              </div>
            )}
          </div>
        </div>
        <div className="px-2 mt-2 divide-y divide-line">
          <button onClick={onEditProfile} className="pressable w-full flex items-center justify-between px-3 py-3.5 text-sm text-fg">
            {t("menu.editProfile")} <span className="text-n-9">›</span>
          </button>
          {/* GEO DATABASE の使い方(スワイプ式チュートリアル)を再表示する導線。?guide=1 で既読でも強制表示。 */}
          <Link
            href="/geo?guide=1"
            onClick={onClose}
            className="w-full flex items-center justify-between px-3 py-3.5 text-sm text-fg"
          >
            {t("menu.geoGuide")} <span className="text-n-9">›</span>
          </Link>
          {/* 言語切替。ログイン後もいつでも変更できるようメニューに常設する。 */}
          <div className="flex items-center justify-between px-3 py-3.5 text-sm text-fg">
            <span>{t("common.language")}</span>
            <LanguageSwitcher />
          </div>
          {onSignOut && (
            <button onClick={onSignOut} className="pressable w-full flex items-center justify-between px-3 py-3.5 text-sm text-crimson-300">
              {t("menu.logout")} <span className="text-n-9">›</span>
            </button>
          )}
          {/* アカウントの完全削除。取り消せない操作なので、必ず確認パネルを挟む。 */}
          {!isGuest && accessToken && (
            <div className="py-1">
              {!confirmingDelete ? (
                <button
                  onClick={() => setConfirmingDelete(true)}
                  className="pressable w-full flex items-center justify-between px-3 py-3.5 text-sm text-crimson-300"
                >
                  {t("menu.deleteAccount")} <span className="text-n-9">›</span>
                </button>
              ) : (
                <div className="rounded-xl bg-crimson-500/[0.06] px-3 py-3">
                  <p className="text-[13px] font-black text-crimson-300">{t("menu.deleteAccount.confirmTitle")}</p>
                  <p className="mt-1 text-[11.5px] leading-relaxed text-n-9">{t("menu.deleteAccount.confirmBody")}</p>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-n-9">{t("menu.deleteAccount.geoNotice")}</p>
                  {deleteError && (
                    <p className="mt-2 text-[11px] font-semibold text-crimson-300">
                      {t("menu.deleteAccount.failed")}: {deleteError}
                    </p>
                  )}
                  <div className="mt-2.5 flex gap-2">
                    <button
                      onClick={() => void runDelete()}
                      disabled={deleting}
                      className="pressable flex-1 rounded-lg bg-crimson-600 py-2 text-[12px] font-bold text-white disabled:opacity-60"
                    >
                      {deleting ? t("menu.deleteAccount.deleting") : t("menu.deleteAccount.confirm")}
                    </button>
                    <button
                      onClick={() => {
                        setConfirmingDelete(false);
                        setDeleteError(null);
                      }}
                      disabled={deleting}
                      className="pressable flex-1 rounded-lg bg-n-4 py-2 text-[12px] font-bold text-n-10"
                    >
                      {t("common.cancel")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 友達招待とクーポンをひとつのセクションに集約(旧ホームから移設)。 */}
        {accessToken && (
          <div className="mt-5 px-4 space-y-3">
            <p className="px-1 text-[10px] font-black uppercase tracking-[0.18em] text-fg-2">{t("menu.inviteCoupon")}</p>
            <InviteCard accessToken={accessToken} />
            <CouponWallet accessToken={accessToken} />
          </div>
        )}
      </motion.div>
    </div>
  );
}

export function Lobby({
  displayName,
  avatarKey,
  email,
  providers,
  userId,
  accessToken,
  onJoin,
  onEditProfile,
  onSignOut,
  onAccountDeleted,
}: {
  displayName: string;
  avatarKey: string | null;
  email?: string | null;
  providers?: string[];
  userId?: string | null;
  accessToken?: string;
  onJoin: (gameKey: GameKey, unlockCode?: string) => void;
  onEditProfile: () => void;
  onSignOut?: () => void;
  /** 退会完了時。呼び出し側でサインアウトしてログイン画面へ戻す。 */
  onAccountDeleted?: () => void;
}) {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => tabFromQuery(searchParams.get("tab")) ?? "home");
  // リーダーボードでタップされたプレイヤー(スタッツ詳細モーダルを開く対象)。
  const [lbTapped, setLbTapped] = useState<{ userId: string; displayName: string; avatarKey: string | null } | null>(null);
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [rrRating, setRRRating] = useState<RRRatingData | null>(null);
  const [tournamentHistory, setTournamentHistory] = useState<TournamentHistoryPoint[] | null>(null);
  const [reviewTournamentId, setReviewTournamentId] = useState<string | null>(null);
  // Historyタブの表示種別: ハンド履歴 / トーナメント履歴(過去トナメの棋譜解析への導線)。
  const [historyView, setHistoryView] = useState<"hands" | "tournaments">("hands");
  const [bankrollGraph, setBankrollGraph] = useState<BankrollGraphPoint[] | null>(null);
  const [graphRangeKey, setGraphRangeKey] = useState<string>("all");
  const [infoKey, setInfoKey] = useState<StatInfoKey | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [leaderboards, setLeaderboards] = useState<Leaderboards | null>(null);
  const [lbPeriod, setLbPeriod] = useState<LbPeriod>("allTime");
  const [lbMetric, setLbMetric] = useState<LbMetric>("profit");
  const [history, setHistory] = useState<HistoryRow[] | null>(null);
  const [historySubTab, setHistorySubTab] = useState<"all" | "favorites">("all");
  // ホーム最上段の「復帰」バナー用: いま参加中のゲーム種別(サーバーが常時記録)。非破壊peekでポーリング。
  const [activeGameKey, setActiveGameKey] = useState<GameKey | null>(null);
  // GEO DATABASE 解放のお知らせトースト。ログイン済み & まだ database タブを開いていないときだけ出す。
  const [showGeoToast, setShowGeoToast] = useState(false);

  // GEO DATABASE 解放のトースト表示判定。SSR不整合を避けるためマウント後にlocalStorageを見る。
  // 「database タブを一度開いたら(=/geo を訪れて geoDbOpened が立ったら)」以降は出さない。
  useEffect(() => {
    if (!accessToken) return; // ログイン済みユーザーのみ
    let opened = false;
    try {
      opened = localStorage.getItem("pokerart.geoDbOpened.v1") === "1";
    } catch {
      opened = true; // localStorage不可の環境では出さない側に倒す
    }
    if (opened) return;
    setShowGeoToast(true);
    // トーストらしく数秒で自動的に引っ込める(次回ホーム表示時に database 未訪問ならまた出る)。
    const timer = setTimeout(() => setShowGeoToast(false), 6000);
    return () => clearTimeout(timer);
  }, [accessToken]);

  // 参加中ゲームを常時確認: マウント時 + 復帰(focus/visibilitychange)時 + 30秒間隔。
  // peek=1 は結果サジェストを消費しないので、復帰後に結果が1回だけ出る通常動作を壊さない。
  useEffect(() => {
    if (!accessToken) {
      setActiveGameKey(null);
      return;
    }
    let cancelled = false;
    const poll = () => {
      fetch(`${SERVER_URL}/api/lobby/active-game?peek=1`, { headers: { authorization: `Bearer ${accessToken}` } })
        .then((res) => (res.ok ? (res.json() as Promise<{ gameKey: GameKey | null }>) : null))
        .then((json) => {
          if (!cancelled) setActiveGameKey(json?.gameKey ?? null);
        })
        .catch(() => {});
    };
    poll();
    const interval = setInterval(poll, 30_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", poll);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", poll);
    };
  }, [accessToken]);

  function toggleFavorite(handId: string, isFavorite: boolean) {
    setHistory((prev) => (prev ? prev.map((h) => (h.handId === handId ? { ...h, isFavorite } : h)) : prev));
    if (!accessToken) return;
    fetch(`${SERVER_URL}/api/lobby/history/favorite`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ handId, isFavorite }),
    }).catch(() => {});
  }

  useEffect(() => {
    if (!accessToken) return;
    fetch(`${SERVER_URL}/api/lobby/stats`, { headers: { authorization: `Bearer ${accessToken}` } })
      .then((res) => (res.ok ? (res.json() as Promise<PlayerStats>) : null))
      .then((json) => json && setStats(json))
      .catch(() => {});
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) return;
    fetch(`${SERVER_URL}/api/lobby/rr-rating`, { headers: { authorization: `Bearer ${accessToken}` } })
      .then((res) => (res.ok ? (res.json() as Promise<RRRatingData>) : null))
      .then((json) => json && setRRRating(json))
      .catch(() => {});
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) return;
    fetch(`${SERVER_URL}/api/lobby/tournament-history?limit=200`, { headers: { authorization: `Bearer ${accessToken}` } })
      .then((res) => (res.ok ? (res.json() as Promise<TournamentHistoryPoint[]>) : null))
      .then((json) => json && setTournamentHistory(json))
      .catch(() => {});
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken || tab !== "stats") return;
    const limit = TOURNEY_GRAPH_RANGES.find((r) => r.key === graphRangeKey)?.limit ?? 1_000_000;
    setBankrollGraph(null);
    fetch(`${SERVER_URL}/api/lobby/bankroll-graph?limit=${limit}`, { headers: { authorization: `Bearer ${accessToken}` } })
      .then((res) => (res.ok ? (res.json() as Promise<BankrollGraphPoint[]>) : null))
      .then((json) => json && setBankrollGraph(json))
      .catch(() => {});
  }, [accessToken, tab, graphRangeKey]);

  useEffect(() => {
    if (tab !== "leaderboard" || leaderboards) return;
    fetch(`${SERVER_URL}/api/lobby/leaderboards`)
      .then((res) => (res.ok ? (res.json() as Promise<Leaderboards>) : null))
      .then((json) => json && setLeaderboards(json))
      .catch(() => {});
  }, [tab, leaderboards]);

  useEffect(() => {
    if (tab !== "history" || history || !accessToken) return;
    fetch(`${SERVER_URL}/api/lobby/history`, { headers: { authorization: `Bearer ${accessToken}` } })
      .then((res) => (res.ok ? (res.json() as Promise<HistoryRow[]>) : null))
      .then((json) => json && setHistory(json))
      .catch(() => {});
  }, [tab, history, accessToken]);

  return (
    <div className="min-h-screen bg-canvas flex flex-col">
      <Header
        left={<HeaderLogo />}
        right={
          <HeaderIconButton onClick={() => setMenuOpen(true)} ariaLabel={t("lobby.menuOpen")}>
            <HamburgerIcon open={menuOpen} />
          </HeaderIconButton>
        }
      />

      {/* lg以上は「左ナビレール + コンテンツ」の2カラム、モバイルは従来の1カラム+下部ナビ。 */}
      <div className="mx-auto flex w-full max-w-4xl min-h-0 flex-1 flex-col lg:flex-row lg:gap-6 lg:px-6">
        <SideNav
          activeKey={tab === "tournaments" ? "history" : tab}
          items={[
            { key: "home", label: "Home", icon: "home", onClick: () => setTab("home") },
            { key: "stats", label: "Stats", icon: "stats", onClick: () => setTab("stats") },
            { key: "history", label: "History", icon: "history", onClick: () => setTab("history") },
            { key: "leaderboard", label: "Leaderboard", icon: "trophy", onClick: () => setTab("leaderboard") },
            { key: "database", label: "Database", icon: "db", href: "/geo" },
          ]}
        />

        <main className="min-h-0 min-w-0 flex-1 w-full overflow-y-auto px-4 pt-4 pb-28 space-y-5 lg:pb-10">
        {/* 参加中ゲームがあれば、どのタブでも最上段に常設して「必ず戻れる」導線にする。 */}
        {activeGameKey && (
          <button
            type="button"
            onClick={() => onJoin(activeGameKey)}
            aria-label={`${t("lobby.resume.title")} ${t("lobby.resume.cta")}`}
            className="group flex w-full items-center gap-3 rounded-2xl bg-n-4 px-4 py-3 text-left text-white shadow-e2 ring-1 ring-accent/30 pressable"
          >
            <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent/15">
              <span className="absolute inline-flex h-2.5 w-2.5 animate-ping rounded-full bg-accent-hi/70" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent-hi" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="text-[13px] font-bold">{t("lobby.resume.title")}</span>
                <span className="rounded-full bg-surface/80 px-2 py-[1px] text-[10px] font-bold tracking-wide text-accent-hi">
                  {t("lobby.resume.away")}
                </span>
              </span>
              <span className="mt-0.5 block truncate text-[11px] text-fg-2">
                {activeGameKey === "mtt" ? t("lobby.resume.mtt") : t("lobby.resume.sng")} ・ {t("lobby.resume.desc")}
              </span>
            </span>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent px-3.5 py-2 text-[12px] font-bold text-on-accent">
              {t("lobby.resume.cta")}
              <Icon name="arrow-right" className="h-3.5 w-3.5 transition-transform group-active:translate-x-0.5" />
            </span>
          </button>
        )}
        <AnimatePresence mode="wait">
        {tab === "home" && (
          <motion.div
            key="home"
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 12 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="space-y-5"
          >
            <GameStartButton onJoin={onJoin} devMtt={searchParams.get("mtt") === "dev"} />

            <PushOptInCard accessToken={accessToken} />

            <RRRatingCard
              displayName={displayName}
              avatarKey={avatarKey}
              data={rrRating}
              itmRate={stats?.itmRate ?? 0}
              totalBuyIns={stats?.totalBuyIns ?? 0}
              totalPayouts={stats?.totalPayouts ?? 0}
              history={tournamentHistory}
              onViewLeaderboard={() => setTab("leaderboard")}
              onViewHistory={() => setTab("tournaments")}
            />

            <RRPokerPromoBanner />

            <HackerCodeCard />

            <div className="pt-1">
              <p className="mt-1.5 text-center text-[10px] tabular-nums text-fg-3">
                <span className="text-accent">{"$ "}</span>
                poker-art --version {APP_VERSION} · Coffiest · © 2026 Poker ART
                <span className="term-cursor bg-fg-3" style={{ width: 5, height: 10, verticalAlign: "-1px" }} aria-hidden="true" />
              </p>
            </div>
          </motion.div>
        )}

        {tab === "stats" && (
          <motion.div
            key="stats"
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 12 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="space-y-3"
          >
            <TabHeader eyebrow="Your numbers" title="Stats" />

            {accessToken ? (
              stats ? (
                <>
                  {/* 収支サマリー(出典: uiverse.io by Gidarxの「アイコン付き見出し+仕切り線で
                      2分割された金額表記」を、獲得/参加費の2軸へ組み替えて適用。収支・ROIは
                      各列の下に色付きの差分表記として残し、タップで従来どおり説明モーダルを開ける)。 */}
                  <AnimatedCard delay={0.06}>
                    <div className="flex items-center gap-3 border-b border-line pb-4">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/15">
                        <Icon name="coins" className="h-5 w-5 text-accent" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[13px] font-bold text-fg">{t("lobby.sec.profit")}</p>
                        <p className="text-[10px] text-fg-3">
                          {t("stat.tournamentsPlayed")} {stats.tournamentsPlayed.toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex divide-x divide-line pt-4">
                      <div className="flex-1 pr-4">
                        <StatTile
                          label={t("stat.payouts")}
                          value={stats.totalPayouts.toLocaleString()}
                          countTo={stats.totalPayouts}
                          format={(n) => Math.round(n).toLocaleString()}
                          valueSize="lg"
                          onInfo={() => setInfoKey("payouts")}
                          captionValue={formatSigned(stats.profit)}
                          captionClass={signedClass(stats.profit)}
                          onCaptionInfo={() => setInfoKey("profit")}
                        />
                      </div>
                      <div className="flex-1 pl-4">
                        <StatTile
                          label={t("stat.buyIns")}
                          value={stats.totalBuyIns.toLocaleString()}
                          countTo={stats.totalBuyIns}
                          format={(n) => Math.round(n).toLocaleString()}
                          valueSize="lg"
                          onInfo={() => setInfoKey("buyIns")}
                          captionValue={`${stats.roi * 100 - 100 >= 0 ? "+" : ""}${(stats.roi * 100 - 100).toFixed(1)}%`}
                          captionClass={signedClass(stats.roi * 100 - 100)}
                          onCaptionInfo={() => setInfoKey("roi")}
                        />
                      </div>
                    </div>
                  </AnimatedCard>

                  <AnimatedCard delay={0.1}>
                    <div className="mb-3"><RuleLabel>{t("lobby.sec.tourneyResults")}</RuleLabel></div>
                    <div className="grid grid-cols-3 gap-x-2 gap-y-4">
                      <StatTile
                        label={t("stat.tournamentsPlayed")}
                        value={stats.tournamentsPlayed.toLocaleString()}
                        countTo={stats.tournamentsPlayed}
                        format={(n) => Math.round(n).toLocaleString()}
                        onInfo={() => setInfoKey("tournamentsPlayed")}
                      />
                      <StatTile
                        label={t("stat.itmCount")}
                        value={stats.itmCount.toLocaleString()}
                        countTo={stats.itmCount}
                        format={(n) => Math.round(n).toLocaleString()}
                        onInfo={() => setInfoKey("itmCount")}
                      />
                      <StatTile
                        label={t("stat.itmRate")}
                        value={`${(stats.itmRate * 100).toFixed(1)}%`}
                        countTo={stats.itmRate * 100}
                        format={(n) => `${n.toFixed(1)}%`}
                        onInfo={() => setInfoKey("itmRate")}
                      />
                    </div>
                  </AnimatedCard>

                  <AnimatedCard delay={0.14}>
                    <div className="mb-3"><RuleLabel>{t("lobby.sec.playstyle")}</RuleLabel></div>
                    <div className="grid grid-cols-3 gap-x-2 gap-y-4">
                      <StatTile
                        label={t("stat.vpip")}
                        value={`${(stats.vpipRate * 100).toFixed(0)}%`}
                        countTo={stats.vpipRate * 100}
                        format={(n) => `${n.toFixed(0)}%`}
                        onInfo={() => setInfoKey("vpip")}
                      />
                      <StatTile
                        label={t("stat.pfr")}
                        value={`${(stats.pfrRate * 100).toFixed(0)}%`}
                        countTo={stats.pfrRate * 100}
                        format={(n) => `${n.toFixed(0)}%`}
                        onInfo={() => setInfoKey("pfr")}
                      />
                      <StatTile
                        label={t("stat.threeBet")}
                        value={`${(stats.threeBetRate * 100).toFixed(0)}%`}
                        countTo={stats.threeBetRate * 100}
                        format={(n) => `${n.toFixed(0)}%`}
                        onInfo={() => setInfoKey("threeBet")}
                      />
                    </div>
                  </AnimatedCard>

                  {/* 収支推移グラフ(出典: uiverse.io by Gidarxの「アイコン付き見出し+背景オーラ+
                      発光ドットの折れ線」を、既存のROI/収支2チャートへ適用。ホバー限定だった
                      オーラは常時ごく薄く出す(タッチ端末にhoverは無いため)。 */}
                  <AnimatedCard delay={0.18}>
                    <div className="relative -m-4 overflow-hidden rounded-[20px] p-4">
                      <div className="pointer-events-none absolute -top-20 left-1/2 h-40 w-40 -translate-x-1/2 rounded-full bg-accent/10 blur-3xl" />

                      <div className="relative flex items-center gap-3 border-b border-line pb-4">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/15">
                          <Icon name="graph-up" className="h-5 w-5 text-accent" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[13px] font-bold text-fg">{t("lobby.sec.trend")}</p>
                          <p className="text-[10px] text-fg-3">
                            {t("lobby.recentTourneys")} · {TOURNEY_GRAPH_RANGES.find((r) => r.key === graphRangeKey)?.label}
                          </p>
                        </div>
                      </div>

                      <div className="relative pt-4">
                        {bankrollGraph === null ? (
                          <div className="space-y-6">
                            <ChartSkeleton />
                            <ChartSkeleton />
                          </div>
                        ) : (
                          <div className="space-y-6">
                            <SingleLineChart
                              title={t("stat.roi")}
                              color="#26C2A3" /* テーマのアクセント。1画面に1つだけ置く「主役」の色 */
                              points={bankrollGraph.map((p) => ({ x: p.tournamentIndex, y: Math.round(p.roi * 1000) / 10 }))}
                              baseline={100}
                              formatValue={(v) => `${v.toFixed(1)}%`}
                              deltaFormat={(v) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}pt`}
                              onInfo={() => setInfoKey("graphRoi")}
                            />
                            <SingleLineChart
                              title={t("stat.profit")}
                              color="#F5F5F7"
                              points={bankrollGraph.map((p) => ({ x: p.tournamentIndex, y: p.cumulativeProfit }))}
                              baseline={0}
                              formatValue={(v) => formatSigned(v)}
                              onInfo={() => setInfoKey("graphProfit")}
                            />
                          </div>
                        )}

                        <div className="mt-4 flex justify-center">
                          <SegmentedTabs
                            ariaLabel={t("lobby.recentTourneys")}
                            items={TOURNEY_GRAPH_RANGES.map((r) => ({ key: r.key, label: r.label }))}
                            value={graphRangeKey}
                            onChange={setGraphRangeKey}
                          />
                        </div>
                      </div>
                    </div>
                  </AnimatedCard>
                </>
              ) : (
                <ListSkeleton />
              )
            ) : (
              <div className="py-10 text-center text-n-9 text-sm">{t("lobby.needLoginStats")}</div>
            )}
          </motion.div>
        )}

        {tab === "leaderboard" && (
          <motion.div
            key="leaderboard"
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 12 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            <TabHeader eyebrow="Ranking" title="Leaderboard" />

            {/* 期間タブ(Weekly / All Time / 直近10)。 */}
            <SegmentedTabs
              className="mb-3"
              ariaLabel="集計期間"
              items={LB_PERIODS.map((p) => ({ key: p.key, label: t(p.labelKey) }))}
              value={lbPeriod}
              onChange={setLbPeriod}
            />

            {/* 指標セレクタ(収支 / ROI / 偏差値 / インマネ率)。 */}
            <SegmentedTabs
              className="mb-4"
              ariaLabel="ランキング指標"
              items={LB_METRICS.map((m) => ({ key: m.key, label: t(m.labelKey) }))}
              value={lbMetric}
              onChange={setLbMetric}
            />

            <SectionCard>
              {(() => {
                if (leaderboards === null) {
                  return <ListSkeleton />;
                }
                const rows = [...leaderboards[lbPeriod]].sort((a, b) => {
                  const av = a[lbMetric];
                  const bv = b[lbMetric];
                  return bv - av;
                });
                if (rows.length === 0) {
                  return (
                    <EmptyState
                      icon="trophy"
                      title={t("lobby.lb.emptyTitle")}
                      subtitle={t("lobby.lb.emptySub")}
                    />
                  );
                }
                return (
                  <div className="space-y-2">
                    {rows.map((row, i) => {
                      const isYou = userId != null && row.userId === userId;
                      const primary = formatLbMetric(row, lbMetric);
                      const primaryClass =
                        lbMetric === "profit" ? signedClass(row.profit) : "text-fg";
                      return (
                        <motion.button
                          key={row.userId}
                          type="button"
                          onClick={() =>
                            setLbTapped({ userId: row.userId, displayName: row.displayName, avatarKey: row.avatarKey })
                          }
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.3, delay: Math.min(i * 0.03, 0.45) }}
                          className={`flex w-full items-center gap-3 rounded-xl bg-surface px-3 py-2.5 text-left pressable ${
                            isYou ? "border-[1.5px] border-accent" : "border border-line"
                          }`}
                        >
                          <div className="w-6 text-center text-sm font-bold tabular-nums text-n-10">{i + 1}</div>
                          <Avatar avatarKey={row.avatarKey} size={30} />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-fg truncate">
                              {row.displayName}
                              {isYou && <span className="text-accent text-[10px] ml-1">{t("lobby.you")}</span>}
                            </div>
                            <div className="text-[10px] text-n-9 tabular-nums">{t("lobby.nTournaments", { n: row.tournamentsPlayed })}</div>
                          </div>
                          <div className="text-right">
                            <div className={`text-sm font-bold tabular-nums ${primaryClass}`}>{primary}</div>
                            <div className="text-[10px] text-n-9 tabular-nums">
                              {lbMetric !== "profit" && `${t("result.m.profit")} ${formatSigned(row.profit)}`}
                              {lbMetric === "profit" && `ROI ${(row.roi * 100).toFixed(0)}%`}
                            </div>
                          </div>
                        </motion.button>
                      );
                    })}
                  </div>
                );
              })()}
            </SectionCard>
          </motion.div>
        )}

        {tab === "history" && (
          <motion.div
            key="history"
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 12 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            <TabHeader eyebrow="Every hand" title="Hand History" />
            {/* ハンド履歴 / トーナメント履歴の切替。過去トナメは各カードから棋譜解析へ飛べる。 */}
            <SegmentedTabs
              className="mb-3"
              ariaLabel="履歴の種類"
              items={[
                { key: "hands", label: t("lobby.historyView.hands") },
                { key: "tournaments", label: t("lobby.historyView.tourneys") },
              ]}
              value={historyView}
              onChange={setHistoryView}
            />
            {historyView === "tournaments" ? (
              <TournamentResultsSection accessToken={accessToken} tournamentHistory={tournamentHistory} />
            ) : (
            <SectionCard>
              {!accessToken ? (
                <div className="py-10 text-center text-n-9 text-sm">{t("lobby.needLoginHistory")}</div>
              ) : history === null ? (
                <ListSkeleton />
              ) : (
                <>
                  <SegmentedTabs
                    className="mb-3"
                    ariaLabel="履歴の絞り込み"
                    items={[
                      { key: "all", label: t("lobby.all") },
                      { key: "favorites", label: t("lobby.favorites") },
                    ]}
                    value={historySubTab}
                    onChange={setHistorySubTab}
                  />

                  {(() => {
                    const rows = historySubTab === "favorites" ? history.filter((h) => h.isFavorite) : history;
                    if (rows.length === 0) {
                      return historySubTab === "favorites" ? (
                        <EmptyState
                          icon="star"
                          title={t("lobby.hist.favEmptyTitle")}
                          subtitle={t("lobby.hist.favEmptySub")}
                        />
                      ) : (
                        <EmptyState
                          icon="cards"
                          title={t("lobby.hist.emptyTitle")}
                          subtitle={t("lobby.hist.emptySub")}
                        />
                      );
                    }
                    const groups: { tournamentId: string; tournamentLabel: string; rows: HistoryRow[] }[] = [];
                    for (const h of rows) {
                      const last = groups[groups.length - 1];
                      if (last && last.tournamentId === h.tournamentId) last.rows.push(h);
                      else groups.push({ tournamentId: h.tournamentId, tournamentLabel: h.tournamentLabel, rows: [h] });
                    }
                    return (
                      <div className="space-y-4">
                        {groups.map((group) => (
                          <div key={group.tournamentId}>
                            <div className="flex items-center justify-between gap-2 mb-2 px-0.5">
                              <p className="min-w-0 flex-1 truncate text-[12px] font-semibold text-n-9">{group.tournamentLabel}</p>
                              {/* 卓(大会)単位の棋譜解析。行タップと同じ導線を、まとめ入口としても明示する。 */}
                              <button
                                onClick={() => setReviewTournamentId(group.tournamentId)}
                                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-n-4 pl-2.5 pr-3 text-[11px] font-bold text-white transition-opacity pressable"
                              >
                                <ReviewGlyph className="h-3.5 w-3.5" />
                                {t("lobby.reviewHand")}
                              </button>
                            </div>
                            <div className="space-y-2">
                              {group.rows.map((h, i) => {
                                const deltaBb = h.bigBlind > 0 ? h.deltaChips / h.bigBlind : 0;
                                const rounded = Math.round(deltaBb * 10) / 10;
                                const label = rounded === 0 ? "±0bb" : `${rounded > 0 ? "+" : ""}${rounded}bb`;
                                // ハンド行そのものをタップで棋譜解析へ(トナメ単位の解析に一本化済み)。
                                // お気に入り★だけは行タップと分離するため stopPropagation する。
                                const openReview = () => setReviewTournamentId(group.tournamentId);
                                return (
                                  <motion.div
                                    key={h.handId}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.3, delay: Math.min(i * 0.03, 0.3) }}
                                    role="button"
                                    tabIndex={0}
                                    onClick={openReview}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        openReview();
                                      }
                                    }}
                                    aria-label={`${group.tournamentLabel} ${t("lobby.reviewRowHint")}`}
                                    className="group cursor-pointer rounded-xl glass-panel px-3 py-2.5 transition-colors hover:border-line hover:bg-canvas active:bg-n-2 focus-visible:border-line-strong"
                                  >
                                    <div className="flex items-center gap-2 text-[11px] text-n-9 mb-1.5">
                                      <span className="tabular-nums">
                                        {new Date(h.playedAt).toLocaleString("ja-JP", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                                      </span>
                                      <span className="rounded glass-panel px-1.5 py-[1px] text-[11px] text-fg font-semibold">{h.position}</span>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          toggleFavorite(h.handId, !h.isFavorite);
                                        }}
                                        aria-label={h.isFavorite ? t("lobby.unfavorite") : t("lobby.favorite")}
                                        className="pressable ml-auto -my-1.5 grid h-9 w-9 place-items-center rounded-full text-accent transition-colors hover:bg-accent/10"
                                      >
                                        <Icon name="star" className="h-4 w-4" filled={h.isFavorite} />
                                      </button>
                                    </div>
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="flex items-center gap-1">
                                        {h.holeCards.map((c, i) => (
                                          <PlayingCard key={i} card={c} size="sm" dealDelay={0} />
                                        ))}
                                        <span className="w-1.5" />
                                        {h.board.map((c, i) => (
                                          <PlayingCard key={`b-${i}`} card={c} size="sm" dealDelay={0} />
                                        ))}
                                      </div>
                                      <div className={`text-sm font-bold tabular-nums shrink-0 ${signedClass(h.deltaChips)}`}>{label}</div>
                                    </div>
                                    {/* 行がタップ可能=棋譜解析へ、を明示するヒント。 */}
                                    <div className="mt-1.5 flex items-center justify-end gap-1 text-[11px] font-semibold text-accent">
                                      <ReviewGlyph className="h-3 w-3" />
                                      <span>{t("lobby.reviewRowHint")}</span>
                                      <Icon name="chevron-right" className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                                    </div>
                                  </motion.div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </>
              )}
            </SectionCard>
            )}
          </motion.div>
        )}

        {tab === "tournaments" && (
          <motion.div
            key="tournaments"
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 12 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            <TabHeader eyebrow="Results" title="Tournaments" />
            <TournamentResultsSection accessToken={accessToken} tournamentHistory={tournamentHistory} />
          </motion.div>
        )}
        </AnimatePresence>

        </main>
      </div>

      {/* 下部フッターナビはモバイル/タブレットのみ。lg以上は左のSideNavが担う。 */}
      <div className="lg:hidden">
        <Footer
          activeKey={tab}
          centerHref="/geo"
          items={[
            { key: "home", label: "Home", icon: "home", onClick: () => setTab("home") },
            { key: "stats", label: "Stats", icon: "stats", onClick: () => setTab("stats") },
            { key: "history", label: "History", icon: "history", onClick: () => setTab("history") },
            { key: "leaderboard", label: "Leaderboard", icon: "trophy", onClick: () => setTab("leaderboard") },
          ]}
        />
      </div>

      {stats && infoKey && <StatInfoModal info={buildStatInfo(infoKey, stats, t)} onClose={() => setInfoKey(null)} />}
      <AnimatePresence>
        {menuOpen && (
          <HamburgerMenu
            displayName={displayName}
            avatarKey={avatarKey}
            email={email}
            providers={providers}
            isGuest={!accessToken}
            accessToken={accessToken}
            onClose={() => setMenuOpen(false)}
            onEditProfile={() => {
              setMenuOpen(false);
              onEditProfile();
            }}
            onSignOut={
              onSignOut
                ? () => {
                    setMenuOpen(false);
                    onSignOut();
                  }
                : undefined
            }
            onAccountDeleted={() => {
              setMenuOpen(false);
              onAccountDeleted?.();
            }}
          />
        )}
      </AnimatePresence>

      {/* リーダーボードのプレイヤーをタップ→そのプレイヤーのスタッツ詳細(卓上と同じモーダル)。 */}
      <AnimatePresence>
        {lbTapped && (
          <PlayerDetailModal
            target={lbTapped}
            accessToken={accessToken}
            onClose={() => setLbTapped(null)}
          />
        )}
      </AnimatePresence>

      {/* Historyタブから開く棋譜解析モーダル(総括→再生)。 */}
      <AnimatePresence>
        {reviewTournamentId && (
          <TournamentReviewModal
            tournamentId={reviewTournamentId}
            accessToken={accessToken}
            onClose={() => setReviewTournamentId(null)}
          />
        )}
      </AnimatePresence>

      {/* GEO DATABASE 解放のお知らせ(小さめトースト)。タップで database タブ(/geo)へ。 */}
      <AnimatePresence>
        {showGeoToast && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+84px)] z-40 flex justify-center px-4 lg:bottom-6"
          >
            <Link
              href="/geo"
              onClick={() => setShowGeoToast(false)}
              className="flex max-w-[360px] items-center gap-3 rounded-2xl border border-n-5 bg-n-4 px-4 py-3 text-left shadow-e3"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent text-on-accent">
                {/* データベースアイコン(絵文字禁止のためSVG) */}
                <Icon name="db" className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-[12.5px] font-black leading-tight text-white">GEO DATABASE が解放されました</span>
                <span className="mt-0.5 block text-[11px] leading-snug text-white/70">database タブから使ってみましょう →</span>
              </span>
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
