import { normalizeRoomRecord, sortRooms } from "./room";
import { emptyWorkspace, normalizeRoomCode, normalizeWorkspace } from "./workspace";
import type { RoomRecord, Workspace } from "./types";

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
    saveRecentRoomCode(normalizedWorkspace.roomCode);
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

export function loadRecentRoomCodes(): string[] {
  const codes = readStorage(RECENT_ROOMS_STORAGE_KEY, []);
  return Array.isArray(codes)
    ? codes
        .map(normalizeRoomCode)
        .filter((code, index, values) => code.length === 7 && values.indexOf(code) === index)
        .slice(0, 4)
    : [];
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

function saveRecentRoomCode(code: string): void {
  const nextCodes = [normalizeRoomCode(code), ...loadRecentRoomCodes()].filter(
    (value, index, values) => value && values.indexOf(value) === index,
  );
  writeStorage(RECENT_ROOMS_STORAGE_KEY, nextCodes.slice(0, 4));
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
