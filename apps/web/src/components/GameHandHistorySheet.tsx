"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PlayingCard } from "./PlayingCard";
import { formatAmount, formatSignedBb, type AmountDisplayMode } from "@/lib/format";
import { buildHandShareText, buildHandShareUrl, openTweetIntent, toBbValue } from "@/lib/share";
import type { GameHandRecord } from "@/lib/socket";
import {
  fetchHandTimeline,
  fetchTournamentHandHistory,
  type HandTimeline,
  type LiveHandHistoryRow,
} from "@/lib/reviewApi";

/** Xのロゴ(絵文字は使わずSVGで描画する)。 */
function XLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.657l-5.214-6.817-5.966 6.817H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" />
    </svg>
  );
}

/** 行の展開状態を示すシェブロン(下向き→展開時は上向き)。 */
function Chevron({ open, className = "h-3.5 w-3.5" }: { open: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`${className} transition-transform ${open ? "rotate-180" : ""}`}
      aria-hidden="true"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

// ボタン(buttonFixedPos)からのオフセット→ポジション名(6-max)。サーバー側のハンド履歴と同じ表。
const POSITION_TABLE_6MAX = ["BTN", "SB", "BB", "UTG", "HJ", "CO"];

function positionLabel(seatIndex: number, buttonFixedPos: number): string {
  const offset = (((seatIndex - buttonFixedPos) % 6) + 6) % 6;
  return POSITION_TABLE_6MAX[offset] ?? `+${offset}`;
}

// アクション種別→日本語表記。未知の種別はそのまま表示する(欠落よりまし)。
const ACTION_KIND_LABEL: Record<string, string> = {
  fold: "フォールド",
  check: "チェック",
  call: "コール",
  bet: "ベット",
  raise: "レイズ",
  allIn: "オールイン",
  postBlind: "ブラインド",
  postAnte: "アンティ",
};

const STREET_LABEL: Record<string, string> = {
  preflop: "プリフロップ",
  flop: "フロップ",
  turn: "ターン",
  river: "リバー",
};

/** ストリート→そのストリートで見えているボード枚数。 */
const STREET_BOARD_COUNT: Record<string, number> = { preflop: 0, flop: 3, turn: 4, river: 5 };

/**
 * 展開されたハンドの詳細タイムライン。参加席(ポジション+開始スタック+ホールカード)、
 * ストリートごとのボード・ポット推移・全アクション経過、最終ポットを表示する。
 */
function HandTimelineDetail({
  timeline,
  displayMode,
}: {
  timeline: HandTimeline;
  displayMode: AmountDisplayMode;
}) {
  const bigBlind = timeline.levelBigBlind || 1;
  const seatByIndex = new Map(timeline.seats.map((s) => [s.seatIndex, s]));
  // アンティは全席の機械的なポストで行数だけ食うため表示から除く(ポット推移には含まれている)。
  const visibleActions = timeline.actions.filter((a) => a.kind !== "postAnte");
  // アクションのあったストリートだけセクションを出す。オールインで自動公開されたボードは
  // アクションが無いため、末尾の「結果」行で全公開分をまとめて見せる。
  const streets = ["preflop", "flop", "turn", "river"].filter((street) =>
    visibleActions.some((a) => a.street === street),
  );

  return (
    <div className="mt-2 space-y-2.5 border-t border-ink-200 pt-2.5">
      {/* 参加席: ポジション・名前・開始スタック・ホールカード(記録済みの全席分) */}
      <div className="space-y-1">
        {timeline.seats.map((s) => (
          <div key={s.seatIndex} className="flex items-center gap-2">
            <span className="w-9 shrink-0 rounded bg-ink-950 px-1 py-[1px] text-center text-[9px] font-bold uppercase tracking-wide text-white">
              {positionLabel(s.seatIndex, timeline.buttonFixedPos)}
            </span>
            <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-ink-900">{s.user.displayName}</span>
            <span className="shrink-0 text-[10px] font-semibold tabular-nums text-ink-600">
              {formatAmount(s.startingStack, bigBlind, displayMode)}
            </span>
            <span className="flex shrink-0 gap-0.5">
              {s.holeCards.length === 2 ? (
                s.holeCards.map((c, i) => <PlayingCard key={i} card={c} size="sm" />)
              ) : (
                <>
                  <PlayingCard faceDown size="sm" />
                  <PlayingCard faceDown size="sm" />
                </>
              )}
            </span>
          </div>
        ))}
      </div>

      {/* ストリートごとのアクション経過 */}
      {streets.map((street) => {
        const acts = visibleActions.filter((a) => a.street === street);
        if (acts.length === 0) return null;
        const boardCount = Math.min(STREET_BOARD_COUNT[street] ?? 0, timeline.board.length);
        const potAtStart = acts[0]?.potBefore ?? 0;
        return (
          <div key={street}>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-[0.16em] text-ink-600">
                {STREET_LABEL[street] ?? street}
              </span>
              {boardCount > 0 && (
                <span className="flex gap-0.5">
                  {timeline.board.slice(0, boardCount).map((c, i) => (
                    <PlayingCard key={i} card={c} size="sm" />
                  ))}
                </span>
              )}
              {street !== "preflop" && (
                <span className="ml-auto text-[10px] font-semibold tabular-nums text-ink-600">
                  ポット {formatAmount(potAtStart, bigBlind, displayMode)}
                </span>
              )}
            </div>
            <div className="mt-1 space-y-0.5">
              {acts.map((a) => {
                const seat = seatByIndex.get(a.seatIndex);
                return (
                  <div key={a.sequenceNumber} className="flex items-center gap-2 text-[11px]">
                    <span className="w-9 shrink-0 text-center text-[9px] font-bold uppercase text-ink-500">
                      {positionLabel(a.seatIndex, timeline.buttonFixedPos)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-ink-800">{seat?.user.displayName ?? "-"}</span>
                    <span className="shrink-0 font-semibold text-ink-950">
                      {ACTION_KIND_LABEL[a.kind] ?? a.kind}
                      {a.toAmount !== null && a.toAmount > 0 && a.kind !== "fold" && a.kind !== "check" && (
                        <span className="ml-1 tabular-nums">{formatAmount(a.toAmount, bigBlind, displayMode)}</span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* 最終ボード(オールインランアウト等でアクション無しに開いた分も含めて全公開分)+最終ポット */}
      <div className="flex items-center gap-2 border-t border-ink-200 pt-2">
        <span className="text-[10px] font-black uppercase tracking-[0.16em] text-ink-600">結果</span>
        {timeline.board.length > 0 && (
          <span className="flex gap-0.5">
            {timeline.board.map((c, i) => (
              <PlayingCard key={i} card={c} size="sm" />
            ))}
          </span>
        )}
        <span className="ml-auto text-[11px] font-black tabular-nums text-ink-950">
          ポット {formatAmount(timeline.potTotal, bigBlind, displayMode)}
        </span>
      </div>
    </div>
  );
}

/**
 * 設定ボタンから開く「このゲームのハンド履歴」ボトムシート。
 * このトーナメント中に自分がプレイした全ハンドを、新しい順に一覧表示する。
 * 各行: 自分のホールカード(常に表向き)+ 最終ボード + 収支 + Xへの単体シェア。
 * tournamentId と accessToken があれば行をタップして、そのハンドの全アクション経過・
 * 公開ハンド・ポット推移の詳細を展開できる(サーバーの記録から取得)。
 */
export function GameHandHistorySheet({
  records,
  bigBlind,
  displayName,
  onClose,
  tournamentId = null,
  accessToken,
  displayMode = "bb",
}: {
  records: GameHandRecord[];
  bigBlind: number;
  /** 共有カードに載せる表示名(未指定なら名前なしのカードになる)。 */
  displayName?: string;
  onClose: () => void;
  /** 進行中トーナメントのDB ID。あればサーバー記録から詳細(アクション経過)を表示できる。 */
  tournamentId?: string | null;
  /** ログイン中のアクセストークン。詳細取得に必要。 */
  accessToken?: string;
  /** 卓上の金額表示モード(bb換算/点数)。 */
  displayMode?: AmountDisplayMode;
}) {
  // サーバー記録のハンド一覧(新しい順)。取得できればこちらを正とし、詳細展開が可能になる。
  const [restRows, setRestRows] = useState<LiveHandHistoryRow[] | null>(null);
  // 展開中のhandIdと、取得済みタイムラインのキャッシュ。
  const [expandedHandId, setExpandedHandId] = useState<string | null>(null);
  const [timelines, setTimelines] = useState<Record<string, HandTimeline>>({});
  const [loadingHandId, setLoadingHandId] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => {
    if (!tournamentId || !accessToken) return;
    let alive = true;
    void fetchTournamentHandHistory(tournamentId, accessToken).then((rows) => {
      if (alive && rows) setRestRows(rows);
    });
    return () => {
      alive = false;
    };
  }, [tournamentId, accessToken]);

  function toggleExpand(handId: string) {
    setDetailError(null);
    if (expandedHandId === handId) {
      setExpandedHandId(null);
      return;
    }
    setExpandedHandId(handId);
    if (!timelines[handId] && accessToken) {
      setLoadingHandId(handId);
      void fetchHandTimeline(handId, accessToken)
        .then((tl) => {
          if (tl) setTimelines((prev) => ({ ...prev, [handId]: tl }));
          else setDetailError("詳細を取得できませんでした。時間をおいて再度お試しください。");
        })
        .finally(() => setLoadingHandId((cur) => (cur === handId ? null : cur)));
    }
  }

  /** その1ハンドをOGPカード付きでXへ投稿する。 */
  function shareHand(rec: { heroCards: string[]; board: string[]; delta: number; wonByFold: boolean }) {
    const bb = toBbValue(rec.delta, bigBlind);
    openTweetIntent({
      text: buildHandShareText(bb),
      url: buildHandShareUrl({
        displayName,
        heroCards: rec.heroCards,
        board: rec.board,
        bb,
        wonByFold: rec.wonByFold,
      }),
      hashtags: ["ポーカーアート", "ポーカー"],
    });
  }

  // 表示リストの組み立て(新しい順)。
  // - サーバー一覧が取れた場合はそれを正とする(切断中のハンドも含まれ、詳細展開が可能)。
  //   直近ハンドは記録処理の完了前でまだ一覧に載っていないことがあるため、ローカル(socket)側の
  //   件数が多い分だけ先頭に「詳細なし」のプレーン行として補う。
  // - 取れない場合(未ログイン/取得失敗/tournamentId未確定)は従来どおりローカル記録のみ。
  type DisplayRow = {
    key: string;
    handId: string | null;
    label: string;
    heroCards: string[];
    board: string[];
    delta: number;
    wonByFold: boolean;
  };
  const localNewestFirst = [...records].reverse();
  let rows: DisplayRow[];
  if (restRows) {
    const extraCount = Math.max(0, localNewestFirst.length - restRows.length);
    const pending: DisplayRow[] = localNewestFirst.slice(0, extraCount).map((rec, i) => ({
      key: `local-${records.length - i}`,
      handId: null,
      label: `#${records.length - i}`,
      heroCards: rec.heroCards,
      board: rec.board,
      delta: rec.delta,
      wonByFold: rec.wonByFold,
    }));
    rows = [
      ...pending,
      ...restRows.map((r) => ({
        key: r.handId,
        handId: r.handId,
        label: `#${r.handNumber}`,
        heroCards: r.holeCards,
        board: r.board,
        delta: r.deltaChips,
        wonByFold: false,
      })),
    ];
  } else {
    rows = localNewestFirst.map((rec, i) => ({
      key: `local-${records.length - i}`,
      handId: null,
      label: `#${records.length - i}`,
      heroCards: rec.heroCards,
      board: rec.board,
      delta: rec.delta,
      wonByFold: rec.wonByFold,
    }));
  }
  const canExpand = Boolean(accessToken);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50"
    >
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 320 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md max-h-[82vh] overflow-y-auto rounded-t-2xl border border-ink-950 bg-white p-4 pb-8"
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-ink-500">This tournament</p>
            <h2 className="text-lg font-extrabold tracking-tight text-ink-950">ハンド履歴</h2>
          </div>
          <button onClick={onClose} className="text-[12px] font-semibold text-ink-500">
            閉じる
          </button>
        </div>

        {rows.length === 0 ? (
          <p className="py-12 text-center text-sm text-ink-500">まだ記録されたハンドがありません。</p>
        ) : (
          <p className="mb-3 text-[11px] font-semibold leading-relaxed text-ink-500">
            {canExpand && restRows ? "行をタップするとアクション経過と公開ハンドを確認できます。" : ""}
            右端のボタンで、その1ハンドをカード画像付きでシェアできます。
          </p>
        )}

        {rows.length > 0 && (
          <ul className="space-y-2">
            {rows.map((row, i) => {
              const win = row.delta > 0;
              const lose = row.delta < 0;
              const expandable = canExpand && row.handId !== null;
              const isOpen = row.handId !== null && expandedHandId === row.handId;
              return (
                <motion.li
                  key={row.key}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.02, 0.3) }}
                  className="rounded-xl border border-ink-200 px-3 py-2.5"
                >
                  <div
                    role={expandable ? "button" : undefined}
                    tabIndex={expandable ? 0 : undefined}
                    onClick={expandable ? () => toggleExpand(row.handId!) : undefined}
                    onKeyDown={
                      expandable
                        ? (e) => {
                            if (e.key === "Enter" || e.key === " ") toggleExpand(row.handId!);
                          }
                        : undefined
                    }
                    className={`flex items-center gap-3 ${expandable ? "cursor-pointer" : ""}`}
                  >
                    <span className="w-8 shrink-0 text-[10px] font-bold tabular-nums text-ink-500">{row.label}</span>

                    <div className="flex shrink-0 gap-1">
                      {row.heroCards.length === 2 ? (
                        row.heroCards.map((c, j) => <PlayingCard key={j} card={c} size="sm" />)
                      ) : (
                        <>
                          <PlayingCard faceDown size="sm" />
                          <PlayingCard faceDown size="sm" />
                        </>
                      )}
                    </div>

                    <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto no-scrollbar">
                      {row.board.length > 0 ? (
                        row.board.map((c, j) => <PlayingCard key={j} card={c} size="sm" />)
                      ) : (
                        <span className="text-[11px] text-ink-500">プリフロップ</span>
                      )}
                    </div>

                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[12px] font-black tabular-nums ${
                        win ? "bg-mint-500/10 text-mint-700" : lose ? "bg-crimson-500/10 text-crimson-600" : "bg-ink-100 text-ink-500"
                      }`}
                    >
                      {formatSignedBb(row.delta, bigBlind)}
                    </span>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        shareHand(row);
                      }}
                      aria-label={`ハンド${row.label}をXでシェア`}
                      className="shrink-0 rounded-lg border border-ink-200 p-1.5 text-ink-500 transition-colors active:bg-ink-100"
                    >
                      <XLogo className="h-3.5 w-3.5" />
                    </button>

                    {expandable && <Chevron open={isOpen} className="h-3.5 w-3.5 shrink-0 text-ink-500" />}
                  </div>

                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        {row.handId && timelines[row.handId] ? (
                          <HandTimelineDetail timeline={timelines[row.handId]!} displayMode={displayMode} />
                        ) : loadingHandId === row.handId ? (
                          <div className="flex items-center gap-2 border-t border-ink-200 pt-2.5 mt-2 text-[11px] text-ink-500">
                            <span className="h-3 w-3 shrink-0 rounded-full border-2 border-ink-950 border-t-transparent animate-spin" />
                            詳細を読み込み中…
                          </div>
                        ) : (
                          <p className="border-t border-ink-200 pt-2.5 mt-2 text-[11px] text-ink-500">
                            {detailError ?? "詳細を取得できませんでした。"}
                          </p>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.li>
              );
            })}
          </ul>
        )}
      </motion.div>
    </motion.div>
  );
}
