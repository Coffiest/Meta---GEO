import type { Metadata } from "next";

/** インフルエンサー本人の明細。秘密の URL で開くページなので検索エンジンに載せない。 */
export const metadata: Metadata = {
  title: "パートナー明細 | Poker ART",
  robots: { index: false, follow: false, nocache: true },
};

export default function PartnerLayout({ children }: { children: React.ReactNode }) {
  return children;
}
