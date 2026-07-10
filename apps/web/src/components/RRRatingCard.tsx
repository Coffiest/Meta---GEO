"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Avatar } from "./Avatar";

export interface RRRatingData {
  rrRating: number;
  roi: number;
  tournamentsPlayed: number;
  nationalRank: number | null;
  totalRankedPlayers: number;
}

export interface TournamentHistoryPoint {
  tournamentId: string;
  gameType: string;
  finishedAt: string;
  buyIn: number;
  payout: number;
  /** 賞金 − バイイン */
  pnl: number;
  finishPosition: number | null;
  seatCount: number;
  rrRatingAfter: number;
  rrRatingDelta: number | null;
}

export const GAME_TYPE_LABEL: Record<string, string> = { sng: "Sit & Go", mtt: "MTT" };

/** RRPokerと同じく、下位帯(50未満で目安45未満)は細かい数値を伏せて「< 45」とだけ表示する。 */
export function displayRating(rr: number): string {
  return rr < 45 ? "< 45" : rr.toFixed(2);
}

function formatSigned(n: number): string {
  return `${n > 0 ? "+" : ""}${n.toLocaleString()}`;
}

const CHART_STEP = 52;
const CHART_HEIGHT = 108;
const CHART_PADDING_Y = 16;
const TOOLTIP_WIDTH = 260;

interface TooltipPos {
  left: number;
  top: number;
  above: boolean;
}

/**
 * RRPokerホーム画面の「Tournament History」と同じ、トーナメントごとの損益を横並びの点+
 * 折れ線で表示するインラインSVGチャート(専用チャートライブラリは使わず手組み)。
 * 点は着順あり(黒塗り)/フォールド等(白抜き)で色分けする。タップすると、RRPokerと同じく
 * その点から吹き出しとして詳細(バイイン・獲得・収支・トナメ偏差値)がポップオーバー表示される。
 */
