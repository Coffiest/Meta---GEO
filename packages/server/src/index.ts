import { createServer } from "node:http";
import { Server } from "socket.io";
import { TableSession } from "./gameServer.js";

const PORT = Number(process.env["PORT"] ?? 4000);

const httpServer = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const io = new Server(httpServer, {
  cors: { origin: process.env["WEB_ORIGIN"] ?? "*" },
});

const table = new TableSession(io);

io.on("connection", (socket) => {
  console.log(`[server] socket connected: ${socket.id}`);
  table.handleConnection(socket).catch((err) => {
    console.error(`[server] handleConnection failed for ${socket.id}:`, err);
  });
});

httpServer.listen(PORT, () => {
  console.log(`[server] listening on :${PORT}`);
});
