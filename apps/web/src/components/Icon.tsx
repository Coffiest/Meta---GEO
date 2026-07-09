// --- アイコン(ヘッダー/フッター共用) ---
export function Icon({ name, className = "h-5 w-5" }: { name: string; className?: string }) {
  const paths: Record<string, React.ReactNode> = {
    home: <path d="M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5" strokeLinecap="round" strokeLinejoin="round" />,
    stats: (
      <>
        <rect x="4" y="13.5" width="3.2" height="6.5" rx="1" fill="currentColor" stroke="none" />
        <rect x="10.4" y="9" width="3.2" height="11" rx="1" fill="currentColor" stroke="none" />
        <rect x="16.8" y="4.5" width="3.2" height="15.5" rx="1" fill="currentColor" stroke="none" />
        <path d="M4 8.5 9 5l4 2.5L20 4" strokeLinecap="round" strokeLinejoin="round" opacity={0.55} />
      </>
    ),
    trophy: (
      <>
        <path d="M7 4h10v4.5a5 5 0 0 1-10 0V4Z" strokeLinejoin="round" />
        <path d="M7 5.2H4.6A2.4 2.4 0 0 0 7 8.4M17 5.2h2.4A2.4 2.4 0 0 1 17 8.4" strokeLinecap="round" />
        <path d="M12 13.3v3.4M9 20h6M9.6 20c0-1.1.6-1.9 1.4-2.4a3 3 0 0 1 2 0c.8.5 1.4 1.3 1.4 2.4" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
    layers: (
      <>
        <path d="m12 3 9 5-9 5-9-5 9-5Z" strokeLinejoin="round" fill="currentColor" fillOpacity={0.18} />
        <path d="m3 12 9 5 9-5M3 16.5 12 21l9-4.5" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
    seat: <path d="M16 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" strokeLinecap="round" />,
    settings: (
      <>
        <circle cx="12" cy="12" r="3.1" />
        <path
          d="M12 3v2.4M12 18.6V21M4.5 4.5l1.7 1.7M17.8 17.8l1.7 1.7M3 12h2.4M18.6 12H21M4.5 19.5l1.7-1.7M17.8 6.2l1.7-1.7"
          strokeLinecap="round"
        />
      </>
    ),
    db: (
      <>
        <ellipse cx="12" cy="5.5" rx="7.5" ry="2.8" fill="currentColor" fillOpacity={0.18} />
        <ellipse cx="12" cy="5.5" rx="7.5" ry="2.8" />
        <path d="M4.5 5.5v13c0 1.55 3.36 2.8 7.5 2.8s7.5-1.25 7.5-2.8v-13M4.5 12c0 1.55 3.36 2.8 7.5 2.8s7.5-1.25 7.5-2.8" strokeLinecap="round" />
      </>
    ),
    star: (
      <path
        d="m12 3.5 2.6 5.6 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6-4.4-4.2 6-.8L12 3.5Z"
        strokeLinejoin="round"
      />
    ),
  };
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className={className}>
      {paths[name]}
    </svg>
  );
}
