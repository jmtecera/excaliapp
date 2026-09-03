export type DeviceType = "desktop" | "tablet" | "mobile";
export type PomodoroStatus = "idle" | "running" | "paused";
export type PomodoroAction = "start" | "pause" | "reset" | "reset-total" | "set-duration";

export type WorkspaceMember = {
  clientId: string;
  name: string;
  avatarHash: string;
  device: DeviceType;
  lastSeenAt: number | null;
};

export type Workspace = {
  roomId: string;
  roomCode: string;
  roomName: string;
  roomNameUpdatedAt: number;
  accessToken: string;
  pinEnabled: boolean;
  pomodoroStatus: PomodoroStatus;
  pomodoroDurationSeconds: number;
  pomodoroEndsAt: number | null;
  pomodoroStartedAt: number | null;
  pomodoroRemainingSeconds: number;
  pomodoroAccumulatedSeconds: number;
  pomodoroUpdatedAt: number;
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
  lastOpenedAt: number;
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
  accessToken?: string;
  avatarHash?: string;
  pinEnabled?: boolean;
  pinRequired?: boolean;
  pomodoroStatus?: PomodoroStatus;
  pomodoroDurationSeconds?: number;
  pomodoroEndsAt?: number | null;
  pomodoroStartedAt?: number | null;
  pomodoroRemainingSeconds?: number;
  pomodoroAccumulatedSeconds?: number;
  pomodoroUpdatedAt?: number;
  boards?: unknown[];
  members?: unknown[];
};

export type RecentRoom = {
  code: string;
  name: string;
  accessToken: string;
  lastVisitedAt: number;
};

export type CsvImportError = {
  row: number;
  message: string;
};

export type CsvImportResult = {
  boards: RoomRecord[];
  errors: CsvImportError[];
};
