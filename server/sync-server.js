#!/usr/bin/env node

import { createServer } from "node:http";
import {
  createRoom,
  getErrorResponse,
  isSupabaseConfigured,
  readRequestBody,
  sendJson,
  syncRoom,
} from "./supabase.js";

const PORT = Number.parseInt(process.env.PORT || "8787", 10);

const server = createServer(async (request, response) => {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

    if (request.method === "GET" && url.pathname === "/api/health") {
      sendJson(response, 200, {
        ok: isSupabaseConfigured(),
        storage: "supabase-postgres",
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/rooms") {
      sendJson(response, 201, await createRoom(await readRequestBody(request)));
      return;
    }

    const syncMatch = url.pathname.match(/^\/api\/rooms\/([A-Z]{3}-[A-Z]{3})\/sync$/i);

    if (request.method === "POST" && syncMatch?.[1]) {
      sendJson(response, 200, await syncRoom(syncMatch[1].toUpperCase(), await readRequestBody(request)));
      return;
    }

    sendJson(response, 404, { error: "Not found." });
  } catch (error) {
    const result = getErrorResponse(error);
    sendJson(response, result.status, result.body);
  }
});

server.listen(PORT, () => {
  console.log(`Excaliapp Rooms API listening on http://localhost:${PORT}`);
  console.log(`Storage: ${isSupabaseConfigured() ? "Supabase Postgres" : "missing Supabase environment"}`);
});

function setCorsHeaders(response) {
  response.setHeader("access-control-allow-origin", "*");
  response.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  response.setHeader("access-control-allow-headers", "content-type");
}
