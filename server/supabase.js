import { createHmac } from "node:crypto";

const SUPABASE_URL = normalizeSupabaseUrl(process.env.SUPABASE_URL);
const SUPABASE_SERVER_KEY =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "";
const MAX_REQUEST_BYTES = 512 * 1024;
const MAX_BOARDS_PER_SYNC = 250;
const ROOM_CODE_PATTERN = /^[A-Z0-9]{3}-[A-Z0-9]{3}$/;
const ACCESS_TOKEN_PATTERN = /^[a-f0-9]{64}$/;
const CLIENT_ID_PATTERN = /^[A-Za-z0-9_-]{8,100}$/;
const AVATAR_HASH_PATTERN = /^[a-f0-9]{32}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EXCALIDRAW_ROOM_HASH_PATTERN = /^#room=[A-Za-z0-9_-]+,[A-Za-z0-9_-]{22}$/;
const TIMER_ACTIONS = new Set(["start", "pause", "reset", "reset-total", "set-duration"]);
const DEVICES = new Set(["desktop", "tablet", "mobile"]);

export function isSupabaseConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_SERVER_KEY);
}

export async function createRoom(payload) {
  return callRpc("create_excalidraw_room", validateCreatePayload(payload));
}

export async function syncRoom(roomCode, payload) {
  return callRpc("sync_excalidraw_room_with_timer", {
    ...validateSyncPayload(payload),
    roomCode: validateRoomCode(roomCode),
  });
}

export async function joinRoom(roomCode, payload) {
  return callRpc("join_excalidraw_room", {
    ...validateJoinPayload(payload),
    roomCode: validateRoomCode(roomCode),
  });
}

export async function updateRoomTimer(roomCode, payload) {
  return callRpc("update_excalidraw_room_timer", {
    ...validateTimerPayload(payload),
    roomCode: validateRoomCode(roomCode),
  });
}

export async function authorizeRoom(roomCode, payload, request) {
  const result = await callRpc("authorize_excalidraw_room", {
    ...validateAuthorizePayload(payload),
    roomCode: validateRoomCode(roomCode),
    attemptKey: createRequestFingerprint(request),
  });

  if (result?.authorizationFailed) {
    const retryAfterSeconds = toPositiveInteger(result.retryAfterSeconds);
    const error = createHttpError(
      retryAfterSeconds ? 429 : 401,
      retryAfterSeconds
        ? "Too many PIN attempts. Try again later."
        : "Invalid room PIN.",
    );
    error.retryAfterSeconds = retryAfterSeconds;
    throw error;
  }

  return result;
}

export async function updateRoomPin(roomCode, payload) {
  return callRpc("update_excalidraw_room_pin", {
    ...validatePinUpdatePayload(payload),
    roomCode: validateRoomCode(roomCode),
  });
}

