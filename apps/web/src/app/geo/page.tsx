"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  geoTreeApi,
  PREFLOP_BUCKET_LABELS,
  POSTFLOP_BUCKET_LABELS,
  type BubbleStage,
  type HandClassMatrixResult,
  type LineStep,
  type StackBucket,
  type TreeNode,
} from "@/lib/geoApi";
import { StackBucketSelector } from "@/components/geo/StackBucketSelector";
import { BubbleStageSelector } from "@/components/geo/BubbleStageSelector";
import { LineBreadcrumb, PositionActionRow } from "@/components/geo/PositionActionRow";
import { HandClassMatrix } from "@/components/geo/HandClassMatrix";
import { BoardCardPicker } from "@/components/geo/BoardCardPicker";
import { Icon } from "@/components/Lobby";

type Street = "preflop" | "flop" | "turn" | "river";
const BOARD_LEN: Record<Street, number> = { preflop: 0, flop: 3, turn: 4, river: 5 };

/** 6-max卓でラインの中でfoldしていない座席数。次のストリートへ進めるかの目安に使う。 */
function playersRemaining(line: LineStep[]): number {
  const folded = new Set(line.filter((s) => s.bucket === "fold").map((s) => s.position));
  return 6 - folded.size;
}

function suitSymbol(card: string): string {
  const s = card.slice(-1);
  return s === "s" ? "♠" : s === "h" ? "♥" : s === "d" ? "♦" : "♣";
}

