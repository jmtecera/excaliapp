import { Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { LandingPage } from "./components/LandingPage";
import { RoomPage } from "./components/RoomPage";
import { writeClipboard } from "./format";
import { locale, text } from "./i18n";
import { createRoomRecord, createRoomRecordFromUrl, generateCollaborationLinkData, sortRooms } from "./room";
import {
  clearCurrentRoom,
  loadRecentRoomCodes,
  loadRoomRecords,
  loadWorkspace,
  saveRoomRecords,
  saveWorkspace,
} from "./storage";
import { createSharedRoom, syncWorkspace as syncRemoteWorkspace } from "./sync";
import type { RoomRecord, Workspace, WorkspaceMember } from "./types";
import {
  DEFAULT_ROOM_NAME,
  detectDevice,
  hasWorkspace,
  isWorkspaceSyncReady,
  normalizeEmail,
  normalizeMemberName,
  normalizeWorkspace,
  requireRoomCode,
  requireRoomName,
} from "./workspace";

const AUTO_REFRESH_MS = 30000;
const PRESENCE_WINDOW_MS = 90000;

export function App() {
  const initialRouteCode = getRouteRoomCode();
  const loadedWorkspace = loadWorkspace();
  const [workspace, setWorkspace] = createSignal<Workspace>(
    initialRouteCode && loadedWorkspace.roomCode !== initialRouteCode
      ? normalizeWorkspace({ ...loadedWorkspace, roomCode: initialRouteCode, roomId: "", roomName: DEFAULT_ROOM_NAME })
      : loadedWorkspace,
  );
  const [boards, setBoards] = createSignal<RoomRecord[]>(
    initialRouteCode && loadedWorkspace.roomCode !== initialRouteCode ? [] : loadRoomRecords(),
  );
  const [recentCodes, setRecentCodes] = createSignal(loadRecentRoomCodes());
  const [routeCode, setRouteCode] = createSignal(initialRouteCode);
  const [now, setNow] = createSignal(Date.now());
  const [syncBusy, setSyncBusy] = createSignal(false);
  const [toast, setToast] = createSignal("");
  let toastTimeout = 0;
  let syncQueued = false;

  const inRoom = createMemo(
    () => hasWorkspace(workspace()) && Boolean(workspace().memberName) && routeCode() === workspace().roomCode,
  );
  const visibleMembers = createMemo(() => getVisibleMembers(workspace(), now()));

  onMount(() => {
    document.documentElement.lang = locale;
    document.title = inRoom() ? `${workspace().roomName} · ${text.appName}` : text.appName;
    const device = detectDevice();

    if (workspace().device !== device) {
      updateWorkspace({ ...workspace(), device });
    }

    if (inRoom() && isWorkspaceSyncReady(workspace())) {
      void syncRoom({ silent: true });
    }

    const interval = window.setInterval(() => {
      setNow(Date.now());
      if (inRoom()) void syncRoom({ silent: true });
    }, AUTO_REFRESH_MS);
    const handleVisibility = () => {
      if (!document.hidden && inRoom()) void syncRoom({ silent: true });
    };
    const handleOnline = () => {
      if (inRoom()) void syncRoom({ silent: true });
    };
    const handleStorage = () => {
      setWorkspace(loadWorkspace());
      setBoards(loadRoomRecords());
      setRecentCodes(loadRecentRoomCodes());
    };
    const handlePopState = () => setRouteCode(getRouteRoomCode());

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("online", handleOnline);
    window.addEventListener("storage", handleStorage);
    window.addEventListener("popstate", handlePopState);

    onCleanup(() => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("popstate", handlePopState);
    });
  });

  async function handleCreateRoom(details: { name: string }): Promise<string> {
    setSyncBusy(true);

    try {
      const memberName = requireMemberName(details.name);
      const memberEmail = workspace().memberEmail;
      const createdWorkspace = await createSharedRoom({
        roomName: DEFAULT_ROOM_NAME,
        memberName,
        memberEmail,
        clientId: workspace().clientId,
        device: detectDevice(),
      });
      updateBoards([]);
      updateWorkspace(createdWorkspace);
      setRecentCodes(loadRecentRoomCodes());
      showToast(text.toast.roomCreated);
      return createdWorkspace.roomCode;
    } catch (error) {
      showToast(getErrorMessage(error, text.error.createRoom));
      return "";
    } finally {
      setSyncBusy(false);
    }
  }

  async function handleJoinRoom(details: { code: string; name: string }) {
    try {
      const candidate = normalizeWorkspace({
        ...workspace(),
        roomId: "",
        roomCode: requireRoomCode(details.code),
        roomName: DEFAULT_ROOM_NAME,
        roomNameUpdatedAt: 0,
        memberName: requireMemberName(details.name),
        memberEmail: workspace().memberEmail,
        device: detectDevice(),
        members: [],
        lastSyncAt: null,
        lastError: "",
      });
      setSyncBusy(true);
      const result = await syncRemoteWorkspace({ workspace: candidate, rooms: [] });
      updateBoards(result.rooms);
      updateWorkspace(result.workspace);
      setRecentCodes(loadRecentRoomCodes());
      navigateToRoom(result.workspace.roomCode);
      showToast(text.toast.roomJoined);
    } catch (error) {
      showToast(getErrorMessage(error, text.error.joinRoom));
    } finally {
      setSyncBusy(false);
    }
  }

  function handleLeaveRoom() {
    updateBoards([]);
    updateWorkspace(clearCurrentRoom());
    navigate("/");
  }

  function handleRenameRoom(name: string) {
    try {
      updateWorkspace({
        ...workspace(),
        roomName: requireRoomName(name),
        roomNameUpdatedAt: Date.now(),
      });
      void syncRoom({ silent: true });
    } catch (error) {
      showToast(getErrorMessage(error, text.error.renameRoom));
    }
  }

  function handleUpdateProfile(details: { name: string; email: string }) {
    try {
      updateWorkspace({
        ...workspace(),
        memberName: requireMemberName(details.name),
        memberEmail: normalizeEmail(details.email),
        device: detectDevice(),
      });
      void syncRoom({ silent: true });
      showToast(text.toast.profileUpdated);
    } catch (error) {
      showToast(getErrorMessage(error, text.error.updateProfile));
    }
  }

  async function handleCreateBoard(name: string) {
    try {
      const roomData = await generateCollaborationLinkData();
      const board = createRoomRecord({ ...roomData, name });
      updateBoards([board, ...boards()]);
      await syncRoom({ silent: true });
      window.open(board.excalidrawUrl, "_blank", "noopener,noreferrer");
      showToast(text.toast.boardCreated);
    } catch (error) {
      showToast(getErrorMessage(error, text.error.createBoard));
    }
  }

  async function handleAddBoard(details: { name: string; url: string }) {
    try {
      const board = createRoomRecordFromUrl({ name: details.name, url: details.url });
      updateBoards([board, ...boards()]);
      await syncRoom({ silent: true });
      showToast(text.toast.boardAdded);
    } catch (error) {
      showToast(getErrorMessage(error, text.error.addBoard));
    }
  }

  function handleImportBoards(importedBoards: RoomRecord[]) {
    updateBoards(sortRooms([...importedBoards, ...boards()]));
    void syncRoom({ silent: true });
  }

  function handleArchiveBoard(board: RoomRecord) {
    const updatedAt = Date.now();
    updateBoards(
      boards().map((candidate) =>
        candidate.id === board.id ? { ...candidate, archived: !candidate.archived, updatedAt } : candidate,
      ),
    );
    void syncRoom({ silent: true });
    showToast(board.archived ? text.toast.boardRestored : text.toast.boardArchived);
  }

  function handleRenameBoard(board: RoomRecord, name: string) {
    const cleanName = name.trim().slice(0, 80);

    if (!cleanName) {
      return;
    }

    updateBoards(
      boards().map((candidate) =>
        candidate.id === board.id ? { ...candidate, name: cleanName, updatedAt: Date.now() } : candidate,
      ),
    );
    void syncRoom({ silent: true });
  }

  async function syncRoom({ silent = false } = {}) {
    if (!isWorkspaceSyncReady(workspace())) {
      if (!silent) showToast(text.toast.enterNameToSync);
      return;
    }

    if (syncBusy()) {
      syncQueued = true;
      return;
    }

    setSyncBusy(true);

    try {
      const result = await syncRemoteWorkspace({ workspace: workspace(), rooms: boards() });
      updateBoards(result.rooms);
      updateWorkspace(result.workspace);
      if (!silent) showToast(text.toast.roomRefreshed);
    } catch (error) {
      updateWorkspace({
        ...workspace(),
        lastError: getErrorMessage(error, text.error.sync),
      });
      if (!silent) showToast(getErrorMessage(error, text.error.sync));
    } finally {
      setSyncBusy(false);

      if (syncQueued) {
        syncQueued = false;
        void syncRoom({ silent: true });
      }
    }
  }

  function updateWorkspace(nextWorkspace: Workspace) {
    const saved = saveWorkspace(normalizeWorkspace(nextWorkspace));
    setWorkspace(saved);
    document.title = hasWorkspace(saved) ? `${saved.roomName} · ${text.appName}` : text.appName;
  }

  function updateBoards(nextBoards: RoomRecord[]) {
    setBoards(saveRoomRecords(nextBoards));
  }

  function navigateToRoom(code: string) {
    navigate(`/room/${code}`);
  }

  function navigate(path: string) {
    window.history.pushState({}, "", path);
    setRouteCode(getRouteRoomCode());
  }

  function showToast(message: string) {
    setToast(message);
    window.clearTimeout(toastTimeout);
    toastTimeout = window.setTimeout(() => setToast(""), 2600);
  }

  return (
    <>
      <Show
        when={inRoom()}
        fallback={
          <LandingPage
            workspace={workspace()}
            recentCodes={recentCodes()}
            initialCode={routeCode()}
            busy={syncBusy()}
            onJoin={handleJoinRoom}
            onCreate={handleCreateRoom}
            onOpenGenerated={navigateToRoom}
          />
        }
      >
        <RoomPage
          workspace={{ ...workspace(), members: visibleMembers() }}
          boards={boards()}
          now={now()}
          busy={syncBusy()}
          onLeave={handleLeaveRoom}
          onRefresh={() => void syncRoom()}
          onCopyCode={() => {
            void writeClipboard(workspace().roomCode);
            showToast(text.toast.roomCodeCopied);
          }}
          onRenameRoom={handleRenameRoom}
          onUpdateProfile={handleUpdateProfile}
          onCreateBoard={handleCreateBoard}
          onAddBoard={handleAddBoard}
          onImportBoards={handleImportBoards}
          onOpenBoard={(board) => window.open(board.excalidrawUrl, "_blank", "noopener,noreferrer")}
          onCopyBoard={(board) => {
            void writeClipboard(board.excalidrawUrl);
            showToast(text.toast.boardLinkCopied);
          }}
          onArchiveBoard={handleArchiveBoard}
          onRenameBoard={handleRenameBoard}
        />
      </Show>

      <Show when={toast()}>
        <div
          class="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full border border-border bg-foreground px-4 py-2 text-xs font-medium text-background shadow-xl"
          role="status"
          aria-live="polite"
        >
          {toast()}
        </div>
      </Show>
    </>
  );
}

function getVisibleMembers(workspace: Workspace, now: number): WorkspaceMember[] {
  const members = [...workspace.members];
  const self: WorkspaceMember = {
    clientId: workspace.clientId,
    name: workspace.memberName,
    email: workspace.memberEmail,
    device: workspace.device,
    lastSeenAt: now,
  };
  const selfIndex = members.findIndex((member) => member.clientId === self.clientId);

  if (selfIndex >= 0) {
    members[selfIndex] = self;
  } else if (self.name) {
    members.unshift(self);
  }

  return members
    .filter((member) => member.name && member.lastSeenAt && now - member.lastSeenAt < PRESENCE_WINDOW_MS)
    .sort((left, right) => Number(right.lastSeenAt) - Number(left.lastSeenAt));
}

function getRouteRoomCode(): string {
  const match = window.location.pathname.match(/^\/room\/([A-Za-z]{3}-[A-Za-z]{3})\/?$/);
  return match?.[1]?.toUpperCase() || "";
}

function requireMemberName(name: unknown): string {
  const value = normalizeMemberName(name);

  if (!value) {
    throw new Error(text.error.nameRequired);
  }

  return value;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
