"use client";

import { STACK_BUCKETS, STACK_BUCKET_LABELS, type StackBucket } from "@/lib/geoApi";

export function StackBucketSelector({ value, onChange }: { value: StackBucket; onChange: (v: StackBucket) => void }) {
  return (
    <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
      {STACK_BUCKETS.map((bucket) => (
        <button
          key={bucket}
          onClick={() => onChange(bucket)}
          className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold tabular-nums transition-colors ${
            value === bucket ? "bg-gold-500 text-navy-950" : "bg-navy-800 text-navy-300 ring-1 ring-navy-600/60"
          }`}
        >
          {STACK_BUCKET_LABELS[bucket]}
        </button>
      ))}
    </div>
  );
}