export async function readRequestBody(request) {
  const contentType = String(request.headers?.["content-type"] || "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();

  if (contentType && contentType !== "application/json") {
    throw createHttpError(415, "Content-Type must be application/json.");
  }

  if (request.body !== undefined && request.body !== null) {
    if (typeof request.body === "string" || Buffer.isBuffer(request.body)) {
      return parseRequestJson(request.body);
    }

    assertBodySize(JSON.stringify(request.body));
    return requireObject(request.body);
  }

  const chunks = [];
  let byteLength = 0;

  for await (const chunk of request) {
    byteLength += chunk.length;

    if (byteLength > MAX_REQUEST_BYTES) {
      throw createHttpError(413, "Request body is too large.");
    }

    chunks.push(chunk);
  }

  const rawBody = Buffer.concat(chunks).toString("utf8");
  return rawBody ? parseRequestJson(rawBody) : {};
}

export function sendJson(response, status, body) {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.setHeader("x-content-type-options", "nosniff");

  if (status === 405) {
    response.setHeader("allow", "POST");
  }

  if (status === 429 && Number(body?.retryAfterSeconds) > 0) {
    response.setHeader("retry-after", String(body.retryAfterSeconds));
  }

  response.end(JSON.stringify(body));
}

export function getErrorResponse(error) {
  const status = normalizeStatus(error?.status);
  const body = {
    error:
      error?.expose === true && typeof error.message === "string"
        ? error.message
        : "The request could not be completed.",
  };
  const retryAfterSeconds = toPositiveInteger(error?.retryAfterSeconds);

  if (status === 429 && retryAfterSeconds) {
    body.retryAfterSeconds = retryAfterSeconds;
  }

  return { status, body };
}

export function validateRoomCode(value) {
  const roomCode = String(value || "").trim().toUpperCase();

  if (!ROOM_CODE_PATTERN.test(roomCode)) {
    throw createHttpError(400, "Room code must use the format ABC-123.");
  }

  return roomCode;
}

function validateCreatePayload(payload) {
  const body = requireObject(payload);
  return {
    roomName: optionalTrimmedString(body.roomName, 80) || "Untitled room",
    memberName: requiredTrimmedString(body.memberName, 60, "Participant name"),
    avatarHash: validateAvatarHash(body.avatarHash),
    clientId: validateClientId(body.clientId),
    device: validateDevice(body.device),
  };
}

function validateSyncPayload(payload) {
  const body = requireObject(payload);
  const roomName = optionalTrimmedString(body.roomName, 80);
  const roomNameUpdatedAt = validateTimestamp(body.roomNameUpdatedAt, {
    allowZero: true,
    field: "Room name timestamp",
  });
  const boards = body.boards === undefined ? [] : body.boards;

  if (!Array.isArray(boards) || boards.length > MAX_BOARDS_PER_SYNC) {
    throw createHttpError(
      400,
      `Boards must be an array with at most ${MAX_BOARDS_PER_SYNC} entries.`,
    );
  }

  return {
    roomName,
    roomNameUpdatedAt,
    accessToken: validateAccessToken(body.accessToken),
    clientId: validateClientId(body.clientId),
    memberName: requiredTrimmedString(body.memberName, 60, "Participant name"),
    avatarHash: validateAvatarHash(body.avatarHash),
    device: validateDevice(body.device),
    boards: boards.map(validateBoard),
  };
}

function validateJoinPayload(payload) {
  const body = requireObject(payload);
  return {
    accessToken: validateAccessToken(body.accessToken),
    clientId: validateClientId(body.clientId),
    memberName: requiredTrimmedString(body.memberName, 60, "Participant name"),
    avatarHash: validateAvatarHash(body.avatarHash),
    device: validateDevice(body.device),
  };
}

function validateAuthorizePayload(payload) {
  const body = requireObject(payload);
  const pin = String(body.pin || "").trim();

  if (!/^[0-9]{4}$/.test(pin)) {
    throw createHttpError(400, "PIN must be exactly 4 digits.");
  }

  return { pin };
}

function validatePinUpdatePayload(payload) {
  const body = requireObject(payload);
  const pin = body.pin;

  if (pin !== null && !/^[0-9]{4}$/.test(String(pin || ""))) {
    throw createHttpError(400, "PIN must be exactly 4 digits.");
  }

  return {
    accessToken: validateAccessToken(body.accessToken),
    pin,
  };
}

function validateTimerPayload(payload) {
  const body = requireObject(payload);
  const action = String(body.action || "").trim().toLowerCase();

  if (!TIMER_ACTIONS.has(action)) {
    throw createHttpError(400, "Invalid timer action.");
  }

  const result = {
    accessToken: validateAccessToken(body.accessToken),
    action,
  };

  if (action === "set-duration") {
    const durationMinutes = Number(body.durationMinutes);

    if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 120) {
      throw createHttpError(400, "Timer duration must be between 1 and 120 minutes.");
    }

    result.durationMinutes = durationMinutes;
  }

  return result;
}

