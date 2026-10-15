"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import { PasscodeModal } from "@/components/PasscodeModal";
import { checkAdminSession } from "@/lib/adminApi";
import { useAuth } from "@/lib/useAuth";
import { APP_VERSION } from "@/lib/version";

/**
 * バージョン表記(タップ → パスコード → 管理者画面)。GEO DATABASE の最下部と同じもの。
 * リーダーボードの最下部にも置く(オーナー指示)。下のタブバーと重ならないよう、呼び出し側で下に余白を取ること。
 */
export function AdminVersionFooter() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  return (
    <>
      <div className="mt-10 flex justify-center">
        <button
          onClick={() => setOpen(true)}
          className="pressable cursor-pointer text-[11px] font-medium tracking-wide text-fg-3 transition-colors active:text-n-9"
        >
          <span className="text-accent">{"$ "}</span>
          poker-art --version {APP_VERSION} · © 2026 Poker ART{" "}
          <span className="whitespace-nowrap">· Powered by Runner Runner</span>
          <span className="term-cursor bg-fg-3" style={{ width: 4, height: 10, verticalAlign: "-1px" }} aria-hidden="true" />
        </button>
      </div>
      {notice && <p className="mt-2 text-center text-[10px] text-fg-3">{notice}</p>}
      <AnimatePresence>
        {open && (
          <PasscodeModal
            title="管理者パスコード"
            verify={async (code) => {
              const r = await checkAdminSession(code, accessToken ?? null);
              if (r.status === "notAdmin") {
                setNotice(`このアカウントは管理者として登録されていません(ID: ${r.userId ?? "不明"})`);
                setOpen(false);
                return false;
              }
              return r.status === "ok";
            }}
            onSuccess={(code) => {
              try {
                sessionStorage.setItem("adminPasscode", code);
              } catch {
                /* sessionStorage不可でも/admin側で再入力できる */
              }
              router.push("/admin");
            }}
            onClose={() => setOpen(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
