"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  createGeoApi,
  GeoDailyLimitError,
  type GeoSummaryStats,
  type HandDetail,
  type PositionalRfiStat,
  type RangeMatrixResult,
  type RangeScenario,
  type RecentHandSummary,
} from "@/lib/geoApi";
import { useAuth } from "@/lib/useAuth";
import { useSubscriptionStatus } from "@/lib/subscription";
import { StatTile } from "@/components/geo/StatTile";
import { PositionalRfiChart } from "@/components/geo/PositionalRfiChart";
import { HandHistoryList } from "@/components/geo/HandHistoryList";
import { HandDetailPanel } from "@/components/geo/HandDetailPanel";
import { RangeMatrix, RAISE_COLOR, CALL_COLOR, FOLD_COLOR } from "@/components/geo/RangeMatrix";
import { PositionTable } from "@/components/geo/PositionTable";
import { Icon } from "@/components/Lobby";

type GeoTab = "range" | "analytics";
type Street = "preflop" | "postflop";

const SCENARIOS: { key: RangeScenario; label: string }[] = [
  { key: "rfi", label: "RFI" },
  { key: "vsOpen", label: "vs Open" },
];

/**
 * GTO WizardのStudy最初の画面を踏襲した「Preflop / Postflop」切り替え。
 * Preflopは実データに基づく169ハンドクラスのレンジエクスプローラー(本実装)、
 * Postflopはボードテクスチャ別の集計基盤が未整備のため準備中表示にする。
 */
function StudyExplorer({
  geoApi,
  onDailyLimitReached,
}: {
  geoApi: ReturnType<typeof createGeoApi>;
  onDailyLimitReached: () => void;
}) {
  const [street, setStreet] = useState<Street>("preflop");

  return (
    <div className="rounded-2xl bg-ink-50 ring-1 ring-ink-400/60 overflow-hidden">
      <div className="flex items-center justify-center py-4 bg-ink-100/40">
        <div className="inline-flex rounded-full bg-ink-300 p-1 ring-1 ring-ink-400/60">
          {(["preflop", "postflop"] as Street[]).map((s) => (
            <button
              key={s}
              onClick={() => setStreet(s)}
              className={`rounded-full px-5 py-1.5 text-[12px] font-semibold capitalize transition-colors ${
                street === s ? "bg-mint-500 text-ink-950" : "text-ink-700 hover:text-ink-900"
              }`}
            >
              {s === "preflop" ? "Preflop" : "Postflop"}
            </button>
          ))}
        </div>
      </div>
      <div className="p-4">
        {street === "preflop" ? (
          <PreflopStudy geoApi={geoApi} onDailyLimitReached={onDailyLimitReached} />
        ) : (
          <PostflopComingSoon />
        )}
      </div>
    </div>
  );
}

