import {
  createRoom,
  getErrorResponse,
  readRequestBody,
  sendJson,
} from "../../server/supabase.js";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed." });
    return;
  }

  try {
    sendJson(response, 201, await createRoom(await readRequestBody(request)));
  } catch (error) {
    const result = getErrorResponse(error);
    sendJson(response, result.status, result.body);
  }
}
