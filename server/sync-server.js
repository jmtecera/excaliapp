#!/usr/bin/env node

import "./load-env.js";
import { createServer } from "node:http";
import { handleCreateRoom, handleRoomAction, isRoomAction } from "./handlers.js";
import { isSupabaseConfigured, sendJson } from "./supabase.js";

const PORT = Number.parseInt(process.env.PORT || "8787", 10);
const ROOM_ACTION_PATH = /^\/api\/rooms\/([A-Z0-9]{3}-[A-Z0-9]{3})\/([a-z]+)$/i;

const server = createServer(async (request, response) => {
  const { pathname } = new URL(request.url || "/", "http://localhost");

  if (pathname === "/api/health") {
    sendJson(response, 200, { ok: isSupabaseConfigured() });
    return;
  }

  if (pathname === "/api/rooms") {
    await handleCreateRoom(request, response);
    return;
  }

  const [, roomCode, action] = pathname.match(ROOM_ACTION_PATH) || [];

  if (roomCode && isRoomAction(action)) {
    await handleRoomAction(request, response, action, roomCode);
    return;
  }

  sendJson(response, 404, { error: "Not found." });
});

server.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);

  if (!isSupabaseConfigured()) {
    console.warn("SUPABASE_URL and SUPABASE_SECRET_KEY are not set; room requests will fail.");
  }
});
