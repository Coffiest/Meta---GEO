import { createServer } from "node:http";
import { Server } from "socket.io";
import { Lobby } from "./lobby.js";
import { handleGeoTreeApiRequest } from "./geoTreeApi.js";
import { handleLobbyApiRequest } from "./lobbyApi.js";
import { handleReviewApiRequest } from "./reviewApi.js";

const PORT = Number(process.env["PORT"] ?? 4000);

const httpServer = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  handleLobbyApiRequest(req, res).then((handled) => {
    if (handled) return;
    handleGeoTreeApiRequest(req, res).then((handled2) => {
      if (handled2) return;
      handleReviewApiRequest(req, res).then((handled3) => {
        if (handled3) return;
        res.writeHead(404);
        res.end();
      });
    });
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
