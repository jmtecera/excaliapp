import { mergeRoomRecordLists } from "./room";
import { normalizeMember, normalizeWorkspaceName } from "./workspace";
import type { RoomRecord, SyncPayload, Workspace, WorkspaceMember } from "./types";

export async function syncWorkspace({
  workspace,
  rooms,
}: {
  workspace: Workspace;
  rooms: RoomRecord[];
}): Promise<{ workspace: Workspace; rooms: RoomRecord[] }> {
  const response = await fetch(`${workspace.endpoint}/api/workspaces/${workspace.workspaceId}/sync`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      workspaceKey: workspace.workspaceKey,
      workspaceName: workspace.workspaceName,
      workspaceNameUpdatedAt: workspace.workspaceNameUpdatedAt,
      clientId: workspace.clientId,
      memberName: workspace.memberName,
      revision: workspace.revision,
      rooms,
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as Partial<SyncPayload> & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(payload.error || `Sync failed (${response.status})`);
  }

  const nextRooms = Array.isArray(payload.rooms) ? mergeRoomRecordLists(rooms, payload.rooms) : rooms;

  return {
    rooms: nextRooms,
    workspace: {
      ...workspace,
      workspaceName:
        typeof payload.workspaceName === "string" ? normalizeWorkspaceName(payload.workspaceName) : workspace.workspaceName,
      workspaceNameUpdatedAt:
        typeof payload.workspaceNameUpdatedAt === "number" && payload.workspaceNameUpdatedAt > 0
          ? payload.workspaceNameUpdatedAt
          : workspace.workspaceNameUpdatedAt,
      revision: typeof payload.revision === "number" ? payload.revision : workspace.revision,
      members: Array.isArray(payload.members)
        ? payload.members.map(normalizeMember).filter((member): member is WorkspaceMember => Boolean(member))
        : workspace.members,
      lastSyncAt: Date.now(),
      lastError: "",
    },
  };
}
