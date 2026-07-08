"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  geoApi,
  type GeoSummaryStats,
  type HandDetail,
  type PositionalRfiStat,
  type RangeMatrixResult,
  type RangeScenario,
  type RecentHandSummary,
} from "@/lib/geoApi";
import { StatTile } from "@/components/geo/StatTile";
import { PositionalRfiChart } from "@/components/geo/PositionalRfiChart";
import { HandHistoryList } from "@/components/geo/HandHistoryList";
import { HandDetailPanel } from "@/components/geo/HandDetailPanel";
import { RangeMatrix } from "@/components/geo/RangeMatrix";
import { SpotSelector } from "@/components/geo/SpotSelector";

type GeoTab = "range" | "analytics";

function RangeExplorer() {
  const [position, setPosition] = useState("BTN");
  const [scenario, setScenario] = useState<RangeScenario>("rfi");
  const [matrix, setMatrix] = useState<RangeMatrixResult | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setMatrix(null);
    setLoadError(false);
    geoApi
      .rangeMatrix(position, scenario)
      .then((m) => !cancelled && setMatrix(m))
      .catch(() => !cancelled && setLoadError(true));
    return () => {
      cancelled = true;
    };
  }, [position, scenario]);

  return (
    <div className="rounded-2xl bg-ink-900/70 ring-1 ring-ink-700/50 p-4">
      <div className="flex items-start justify-between gap-2 mb-4">
        <div>
          <h3 className="text-sm font-medium text-ink-100">レンジエクスプローラー</h3>
          <p className="text-[11px] text-ink-500 mt-0.5">
            ポジション・シナリオを選ぶと、実プレイヤーの169ハンドクラス別アクション頻度が13x13グリッドで表示されます。
          </p>
        </div>
        <div className="flex items-center gap-x-3 gap-y-1 flex-wrap justify-end shrink-0 text-[10px] text-ink-400">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-[#c98500]" />
            レイズ
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-[#3987e5]" />
            コール
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-ink-600" />
            フォールド
          </span>
        </div>
      </div>

      <SpotSelector position={position} scenario={scenario} onPositionChange={setPosition} onScenarioChange={setScenario} />

      <div className="mt-4">
        {loadError ? (
          <div className="py-10 text-center text-sm text-rose-400">レンジデータの取得に失敗しました。</div>
        ) : matrix ? (
          matrix.totalSamples === 0 ? (
            <div className="py-10 text-center text-sm text-ink-500">
              {position} / {scenario === "rfi" ? "RFI" : "vs オープン"} のサンプルがまだありません。プレイが進むと表示されます。
            </div>
          ) : (
            <>
              <div className="text-[11px] text-ink-500 mb-2">
                {position} ・ {scenario === "rfi" ? "オープンレイズ機会" : "vs オープン"} ・ サンプル {matrix.totalSamples.toLocaleString()}件
              </div>
              <RangeMatrix data={matrix} />
            </>
          )
        ) : (
          <div className="py-10 text-center text-sm text-ink-500">読み込み中…</div>
        )}
      </div>
    </div>
  );
}

export default function GeoPage() {
  const [tab, setTab] = useState<GeoTab>("range");
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

      <div className="flex gap-1.5 rounded-full bg-ink-900/70 ring-1 ring-ink-700/50 p-1 w-fit mb-4">
        <button
          onClick={() => setTab("range")}
          className={`rounded-full px-4 py-1.5 text-[12px] font-medium transition-colors ${
            tab === "range" ? "bg-gold-500 text-ink-950" : "text-ink-400 hover:text-ink-100"
          }`}
        >
          レンジ
        </button>
        <button
          onClick={() => setTab("analytics")}
          className={`rounded-full px-4 py-1.5 text-[12px] font-medium transition-colors ${
            tab === "analytics" ? "bg-gold-500 text-ink-950" : "text-ink-400 hover:text-ink-100"
          }`}
        >
          アナリティクス
        </button>
      </div>

      {tab === "range" ? (
        <RangeExplorer />
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}