export default function GeoPage() {
  const [stackBucket, setStackBucket] = useState<StackBucket>("30+");
  const [bubbleStage, setBubbleStage] = useState<BubbleStage>("normal");
  const [street, setStreet] = useState<Street>("preflop");
  const [preflopLine, setPreflopLine] = useState<LineStep[]>([]);
  const [board, setBoard] = useState<string[]>([]);
  const [streetLines, setStreetLines] = useState<Record<Street, LineStep[]>>({ preflop: [], flop: [], turn: [], river: [] });
  const [pendingStreet, setPendingStreet] = useState<Street | null>(null);

  const [node, setNode] = useState<TreeNode | null>(null);
  const [matrix, setMatrix] = useState<HandClassMatrixResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const bucketLabels: Record<string, string> = street === "preflop" ? PREFLOP_BUCKET_LABELS : POSTFLOP_BUCKET_LABELS;
  const currentLine = street === "preflop" ? preflopLine : streetLines[street];

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const request =
      street === "preflop"
        ? geoTreeApi.preflopNode({ stackBucket, bubbleStage, line: preflopLine })
        : geoTreeApi.postflopNode({
            stackBucket,
            bubbleStage,
            preflopLine,
            board,
            street,
            postflopLine: streetLines[street],
          });

    request
      .then((result) => {
        if (cancelled) return;
        setNode(result.node);
        setMatrix(result.matrix);
      })
      .catch(() => {
        if (!cancelled) setError("対戦サーバーに接続できませんでした。packages/server が起動しているか確認してください。");
      })
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stackBucket, bubbleStage, street, preflopLine, board, streetLines[street]]);

  function selectBucket(bucket: string) {
    if (!node?.position) return;
    const step: LineStep = { position: node.position, bucket };
    if (street === "preflop") {
      setPreflopLine((prev) => [...prev, step]);
    } else {
      setStreetLines((prev) => ({ ...prev, [street]: [...prev[street], step] }));
    }
  }

  function truncateLine(length: number) {
    if (street === "preflop") {
      setPreflopLine((prev) => prev.slice(0, length));
    } else {
      setStreetLines((prev) => ({ ...prev, [street]: prev[street].slice(0, length) }));
    }
  }

  function advanceStreet(next: Street) {
    setPendingStreet(next);
  }

  function confirmBoard(newCards: string[]) {
    setBoard((prev) => [...prev, ...newCards]);
    if (pendingStreet) setStreet(pendingStreet);
    setPendingStreet(null);
  }

  function resetAll() {
    setStreet("preflop");
    setPendingStreet(null);
    setPreflopLine([]);
    setBoard([]);
    setStreetLines({ preflop: [], flop: [], turn: [], river: [] });
  }

  const remaining = playersRemaining(currentLine);
  const canAdvanceStreet = remaining >= 2 && currentLine.length > 0;
  const nextStreet: Street | null = street === "preflop" ? "flop" : street === "flop" ? "turn" : street === "turn" ? "river" : null;

  return (
    <div className="min-h-screen bg-navy-950">
      <div className="max-w-3xl mx-auto px-4 pb-28">
        <header className="flex items-center justify-between pt-[calc(env(safe-area-inset-top)+16px)] pb-4">
          <div>
            <div className="text-[11px] tracking-[0.25em] text-gold-500 font-medium">GEO DATABASE</div>
            <h1 className="text-lg font-semibold text-navy-50">実測アクションツリー</h1>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={resetAll} className="rounded-full bg-navy-800 text-navy-300 text-[11px] px-3 py-1.5 ring-1 ring-navy-600/60">
              リセット
            </button>
            <Link href="/" className="rounded-full bg-gold-500 text-navy-950 text-[11px] font-semibold px-3 py-1.5 shadow-card">
              テーブルへ
            </Link>
          </div>
        </header>

        {error && (
          <div className="rounded-2xl bg-crimson-500/10 ring-1 ring-crimson-500/30 text-crimson-300 text-sm px-4 py-3 mb-4">{error}</div>
        )}

        <div className="space-y-2 mb-4">
          <StackBucketSelector value={stackBucket} onChange={setStackBucket} />
          <BubbleStageSelector value={bubbleStage} onChange={setBubbleStage} />
        </div>

        <div className="flex items-center gap-1.5 mb-3">
          {(["preflop", "flop", "turn", "river"] as Street[]).map((s) => {
            const reached = s === "preflop" || board.length >= BOARD_LEN[s];
            return (
              <div
                key={s}
                className={`flex-1 rounded-lg py-1.5 text-center text-[10px] font-bold uppercase tracking-wide ${
                  street === s ? "bg-gold-500 text-navy-950" : reached ? "bg-navy-800 text-navy-300" : "bg-navy-900 text-navy-600"
                }`}
              >
                {s}
              </div>
            );
          })}
        </div>

        {board.length > 0 && (
          <div className="flex items-center justify-center gap-2 mb-3">
            {board.map((c, i) => (
              <div key={i} className="h-11 w-8 rounded bg-navy-50 flex flex-col items-center justify-center text-[11px] font-bold">
                <span className={c.endsWith("h") || c.endsWith("d") ? "text-crimson-500" : "text-navy-950"}>{c.slice(0, -1)}</span>
                <span className={c.endsWith("h") ? "text-crimson-500" : c.endsWith("d") ? "text-azure-500" : c.endsWith("c") ? "text-mint-500" : "text-navy-950"}>
                  {suitSymbol(c)}
                </span>
              </div>
            ))}
          </div>
        )}

        <LineBreadcrumb line={preflopLine} bucketLabels={PREFLOP_BUCKET_LABELS} onTruncate={(len) => setPreflopLine((p) => p.slice(0, len))} />
        {street !== "preflop" && (
          <div className="mt-1.5">
            <LineBreadcrumb
              line={streetLines[street]}
              bucketLabels={POSTFLOP_BUCKET_LABELS}
              onTruncate={(len) => setStreetLines((prev) => ({ ...prev, [street]: prev[street].slice(0, len) }))}
            />
          </div>
        )}

        <div className="mt-3">
          {loading ? (
            <div className="rounded-2xl bg-navy-900 ring-1 ring-navy-700 p-8 text-center text-sm text-navy-400">読み込み中…</div>
          ) : node ? (
            <PositionActionRow node={node} bucketLabels={bucketLabels} onSelect={selectBucket} />
          ) : null}
        </div>

        {nextStreet && canAdvanceStreet && (
          <button
            onClick={() => advanceStreet(nextStreet)}
            className="w-full mt-3 rounded-xl bg-navy-800 ring-1 ring-navy-600/60 text-navy-100 text-sm font-semibold py-2.5"
          >
            → {nextStreet.toUpperCase()}へ進む(ボードを選択)
          </button>
        )}

        {matrix && (
          <div className="mt-5">
            <HandClassMatrix matrix={matrix} bucketLabels={bucketLabels} />
          </div>
        )}
      </div>

      {pendingStreet && (
        <BoardCardPicker
          cardsNeeded={pendingStreet === "flop" ? 3 : 1}
          usedCards={board}
          onClose={() => setPendingStreet(null)}
          onConfirm={confirmBoard}
        />
      )}

      <nav className="fixed bottom-0 inset-x-0 border-t border-navy-800 bg-navy-950/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
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
              <Link key={t.key} href={t.href} className="flex flex-col items-center gap-0.5 py-2.5 text-navy-500">
                <Icon name={t.icon} />
                <span className="text-[9px] font-medium">{t.label}</span>
              </Link>
            ) : (
              <div key={`db-${i}`} className="relative flex justify-center">
                <div className="absolute -top-7 h-14 w-14 rounded-full bg-gradient-to-br from-gold-400 to-gold-600 ring-4 ring-navy-950 shadow-panel flex flex-col items-center justify-center text-navy-950">
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
