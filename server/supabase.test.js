import assert from "node:assert/strict";
import test from "node:test";

process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SECRET_KEY = "test-secret";
process.env.TURNSTILE_ENABLED = "false";

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
  await assert.rejects(
    () =>
      api.createRoom({
        roomName: "Room",
        memberName: "Ada",
        clientId: "client_123",
        turnstileToken: { forged: true },
      }),
    /Human verification token/,
  );
});

test("blocks room creation when the durable rate limit is exhausted", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), payload: JSON.parse(String(init.body)).payload });
    return new Response(JSON.stringify({ allowed: false, retryAfterSeconds: 120 }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    await assert.rejects(
      () =>
        api.createRoom(
          {
            roomName: "Room",
            memberName: "Ada",
            clientId: "client_123",
            avatarHash: "0123456789abcdef0123456789abcdef",
            device: "desktop",
            turnstileToken: "token",
          },
          { headers: { "x-vercel-forwarded-for": "203.0.113.10" } },
        ),
      (error) => error.status === 429 && error.retryAfterSeconds === 120,
    );
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url.endsWith("/rest/v1/rpc/consume_excalidraw_room_creation_rate_limit"), true);
    assert.match(calls[0].payload.bucketKey, /^[a-f0-9]{64}$/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("keeps the Turnstile token out of the room creation RPC", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (url, init) => {
    const payload = JSON.parse(String(init.body)).payload;
    calls.push({ url: String(url), payload });
    const response = calls.length === 1 ? { allowed: true } : { roomId: "room-id", roomCode: "ABC-123" };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const result = await api.createRoom({
      roomName: "Room",
      memberName: "Ada",
      clientId: "client_123",
      avatarHash: "0123456789abcdef0123456789abcdef",
      device: "desktop",
      turnstileToken: "token",
    });

    assert.equal(result.roomCode, "ABC-123");
    assert.equal(calls.length, 2);
    assert.equal(calls[1].url.endsWith("/rest/v1/rpc/create_excalidraw_room"), true);
    assert.equal("turnstileToken" in calls[1].payload, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("validates Turnstile action and hostname before creating a room", async () => {
  const previousTurnstileEnabled = process.env.TURNSTILE_ENABLED;
  const previousTurnstileSecret = process.env.TURNSTILE_SECRET;
  const previousTurnstileHostnames = process.env.TURNSTILE_HOSTNAMES;
  const originalFetch = globalThis.fetch;
  const calls = [];

  process.env.TURNSTILE_ENABLED = "true";
  process.env.TURNSTILE_SECRET = "test-turnstile-secret";
  process.env.TURNSTILE_HOSTNAMES = "rooms.example.test";

  try {
    const securedApi = await import(`./supabase.js?turnstile-test=${Date.now()}`);

    globalThis.fetch = async (url, init) => {
      const requestUrl = String(url);
      const body = JSON.parse(String(init.body));
      calls.push({ url: requestUrl, body });

      const response = requestUrl.endsWith("consume_excalidraw_room_creation_rate_limit")
        ? { allowed: true }
        : requestUrl === "https://challenges.cloudflare.com/turnstile/v0/siteverify"
          ? { success: true, action: "create-room", hostname: "rooms.example.test" }
          : { roomId: "room-id", roomCode: "ABC-123" };

      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    const result = await securedApi.createRoom(
      {
        roomName: "Room",
        memberName: "Ada",
        clientId: "client_123",
        avatarHash: "0123456789abcdef0123456789abcdef",
        device: "desktop",
        turnstileToken: "verified-token",
      },
      { headers: { "cf-connecting-ip": "203.0.113.10" } },
    );

    assert.equal(result.roomCode, "ABC-123");
    assert.equal(calls.length, 3);
    assert.equal(calls[1].body.secret, "test-turnstile-secret");
    assert.equal(calls[1].body.response, "verified-token");
    assert.equal(calls[1].body.remoteip, "203.0.113.10");
  } finally {
    globalThis.fetch = originalFetch;
    process.env.TURNSTILE_ENABLED = previousTurnstileEnabled;

    if (previousTurnstileSecret === undefined) delete process.env.TURNSTILE_SECRET;
    else process.env.TURNSTILE_SECRET = previousTurnstileSecret;

    if (previousTurnstileHostnames === undefined) delete process.env.TURNSTILE_HOSTNAMES;
    else process.env.TURNSTILE_HOSTNAMES = previousTurnstileHostnames;
  }
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
