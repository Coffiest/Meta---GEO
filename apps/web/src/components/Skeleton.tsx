"use client";

/**
 * 読み込み中プレースホルダ。ink-200のパルスで「上質な空箱」を見せ、
 * 「読み込み中…」というテキストよりも体感速度・完成度を高める。
 */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-ink-200 ${className}`} aria-hidden />;
}

/** 折れ線グラフ用スケルトン(軸ラベル風＋プロット領域)。 */
export function ChartSkeleton() {
  return (
    <div className="space-y-2" aria-hidden>
      <div className="flex items-center gap-2">
        <Skeleton className="h-2.5 w-2.5 rounded-full" />
        <Skeleton className="h-3 w-20" />
        <Skeleton className="ml-auto h-3 w-12" />
      </div>
      <Skeleton className="h-[130px] w-full rounded-xl" />
    </div>
  );
}

/** 一覧(行)用スケルトン。行数を指定して縦に積む。 */
export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-xl border border-ink-200 px-3 py-2.5">
          <Skeleton className="h-8 w-8 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-2.5 w-1/3" />
          </div>
          <Skeleton className="h-4 w-12" />
        </div>
      ))}
    </div>
  );
}
