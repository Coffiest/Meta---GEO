import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 20_000,
    // これらは実際のPostgresに対する統合テストで、グローバルなテーブル(Hand等)を
    // 共有・変更し合う。ファイルを並列実行すると互いの差分アサーションが壊れるため、直列実行にする。
    fileParallelism: false,
  },
});
