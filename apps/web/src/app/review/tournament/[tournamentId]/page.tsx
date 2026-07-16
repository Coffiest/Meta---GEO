"use client";

import { useParams, useRouter } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/useAuth";
import { TournamentReviewModal } from "@/components/review/TournamentReviewModal";

/**
 * トーナメント棋譜解析の直接URL(ブックマーク/外部リンク後方互換)。
 * 総括はモーダルで表示する(通常はリザルト画面/履歴タブからモーダルで開く)。閉じると前画面へ戻る。
 */
export default function ReviewTournamentPage() {
  const params = useParams();
  const router = useRouter();
  const tournamentId = String(params?.["tournamentId"] ?? "");
  const { session, loading: authLoading } = useAuth();

  // Supabaseのセッション復元中は判定を保留(復元前に「ログインが必要」を誤表示しないため)。
  if (authLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <span className="h-5 w-5 rounded-full border-2 border-ink-950 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <AnimatePresence>
        <TournamentReviewModal
          tournamentId={tournamentId}
          accessToken={session?.access_token}
          onClose={() => router.back()}
        />
      </AnimatePresence>
    </div>
  );
}
