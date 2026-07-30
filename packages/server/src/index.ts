import { createServer } from "node:http";
import { Server } from "socket.io";
import { Lobby } from "./lobby.js";
import { handleGeoTreeApiRequest } from "./geoTreeApi.js";
import { handleLobbyApiRequest } from "./lobbyApi.js";
import { handleReviewApiRequest } from "./reviewApi.js";
import { handleSubscriptionApiRequest } from "./subscriptionApi.js";
import { handleAdminApiRequest } from "./adminApi.js";
import { startPrimeTimeNotifier } from "./primeTimeNotifier.js";
import {
  getDiagnostics,
  recordError,
  recordRequest,
  startDatabaseWarmup,
  startDiagnostics,
} from "./diagnostics.js";

const PORT = Number(process.env["PORT"] ?? 4000);

// 最後の防衛線: どこかで例外/Promise拒否が漏れてもプロセスを落とさない。
// Node 15以降は unhandledRejection がデフォルトでプロセスを終了させるため、これが無いと
// たった1つの取りこぼしで全卓・全ゲーム・全接続が同時に死ぬ(本番で実際に発生した障害)。
// ゲームサーバーはインメモリ状態が全てなので、「ログを残して生き続ける」ことが最優先。
process.on("uncaughtException", (err) => {
  recordError("uncaughtException", err);
  console.error("[fatal-guard] uncaughtException (process kept alive):", err);
});
process.on("unhandledRejection", (reason) => {
  recordError("unhandledRejection", reason);
  console.error("[fatal-guard] unhandledRejection (process kept alive):", reason);
});

// 計測を先に立ち上げる(起動直後の重さも取りこぼさないため)。
startDiagnostics();
// DB接続を先に温めておく(最初のユーザーリクエストに接続コストを負わせない)。
startDatabaseWarmup();

/** ソケット接続数と進行中の卓数。診断で「重さが同時接続に比例しているか」を見るために使う。 */
let connectedSockets = 0;

const httpServer = createServer((req, res) => {
  const startedAt = performance.now();
  const method = req.method ?? "GET";
  // クエリを落としたパスだけを記録する(トークン等がログに載らないように)。
  const path = (req.url ?? "/").split("?")[0] ?? "/";
  res.on("finish", () => {
    recordRequest(method, path, res.statusCode, performance.now() - startedAt);
  });

  // Fly.ioのヘルスチェックが叩くので、ここは常に軽量に保つ(DBにも触らない)。
  // 動作診断ページがブラウザから素の応答速度を測るため、CORSヘッダも返す
  // (これが無いとブラウザ側で必ず失敗し、診断ページに常時エラーが出る)。
  if (path === "/health") {
    res.writeHead(200, {
      "content-type": "application/json",
      "access-control-allow-origin": process.env["WEB_ORIGIN"] ?? "*",
      "cache-control": "no-store",
    });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // サーバーの重さの原因を切り分けるための詳細メトリクス。
  // メモリ / イベントループ遅延 / DB応答 / 遅いリクエスト / 直近のエラーを返す。
  if (path === "/api/diagnostics") {
    getDiagnostics()
      .then((snapshot) => {
        res.writeHead(200, {
          "content-type": "application/json; charset=utf-8",
          "access-control-allow-origin": process.env["WEB_ORIGIN"] ?? "*",
          "cache-control": "no-store",
        });
        res.end(JSON.stringify({ ...snapshot, sockets: connectedSockets }));
      })
      .catch((err) => {
        recordError("diagnostics", err);
        if (!res.headersSent) res.writeHead(500, { "content-type": "application/json" });
        if (!res.writableEnded) res.end(JSON.stringify({ error: "diagnostics failed" }));
      });
    return;
  }

  handleLobbyApiRequest(req, res)
    .then((handled) => {
      if (handled) return;
      return handleGeoTreeApiRequest(req, res).then((handled2) => {
        if (handled2) return;
        return handleReviewApiRequest(req, res).then((handled3) => {
          if (handled3) return;
          return handleSubscriptionApiRequest(req, res).then((handled4) => {
            if (handled4) return;
            return handleAdminApiRequest(req, res).then((handled5) => {
              if (handled5) return;
              res.writeHead(404);
              res.end();
            });
          });
        });
      });
    })
    .catch((err) => {
      // APIハンドラの取りこぼしで応答が永久に返らない(クライアントが読み込み中で固まる)ことを防ぐ。
      recordError(`http ${method} ${path}`, err);
      console.error("[http] request handler failed:", err);
      if (!res.headersSent) res.writeHead(500, { "content-type": "application/json" });
      if (!res.writableEnded) res.end(JSON.stringify({ error: "internal" }));
    });
});

const io = new Server(httpServer, {
  cors: { origin: process.env["WEB_ORIGIN"] ?? "*" },
});

const lobby = new Lobby(io);

io.on("connection", (socket) => {
  connectedSockets += 1;
  console.log(`[server] socket connected: ${socket.id} (sockets=${connectedSockets})`);
  socket.on("disconnect", (reason) => {
    connectedSockets = Math.max(0, connectedSockets - 1);
    console.log(`[server] socket disconnected: ${socket.id} reason=${reason} (sockets=${connectedSockets})`);
  });
  socket.on("error", (err) => recordError(`socket ${socket.id}`, err));
  lobby.handleConnection(socket);
});

// プライムタイム(毎晩21:00 JST)開始10分前のプッシュ通知。VAPID鍵が未設定なら送信は黙ってスキップされる。
startPrimeTimeNotifier();

httpServer.listen(PORT, () => {
  console.log(`[server] listening on :${PORT}`);
});
