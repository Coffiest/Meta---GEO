"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  geoTreeApi,
  PREFLOP_BUCKET_LABELS,
  POSTFLOP_BUCKET_LABELS,
  STACK_BUCKET_LABELS,
  BUBBLE_STAGE_LABELS,
  type BubbleStage,
  type HandClassMatrixResult,
  type LineStep,
  type StackBucket,
  type TreeNode,
} from "@/lib/geoApi";
import { GeoSettingsModal } from "@/components/geo/GeoSettingsModal";
import { PositionPillBar, type PillBarItem, type Street, type PostflopStreet } from "@/components/geo/PositionPillBar";
import { PositionActionRow } from "@/components/geo/PositionActionRow";
import { HandClassMatrix } from "@/components/geo/HandClassMatrix";
import { BoardCardPicker } from "@/components/geo/BoardCardPicker";
import { Icon } from "@/components/Lobby";
import { Header } from "@/components/Header";

const PREFLOP_ORDER = ["UTG", "HJ", "CO", "BTN", "SB", "BB"];
const POSTFLOP_ORDER = ["SB", "BB", "UTG", "HJ", "CO", "BTN"];

type LineStepWithMeta = LineStep & { geometricRatio?: number };

function nextStreetOf(street: Street): PostflopStreet | null {
  if (street === "preflop") return "flop";
  if (street === "flop") return "turn";
  if (street === "turn") return "river";
  return null;
}

function bucketLabelFor(street: Street, bucket: string): string {
  const table: Record<string, string> = street === "preflop" ? PREFLOP_BUCKET_LABELS : POSTFLOP_BUCKET_LABELS;
  return table[bucket] ?? bucket;
}

