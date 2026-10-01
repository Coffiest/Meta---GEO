"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Lobby";
import { Loader } from "@/components/ui/Loader";
import { useAuth } from "@/lib/useAuth";
import {
  DIMENSION_LABELS,
  METRIC_META,
  RESEARCH_PRESETS,
  bucketLabel,
  fetchResearchCrosstab,
  fetchResearchSummary,
  formatMetric,
  type ResearchCrosstabResult,
  type ResearchDimension,
  type ResearchFilters,
  type ResearchMetric,
  type ResearchScope,
} from "@/lib/researchApi";

/**
 * データベースタブの「その他 → データ研究」。
 *
 * 記録した全アクション(思考時間・状況・その時点の優勝率/インマネ率・直前に大きいポットを取った/落とした …)
 * を、軸 × 指標で集計して見る。プリセットで代表的な問いを1タップで開け、自由集計で軸・指標・絞り込みを選べる。
 *
 * グラフは横棒(帯の名前が長い日本語でも読めるように)。1系列なので色はアクセント1色で、凡例は置かずに
 * 見出しで名前を示す。全体の値を縦の点線で重ね、各帯の値と件数を右に出す(表を兼ねる)。
 * 件数が足りない帯は値を伏せ、棒を描かない。
 */
export default function ResearchPage() {
  const { authAvailable, loading, accessToken } = useAuth();
  const router = useRouter();

  // 埋め込み表示ではセッションが無くトークンだけがあるので、トークンの有無で判定する。
  useEffect(() => {
    if (authAvailable && !loading && !accessToken) router.replace("/");
  }, [authAvailable, loading, accessToken, router]);

  const [scope, setScope] = useState<ResearchScope>("all");
  const [presetId, setPresetId] = useState<string | null>(RESEARCH_PRESETS[0]!.id);
  const [dimension, setDimension] = useState<ResearchDimension>(RESEARCH_PRESETS[0]!.dimension);
  const [metric, setMetric] = useState<ResearchMetric>(RESEARCH_PRESETS[0]!.metric);
  const [filters, setFilters] = useState<ResearchFilters>({});
  const [result, setResult] = useState<ResearchCrosstabResult | null>(null);
  const [summary, setSummary] = useState<{ decisions: number; hands: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preset = RESEARCH_PRESETS.find((p) => p.id === presetId) ?? null;

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    setBusy(true);
    setError(null);
    fetchResearchCrosstab(accessToken, { dimension, metric, scope, filters })
      .then((r) => !cancelled && setResult(r))
      .catch(() => !cancelled && setError("集計を取得できませんでした。時間をおいて開き直してください。"))
      .finally(() => !cancelled && setBusy(false));
    return () => {
      cancelled = true;
    };
  }, [accessToken, dimension, metric, scope, filters]);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    fetchResearchSummary(accessToken, scope)
      .then((s) => !cancelled && setSummary(s))
      .catch(() => !cancelled && setSummary(null));
    return () => {
      cancelled = true;
    };
  }, [accessToken, scope]);

  function choosePreset(id: string) {
    const p = RESEARCH_PRESETS.find((x) => x.id === id);
    if (!p) return;
    setPresetId(id);
    setDimension(p.dimension);
    setMetric(p.metric);
    setFilters(p.filters ?? {});
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <Loader size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas pb-16">
      <header className="glass-header sticky top-0 z-20 flex items-center gap-2.5 px-4 pb-2.5 pt-[calc(env(safe-area-inset-top)+10px)]">
        <Link
          href="/geo"
          aria-label="データベースへ戻る"
          className="pressable flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-fg"
        >
          <Icon name="chevron-left" className="h-4 w-4" />
        </Link>
        <p className="text-[16px] font-bold tracking-tight text-fg">データ研究</p>
        {summary && (
          <p className="ml-auto text-[11px] font-semibold tabular-nums text-fg-3">
            {summary.hands.toLocaleString()}ハンド・{summary.decisions.toLocaleString()}アクション
          </p>
        )}
      </header>

      <main className="mx-auto max-w-3xl px-4">
        {/* 対象 */}
        <div className="mt-4 grid grid-cols-2 gap-1 rounded-xl bg-surface p-1" role="tablist" aria-label="対象">
          {(["all", "me"] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={scope === s}
              onClick={() => setScope(s)}
              className={`pressable rounded-lg py-2 text-[13px] font-bold ${scope === s ? "bg-surface-2 text-fg shadow-e1" : "text-fg-2"}`}
            >
              {s === "all" ? "全プレイヤー" : "自分"}
            </button>
          ))}
        </div>

        {/* プリセット(代表的な問い) */}
        <h2 className="mb-2 mt-6 px-1 text-[12px] font-black tracking-[0.08em] text-fg-3">よく見る問い</h2>
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {RESEARCH_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => choosePreset(p.id)}
              className={`pressable shrink-0 rounded-xl border px-3 py-2 text-left ${
                presetId === p.id ? "border-accent bg-accent/15" : "border-line bg-surface"
              }`}
            >
              <span className={`block text-[12px] font-black ${presetId === p.id ? "text-accent" : "text-fg"}`}>{p.title}</span>
            </button>
          ))}
        </div>

        {/* 自由集計 */}
        <section className="mt-4 rounded-2xl bg-surface p-3.5 shadow-e1" aria-label="自由集計">
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="軸">
              <select
                value={dimension}
                onChange={(e) => {
                  setPresetId(null);
                  setDimension(e.target.value as ResearchDimension);
                }}
                className={SELECT}
              >
                {(Object.keys(DIMENSION_LABELS) as ResearchDimension[]).map((d) => (
                  <option key={d} value={d}>
                    {DIMENSION_LABELS[d]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="指標">
              <select
                value={metric}
                onChange={(e) => {
                  setPresetId(null);
                  setMetric(e.target.value as ResearchMetric);
                }}
                className={SELECT}
              >
                {(Object.keys(METRIC_META) as ResearchMetric[]).map((m) => (
                  <option key={m} value={m}>
                    {METRIC_META[m].label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="ストリート">
              <select
                value={filters.street ?? ""}
                onChange={(e) => setFilters((f) => ({ ...f, street: e.target.value || undefined }))}
                className={SELECT}
              >
                <option value="">すべて</option>
                <option value="preflop">プリフロップ</option>
                <option value="flop">フロップ</option>
                <option value="turn">ターン</option>
                <option value="river">リバー</option>
              </select>
            </Field>
            <Field label="ベット">
              <select
                value={filters.facingBet === undefined ? "" : filters.facingBet ? "yes" : "no"}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, facingBet: e.target.value === "" ? undefined : e.target.value === "yes" }))
                }
                className={SELECT}
              >
                <option value="">すべて</option>
                <option value="yes">ベットに直面</option>
                <option value="no">直面していない</option>
              </select>
            </Field>
            <Field label="種類">
              <select
                value={filters.gameType ?? ""}
                onChange={(e) => setFilters((f) => ({ ...f, gameType: e.target.value || undefined }))}
                className={SELECT}
              >
                <option value="">すべて</option>
                <option value="sng">SNG</option>
                <option value="mtt">MTT</option>
              </select>
            </Field>
            <Field label="期間">
              <select
                value={filters.days ?? ""}
                onChange={(e) => setFilters((f) => ({ ...f, days: e.target.value ? Number(e.target.value) : undefined }))}
                className={SELECT}
              >
                <option value="">全期間</option>
                <option value="30">直近30日</option>
                <option value="7">直近7日</option>
              </select>
            </Field>
          </div>
        </section>

        {/* グラフ */}
        <section className="mt-4 rounded-2xl bg-surface p-4 shadow-e1" aria-live="polite">
          <p className="text-[15px] font-black tracking-tight text-fg">
            {METRIC_META[metric].label} × {DIMENSION_LABELS[dimension]}
          </p>
          <p className="mt-0.5 text-[11px] text-fg-2">
            {preset && presetId ? `${preset.question}。` : ""}
            {METRIC_META[metric].unit}・{scope === "all" ? "全プレイヤー" : "自分"}
          </p>
          {busy && !result ? (
            <div className="flex justify-center py-10">
              <Loader size="md" />
            </div>
          ) : error ? (
            <p className="py-8 text-center text-[12px] text-crimson-300">{error}</p>
          ) : result ? (
            <ResearchBars result={result} />
          ) : null}
        </section>

        <p className="mt-4 px-1 text-[11px] leading-relaxed text-fg-3">
          件数が {result?.minSample ?? 30} 件未満の帯は、値がぶれやすいので表示しません。
          優勝率はその時点のチップ比、インマネ率と期待賞金は ICM(Malmuth-Harville)で計算しています。
          「大きいポット」は、そのハンドの開始時のスタックの半分以上か 20bb 以上を取った/落としたハンドです。
          思考時間・優勝率・インマネ率は記録を始めたあとのハンドだけにあり、それ以前は「記録なし」「不明」に入ります。
        </p>
      </main>
    </div>
  );
}

const SELECT =
  "pressable w-full appearance-none rounded-lg border border-line bg-surface-2 px-2.5 py-2 text-[12px] font-bold text-fg";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-black tracking-[0.06em] text-fg-3">{label}</span>
      {children}
    </label>
  );
}

