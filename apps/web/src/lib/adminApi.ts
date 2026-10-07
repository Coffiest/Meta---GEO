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

