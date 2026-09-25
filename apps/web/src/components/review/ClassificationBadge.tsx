"use client";

import { CLASSIFICATION_META, type Classification } from "@/lib/classification";

/**
 * 分類の色付き丸バッジ(SVG)。チェスドットコムのGame Reviewのアイコン相当。
 * 絵文字は使わず、SVGの円+記号(グリフ)で表現する。glyphが空の分類(良手/好手)は
 * チェックマークのSVGパスで表す。
 */
export function ClassificationBadge({
  classification,
  size = 28,
  showLabel = false,
}: {
  classification: Classification;
  size?: number;
  showLabel?: boolean;
}) {
  const meta = CLASSIFICATION_META[classification];
  const badge = (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-label={meta.label} role="img">
      <circle cx="16" cy="16" r="15" fill={meta.color} />
      {meta.glyph ? (
        <text
          x="16"
          y="17"
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={meta.glyph.length >= 2 ? 13 : 17}
          fontWeight="900"
          fill="#ffffff"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
        >
          {meta.glyph}
        </text>
      ) : classification === "book" ? (
        // 常識(Book)は本(開いた書物)のアイコン。中央の綴じ線と左右のページ。
        <g fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 10.5c-1.8-1.3-4-2-6.5-2H8v13h1.5c2.5 0 4.7.7 6.5 2 1.8-1.3 4-2 6.5-2H24v-13h-1.5c-2.5 0-4.7.7-6.5 2Z" />
          <path d="M16 10.5v13" />
        </g>
      ) : (
        // 良手/好手はチェックマーク。
        <path
          d="M10 16.5l4 4 8-8.5"
          fill="none"
          stroke="#ffffff"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );

  if (!showLabel) return badge;
  return (
    <span className="inline-flex items-center gap-1.5">
      {badge}
      <span className="text-[12px] font-black" style={{ color: meta.color }}>
        {meta.label}
      </span>
    </span>
  );
}
