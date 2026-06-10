import {
  getErrorResponse,
  readRequestBody,
  sendJson,
  updateRoomPin,
} from "../../../server/supabase.js";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed." });
    return;
  }

  try {
    const code = String(request.query?.code || "").toUpperCase();
    sendJson(response, 200, await updateRoomPin(code, await readRequestBody(request)));
  } catch (error) {
    const result = getErrorResponse(error);
    sendJson(response, result.status, result.body);
  }
}
