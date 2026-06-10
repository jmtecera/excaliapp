import { normalizeRoomRecord, sortRooms } from "./room";
import { emptyWorkspace, normalizeRoomCode, normalizeWorkspace } from "./workspace";
import type { RecentRoom, RoomRecord, Workspace } from "./types";

const ROOM_STORAGE_KEY = "excalidrawWebRooms";
const WORKSPACE_STORAGE_KEY = "excalidrawWebWorkspace";
const RECENT_ROOMS_STORAGE_KEY = "excalidrawRecentRooms";

export function loadWorkspace(): Workspace {
  const storedWorkspace = readStorage(WORKSPACE_STORAGE_KEY, {});
  return normalizeWorkspace(typeof storedWorkspace === "object" && storedWorkspace ? storedWorkspace : {});
}

export function saveWorkspace(workspace: Workspace): Workspace {
  const normalizedWorkspace = normalizeWorkspace(workspace);
  writeStorage(WORKSPACE_STORAGE_KEY, normalizedWorkspace);

  if (normalizedWorkspace.roomCode) {
    saveRecentRoom({
      code: normalizedWorkspace.roomCode,
      name: normalizedWorkspace.roomName,
      accessToken: normalizedWorkspace.accessToken,
      lastVisitedAt: Date.now(),
    });
  }

  return normalizedWorkspace;
}

export function loadRoomRecords(): RoomRecord[] {
  const rooms = readStorage(ROOM_STORAGE_KEY, []);
  const normalizedRooms = Array.isArray(rooms)
    ? rooms.map(normalizeRoomRecord).filter((room): room is RoomRecord => Boolean(room))
    : [];
  return sortRooms(normalizedRooms);
}

export function saveRoomRecords(rooms: RoomRecord[]): RoomRecord[] {
  const normalizedRooms = sortRooms(
    rooms.map(normalizeRoomRecord).filter((room): room is RoomRecord => Boolean(room)),
  );
  writeStorage(ROOM_STORAGE_KEY, normalizedRooms);
  return normalizedRooms;
}

export function loadRecentRooms(): RecentRoom[] {
  const storedRooms = readStorage(RECENT_ROOMS_STORAGE_KEY, []);

  if (!Array.isArray(storedRooms)) {
    return [];
  }

  const rooms = storedRooms
    .map((room): RecentRoom | null => {
      if (typeof room === "string") {
        const code = normalizeRoomCode(room);
        return code.length === 7
          ? { code, name: code, accessToken: "", lastVisitedAt: 0 }
          : null;
      }

      if (!room || typeof room !== "object") {
        return null;
      }

      const candidate = room as Partial<RecentRoom>;
      const code = normalizeRoomCode(candidate.code);

      if (code.length !== 7) {
        return null;
      }

      return {
        code,
        name: String(candidate.name || code).trim().slice(0, 80) || code,
        accessToken: typeof candidate.accessToken === "string" ? candidate.accessToken : "",
        lastVisitedAt:
          typeof candidate.lastVisitedAt === "number" && candidate.lastVisitedAt > 0
            ? candidate.lastVisitedAt
            : 0,
      };
    })
    .filter((room): room is RecentRoom => Boolean(room));

  return rooms
    .filter((room, index) => rooms.findIndex((candidate) => candidate.code === room.code) === index)
    .sort((left, right) => right.lastVisitedAt - left.lastVisitedAt)
    .slice(0, 4);
}

export function clearCurrentRoom(): Workspace {
  const current = loadWorkspace();
  const nextWorkspace = emptyWorkspace();
  const preservedWorkspace = {
    ...nextWorkspace,
    clientId: current.clientId,
    memberName: current.memberName,
    memberEmail: current.memberEmail,
    device: current.device,
  };

  localStorage.removeItem(ROOM_STORAGE_KEY);
  return saveWorkspace(preservedWorkspace);
}

function saveRecentRoom(room: RecentRoom): void {
  const nextRooms = [room, ...loadRecentRooms()].filter(
    (value, index, values) => value.code && values.findIndex((candidate) => candidate.code === value.code) === index,
  );
  writeStorage(RECENT_ROOMS_STORAGE_KEY, nextRooms.slice(0, 4));
}

function readStorage(key: string, fallback: unknown): unknown {
  try {
    const rawValue = localStorage.getItem(key);
    return rawValue ? JSON.parse(rawValue) : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
}
