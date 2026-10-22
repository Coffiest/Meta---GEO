"use client";

import { useEffect, useState } from "react";
import { HandClassMatrix } from "@/components/geo/HandClassMatrix";
import type { HandClassMatrixResult } from "@/lib/geoApi";

/**
 * GTO Wizard の解のレンジ表を、解説の「詳しく見る」に出す(オーナー指示: 実際のレンジとほぼ同じ見た目の表)。
 * データはサーバーの判定と同じ `packages/engine/data/gtow/<スタック>/<場面>.json`。場面ごとに分けて必要なときだけ読む。
 * 描画は GEO タブの 13×13 の表(HandClassMatrix)をそのまま使う(色はアクションの意味の配色)。
 */
type Freq = { raise: number; call: number; fold: number; allIn: number; weight: number };

const R = "AKQJT98765432";
function labelOf(row: number, col: number): string {
  if (row === col) return R[row]! + R[col]!;
  return row < col ? `${R[row]}${R[col]}s` : `${R[col]}${R[row]}o`;
}

const POS: Record<string, string> = { LJ: "UTG" };
const pos = (p: string) => POS[p] ?? p;

/** 場面名 → 見出し(例 "vs3bet_BTN_vs_SB" → "BTN のオープンに SB が 3bet")。 */
export function gtowSceneTitle(scene: string): string {
  const [kind, a, , b] = scene.split("_");
  switch (kind) {
    case "RFI":
      return `${pos(a!)} のオープン`;
    case "vsOpen":
      return `${pos(b!)} のオープンに ${pos(a!)} の対応`;
    case "vs3bet":
      return `${pos(a!)} のオープンに ${pos(b!)} が 3bet`;
    case "vs4bet":
      return `${pos(a!)} の 3bet に ${pos(b!)} が 4bet`;
    case "vs4betAI":
      return `${pos(a!)} の 3bet に ${pos(b!)} が 4bet オールイン`;
    case "vs5bet":
      return `${pos(a!)} の 4bet に ${pos(b!)} が 5bet オールイン`;
    default:
      return scene;
  }
}

function raiseName(scene: string): string {
  const kind = scene.split("_")[0];
  return kind === "RFI" ? "オープン" : kind === "vsOpen" ? "3bet" : kind === "vs3bet" ? "4bet" : kind === "vs4bet" ? "5bet" : "レイズ";
}

export function GtowRangeTable({ scene, stack = 70, hand }: { scene: string; stack?: number; hand?: string }) {
  const [hands, setHands] = useState<Record<string, Freq> | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    import(`@meta-geo/engine/data/gtow/${stack}/${scene}.json`)
      .then((m: { default?: { hands: Record<string, Freq> }; hands?: Record<string, Freq> }) => {
        if (alive) setHands((m.default ?? m).hands ?? null);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [scene, stack]);

  if (failed) return null;
  if (!hands) return <div className="h-[220px] rounded-lg bg-white/[0.04]" />;

  const matrix: HandClassMatrixResult = {
    totalSamples: 169,
    cells: Array.from({ length: 13 }, (_, r) =>
      Array.from({ length: 13 }, (_, c) => {
        const label = labelOf(r, c);
        const f = hands[label];
        if (!f || f.weight <= 0) return { label, count: 0, byBucket: {} };
        const byBucket: Record<string, number> = {};
        if (f.allIn > 0) byBucket.allIn = Math.round(f.allIn * 1000);
        if (f.raise > 0) byBucket["raise5+"] = Math.round(f.raise * 1000);
        if (f.call > 0) byBucket.call = Math.round(f.call * 1000);
        if (f.fold > 0) byBucket.fold = Math.round(f.fold * 1000);
        const count = Object.values(byBucket).reduce((a, b) => a + b, 0);
        return { label, count, byBucket };
      })
    ),
  };
  const isRfiSb = scene === "RFI_SB";
  const labels = {
    allIn: "オールイン",
    "raise5+": raiseName(scene),
    call: isRfiSb ? "リンプ" : "コール",
    fold: "フォールド",
  };
  const mine = hand ? hands[hand] : undefined;
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-bold text-fg-2">{gtowSceneTitle(scene)}(GTO・{stack}bb)</p>
      <HandClassMatrix matrix={matrix} bucketLabels={labels} />
      {hand && mine && (
        <p className="mt-1.5 text-[11px] font-semibold tabular-nums text-fg-2">
          {hand}:{[
            mine.allIn > 0 && `${labels.allIn} ${pct(mine.allIn)}`,
            mine.raise > 0 && `${labels["raise5+"]} ${pct(mine.raise)}`,
            mine.call > 0 && `${labels.call} ${pct(mine.call)}`,
            mine.fold > 0 && `${labels.fold} ${pct(mine.fold)}`,
          ]
            .filter(Boolean)
            .join(" / ")}
        </p>
      )}
    </div>
  );
}
