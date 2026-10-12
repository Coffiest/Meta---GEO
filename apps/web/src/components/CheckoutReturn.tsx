"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/useAuth";
import { confirmCheckout } from "@/lib/subscription";

/**
 * 決済(Stripe Checkout)から戻ってきた画面で、その決済をサーバーに確かめて加入をすぐ反映する。
 * URL の `?checkout=success&session_id=cs_...` を見て1回だけ動き、終わったら URL からその2つを消す。
 * Webhook を待たないので、戻った瞬間に「現在加入中」になる(以前は Webhook 頼みで、遅れると未加入に見えた)。
 * どの画面に戻ってもよいように、ルートの layout に置く。
 */
export function CheckoutReturn() {
  const { accessToken } = useAuth();
  const done = useRef(false);

  useEffect(() => {
    if (done.current || !accessToken) return;
    let params: URLSearchParams;
    try {
      params = new URLSearchParams(window.location.search);
    } catch {
      return;
    }
    const sessionId = params.get("session_id");
    if (params.get("checkout") !== "success" || !sessionId) return;
    done.current = true;
    void (async () => {
      // Stripe 側の確定がわずかに遅れることがあるので、反映されるまで数回だけ試す。
      for (let attempt = 0; attempt < 4; attempt++) {
        const result = await confirmCheckout(accessToken, sessionId).catch(() => null);
        if (result?.active) break;
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      }
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete("session_id");
        url.searchParams.delete("checkout");
        window.history.replaceState(window.history.state, "", url.toString());
      } catch {
        /* URL が残るだけ */
      }
    })();
  }, [accessToken]);

  return null;
}