/**
 * 横棒グラフ(兼・表)。値の範囲に 0 を含め、負の値(収支)は 0 から左へ伸ばす。
 * 全体の値を縦の点線で重ねる。タップした帯は件数を強調する。
 */
function ResearchBars({ result }: { result: ResearchCrosstabResult }) {
  const [active, setActive] = useState<string | null>(null);
  const { buckets, overall, metric, dimension } = result;
  const values = buckets.map((b) => b.value).filter((v): v is number => v !== null);
  const scale = useMemo(() => {
    const all = overall.value !== null ? [...values, overall.value] : values;
    const min = Math.min(0, ...all);
    const max = Math.max(0, ...all, 1e-9);
    return { min, max, span: max - min || 1 };
  }, [values, overall.value]);
  const x = (v: number) => ((v - scale.min) / scale.span) * 100;

  if (buckets.length === 0) {
    return <p className="py-8 text-center text-[12px] text-fg-2">まだ集計できるデータがありません。</p>;
  }

  return (
    <div className="mt-3">
      <p className="mb-2 text-[11px] font-semibold tabular-nums text-fg-2">
        全体 <span className="font-black text-fg">{formatMetric(metric, overall.value)}</span>
        <span className="text-fg-3">(n={overall.n.toLocaleString()})</span>
      </p>
      <ul className="space-y-1.5">
        {buckets.map((b) => {
          const on = active === b.key;
          const v = b.value;
          const left = v === null ? 0 : Math.min(x(0), x(v));
          const width = v === null ? 0 : Math.abs(x(v) - x(0));
          return (
            <li key={b.key}>
              <button
                type="button"
                onClick={() => setActive(on ? null : b.key)}
                aria-pressed={on}
                className={`pressable grid w-full grid-cols-[minmax(0,38%)_minmax(0,1fr)_auto] items-center gap-2 rounded-lg px-1.5 py-1 text-left ${
                  on ? "bg-surface-2" : ""
                }`}
              >
                <span className="truncate text-[11px] font-bold text-fg-2">{bucketLabel(dimension, b.key)}</span>
                <span className="relative h-4">
                  {/* 0 の線(負の値があるときだけ意味を持つ) */}
                  {scale.min < 0 && <span className="absolute inset-y-0 w-px bg-line" style={{ left: `${x(0)}%` }} />}
                  {v !== null && (
                    <span
                      className="absolute inset-y-0.5 rounded-[4px] bg-accent"
                      style={{ left: `${left}%`, width: `max(${width}%, 2px)` }}
                    />
                  )}
                  {overall.value !== null && (
                    <span
                      aria-hidden
                      className="absolute -inset-y-0.5 border-l border-dashed border-fg-3"
                      style={{ left: `${x(overall.value)}%` }}
                    />
                  )}
                </span>
                <span className="w-[5.6em] text-right text-[11px] font-black tabular-nums text-fg">
                  {formatMetric(metric, v)}
                  <span className={`block text-[9px] font-semibold ${on ? "text-fg-2" : "text-fg-3"}`}>
                    n={b.n.toLocaleString()}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 flex items-center gap-1.5 text-[10px] text-fg-3">
        <span aria-hidden className="inline-block h-3 border-l border-dashed border-fg-3" />
        点線は全体の値
      </p>
    </div>
  );
}
