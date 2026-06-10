import { randomHex } from "./encoding";
import { text } from "./i18n";
import type { RoomData, RoomRecord } from "./types";

const EXCALIDRAW_ORIGIN = "https://excalidraw.com";
const ROOM_ID_BYTES = 10;
const ROOM_HASH_PATTERN = /^#room=([a-zA-Z0-9_-]+),([a-zA-Z0-9_-]+)$/;
const ROOM_CODE_PATTERN = /^XR-([a-zA-Z0-9_-]+)\.([a-zA-Z0-9_-]+)$/i;
const ROOM_PAIR_PATTERN = /^([a-zA-Z0-9_-]+),([a-zA-Z0-9_-]+)$/;

export function buildCollaborationUrl({ roomId, roomKey }: RoomData): string {
  assertRoomData({ roomId, roomKey });
  return `${EXCALIDRAW_ORIGIN}/#room=${roomId},${roomKey}`;
}

export async function generateCollaborationLinkData(): Promise<RoomData> {
  const roomId = randomHex(ROOM_ID_BYTES);
  const cryptoKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 128 },
    true,
    ["encrypt", "decrypt"],
  );
  const jwk = await crypto.subtle.exportKey("jwk", cryptoKey);

  if (!jwk.k || jwk.k.length !== 22) {
    throw new Error(text.error.boardKey);
  }

  return { roomId, roomKey: jwk.k };
}

export function parseCollaborationInput(input: string): RoomData {
  const value = String(input || "").trim();

  if (!value) {
    throw new Error(text.error.boardLinkRequired);
  }

  const parsed =
    parseFullUrl(value) ||
    parseHash(value) ||
    parsePrefixedRoom(value) ||
    parseInviteCode(value) ||
    parseRoomPair(value);

  if (!parsed) {
    throw new Error(text.error.invalidBoardLink);
  }

  assertRoomData(parsed);
  return parsed;
}

export function createRoomRecord({
  name,
  roomId,
  roomKey,
  archived = false,
  createdAt = Date.now(),
  updatedAt = createdAt,
  lastOpenedAt = createdAt,
}: RoomData & {
  name?: string;
  archived?: boolean;
  createdAt?: number;
  updatedAt?: number;
  lastOpenedAt?: number;
}): RoomRecord {
  assertRoomData({ roomId, roomKey });

  return {
    id: crypto.randomUUID(),
    roomId,
    roomKey,
    name: normalizeBoardName(name, createdAt),
    excalidrawUrl: buildCollaborationUrl({ roomId, roomKey }),
    archived,
    createdAt,
    updatedAt,
    lastOpenedAt,
  };
}

export function createRoomRecordFromUrl({
  name,
  url,
  archived = false,
  createdAt = Date.now(),
}: {
  name?: string;
  url: string;
  archived?: boolean;
  createdAt?: number;
}): RoomRecord {
  return createRoomRecord({
    ...parseCollaborationInput(url),
    name,
    archived,
    createdAt,
    updatedAt: createdAt,
  });
}

export function normalizeRoomRecord(room: unknown): RoomRecord | null {
  if (!room || typeof room !== "object") {
    return null;
  }

  const candidate = room as Partial<RoomRecord> & {
    title?: string;
    url?: string;
    status?: string;
  };
  const now = Date.now();
  const parsedUrl =
    typeof candidate.excalidrawUrl === "string" || typeof candidate.url === "string"
      ? safeParseCollaborationInput(candidate.excalidrawUrl || candidate.url || "")
      : null;
  const roomId = typeof candidate.roomId === "string" ? candidate.roomId : parsedUrl?.roomId || "";
  const roomKey = typeof candidate.roomKey === "string" ? candidate.roomKey : parsedUrl?.roomKey || "";

  if (!isValidRoomData({ roomId, roomKey })) {
    return null;
  }

  const createdAt = toTimestamp(candidate.createdAt, now);
  const updatedAt = toTimestamp(candidate.updatedAt, createdAt);
  const lastOpenedAt = toTimestamp(candidate.lastOpenedAt, updatedAt);

  return {
    id: typeof candidate.id === "string" && candidate.id ? candidate.id : crypto.randomUUID(),
    roomId,
    roomKey,
    name: normalizeBoardName(candidate.name || candidate.title, createdAt),
    excalidrawUrl: buildCollaborationUrl({ roomId, roomKey }),
    archived: typeof candidate.archived === "boolean" ? candidate.archived : candidate.status === "inactive",
    createdAt,
    updatedAt,
    lastOpenedAt,
  };
}

export function sortRooms(rooms: RoomRecord[]): RoomRecord[] {
  return [...rooms].sort((left, right) => {
    if (right.lastOpenedAt !== left.lastOpenedAt) {
      return right.lastOpenedAt - left.lastOpenedAt;
    }

    if (right.updatedAt !== left.updatedAt) {
      return right.updatedAt - left.updatedAt;
    }

    return left.name.localeCompare(right.name);
  });
}

export function mergeRoomRecordLists(localRooms: RoomRecord[], remoteRooms: unknown[]): RoomRecord[] {
  const byId = new Map<string, RoomRecord>();

  for (const room of [...localRooms, ...remoteRooms].map(normalizeRoomRecord).filter(Boolean) as RoomRecord[]) {
    const existingRoom = byId.get(room.id);

    if (
      !existingRoom ||
      room.updatedAt > existingRoom.updatedAt ||
      room.lastOpenedAt > existingRoom.lastOpenedAt
    ) {
      byId.set(room.id, room);
    }
  }

  return sortRooms([...byId.values()]);
}

export function normalizeBoardName(name: unknown, timestamp = Date.now()): string {
  const value = String(name || "").trim();
  return value ? value.slice(0, 80) : `Board ${new Date(timestamp).toLocaleDateString()}`;
}

function assertRoomData(data: RoomData): void {
  if (!isValidRoomData(data)) {
    throw new Error(text.error.invalidBoardData);
  }
}

function isValidRoomData({ roomId, roomKey }: RoomData): boolean {
  return (
    typeof roomId === "string" &&
    /^[a-zA-Z0-9_-]+$/.test(roomId) &&
    typeof roomKey === "string" &&
    /^[a-zA-Z0-9_-]+$/.test(roomKey) &&
    roomKey.length === 22
  );
}

function safeParseCollaborationInput(input: string): RoomData | null {
  try {
    return parseCollaborationInput(input);
  } catch {
    return null;
  }
}

function parseFullUrl(value: string): RoomData | null {
  try {
    const url = new URL(value);
    return url.origin === EXCALIDRAW_ORIGIN ? parseHash(url.hash) : null;
  } catch {
    return null;
  }
}

function parseHash(value: string): RoomData | null {
  const match = value.match(ROOM_HASH_PATTERN);
  return match ? { roomId: match[1] || "", roomKey: match[2] || "" } : null;
}

function parsePrefixedRoom(value: string): RoomData | null {
  return value.startsWith("room=") ? parseHash(`#${value}`) : null;
}

function parseInviteCode(value: string): RoomData | null {
  const match = value.match(ROOM_CODE_PATTERN);
  return match ? { roomId: match[1] || "", roomKey: match[2] || "" } : null;
}

function parseRoomPair(value: string): RoomData | null {
  const match = value.match(ROOM_PAIR_PATTERN);
  return match ? { roomId: match[1] || "", roomKey: match[2] || "" } : null;
}

function toTimestamp(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}
