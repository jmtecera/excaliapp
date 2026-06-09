import { normalizeRoomRecord, sortRooms } from "./room";
import { emptyWorkspace, normalizeWorkspace } from "./workspace";
import type { RoomRecord, Workspace } from "./types";

const ROOM_STORAGE_KEY = "excalidrawWebRooms";
const WORKSPACE_STORAGE_KEY = "excalidrawWebWorkspace";

export function loadWorkspace(): Workspace {
  const storedWorkspace = readStorage(WORKSPACE_STORAGE_KEY, {});
  return normalizeWorkspace(typeof storedWorkspace === "object" && storedWorkspace ? storedWorkspace : {});
}

export function saveWorkspace(workspace: Workspace): Workspace {
  const normalizedWorkspace = normalizeWorkspace(workspace);
  writeStorage(WORKSPACE_STORAGE_KEY, normalizedWorkspace);
  return normalizedWorkspace;
}

export function loadRoomRecords({ includeDeleted = false } = {}): RoomRecord[] {
  const rooms = readStorage(ROOM_STORAGE_KEY, []);
  const normalizedRooms = Array.isArray(rooms)
    ? rooms.map(normalizeRoomRecord).filter((room): room is RoomRecord => Boolean(room))
    : [];
  const filteredRooms = includeDeleted ? normalizedRooms : normalizedRooms.filter((room) => !room.deletedAt);
  return sortRooms(filteredRooms);
}

export function saveRoomRecords(rooms: RoomRecord[]): RoomRecord[] {
  const normalizedRooms = sortRooms(rooms.map(normalizeRoomRecord).filter((room): room is RoomRecord => Boolean(room)));
  writeStorage(ROOM_STORAGE_KEY, normalizedRooms);
  return normalizedRooms;
}

export function resetLocalState(): { workspace: Workspace; rooms: RoomRecord[] } {
  localStorage.removeItem(WORKSPACE_STORAGE_KEY);
  localStorage.removeItem(ROOM_STORAGE_KEY);

  return {
    workspace: emptyWorkspace(),
    rooms: [],
  };
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
