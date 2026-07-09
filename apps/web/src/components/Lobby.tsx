"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import type { GameKey } from "@/lib/socket";
import { APP_VERSION } from "@/lib/version";
import { Avatar } from "./Avatar";
import { BlindStructureSheet } from "./BlindStructureSheet";
import { PlayingCard } from "./PlayingCard";
import { RRRatingCard, type RRRatingData, type TournamentHistoryPoint } from "./RRRatingCard";

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

interface LeaderboardRow {
  userId: string;
  displayName: string;
  avatarKey: string | null;
  profit: number;
  roi: number;
  tournamentsPlayed: number;
}

interface HistoryRow {
  handId: string;
  playedAt: string;
  position: string;
  holeCards: string[];
  board: string[];
  deltaChips: number;
  bigBlind: number;
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

export type Tab = "home" | "stats" | "leaderboard" | "history";

/** URLの?tabクエリから有効なタブ名だけを取り出す(それ以外はnull)。/geo等の他画面からの遷移用。 */
export function tabFromQuery(value: string | null): Tab | null {
  return value === "home" || value === "stats" || value === "leaderboard" || value === "history" ? value : null;
}

function formatSigned(n: number): string {
  return `${n > 0 ? "+" : ""}${n.toLocaleString()}`;
}

function signedClass(n: number): string {
  return n > 0 ? "text-mint-400" : n < 0 ? "text-crimson-400" : "text-ink-900";
}

function SectionCard({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl bg-ink-100 ring-1 ring-ink-400 p-4">{children}</div>;
}

/** RRPokerのhistory-card風、rounded-3xlの白カード。フェードアップで順にstagger表示する。 */
function AnimatedCard({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-3xl bg-ink-100 ring-1 ring-ink-400 shadow-card p-4"
    >
      {children}
    </motion.div>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1 text-ink-700 -ml-1 pr-2 py-1" aria-label="ホームに戻る">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
        <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
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
}: {
  label: string;
  value: string;
  valueClass?: string;
  onInfo?: () => void;
}) {
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
      <div className={`text-lg font-bold tabular-nums ${valueClass ?? "text-ink-950"}`}>{value}</div>
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

  return (
    <div>
      {header}
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height: 130 }} preserveAspectRatio="none">
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

// --- アイコン(フッター/FEATURES共用) ---
export function Icon({ name, className = "h-5 w-5" }: { name: string; className?: string }) {
  const paths: Record<string, React.ReactNode> = {
    home: <path d="M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5" strokeLinecap="round" strokeLinejoin="round" />,
    stats: (
      <>
        <rect x="4" y="13.5" width="3.2" height="6.5" rx="1" fill="currentColor" stroke="none" />
        <rect x="10.4" y="9" width="3.2" height="11" rx="1" fill="currentColor" stroke="none" />
        <rect x="16.8" y="4.5" width="3.2" height="15.5" rx="1" fill="currentColor" stroke="none" />
        <path d="M4 8.5 9 5l4 2.5L20 4" strokeLinecap="round" strokeLinejoin="round" opacity={0.55} />
      </>
    ),
    trophy: (
      <>
        <path d="M7 4h10v4.5a5 5 0 0 1-10 0V4Z" strokeLinejoin="round" />
        <path d="M7 5.2H4.6A2.4 2.4 0 0 0 7 8.4M17 5.2h2.4A2.4 2.4 0 0 1 17 8.4" strokeLinecap="round" />
        <path d="M12 13.3v3.4M9 20h6M9.6 20c0-1.1.6-1.9 1.4-2.4a3 3 0 0 1 2 0c.8.5 1.4 1.3 1.4 2.4" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
    layers: (
      <>
        <path d="m12 3 9 5-9 5-9-5 9-5Z" strokeLinejoin="round" fill="currentColor" fillOpacity={0.18} />
        <path d="m3 12 9 5 9-5M3 16.5 12 21l9-4.5" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
    seat: <path d="M16 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" strokeLinecap="round" />,
    settings: (
      <>
        <circle cx="12" cy="12" r="3.1" />
        <path
          d="M12 3v2.4M12 18.6V21M4.5 4.5l1.7 1.7M17.8 17.8l1.7 1.7M3 12h2.4M18.6 12H21M4.5 19.5l1.7-1.7M17.8 6.2l1.7-1.7"
          strokeLinecap="round"
        />
      </>
    ),
    db: (
      <>
        <ellipse cx="12" cy="5.5" rx="7.5" ry="2.8" fill="currentColor" fillOpacity={0.18} />
        <ellipse cx="12" cy="5.5" rx="7.5" ry="2.8" />
        <path d="M4.5 5.5v13c0 1.55 3.36 2.8 7.5 2.8s7.5-1.25 7.5-2.8v-13M4.5 12c0 1.55 3.36 2.8 7.5 2.8s7.5-1.25 7.5-2.8" strokeLinecap="round" />
      </>
    ),
  };
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className={className}>
      {paths[name]}
    </svg>
  );
}

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
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[] | null>(null);
  const [history, setHistory] = useState<HistoryRow[] | null>(null);
  const [structureOpen, setStructureOpen] = useState(false);

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
    fetch(`${SERVER_URL}/api/lobby/tournament-history`, { headers: { authorization: `Bearer ${accessToken}` } })
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
    if (tab !== "leaderboard" || leaderboard) return;
    fetch(`${SERVER_URL}/api/lobby/leaderboard`)
      .then((res) => (res.ok ? (res.json() as Promise<LeaderboardRow[]>) : null))
      .then((json) => json && setLeaderboard(json))
      .catch(() => {});
  }, [tab, leaderboard]);

