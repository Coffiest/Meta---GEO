const SERVER_URL = process.env["NEXT_PUBLIC_SERVER_URL"] ?? "http://localhost:4000";

/**
 * 管理者 API の共通ヘッダー。パスコードに加えて、ログイン中のアカウントのトークンを送る
 * (サーバーは「パスコード」かつ「管理者のアカウント」のときだけ通す)。
 */
export function adminHeaders(passcode: string, accessToken: string | null | undefined): Record<string, string> {
  const h: Record<string, string> = { "x-admin-passcode": passcode };
  if (accessToken) h["authorization"] = `Bearer ${accessToken}`;
  return h;
}

export type AdminSessionResult = { status: "ok" } | { status: "wrong" } | { status: "notAdmin"; userId: string | null };

/** パスコードとアカウントを、サーバーで確かめる(答えは画面に持たない)。 */
export async function checkAdminSession(passcode: string, accessToken: string | null | undefined): Promise<AdminSessionResult> {
  try {
    const res = await fetch(`${SERVER_URL}/api/admin/session`, { headers: adminHeaders(passcode, accessToken) });
    if (res.ok) return { status: "ok" };
    if (res.status === 403) {
      const body = (await res.json().catch(() => ({}))) as { userId?: string | null };
      return { status: "notAdmin", userId: body.userId ?? null };
    }
    return { status: "wrong" };
  } catch {
    return { status: "wrong" };
  }
}

/** ログイン画面でパスコードを通したあと、ログインできたら管理者画面へ進むための印(同じタブの間だけ残る)。 */
const ADMIN_AFTER_LOGIN_KEY = "pokerart.adminAfterLogin";

export function markAdminAfterLogin(passcode: string): void {
  try {
    sessionStorage.setItem("adminPasscode", passcode);
    sessionStorage.setItem(ADMIN_AFTER_LOGIN_KEY, "1");
  } catch {
    /* 保存できない環境では、ログイン後に GEO タブから入ってもらう */
  }
}

/** 印があれば消して true(1回だけ)。 */
export function takeAdminAfterLogin(): boolean {
  try {
    if (sessionStorage.getItem(ADMIN_AFTER_LOGIN_KEY) !== "1") return false;
    sessionStorage.removeItem(ADMIN_AFTER_LOGIN_KEY);
    return true;
  } catch {
    return false;
  }
}