function validateBoard(value) {
  const board = requireObject(value);
  const excalidrawUrl = validateExcalidrawUrl(board.excalidrawUrl);

  if (typeof board.archived !== "boolean") {
    throw createHttpError(400, "Board archived state must be a boolean.");
  }

  return {
    id: validateUuid(board.id, "Board id"),
    name: requiredTrimmedString(board.name, 80, "Board name"),
    excalidrawUrl,
    archived: board.archived,
    createdAt: validateTimestamp(board.createdAt, { field: "Board creation timestamp" }),
    updatedAt: validateTimestamp(board.updatedAt, { field: "Board update timestamp" }),
    lastOpenedAt: validateTimestamp(board.lastOpenedAt, { field: "Board open timestamp" }),
  };
}

function validateExcalidrawUrl(value) {
  const rawValue = requiredTrimmedString(value, 300, "Excalidraw URL");

  try {
    const url = new URL(rawValue);

    if (
      url.origin !== "https://excalidraw.com" ||
      url.pathname !== "/" ||
      url.search ||
      !EXCALIDRAW_ROOM_HASH_PATTERN.test(url.hash)
    ) {
      throw new Error();
    }

    return url.toString();
  } catch {
    throw createHttpError(400, "Board URL must be a valid Excalidraw collaboration link.");
  }
}

function validateAccessToken(value) {
  const accessToken = String(value || "").trim().toLowerCase();

  if (accessToken && !ACCESS_TOKEN_PATTERN.test(accessToken)) {
    throw createHttpError(400, "Room access token is invalid.");
  }

  return accessToken;
}

function validateAvatarHash(value) {
  const avatarHash = String(value || "").trim().toLowerCase();

  if (avatarHash && !AVATAR_HASH_PATTERN.test(avatarHash)) {
    throw createHttpError(400, "Avatar identifier is invalid.");
  }

  return avatarHash;
}

function validateClientId(value) {
  const clientId = String(value || "").trim();

  if (!CLIENT_ID_PATTERN.test(clientId)) {
    throw createHttpError(400, "Client id is invalid.");
  }

  return clientId;
}

function validateDevice(value) {
  const device = String(value || "desktop").trim().toLowerCase();

  if (!DEVICES.has(device)) {
    throw createHttpError(400, "Device type is invalid.");
  }

  return device;
}

function validateUuid(value, field) {
  const result = String(value || "").trim();

  if (!UUID_PATTERN.test(result)) {
    throw createHttpError(400, `${field} is invalid.`);
  }

  return result;
}

function validateTimestamp(value, { allowZero = false, field }) {
  const timestamp = Number(value);
  const minimum = allowZero ? 0 : 1;

  if (
    !Number.isFinite(timestamp) ||
    !Number.isInteger(timestamp) ||
    timestamp < minimum ||
    timestamp > Date.now() + 5 * 60 * 1000
  ) {
    throw createHttpError(400, `${field} is invalid.`);
  }

  return timestamp;
}

function requiredTrimmedString(value, maxLength, field) {
  const result = String(value || "").trim();

  if (!result || result.length > maxLength) {
    throw createHttpError(400, `${field} is required and must be at most ${maxLength} characters.`);
  }

  return result;
}

function optionalTrimmedString(value, maxLength) {
  const result = String(value || "").trim();

  if (result.length > maxLength) {
    throw createHttpError(400, `Text fields must be at most ${maxLength} characters.`);
  }

  return result;
}

function requireObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw createHttpError(400, "Request body must be a JSON object.");
  }

  return value;
}

function parseRequestJson(value) {
  const text = Buffer.isBuffer(value) ? value.toString("utf8") : String(value);
  assertBodySize(text);

  try {
    return requireObject(text ? JSON.parse(text) : {});
  } catch (error) {
    if (error?.status) {
      throw error;
    }

    throw createHttpError(400, "Request body must contain valid JSON.");
  }
}

function assertBodySize(value) {
  if (Buffer.byteLength(value, "utf8") > MAX_REQUEST_BYTES) {
    throw createHttpError(413, "Request body is too large.");
  }
}

async function callRpc(name, payload) {
  if (!isSupabaseConfigured()) {
    throw createHttpError(503, "The data service is not configured.");
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: buildSupabaseHeaders(),
    body: JSON.stringify({ payload }),
  });
  const rawResponse = await response.text();
  const data = parseJson(rawResponse);

  if (!response.ok) {
    throw mapSupabaseError(response.status, data);
  }

  if (data === null) {
    throw createHttpError(404, "Room not found.");
  }

  return sanitizeRpcResponse(name, data);
}

