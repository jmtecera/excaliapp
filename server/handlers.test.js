import assert from "node:assert/strict";
import { Readable } from "node:stream";
import test from "node:test";

process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SECRET_KEY = "test-secret";
process.env.TURNSTILE_ENABLED = "false";

const { createRoomActionHandler, handleCreateRoom, isRoomAction } = await import("./handlers.js");

test("recognizes only supported room actions", () => {
  for (const action of ["authorize", "join", "pin", "sync", "timer"]) {
    assert.equal(isRoomAction(action), true);
  }

  assert.equal(isRoomAction("toString"), false);
  assert.equal(isRoomAction(undefined), false);
  assert.throws(() => createRoomActionHandler("delete"), /Unknown room action/);
});

test("rejects non-POST requests", async () => {
  const response = createResponse();
  await handleCreateRoom(createRequest({ method: "GET" }), response);

  assert.equal(response.statusCode, 405);
  assert.equal(response.headers.allow, "POST");
});

test("routes room actions with the code from the request path", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), payload: JSON.parse(String(init.body)).payload });
    return Response.json({ roomCode: "ABC-123", pomodoroStatus: "running" });
  };

  try {
    const handler = createRoomActionHandler("timer");
    const response = createResponse();
    await handler(
      createRequest({ query: { code: "abc-123" }, body: { action: "start", accessToken: "" } }),
      response,
    );

    assert.equal(response.statusCode, 200);
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/rpc\/update_excalidraw_room_timer$/);
    assert.equal(calls[0].payload.roomCode, "ABC-123");
    assert.equal(JSON.parse(response.body).pomodoroStatus, "running");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("returns generic validation errors as JSON", async () => {
  const handler = createRoomActionHandler("timer");
  const response = createResponse();
  await handler(
    createRequest({ query: { code: "nope" }, body: { action: "start", accessToken: "" } }),
    response,
  );

  assert.equal(response.statusCode, 400);
  assert.match(JSON.parse(response.body).error, /Room code/);
});

function createRequest({ method = "POST", query = {}, body } = {}) {
  const request = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  request.method = method;
  request.query = query;
  request.headers = { "content-type": "application/json" };
  return request;
}

function createResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    end(body) {
      this.body = body;
    },
  };
}
