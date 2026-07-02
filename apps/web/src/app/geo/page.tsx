"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { geoApi, type GeoSummaryStats, type HandDetail, type PositionalRfiStat, type RecentHandSummary } from "@/lib/geoApi";
import { StatTile } from "@/components/geo/StatTile";
import { PositionalRfiChart } from "@/components/geo/PositionalRfiChart";
import { HandHistoryList } from "@/components/geo/HandHistoryList";
import { HandDetailPanel } from "@/components/geo/HandDetailPanel";

export default function GeoPage() {
  const [summary, setSummary] = useState<GeoSummaryStats | null>(null);
  const [positional, setPositional] = useState<PositionalRfiStat[] | null>(null);
  const [hands, setHands] = useState<RecentHandSummary[] | null>(null);
  const [selectedHandId, setSelectedHandId] = useState<string | null>(null);
  const [selectedHand, setSelectedHand] = useState<HandDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadAll() {
    try {
      const [s, p, h] = await Promise.all([geoApi.summary(), geoApi.positionalRfi(6), geoApi.hands(20)]);
      setSummary(s);
      setPositional(p);
      setHands(h);
      setError(null);
    } catch {
      setError("対戦サーバーに接続できませんでした。packages/server が起動しているか確認してください。");
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (!selectedHandId) {
      setSelectedHand(null);
      return;
    }
    geoApi
      .handDetail(selectedHandId)
      .then(setSelectedHand)
      .catch(() => setSelectedHand(null));
  }, [selectedHandId]);

  return (
    <div className="min-h-screen max-w-5xl mx-auto px-4 pb-16">
      <header className="flex items-center justify-between pt-[calc(env(safe-area-inset-top)+16px)] pb-4">
        <div>
          <div className="text-[11px] tracking-[0.25em] text-gold-500 font-medium">GEO STRATEGY DB</div>
          <h1 className="text-lg font-semibold text-ink-50">プレイヤー傾向分析</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadAll}
            className="rounded-full bg-ink-800 text-ink-300 text-[11px] px-3 py-1.5 ring-1 ring-ink-600/60 hover:text-ink-100 transition-colors"
          >
            更新
          </button>
          <Link
            href="/"
            className="rounded-full bg-gold-500 text-ink-950 text-[11px] font-semibold px-3 py-1.5 shadow-card"
          >
            テーブルへ
          </Link>
        </div>
      </header>

      {error && (
        <div className="rounded-2xl bg-rose-500/10 ring-1 ring-rose-500/30 text-rose-300 text-sm px-4 py-3 mb-4">
          {error}
        </div>
      )}

      <p className="text-[12px] text-ink-500 mb-4 leading-relaxed">
        このテーブルでプレイされた全ハンド・全アクションを記録し、スポットごとの傾向を可視化しています。
        GTOソルバーとの比較(理論値との乖離)は今後実装予定です。現時点では実際のプレイヤー母集団の
        実測データのみを表示しています。
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-5">
        <StatTile label="記録済みハンド数" value={summary ? summary.totalHands.toLocaleString() : "—"} />
        <StatTile label="プレイヤー数" value={summary ? summary.totalPlayers.toLocaleString() : "—"} hint="BOTを除く" />
        <StatTile label="平均ポット" value={summary ? summary.averagePot.toLocaleString() : "—"} />
        <StatTile
          label="ショーダウン率"
          value={summary ? `${Math.round(summary.showdownRate * 100)}%` : "—"}
          hint="残りはフォールドで決着"
        />
      </div>

      {positional && <PositionalRfiChart data={positional} />}

      <div className="grid md:grid-cols-2 gap-4 mt-5">
        <div>
          <h2 className="text-[12px] text-ink-400 mb-2">ハンド履歴</h2>
          {hands && <HandHistoryList hands={hands} selectedId={selectedHandId} onSelect={setSelectedHandId} />}
        </div>
        <div>
          <h2 className="text-[12px] text-ink-400 mb-2">ハンド詳細</h2>
          <HandDetailPanel hand={selectedHand} />
        </div>
      </div>
    </div>
  );
}