  useEffect(() => {
    if (tab !== "history" || history || !accessToken) return;
    fetch(`${SERVER_URL}/api/lobby/history`, { headers: { authorization: `Bearer ${accessToken}` } })
      .then((res) => (res.ok ? (res.json() as Promise<HistoryRow[]>) : null))
      .then((json) => json && setHistory(json))
      .catch(() => {});
  }, [tab, history, accessToken]);

  return (
    <div className="min-h-screen bg-ink-50 flex flex-col">
      <header className="flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top)+14px)] pb-3">
        {/* ロゴ配置枠(準備中): 今後作成予定のロゴ画像/SVGに差し替える。それまでは簡易ワードマーク表示。 */}
        <div className="h-8 flex items-center px-1">
          <span className="text-[15px] font-black italic tracking-wide text-ink-950">
            GTO<span className="text-gold-600">Poker</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMenuOpen(true)}
            className="flex items-center gap-2 rounded-full bg-ink-100/80 ring-1 ring-ink-400/50 pl-1 pr-3 py-1"
          >
            <Avatar avatarKey={avatarKey} size={26} />
            <span className="text-xs text-ink-850 max-w-[96px] truncate">{displayName}</span>
          </button>
          <button
            onClick={() => setMenuOpen(true)}
            aria-label="メニューを開く"
            className="h-9 w-9 shrink-0 flex items-center justify-center rounded-full bg-ink-100/80 ring-1 ring-ink-400/50 text-ink-850"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4.5 w-4.5">
              <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 pb-28 space-y-5">
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
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="rounded-3xl bg-ink-100 ring-1 ring-ink-400 overflow-hidden shadow-card"
            >
              <div className="relative bg-gradient-to-br from-gold-500 to-gold-600 px-5 pt-4 pb-5 overflow-hidden text-center">
                <div className="pointer-events-none absolute -top-10 -right-8 h-40 w-40 rounded-full bg-white/10" />
                <div className="pointer-events-none absolute -bottom-6 -left-6 h-28 w-28 rounded-full bg-white/5" />
                <p className="relative text-[11px] font-bold tracking-[0.15em] uppercase text-white/70 mb-1">Play Poker</p>
                <p className="relative text-2xl font-black italic text-white tracking-wide">6-MAX TOURNAMENT</p>
              </div>
              <div className="p-4 grid grid-cols-2 gap-3">
                {GAMES.map((game, i) => (
                  <motion.button
                    key={game.key}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, delay: 0.1 + i * 0.06 }}
                    whileTap={{ scale: 0.96 }}
                    onClick={() => onJoin(game.key)}
                    className="rounded-2xl bg-gold-500/10 ring-1 ring-gold-500/25 p-3.5 text-center"
                  >
                    <div className="text-ink-950 text-lg font-black italic tracking-wide leading-tight">{game.title}</div>
                    {game.caption && <div className="text-gold-600 text-[10px] font-semibold mt-0.5">{game.caption}</div>}
                    <div className="text-ink-600 text-[10px] mt-1.5 flex items-center justify-center gap-1">
                      <Icon name="seat" className="h-3 w-3" />
                      {game.detail}
                    </div>
                    <div className="text-ink-700 text-[10px] mt-1">バイイン {game.buyIn.toLocaleString()}</div>
                  </motion.button>
                ))}
              </div>
            </motion.div>

            <RRRatingCard
              displayName={displayName}
              avatarKey={avatarKey}
              data={rrRating}
              itmRate={stats?.itmRate ?? 0}
              totalBuyIns={stats?.totalBuyIns ?? 0}
              totalPayouts={stats?.totalPayouts ?? 0}
              history={tournamentHistory}
              onViewLeaderboard={() => setTab("leaderboard")}
              onViewHistory={() => setTab("history")}
            />

            <div className="text-center space-y-2 pt-2">
              <p className="text-[10px] text-ink-500 leading-relaxed px-2">
                GTO Poker (トーナメント版) — バーチャルチップ専用。実際の金銭を賭けることはできません。
              </p>
              <p className="text-[10px] text-ink-500">GTO Poker v{APP_VERSION} ・ 作成者: Coffiest</p>
              <p className="text-[10px] text-ink-400">© 2026 GTO Poker</p>
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
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-1">
                <BackButton onClick={() => setTab("home")} />
                <div className="flex items-center gap-2 text-ink-950 font-semibold text-sm">
                  <Icon name="stats" className="h-4 w-4" /> Stats
                </div>
              </div>
              <button onClick={() => setTab("leaderboard")} className="text-ink-700" aria-label="ランキングへ">
                <Icon name="trophy" className="h-4 w-4" />
              </button>
            </div>
            {accessToken ? (
              stats ? (
                <>
                  {stats.nationalRank != null && (
                    <AnimatedCard delay={0.02}>
                      <div className="flex items-center justify-center gap-1.5 py-1">
                        <Icon name="trophy" className="h-4 w-4 text-gold-500" />
                        <span className="text-sm text-ink-850">
                          全国 <span className="text-base font-bold text-ink-950 tabular-nums">{stats.nationalRank.toLocaleString()}</span> 位 /{" "}
                          {stats.totalRankedPlayers.toLocaleString()} 人中
                        </span>
                      </div>
                    </AnimatedCard>
                  )}

                  <AnimatedCard delay={0.06}>
                    <div className="text-[10px] tracking-[0.2em] text-gold-600 font-semibold mb-2">収支</div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-4">
                      <StatTile label="かけた金額" value={stats.totalBuyIns.toLocaleString()} onInfo={() => setInfoKey("buyIns")} />
                      <StatTile label="得た金額" value={stats.totalPayouts.toLocaleString()} onInfo={() => setInfoKey("payouts")} />
                      <StatTile
                        label="収支"
                        value={formatSigned(stats.profit)}
                        valueClass={signedClass(stats.profit)}
                        onInfo={() => setInfoKey("profit")}
                      />
                      <StatTile
                        label="ROI"
                        value={`${(stats.roi * 100).toFixed(1)}%`}
                        valueClass={signedClass(stats.roi * 100 - 100)}
                        onInfo={() => setInfoKey("roi")}
                      />
                    </div>
                  </AnimatedCard>

                  <AnimatedCard delay={0.1}>
                    <div className="text-[10px] tracking-[0.2em] text-gold-600 font-semibold mb-2">トーナメント成績</div>
                    <div className="grid grid-cols-3 gap-x-2 gap-y-4">
                      <StatTile
                        label="参加トナメ数"
                        value={stats.tournamentsPlayed.toLocaleString()}
                        onInfo={() => setInfoKey("tournamentsPlayed")}
                      />
                      <StatTile label="インマネ回数" value={stats.itmCount.toLocaleString()} onInfo={() => setInfoKey("itmCount")} />
                      <StatTile label="インマネ率" value={`${(stats.itmRate * 100).toFixed(1)}%`} onInfo={() => setInfoKey("itmRate")} />
                    </div>
                  </AnimatedCard>

                  <AnimatedCard delay={0.14}>
                    <div className="text-[10px] tracking-[0.2em] text-gold-600 font-semibold mb-2">プレイスタイル</div>
                    <div className="grid grid-cols-3 gap-x-2 gap-y-4">
                      <StatTile
                        label="VPIP"
                        value={`${(stats.vpipRate * 100).toFixed(0)}%`}
                        onInfo={() => setInfoKey("vpip")}
                      />
                      <StatTile label="PFR" value={`${(stats.pfrRate * 100).toFixed(0)}%`} onInfo={() => setInfoKey("pfr")} />
                      <StatTile
                        label="3Bet"
                        value={`${(stats.threeBetRate * 100).toFixed(0)}%`}
                        onInfo={() => setInfoKey("threeBet")}
                      />
                    </div>
                  </AnimatedCard>

                  <AnimatedCard delay={0.18}>
                    {bankrollGraph === null ? (
                      <div className="py-8 text-center text-ink-600 text-xs">読み込み中…</div>
                    ) : (
                      <div className="space-y-6">
                        <SingleLineChart
                          title="ROI"
                          color="#D4910A"
                          points={bankrollGraph.map((p) => ({ x: p.tournamentIndex, y: Math.round(p.roi * 1000) / 10 }))}
                          baseline={100}
                          formatValue={(v) => `${v.toFixed(1)}%`}
                          onInfo={() => setInfoKey("graphRoi")}
                        />
                        <SingleLineChart
                          title="収支"
                          color="#22c55e"
                          points={bankrollGraph.map((p) => ({ x: p.tournamentIndex, y: p.cumulativeProfit }))}
                          baseline={0}
                          formatValue={(v) => formatSigned(v)}
                          onInfo={() => setInfoKey("graphProfit")}
                        />
                        <SingleLineChart
                          title="得た金額"
                          color="#a855f7"
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

                  <p className="text-[11px] text-ink-600 px-1">
                    収支はTenFour方式のプラスマイナス表示です(バイインが−、賞金が+として累計されます)。実額ベースで、bb換算は行いません。
                  </p>
                </>
              ) : (
                <div className="py-10 text-center text-ink-700 text-sm">読み込み中…</div>
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
            <SectionCard>
              <div className="flex items-center gap-1 mb-1">
                <BackButton onClick={() => setTab("home")} />
                <div className="flex items-center gap-2 text-ink-950 font-semibold text-sm">
                  <Icon name="trophy" className="h-4 w-4" /> Leaderboard
                </div>
              </div>
              <p className="text-[11px] text-ink-600 mb-3">収支ランキング(実プレイヤーのみ・BOTは含まれません)</p>
              {leaderboard === null ? (
                <div className="py-10 text-center text-ink-700 text-sm">読み込み中…</div>
              ) : leaderboard.length === 0 ? (
                <div className="py-10 text-center text-ink-700 text-sm">まだランキングデータがありません。</div>
              ) : (
                <div className="space-y-2">
                  {leaderboard.map((row, i) => {
                    const isYou = userId != null && row.userId === userId;
                    return (
                      <motion.div
                        key={row.userId}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: Math.min(i * 0.03, 0.45) }}
                        className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${
                          isYou ? "bg-gold-500/10 ring-1 ring-gold-500/40" : "bg-ink-300/70"
                        }`}
                      >
                        <div className="w-6 text-center text-sm font-bold tabular-nums text-ink-800">{i + 1}</div>
                        <Avatar avatarKey={row.avatarKey} size={30} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-ink-900 truncate">
                            {row.displayName}
                            {isYou && <span className="text-gold-600 text-[10px] ml-1">(あなた)</span>}
                          </div>
                          <div className="text-[10px] text-ink-600">{row.tournamentsPlayed} トーナメント</div>
                        </div>
                        <div className="text-right">
                          <div className={`text-sm font-bold tabular-nums ${signedClass(row.profit)}`}>{formatSigned(row.profit)}</div>
                          <div className="text-[10px] text-ink-600 tabular-nums">ROI {(row.roi * 100).toFixed(0)}%</div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
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
            <SectionCard>
              <div className="flex items-center gap-1 mb-3">
                <BackButton onClick={() => setTab("home")} />
                <div className="flex items-center gap-2 text-ink-950 font-semibold text-sm">
                  <Icon name="layers" className="h-4 w-4" /> Hand History
                </div>
              </div>
              {!accessToken ? (
                <div className="py-10 text-center text-ink-700 text-sm">ハンド履歴の記録にはログインが必要です。</div>
              ) : history === null ? (
                <div className="py-10 text-center text-ink-700 text-sm">読み込み中…</div>
              ) : history.length === 0 ? (
                <div className="py-10 text-center text-ink-700 text-sm">まだプレイしたハンドがありません。</div>
              ) : (
                <>
                  <p className="text-[11px] text-ink-600 mb-3">直近 {history.length} ハンドを表示中</p>
                  <div className="space-y-2">
                    {history.map((h, i) => {
                      const deltaBb = h.bigBlind > 0 ? h.deltaChips / h.bigBlind : 0;
                      const rounded = Math.round(deltaBb * 10) / 10;
                      const label = rounded === 0 ? "±0bb" : `${rounded > 0 ? "+" : ""}${rounded}bb`;
                      return (
                        <motion.div
                          key={h.handId}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.3, delay: Math.min(i * 0.03, 0.45) }}
                          className="rounded-xl bg-ink-300/70 px-3 py-2.5"
                        >
                          <div className="flex items-center gap-2 text-[10px] text-ink-700 mb-1.5">
                            <span className="tabular-nums">
                              {new Date(h.playedAt).toLocaleString("ja-JP", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                            </span>
                            <span className="rounded bg-ink-400 px-1.5 py-[1px] text-ink-850 font-semibold">{h.position}</span>
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
                </>
              )}
            </SectionCard>
          </motion.div>
        )}
        </AnimatePresence>

      </main>

      {/* フッターナビ: 中央にGEOデータベースへの丸ボタン */}
      <nav className="fixed bottom-0 inset-x-0 border-t border-ink-300 bg-ink-50/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
        <div className="relative mx-auto max-w-md grid grid-cols-5 items-end">
          {(
            [
              { key: "home" as Tab, label: "Home", icon: "home" },
              { key: "stats" as Tab, label: "Stats", icon: "stats" },
              null, // 中央: DBボタン
              { key: "history" as Tab, label: "History", icon: "layers" },
              { key: "leaderboard" as Tab, label: "Leaderboard", icon: "trophy" },
            ] as ({ key: Tab; label: string; icon: string } | null)[]
          ).map((t, i) =>
            t ? (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex flex-col items-center gap-0.5 py-2.5 transition-colors ${
                  tab === t.key ? "text-mint-400" : "text-ink-600"
                }`}
              >
                <Icon name={t.icon} />
                <span className="text-[9px] font-medium">{t.label}</span>
              </button>
            ) : (
              <div key={`db-${i}`} className="relative flex justify-center">
                <Link
                  href="/geo"
                  aria-label="GEOデータベース"
                  className="absolute -top-7 h-14 w-14 rounded-full bg-gradient-to-br from-mint-400 to-emerald-600 ring-4 ring-ink-50 shadow-panel flex flex-col items-center justify-center text-white active:scale-95 transition-transform"
                >
                  <Icon name="db" className="h-5 w-5" />
                  <span className="text-[7px] font-bold tracking-wide mt-[1px]">DATABASE</span>
                </Link>
                <div className="h-[54px]" />
              </div>
            ),
          )}
        </div>
      </nav>

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
