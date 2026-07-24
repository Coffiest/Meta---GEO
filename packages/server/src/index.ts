import { createServer } from "node:http";
import { Server } from "socket.io";
import { Lobby } from "./lobby.js";
import { handleGeoTreeApiRequest } from "./geoTreeApi.js";
import { handleLobbyApiRequest } from "./lobbyApi.js";
import { handleReviewApiRequest } from "./reviewApi.js";
import { handleSubscriptionApiRequest } from "./subscriptionApi.js";
import { handleAdminApiRequest } from "./adminApi.js";

const PORT = Number(process.env["PORT"] ?? 4000);

// 最後の防衛線: どこかで例外/Promise拒否が漏れてもプロセスを落とさない。
// Node 15以降は unhandledRejection がデフォルトでプロセスを終了させるため、これが無いと
// たった1つの取りこぼしで全卓・全ゲーム・全接続が同時に死ぬ(本番で実際に発生した障害)。
// ゲームサーバーはインメモリ状態が全てなので、「ログを残して生き続ける」ことが最優先。
process.on("uncaughtException", (err) => {
  console.error("[fatal-guard] uncaughtException (process kept alive):", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("[fatal-guard] unhandledRejection (process kept alive):", reason);
});

const httpServer = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
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
  console.log(`[server] socket connected: ${socket.id}`);
  lobby.handleConnection(socket);
});

httpServer.listen(PORT, () => {
  console.log(`[server] listening on :${PORT}`);
});