function sanitizeRpcResponse(name, data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return data;
  }

  if (name === "authorize_excalidraw_room") {
    return pickDefined(data, [
      "accessToken",
      "pinEnabled",
      "authorizationFailed",
      "retryAfterSeconds",
    ]);
  }

  if (name === "update_excalidraw_room_pin") {
    return pickDefined(data, ["accessToken", "pinEnabled", "pinRequired"]);
  }

  if (name === "update_excalidraw_room_timer") {
    return pickDefined(data, [
      "roomCode",
      "pinEnabled",
      "pinRequired",
      "pomodoroStatus",
      "pomodoroDurationSeconds",
      "pomodoroEndsAt",
      "pomodoroStartedAt",
      "pomodoroRemainingSeconds",
      "pomodoroAccumulatedSeconds",
      "pomodoroUpdatedAt",
    ]);
  }

  const result = pickDefined(data, [
    "roomId",
    "roomCode",
    "roomName",
    "roomNameUpdatedAt",
    "pinEnabled",
    "pinRequired",
    "pomodoroStatus",
    "pomodoroDurationSeconds",
    "pomodoroEndsAt",
    "pomodoroStartedAt",
    "pomodoroRemainingSeconds",
    "pomodoroAccumulatedSeconds",
    "pomodoroUpdatedAt",
  ]);
  result.boards = Array.isArray(data.boards)
    ? data.boards.map((board) =>
        pickDefined(board, [
          "id",
          "name",
          "excalidrawUrl",
          "archived",
          "createdAt",
          "updatedAt",
          "lastOpenedAt",
        ]),
      )
    : [];
  result.members = Array.isArray(data.members)
    ? data.members.map((member) =>
        pickDefined(member, ["clientId", "name", "avatarHash", "device", "lastSeenAt"]),
      )
    : [];
  return result;
}

function mapSupabaseError(status, data) {
  const message = String(data?.message || data?.error || "");

  if (data?.code === "PGRST202" || message.includes("schema cache")) {
    return createHttpError(503, "The data service is not ready.");
  }

  if (message.includes("Room authorization has expired")) {
    return createHttpError(401, "Room authorization has expired. Enter the PIN again.");
  }

  if (message.includes("PIN must be exactly 4 digits")) {
    return createHttpError(400, "PIN must be exactly 4 digits.");
  }

  if (message.includes("Incorrect room PIN")) {
    return createHttpError(401, "Invalid room PIN.");
  }

  if (message.includes("Timer duration") || message.includes("Timer action")) {
    return createHttpError(400, "Invalid timer request.");
  }

  if (status === 401 || status === 403) {
    return createHttpError(403, "The data service rejected the request.");
  }

  return createHttpError(status >= 400 && status < 500 ? 400 : 502, "Invalid request data.");
}

function createRequestFingerprint(request) {
  const forwardedFor = String(
    request?.headers?.["x-vercel-forwarded-for"] ||
      request?.headers?.["x-forwarded-for"] ||
      request?.headers?.["x-real-ip"] ||
      "",
  )
    .split(",", 1)[0]
    .trim();
  const address = forwardedFor || request?.socket?.remoteAddress || "unknown";
  const secret = SUPABASE_SERVER_KEY || "excaliapp-development-rate-limit";
  return createHmac("sha256", secret).update(address).digest("hex");
}

function pickDefined(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    keys
      .filter((key) => value[key] !== undefined)
      .map((key) => [key, value[key]]),
  );
}

function createHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  error.expose = true;
  return error;
}

function parseJson(value) {
  try {
    return value ? JSON.parse(value) : {};
  } catch {
    return {};
  }
}

function normalizeSupabaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/g, "");
}

function normalizeStatus(value) {
  const status = Number(value);
  return Number.isInteger(status) && status >= 400 && status < 600 ? status : 500;
}

function toPositiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : 0;
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