function PreflopStudy({
  geoApi,
  onDailyLimitReached,
}: {
  geoApi: ReturnType<typeof createGeoApi>;
  onDailyLimitReached: () => void;
}) {
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
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof GeoDailyLimitError) {
          onDailyLimitReached();
        } else {
          setLoadError(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [position, scenario, geoApi, onDailyLimitReached]);

  return (
    <div>
      <PositionTable position={position} onChange={setPosition} />

      <div className="flex items-center justify-center gap-1 mt-4">
        {SCENARIOS.map((s) => (
          <button
            key={s.key}
            onClick={() => setScenario(s.key)}
            className={`rounded-md px-3.5 py-1.5 text-[11px] font-medium transition-colors ${
              scenario === s.key ? "bg-mint-500 text-ink-950" : "bg-ink-300 text-ink-700 hover:text-ink-900"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-center gap-x-4 gap-y-1 flex-wrap text-[10px] text-ink-700 mt-4">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm" style={{ background: RAISE_COLOR }} />
          レイズ
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm" style={{ background: CALL_COLOR }} />
          コール
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm" style={{ background: FOLD_COLOR }} />
          フォールド
        </span>
      </div>

      <div className="mt-4">
        {loadError ? (
          <div className="py-10 text-center text-sm text-rose-400">レンジデータの取得に失敗しました。</div>
        ) : matrix ? (
          matrix.totalSamples === 0 ? (
            <div className="py-10 text-center text-sm text-ink-600">
              {position} / {scenario === "rfi" ? "RFI" : "vs オープン"} のサンプルがまだありません。プレイが進むと表示されます。
            </div>
          ) : (
            <>
              <div className="text-[11px] text-ink-600 mb-2 text-center">
                {position} ・ {scenario === "rfi" ? "オープンレイズ機会" : "vs オープン"} ・ サンプル {matrix.totalSamples.toLocaleString()}件
              </div>
              <RangeMatrix data={matrix} />
            </>
          )
        ) : (
          <div className="py-10 text-center text-sm text-ink-600">読み込み中…</div>
        )}
      </div>
    </div>
  );
}

function PostflopComingSoon() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
      <div className="h-14 w-14 rounded-full bg-ink-300 ring-1 ring-ink-400 flex items-center justify-center text-ink-600">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-6 w-6">
          <rect x="5" y="11" width="14" height="9" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
      </div>
      <div className="text-sm font-medium text-ink-850">Postflopは近日対応予定です</div>
      <p className="text-[11px] text-ink-600 max-w-xs leading-relaxed">
        フロップ・ターン・リバーのレンジ分析にはボードテクスチャごとの集計基盤が必要なため、現在準備を進めています。
        まずはPreflopの実データ分析からご利用ください。
      </p>
    </div>
  );
}

/** 無料枠(1日の閲覧回数)を使い切った際のロック画面。サブスク登録への導線を出す。 */
function DailyLimitLocked() {
  return (
    <div className="rounded-2xl bg-ink-50 ring-1 ring-ink-400/60 p-8 text-center">
      <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-gold-500/20 flex items-center justify-center text-gold-600">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-6 w-6">
          <rect x="5" y="11" width="14" height="9" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
      </div>
      <div className="text-sm font-semibold text-ink-950 mb-1">本日の無料閲覧回数が上限に達しました</div>
      <p className="text-[12px] text-ink-600 leading-relaxed mb-4">
        GEO戦略DBは1日{5}回まで無料で閲覧できます。サブスクリプションに登録すると無制限に利用できます。
      </p>
      <Link
        href="/pricing"
        className="inline-block rounded-full bg-gold-500 text-ink-950 text-[12px] font-semibold px-5 py-2 shadow-card"
      >
        サブスクリプションを見る
      </Link>
    </div>
  );
}

/** ログインしていない状態で/geoに直接アクセスされた場合のガード画面。 */
function LoginRequired() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-sm text-ink-800">GEO戦略DBの閲覧にはログインが必要です。</p>
      <Link href="/" className="rounded-full bg-gold-500 text-ink-950 text-sm font-semibold px-5 py-2 shadow-card">
        ログイン画面へ
      </Link>
    </div>
  );
}

export default function GeoPage() {
  const { session, loading: authLoading } = useAuth();
  const accessToken = session?.access_token;
  const geoApi = useMemo(() => (accessToken ? createGeoApi(accessToken) : null), [accessToken]);
  const { status: subStatus, reload: reloadSubStatus } = useSubscriptionStatus(accessToken);
  const [tab, setTab] = useState<GeoTab>("range");
  const [summary, setSummary] = useState<GeoSummaryStats | null>(null);
  const [positional, setPositional] = useState<PositionalRfiStat[] | null>(null);
  const [hands, setHands] = useState<RecentHandSummary[] | null>(null);
  const [selectedHandId, setSelectedHandId] = useState<string | null>(null);
  const [selectedHand, setSelectedHand] = useState<HandDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dailyLimitReached, setDailyLimitReached] = useState(false);

  function handleDailyLimitReached() {
    setDailyLimitReached(true);
    void reloadSubStatus();
  }

  async function loadAll() {
    if (!geoApi) return;
    try {
      const [s, p, h] = await Promise.all([geoApi.summary(), geoApi.positionalRfi(6), geoApi.hands(20)]);
      setSummary(s);
      setPositional(p);
      setHands(h);
      setError(null);
    } catch (err) {
      if (err instanceof GeoDailyLimitError) {
        handleDailyLimitReached();
      } else {
        setError("対戦サーバーに接続できませんでした。packages/server が起動しているか確認してください。");
      }
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geoApi]);

  useEffect(() => {
    if (!selectedHandId || !geoApi) {
      setSelectedHand(null);
      return;
    }
    geoApi
      .handDetail(selectedHandId)
      .then(setSelectedHand)
      .catch((err) => {
        if (err instanceof GeoDailyLimitError) handleDailyLimitReached();
        setSelectedHand(null);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedHandId, geoApi]);

  const locked = dailyLimitReached && !subStatus?.active;

  if (!authLoading && !accessToken) return <LoginRequired />;

  return (
    <div className="min-h-screen">
      <div className="max-w-5xl mx-auto px-4 pb-28">
      <header className="flex items-center justify-between pt-[calc(env(safe-area-inset-top)+16px)] pb-4">
        <div>
          <div className="text-[11px] tracking-[0.25em] text-gold-500 font-medium">GEO STRATEGY DB</div>
          <h1 className="text-lg font-semibold text-ink-950">プレイヤー傾向分析</h1>
        </div>
        <div className="flex items-center gap-2">
          {subStatus && !subStatus.active && (
            <span className="text-[10px] text-ink-600">本日残り{subStatus.dailyViewsRemaining}回</span>
          )}
          <button
            onClick={loadAll}
            className="rounded-full bg-ink-300 text-ink-800 text-[11px] px-3 py-1.5 ring-1 ring-ink-500/60 hover:text-ink-900 transition-colors"
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

      <div className="flex gap-1.5 rounded-full bg-ink-100/70 ring-1 ring-ink-400/50 p-1 w-fit mb-4">
        <button
          onClick={() => setTab("range")}
          className={`rounded-full px-4 py-1.5 text-[12px] font-medium transition-colors ${
            tab === "range" ? "bg-gold-500 text-ink-950" : "text-ink-700 hover:text-ink-900"
          }`}
        >
          Study
        </button>
        <button
          onClick={() => setTab("analytics")}
          className={`rounded-full px-4 py-1.5 text-[12px] font-medium transition-colors ${
            tab === "analytics" ? "bg-gold-500 text-ink-950" : "text-ink-700 hover:text-ink-900"
          }`}
        >
          アナリティクス
        </button>
      </div>

      {locked ? (
        <DailyLimitLocked />
      ) : tab === "range" ? (
        geoApi && <StudyExplorer geoApi={geoApi} onDailyLimitReached={handleDailyLimitReached} />
      ) : (
        <>
          <p className="text-[12px] text-ink-600 mb-4 leading-relaxed">
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
              <h2 className="text-[12px] text-ink-700 mb-2">ハンド履歴</h2>
              {hands && <HandHistoryList hands={hands} selectedId={selectedHandId} onSelect={setSelectedHandId} />}
            </div>
            <div>
              <h2 className="text-[12px] text-ink-700 mb-2">ハンド詳細</h2>
              <HandDetailPanel hand={selectedHand} />
            </div>
          </div>
        </>
      )}
      </div>

      <nav className="fixed bottom-0 inset-x-0 border-t border-ink-300 bg-ink-50/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
        <div className="relative mx-auto max-w-md grid grid-cols-5 items-end">
          {(
            [
              { key: "home", label: "Home", icon: "home", href: "/" },
              { key: "stats", label: "Stats", icon: "stats", href: "/?tab=stats" },
              null,
              { key: "history", label: "History", icon: "layers", href: "/?tab=history" },
              { key: "leaderboard", label: "Leaderboard", icon: "trophy", href: "/?tab=leaderboard" },
            ] as ({ key: string; label: string; icon: string; href: string } | null)[]
          ).map((t, i) =>
            t ? (
              <Link key={t.key} href={t.href} className="flex flex-col items-center gap-0.5 py-2.5 text-ink-600">
                <Icon name={t.icon} />
                <span className="text-[9px] font-medium">{t.label}</span>
              </Link>
            ) : (
              <div key={`db-${i}`} className="relative flex justify-center">
                <div className="absolute -top-7 h-14 w-14 rounded-full bg-gradient-to-br from-gold-400 to-gold-600 ring-4 ring-ink-50 shadow-panel flex flex-col items-center justify-center text-ink-950">
                  <Icon name="db" className="h-5 w-5" />
                  <span className="text-[7px] font-bold tracking-wide mt-[1px]">DATABASE</span>
                </div>
                <div className="h-[54px]" />
              </div>
            ),
          )}
        </div>
      </nav>
    </div>
  );
}
