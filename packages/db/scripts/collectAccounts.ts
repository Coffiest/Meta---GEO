/**
 * ①⑦ 監視対象アカウントのフォロワー数を記録する。日次実行から呼ぶ。
 *
 * X_BEARER_TOKEN が無ければ何も取らずに終わる(エラーにはしない)。鍵が無い状態が普通なので、
 * ここで失敗扱いにすると日次ジョブが毎日赤くなり、本当の異常に気づけなくなる。
 * その間は管理画面から手入力で同じテーブルへ積める。
 */
import { fetchAccountMetrics, hasXCredentials, describeFailure } from "@meta-geo/marketing";
import { prisma } from "../src/client.js";
import { recordAccountSnapshot } from "../src/marketing.js";

async function main(): Promise<void> {
  if (!hasXCredentials()) {
    console.log("[accounts] X_BEARER_TOKEN が未設定のため取得をスキップします(手入力での記録は可能)。");
    return;
  }

  const accounts = await prisma.socialAccount.findMany({ where: { platform: "x" } });
  if (accounts.length === 0) {
    console.log("[accounts] 監視対象が未登録です。管理画面から追加してください。");
    return;
  }

  let ok = 0;
  for (const a of accounts) {
    const r = await fetchAccountMetrics(a.handle);
    if (!r.ok) {
      console.warn(`[accounts] ${a.handle}: ${describeFailure(r)}`);
      // レート上限なら以降も同じなので、そこで打ち切る(無駄に叩かない)。
      if (r.reason === "rate-limited") break;
      continue;
    }
    await recordAccountSnapshot({
      accountId: a.id,
      followers: r.data.followers,
      following: r.data.following,
      posts: r.data.posts,
    });
    ok += 1;
  }
  console.log(`[accounts] ${ok}/${accounts.length}件を記録しました`);
}

main()
  .catch((err) => {
    console.error("[accounts] 失敗:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
