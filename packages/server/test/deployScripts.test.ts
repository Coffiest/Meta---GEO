import { execFile, execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * デプロイの判定とゲート(.github/scripts)のテスト。
 *
 * ここが壊れると、次のどちらかになる:
 *  - 「サーバーに関わる変更」を見逃して、サーバーの修正が黙って本番に届かない
 *  - 対局中の人を待たずに再起動して、また卓が消える(画面に「進行中の卓が見つかりません」)
 *
 * 実際の本番(/health)の代わりに手元のHTTPサーバーを立て、実物のスクリプトを bash で動かす。
 * (execFileSync だとイベントループが止まって手元のサーバーが応答できないので、非同期で動かす。)
 */

const run = promisify(execFile);
const SCRIPTS = fileURLToPath(new URL("../../../.github/scripts/", import.meta.url));

const SHA_A = "a".repeat(40);

let healthBody: () => string | null = () => null; // null = 接続できない(500を返す)
let server: Server;
let healthUrl = "";
let repo = "";

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
}

function commit(files: Record<string, string>, message: string): string {
  for (const [path, content] of Object.entries(files)) {
    const full = join(repo, path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content);
  }
  git("add", "-A");
  git("commit", "-q", "-m", message);
  return git("rev-parse", "HEAD");
}

/** server-changed.sh を動かして、判定(true/false)を返す。 */
async function serverChanged(env: Record<string, string> = {}): Promise<string> {
  const out = join(repo, ".gh-output");
  writeFileSync(out, "");
  await run("bash", [join(SCRIPTS, "server-changed.sh")], {
    cwd: repo,
    env: { ...process.env, GITHUB_OUTPUT: out, HEALTH_URL: healthUrl, ...env },
  });
  const m = /^server=(true|false)$/m.exec(readFileSync(out, "utf8"));
  if (!m) throw new Error("server= が出力されていない");
  return m[1]!;
}

