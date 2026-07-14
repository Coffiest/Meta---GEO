"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import type { GameKey } from "@/lib/socket";
import { APP_VERSION } from "@/lib/version";
import { Avatar } from "./Avatar";
import { BlindStructureSheet } from "./BlindStructureSheet";
import { HamburgerIcon, Header, HeaderIconButton, HeaderLogo } from "./Header";
import { Footer } from "./Footer";
import { Icon } from "./Icon";
import { PlayButton } from "./PlayButton";
import { PlayingCard } from "./PlayingCard";
import { GAME_TYPE_LABEL, RRRatingCard, RuleLabel, displayRating, type RRRatingData, type TournamentHistoryPoint } from "./RRRatingCard";
import { HomeGreeting } from "./HomeGreeting";
import { ChartSkeleton, ListSkeleton } from "./Skeleton";
import { useCountUp } from "@/lib/useCountUp";

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

const LB_PERIODS: { key: LbPeriod; label: string }[] = [
  { key: "weekly", label: "Weekly" },
  { key: "allTime", label: "All Time" },
  { key: "last10", label: "直近10" },
];

const LB_METRICS: { key: LbMetric; label: string }[] = [
  { key: "profit", label: "収支" },
  { key: "roi", label: "ROI" },
  { key: "rrRating", label: "トナメ偏差値" },
  { key: "itmRate", label: "インマネ率" },
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

// サーバー側(packages/server/src/lobby.ts)のGAME_CONFIGSと一致させてある表示用の定義。
// 実際に使われる金額はサーバー側の許可リストが常に正となる(クライアント側の値は表示のみ)。
// 「SNG」は分かりづらいため、表記は常に「Sit & Go (Single table)」に統一する。
const GAMES: { key: GameKey; title: string; caption?: string; buyIn: number; detail: string }[] = [
  {
    key: "sng",
    title: "Sit & Go",
    caption: "(Single table)",
    buyIn: 1000,
    detail: "6人卓・シングルテーブル",
  },
  {
    key: "mtt",
    title: "MTT",
    buyIn: 2000,
    detail: "人数無制限・レイトレジ対応",
  },
];

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
  return n > 0 ? "text-mint-400" : n < 0 ? "text-crimson-400" : "text-ink-900";
}

function SectionCard({ children }: { children: React.ReactNode }) {
  return <div className="rounded-[20px] bg-white ring-[1.5px] ring-ink-950 p-4">{children}</div>;
}

/**
 * 各タブ共通の大胆なヘッダー。ゴールドのアイブロウ(マイクロラベル)+特大の黒タイトル+
 * ゴールドのピリオドで、Stats/History/Leaderboard を統一した商業レベルの見出しにする。
 * ホーム画面のHomeGreetingと同じタイポ言語(黒特大・字間タイト・北欧/Apple風)。 */
function TabHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="mb-5 mt-1"
    >
      <div className="flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-gold-500" />
        <span className="text-[10px] font-black uppercase tracking-[0.28em] text-ink-400">{eyebrow}</span>
      </div>
      <h1 className="mt-1.5 text-[34px] font-black leading-none tracking-tight text-ink-950">
        {title}
        <span className="text-gold-500">.</span>
      </h1>
    </motion.div>
  );
}

/** ホーム画面のRRRatingCardと同じ、黒フチ+白背景のSwissカード。フェードアップで順にstagger表示する。 */
function AnimatedCard({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-[20px] bg-white ring-[1.5px] ring-ink-950 p-4"
    >
      {children}
    </motion.div>
  );
}

/**
 * RRPokerの/home/tournaments一覧カードと同じ構成(名前・日付→着順バッジ→バイイン/獲得/収支)。
 * タップするとトナメ偏差値の推移(その回の変動)まで含めた詳細シートが開く。
 */
