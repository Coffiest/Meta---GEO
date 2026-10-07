"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { SPRING_SNAPPY } from "@/lib/motion";
import type { TournamentOverInfo } from "@/lib/socket";
import { useCountUp } from "@/lib/useCountUp";
import { useI18n } from "@/lib/i18n";
import { UpsellCard } from "@/components/UpsellCard";
import { prewarmTournamentReview } from "@/lib/reviewApi";
import { PROD_URL, buildMilestoneShareUrl, shareOrTweet } from "@/lib/share";
import { buildMilestoneShareText, detectMilestone } from "@/lib/milestone";
import { TournamentReviewModal } from "@/components/review/TournamentReviewModal";
import { Icon } from "./Icon";
import { AdSlot } from "@/components/AdSlot";
import { ClassificationBadge } from "@/components/review/ClassificationBadge";
import { CLASSIFICATION_META, type Classification } from "@/lib/classification";
import { fetchTournamentReviewSummary, type TournamentReviewSummary } from "@/lib/reviewApi";

const SERVER_URL = process.env["NEXT_PUBLIC_SERVER_URL"] ?? "http://localhost:4000";

/** 結果画面で使う、集計スタッツ+偏差値のスナップショット。 */
export interface ResultStatsSnapshot {
  profit: number;
  roi: number;
  itmRate: number;
  nationalRank: number | null;
  totalRankedPlayers: number;
  /** 通算参加トーナメント数(マイルストーン検出に使う)。 */
  tournamentsPlayed: number;
}

/** ログイン中ユーザーのスタッツ+全国順位を取得してスナップショットにまとめる。 */
export async function fetchResultSnapshot(accessToken: string): Promise<ResultStatsSnapshot | null> {
  try {
    const res = await fetch(`${SERVER_URL}/api/lobby/stats`, { headers: { authorization: `Bearer ${accessToken}` } });
    if (!res.ok) return null;
    const s = (await res.json()) as ResultStatsSnapshot;
    return {
      profit: s.profit ?? 0,
      roi: s.roi ?? 0,
      itmRate: s.itmRate ?? 0,
      nationalRank: s.nationalRank ?? null,
      totalRankedPlayers: s.totalRankedPlayers ?? 0,
      tournamentsPlayed: s.tournamentsPlayed ?? 0,
    };
  } catch {
    return null;
  }
}

/** target値まで滑らかにカウントアップするフック(before→afterのアニメ表示用)。 */
type DeltaTone = "up" | "down" | "flat";