export default function GeoPage() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [stackBucket, setStackBucket] = useState<StackBucket>("30+");
  const [bubbleStage, setBubbleStage] = useState<BubbleStage>("normal");

  const [street, setStreet] = useState<Street>("preflop");
  const [preflopLine, setPreflopLine] = useState<LineStepWithMeta[]>([]);
  const [board, setBoard] = useState<string[]>([]);
  const [streetLines, setStreetLines] = useState<Record<Street, LineStepWithMeta[]>>({
    preflop: [],
    flop: [],
    turn: [],
    river: [],
  });
  const [pendingStreet, setPendingStreet] = useState<PostflopStreet | null>(null);
  const [dismissedStreet, setDismissedStreet] = useState<PostflopStreet | null>(null);

  const [node, setNode] = useState<TreeNode | null>(null);
  const [matrix, setMatrix] = useState<HandClassMatrixResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  /** ボード選択直後、その板面に一致する実測データが1件もないかどうか。真の間は次のストリートへ
   * 自動で進めず、「板面を選び直す」導線を出す(存在しない板面を選んだ場合の連鎖ポップアップ防止)。 */
  const [justPickedBoard, setJustPickedBoard] = useState(false);

  const bucketLabels: Record<string, string> = street === "preflop" ? PREFLOP_BUCKET_LABELS : POSTFLOP_BUCKET_LABELS;

  function foldedBeforeStreet(streetKey: Street): Set<string> {
    const folded = new Set<string>();
    preflopLine.forEach((s) => {
      if (s.bucket === "fold") folded.add(s.position);
    });
    if (streetKey === "turn" || streetKey === "river") {
      streetLines.flop.forEach((s) => {
        if (s.bucket === "fold") folded.add(s.position);
      });
    }
    if (streetKey === "river") {
      streetLines.turn.forEach((s) => {
        if (s.bucket === "fold") folded.add(s.position);
      });
    }
    return folded;
  }

  function activePositions(streetKey: Street): string[] {
    const before = foldedBeforeStreet(streetKey);
    const order = streetKey === "preflop" ? PREFLOP_ORDER : POSTFLOP_ORDER;
    return order.filter((p) => !before.has(p));
  }

  function remainingActiveCount(streetKey: Street): number {
    const activeAtStart = activePositions(streetKey);
    const currentStreetLine = streetKey === "preflop" ? preflopLine : streetLines[streetKey];
    const foldedThisStreet = new Set(currentStreetLine.filter((s) => s.bucket === "fold").map((s) => s.position));
    return activeAtStart.filter((p) => !foldedThisStreet.has(p)).length;
  }

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
        if (result.node.sampleSize > 0) setJustPickedBoard(false);
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

  // プリフロップ(あるいは各ストリート)のアクションが終わり、まだ2人以上残っていて
  // 次のストリートがあるなら、自動でボードカード選択ポップアップを開く。
  useEffect(() => {
    if (!node || node.position !== null || pendingStreet || justPickedBoard) return;
    const next = nextStreetOf(street);
    if (!next) return;
    if (remainingActiveCount(street) < 2) return;
    if (dismissedStreet === next) return;
    setPendingStreet(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node, street, pendingStreet, dismissedStreet, justPickedBoard, preflopLine, streetLines, board]);

  function selectBucket(bucket: string) {
    if (!node?.position) return;
    const opt = node.options.find((o) => o.bucket === bucket);
    const step: LineStepWithMeta = { position: node.position, bucket, geometricRatio: opt?.geometricRatio ?? 0 };
    setDismissedStreet(null);
    setJustPickedBoard(false);
    if (street === "preflop") {
      setPreflopLine((prev) => [...prev, step]);
    } else {
      setStreetLines((prev) => ({ ...prev, [street]: [...prev[street], step] }));
    }
  }

  function handleTruncate(streetKey: Street, lineIndex: number) {
    setDismissedStreet(null);
    if (streetKey === "preflop") {
      setPreflopLine((prev) => prev.slice(0, lineIndex));
      setBoard([]);
      setStreetLines({ preflop: [], flop: [], turn: [], river: [] });
      setStreet("preflop");
      return;
    }
    setStreet(streetKey);
    if (streetKey === "flop") {
      setBoard((prev) => prev.slice(0, 3));
      setStreetLines((prev) => ({ ...prev, flop: prev.flop.slice(0, lineIndex), turn: [], river: [] }));
    } else if (streetKey === "turn") {
      setBoard((prev) => prev.slice(0, 4));
      setStreetLines((prev) => ({ ...prev, turn: prev.turn.slice(0, lineIndex), river: [] }));
    } else {
      setStreetLines((prev) => ({ ...prev, river: prev.river.slice(0, lineIndex) }));
    }
  }

  function confirmBoard(newCards: string[]) {
    setBoard((prev) => [...prev, ...newCards]);
    if (pendingStreet) setStreet(pendingStreet);
    setPendingStreet(null);
    setDismissedStreet(null);
    setJustPickedBoard(true);
  }

  const BOARD_LEN_BEFORE: Record<PostflopStreet, number> = { flop: 0, turn: 3, river: 4 };

  function retryBoard() {
    if (street === "preflop") return;
    const streetKey = street as PostflopStreet;
    setJustPickedBoard(false);
    setBoard((prev) => prev.slice(0, BOARD_LEN_BEFORE[streetKey]));
    setPendingStreet(streetKey);
  }

  function closeBoardPicker() {
    setDismissedStreet(pendingStreet);
    setPendingStreet(null);
  }

  function buildPositionPills(streetKey: Street, order: string[], line: LineStepWithMeta[], isCurrentStreet: boolean): PillBarItem[] {
    return order.map((position) => {
      const idx = line.findIndex((s) => s.position === position);
      if (idx !== -1) {
        const step = line[idx]!;
        return {
          kind: "position",
          street: streetKey,
          position,
          state: "decided",
          actionLabel: bucketLabelFor(streetKey, step.bucket),
          bucket: step.bucket,
          geometricRatio: step.geometricRatio,
          lineIndex: idx,
        };
      }
      if (isCurrentStreet && node?.position === position) {
        return { kind: "position", street: streetKey, position, state: "active" };
      }
      return { kind: "position", street: streetKey, position, state: "future" };
    });
  }

  const items: PillBarItem[] = [...buildPositionPills("preflop", PREFLOP_ORDER, preflopLine, street === "preflop")];
  if (board.length >= 3) {
    items.push({ kind: "street", street: "flop", cards: board.slice(0, 3) });
    items.push(...buildPositionPills("flop", activePositions("flop"), streetLines.flop, street === "flop"));
  }
  if (board.length >= 4) {
    items.push({ kind: "street", street: "turn", cards: board.slice(3, 4) });
    items.push(...buildPositionPills("turn", activePositions("turn"), streetLines.turn, street === "turn"));
  }
  if (board.length >= 5) {
    items.push({ kind: "street", street: "river", cards: board.slice(4, 5) });
    items.push(...buildPositionPills("river", activePositions("river"), streetLines.river, street === "river"));
  }

  const noBoardData = !!node && node.position === null && justPickedBoard;

  const awaitingDismissedBoard =
    !!node &&
    node.position === null &&
    !pendingStreet &&
    !justPickedBoard &&
    dismissedStreet === nextStreetOf(street) &&
    nextStreetOf(street) !== null &&
    remainingActiveCount(street) >= 2;

  return (
    <div className="min-h-screen bg-navy-950">
      <div className="max-w-3xl mx-auto">
        <Header
          tone="dark"
          left={
            <div className="w-full">
              <p className="text-[10px] tracking-[0.25em] text-gold-500 font-medium mb-2">
                GEO DATABASE <span className="text-navy-500">· {STACK_BUCKET_LABELS[stackBucket]} · {BUBBLE_STAGE_LABELS[bubbleStage]}</span>
              </p>
              <div className="flex items-center gap-2.5">
                <motion.button
                  onClick={() => setSettingsOpen(true)}
                  whileTap={{ scale: 0.9 }}
                  className="shrink-0 h-11 w-11 rounded-full bg-gradient-to-br from-gold-400 to-gold-600 shadow-panel flex items-center justify-center"
                  aria-label="詳細設定"
                >
                  <Icon name="settings" className="h-5 w-5 text-navy-950" />
                </motion.button>
                <PositionPillBar items={items} onTruncate={handleTruncate} />
              </div>
            </div>
          }
        />
      </div>

      <div className="max-w-3xl mx-auto px-4 pb-28">
        {error && (
          <div className="rounded-2xl bg-crimson-500/10 ring-1 ring-crimson-500/30 text-crimson-300 text-sm px-4 py-3 mb-4">{error}</div>
        )}

        <div className="mt-1">{matrix && <HandClassMatrix matrix={matrix} bucketLabels={bucketLabels} />}</div>

        <div className="mt-3">
          {loading ? (
            <div className="rounded-2xl bg-navy-900 ring-1 ring-navy-700 p-8 text-center text-sm text-navy-400">読み込み中…</div>
          ) : noBoardData ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              className="rounded-2xl bg-navy-900 ring-1 ring-navy-700 p-6 text-center"
            >
              <p className="text-sm text-navy-300 mb-3">この板面に一致する実測データがありません。別の板面をお試しください。</p>
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={retryBoard}
                className="rounded-full bg-gold-500 text-navy-950 text-[12px] font-semibold px-4 py-2"
              >
                板面を選び直す
              </motion.button>
            </motion.div>
          ) : awaitingDismissedBoard ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              className="rounded-2xl bg-navy-900 ring-1 ring-navy-700 p-6 text-center"
            >
              <p className="text-sm text-navy-300 mb-3">次のストリートに進むにはボードを選択してください。</p>
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  setDismissedStreet(null);
                  setPendingStreet(nextStreetOf(street));
                }}
                className="rounded-full bg-gold-500 text-navy-950 text-[12px] font-semibold px-4 py-2"
              >
                ボードを選択
              </motion.button>
            </motion.div>
          ) : node ? (
            <PositionActionRow node={node} bucketLabels={bucketLabels} onSelect={selectBucket} />
          ) : null}
        </div>
      </div>

      <AnimatePresence>
        {pendingStreet && (
          <BoardCardPicker
            cardsNeeded={pendingStreet === "flop" ? 3 : 1}
            usedCards={board}
            onClose={closeBoardPicker}
            onConfirm={confirmBoard}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {settingsOpen && (
          <GeoSettingsModal
            stackBucket={stackBucket}
            bubbleStage={bubbleStage}
            onChangeStackBucket={setStackBucket}
            onChangeBubbleStage={setBubbleStage}
            onClose={() => setSettingsOpen(false)}
          />
        )}
      </AnimatePresence>

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
