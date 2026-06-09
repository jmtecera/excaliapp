export type RoomStatus = "active" | "inactive";

export type WorkspaceMember = {
  clientId: string;
  name: string;
  lastSeenAt: number | null;
};

export type Workspace = {
  workspaceId: string;
  workspaceKey: string;
  workspaceName: string;
  workspaceNameUpdatedAt: number;
  endpoint: string;
  memberName: string;
  clientId: string;
  revision: number;
  members: WorkspaceMember[];
  lastSyncAt: number | null;
  lastError: string;
};

export type RoomRecord = {
  id: string;
  roomId: string;
  roomKey: string;
  title: string;
  status: RoomStatus;
  createdAt: number;
  updatedAt: number;
  lastOpenedAt: number;
  deletedAt: number | null;
  url: string;
};

export type RoomData = {
  roomId: string;
  roomKey: string;
};

export type SyncPayload = {
  workspaceId: string;
  workspaceName?: string;
  workspaceNameUpdatedAt?: number;
  revision: number;
  rooms?: unknown[];
  members?: unknown[];
};