/** /health が返すのと同じ形(index.ts と同じく JSON.stringify)。 */
function health(playing: number | undefined, sha: string | null): string {
  return JSON.stringify({ ok: true, uptimeSec: 100, ...(playing === undefined ? {} : { playing }), sha });
}

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === "/health") {
      const body = healthBody();
      if (body === null) {
        res.writeHead(500).end();
        return;
      }
      res.writeHead(200, { "content-type": "application/json" }).end(body);
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  healthUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/health`;

  repo = mkdtempSync(join(tmpdir(), "deploy-scripts-"));
  git("init", "-q");
  git("config", "user.email", "t@example.com");
  git("config", "user.name", "t");
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(repo, { recursive: true, force: true });
});

describe("server-changed.sh(サーバーを入れ替える必要があるか)", () => {
  it("手動実行で強制されたら、他の条件によらず true", async () => {
    commit({ "apps/web/a.txt": "1" }, "base");
    healthBody = () => health(0, git("rev-parse", "HEAD"));
    expect(await serverChanged({ FORCE: "true" })).toBe("true");
  });

  it("サーバーの状態を取得できないときは true(入れ替えない側に倒すと、修正が黙って届かない)", async () => {
    healthBody = () => null;
    expect(await serverChanged()).toBe("true");
  });

  it("動いているサーバーが版を返さないとき(この仕組みの初回)は true", async () => {
    healthBody = () => JSON.stringify({ ok: true });
    expect(await serverChanged()).toBe("true");
    healthBody = () => health(0, null);
    expect(await serverChanged()).toBe("true");
  });

  it("動いているサーバーの版がこの履歴に無いときは true", async () => {
    healthBody = () => health(0, SHA_A);
    expect(await serverChanged()).toBe("true");
  });

  it("動いている版と同じ(差分なし)なら false", async () => {
    const head = git("rev-parse", "HEAD");
    healthBody = () => health(0, head);
    expect(await serverChanged()).toBe("false");
  });

  it("Webだけの変更(apps/web)なら false = サーバーを再起動しない", async () => {
    const deployed = git("rev-parse", "HEAD");
    commit({ "apps/web/src/page.tsx": "ui" }, "web only");
    commit({ "apps/web/package.json": "{}", "docs/readme.md": "x", "CLAUDE.md": "y" }, "web + docs");
    healthBody = () => health(0, deployed);
    expect(await serverChanged()).toBe("false");
  });

  it("packages/ の変更があれば true(server / engine / db / marketing のどれでも)", async () => {
    for (const path of ["packages/server/src/lobby.ts", "packages/engine/src/x.ts", "packages/db/prisma/schema.prisma"]) {
      const deployed = git("rev-parse", "HEAD");
      commit({ [path]: String(Math.random()) }, `touch ${path}`);
      healthBody = () => health(0, deployed);
      expect(await serverChanged(), path).toBe("true");
    }
  });

  it("依存を決めるルートのファイルの変更でも true(Dockerfile は pnpm install し直す)", async () => {
    for (const path of ["pnpm-lock.yaml", "pnpm-workspace.yaml", "package.json", "tsconfig.base.json"]) {
      const deployed = git("rev-parse", "HEAD");
      commit({ [path]: String(Math.random()) }, `touch ${path}`);
      healthBody = () => health(0, deployed);
      expect(await serverChanged(), path).toBe("true");
    }
  });

  it("途中の実行が取り消されても、その変更を取りこぼさない(基準は前回のpushではなく動いている版)", async () => {
    // A: サーバーの変更(デプロイされなかった=取り消された) → B: Webだけ。Bの判定は B 単独の差分ではなく、
    // 動いているサーバーの版との差分で決まるので、Aのサーバーの変更も拾って true になる。
    const deployed = git("rev-parse", "HEAD");
    commit({ "packages/server/src/fix.ts": "security fix" }, "A: server fix (run cancelled)");
    commit({ "apps/web/src/other.tsx": "ui" }, "B: web only");
    healthBody = () => health(0, deployed);
    expect(await serverChanged()).toBe("true");
  });
});

/** wait-for-quiet.sh を動かして、(終了コード, 出力, かかった秒)を返す。 */
async function waitForQuiet(env: Record<string, string> = {}) {
  const startedAt = Date.now();
  const { stdout } = await run("bash", [join(SCRIPTS, "wait-for-quiet.sh"), "20"], {
    env: { ...process.env, HEALTH_URL: healthUrl, POLL_SEC: "0.2", ...env },
  });
  return { stdout, seconds: (Date.now() - startedAt) / 1000 };
}

describe("wait-for-quiet.sh(対局中の人がいる間は入れ替えを待つ)", () => {
  it("手動実行で強制されたら、対局中でも待たずに進む", async () => {
    healthBody = () => health(5, SHA_A);
    const r = await waitForQuiet({ FORCE: "true" });
    expect(r.seconds).toBeLessThan(2);
    expect(r.stdout).toContain("強制");
  });

  it("対局中の人がいなければ、すぐ進む", async () => {
    healthBody = () => health(0, SHA_A);
    const r = await waitForQuiet();
    expect(r.seconds).toBeLessThan(2);
    expect(r.stdout).toContain("対局中の人はいない");
  });

  it("サーバーの状態が取れないときは待たない(落ちているなら、待っても誰も遊んでいない)", async () => {
    healthBody = () => null;
    const r = await waitForQuiet();
    expect(r.seconds).toBeLessThan(2);
  });

  it("playing を返さない旧版のサーバーは、人数を知る手段が無いので待たない", async () => {
    healthBody = () => health(undefined, null);
    const r = await waitForQuiet();
    expect(r.seconds).toBeLessThan(2);
    expect(r.stdout).toContain("旧版");
  });

  it("対局中の人がいる間は待ち、いなくなったら進む", async () => {
    let polls = 0;
    healthBody = () => {
      polls += 1;
      return health(polls < 4 ? 2 : 0, SHA_A); // 3回は対局中、4回目で0人
    };
    const r = await waitForQuiet();
    expect(polls).toBe(4);
    expect(r.stdout).toContain("対局中 2 人");
    expect(r.stdout).toContain("対局中の人はいない");
  });

  it("上限まで待っても誰かが遊んでいたら、警告を出して進む(永久に止まらない)", async () => {
    healthBody = () => health(3, SHA_A);
    // 時計は整数秒で比べるので、上限2秒は実際には1〜2秒になる。
    const r = await waitForQuiet({ MAX_WAIT_SEC: "2" });
    expect(r.seconds).toBeGreaterThanOrEqual(0.8);
    expect(r.seconds).toBeLessThan(10);
    expect(r.stdout).toContain("::warning::");
    expect(r.stdout).toContain("3 人が対局中");
  });
});
