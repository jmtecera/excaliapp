#!/usr/bin/env node

import { createServer } from "node:http";
import {
  authorizeRoom,
  createRoom,
  getErrorResponse,
  joinRoom,
  isSupabaseConfigured,
  readRequestBody,
  sendJson,
  syncRoom,
  updateRoomPin,
  updateRoomTimer,
} from "./supabase.js";

const PORT = Number.parseInt(process.env.PORT || "8787", 10);

const server = createServer(async (request, response) => {
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

    const syncMatch = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]{3}-[A-Z0-9]{3})\/sync$/i);
    const joinMatch = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]{3}-[A-Z0-9]{3})\/join$/i);

    if (request.method === "POST" && joinMatch?.[1]) {
      sendJson(response, 200, await joinRoom(joinMatch[1].toUpperCase(), await readRequestBody(request)));
      return;
    }

    const authorizeMatch = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]{3}-[A-Z0-9]{3})\/authorize$/i);
    const pinMatch = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]{3}-[A-Z0-9]{3})\/pin$/i);
    const timerMatch = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]{3}-[A-Z0-9]{3})\/timer$/i);

    if (request.method === "POST" && syncMatch?.[1]) {
      sendJson(response, 200, await syncRoom(syncMatch[1].toUpperCase(), await readRequestBody(request)));
      return;
    }

    if (request.method === "POST" && authorizeMatch?.[1]) {
      sendJson(
        response,
        200,
        await authorizeRoom(
          authorizeMatch[1].toUpperCase(),
          await readRequestBody(request),
          request,
        ),
      );
      return;
    }

    if (request.method === "POST" && pinMatch?.[1]) {
      sendJson(
        response,
        200,
        await updateRoomPin(pinMatch[1].toUpperCase(), await readRequestBody(request)),
      );
      return;
    }

    if (request.method === "POST" && timerMatch?.[1]) {
      sendJson(
        response,
        200,
        await updateRoomTimer(timerMatch[1].toUpperCase(), await readRequestBody(request)),
      );
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
