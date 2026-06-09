export type DeviceType = "desktop" | "tablet" | "mobile";

export type WorkspaceMember = {
  clientId: string;
  name: string;
  email: string;
  device: DeviceType;
  lastSeenAt: number | null;
};

export type Workspace = {
  roomId: string;
  roomCode: string;
  roomName: string;
  roomNameUpdatedAt: number;
  memberName: string;
  memberEmail: string;
  device: DeviceType;
  clientId: string;
  members: WorkspaceMember[];
  lastSyncAt: number | null;
  lastError: string;
};

export type RoomRecord = {
  id: string;
  roomId: string;
  roomKey: string;
  name: string;
  excalidrawUrl: string;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
};

export type RoomData = {
  roomId: string;
  roomKey: string;
};

export type SyncPayload = {
  roomId?: string;
  roomCode?: string;
  roomName?: string;
  roomNameUpdatedAt?: number;
  boards?: unknown[];
  members?: unknown[];
};

export type CsvImportError = {
  row: number;
  message: string;
};

export type CsvImportResult = {
  boards: RoomRecord[];
  errors: CsvImportError[];
};
