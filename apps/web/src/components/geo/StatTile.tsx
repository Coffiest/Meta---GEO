export function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl bg-ink-900/70 ring-1 ring-ink-700/50 px-4 py-3.5">
      <div className="text-[11px] text-ink-400">{label}</div>
      <div className="text-2xl font-semibold text-ink-50 mt-1">{value}</div>
      {hint && <div className="text-[11px] text-ink-500 mt-0.5">{hint}</div>}
    </div>
  );
}
