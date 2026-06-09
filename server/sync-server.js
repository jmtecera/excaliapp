#!/usr/bin/env node

import { createServer } from "node:http";

const PORT = Number.parseInt(process.env.PORT || "8787", 10);
const SUPABASE_URL = normalizeSupabaseUrl(process.env.SUPABASE_URL);
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "";
const RPC_NAME = "sync_excalidraw_workspace";

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
        ok: isConfigured(),
        storage: "supabase-postgres",
        configured: isConfigured(),
      });
      return;
    }

    const syncMatch = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/sync$/);

    if (request.method === "POST" && syncMatch) {
      await handleSync(request, response, syncMatch[1]);
      return;
    }

    sendJson(response, 404, { error: "Not found" });
  } catch (error) {
    sendJson(response, 500, { error: error.message || "Server error" });
  }
});

server.listen(PORT, () => {
  console.log(`Excalidraw Room Manager sync server listening on http://localhost:${PORT}`);
  console.log(`Storage: ${isConfigured() ? "Supabase Postgres" : "missing Supabase environment"}`);
});

async function handleSync(request, response, workspaceId) {
  if (!isConfigured()) {
    sendJson(response, 500, {
      error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.",
    });
    return;
  }

  const body = await readJson(request);
  const payload = {
    ...body,
    workspaceId,
  };

  const rpcResponse = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${RPC_NAME}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ payload }),
  });

  const rawResponse = await rpcResponse.text();
  const data = parseJsonOrFallback(rawResponse);

  if (!rpcResponse.ok) {
    sendJson(response, mapSupabaseStatus(rpcResponse.status), {
      error: data?.message || data?.error || "Supabase sync failed",
      details: data,
    });
    return;
  }

  sendJson(response, 200, data);
}

async function readJson(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const rawBody = Buffer.concat(chunks).toString("utf8");
  return rawBody ? JSON.parse(rawBody) : {};
}

function parseJsonOrFallback(value) {
  try {
    return value ? JSON.parse(value) : {};
  } catch {
    return { raw: value };
  }
}

function isConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

function normalizeSupabaseUrl(url) {
  return String(url || "").trim().replace(/\/+$/g, "");
}

function mapSupabaseStatus(status) {
  if (status === 401 || status === 403) {
    return 403;
  }

  if (status >= 400 && status < 500) {
    return 400;
  }

  return 502;
}

function setCorsHeaders(response) {
  response.setHeader("access-control-allow-origin", "*");
  response.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  response.setHeader("access-control-allow-headers", "content-type");
}

function sendJson(response, status, body) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}
