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
  { key: "sng", title: "SNG", subtitle: "シット&ゴー・6人卓", buyIn: 1000, seats: 6 },
  { key: "mtt", title: "MTT", subtitle: "マルチテーブルトーナメント", buyIn: 2000, seats: 6 },
];

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

  useEffect(() => {
    const token = auth.session?.access_token;
    if (!token) return;
    fetch(`${SERVER_URL}/api/lobby/stats`, { headers: { authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? (res.json() as Promise<PlayerStats>) : null))
      .then((json) => json && setStats(json))
      .catch(() => {});
  }, [auth.session]);

  return (
    <div className="min-h-screen bg-navy-950 px-4 pt-[calc(env(safe-area-inset-top)+20px)] pb-10 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] tracking-[0.3em] text-mint-500 font-medium">TEN FOUR POKER</div>
          <div className="text-lg font-semibold text-navy-50">{displayName}</div>
        </div>
        {onSignOut && (
          <button
            onClick={onSignOut}
            className="text-xs text-navy-400 ring-1 ring-navy-700 rounded-full px-3 py-1.5 active:scale-[0.97] transition-transform"
          >
            ログアウト
          </button>
        )}
      </div>

      <div className="space-y-2">
        <div className="text-xs text-navy-400 tracking-wide">スタッツ</div>
        <div className="grid grid-cols-2 gap-2">
          <StatTile label="バンクロール" value={stats ? stats.bankroll.toLocaleString() : "-"} />
          <StatTile
            label="収支"
            value={stats ? formatSigned(stats.profit) : "-"}
            tone={stats ? (stats.profit > 0 ? "mint" : stats.profit < 0 ? "crimson" : undefined) : undefined}
          />
          <StatTile label="ROI" value={stats ? `${(stats.roi * 100).toFixed(1)}%` : "-"} />
          <StatTile label="イン・ザ・マネー率" value={stats ? `${(stats.itmRate * 100).toFixed(1)}%` : "-"} />
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-xs text-navy-400 tracking-wide">ゲームを選択</div>
        <div className="space-y-3">
          {GAMES.map((game) => (
            <div
              key={game.key}
              className="rounded-2xl bg-navy-900 ring-1 ring-navy-700 p-4 flex items-center justify-between"
            >
              <div>
                <div className="text-base font-semibold text-navy-50">{game.title}</div>
                <div className="text-xs text-navy-400">{game.subtitle}</div>
                <div className="text-xs text-navy-500 mt-1">
                  バイイン {game.buyIn.toLocaleString()} / {game.seats}人卓
                </div>
              </div>
              <button
                onClick={() => onJoin(game.key)}
                className="rounded-xl bg-mint-500 text-white text-sm font-semibold px-5 py-2.5 shadow-card active:scale-[0.97] transition-transform"
              >
                参加する
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
