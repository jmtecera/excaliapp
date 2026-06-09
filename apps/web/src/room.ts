import { randomHex } from "./encoding";
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
    throw new Error("Could not generate a valid Excalidraw room key.");
  }

  return { roomId, roomKey: jwk.k };
}

export function parseCollaborationInput(input: string): RoomData {
  const value = String(input || "").trim();

  if (!value) {
    throw new Error("Paste an Excalidraw board link.");
  }

  const parsed =
    parseFullUrl(value) ||
    parseHash(value) ||
    parsePrefixedRoom(value) ||
    parseInviteCode(value) ||
    parseRoomPair(value);

  if (!parsed) {
    throw new Error("That does not look like a valid Excalidraw room.");
  }

  assertRoomData(parsed);
  return parsed;
}

export function createRoomRecord({
  title,
  roomId,
  roomKey,
  status = "active",
  now = Date.now(),
}: RoomData & {
  title?: string;
  status?: RoomRecord["status"];
  now?: number;
}): RoomRecord {
  assertRoomData({ roomId, roomKey });

  return {
    id: `${roomId}:${roomKey}`,
    roomId,
    roomKey,
    title: normalizeTitle(title, now),
    status,
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
    deletedAt: null,
    url: buildCollaborationUrl({ roomId, roomKey }),
  };
}

export function normalizeRoomRecord(room: unknown): RoomRecord | null {
  if (!room || typeof room !== "object") {
    return null;
  }

  const candidate = room as Partial<RoomRecord>;
  const now = Date.now();
  const roomId = typeof candidate.roomId === "string" ? candidate.roomId : "";
  const roomKey = typeof candidate.roomKey === "string" ? candidate.roomKey : "";

  if (!isValidRoomData({ roomId, roomKey })) {
    return null;
  }

  const createdAt = toTimestamp(candidate.createdAt, now);
  const updatedAt = toTimestamp(candidate.updatedAt, createdAt);
  const lastOpenedAt = toTimestamp(candidate.lastOpenedAt, updatedAt);
  const deletedAt = toNullableTimestamp(candidate.deletedAt);
  const status = candidate.status === "inactive" ? "inactive" : "active";

  return {
    id: typeof candidate.id === "string" && candidate.id ? candidate.id : `${roomId}:${roomKey}`,
    roomId,
    roomKey,
    title: normalizeTitle(candidate.title, createdAt),
    status,
    createdAt,
    updatedAt,
    lastOpenedAt,
    deletedAt,
    url: buildCollaborationUrl({ roomId, roomKey }),
  };
}

export function sortRooms(rooms: RoomRecord[]): RoomRecord[] {
  return [...rooms].sort((left, right) => {
    const leftTime = left.lastOpenedAt || left.updatedAt || left.createdAt || 0;
    const rightTime = right.lastOpenedAt || right.updatedAt || right.createdAt || 0;

    if (rightTime !== leftTime) {
      return rightTime - leftTime;
    }

    return left.title.localeCompare(right.title);
  });
}

export function isSameRoom(left: RoomData, right: RoomData): boolean {
  return left.roomId === right.roomId && left.roomKey === right.roomKey;
}

export function archiveOtherRooms(rooms: RoomRecord[], activeId: string, now = Date.now()): RoomRecord[] {
  return sortRooms(
    rooms.map((room) => {
      if (room.deletedAt || room.id === activeId || room.status !== "active") {
        return room;
      }

      return {
        ...room,
        status: "inactive",
        updatedAt: now,
      };
    }),
  );
}

export function mergeRoomRecordLists(localRooms: RoomRecord[], remoteRooms: unknown[]): RoomRecord[] {
  const byId = new Map<string, RoomRecord>();

  for (const room of [...localRooms, ...remoteRooms].map(normalizeRoomRecord).filter((room): room is RoomRecord => Boolean(room))) {
    const existingRoom = byId.get(room.id);

    if (!existingRoom || getRoomVersion(room) >= getRoomVersion(existingRoom)) {
      byId.set(room.id, room);
    }
  }

  return sortRooms([...byId.values()]);
}

function getRoomVersion(room: RoomRecord): number {
  return Math.max(room.updatedAt || 0, room.deletedAt || 0, room.lastOpenedAt || 0);
}

function assertRoomData(data: RoomData): void {
  if (!isValidRoomData(data)) {
    throw new Error("Invalid Excalidraw room id or key.");
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

function normalizeTitle(title: unknown, timestamp: number): string {
  const value = String(title || "").trim();
  return value ? value.slice(0, 80) : `Board ${new Date(timestamp).toLocaleDateString()}`;
}

function parseFullUrl(value: string): RoomData | null {
  try {
    const url = new URL(value);
    return parseHash(url.hash);
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

function toNullableTimestamp(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}