function TournamentHistoryCard({ point, delay = 0 }: { point: TournamentHistoryPoint; delay?: number }) {
  const [open, setOpen] = useState(false);
  const date = new Date(point.finishedAt);
  const pnlClass = point.pnl > 0 ? "text-mint-600" : point.pnl < 0 ? "text-crimson-500" : "text-ink-700";

  return (
    <>
      <motion.button
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay }}
        onClick={() => setOpen(true)}
        className="w-full text-left rounded-[18px] bg-white ring-[1.5px] ring-ink-950 p-3.5"
      >
        <div className="flex items-start justify-between mb-2.5">
          <div className="min-w-0">
            <p className="text-[13px] font-bold text-ink-950">{GAME_TYPE_LABEL[point.gameType] ?? point.gameType}</p>
            <p className="text-[10px] text-ink-600 mt-0.5">
              {date.toLocaleDateString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit" })} ・ {point.seatCount}人卓
            </p>
          </div>
          {point.finishPosition != null && (
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-gold-400 to-gold-600 flex items-center justify-center shrink-0">
              <span className="text-[11px] font-black text-white">{point.finishPosition}位</span>
            </div>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2 mb-2">
          <div className="rounded-xl border border-ink-950 bg-white p-2 text-center">
            <p className="text-[9px] text-ink-600 mb-0.5">バイイン</p>
            <p className="text-[12px] font-bold text-ink-950 tabular-nums">{point.buyIn.toLocaleString()}</p>
          </div>
          <div className="rounded-xl border border-ink-950 bg-white p-2 text-center">
            <p className="text-[9px] text-ink-600 mb-0.5">獲得</p>
            <p className="text-[12px] font-bold text-ink-950 tabular-nums">{point.payout.toLocaleString()}</p>
          </div>
          <div className="rounded-xl border border-ink-950 bg-white p-2 text-center">
            <p className="text-[9px] text-ink-600 mb-0.5">収支</p>
            <p className={`text-[12px] font-bold tabular-nums ${pnlClass}`}>{formatSigned(point.pnl)}</p>
          </div>
        </div>
        <div className="text-right text-[10px] text-ink-500">タップで詳細 →</div>
      </motion.button>

      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setOpen(false)}>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/50"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="relative w-full max-w-sm rounded-t-3xl bg-white pb-[calc(env(safe-area-inset-bottom)+20px)] pt-5 px-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <p className="text-[16px] font-bold text-ink-950">{GAME_TYPE_LABEL[point.gameType] ?? point.gameType}</p>
                <button onClick={() => setOpen(false)} className="text-[13px] text-ink-500">
                  閉じる
                </button>
              </div>
              <p className="text-[12px] text-ink-600 mb-4">
                {date.toLocaleDateString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit" })} ・ {point.seatCount}人卓
                {point.finishPosition != null && ` ・ ${point.finishPosition}位`}
              </p>
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="rounded-xl border border-ink-950 bg-white p-3 text-center">
                  <p className="text-[10px] text-ink-600 mb-1">バイイン</p>
                  <p className="text-[14px] font-bold text-ink-950 tabular-nums">{point.buyIn.toLocaleString()}</p>
                </div>
                <div className="rounded-xl border border-ink-950 bg-white p-3 text-center">
                  <p className="text-[10px] text-ink-600 mb-1">獲得</p>
                  <p className="text-[14px] font-bold text-ink-950 tabular-nums">{point.payout.toLocaleString()}</p>
                </div>
                <div className="rounded-xl border border-ink-950 bg-white p-3 text-center">
                  <p className="text-[10px] text-ink-600 mb-1">収支</p>
                  <p className={`text-[14px] font-bold tabular-nums ${pnlClass}`}>{formatSigned(point.pnl)}</p>
                </div>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-gold-500 bg-white px-3.5 py-3">
                <span className="text-[12px] font-semibold text-gold-700">トナメ偏差値</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[16px] font-black text-gold-700 tabular-nums">{displayRating(point.rrRatingAfter)}</span>
                  {point.rrRatingDelta != null && Math.abs(point.rrRatingDelta) >= 0.01 && (
                    <span
                      className={`text-[11px] font-bold rounded-md px-1.5 py-0.5 tabular-nums ${
                        point.rrRatingDelta >= 0 ? "text-mint-700 bg-mint-500/10" : "text-crimson-700 bg-crimson-500/10"
                      }`}
                    >
                      {point.rrRatingDelta >= 0 ? "+" : ""}
                      {point.rrRatingDelta.toFixed(2)}
                    </span>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

function InfoIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5M12 8v.01" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
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
}: {
  label: string;
  value: string;
  valueClass?: string;
  onInfo?: () => void;
  /** 指定すると 0→countTo をカウントアップ表示する(表示は format で整形)。 */
  countTo?: number;
  format?: (n: number) => string;
}) {
  const animated = useCountUp(0, countTo ?? 0, 1100, 200);
  const display = countTo !== undefined && format ? format(animated) : value;
  return (
    <div>
      <div className="flex items-center gap-1 text-[11px] text-ink-700">
        <span>{label}</span>
        {onInfo && (
          <button onClick={onInfo} className="text-ink-600 active:text-ink-800" aria-label={`${label}の説明`}>
            <InfoIcon />
          </button>
        )}
      </div>
      <div className={`text-lg font-bold tabular-nums ${valueClass ?? "text-ink-950"}`}>{display}</div>
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
  | "graphProfit"
  | "graphPayout";

function buildStatInfo(key: StatInfoKey, s: PlayerStats): StatInfoDef {
  switch (key) {
    case "buyIns":
      return {
        title: "かけた金額",
        value: s.totalBuyIns.toLocaleString(),
        description: "終了した全トーナメントのバイイン(参加費)の合計額です。",
      };
    case "payouts":
      return {
        title: "得た金額",
        value: s.totalPayouts.toLocaleString(),
        description: "入賞して受け取った賞金の合計額です。入賞していないトーナメントは0として計算されます。",
      };
    case "profit":
      return {
        title: "収支",
        value: formatSigned(s.profit),
        description: "得た金額 − かけた金額。プラスなら黒字、マイナスなら赤字です。",
      };
    case "roi":
      return {
        title: "ROI",
        subtitle: "Return on Investment",
        value: `${(s.roi * 100).toFixed(1)}%`,
        description:
          "得た金額 ÷ かけた金額 × 100。100%が収支±0のラインで、100%を超えていれば黒字です(例: 10,000かけて15,000得たら150%)。",
      };
    case "tournamentsPlayed":
      return {
        title: "参加トナメ数",
        value: s.tournamentsPlayed.toLocaleString(),
        description: "終了したトーナメントへの参加回数です。",
      };
    case "itmCount":
      return {
        title: "インマネ回数",
        subtitle: "In The Money",
        value: s.itmCount.toLocaleString(),
        description: "賞金を獲得して入賞した回数です。",
      };
    case "itmRate":
      return {
        title: "インマネ率",
        value: `${(s.itmRate * 100).toFixed(1)}%`,
        description: "インマネ回数 ÷ 参加トナメ数 × 100。例: 10回参加して3回入賞していれば30%です。",
      };
    case "vpip":
      return {
        title: "VPIP",
        subtitle: "Voluntarily Put chips In Pot",
        value: `${(s.vpipRate * 100).toFixed(0)} (${s.vpipCount.toLocaleString()}/${s.vpipOpportunities.toLocaleString()})`,
        description: "プリフロップで自発的にチップを投入した割合です。",
        breakdown: {
          execLabel: "実行回数",
          execDesc: "コールまたはレイズを行ったハンド数",
          oppLabel: "実行機会",
          oppDesc: "参加した全ハンド数",
        },
        notes: [
          "ブラインドの強制投入は回数・機会に含まない。",
          "BBがアンレイズドポットでチェックしたハンドは回数・機会に含まない。",
        ],
      };
    case "pfr":
      return {
        title: "PFR",
        subtitle: "Preflop Raise",
        value: `${(s.pfrRate * 100).toFixed(0)} (${s.pfrCount.toLocaleString()}/${s.pfrOpportunities.toLocaleString()})`,
        description: "プリフロップでレイズした割合です。",
        breakdown: {
          execLabel: "実行回数",
          execDesc: "レイズを行ったハンド数",
          oppLabel: "実行機会",
          oppDesc: "参加した全ハンド数",
        },
        notes: ["BBがアンレイズドポットでチェックしたハンドは回数・機会に含まない。"],
      };
    case "threeBet":
      return {
        title: "3Bet",
        subtitle: "Preflop Reraise",
        value: `${(s.threeBetRate * 100).toFixed(0)} (${s.threeBetCount.toLocaleString()}/${s.threeBetOpportunities.toLocaleString()})`,
        description: "最初のレイズに対してリレイズをした割合です。",
        breakdown: {
          execLabel: "実行回数",
          execDesc: "一人目のレイズの後、レイズを行ったハンド数",
          oppLabel: "実行機会",
          oppDesc: "自分の前にレイズが1回だけ行われたハンド数",
        },
        notes: ["自分の前に誰もレイズをしていない場合は実行機会に含まない。", "既に2回以上レイズがある場合は実行機会に含まない。"],
      };
    case "graphRoi":
      return {
        title: "ROIグラフ",
        subtitle: "Return on Investment",
        value: "",
        description:
          "終了したトーナメントごとに、その時点までの累計ROI(得た金額 ÷ かけた金額 × 100)の推移を表示しています。破線の100%が収支±0のラインで、それより上なら黒字です。",
      };
    case "graphProfit":
      return {
        title: "収支グラフ",
        value: "",
        description:
          "終了したトーナメントごとの収支(得た金額 − かけた金額)の累計推移です。破線の0より上なら黒字、下なら赤字です(実額ベース・bb換算なし)。",
      };
    case "graphPayout":
      return {
        title: "得た金額グラフ",
        value: "",
        description: "入賞して受け取った賞金の累計推移です。入賞していないトーナメントでは増えません(実額ベース)。",
      };
  }
}

function StatInfoModal({ info, onClose }: { info: StatInfoDef; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md rounded-t-3xl bg-ink-100 ring-1 ring-ink-400 p-5 pb-[calc(env(safe-area-inset-bottom)+20px)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-3">
          <div>
            <h2 className="text-base font-bold text-ink-950">{info.title}</h2>
            {info.subtitle && <p className="text-[11px] text-ink-600">{info.subtitle}</p>}
          </div>
          <button onClick={onClose} className="text-ink-700 text-xl leading-none px-2" aria-label="閉じる">
            ×
          </button>
        </div>

        {info.value && <div className="text-2xl font-bold tabular-nums text-ink-950 mb-3">{info.value}</div>}
        <p className="text-sm text-ink-800 mb-4">{info.description}</p>

        {info.breakdown && (
          <div className="rounded-xl bg-ink-300/70 divide-y divide-ink-400 mb-3">
            <div className="px-3 py-2.5">
              <div className="text-[11px] text-mint-400 font-semibold">{info.breakdown.execLabel}</div>
              <div className="text-xs text-ink-800 mt-0.5">{info.breakdown.execDesc}</div>
            </div>
            <div className="px-3 py-2.5">
              <div className="text-[11px] text-mint-400 font-semibold">{info.breakdown.oppLabel}</div>
              <div className="text-xs text-ink-800 mt-0.5">{info.breakdown.oppDesc}</div>
            </div>
          </div>
        )}

        {info.notes && info.notes.length > 0 && (
          <div className="rounded-xl bg-ink-300/40 px-3 py-2.5 space-y-1">
            {info.notes.map((n, i) => (
              <p key={i} className="text-[11px] text-ink-600">
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
  onInfo,
}: {
  title: string;
  color: string;
  points: { x: number; y: number }[];
  baseline: number;
  formatValue: (v: number) => string;
  onInfo?: () => void;
}) {
  const header = (
    <div className="flex items-center gap-1.5 mb-1">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      <span className="text-xs font-semibold text-ink-850">{title}</span>
      {points.length >= 2 && (
        <span className="ml-auto text-xs font-bold tabular-nums text-ink-900">{formatValue(points[points.length - 1]!.y)}</span>
      )}
      {onInfo && (
        <button onClick={onInfo} className={`text-ink-600 active:text-ink-800 ${points.length >= 2 ? "" : "ml-auto"}`} aria-label={`${title}の説明`}>
          <InfoIcon />
        </button>
      )}
    </div>
  );

  if (points.length < 2) {
    return (
      <div>
        {header}
        <div className="py-6 text-center text-ink-600 text-xs">グラフ表示にはもう少しトーナメント数が必要です。</div>
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
            <line x1={padLeft} y1={toY(tick)} x2={width} y2={toY(tick)} stroke="currentColor" strokeWidth={0.5} className="text-ink-400" />
            <text x={padLeft - 6} y={toY(tick) + 3} textAnchor="end" className="fill-ink-600" style={{ fontSize: 8 }}>
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
          className="text-ink-600"
        />

        <path d={areaPath} fill={`url(#${gradId})`} stroke="none" />
        <path d={linePath} fill="none" stroke={color} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />

        {xTickIdx.map((i) => (
          <text key={i} x={toX(i)} y={height - 2} textAnchor="middle" className="fill-ink-600" style={{ fontSize: 8 }}>
            {points[i]!.x}
          </text>
        ))}
      </svg>
    </div>
  );
}

export { Icon };

/** ヘッダー右上のハンバーガーメニューから開くボトムシート。旧Mypageタブの機能をここに集約する。 */
/** "google" → "Google" のようにプロバイダ名を表示用ラベルに変換する。 */
function providerLabel(provider: string): string {
  if (provider === "google") return "Google";
  if (provider === "apple") return "Apple";
  if (provider === "email") return "メール";
  return provider;
}

function HamburgerMenu({
  displayName,
  avatarKey,
  email,
  providers,
  isGuest,
  onClose,
  onEditProfile,
  onOpenStructure,
  onSignOut,
}: {
  displayName: string;
  avatarKey: string | null;
  email?: string | null;
  providers?: string[];
  isGuest: boolean;
  onClose: () => void;
  onEditProfile: () => void;
  onOpenStructure: () => void;
  onSignOut?: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 300 }}
        className="relative h-full w-[82%] max-w-sm bg-ink-100 ring-1 ring-ink-400 pt-6 pb-[calc(env(safe-area-inset-bottom)+20px)] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 flex items-center gap-3 mb-2">
          <Avatar avatarKey={avatarKey} displayName={displayName} size={48} />
          <div className="min-w-0">
            <div className="text-base font-semibold text-ink-950 truncate">{displayName}</div>
            {email ? (
              <div className="text-xs text-ink-700 truncate">{email}</div>
            ) : (
              isGuest && <div className="text-xs text-ink-600">ゲストプレイ中</div>
            )}
            {/* どのアカウントでログイン中かを常に確認できるよう、連携済みプロバイダを明示する */}
            {providers && providers.length > 0 && (
              <div className="text-[10px] text-ink-600 truncate">
                {providers.map(providerLabel).join(" / ")} でログイン中
              </div>
            )}
          </div>
        </div>
        <div className="px-2 mt-2 divide-y divide-ink-300">
          <button onClick={onEditProfile} className="w-full flex items-center justify-between px-3 py-3.5 text-sm text-ink-900">
            プロフィールを編集 <span className="text-ink-600">›</span>
          </button>
          <button onClick={onOpenStructure} className="w-full flex items-center justify-between px-3 py-3.5 text-sm text-ink-900">
            ブラインドストラクチャ <span className="text-ink-600">›</span>
          </button>
          <Link href="/geo" onClick={onClose} className="w-full flex items-center justify-between px-3 py-3.5 text-sm text-ink-900">
            GEOデータベース <span className="text-ink-600">›</span>
          </Link>
          {onSignOut && (
            <button onClick={onSignOut} className="w-full flex items-center justify-between px-3 py-3.5 text-sm text-crimson-400">
              ログアウト <span className="text-ink-600">›</span>
            </button>
          )}
        </div>
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
}: {
  displayName: string;
  avatarKey: string | null;
  email?: string | null;
  providers?: string[];
  userId?: string | null;
  accessToken?: string;
  onJoin: (gameKey: GameKey) => void;
  onEditProfile: () => void;
  onSignOut?: () => void;
}) {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => tabFromQuery(searchParams.get("tab")) ?? "home");
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [rrRating, setRRRating] = useState<RRRatingData | null>(null);
  const [tournamentHistory, setTournamentHistory] = useState<TournamentHistoryPoint[] | null>(null);
  const [bankrollGraph, setBankrollGraph] = useState<BankrollGraphPoint[] | null>(null);
  const [graphRangeKey, setGraphRangeKey] = useState<string>("all");
  const [infoKey, setInfoKey] = useState<StatInfoKey | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [leaderboards, setLeaderboards] = useState<Leaderboards | null>(null);
  const [lbPeriod, setLbPeriod] = useState<LbPeriod>("allTime");
  const [lbMetric, setLbMetric] = useState<LbMetric>("profit");
  const [history, setHistory] = useState<HistoryRow[] | null>(null);
  const [historySubTab, setHistorySubTab] = useState<"all" | "favorites">("all");
  const [structureOpen, setStructureOpen] = useState(false);

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
    <div className="min-h-screen bg-ink-50 flex flex-col">
      <Header
        left={<HeaderLogo />}
        right={
          <HeaderIconButton onClick={() => setMenuOpen(true)} ariaLabel="メニューを開く">
            <HamburgerIcon />
          </HeaderIconButton>
        }
      />

      <main className="flex-1 overflow-y-auto px-4 pt-4 pb-28 space-y-5">
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
            <HomeGreeting displayName={displayName} />

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

            <div className="pt-1">
              <p className="mt-1.5 text-center text-[10px] tabular-nums text-ink-400">
                v{APP_VERSION} ・ 作成者: Coffiest ・ © 2026 Poker ART
              </p>
            </div>
            {/* プレイボタンは下の固定バーに常時表示されるため、ここでは末尾に余白だけ確保する */}
            <div className="h-20" aria-hidden />
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
                  <AnimatedCard delay={0.06}>
                    <div className="mb-3"><RuleLabel>収支</RuleLabel></div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-4">
                      <StatTile
                        label="かけた金額"
                        value={stats.totalBuyIns.toLocaleString()}
                        countTo={stats.totalBuyIns}
                        format={(n) => Math.round(n).toLocaleString()}
                        onInfo={() => setInfoKey("buyIns")}
                      />
                      <StatTile
                        label="得た金額"
                        value={stats.totalPayouts.toLocaleString()}
                        countTo={stats.totalPayouts}
                        format={(n) => Math.round(n).toLocaleString()}
                        onInfo={() => setInfoKey("payouts")}
                      />
                      <StatTile
                        label="収支"
                        value={formatSigned(stats.profit)}
                        countTo={stats.profit}
                        format={(n) => formatSigned(Math.round(n))}
                        valueClass={signedClass(stats.profit)}
                        onInfo={() => setInfoKey("profit")}
                      />
                      <StatTile
                        label="ROI"
                        value={`${(stats.roi * 100).toFixed(1)}%`}
                        countTo={stats.roi * 100}
                        format={(n) => `${n.toFixed(1)}%`}
                        valueClass={signedClass(stats.roi * 100 - 100)}
                        onInfo={() => setInfoKey("roi")}
                      />
                    </div>
                  </AnimatedCard>

                  <AnimatedCard delay={0.1}>
                    <div className="mb-3"><RuleLabel>トーナメント成績</RuleLabel></div>
                    <div className="grid grid-cols-3 gap-x-2 gap-y-4">
                      <StatTile
                        label="参加トナメ数"
                        value={stats.tournamentsPlayed.toLocaleString()}
                        countTo={stats.tournamentsPlayed}
                        format={(n) => Math.round(n).toLocaleString()}
                        onInfo={() => setInfoKey("tournamentsPlayed")}
                      />
                      <StatTile
                        label="インマネ回数"
                        value={stats.itmCount.toLocaleString()}
                        countTo={stats.itmCount}
                        format={(n) => Math.round(n).toLocaleString()}
                        onInfo={() => setInfoKey("itmCount")}
                      />
                      <StatTile
                        label="インマネ率"
                        value={`${(stats.itmRate * 100).toFixed(1)}%`}
                        countTo={stats.itmRate * 100}
                        format={(n) => `${n.toFixed(1)}%`}
                        onInfo={() => setInfoKey("itmRate")}
                      />
                    </div>
                  </AnimatedCard>

                  <AnimatedCard delay={0.14}>
                    <div className="mb-3"><RuleLabel>プレイスタイル</RuleLabel></div>
                    <div className="grid grid-cols-3 gap-x-2 gap-y-4">
                      <StatTile
                        label="VPIP"
                        value={`${(stats.vpipRate * 100).toFixed(0)}%`}
                        countTo={stats.vpipRate * 100}
                        format={(n) => `${n.toFixed(0)}%`}
                        onInfo={() => setInfoKey("vpip")}
                      />
                      <StatTile
                        label="PFR"
                        value={`${(stats.pfrRate * 100).toFixed(0)}%`}
                        countTo={stats.pfrRate * 100}
                        format={(n) => `${n.toFixed(0)}%`}
                        onInfo={() => setInfoKey("pfr")}
                      />
                      <StatTile
                        label="3Bet"
                        value={`${(stats.threeBetRate * 100).toFixed(0)}%`}
                        countTo={stats.threeBetRate * 100}
                        format={(n) => `${n.toFixed(0)}%`}
                        onInfo={() => setInfoKey("threeBet")}
                      />
                    </div>
                  </AnimatedCard>

                  <AnimatedCard delay={0.18}>
                    {bankrollGraph === null ? (
                      <div className="space-y-6">
                        <ChartSkeleton />
                        <ChartSkeleton />
                        <ChartSkeleton />
                      </div>
                    ) : (
                      <div className="space-y-6">
                        <SingleLineChart
                          title="ROI"
                          color="#D4910A" /* 唯一のアクセントカラー使用箇所として意図的にgoldのまま */
                          points={bankrollGraph.map((p) => ({ x: p.tournamentIndex, y: Math.round(p.roi * 1000) / 10 }))}
                          baseline={100}
                          formatValue={(v) => `${v.toFixed(1)}%`}
                          onInfo={() => setInfoKey("graphRoi")}
                        />
                        <SingleLineChart
                          title="収支"
                          color="#0a0a0a"
                          points={bankrollGraph.map((p) => ({ x: p.tournamentIndex, y: p.cumulativeProfit }))}
                          baseline={0}
                          formatValue={(v) => formatSigned(v)}
                          onInfo={() => setInfoKey("graphProfit")}
                        />
                        <SingleLineChart
                          title="得た金額"
                          color="#0a0a0a"
                          points={bankrollGraph.map((p) => ({ x: p.tournamentIndex, y: p.cumulativePayout }))}
                          baseline={0}
                          formatValue={(v) => v.toLocaleString()}
                          onInfo={() => setInfoKey("graphPayout")}
                        />
                      </div>
                    )}

                    <div className="flex items-center justify-center gap-1.5 mt-4">
                      <span className="text-[10px] text-ink-600 mr-0.5">直近トナメ数</span>
                      {TOURNEY_GRAPH_RANGES.map((r) => (
                        <motion.button
                          key={r.key}
                          whileTap={{ scale: 0.94 }}
                          onClick={() => setGraphRangeKey(r.key)}
                          className={`rounded-lg px-2.5 py-1 text-[10px] font-semibold ${
                            graphRangeKey === r.key ? "bg-gold-500 text-white" : "bg-ink-300 text-ink-700"
                          }`}
                        >
                          {r.label}
                        </motion.button>
                      ))}
                    </div>
                  </AnimatedCard>
                </>
              ) : (
                <ListSkeleton />
              )
            ) : (
              <div className="py-10 text-center text-ink-700 text-sm">スタッツの記録にはログインが必要です。</div>
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

            {/* 期間タブ(Weekly / All Time / 直近10)。黒枠線Swissのセグメント。 */}
            <div className="mb-3 flex rounded-xl border border-ink-950 p-1">
              {LB_PERIODS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setLbPeriod(p.key)}
                  className={`flex-1 rounded-lg py-1.5 text-[12px] font-bold transition-colors ${
                    lbPeriod === p.key ? "bg-ink-950 text-white" : "text-ink-600"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* 指標セレクタ(収支 / ROI / 偏差値 / インマネ率)。 */}
            <div className="mb-4 grid grid-cols-4 gap-1.5">
              {LB_METRICS.map((m) => (
                <button
                  key={m.key}
                  onClick={() => setLbMetric(m.key)}
                  className={`rounded-lg border py-1.5 text-[11px] font-bold transition-colors ${
                    lbMetric === m.key ? "border-ink-950 bg-ink-950 text-white" : "border-ink-200 text-ink-600"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

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
                    <div className="py-10 text-center text-ink-700 text-sm">
                      この期間はまだランキングデータがありません。
                    </div>
                  );
                }
                return (
                  <div className="space-y-2">
                    {rows.map((row, i) => {
                      const isYou = userId != null && row.userId === userId;
                      const primary = formatLbMetric(row, lbMetric);
                      const primaryClass =
                        lbMetric === "profit" ? signedClass(row.profit) : "text-ink-950";
                      return (
                        <motion.div
                          key={row.userId}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.3, delay: Math.min(i * 0.03, 0.45) }}
                          className={`flex items-center gap-3 rounded-xl bg-white px-3 py-2.5 ${
                            isYou ? "border-[1.5px] border-gold-500" : "border border-ink-200"
                          }`}
                        >
                          <div className="w-6 text-center text-sm font-bold tabular-nums text-ink-800">{i + 1}</div>
                          <Avatar avatarKey={row.avatarKey} size={30} />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-ink-900 truncate">
                              {row.displayName}
                              {isYou && <span className="text-gold-600 text-[10px] ml-1">(あなた)</span>}
                            </div>
                            <div className="text-[10px] text-ink-600 tabular-nums">{row.tournamentsPlayed} トーナメント</div>
                          </div>
                          <div className="text-right">
                            <div className={`text-sm font-bold tabular-nums ${primaryClass}`}>{primary}</div>
                            <div className="text-[10px] text-ink-600 tabular-nums">
                              {lbMetric !== "profit" && `収支 ${formatSigned(row.profit)}`}
                              {lbMetric === "profit" && `ROI ${(row.roi * 100).toFixed(0)}%`}
                            </div>
                          </div>
                        </motion.div>
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
            <SectionCard>
              {!accessToken ? (
                <div className="py-10 text-center text-ink-700 text-sm">ハンド履歴の記録にはログインが必要です。</div>
              ) : history === null ? (
                <ListSkeleton />
              ) : (
                <>
                  <div className="flex gap-1.5 mb-3">
                    <button
                      onClick={() => setHistorySubTab("all")}
                      className={`flex-1 h-9 rounded-xl text-[12px] font-semibold transition-colors ${
                        historySubTab === "all" ? "bg-gold-500 text-white" : "bg-ink-200 text-ink-700"
                      }`}
                    >
                      すべて
                    </button>
                    <button
                      onClick={() => setHistorySubTab("favorites")}
                      className={`flex-1 h-9 rounded-xl text-[12px] font-semibold flex items-center justify-center gap-1 transition-colors ${
                        historySubTab === "favorites" ? "bg-gold-500 text-white" : "bg-ink-200 text-ink-700"
                      }`}
                    >
                      <Icon name="star" className="h-3.5 w-3.5" />
                      お気に入り
                    </button>
                  </div>

                  {(() => {
                    const rows = historySubTab === "favorites" ? history.filter((h) => h.isFavorite) : history;
                    if (rows.length === 0) {
                      return (
                        <div className="py-10 text-center text-ink-700 text-sm">
                          {historySubTab === "favorites" ? "お気に入りのハンドはまだありません。" : "まだプレイしたハンドがありません。"}
                        </div>
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
                            <p className="text-[11px] font-semibold text-ink-600 mb-1.5 px-0.5">{group.tournamentLabel}</p>
                            <div className="space-y-2">
                              {group.rows.map((h, i) => {
                                const deltaBb = h.bigBlind > 0 ? h.deltaChips / h.bigBlind : 0;
                                const rounded = Math.round(deltaBb * 10) / 10;
                                const label = rounded === 0 ? "±0bb" : `${rounded > 0 ? "+" : ""}${rounded}bb`;
                                return (
                                  <motion.div
                                    key={h.handId}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.3, delay: Math.min(i * 0.03, 0.3) }}
                                    className="rounded-xl border border-ink-200 bg-white px-3 py-2.5"
                                  >
                                    <div className="flex items-center gap-2 text-[10px] text-ink-700 mb-1.5">
                                      <span className="tabular-nums">
                                        {new Date(h.playedAt).toLocaleString("ja-JP", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                                      </span>
                                      <span className="rounded border border-ink-950 bg-white px-1.5 py-[1px] text-ink-950 font-semibold">{h.position}</span>
                                      <button
                                        onClick={() => toggleFavorite(h.handId, !h.isFavorite)}
                                        aria-label={h.isFavorite ? "お気に入り解除" : "お気に入りに追加"}
                                        className="ml-auto text-gold-500"
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
            {!accessToken ? (
              <SectionCard>
                <div className="py-10 text-center text-ink-700 text-sm">トーナメント履歴の記録にはログインが必要です。</div>
              </SectionCard>
            ) : tournamentHistory === null ? (
              <SectionCard>
                <ListSkeleton />
              </SectionCard>
            ) : tournamentHistory.length === 0 ? (
              <SectionCard>
                <div className="py-10 text-center text-ink-700 text-sm">トーナメントに参加すると履歴が表示されます。</div>
              </SectionCard>
            ) : (
              <>
                <AnimatedCard delay={0.02}>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <StatTile label="参加数" value={tournamentHistory.length.toLocaleString()} />
                    <StatTile
                      label="インマネ回数"
                      value={tournamentHistory.filter((t) => t.finishPosition != null).length.toLocaleString()}
                      valueClass="text-gold-600"
                    />
                    <StatTile
                      label="インマネ率"
                      value={`${Math.round(
                        (tournamentHistory.filter((t) => t.finishPosition != null).length / tournamentHistory.length) * 100,
                      )}%`}
                      valueClass="text-gold-600"
                    />
                  </div>
                </AnimatedCard>

                <div className="space-y-2.5 mt-3">
                  {[...tournamentHistory].reverse().map((t, i) => (
                    <TournamentHistoryCard key={t.tournamentId} point={t} delay={Math.min(i * 0.03, 0.4)} />
                  ))}
                </div>
              </>
            )}
          </motion.div>
        )}
        </AnimatePresence>

      </main>

      {tab === "home" && (
        <div
          className="fixed inset-x-0 z-10 flex justify-center px-4"
          style={{ bottom: "calc(96px + env(safe-area-inset-bottom))" }}
        >
          <PlayButton games={GAMES} onJoin={onJoin} />
        </div>
      )}

      <Footer
        tone="light"
        activeKey={tab}
        centerHref="/geo"
        items={[
          { key: "home", label: "Home", icon: "home", onClick: () => setTab("home") },
          { key: "stats", label: "Stats", icon: "stats", onClick: () => setTab("stats") },
          { key: "history", label: "History", icon: "layers", onClick: () => setTab("history") },
          { key: "leaderboard", label: "Leaderboard", icon: "trophy", onClick: () => setTab("leaderboard") },
        ]}
      />

      {structureOpen && <BlindStructureSheet onClose={() => setStructureOpen(false)} />}
      {stats && infoKey && <StatInfoModal info={buildStatInfo(infoKey, stats)} onClose={() => setInfoKey(null)} />}
      <AnimatePresence>
        {menuOpen && (
          <HamburgerMenu
            displayName={displayName}
            avatarKey={avatarKey}
            email={email}
            providers={providers}
            isGuest={!accessToken}
            onClose={() => setMenuOpen(false)}
            onEditProfile={() => {
              setMenuOpen(false);
              onEditProfile();
            }}
            onOpenStructure={() => {
              setMenuOpen(false);
              setStructureOpen(true);
            }}
            onSignOut={
              onSignOut
                ? () => {
                    setMenuOpen(false);
                    onSignOut();
                  }
                : undefined
            }
          />
        )}
      </AnimatePresence>
    </div>
  );
}