function TournamentHistoryChart({ points }: { points: TournamentHistoryPoint[] }) {
  const [selected, setSelected] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState<TooltipPos | null>(null);

  if (points.length === 0) {
    return <p className="text-center text-[12px] text-ink-600 py-8">参加すると記録されます</p>;
  }

  const closeTooltip = () => {
    setSelected(null);
    setTooltipPos(null);
  };

  const values = points.map((p) => p.pnl).concat([0]);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const plotHeight = CHART_HEIGHT - CHART_PADDING_Y * 2;
  const yFor = (v: number) => CHART_PADDING_Y + ((max - v) / range) * plotHeight;
  const zeroY = yFor(0);
  const width = Math.max(points.length * CHART_STEP, 260);

  const xFor = (i: number) => i * CHART_STEP + CHART_STEP / 2;
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${xFor(i)} ${yFor(p.pnl)}`).join(" ");

  return (
    <div className="overflow-x-auto no-scrollbar -mx-1 px-1" onScroll={closeTooltip}>
      <svg width={width} height={CHART_HEIGHT + 22} className="block" style={{ overflow: "visible" }}>
        <line x1={0} y1={zeroY} x2={width} y2={zeroY} stroke="#d4d4d4" strokeWidth={1} strokeDasharray="3,3" />
        <path d={linePath} fill="none" stroke="#0a0a0a" strokeWidth={1.6} />
        {points.map((p, i) => {
          const cx = xFor(i);
          const cy = yFor(p.pnl);
          const itm = p.pnl >= 0;
          const date = new Date(p.finishedAt);
          const dateLabel = `${date.getMonth() + 1}/${date.getDate()}`;
          return (
            <g
              key={p.tournamentId}
              className="cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                if (selected === i) {
                  closeTooltip();
                  return;
                }
                const circle = e.currentTarget.querySelector('circle:not([fill="transparent"])');
                const rect = (circle ?? e.currentTarget).getBoundingClientRect();
                const above = rect.top - 280 > 56;
                const left = Math.min(
                  Math.max(rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2, 8),
                  window.innerWidth - TOOLTIP_WIDTH - 8,
                );
                const top = above ? rect.top - 256 : rect.bottom + 12;
                setSelected(i);
                setTooltipPos({ left, top, above });
              }}
            >
              <circle cx={cx} cy={cy} r={16} fill="transparent" />
              <circle
                cx={cx}
                cy={cy}
                r={selected === i ? 11 : 9}
                fill={itm ? "#0a0a0a" : "#ffffff"}
                stroke={itm ? "#ffffff" : "#0a0a0a"}
                strokeWidth={1.5}
                style={{ transition: "r 0.15s" }}
              />
              {itm && p.finishPosition != null && (
                <text x={cx} y={cy + 3} textAnchor="middle" fontSize={8} fontWeight={700} fill="white">
                  {p.finishPosition}
                </text>
              )}
              <text x={cx} y={CHART_HEIGHT + 16} textAnchor="middle" fontSize={9} fill="#737373">
                {dateLabel}
              </text>
            </g>
          );
        })}
      </svg>

      {/* タップした点からRRPokerと同じ吹き出しでポップオーバー表示 */}
      {selected != null && tooltipPos && points[selected] && (
        <>
          <div className="fixed inset-0 z-[499]" onClick={closeTooltip} />
          {(() => {
            const p = points[selected]!;
            const date = new Date(p.finishedAt);
            const pnlClass = p.pnl > 0 ? "text-mint-600" : p.pnl < 0 ? "text-crimson-500" : "text-ink-700";
            return (
              <motion.div
                initial={{ opacity: 0, y: tooltipPos.above ? 6 : -6, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className="fixed z-[500]"
                style={{ left: tooltipPos.left, top: tooltipPos.top, width: TOOLTIP_WIDTH }}
                onClick={(e) => e.stopPropagation()}
              >
                {!tooltipPos.above && (
                  <div className="mx-auto h-2.5 w-2.5 rotate-45 bg-white ring-1 ring-ink-300 -mb-[7px] relative z-[1]" style={{ marginLeft: TOOLTIP_WIDTH / 2 - 5 }} />
                )}
                <div className="rounded-2xl bg-white ring-1 ring-ink-300 shadow-[0_8px_32px_rgba(0,0,0,0.18)] overflow-hidden relative z-[2]">
                  <div className="flex items-start justify-between px-3.5 pt-3 pb-2.5 border-b border-ink-200">
                    <div>
                      <p className="text-[13px] font-bold text-ink-950">{GAME_TYPE_LABEL[p.gameType] ?? p.gameType}</p>
                      <p className="text-[10px] text-ink-600 mt-0.5">
                        {date.toLocaleDateString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit" })} ・ {p.seatCount}人卓
                      </p>
                    </div>
                    {p.finishPosition != null && (
                      <div className="h-8 w-8 rounded-full bg-gradient-to-br from-gold-400 to-gold-600 flex items-center justify-center shrink-0">
                        <span className="text-[11px] font-black text-white">{p.finishPosition}位</span>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-px bg-ink-200">
                    <div className="bg-white px-1.5 py-2 text-center">
                      <p className="text-[9px] text-ink-600 mb-0.5">バイイン</p>
                      <p className="text-[12px] font-bold text-ink-950 tabular-nums">{p.buyIn.toLocaleString()}</p>
                    </div>
                    <div className="bg-white px-1.5 py-2 text-center">
                      <p className="text-[9px] text-ink-600 mb-0.5">獲得</p>
                      <p className="text-[12px] font-bold text-ink-950 tabular-nums">{p.payout.toLocaleString()}</p>
                    </div>
                    <div className="bg-white px-1.5 py-2 text-center">
                      <p className="text-[9px] text-ink-600 mb-0.5">収支</p>
                      <p className={`text-[12px] font-bold tabular-nums ${pnlClass}`}>{formatSigned(p.pnl)}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between px-3.5 py-2.5">
                    <span className="text-[11px] font-semibold text-gold-700">トナメ偏差値</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[13px] font-black text-gold-700 tabular-nums">{displayRating(p.rrRatingAfter)}</span>
                      {p.rrRatingDelta != null && Math.abs(p.rrRatingDelta) >= 0.01 && (
                        <span
                          className={`text-[10px] font-bold rounded-md px-1.5 py-0.5 tabular-nums ${
                            p.rrRatingDelta >= 0 ? "text-mint-700 bg-mint-500/10" : "text-crimson-700 bg-crimson-500/10"
                          }`}
                        >
                          {p.rrRatingDelta >= 0 ? "+" : ""}
                          {p.rrRatingDelta.toFixed(2)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {tooltipPos.above && (
                  <div className="mx-auto h-2.5 w-2.5 rotate-45 bg-white ring-1 ring-ink-300 -mt-[7px] relative z-[1]" style={{ marginLeft: TOOLTIP_WIDTH / 2 - 5 }} />
                )}
              </motion.div>
            );
          })()}
        </>
      )}
    </div>
  );
}

/** 見出しの左右に細い罫線を添えるラベル(例: ── トナメ偏差値 ──)。Swissデザインのkicker表現。 */
export function RuleLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="h-px flex-1 bg-ink-300" />
      <span className="text-[11px] font-bold tracking-[0.15em] uppercase text-ink-500 shrink-0">{children}</span>
      <div className="h-px flex-1 bg-ink-300" />
    </div>
  );
}

/**
 * 「トナメ偏差値」(RRRating)カード。RRPokerのホーム画面ヒーローカードと同じ構成
 * (アバター/名前の識別行→ヒーロー部の偏差値→参加数/コスト合計/リターン+インマネ率/ROIの
 * 統計グリッド→ランキングを見るボタン→Tournament History折れ線グラフ)を、モノクロ+ゴールド
 * アクセント(ROIのみ)のSwissデザインで表示する。
 * 計算ロジックはpackages/db/src/rrRating.tsでRRPokerの実装と全く同じ式を再現している。
 */
export function RRRatingCard({
  displayName,
  avatarKey,
  data,
  itmRate,
  totalBuyIns,
  totalPayouts,
  history,
  onViewLeaderboard,
  onViewHistory,
}: {
  displayName: string;
  avatarKey: string | null;
  data: RRRatingData | null;
  itmRate: number;
  totalBuyIns: number;
  totalPayouts: number;
  history: TournamentHistoryPoint[] | null;
  onViewLeaderboard: () => void;
  onViewHistory: () => void;
}) {
  const [infoOpen, setInfoOpen] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-[20px] bg-white ring-[1.5px] ring-ink-950 overflow-hidden"
    >
      <div className="relative px-5 pt-4 pb-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <Avatar avatarKey={avatarKey} displayName={displayName} size={34} />
            <p className="text-sm font-bold text-ink-950 truncate min-w-0">{displayName}</p>
          </div>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => setInfoOpen((v) => !v)}
            aria-label="トナメ偏差値について"
            className="h-[22px] w-[22px] shrink-0 rounded-full border border-ink-950 flex items-center justify-center text-ink-800"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3 w-3">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 11v5.5M12 8v.01" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </motion.button>
        </div>

        <div className="mb-3">
          <RuleLabel>トナメ偏差値</RuleLabel>
        </div>

        <div className="flex items-end gap-2.5 justify-center">
          {!data || data.tournamentsPlayed === 0 ? (
            <p className="text-4xl font-black text-ink-400 tracking-tight">集計中</p>
          ) : (
            <>
              <motion.p
                key={data.rrRating}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-5xl font-black text-ink-950 tracking-tight tabular-nums"
              >
                {displayRating(data.rrRating)}
              </motion.p>
              {data.nationalRank != null && (
                <div className="mb-1.5 rounded-full bg-ink-950 px-2.5 py-1">
                  <p className="text-xs font-bold text-white">全国{data.nationalRank.toLocaleString()}位</p>
                </div>
              )}
            </>
          )}
        </div>

        <AnimatePresence>
          {infoOpen && (
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.97 }}
              transition={{ duration: 0.2 }}
              className="mt-3 rounded-xl bg-ink-100 border border-ink-300 p-3 text-[11px] leading-relaxed text-ink-700"
            >
              ROIをもとにトーナメントの実力を偏差値(平均50)で表したもの。参加数が少ないうちは変動しにくく、参加すればするほど実力に近い値になります。
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="px-4 pb-4">
        <div className="grid grid-cols-3 divide-x divide-ink-200 border-y border-ink-200 py-3 mb-2">
          <StatCol label="参加数" value={(data?.tournamentsPlayed ?? 0).toLocaleString()} />
          <StatCol label="コスト合計" value={totalBuyIns.toLocaleString()} />
          <StatCol label="リターン" value={totalPayouts.toLocaleString()} />
        </div>
        <div className="grid grid-cols-2 divide-x divide-ink-200 pb-4">
          <StatCol label="インマネ率" value={`${(itmRate * 100).toFixed(0)}%`} />
          <StatCol label="ROI" value={`${((data?.roi ?? 0) * 100).toFixed(0)}%`} accent />
        </div>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={onViewLeaderboard}
          className="w-full h-11 rounded-full border-[1.5px] border-ink-950 text-ink-950 text-[13px] font-bold flex items-center justify-center"
        >
          ランキングを見る
        </motion.button>
      </div>

      <div className="border-t border-ink-300 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4 text-ink-700">
              <path d="M7 4h10v4.5a5 5 0 0 1-10 0V4Z" strokeLinejoin="round" />
              <path d="M7 5.2H4.6A2.4 2.4 0 0 0 7 8.4M17 5.2h2.4A2.4 2.4 0 0 1 17 8.4" strokeLinecap="round" />
            </svg>
            <p className="text-[13px] font-bold text-ink-950">Tournament History</p>
          </div>
          <button onClick={onViewHistory} className="text-[11px] text-gold-600 font-semibold underline decoration-dashed underline-offset-4">
            もっと見る
          </button>
        </div>
        {history === null ? (
          <div className="py-8 text-center text-ink-600 text-xs">読み込み中…</div>
        ) : (
          <TournamentHistoryChart points={history} />
        )}
      </div>
    </motion.div>
  );
}

function StatCol({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="text-center px-1">
      <div className="text-[10px] text-ink-500 mb-0.5">{label}</div>
      <div className={`text-sm font-bold tabular-nums ${accent ? "text-gold-600" : "text-ink-950"}`}>{value}</div>
    </div>
  );
}
