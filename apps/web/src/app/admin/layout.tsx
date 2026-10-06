import type { Metadata } from "next";

/** 管理者画面は検索エンジンに載せない(robots.txt に書くと場所を教えてしまうので、ページ側で noindex にする)。 */
export const metadata: Metadata = {
  title: "Poker ART",
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
