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

type Tab = "home" | "stats" | "leaderboard" | "history" | "mypage";

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
      title: "Mypage",
      desc: "プロフィールの編集や各種設定ができます。",
      icon: "user",
      tile: "bg-gradient-to-br from-amber-600 to-yellow-800",
      onClick: () => setTab("mypage"),
    },
  ];

  return (
    <div className="min-h-screen bg-navy-950 flex flex-col">
      <header className="flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top)+14px)] pb-3">
        <div className="flex items-center gap-1.5">
          <span className="rounded-md bg-white px-1.5 py-0.5 text-[13px] font-black text-navy-950">T♠</span>
          <span className="rounded-md bg-white px-1.5 py-0.5 text-[13px] font-black text-crimson-500">4♥</span>
        </div>
        <button
          onClick={() => setTab("mypage")}
          className="flex items-center gap-2 rounded-full bg-navy-900/80 ring-1 ring-navy-700/50 pl-1 pr-3 py-1"
        >
          <Avatar avatarKey={avatarKey} size={26} />
          <span className="text-xs text-navy-200 max-w-[96px] truncate">{displayName}</span>
        </button>
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
          </>
        )}

        {tab === "stats" && (
          <SectionCard>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-navy-50 font-semibold text-sm">
                <Icon name="stats" className="h-4 w-4" /> Stats
              </div>
              <button onClick={() => setTab("leaderboard")} className="text-navy-400" aria-label="ランキングへ">
                <Icon name="trophy" className="h-4 w-4" />
              </button>
            </div>
            {accessToken ? (
              stats ? (
                <>
                  <div className="grid grid-cols-3 gap-x-2 gap-y-5">
                    <div>
                      <div className="text-[11px] text-navy-400">参加トナメ数</div>
                      <div className="text-lg font-bold tabular-nums text-navy-50">{stats.tournamentsPlayed.toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-navy-400">収支</div>
                      <div className={`text-lg font-bold tabular-nums ${signedClass(stats.profit)}`}>{formatSigned(stats.profit)}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-navy-400">ROI</div>
                      <div className={`text-lg font-bold tabular-nums ${signedClass(stats.roi)}`}>{(stats.roi * 100).toFixed(1)}%</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-navy-400">イン・ザ・マネー率</div>
                      <div className="text-lg font-bold tabular-nums text-navy-50">{(stats.itmRate * 100).toFixed(1)}%</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-navy-400">入賞回数</div>
                      <div className="text-lg font-bold tabular-nums text-navy-50">{stats.itmCount.toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-navy-400">総賞金</div>
                      <div className="text-lg font-bold tabular-nums text-navy-50">{stats.totalPayouts.toLocaleString()}</div>
                    </div>
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
            <div className="flex items-center gap-2 text-navy-50 font-semibold text-sm mb-1">
              <Icon name="trophy" className="h-4 w-4" /> Leaderboard
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
            <div className="flex items-center gap-2 text-navy-50 font-semibold text-sm mb-3">
              <Icon name="layers" className="h-4 w-4" /> Hand History
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

        {tab === "mypage" && (
          <>
            <SectionCard>
              <div className="flex items-center gap-4">
                <Avatar avatarKey={avatarKey} size={56} />
                <div className="min-w-0">
                  <div className="text-base font-semibold text-navy-50 truncate">{displayName}</div>
                  {email && <div className="text-xs text-navy-400 truncate">{email}</div>}
                  {!accessToken && <div className="text-xs text-navy-500">ゲストプレイ中</div>}
                </div>
              </div>
            </SectionCard>
            <SectionCard>
              <div className="divide-y divide-navy-800">
                <button onClick={onEditProfile} className="w-full flex items-center justify-between py-3 text-sm text-navy-100">
                  プロフィールを編集 <span className="text-navy-500">›</span>
                </button>
                <button
                  onClick={() => setStructureOpen(true)}
                  className="w-full flex items-center justify-between py-3 text-sm text-navy-100"
                >
                  ブラインドストラクチャ <span className="text-navy-500">›</span>
                </button>
                <Link href="/geo" className="w-full flex items-center justify-between py-3 text-sm text-navy-100">
                  GEOデータベース <span className="text-navy-500">›</span>
                </Link>
                {onSignOut && (
                  <button onClick={onSignOut} className="w-full flex items-center justify-between py-3 text-sm text-crimson-400">
                    ログアウト <span className="text-navy-500">›</span>
                  </button>
                )}
              </div>
            </SectionCard>
            <p className="text-center text-[10px] text-navy-600">
              Ten Four Poker (トーナメント版) — バーチャルチップ専用。実際の金銭を賭けることはできません。
            </p>
          </>
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
              { key: "mypage" as Tab, label: "Mypage", icon: "user" },
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
    </div>
  );
}
