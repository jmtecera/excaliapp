import { randomBase64Url } from "./encoding";
import { text } from "./i18n";
import type { DeviceType, PomodoroStatus, Workspace, WorkspaceMember } from "./types";

const ROOM_CODE_PATTERN = /^[A-Z0-9]{3}-[A-Z0-9]{3}$/;
const DEFAULT_POMODORO_SECONDS = 25 * 60;
const MAX_POMODORO_SECONDS = 120 * 60;

export const DEFAULT_ROOM_NAME = text.defaultRoomName;

export function emptyWorkspace(): Workspace {
  return normalizeWorkspace({});
}

export function normalizeWorkspace(workspace: Partial<Workspace> | Record<string, unknown>): Workspace {
  const pomodoroDurationSeconds =
    typeof workspace.pomodoroDurationSeconds === "number" &&
    Number.isFinite(workspace.pomodoroDurationSeconds)
      ? Math.max(60, Math.min(MAX_POMODORO_SECONDS, Math.round(workspace.pomodoroDurationSeconds)))
      : DEFAULT_POMODORO_SECONDS;

  return {
    roomId: typeof workspace.roomId === "string" ? workspace.roomId : "",
    roomCode: normalizeRoomCode(typeof workspace.roomCode === "string" ? workspace.roomCode : ""),
    roomName: normalizeRoomName(typeof workspace.roomName === "string" ? workspace.roomName : ""),
    roomNameUpdatedAt:
      typeof workspace.roomNameUpdatedAt === "number" && workspace.roomNameUpdatedAt > 0
        ? workspace.roomNameUpdatedAt
        : 0,
    accessToken: typeof workspace.accessToken === "string" ? workspace.accessToken : "",
    pinEnabled: workspace.pinEnabled === true,
    pomodoroStatus: normalizePomodoroStatus(workspace.pomodoroStatus),
    pomodoroDurationSeconds,
    pomodoroEndsAt:
      typeof workspace.pomodoroEndsAt === "number" && workspace.pomodoroEndsAt > 0
        ? workspace.pomodoroEndsAt
        : null,
    pomodoroStartedAt:
      typeof workspace.pomodoroStartedAt === "number" && workspace.pomodoroStartedAt > 0
        ? workspace.pomodoroStartedAt
        : null,
    pomodoroRemainingSeconds:
      typeof workspace.pomodoroRemainingSeconds === "number" &&
      Number.isFinite(workspace.pomodoroRemainingSeconds)
        ? Math.max(0, Math.min(MAX_POMODORO_SECONDS, Math.round(workspace.pomodoroRemainingSeconds)))
        : pomodoroDurationSeconds,
    pomodoroAccumulatedSeconds:
      typeof workspace.pomodoroAccumulatedSeconds === "number" &&
      Number.isFinite(workspace.pomodoroAccumulatedSeconds)
        ? Math.max(0, Math.round(workspace.pomodoroAccumulatedSeconds))
        : 0,
    pomodoroUpdatedAt:
      typeof workspace.pomodoroUpdatedAt === "number" && workspace.pomodoroUpdatedAt > 0
        ? workspace.pomodoroUpdatedAt
        : 0,
    memberName: normalizeMemberName(typeof workspace.memberName === "string" ? workspace.memberName : ""),
    memberEmail: normalizeEmail(typeof workspace.memberEmail === "string" ? workspace.memberEmail : ""),
    device: normalizeDevice(workspace.device),
    clientId:
      typeof workspace.clientId === "string" && workspace.clientId
        ? workspace.clientId
        : randomBase64Url(12),
    members: Array.isArray(workspace.members)
      ? workspace.members.map(normalizeMember).filter((member): member is WorkspaceMember => Boolean(member))
      : [],
    lastSyncAt:
      typeof workspace.lastSyncAt === "number" && workspace.lastSyncAt > 0 ? workspace.lastSyncAt : null,
    lastError: typeof workspace.lastError === "string" ? workspace.lastError : "",
  };
}

export function normalizeMember(member: unknown): WorkspaceMember | null {
  if (!member || typeof member !== "object") {
    return null;
  }

  const candidate = member as Partial<WorkspaceMember>;

  if (typeof candidate.clientId !== "string" || !candidate.clientId) {
    return null;
  }

  return {
    clientId: candidate.clientId,
    name: normalizeMemberName(candidate.name),
    email: "",
    device: normalizeDevice(candidate.device),
    lastSeenAt:
      typeof candidate.lastSeenAt === "number" && candidate.lastSeenAt > 0 ? candidate.lastSeenAt : null,
  };
}

export function normalizeRoomCode(code: unknown): string {
  return String(code || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6)
    .replace(/^([A-Z0-9]{3})([A-Z0-9])/, "$1-$2");
}

export function requireRoomCode(code: unknown): string {
  const value = normalizeRoomCode(code);

  if (!ROOM_CODE_PATTERN.test(value)) {
    throw new Error(text.error.codeFormat);
  }

  return value;
}

export function normalizeRoomName(name: unknown): string {
  const value = String(name || "").trim();
  return (value || DEFAULT_ROOM_NAME).slice(0, 80);
}

export function requireRoomName(name: unknown): string {
  const value = String(name || "").trim().slice(0, 80);

  if (!value) {
    throw new Error(text.error.roomNameRequired);
  }

  return value;
}

export function normalizeMemberName(name: unknown): string {
  return String(name || "").trim().slice(0, 60);
}

export function normalizeEmail(email: unknown): string {
  const value = String(email || "").trim().toLowerCase().slice(0, 254);
  return value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : "";
}

export function detectDevice(): DeviceType {
  const userAgent = navigator.userAgent.toLowerCase();
  const viewportWidth = window.innerWidth;

  if (/iphone|ipod|android.*mobile|windows phone/.test(userAgent) || viewportWidth < 640) {
    return "mobile";
  }

  if (/ipad|tablet|android/.test(userAgent) || viewportWidth < 1024) {
    return "tablet";
  }

  return "desktop";
}

export function hasWorkspace(workspace: Workspace): boolean {
  return ROOM_CODE_PATTERN.test(workspace.roomCode);
}

export function isWorkspaceSyncReady(workspace: Workspace): boolean {
  return hasWorkspace(workspace) && Boolean(workspace.memberName);
}

function normalizeDevice(device: unknown): DeviceType {
  return device === "mobile" || device === "tablet" ? device : "desktop";
}

function normalizePomodoroStatus(status: unknown): PomodoroStatus {
  return status === "running" || status === "paused" ? status : "idle";
}
