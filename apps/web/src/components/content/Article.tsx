import type { ReactNode } from "react";

/**
 * コンテンツ記事の本文コンテナ。@tailwindcss/typography は未導入のため、
 * 見出し・段落・リストのスタイルをここで一元的に与える(白基調・ゴールドアクセント)。
 */
export function Article({
  eyebrow,
  title,
  lead,
  updated,
  children,
}: {
  eyebrow: string;
  title: string;
  lead?: string;
  updated?: string;
  children: ReactNode;
}) {
  return (
    <article className="mx-auto max-w-2xl px-5 py-10">
      <header className="mb-8">
        <p className="text-[11px] font-black uppercase tracking-[0.22em] text-gold-600">{eyebrow}</p>
        <h1 className="mt-2 text-[28px] font-black leading-tight tracking-tight text-ink-950 sm:text-[32px]">
          {title}
          <span className="text-gold-500">.</span>
        </h1>
        {lead && <p className="mt-3 text-[15px] leading-relaxed text-ink-600">{lead}</p>}
        {updated && <p className="mt-3 text-[11px] text-ink-400">最終更新: {updated}</p>}
      </header>
      <div className="space-y-6 text-[15px] leading-relaxed text-ink-800">{children}</div>
    </article>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-[19px] font-extrabold tracking-tight text-ink-950">{title}</h2>
      {children}
    </section>
  );
}
