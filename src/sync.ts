import { mergeRoomRecordLists } from "./room";
import { createAvatarHash } from "./avatar";
import { normalizeMember, normalizeRoomCode, normalizeRoomName, normalizeWorkspace } from "./workspace";
import type { PomodoroAction, RoomRecord, SyncPayload, Workspace, WorkspaceMember } from "./types";

const API_BASE_URL = String(import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");

export async function createSharedRoom({
  roomName,
  memberName,
  memberEmail,
  clientId,
  device,
}: Pick<Workspace, "roomName" | "memberName" | "memberEmail" | "clientId" | "device">): Promise<Workspace> {
  const payload = await request<SyncPayload>("/api/rooms", {
    method: "POST",
    body: JSON.stringify({
      roomName,
      memberName,
      avatarHash: createAvatarHash(memberEmail),
      clientId,
      device,
    }),
  });

  return normalizeWorkspace({
    roomId: payload.roomId,
    roomCode: payload.roomCode,
    roomName: payload.roomName,
    roomNameUpdatedAt: payload.roomNameUpdatedAt,
    memberName,
    memberEmail,
    clientId,
    device,
    members: payload.members,
    lastSyncAt: Date.now(),
  });
}

export async function joinWorkspace({
  workspace,
}: {
  workspace: Workspace;
}): Promise<{ workspace: Workspace; rooms: RoomRecord[] }> {
  const payload = await request<SyncPayload>(`/api/rooms/${workspace.roomCode}/join`, {
    method: "POST",
    body: JSON.stringify({
      accessToken: workspace.accessToken,
      clientId: workspace.clientId,
      memberName: workspace.memberName,
      avatarHash: createAvatarHash(workspace.memberEmail),
      device: workspace.device,
    }),
  });

  if (payload.pinRequired) {
    throw new RoomPinRequiredError(workspace.roomCode);
  }

  return {
    rooms: Array.isArray(payload.boards) ? mergeRoomRecordLists([], payload.boards) : [],
    workspace: normalizeSyncedWorkspace(workspace, payload),
  };
}

export async function syncWorkspace({
  workspace,
  rooms,
}: {
  workspace: Workspace;
  rooms: RoomRecord[];
}): Promise<{ workspace: Workspace; rooms: RoomRecord[] }> {
  const payload = await request<SyncPayload>(`/api/rooms/${workspace.roomCode}/sync`, {
    method: "POST",
    body: JSON.stringify({
      roomName: workspace.roomName,
      roomNameUpdatedAt: workspace.roomNameUpdatedAt,
      accessToken: workspace.accessToken,
      clientId: workspace.clientId,
      memberName: workspace.memberName,
      avatarHash: createAvatarHash(workspace.memberEmail),
      device: workspace.device,
      boards: rooms,
    }),
  });

  if (payload.pinRequired) {
    throw new RoomPinRequiredError(workspace.roomCode);
  }

  const nextRooms = Array.isArray(payload.boards) ? mergeRoomRecordLists(rooms, payload.boards) : rooms;

  return {
    rooms: nextRooms,
    workspace: normalizeSyncedWorkspace(workspace, payload),
  };
}

function normalizeSyncedWorkspace(workspace: Workspace, payload: SyncPayload): Workspace {
  return normalizeWorkspace({
    ...workspace,
    roomId: typeof payload.roomId === "string" ? payload.roomId : workspace.roomId,
    roomCode: normalizeRoomCode(payload.roomCode || workspace.roomCode),
    roomName:
      typeof payload.roomName === "string" ? normalizeRoomName(payload.roomName) : workspace.roomName,
    roomNameUpdatedAt:
      typeof payload.roomNameUpdatedAt === "number" && payload.roomNameUpdatedAt > 0
        ? payload.roomNameUpdatedAt
        : workspace.roomNameUpdatedAt,
    accessToken:
      typeof payload.accessToken === "string" ? payload.accessToken : workspace.accessToken,
    pinEnabled: payload.pinEnabled === true,
    pomodoroStatus: payload.pomodoroStatus || workspace.pomodoroStatus,
    pomodoroDurationSeconds:
      typeof payload.pomodoroDurationSeconds === "number"
        ? payload.pomodoroDurationSeconds
        : workspace.pomodoroDurationSeconds,
    pomodoroEndsAt:
      payload.pomodoroEndsAt === null
        ? null
        : typeof payload.pomodoroEndsAt === "number"
          ? payload.pomodoroEndsAt
          : workspace.pomodoroEndsAt,
    pomodoroStartedAt:
      payload.pomodoroStartedAt === null
        ? null
        : typeof payload.pomodoroStartedAt === "number"
          ? payload.pomodoroStartedAt
          : workspace.pomodoroStartedAt,
    pomodoroRemainingSeconds:
      typeof payload.pomodoroRemainingSeconds === "number"
        ? payload.pomodoroRemainingSeconds
        : workspace.pomodoroRemainingSeconds,
    pomodoroAccumulatedSeconds:
      typeof payload.pomodoroAccumulatedSeconds === "number"
        ? payload.pomodoroAccumulatedSeconds
        : workspace.pomodoroAccumulatedSeconds,
    pomodoroUpdatedAt:
      typeof payload.pomodoroUpdatedAt === "number"
        ? payload.pomodoroUpdatedAt
        : workspace.pomodoroUpdatedAt,
    members: Array.isArray(payload.members)
      ? payload.members.map(normalizeMember).filter((member): member is WorkspaceMember => Boolean(member))
      : workspace.members,
    lastSyncAt: Date.now(),
    lastError: "",
  });
}

export async function authorizeRoom(roomCode: string, pin: string): Promise<{
  accessToken: string;
  pinEnabled: boolean;
}> {
  return request(`/api/rooms/${normalizeRoomCode(roomCode)}/authorize`, {
    method: "POST",
    body: JSON.stringify({ pin }),
  });
}

export async function updateRoomPin({
  roomCode,
  accessToken,
  pin,
}: {
  roomCode: string;
  accessToken: string;
  pin: string | null;
}): Promise<{ accessToken: string; pinEnabled: boolean }> {
  return request(`/api/rooms/${normalizeRoomCode(roomCode)}/pin`, {
    method: "POST",
    body: JSON.stringify({ accessToken, pin }),
  });
}

export async function updateRoomPomodoro({
  roomCode,
  accessToken,
  action,
  durationMinutes,
}: {
  roomCode: string;
  accessToken: string;
  action: PomodoroAction;
  durationMinutes?: number;
}): Promise<SyncPayload> {
  const payload = await request<SyncPayload>(`/api/rooms/${normalizeRoomCode(roomCode)}/timer`, {
    method: "POST",
    body: JSON.stringify({ accessToken, action, durationMinutes }),
  });

  if (payload.pinRequired) {
    throw new RoomPinRequiredError(roomCode);
  }

  return payload;
}

export class RoomPinRequiredError extends Error {
  roomCode: string;

  constructor(roomCode: string) {
    super("Room PIN required.");
    this.name = "RoomPinRequiredError";
    this.roomCode = roomCode;
  }
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init.headers,
    },
  });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };

  if (!response.ok) {
    throw new Error(payload.error || `Request failed (${response.status})`);
  }

  return payload;
}
