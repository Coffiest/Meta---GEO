"use client";

import { LoaderBlock } from "./ui/Loader";

/**
 * 読み込み中の表示。
 *
 * 以前は形だけのプレースホルダ(パルスする空箱)を並べていたが、アプリ全体で
 * 読み込み中の見せ方を1つに揃えるため、跳ねる玉の Loader に統一した(オーナー指示)。
 * 呼び出し側の名前は変えていないので、置き場所と高さの確保はそのまま働く
 * ―― 中身が入れ替わったときに周りが飛ばないよう、元と同じ高さを保っている。
 */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-n-4 ${className}`} aria-hidden />;
}

/** 折れ線グラフの読み込み中。グラフ1枚ぶんの高さを確保したまま中央に出す。 */
export function ChartSkeleton() {
  return <LoaderBlock size="md" label="グラフを読み込み中" className="h-[164px]" />;
}

/** 一覧の読み込み中。行数ぶんのおおよその高さを確保したまま中央に出す。 */
export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    // 元のスケルトン(1行 約57px + 行間8px)と同じだけ場所を取り、読み込みが
    // 終わった瞬間に下のコンテンツが飛び上がらないようにする。
    <LoaderBlock size="md" label="一覧を読み込み中" style={{ minHeight: rows * 65 }} />
  );
}