/** 1つの指標カード: ラベル + カウントアップする現在値 + 「+OO / -OO」の増減バッジ。 */
function MetricCard({
  label,
  from,
  to,
  format,
  delta,
  deltaText,
  deltaTone,
  delay,
}: {
  label: string;
  from: number;
  to: number;
  format: (v: number) => string;
  delta: boolean;
  deltaText: string;
  deltaTone: DeltaTone;
  delay: number;
}) {
  const v = useCountUp(from, to, 1200, delay);
  const toneClass = deltaTone === "up" ? "text-mint-400 bg-mint-500/10" : deltaTone === "down" ? "text-crimson-300 bg-crimson-500/10" : "text-fg-2 bg-n-2";
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: delay / 1000, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-2xl bg-canvas px-3.5 py-3"
    >
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-fg-3">{label}</p>
      <div className="mt-1 flex items-baseline justify-between gap-2">
        <span className="text-[18px] font-black tabular-nums text-fg">{format(v)}</span>
        {delta && (
          <motion.span
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: delay / 1000 + 1.1, type: "spring", stiffness: 520, damping: 20 }}
            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-black tabular-nums ${toneClass}`}
          >
            {deltaText}
          </motion.span>
        )}
      </div>
    </motion.div>
  );
}

/** 英語の序数表記(1st / 2nd / 3rd / 4th ...)。着順を「1th.」風に大きく見せるために使う。 */
function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** 結果のポップアップに並べる手の分類(chess.com の結果画面と同じく、良い手と悪い手の代表だけ)。 */
const RESULT_CLASSES: Classification[] = ["artistic", "best", "great", "inaccuracy", "mistake", "blunder"];

/** 手の分類ごとの件数。棋譜解析の無料の要約(課金ゲート無し)から取り、解析中は数秒おきに取り直す。 */
function useReviewCounts(tournamentId: string | null | undefined, accessToken: string | undefined) {
  const [data, setData] = useState<TournamentReviewSummary | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!tournamentId || !accessToken) return;
    let cancelled = false;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const load = () => {
      void fetchTournamentReviewSummary(tournamentId, accessToken)
        .then((res) => {
          if (cancelled) return;
          if (res.status !== "ok") {
            setFailed(true);
            return;
          }
          setData(res.data);
          // ソルバーの解析が残っている間は取り直す(最大2分)。
          if (res.data.solving && ++tries < 24) timer = setTimeout(load, 5000);
        })
        .catch(() => !cancelled && setFailed(true));
    };
    load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [tournamentId, accessToken]);
  return { data, failed };
}

/** 日付を「2026.10.06」の形に。 */
function dotDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}

/**
 * インマネしたときの記念カード(オーナー支給の参考デザイン: 白いカード・左の太い帯・特大の着順・
 * 日付・イベント名・ロゴ)。帯はブランドのアクセント色。カードそのものが「賞状」なので、
 * ダークの UI の中で唯一の白い面にしている。
 */
function ItmCard({
  pos,
  payout,
  eventName,
  displayName,
}: {
  pos: number;
  payout: number;
  eventName: string;
  displayName?: string;
}) {
  const suffix = ordinal(pos).replace(String(pos), "");
  return (
    <motion.div
      initial={{ opacity: 0, y: 16, rotate: -2, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, rotate: 0, scale: 1 }}
      transition={SPRING_SNAPPY}
      className="relative flex overflow-hidden rounded-2xl bg-white text-n-1 shadow-e4"
    >
      <div aria-hidden className="w-3.5 shrink-0 bg-accent" />
      <div className="min-w-0 flex-1 px-5 pb-4 pt-4">
        <p className="text-[10px] font-black uppercase tracking-[0.32em] text-n-6">In The Money</p>
        <p className="mt-1 flex items-start font-black leading-[0.82] tracking-[-0.05em]">
          <span className="text-[92px] tabular-nums">{pos}</span>
          <span className="mt-1.5 text-[40px]">{suffix}</span>
        </p>
        <div className="mt-3 space-y-0.5">
          <p className="text-[12px] font-bold tabular-nums text-n-6">{dotDate(new Date())}</p>
          <p className="truncate text-[15px] font-black">{eventName}</p>
          {displayName && <p className="truncate text-[12px] font-bold text-n-6">{displayName}</p>}
          <p className="pt-1 text-[20px] font-black tabular-nums">+{payout.toLocaleString()}</p>
        </div>
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-n-10 pt-3">
          <span className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- 小さい静的ロゴ */}
            <img src="/logos/Logo_club_mark_256.png" alt="" className="h-7 w-7 rounded-md" />
            <span className="text-[13px] font-black tracking-tight">Poker ART</span>
          </span>
          <span className="text-[9.5px] font-bold text-n-6">Powered by Poker ART</span>
        </div>
      </div>
    </motion.div>
  );
}

/**
 * トーナメント結果のポップアップ(chess.com の対局結果に倣う)。卓を暗くした上に1枚のカードを出す:
 *  1) 着順(SNG は「6th」、MTT は「6 / 521」)。インマネしたら白い記念カード(ItmCard)。
 *  2) 手の分類の件数(絶妙手・最善・素晴らしい・緩手・悪手・大悪手)
 *  3) 「局後検討」(主役のボタン)→「戻る」「もう一度プレイ」
 *  4) 成績の変化(収支・ROI・インマネ率・全国ランク)。将来はここに広告と「広告をなくす」を置く。
 */
export function TournamentResultScreen({
  info,
  accessToken,
  statsBefore,
  tournamentId,
  gameKey,
  totalEntrants,
  displayName,
  eventName,
  onExit,
  onPlayAgain,
  canReEntry,
  reEntryCost,
  onReEntry,
}: {
  info: TournamentOverInfo;
  accessToken: string | undefined;
  statsBefore: ResultStatsSnapshot | null;
  /** このトーナメントのDB ID。あれば「局後検討」と手の分類の件数を出す。 */
  tournamentId?: string | null;
  /** ゲーム種別。MTTは着順/エントリー数表記にする。 */
  gameKey?: "sng" | "mtt";
  /** 総エントリー数(MTTの「6 / 521」表記用)。 */
  totalEntrants?: number | null;
  /** ログイン中ユーザーの表示名(X共有カード・記念カードに載せる)。 */
  displayName?: string;
  /** イベント名(「SNG Regular」「MTT トーナメント」など)。記念カードに載せる。 */
  eventName?: string;
  onExit: () => void;
  /** 同じ種類のトーナメントにもう一度参加する。無ければボタンを出さない。 */
  onPlayAgain?: () => void;
  /** MTTリエントリ可能か(レジクローズ前・満員でない)。 */
  canReEntry?: boolean;
  /** リエントリの参加費(チップ)。 */
  reEntryCost?: number;
  /** リエントリ実行(-2000演出後にサーバーへ通知)。 */
  onReEntry?: () => void;
}) {
  const { t } = useI18n();
  const [after, setAfter] = useState<ResultStatsSnapshot | null>(null);
  const [shared, setShared] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  // リエントリ演出: ボタン押下→「-2,000」を見せてからサーバーへreEntryを送る。
  const [reEntering, setReEntering] = useState(false);
  const doReEntry = () => {
    if (reEntering || !onReEntry) return;
    setReEntering(true);
    setTimeout(() => onReEntry(), 900); // -2,000演出を見せてから復帰
  };

  useEffect(() => {
    if (!accessToken) return;
    void fetchResultSnapshot(accessToken).then(setAfter);
  }, [accessToken]);

  // 事前計算: リザルトを見ている間に棋譜解析のソルバー計算をバックグラウンドで先回りして始める。
  useEffect(() => {
    if (!accessToken || !tournamentId) return;
    void prewarmTournamentReview(tournamentId, accessToken);
  }, [accessToken, tournamentId]);

  const review = useReviewCounts(tournamentId, accessToken);

  const before = statsBefore;
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
  const roiPct = (v: number) => `${(v * 100).toFixed(0)}%`;
  const signed = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v).toLocaleString()}`;

  const pos = info.yourFinishPosition;
  const itm = pos != null && info.yourPayout > 0;
  // MTTは「着順 / 総エントリー数」、それ以外(SNG)は「1st」風の英語序数で特大表示する。
  const useRatio = gameKey === "mtt" && pos != null && totalEntrants != null && totalEntrants > 0;
  const rankPlain = pos == null ? t("result.finished") : useRatio ? `${pos} / ${totalEntrants}` : ordinal(pos);

  // X共有カード用の共有URL(/share/result?...)を組み立てる。展開時にOGP画像として
  // /api/og/result の動的カードが表示される。表示名・着順・獲得・全国順位を載せる。
  function buildShareUrl(): string {
    const p = new URLSearchParams();
    if (displayName) p.set("name", displayName);
    if (pos != null) p.set("pos", String(pos));
    if (useRatio && totalEntrants != null) p.set("entrants", String(totalEntrants));
    if (info.yourPayout > 0) p.set("payout", String(info.yourPayout));
    if (after?.nationalRank != null) p.set("rank", String(after.nationalRank));
    p.set("mode", gameKey === "mtt" ? "mtt" : "sng");
    return `${PROD_URL}/share/result?${p.toString()}`;
  }

  // Xのintentツイート。結果を一言添えてワンタップ投稿できるようにする。
  async function handleShare() {
    const rank = pos != null ? (useRatio ? `${pos} / ${totalEntrants}位` : ordinal(pos)) : null;
    const head = pos === 1 ? "優勝しました" : rank ? `${rank}でフィニッシュ` : "プレイしました";
    const prize = info.yourPayout > 0 ? ` 獲得 +${info.yourPayout.toLocaleString()}` : "";
    const text = `Poker ARTのトーナメントで${head}！${prize}`;
    const outcome = await shareOrTweet({
      text,
      url: buildShareUrl(),
      surface: "result",
      hashtags: ["ポーカーアート", "ポーカー"],
    });
    // 共有シートを閉じただけ(cancelled)は成功扱いにしない。押した手応えだけ出すと誤解を招く。
    if (outcome === "shared" || outcome === "tweet") {
      setShared(true);
      window.setTimeout(() => setShared(false), 1600);
    }
  }

  // 今回のトーナメントで超えた節目(全国TOP◯◯入り / 通算◯◯戦)。あれば専用バナーを出す。
  const milestone = detectMilestone(before, after);

  /** マイルストーン専用のシェア。結果カードではなく到達カードを展開させる。 */
  async function handleMilestoneShare() {
    if (!milestone) return;
    await shareOrTweet({
      surface: "milestone",
      text: buildMilestoneShareText(milestone),
      url: buildMilestoneShareUrl({
        displayName,
        kind: milestone.kind,
        n: milestone.n,
        totalRankedPlayers: milestone.totalRankedPlayers,
      }),
      hashtags: ["ポーカーアート", "ポーカー"],
    });
  }

  // 各指標の増減。beforeが取れないゲスト等では増減バッジは出さず現在値のみ表示。
  function delta(cur: number, prev: number | undefined, fmt: (v: number) => string, higherBetter = true): { text: string; tone: DeltaTone; show: boolean } {
    if (prev === undefined || before === null) return { text: "", tone: "flat", show: false };
    const d = cur - prev;
    const tone: DeltaTone = Math.abs(d) < 1e-9 ? "flat" : (d > 0) === higherBetter ? "up" : "down";
    return { text: `${d > 0 ? "+" : d < 0 ? "" : "±"}${fmt(Math.abs(d)).replace("+", "")}`, tone, show: true };
  }

  const counts = review.data?.classificationCounts;
  const showReEntry = Boolean(canReEntry && onReEntry);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/65 px-4 py-6 backdrop-blur-[3px]"
    >
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={SPRING_SNAPPY}
        className="relative max-h-full w-full max-w-[380px] overflow-y-auto rounded-[28px] border border-line bg-surface p-4 shadow-e4"
      >
        {/* 上端: シェア(左)/ 閉じる(右) */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => void handleShare()}
            aria-label={t("result.shareX")}
            className="pressable flex h-9 items-center gap-1.5 rounded-full bg-surface-2 px-3 text-[11px] font-black text-fg-2"
          >
            <Icon name="share" className="h-4 w-4" />
            {shared ? t("result.shareOpened") : t("result.share")}
          </button>
          <button
            type="button"
            onClick={onExit}
            aria-label={t("common.close")}
            className="pressable flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 text-fg-2"
          >
            <Icon name="close" className="h-4 w-4" />
          </button>
        </div>

        {/* 1) 着順 */}
        {itm && pos != null ? (
          <div className="mt-3">
            <ItmCard
              pos={pos}
              payout={info.yourPayout}
              eventName={eventName ?? (gameKey === "mtt" ? "MTT" : "SNG")}
              displayName={displayName}
            />
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={SPRING_SNAPPY}
            className="pb-1 pt-1 text-center"
          >
            <p className="text-[10px] font-black uppercase tracking-[0.34em] text-fg-3">Tournament Result</p>
            <p
              className={`mt-1 flex items-center justify-center font-black leading-[0.9] tracking-[-0.035em] text-fg ${
                useRatio ? "text-[56px]" : "text-[80px]"
              }`}
            >
              <span className="tabular-nums">{rankPlain}</span>
            </p>
            {eventName && <p className="mt-1 text-[12px] font-bold text-fg-2">{eventName}</p>}
          </motion.div>
        )}

        {/* 2) 手の分類の件数 */}
        {tournamentId && accessToken && !review.failed && (
          <div className="mt-4 grid grid-cols-6 gap-1">
            {RESULT_CLASSES.map((c, i) => (
              <motion.div
                key={c}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...SPRING_SNAPPY, delay: 0.15 + i * 0.04 }}
                className="flex flex-col items-center gap-1"
              >
                <ClassificationBadge classification={c} size={26} />
                {counts ? (
                  <span className="text-[15px] font-black tabular-nums text-fg">{counts[c] ?? 0}</span>
                ) : (
                  <span className="h-[18px] w-5 animate-pulse rounded bg-surface-2" />
                )}
                <span className="w-full truncate text-center text-[9px] font-bold text-fg-3">
                  {CLASSIFICATION_META[c].label}
                </span>
              </motion.div>
            ))}
          </div>
        )}

        {/* 3) 局後検討 → 戻る / もう一度プレイ */}
        {tournamentId && (
          <button
            onClick={() => setReviewOpen(true)}
            className="mt-4 flex w-full items-center justify-center gap-2.5 rounded-2xl bg-accent py-4 text-[16px] font-black text-on-accent shadow-glow pressable"
          >
            <Icon name="graph-up" className="h-5 w-5" />
            {t("result.postGame")}
          </button>
        )}

        {/* 無料の人だけに出す、有料プランの案内(プランは料金ページで選んでもらう)。 */}
        {tournamentId && <UpsellCard accessToken={accessToken} />}

        <div className={`grid gap-2 ${tournamentId ? "mt-2" : "mt-4"} ${onPlayAgain || showReEntry ? "grid-cols-2" : "grid-cols-1"}`}>
          <button onClick={onExit} className="rounded-2xl bg-surface-2 py-3.5 text-[14px] font-black text-fg pressable">
            {t("result.back")}
          </button>
          {showReEntry ? (
            <button
              onClick={doReEntry}
              disabled={reEntering}
              className="flex items-center justify-center gap-1.5 rounded-2xl bg-n-5 py-3.5 text-[14px] font-black text-white pressable disabled:opacity-90"
            >
              {reEntering ? (
                <span className="tabular-nums">−{(reEntryCost ?? 2000).toLocaleString()}</span>
              ) : (
                <>
                  <Icon name="refresh" className="h-4 w-4" />
                  {t("result.reEntry")}
                </>
              )}
            </button>
          ) : (
            onPlayAgain && (
              <button
                onClick={onPlayAgain}
                className="flex items-center justify-center gap-1.5 rounded-2xl bg-n-5 py-3.5 text-[14px] font-black text-white pressable"
              >
                <Icon name="refresh" className="h-4 w-4" />
                {t("result.playAgain")}
              </button>
            )
          )}
        </div>

        {/* 4) 成績の変化(収支/ROI/インマネ率/全国ランク)。将来はこの位置に広告と「広告をなくす」を置く。 */}
        <div className="mt-4 border-t border-line pt-4">
          {after ? (
            <div className="grid grid-cols-2 gap-2">
              <MetricCard
                label={t("result.m.profit")}
                from={before?.profit ?? after.profit}
                to={after.profit}
                format={(v) => signed(v)}
                delta={(before?.profit ?? undefined) !== undefined}
                {...(() => {
                  const d = delta(after.profit, before?.profit, (v) => Math.round(v).toLocaleString());
                  return { deltaText: d.text, deltaTone: d.tone, delay: 200 };
                })()}
              />
              <MetricCard
                label="ROI"
                from={before?.roi ?? after.roi}
                to={after.roi}
                format={roiPct}
                delta={before?.roi !== undefined}
                {...(() => {
                  const d = delta(after.roi, before?.roi, (v) => `${Math.round(v * 100)}pt`);
                  return { deltaText: d.text, deltaTone: d.tone, delay: 320 };
                })()}
              />
              <MetricCard
                label={t("result.m.itmRate")}
                from={before?.itmRate ?? after.itmRate}
                to={after.itmRate}
                format={pct}
                delta={before?.itmRate !== undefined}
                {...(() => {
                  const d = delta(after.itmRate, before?.itmRate, (v) => `${(v * 100).toFixed(1)}pt`);
                  return { deltaText: d.text, deltaTone: d.tone, delay: 440 };
                })()}
              />
              <MetricCard
                label={t("result.m.rank")}
                from={before?.nationalRank ?? after.nationalRank ?? 0}
                to={after.nationalRank ?? 0}
                format={(v) => (after.nationalRank ? t("result.place", { n: Math.round(v) }) : "—")}
                delta={before?.nationalRank != null && after.nationalRank != null}
                {...(() => {
                  // 順位は小さいほど良い。before-after が正なら順位が上がった(↑)。
                  if (before?.nationalRank == null || after.nationalRank == null) return { deltaText: "", deltaTone: "flat" as DeltaTone, delay: 560 };
                  const up = before.nationalRank - after.nationalRank;
                  const tone: DeltaTone = up > 0 ? "up" : up < 0 ? "down" : "flat";
                  return { deltaText: up === 0 ? "±0" : `${up > 0 ? "↑" : "↓"}${Math.abs(up)}`, deltaTone: tone, delay: 560 };
                })()}
              />
            </div>
          ) : accessToken ? (
            <div className="grid grid-cols-2 gap-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-[64px] animate-pulse rounded-2xl bg-canvas" />
              ))}
            </div>
          ) : null}

          {/* マイルストーン到達バナー。今回の結果で節目を超えたときだけ出す。 */}
          {milestone && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 }}
              className="mt-3 flex items-center gap-3 rounded-2xl bg-accent/10 p-3 ring-1 ring-accent/40"
            >
              <Icon name="medal" className="h-8 w-8 shrink-0 text-accent" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-black leading-tight text-fg">{milestone.headline}</p>
                <p className="truncate text-[11px] font-semibold text-fg-2">{milestone.caption}</p>
              </div>
              <button
                onClick={() => void handleMilestoneShare()}
                aria-label="到達をシェアする"
                className="pressable flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-accent ring-1 ring-accent/60"
              >
                <Icon name="logo-x" className="h-4 w-4" />
              </button>
            </motion.div>
          )}

          {/* 広告枠。ボタン群より下なので、どの導線も広告で押し下げたり誤タップさせたりしない。
              広告ユニット未作成・有料プラン加入者には出ない。 */}
          <div className="mt-3">
            <AdSlot placement="result" />
          </div>
        </div>
      </motion.div>

      {/* 棋譜解析モーダル(総括→再生)。 */}
      <AnimatePresence>
        {reviewOpen && tournamentId && (
          <TournamentReviewModal
            tournamentId={tournamentId}
            accessToken={accessToken}
            onClose={() => setReviewOpen(false)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
