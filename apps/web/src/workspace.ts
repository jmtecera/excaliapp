import { decodeBase64Url, randomBase64Url } from "./encoding";
import type { Workspace, WorkspaceMember } from "./types";

const WORKSPACE_V1_CODE_PATTERN = /^EXM1-([a-zA-Z0-9_-]+)$/i;
const WORKSPACE_V2_CODE_PATTERN = /^EXM2-([a-zA-Z0-9_-]+)\.([a-zA-Z0-9_-]+)$/i;

export const DEFAULT_WORKSPACE_NAME = "Shared Excalidraw";

export function emptyWorkspace(): Workspace {
  return normalizeWorkspace({});
}

export function createWorkspaceData({
  name = DEFAULT_WORKSPACE_NAME,
  endpoint = "",
}: {
  name?: string;
  endpoint?: string;
} = {}): Pick<Workspace, "workspaceId" | "workspaceKey" | "workspaceName" | "workspaceNameUpdatedAt" | "endpoint"> {
  return {
    workspaceId: randomBase64Url(15),
    workspaceKey: randomBase64Url(24),
    workspaceName: normalizeWorkspaceName(name),
    workspaceNameUpdatedAt: Date.now(),
    endpoint: normalizeEndpoint(endpoint || inferDefaultSyncEndpoint()),
  };
}

export function buildWorkspaceCode(workspace: Workspace): string {
  assertWorkspaceData(workspace);
  return `EXM2-${workspace.workspaceId}.${workspace.workspaceKey}`;
}

export function parseWorkspaceCode(input: string): Pick<Workspace, "workspaceId" | "workspaceKey" | "workspaceName" | "workspaceNameUpdatedAt" | "endpoint"> {
  const value = String(input || "").trim().replace(/\s+/g, "");
  const v2Match = value.match(WORKSPACE_V2_CODE_PATTERN);

  if (v2Match) {
    const workspace = {
      workspaceId: v2Match[1] || "",
      workspaceKey: v2Match[2] || "",
      workspaceName: DEFAULT_WORKSPACE_NAME,
      workspaceNameUpdatedAt: 0,
      endpoint: "",
    };

    assertWorkspaceData(workspace);
    return workspace;
  }

  const v1Match = value.match(WORKSPACE_V1_CODE_PATTERN);

  if (!v1Match?.[1]) {
    throw new Error("Paste an EXM2 session code.");
  }

  try {
    const payload = JSON.parse(decodeBase64Url(v1Match[1])) as Partial<Workspace> & {
      wid?: string;
      key?: string;
      name?: string;
    };
    const workspace = {
      workspaceId: payload.workspaceId || payload.wid || "",
      workspaceKey: payload.workspaceKey || payload.key || "",
      workspaceName: normalizeWorkspaceName(payload.workspaceName || payload.name),
      workspaceNameUpdatedAt:
        typeof payload.workspaceNameUpdatedAt === "number" && payload.workspaceNameUpdatedAt > 0
          ? payload.workspaceNameUpdatedAt
          : 0,
      endpoint: normalizeEndpoint(payload.endpoint),
    };

    assertWorkspaceData(workspace);
    return workspace;
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "That session code is not valid.");
  }
}

export function normalizeWorkspace(workspace: Partial<Workspace> | Record<string, unknown>): Workspace {
  return {
    workspaceId: typeof workspace.workspaceId === "string" ? workspace.workspaceId : "",
    workspaceKey: typeof workspace.workspaceKey === "string" ? workspace.workspaceKey : "",
    workspaceName: normalizeWorkspaceName(typeof workspace.workspaceName === "string" ? workspace.workspaceName : ""),
    workspaceNameUpdatedAt:
      typeof workspace.workspaceNameUpdatedAt === "number" && workspace.workspaceNameUpdatedAt > 0
        ? workspace.workspaceNameUpdatedAt
        : 0,
    endpoint: normalizeEndpoint(typeof workspace.endpoint === "string" ? workspace.endpoint : ""),
    memberName: normalizeMemberName(typeof workspace.memberName === "string" ? workspace.memberName : ""),
    clientId:
      typeof workspace.clientId === "string" && workspace.clientId
        ? workspace.clientId
        : randomBase64Url(12),
    revision: typeof workspace.revision === "number" && workspace.revision > 0 ? workspace.revision : 0,
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
    lastSeenAt:
      typeof candidate.lastSeenAt === "number" && candidate.lastSeenAt > 0 ? candidate.lastSeenAt : null,
  };
}

export function normalizeWorkspaceName(name: unknown): string {
  const value = String(name || "").trim();
  return (value || DEFAULT_WORKSPACE_NAME).slice(0, 80);
}

export function normalizeMemberName(name: unknown): string {
  const value = String(name || "").trim();
  return value.slice(0, 60);
}

export function normalizeEndpoint(endpoint: unknown): string {
  return String(endpoint || "").trim().replace(/\/+$/g, "");
}

export function isWorkspaceSyncReady(workspace: Workspace): boolean {
  return Boolean(workspace.workspaceId && workspace.workspaceKey && workspace.endpoint && normalizeMemberName(workspace.memberName));
}

export function hasWorkspace(workspace: Workspace): boolean {
  return Boolean(workspace.workspaceId && workspace.workspaceKey);
}

export function inferDefaultSyncEndpoint(): string {
  return normalizeEndpoint(import.meta.env.VITE_EXCALIDRAW_SYNC_ENDPOINT);
}

export function requireMemberName(name: unknown): string {
  const value = normalizeMemberName(name);

  if (!value) {
    throw new Error("Enter your name first.");
  }

  return value;
}

export function requireWorkspaceName(name: unknown): string {
  const value = String(name || "").trim().slice(0, 80);

  if (!value) {
    throw new Error("Enter a session name first.");
  }

  return value;
}

function assertWorkspaceData(workspace: Pick<Workspace, "workspaceId" | "workspaceKey">): void {
  if (
    typeof workspace.workspaceId !== "string" ||
    !/^[a-zA-Z0-9_-]{12,}$/.test(workspace.workspaceId) ||
    typeof workspace.workspaceKey !== "string" ||
    !/^[a-zA-Z0-9_-]{24,}$/.test(workspace.workspaceKey)
  ) {
    throw new Error("Invalid session data.");
  }
}
