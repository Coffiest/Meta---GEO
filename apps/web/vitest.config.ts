import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // tsconfig の `paths`(@/* → ./src/*)と同じ。型だけのインポートは実行時に消えるので
    // 今まで要らなかったが、データ側が定数(値)を `@/` でインポートするようになった。
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
});
