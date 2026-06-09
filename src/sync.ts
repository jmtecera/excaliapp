import { mergeRoomRecordLists } from "./room";
import { normalizeMember, normalizeRoomCode, normalizeRoomName, normalizeWorkspace } from "./workspace";
import type { RoomRecord, SyncPayload, Workspace, WorkspaceMember } from "./types";

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
    body: JSON.stringify({ roomName, memberName, memberEmail, clientId, device }),
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
      clientId: workspace.clientId,
      memberName: workspace.memberName,
      memberEmail: workspace.memberEmail,
      device: workspace.device,
      boards: rooms,
    }),
  });
  const nextRooms = Array.isArray(payload.boards) ? mergeRoomRecordLists(rooms, payload.boards) : rooms;

  return {
    rooms: nextRooms,
    workspace: normalizeWorkspace({
      ...workspace,
      roomId: typeof payload.roomId === "string" ? payload.roomId : workspace.roomId,
      roomCode: normalizeRoomCode(payload.roomCode || workspace.roomCode),
      roomName:
        typeof payload.roomName === "string" ? normalizeRoomName(payload.roomName) : workspace.roomName,
      roomNameUpdatedAt:
        typeof payload.roomNameUpdatedAt === "number" && payload.roomNameUpdatedAt > 0
          ? payload.roomNameUpdatedAt
          : workspace.roomNameUpdatedAt,
      members: Array.isArray(payload.members)
        ? payload.members.map(normalizeMember).filter((member): member is WorkspaceMember => Boolean(member))
        : workspace.members,
      lastSyncAt: Date.now(),
      lastError: "",
    }),
  };
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
