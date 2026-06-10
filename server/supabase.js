const SUPABASE_URL = normalizeSupabaseUrl(process.env.SUPABASE_URL);
const SUPABASE_SERVER_KEY =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "";

export function isSupabaseConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_SERVER_KEY);
}

export async function createRoom(payload) {
  return callRpc("create_excalidraw_room", payload);
}

export async function syncRoom(roomCode, payload) {
  return callRpc("sync_excalidraw_room_with_timer", {
    ...payload,
    roomCode,
  });
}

export async function updateRoomTimer(roomCode, payload) {
  return callRpc("update_excalidraw_room_timer", {
    ...payload,
    roomCode,
  });
}

export async function authorizeRoom(roomCode, payload) {
  return callRpc("authorize_excalidraw_room", {
    ...payload,
    roomCode,
  });
}

export async function updateRoomPin(roomCode, payload) {
  return callRpc("update_excalidraw_room_pin", {
    ...payload,
    roomCode,
  });
}

export async function readRequestBody(request) {
  if (request.body && typeof request.body === "object") {
    return request.body;
  }

  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const rawBody = Buffer.concat(chunks).toString("utf8");
  return rawBody ? JSON.parse(rawBody) : {};
}

export function sendJson(response, status, body) {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

export function getErrorResponse(error) {
  const status = Number(error?.status) || 500;
  return {
    status: status >= 400 && status < 600 ? status : 500,
    body: {
      error: error instanceof Error ? error.message : "Server error",
    },
  };
}

async function callRpc(name, payload) {
  if (!isSupabaseConfigured()) {
    throw createHttpError(500, "Supabase server environment is not configured.");
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: buildSupabaseHeaders(),
    body: JSON.stringify({ payload }),
  });
  const rawResponse = await response.text();
  const data = parseJson(rawResponse);

  if (!response.ok) {
    const error = createHttpError(
      mapSupabaseStatus(response.status, data),
      getSupabaseErrorMessage(data),
    );
    error.details = data;
    throw error;
  }

  if (data === null) {
    throw createHttpError(404, "Room not found.");
  }

  return data;
}

function createHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function parseJson(value) {
  try {
    return value ? JSON.parse(value) : {};
  } catch {
    return { raw: value };
  }
}

function normalizeSupabaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/g, "");
}

function buildSupabaseHeaders() {
  const headers = {
    apikey: SUPABASE_SERVER_KEY,
    "content-type": "application/json",
  };

  if (!SUPABASE_SERVER_KEY.startsWith("sb_secret_")) {
    headers.authorization = `Bearer ${SUPABASE_SERVER_KEY}`;
  }

  return headers;
}

function getSupabaseErrorMessage(data) {
  if (data?.code === "PGRST202" || String(data?.message || "").includes("schema cache")) {
    return "The Excaliapp database migration is missing. Apply the Supabase migrations with `pnpm db:push`, then redeploy.";
  }

  return data?.message || data?.error || "Supabase request failed.";
}

function mapSupabaseStatus(status, data) {
  if (data?.code === "PGRST202") {
    return 503;
  }

  if (status === 401 || status === 403) {
    return 403;
  }

  if (status >= 400 && status < 500) {
    return 400;
  }

  return 502;
}
