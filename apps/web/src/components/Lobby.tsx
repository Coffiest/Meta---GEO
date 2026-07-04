"use client";

import { useEffect, useState } from "react";
import type { AuthState } from "@/lib/useAuth";
import type { GameKey } from "@/lib/socket";

interface PlayerStats {
  bankroll: number;
  tournamentsPlayed: number;
  itmCount: number;
  itmRate: number;
  totalBuyIns: number;
  totalPayouts: number;
  profit: number;
  roi: number;
}

const SERVER_URL = process.env["NEXT_PUBLIC_SERVER_URL"] ?? "http://localhost:4000";

// サーバー側(packages/server/src/lobby.ts)のGAME_CONFIGSと一致させてある表示用の定義。
// 実際に使われる金額はサーバー側の許可リストが常に正となる(クライアント側の値は表示のみ)。
const GAMES: { key: GameKey; title: string; subtitle: string; buyIn: number; seats: number }[] = [
  { key: "sng", title: "SNG", subtitle: "シット&ゴー", buyIn: 1000, seats: 6 },
  { key: "mtt", title: "MTT", subtitle: "マルチテーブル", buyIn: 2000, seats: 6 },
];

type FooterTab = "home" | "stats" | "leaderboard" | "history" | "notes" | "more";

const FOOTER_TABS: { key: FooterTab; label: string; icon: JSX.Element }[] = [
  {
    key: "home",
    label: "Home",
    icon: (
      <path d="M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5" strokeLinecap="round" strokeLinejoin="round" />
    ),
  },
  {
    key: "stats",
    label: "Stats",
    icon: (
      <path d="M4 20V10M12 20V4M20 20v-7" strokeLinecap="round" strokeLinejoin="round" />
    ),
  },
  {
    key: "leaderboard",
    label: "Leaderboard",
    icon: (
      <path
        d="M7 4h10v5a5 5 0 0 1-10 0V4ZM7 5H4a2 2 0 0 0 2 3M17 5h3a2 2 0 0 1-2 3M12 14v3m-3 3h6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    key: "history",
    label: "History",
    icon: (
      <path
        d="M4 6h16M4 12h16M4 18h10"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    key: "notes",
    label: "Notes",
    icon: (
      <path
        d="M6 3h9l3 3v15H6zM15 3v3h3M9 12h6M9 16h6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    key: "more",
    label: "More",
    icon: <path d="M5 12h.01M12 12h.01M19 12h.01" strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} />,
  },
];

function FooterIcon({ children, active }: { children: JSX.Element; active: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? 2.2 : 1.8}
      className="h-5 w-5"
    >
      {children}
    </svg>
  );
}

function StatTile({ label, value, tone }: { label: string; value: string; tone?: "mint" | "crimson" }) {
  const valueClass = tone === "mint" ? "text-mint-400" : tone === "crimson" ? "text-crimson-400" : "text-navy-50";
  return (
    <div className="rounded-xl bg-navy-900 ring-1 ring-navy-700 px-3 py-2.5">
      <div className="text-[11px] text-navy-400">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${valueClass}`}>{value}</div>
    </div>
  );
}

function formatSigned(n: number): string {
  return `${n > 0 ? "+" : ""}${n.toLocaleString()}`;
}

function StatsPanel({ stats }: { stats: PlayerStats | null }) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <StatTile label="バンクロール" value={stats ? stats.bankroll.toLocaleString() : "-"} />
        <StatTile
          label="収支"
          value={stats ? formatSigned(stats.profit) : "-"}
          tone={stats ? (stats.profit > 0 ? "mint" : stats.profit < 0 ? "crimson" : undefined) : undefined}
        />
        <StatTile label="ROI" value={stats ? `${(stats.roi * 100).toFixed(1)}%` : "-"} />
        <StatTile label="イン・ザ・マネー率" value={stats ? `${(stats.itmRate * 100).toFixed(1)}%` : "-"} />
        <StatTile label="参加トーナメント数" value={stats ? stats.tournamentsPlayed.toLocaleString() : "-"} />
        <StatTile label="入賞回数" value={stats ? stats.itmCount.toLocaleString() : "-"} />
      </div>
      <p className="text-[11px] text-navy-500 px-1 pt-2">
        収支の推移グラフ・VPIP/PFR/3Betなどの詳細アクションスタッツは近日公開予定です。
      </p>
    </div>
  );
}

function ComingSoonPanel({ title }: { title: string }) {
  return (
    <div className="rounded-2xl bg-navy-900 ring-1 ring-navy-700 py-16 text-center text-navy-400 text-sm">
      <div className="text-navy-200 font-medium mb-1">{title}</div>
      近日公開予定です
    </div>
  );
}

export function Lobby({
  auth,
  displayName,
  onJoin,
  onSignOut,
}: {
  auth: AuthState;
  displayName: string;
  onJoin: (gameKey: GameKey) => void;
  onSignOut?: () => void;
}) {
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [tab, setTab] = useState<FooterTab>("home");
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const token = auth.session?.access_token;
    if (!token) return;
    fetch(`${SERVER_URL}/api/lobby/stats`, { headers: { authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? (res.json() as Promise<PlayerStats>) : null))
      .then((json) => json && setStats(json))
      .catch(() => {});
  }, [auth.session]);

  return (
    <div className="min-h-screen bg-navy-950 flex flex-col">
      <header className="relative flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top)+16px)] pb-3">
        <div>
          <div className="text-[11px] tracking-[0.3em] text-mint-500 font-medium">TEN FOUR POKER</div>
          <div className="text-lg font-semibold text-navy-50">{displayName}</div>
        </div>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="h-9 w-9 rounded-full bg-navy-900/80 ring-1 ring-navy-700/50 flex items-center justify-center text-navy-300"
          aria-label="メニュー"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
            <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
          </svg>
        </button>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-4 top-[calc(env(safe-area-inset-top)+52px)] z-50 w-48 rounded-2xl bg-navy-900 ring-1 ring-navy-700 shadow-panel p-2">
              {onSignOut && (
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onSignOut();
                  }}
                  className="w-full text-left rounded-xl px-3 py-2.5 text-sm text-navy-200 hover:bg-navy-800 transition-colors"
                >
                  ログアウト
                </button>
              )}
            </div>
          </>
        )}
      </header>

      <main className="flex-1 overflow-y-auto px-4 pb-6 space-y-6">
        {tab === "home" && (
          <>
            <div className="space-y-3">
              <div className="text-center">
                <div className="text-[11px] tracking-[0.25em] text-navy-500">PLAY POKER</div>
                <div className="text-lg font-bold text-navy-50">6-MAX トーナメント</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {GAMES.map((game) => (
                  <button
                    key={game.key}
                    onClick={() => onJoin(game.key)}
                    className="rounded-2xl bg-gradient-to-br from-mint-500 to-mint-600 p-4 text-left shadow-card active:scale-[0.97] transition-transform"
                  >
                    <div className="text-white/80 text-[11px] font-medium">Ten-Four</div>
                    <div className="text-white text-xl font-bold">{game.title}</div>
                    <div className="text-white/70 text-[11px] mt-1">{game.subtitle}</div>
                    <div className="text-white/70 text-[11px] mt-2">
                      バイイン {game.buyIn.toLocaleString()} / {game.seats}人卓
                    </div>
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3 text-[11px] text-navy-500">
                {GAMES.map((game) => (
                  <div key={game.key} className="flex items-center gap-1 px-1">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-3.5 w-3.5">
                      <path d="M16 11a4 4 0 1 0-8 0M4 21v-2a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v2" strokeLinecap="round" />
                    </svg>
                    参加時にBOTが自動着席
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-[11px] tracking-[0.25em] text-navy-500 px-1">FEATURES</div>
              <div className="space-y-2">
                {[
                  { key: "stats" as const, title: "Stats", desc: "プレイ成績(ROI・収支・イン・ザ・マネー率)が表示されます。" },
                  { key: "leaderboard" as const, title: "Leaderboard", desc: "全プレイヤーのランキングが表示されます。" },
                  { key: "history" as const, title: "History", desc: "プレイしたトーナメントの履歴が表示されます。" },
                  { key: "notes" as const, title: "Notes", desc: "相手プレイヤーへのメモを表示・編集できます。" },
                ].map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setTab(f.key)}
                    className="w-full flex items-start gap-3 rounded-xl bg-navy-900 ring-1 ring-navy-700 px-3.5 py-3 text-left active:scale-[0.98] transition-transform"
                  >
                    <div className="h-9 w-9 shrink-0 rounded-lg bg-navy-800 flex items-center justify-center text-mint-400">
                      <FooterIcon active>{FOOTER_TABS.find((t) => t.key === f.key)!.icon}</FooterIcon>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-navy-50">{f.title}</div>
                      <div className="text-[11px] text-navy-400 mt-0.5">{f.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {tab === "stats" && <StatsPanel stats={stats} />}
        {tab === "leaderboard" && <ComingSoonPanel title="Leaderboard" />}
        {tab === "history" && <ComingSoonPanel title="Hand History" />}
        {tab === "notes" && <ComingSoonPanel title="Player Notes" />}
        {tab === "more" && <ComingSoonPanel title="More" />}
      </main>

      <nav className="safe-area-bottom border-t border-navy-800 bg-navy-950/95 backdrop-blur grid grid-cols-6">
        {FOOTER_TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex flex-col items-center gap-0.5 py-2.5 transition-colors ${active ? "text-mint-400" : "text-navy-500"}`}
            >
              <FooterIcon active={active}>{t.icon}</FooterIcon>
              <span className="text-[9px] font-medium">{t.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
