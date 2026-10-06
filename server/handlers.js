import {
  authorizeRoom,
  createRoom,
  getErrorResponse,
  joinRoom,
  readRequestBody,
  sendJson,
  syncRoom,
  updateRoomPin,
  updateRoomTimer,
} from "./supabase.js";

const ROOM_ACTIONS = {
  authorize: authorizeRoom,
  join: joinRoom,
  pin: updateRoomPin,
  sync: syncRoom,
  timer: updateRoomTimer,
};

export function isRoomAction(name) {
  return Object.hasOwn(ROOM_ACTIONS, name);
}

export function handleCreateRoom(request, response) {
  return respond(request, response, 201, async () =>
    createRoom(await readRequestBody(request), request),
  );
}

export function handleRoomAction(request, response, action, roomCode) {
  return respond(request, response, 200, async () =>
    ROOM_ACTIONS[action](roomCode, await readRequestBody(request), request),
  );
}

/** Builds a Vercel Function for `/api/rooms/[code]/<action>`. */
export function createRoomActionHandler(action) {
  if (!isRoomAction(action)) {
    throw new Error(`Unknown room action: ${action}`);
  }

  return (request, response) =>
    handleRoomAction(request, response, action, request.query?.code);
}

async function respond(request, response, status, run) {
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed." });
    return;
  }

  try {
    sendJson(response, status, await run());
  } catch (error) {
    const result = getErrorResponse(error);
    sendJson(response, result.status, result.body);
  }
}
