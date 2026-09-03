import assert from "node:assert/strict";
import test from "node:test";

process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SECRET_KEY = "test-secret";

const api = await import(`./supabase.js?test=${Date.now()}`);

test("validates room codes and request payloads before calling Supabase", async () => {
  assert.equal(api.validateRoomCode("ab1-c2d"), "AB1-C2D");
  assert.throws(() => api.validateRoomCode("ABC-DEF!"), /Room code/);

  await assert.rejects(
    () => api.createRoom({ roomName: "Room", memberName: "", clientId: "client_123" }),
    /Participant name/,
  );
  await assert.rejects(
    () => api.updateRoomTimer("ABC-123", { action: "skip", accessToken: "" }),
    /Invalid timer action/,
  );
  await assert.rejects(
    () => api.updateRoomPin("ABC-123", { accessToken: "", pin: "12345" }),
    /PIN must be exactly 4 digits/,
  );
  await assert.rejects(
    () =>
      api.joinRoom("ABC-123", {
        accessToken: "",
        clientId: "client_123",
        memberName: "Ada",
        avatarHash: "not-a-hash",
        device: "desktop",
      }),
    /Avatar identifier/,
  );
});

test("uses the lightweight room join RPC without sending board data", async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl;
  let rpcPayload;

  globalThis.fetch = async (url, init) => {
    requestUrl = String(url);
    rpcPayload = JSON.parse(String(init.body)).payload;
    return new Response(
      JSON.stringify({ roomId: "047d9561-5a36-4c0b-a78f-67c24c99e067", roomCode: "ABC-123" }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  try {
    await api.joinRoom("abc-123", {
      accessToken: "",
      clientId: "client_123",
      memberName: "Ada",
      avatarHash: "0123456789abcdef0123456789abcdef",
      device: "desktop",
    });

    assert.equal(requestUrl.endsWith("/rest/v1/rpc/join_excalidraw_room"), true);
    assert.equal(rpcPayload.roomCode, "ABC-123");
    assert.equal(rpcPayload.avatarHash, "0123456789abcdef0123456789abcdef");
    assert.equal("boards" in rpcPayload, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("sanitizes shared member data and discards unrecognized sync fields", async () => {
  const originalFetch = globalThis.fetch;
  let rpcPayload;
  const now = Date.now();

  globalThis.fetch = async (_url, init) => {
    rpcPayload = JSON.parse(String(init.body)).payload;
    return new Response(
      JSON.stringify({
        roomId: "047d9561-5a36-4c0b-a78f-67c24c99e067",
        roomCode: "ABC-123",
        members: [
          {
            clientId: "client_123",
            name: "Ada",
            email: "ada@example.com",
            avatarHash: "0123456789abcdef0123456789abcdef",
            device: "desktop",
          },
        ],
        internalDebugValue: "do-not-return",
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  try {
    const result = await api.syncRoom("abc-123", {
      roomName: "Room",
      roomNameUpdatedAt: 0,
      accessToken: "",
      clientId: "client_123",
      memberName: "Ada",
      avatarHash: "0123456789abcdef0123456789abcdef",
      memberEmail: "ada@example.com",
      device: "desktop",
      boards: [
        {
          id: "12e20b66-bffa-41ea-a65e-c587582f2ca6",
          name: "Plan",
          excalidrawUrl: "https://excalidraw.com/#room=abc123,abcdefghijklmnopqrstuv",
          archived: false,
          createdAt: now,
          updatedAt: now,
          lastOpenedAt: now,
        },
      ],
    });

    assert.equal(rpcPayload.roomCode, "ABC-123");
    assert.equal("memberEmail" in rpcPayload, false);
    assert.equal(rpcPayload.avatarHash, "0123456789abcdef0123456789abcdef");
    assert.equal("email" in result.members[0], false);
    assert.equal(result.members[0].avatarHash, "0123456789abcdef0123456789abcdef");
    assert.equal("internalDebugValue" in result, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("returns a throttling error when PIN attempts are blocked", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({ authorizationFailed: true, retryAfterSeconds: 120 }),
      { status: 200, headers: { "content-type": "application/json" } },
    );

  try {
    await assert.rejects(
      () =>
        api.authorizeRoom(
          "ABC-123",
          { pin: "1234" },
          { headers: { "x-forwarded-for": "203.0.113.10" } },
        ),
      (error) => error.status === 429 && error.retryAfterSeconds === 120,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
