"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { GameKey } from "@/lib/socket";
import { Avatar } from "./Avatar";
import { BlindStructureSheet } from "./BlindStructureSheet";

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

interface TournamentResultPoint {
  index: number;
  tournamentId: string;
  finishedAt: string;
  buyIn: number;
  payout: number;
  /** そのトーナメント単体のROI(%)。100が収支±0のライン。 */
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
const GAMES: { key: GameKey; title: string; subtitle: string; buyIn: number; detail: string; gradient: string }[] = [
  {
    key: "sng",
    title: "SNG",
    subtitle: "Ten-Four",
    buyIn: 1000,
    detail: "6人卓・シングルテーブル",
    gradient: "from-mint-500 to-emerald-700",
  },
  {
    key: "mtt",
    title: "MTT",
    subtitle: "Ten-Four",
    buyIn: 2000,
    detail: "12人・マルチテーブル",
    gradient: "from-indigo-500 to-violet-700",
  },
];

type Tab = "home" | "stats" | "leaderboard" | "history";

const SUIT_BADGE_CLASS: Record<string, string> = {
  s: "bg-navy-500",
  h: "bg-crimson-500",
  d: "bg-azure-500",
  c: "bg-mint-500",
};

function CardChip({ card, size = "md" }: { card: string; size?: "sm" | "md" }) {
  const rank = card.slice(0, -1);
  const suit = card.slice(-1);
  const dims = size === "md" ? "h-8 w-7 text-[13px]" : "h-6 w-5 text-[10px]";
  return (
    <span
      className={`flex items-center justify-center rounded font-bold text-white ${dims} ${SUIT_BADGE_CLASS[suit] ?? "bg-navy-500"}`}
    >
      {rank}
    </span>
  );
}

function formatSigned(n: number): string {
  return `${n > 0 ? "+" : ""}${n.toLocaleString()}`;
}

function signedClass(n: number): string {
  return n > 0 ? "text-mint-400" : n < 0 ? "text-crimson-400" : "text-navy-100";
}

function SectionCard({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl bg-navy-900 ring-1 ring-navy-700 p-4">{children}</div>;
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1 text-navy-400 -ml-1 pr-2 py-1" aria-label="ホームに戻る">
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
      <div className="flex items-center gap-1 text-[11px] text-navy-400">
        <span>{label}</span>
        {onInfo && (
          <button onClick={onInfo} className="text-navy-500 active:text-navy-300" aria-label={`${label}の説明`}>
            <InfoIcon />
          </button>
        )}
      </div>
      <div className={`text-lg font-bold tabular-nums ${valueClass ?? "text-navy-50"}`}>{value}</div>
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
  | "threeBet";

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
  }
}

function StatInfoModal({ info, onClose }: { info: StatInfoDef; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md rounded-t-3xl bg-navy-900 ring-1 ring-navy-700 p-5 pb-[calc(env(safe-area-inset-bottom)+20px)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-3">
          <div>
            <h2 className="text-base font-bold text-navy-50">{info.title}</h2>
            {info.subtitle && <p className="text-[11px] text-navy-500">{info.subtitle}</p>}
          </div>
          <button onClick={onClose} className="text-navy-400 text-xl leading-none px-2" aria-label="閉じる">
            ×
          </button>
        </div>

        <div className="text-2xl font-bold tabular-nums text-navy-50 mb-3">{info.value}</div>
        <p className="text-sm text-navy-300 mb-4">{info.description}</p>

        {info.breakdown && (
          <div className="rounded-xl bg-navy-800/70 divide-y divide-navy-700 mb-3">
            <div className="px-3 py-2.5">
              <div className="text-[11px] text-mint-400 font-semibold">{info.breakdown.execLabel}</div>
              <div className="text-xs text-navy-300 mt-0.5">{info.breakdown.execDesc}</div>
            </div>
            <div className="px-3 py-2.5">
              <div className="text-[11px] text-mint-400 font-semibold">{info.breakdown.oppLabel}</div>
              <div className="text-xs text-navy-300 mt-0.5">{info.breakdown.oppDesc}</div>
            </div>
          </div>
        )}

        {info.notes && info.notes.length > 0 && (
          <div className="rounded-xl bg-navy-800/40 px-3 py-2.5 space-y-1">
            {info.notes.map((n, i) => (
              <p key={i} className="text-[11px] text-navy-500">
                ※ {n}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const RESULTS_GRAPH_LIMITS = [10, 20, 50] as const;

/** 獲得金額とROIをトーナメントごとに並べた棒グラフ。依存ライブラリなしの軽量SVGで描画する。 */
function ResultsBarChart({ points }: { points: TournamentResultPoint[] }) {
  if (points.length === 0) {
    return <div className="py-6 text-center text-navy-500 text-xs">まだ終了したトーナメントがありません。</div>;
  }

  const width = 300;
  const rowHeight = 64;
  const barGap = points.length > 40 ? 1 : 3;
  const barWidth = Math.max(1.5, width / points.length - barGap);
  const maxPayout = Math.max(...points.map((p) => p.payout), 1);
  const maxDeviation = Math.max(...points.map((p) => Math.abs(p.roi - 100)), 20);

  return (
    <div className="space-y-4">
      <div>
        <div className="text-[11px] text-navy-400 mb-1.5">獲得金額(トーナメントごと)</div>
        <svg viewBox={`0 0 ${width} ${rowHeight}`} className="w-full" style={{ height: rowHeight }} preserveAspectRatio="none">
          {points.map((p, i) => {
            const h = Math.max(1, (p.payout / maxPayout) * (rowHeight - 4));
            return (
              <rect
                key={p.tournamentId}
                x={i * (barWidth + barGap)}
                y={rowHeight - h}
                width={barWidth}
                height={h}
                rx={0.5}
                fill={p.payout > 0 ? "rgb(52 211 153)" : "rgb(55 75 122)"}
              />
            );
          })}
        </svg>
      </div>

      <div>
        <div className="text-[11px] text-navy-400 mb-1.5">ROI(トーナメントごと・100%が収支±0)</div>
        <svg viewBox={`0 0 ${width} ${rowHeight}`} className="w-full" style={{ height: rowHeight }} preserveAspectRatio="none">
          <line
            x1={0}
            y1={rowHeight / 2}
            x2={width}
            y2={rowHeight / 2}
            stroke="currentColor"
            strokeWidth={1}
            className="text-navy-700"
            strokeDasharray="3 3"
          />
          {points.map((p, i) => {
            const isUp = p.roi >= 100;
            const h = Math.max(1, (Math.abs(p.roi - 100) / maxDeviation) * (rowHeight / 2 - 2));
            return (
              <rect
                key={p.tournamentId}
                x={i * (barWidth + barGap)}
                y={isUp ? rowHeight / 2 - h : rowHeight / 2}
                width={barWidth}
                height={h}
                rx={0.5}
                fill={isUp ? "rgb(52 211 153)" : "rgb(248 113 113)"}
              />
            );
          })}
        </svg>
      </div>

      <div className="flex items-center justify-between text-[10px] text-navy-500">
        <span>{new Date(points[0]!.finishedAt).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" })}</span>
        <span>直近 {points.length} トーナメント</span>
        <span>{new Date(points[points.length - 1]!.finishedAt).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" })}</span>
      </div>
    </div>
  );
}

// --- アイコン(フッター/FEATURES共用) ---
function Icon({ name, className = "h-5 w-5" }: { name: string; className?: string }) {
  const paths: Record<string, React.ReactNode> = {
    home: <path d="M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5" strokeLinecap="round" strokeLinejoin="round" />,
    stats: <path d="M4 20V10M12 20V4M20 20v-7" strokeLinecap="round" strokeLinejoin="round" />,
    trophy: (
      <path
        d="M7 4h10v5a5 5 0 0 1-10 0V4ZM7 5H4a2 2 0 0 0 2 3M17 5h3a2 2 0 0 1-2 3M12 14v3m-3 3h6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
    layers: <path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16.5 12 21l9-4.5" strokeLinecap="round" strokeLinejoin="round" />,
    user: <path d="M16 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" strokeLinecap="round" />,
    db: (
      <>
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
function HamburgerMenu({
  displayName,
  avatarKey,
  email,
  isGuest,
  onClose,
  onEditProfile,
  onOpenStructure,
  onSignOut,
}: {
  displayName: string;
  avatarKey: string | null;
  email?: string | null;
  isGuest: boolean;
  onClose: () => void;
  onEditProfile: () => void;
  onOpenStructure: () => void;
  onSignOut?: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md rounded-t-3xl bg-navy-900 ring-1 ring-navy-700 pt-2 pb-[calc(env(safe-area-inset-bottom)+20px)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto h-1 w-10 rounded-full bg-navy-700 mb-4" />
        <div className="px-5 flex items-center gap-3 mb-2">
          <Avatar avatarKey={avatarKey} displayName={displayName} size={48} />
          <div className="min-w-0">
            <div className="text-base font-semibold text-navy-50 truncate">{displayName}</div>
            {email ? (
              <div className="text-xs text-navy-400 truncate">{email}</div>
            ) : (
              isGuest && <div className="text-xs text-navy-500">ゲストプレイ中</div>
            )}
          </div>
        </div>
        <div className="px-2 mt-2 divide-y divide-navy-800">
          <button onClick={onEditProfile} className="w-full flex items-center justify-between px-3 py-3.5 text-sm text-navy-100">
            プロフィールを編集 <span className="text-navy-500">›</span>
          </button>
          <button onClick={onOpenStructure} className="w-full flex items-center justify-between px-3 py-3.5 text-sm text-navy-100">
            ブラインドストラクチャ <span className="text-navy-500">›</span>
          </button>
          <Link href="/geo" onClick={onClose} className="w-full flex items-center justify-between px-3 py-3.5 text-sm text-navy-100">
            GEOデータベース <span className="text-navy-500">›</span>
          </Link>
          {onSignOut && (
            <button onClick={onSignOut} className="w-full flex items-center justify-between px-3 py-3.5 text-sm text-crimson-400">
              ログアウト <span className="text-navy-500">›</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function Lobby({
  displayName,
  avatarKey,
  email,
  userId,
  accessToken,
  onJoin,
  onEditProfile,
  onSignOut,
}: {
  displayName: string;
  avatarKey: string | null;
  email?: string | null;
  userId?: string | null;
  accessToken?: string;
  onJoin: (gameKey: GameKey) => void;
  onEditProfile: () => void;
  onSignOut?: () => void;
}) {
  const [tab, setTab] = useState<Tab>("home");
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [resultsGraph, setResultsGraph] = useState<TournamentResultPoint[] | null>(null);
  const [resultsLimit, setResultsLimit] = useState<number>(20);
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
    if (!accessToken || tab !== "stats") return;
    fetch(`${SERVER_URL}/api/lobby/results-graph?limit=${resultsLimit}`, { headers: { authorization: `Bearer ${accessToken}` } })
      .then((res) => (res.ok ? (res.json() as Promise<TournamentResultPoint[]>) : null))
      .then((json) => json && setResultsGraph(json))
      .catch(() => {});
  }, [accessToken, tab, resultsLimit]);

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

  const FEATURES: { key: string; title: string; desc: string; icon: string; tile: string; onClick: () => void }[] = [
    {
      key: "stats",
      title: "Stats",
      desc: "プレイ成績。ROI・収支・イン・ザ・マネー率が表示されます。",
      icon: "stats",
      tile: "bg-gradient-to-br from-sky-600 to-blue-800",
      onClick: () => setTab("stats"),
    },
    {
      key: "leaderboard",
      title: "Leaderboard",
      desc: "全プレイヤーのランキングが表示されます。",
      icon: "trophy",
      tile: "bg-gradient-to-br from-rose-600 to-red-900",
      onClick: () => setTab("leaderboard"),
    },
    {
      key: "history",
      title: "Hand History",
      desc: "プレイしたハンドの履歴が表示されます。",
      icon: "layers",
      tile: "bg-gradient-to-br from-emerald-600 to-green-900",
      onClick: () => setTab("history"),
    },
    {
      key: "geo",
      title: "GEO Database",
      desc: "全プレイヤーの実データから傾向を検索・分析できます。",
      icon: "db",
      tile: "bg-gradient-to-br from-violet-600 to-purple-900",
      onClick: () => {
        window.location.href = "/geo";
      },
    },
    {
      key: "mypage",
      title: "アカウント設定",
      desc: "プロフィールの編集や各種設定ができます。",
      icon: "user",
      tile: "bg-gradient-to-br from-amber-600 to-yellow-800",
      onClick: () => setMenuOpen(true),
    },
  ];

  return (
    <div className="min-h-screen bg-navy-950 flex flex-col">
      <header className="flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top)+14px)] pb-3">
        <div className="flex items-center gap-1.5">
          <span className="rounded-md bg-white px-1.5 py-0.5 text-[13px] font-black text-navy-950">T♠</span>
          <span className="rounded-md bg-white px-1.5 py-0.5 text-[13px] font-black text-crimson-500">4♥</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMenuOpen(true)}
            className="flex items-center gap-2 rounded-full bg-navy-900/80 ring-1 ring-navy-700/50 pl-1 pr-3 py-1"
          >
            <Avatar avatarKey={avatarKey} size={26} />
            <span className="text-xs text-navy-200 max-w-[96px] truncate">{displayName}</span>
          </button>
          <button
            onClick={() => setMenuOpen(true)}
            aria-label="メニューを開く"
            className="h-9 w-9 shrink-0 flex items-center justify-center rounded-full bg-navy-900/80 ring-1 ring-navy-700/50 text-navy-200"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4.5 w-4.5">
              <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 pb-28 space-y-5">
        {tab === "home" && (
          <>
            <SectionCard>
              <div className="text-center mb-3">
                <div className="text-[11px] tracking-[0.25em] text-navy-400 italic font-medium">PLAY POKER</div>
                <div className="text-xl font-bold italic text-navy-50 tracking-wide">6-MAX TOURNAMENT</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {GAMES.map((game) => (
                  <button
                    key={game.key}
                    onClick={() => onJoin(game.key)}
                    className={`rounded-2xl bg-gradient-to-br ${game.gradient} p-4 text-center shadow-card active:scale-[0.97] transition-transform`}
                  >
                    <div className="text-white/80 text-[12px] italic font-semibold">{game.subtitle}</div>
                    <div className="text-white text-2xl font-black italic tracking-wide">{game.title}</div>
                    <div className="text-white/80 text-[11px] mt-1">バイイン {game.buyIn.toLocaleString()}</div>
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3 mt-2">
                {GAMES.map((game) => (
                  <div key={game.key} className="flex items-center justify-center gap-1 text-[10px] text-navy-400">
                    <Icon name="user" className="h-3.5 w-3.5" />
                    {game.detail}
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard>
              <div className="text-center text-[11px] tracking-[0.25em] text-navy-400 italic font-medium mb-3">FEATURES</div>
              <div className="space-y-1">
                {FEATURES.map((f) => (
                  <button
                    key={f.key}
                    onClick={f.onClick}
                    className="w-full flex items-start gap-3 rounded-xl px-2 py-2.5 text-left active:bg-navy-800/60 transition-colors"
                  >
                    <div className={`h-11 w-11 shrink-0 rounded-xl ${f.tile} flex items-center justify-center text-white`}>
                      <Icon name={f.icon} className="h-5.5 w-5.5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[15px] font-semibold italic text-navy-50">{f.title}</div>
                      <div className="text-xs text-navy-400 mt-0.5">{f.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </SectionCard>

            <a
              href="https://rrpoker.vercel.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-2xl bg-navy-900 ring-1 ring-navy-700 p-3.5 active:bg-navy-800/60 transition-colors"
            >
              <div className="h-10 w-10 shrink-0 rounded-xl bg-gradient-to-br from-crimson-500 to-rose-700 flex items-center justify-center text-white font-black text-sm italic">
                RR
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold text-navy-50">RR Poker</div>
                <div className="text-[11px] text-navy-400">同じ作成者のポーカーアプリもチェック</div>
              </div>
              <span className="shrink-0 rounded bg-navy-800 text-navy-500 text-[9px] font-bold px-1.5 py-0.5">PR</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4 text-navy-500 shrink-0">
                <path d="M7 17 17 7M9 7h8v8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>

            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-azure-600 to-navy-900 px-5 py-4 text-center shadow-card">
              <div className="text-white font-black italic text-base tracking-wide">Meta-GEO サポーター 募集中</div>
              <div className="text-white/70 text-[11px] mt-1">今後の機能追加・GEOデータベース拡充にご協力ください</div>
            </div>

            <div className="text-center space-y-2 pt-2">
              <p className="text-[10px] text-navy-600 leading-relaxed px-2">
                Ten Four Poker (トーナメント版) — バーチャルチップ専用。実際の金銭を賭けることはできません。
              </p>
              <p className="text-[10px] text-navy-600">Meta-GEO Poker v1.0.0 ・ 作成者: Coffiest</p>
              <p className="text-[10px] text-navy-700">© 2026 Meta-GEO</p>
            </div>
          </>
        )}

        {tab === "stats" && (
          <SectionCard>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1">
                <BackButton onClick={() => setTab("home")} />
                <div className="flex items-center gap-2 text-navy-50 font-semibold text-sm">
                  <Icon name="stats" className="h-4 w-4" /> Stats
                </div>
              </div>
              <button onClick={() => setTab("leaderboard")} className="text-navy-400" aria-label="ランキングへ">
                <Icon name="trophy" className="h-4 w-4" />
              </button>
            </div>
            {accessToken ? (
              stats ? (
                <>
                  {stats.nationalRank != null && (
                    <div className="flex items-center justify-center gap-1.5 rounded-xl bg-navy-800/70 py-2.5 mb-4">
                      <Icon name="trophy" className="h-4 w-4 text-amber-400" />
                      <span className="text-sm text-navy-200">
                        全国 <span className="text-base font-bold text-navy-50 tabular-nums">{stats.nationalRank.toLocaleString()}</span> 位 /{" "}
                        {stats.totalRankedPlayers.toLocaleString()} 人中
                      </span>
                    </div>
                  )}

                  <div className="text-[10px] tracking-[0.2em] text-navy-500 font-medium mb-2">収支</div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-4 mb-5">
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

                  <div className="text-[10px] tracking-[0.2em] text-navy-500 font-medium mb-2">トーナメント成績</div>
                  <div className="grid grid-cols-3 gap-x-2 gap-y-4 mb-5">
                    <StatTile
                      label="参加トナメ数"
                      value={stats.tournamentsPlayed.toLocaleString()}
                      onInfo={() => setInfoKey("tournamentsPlayed")}
                    />
                    <StatTile label="インマネ回数" value={stats.itmCount.toLocaleString()} onInfo={() => setInfoKey("itmCount")} />
                    <StatTile label="インマネ率" value={`${(stats.itmRate * 100).toFixed(1)}%`} onInfo={() => setInfoKey("itmRate")} />
                  </div>

                  <div className="text-[10px] tracking-[0.2em] text-navy-500 font-medium mb-2">プレイスタイル</div>
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

                  <div className="mt-6 pt-5 border-t border-navy-800">
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-[11px] text-navy-400">獲得金額・ROIの推移</div>
                      <div className="flex gap-1">
                        {RESULTS_GRAPH_LIMITS.map((n) => (
                          <button
                            key={n}
                            onClick={() => setResultsLimit(n)}
                            className={`rounded-full px-2.5 py-1 text-[10px] font-medium ${
                              resultsLimit === n ? "bg-mint-500 text-white" : "bg-navy-800 text-navy-400"
                            }`}
                          >
                            直近{n}
                          </button>
                        ))}
                      </div>
                    </div>
                    {resultsGraph === null ? (
                      <div className="py-6 text-center text-navy-500 text-xs">読み込み中…</div>
                    ) : (
                      <ResultsBarChart points={resultsGraph} />
                    )}
                  </div>

                  <p className="text-[11px] text-navy-500 mt-5">
                    収支はTenFour方式のプラスマイナス表示です(バイインが−、賞金が+として累計されます)。
                  </p>
                </>
              ) : (
                <div className="py-10 text-center text-navy-400 text-sm">読み込み中…</div>
              )
            ) : (
              <div className="py-10 text-center text-navy-400 text-sm">スタッツの記録にはログインが必要です。</div>
            )}
          </SectionCard>
        )}

        {tab === "leaderboard" && (
          <SectionCard>
            <div className="flex items-center gap-1 mb-1">
              <BackButton onClick={() => setTab("home")} />
              <div className="flex items-center gap-2 text-navy-50 font-semibold text-sm">
                <Icon name="trophy" className="h-4 w-4" /> Leaderboard
              </div>
            </div>
            <p className="text-[11px] text-navy-500 mb-3">収支ランキング(実プレイヤーのみ・BOTは含まれません)</p>
            {leaderboard === null ? (
              <div className="py-10 text-center text-navy-400 text-sm">読み込み中…</div>
            ) : leaderboard.length === 0 ? (
              <div className="py-10 text-center text-navy-400 text-sm">まだランキングデータがありません。</div>
            ) : (
              <div className="space-y-2">
                {leaderboard.map((row, i) => {
                  const isYou = userId != null && row.userId === userId;
                  return (
                    <div
                      key={row.userId}
                      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${
                        isYou ? "bg-mint-500/10 ring-1 ring-mint-500/40" : "bg-navy-800/70"
                      }`}
                    >
                      <div className="w-6 text-center text-sm font-bold tabular-nums text-navy-300">{i + 1}</div>
                      <Avatar avatarKey={row.avatarKey} size={30} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-navy-100 truncate">
                          {row.displayName}
                          {isYou && <span className="text-mint-400 text-[10px] ml-1">(あなた)</span>}
                        </div>
                        <div className="text-[10px] text-navy-500">{row.tournamentsPlayed} トーナメント</div>
                      </div>
                      <div className="text-right">
                        <div className={`text-sm font-bold tabular-nums ${signedClass(row.profit)}`}>{formatSigned(row.profit)}</div>
                        <div className="text-[10px] text-navy-500 tabular-nums">ROI {(row.roi * 100).toFixed(0)}%</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>
        )}

        {tab === "history" && (
          <SectionCard>
            <div className="flex items-center gap-1 mb-3">
              <BackButton onClick={() => setTab("home")} />
              <div className="flex items-center gap-2 text-navy-50 font-semibold text-sm">
                <Icon name="layers" className="h-4 w-4" /> Hand History
              </div>
            </div>
            {!accessToken ? (
              <div className="py-10 text-center text-navy-400 text-sm">ハンド履歴の記録にはログインが必要です。</div>
            ) : history === null ? (
              <div className="py-10 text-center text-navy-400 text-sm">読み込み中…</div>
            ) : history.length === 0 ? (
              <div className="py-10 text-center text-navy-400 text-sm">まだプレイしたハンドがありません。</div>
            ) : (
              <>
                <p className="text-[11px] text-navy-500 mb-3">直近 {history.length} ハンドを表示中</p>
                <div className="space-y-2">
                  {history.map((h) => {
                    const deltaBb = h.bigBlind > 0 ? h.deltaChips / h.bigBlind : 0;
                    const rounded = Math.round(deltaBb * 10) / 10;
                    const label = rounded === 0 ? "±0bb" : `${rounded > 0 ? "+" : ""}${rounded}bb`;
                    return (
                      <div key={h.handId} className="rounded-xl bg-navy-800/70 px-3 py-2.5">
                        <div className="flex items-center gap-2 text-[10px] text-navy-400 mb-1.5">
                          <span className="tabular-nums">
                            {new Date(h.playedAt).toLocaleString("ja-JP", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                          </span>
                          <span className="rounded bg-navy-700 px-1.5 py-[1px] text-navy-200 font-semibold">{h.position}</span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1">
                            {h.holeCards.map((c, i) => (
                              <CardChip key={i} card={c} />
                            ))}
                            <span className="w-2" />
                            {h.board.map((c, i) => (
                              <CardChip key={`b-${i}`} card={c} size="sm" />
                            ))}
                          </div>
                          <div className={`text-sm font-bold tabular-nums shrink-0 ${signedClass(h.deltaChips)}`}>{label}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </SectionCard>
        )}

      </main>

      {/* フッターナビ: 中央にGEOデータベースへの丸ボタン */}
      <nav className="fixed bottom-0 inset-x-0 border-t border-navy-800 bg-navy-950/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
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
                  tab === t.key ? "text-mint-400" : "text-navy-500"
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
                  className="absolute -top-7 h-14 w-14 rounded-full bg-gradient-to-br from-mint-400 to-emerald-600 ring-4 ring-navy-950 shadow-panel flex flex-col items-center justify-center text-white active:scale-95 transition-transform"
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
      {menuOpen && (
        <HamburgerMenu
          displayName={displayName}
          avatarKey={avatarKey}
          email={email}
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
    </div>
  );
}
