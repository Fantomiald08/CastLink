import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static(path.join(__dirname, "public")));

const rooms = new Map();

wss.on("connection", ws => {
  let room = null;

  ws.on("message", raw => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    if (msg.type === "join") {
      room = String(msg.room || "").toUpperCase().slice(0, 8);
      if (!room) return;

      if (!rooms.has(room)) rooms.set(room, new Set());
      const clients = rooms.get(room);

      if (clients.size >= 2) {
        ws.send(JSON.stringify({ type: "full" }));
        return;
      }

      clients.add(ws);
      ws.send(JSON.stringify({ type: "joined", count: clients.size }));

      for (const client of clients) {
        if (client !== ws && client.readyState === 1) {
          client.send(JSON.stringify({ type: "peer-joined" }));
        }
      }
      return;
    }

    if (!room || !rooms.has(room)) return;
    for (const client of rooms.get(room)) {
      if (client !== ws && client.readyState === 1) {
        client.send(JSON.stringify(msg));
      }
    }
  });

  ws.on("close", () => {
    if (!room || !rooms.has(room)) return;
    const clients = rooms.get(room);
    clients.delete(ws);
    for (const client of clients) {
      if (client.readyState === 1) client.send(JSON.stringify({ type: "peer-left" }));
    }
    if (!clients.size) rooms.delete(room);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`CastLink running on http://localhost:${PORT}`));
