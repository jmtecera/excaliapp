import {
  Show,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  untrack,
} from "solid-js";
import { createAvatarHash } from "./avatar";
import { LandingPage } from "./components/LandingPage";
import { PinPrompt } from "./components/PinPrompt";
import { RoomPage } from "./components/RoomPage";
import { writeClipboard } from "./format";
import { locale, text } from "./i18n";
import { playPomodoroCompleteSound, prepareNotificationSound } from "./notifications";
import { getPomodoroRemainingSeconds } from "./pomodoro";
import { subscribeToRoom } from "./realtime";
import { createRoomRecord, createRoomRecordFromUrl, generateCollaborationLinkData, sortRooms } from "./room";
import {
  clearCurrentRoom,
  loadRecentRooms,
  loadRoomRecords,
  loadWorkspace,
  saveRoomRecords,
  saveWorkspace,
} from "./storage";
import {
  RoomPinRequiredError,
  authorizeRoom,
  createSharedRoom,
  joinWorkspace as joinRemoteWorkspace,
  syncWorkspace as syncRemoteWorkspace,
  updateRoomPin,
  updateRoomPomodoro,
} from "./sync";
import type { PomodoroAction, RecentRoom, RoomRecord, Workspace, WorkspaceMember } from "./types";
import {
  detectDevice,
  getDefaultRoomName,
  hasWorkspace,
  isWorkspaceSyncReady,
  normalizeEmail,
  normalizeMemberName,
  normalizeWorkspace,
  requireRoomCode,
  requireRoomName,
} from "./workspace";

const AUTO_REFRESH_MS = 15000;
const INITIAL_SYNC_FRESHNESS_MS = AUTO_REFRESH_MS;
const PRESENCE_WINDOW_MS = 90000;
const REALTIME_DEBOUNCE_MS = 100;

type PendingJoin = {
  workspace: Workspace;
};

export function App() {
  const initialRouteCode = getRouteRoomCode();
  const loadedWorkspace = loadWorkspace();
  const loadedRecentRooms = loadRecentRooms();
  const rememberedRoute = loadedRecentRooms.find((room) => room.code === initialRouteCode);
  const initialWorkspace =
    initialRouteCode && loadedWorkspace.roomCode !== initialRouteCode
      ? normalizeWorkspace({
          ...loadedWorkspace,
          roomCode: initialRouteCode,
          roomId: "",
          roomName: rememberedRoute?.name || getDefaultRoomName(),
          accessToken: rememberedRoute?.accessToken || "",
          pinEnabled: Boolean(rememberedRoute?.accessToken),
        })
      : loadedWorkspace;
  const [workspace, setWorkspace] = createSignal<Workspace>(initialWorkspace);
  const [boards, setBoards] = createSignal<RoomRecord[]>(
    initialRouteCode && loadedWorkspace.roomCode !== initialRouteCode ? [] : loadRoomRecords(),
  );
  const [recentRooms, setRecentRooms] = createSignal(loadedRecentRooms);
  const [routeCode, setRouteCode] = createSignal(initialRouteCode);
  const [realtimeMembers, setRealtimeMembers] = createSignal<WorkspaceMember[]>([]);
  const [pendingJoin, setPendingJoin] = createSignal<PendingJoin | null>(null);
  const [now, setNow] = createSignal(Date.now());
  const [syncBusy, setSyncBusy] = createSignal(false);
  const [toast, setToast] = createSignal("");
  const [initialNamePromptOpen, setInitialNamePromptOpen] = createSignal(false);
  let toastTimeout = 0;
  let realtimeSyncTimeout = 0;
  let syncQueued = false;
  let previousTimer = {
    roomId: initialWorkspace.roomId,
    status: initialWorkspace.pomodoroStatus,
    remaining: getPomodoroRemainingSeconds(initialWorkspace, Date.now()),
  };

  const inRoom = createMemo(
    () =>
      hasWorkspace(workspace()) &&
      Boolean(workspace().roomId) &&
      Boolean(workspace().memberName) &&
      routeCode() === workspace().roomCode,
  );
  const visibleMembers = createMemo(() =>
    getVisibleMembers(workspace(), realtimeMembers(), now()),
  );
  const realtimeKey = createMemo(() => {
    const current = workspace();
    return inRoom()
      ? [
          current.roomId,
          current.clientId,
          current.memberName,
          createAvatarHash(current.memberEmail),
          current.device,
        ].join("|")
      : "";
  });

  createEffect(() => {
    const key = realtimeKey();

    if (!key) {
      setRealtimeMembers([]);
      return;
    }

    const current = untrack(workspace);
    const unsubscribe = subscribeToRoom({
      workspace: current,
      onChanged: queueRealtimeSync,
      onPresence: setRealtimeMembers,
    });
    onCleanup(unsubscribe);
  });

  createEffect(() => {
    const currentWorkspace = workspace();
    const remaining = getPomodoroRemainingSeconds(currentWorkspace, now());
    const sameRoom = previousTimer.roomId === currentWorkspace.roomId;

    if (
      sameRoom &&
      previousTimer.status === "running" &&
      previousTimer.remaining > 0 &&
      currentWorkspace.pomodoroStatus === "running" &&
      remaining === 0
    ) {
      playPomodoroCompleteSound();
      showToast(text().toast.pomodoroComplete);
    }

    previousTimer = {
      roomId: currentWorkspace.roomId,
      status: currentWorkspace.pomodoroStatus,
      remaining,
    };
  });

  createEffect(() => {
    const currentWorkspace = workspace();
    const isRoomRoute = Boolean(routeCode());
    const pageTitle = inRoom()
      ? `${currentWorkspace.roomName} · ${text().appName}`
      : text().landing.seoTitle;
    const pageDescription = text().landing.seoDescription;
    const canonicalUrl = new URL("/", window.location.origin).href;

    document.documentElement.lang = locale();
    document.title = pageTitle;
    updateMeta("name", "description", pageDescription);
    updateMeta("name", "robots", isRoomRoute ? "noindex, nofollow" : "index, follow");
    updateMeta("property", "og:title", pageTitle);
    updateMeta("property", "og:description", pageDescription);
    updateMeta("property", "og:url", canonicalUrl);
    updateMeta("property", "og:locale", locale() === "es" ? "es_AR" : "en_US");
    updateMeta("name", "twitter:title", pageTitle);
    updateMeta("name", "twitter:description", pageDescription);
    setCanonicalUrl(canonicalUrl);
  });

  onMount(() => {
    const device = detectDevice();

    if (workspace().device !== device) {
      updateWorkspace({ ...workspace(), device });
    }

    const lastSyncAt = workspace().lastSyncAt;
    const needsInitialSync = !lastSyncAt || Date.now() - lastSyncAt > INITIAL_SYNC_FRESHNESS_MS;

    if (inRoom() && isWorkspaceSyncReady(workspace()) && needsInitialSync) {
      void syncRoom({ silent: true });
    }

    const clockInterval = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    const syncInterval = window.setInterval(() => {
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
      setRecentRooms(loadRecentRooms());
    };
    const handlePopState = () => setRouteCode(getRouteRoomCode());
    const handleFirstInteraction = () => {
      prepareNotificationSound();
      window.removeEventListener("pointerdown", handleFirstInteraction);
      window.removeEventListener("keydown", handleFirstInteraction);
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("online", handleOnline);
    window.addEventListener("storage", handleStorage);
    window.addEventListener("popstate", handlePopState);
    window.addEventListener("pointerdown", handleFirstInteraction, { once: true });
    window.addEventListener("keydown", handleFirstInteraction, { once: true });

    onCleanup(() => {
      window.clearInterval(clockInterval);
      window.clearInterval(syncInterval);
      window.clearTimeout(realtimeSyncTimeout);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("pointerdown", handleFirstInteraction);
      window.removeEventListener("keydown", handleFirstInteraction);
    });
  });

  async function handleCreateRoom(details: { name: string; turnstileToken?: string }): Promise<string> {
    setSyncBusy(true);

    try {
      const memberName = requireMemberName(details.name);
      const createdWorkspace = await createSharedRoom({
        roomName: getDefaultRoomName(),
        memberName,
        memberEmail: workspace().memberEmail,
        clientId: workspace().clientId,
        device: detectDevice(),
        turnstileToken: details.turnstileToken,
      });
      updateBoards([]);
      updateWorkspace(createdWorkspace);
      setInitialNamePromptOpen(true);
      refreshRecentRooms();
      showToast(text().toast.roomCreated);
      return createdWorkspace.roomCode;
    } catch (error) {
      showToast(getErrorMessage(error, text().error.createRoom));
      return "";
    } finally {
      setSyncBusy(false);
    }
  }

  async function handleJoinRoom(details: { code: string; name: string }) {
    try {
      const code = requireRoomCode(details.code);
      const remembered = recentRooms().find((room) => room.code === code);
      const candidate = createJoinWorkspace({
        code,
        name: details.name,
        accessToken: remembered?.accessToken || "",
        roomName: remembered?.name || getDefaultRoomName(),
      });
      await joinWorkspace(candidate);
    } catch (error) {
      showToast(getErrorMessage(error, text().error.joinRoom));
    }
  }

  async function handleRecentJoin(room: RecentRoom, name: string) {
    try {
      const candidate = createJoinWorkspace({
        code: room.code,
        name,
        accessToken: room.accessToken,
        roomName: room.name,
      });
      await joinWorkspace(candidate);
    } catch (error) {
      showToast(getErrorMessage(error, text().error.joinRoom));
    }
  }

  async function joinWorkspace(candidate: Workspace) {
    setSyncBusy(true);

    try {
      const result = await joinRemoteWorkspace({ workspace: candidate });
      completeJoin(result.workspace, result.rooms);
    } catch (error) {
      if (error instanceof RoomPinRequiredError) {
        setPendingJoin({ workspace: { ...candidate, accessToken: "" } });
      } else {
        showToast(getErrorMessage(error, text().error.joinRoom));
      }
    } finally {
      setSyncBusy(false);
    }
  }

  async function handlePinSubmit(pin: string) {
    const pending = pendingJoin();

    if (!pending) {
      return;
    }

    setSyncBusy(true);

    try {
      const authorization = await authorizeRoom(pending.workspace.roomCode, pin);
      const authorizedWorkspace = normalizeWorkspace({
        ...pending.workspace,
        ...authorization,
      });
      const result = await joinRemoteWorkspace({ workspace: authorizedWorkspace });
      setPendingJoin(null);
      completeJoin(result.workspace, result.rooms);
    } catch (error) {
      showToast(getErrorMessage(error, text().error.joinRoom));
    } finally {
      setSyncBusy(false);
    }
  }

  function handlePinCancel() {
    const pending = pendingJoin();
    setPendingJoin(null);

    if (pending?.workspace.roomId && pending.workspace.roomId === workspace().roomId) {
      handleLeaveRoom();
    }
  }

  function completeJoin(nextWorkspace: Workspace, nextBoards: RoomRecord[]) {
    updateBoards(nextBoards);
    updateWorkspace(nextWorkspace);
    refreshRecentRooms();
    navigateToRoom(nextWorkspace.roomCode);
    showToast(text().toast.roomJoined);
  }

  function createJoinWorkspace({
    code,
    name,
    accessToken,
    roomName,
  }: {
    code: string;
    name: string;
    accessToken: string;
    roomName: string;
  }): Workspace {
    return normalizeWorkspace({
      ...workspace(),
      roomId: "",
      roomCode: code,
      roomName,
      roomNameUpdatedAt: 0,
      accessToken,
      pinEnabled: Boolean(accessToken),
      memberName: requireMemberName(name),
      memberEmail: workspace().memberEmail,
      device: detectDevice(),
      members: [],
      lastSyncAt: null,
      lastError: "",
    });
  }

  function handleLeaveRoom() {
    setInitialNamePromptOpen(false);
    setPendingJoin(null);
    setRealtimeMembers([]);
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
      showToast(getErrorMessage(error, text().error.renameRoom));
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
      showToast(text().toast.profileUpdated);
    } catch (error) {
      showToast(getErrorMessage(error, text().error.updateProfile));
    }
  }

  async function handleUpdatePin(pin: string | null) {
    if (pin !== null && !/^[0-9]{4}$/.test(pin)) {
      showToast(text().error.pinFormat);
      return;
    }

    setSyncBusy(true);

    try {
      const wasEnabled = workspace().pinEnabled;
      const result = await updateRoomPin({
        roomCode: workspace().roomCode,
        accessToken: workspace().accessToken,
        pin,
      });
      updateWorkspace({ ...workspace(), ...result });
      showToast(
        result.pinEnabled
          ? wasEnabled
            ? text().toast.pinChanged
            : text().toast.pinEnabled
          : text().toast.pinDisabled,
      );
      void syncRoom({ silent: true });
    } catch (error) {
      if (error instanceof RoomPinRequiredError) {
        setPendingJoin({ workspace: { ...workspace(), accessToken: "" } });
      }
      showToast(getErrorMessage(error, text().error.pinUpdate));
    } finally {
      setSyncBusy(false);
    }
  }

  async function handlePomodoroAction(action: PomodoroAction, durationMinutes?: number) {
    setSyncBusy(true);

    try {
      const result = await updateRoomPomodoro({
        roomCode: workspace().roomCode,
        accessToken: workspace().accessToken,
        action,
        durationMinutes,
      });
      updateWorkspace({
        ...workspace(),
        pomodoroStatus: result.pomodoroStatus || workspace().pomodoroStatus,
        pomodoroDurationSeconds:
          typeof result.pomodoroDurationSeconds === "number"
            ? result.pomodoroDurationSeconds
            : workspace().pomodoroDurationSeconds,
        pomodoroEndsAt:
          typeof result.pomodoroEndsAt === "number" ? result.pomodoroEndsAt : null,
        pomodoroStartedAt:
          typeof result.pomodoroStartedAt === "number" ? result.pomodoroStartedAt : null,
        pomodoroRemainingSeconds:
          typeof result.pomodoroRemainingSeconds === "number"
            ? result.pomodoroRemainingSeconds
            : workspace().pomodoroRemainingSeconds,
        pomodoroAccumulatedSeconds:
          typeof result.pomodoroAccumulatedSeconds === "number"
            ? result.pomodoroAccumulatedSeconds
            : workspace().pomodoroAccumulatedSeconds,
        pomodoroUpdatedAt:
          typeof result.pomodoroUpdatedAt === "number"
            ? result.pomodoroUpdatedAt
            : workspace().pomodoroUpdatedAt,
      });
    } catch (error) {
      if (error instanceof RoomPinRequiredError) {
        setPendingJoin({ workspace: { ...workspace(), accessToken: "" } });
      }
      showToast(getErrorMessage(error, text().error.timerUpdate));
    } finally {
      setSyncBusy(false);
    }
  }

  async function handleCreateBoard(name: string) {
    try {
      const roomData = await generateCollaborationLinkData();
      const board = createRoomRecord({ ...roomData, name });
      updateBoards([board, ...boards()]);
      window.open(board.excalidrawUrl, "_blank", "noopener,noreferrer");
      void syncRoom({ silent: true });
      showToast(text().toast.boardCreated);
    } catch (error) {
      showToast(getErrorMessage(error, text().error.createBoard));
    }
  }

  async function handleAddBoard(details: { name: string; url: string }) {
    try {
      const board = createRoomRecordFromUrl({ name: details.name, url: details.url });
      updateBoards([board, ...boards()]);
      void syncRoom({ silent: true });
      showToast(text().toast.boardAdded);
    } catch (error) {
      showToast(getErrorMessage(error, text().error.addBoard));
    }
  }

  function handleImportBoards(importedBoards: RoomRecord[]) {
    updateBoards(sortRooms([...importedBoards, ...boards()]));
    void syncRoom({ silent: true });
  }

  function handleOpenBoard(board: RoomRecord) {
    window.open(board.excalidrawUrl, "_blank", "noopener,noreferrer");
    const timestamp = Date.now();
    updateBoards(
      boards().map((candidate) =>
        candidate.id === board.id
          ? { ...candidate, lastOpenedAt: timestamp, updatedAt: timestamp }
          : candidate,
      ),
    );
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
    showToast(board.archived ? text().toast.boardRestored : text().toast.boardArchived);
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
      if (!silent) showToast(text().toast.enterNameToSync);
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
      if (!silent) showToast(text().toast.roomRefreshed);
    } catch (error) {
      if (error instanceof RoomPinRequiredError) {
        setPendingJoin({ workspace: { ...workspace(), accessToken: "" } });
        return;
      }

      updateWorkspace({
        ...workspace(),
        lastError: getErrorMessage(error, text().error.sync),
      });
      if (!silent) showToast(getErrorMessage(error, text().error.sync));
    } finally {
      setSyncBusy(false);

      if (syncQueued) {
        syncQueued = false;
        void syncRoom({ silent: true });
      }
    }
  }

  function queueRealtimeSync() {
    window.clearTimeout(realtimeSyncTimeout);
    realtimeSyncTimeout = window.setTimeout(() => {
      if (inRoom()) void syncRoom({ silent: true });
    }, REALTIME_DEBOUNCE_MS);
  }

  function updateWorkspace(nextWorkspace: Workspace) {
    const saved = saveWorkspace(normalizeWorkspace(nextWorkspace));
    setWorkspace(saved);
  }

  function updateBoards(nextBoards: RoomRecord[]) {
    setBoards(saveRoomRecords(nextBoards));
  }

  function refreshRecentRooms() {
    setRecentRooms(loadRecentRooms());
  }

  function navigateToRoom(code: string) {
    navigate(`/room/${code}`);
  }

  function navigate(path: string) {
    window.history.pushState({}, "", path);
    setRouteCode(getRouteRoomCode());
  }

  function showToast(message: string) {
    setToast(message.trim().replace(/\.+$/, ""));
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
            recentRooms={recentRooms()}
            initialCode={routeCode()}
            busy={syncBusy()}
            onJoin={handleJoinRoom}
            onRecentJoin={handleRecentJoin}
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
            showToast(text().toast.roomCodeCopied);
          }}
          onCopyInvite={() => {
            void writeClipboard(new URL(`/room/${workspace().roomCode}`, window.location.origin).toString());
            showToast(text().toast.inviteCopied);
          }}
          onRenameRoom={handleRenameRoom}
          initialNamePromptOpen={initialNamePromptOpen()}
          onInitialNamePromptClose={() => setInitialNamePromptOpen(false)}
          onUpdateProfile={handleUpdateProfile}
          onUpdatePin={handleUpdatePin}
          onPomodoroAction={handlePomodoroAction}
          onCreateBoard={handleCreateBoard}
          onAddBoard={handleAddBoard}
          onImportBoards={handleImportBoards}
          onOpenBoard={handleOpenBoard}
          onCopyBoard={(board) => {
            void writeClipboard(board.excalidrawUrl);
            showToast(text().toast.boardLinkCopied);
          }}
          onArchiveBoard={handleArchiveBoard}
          onRenameBoard={handleRenameBoard}
        />
      </Show>

      <Show when={pendingJoin()}>
        <PinPrompt busy={syncBusy()} onSubmit={handlePinSubmit} onCancel={handlePinCancel} />
      </Show>

      <Show when={toast()}>
        <div
          class="fixed bottom-5 left-1/2 z-[60] -translate-x-1/2 rounded-full border border-border bg-foreground px-4 py-2 text-xs font-medium text-background shadow-xl"
          role="status"
          aria-live="polite"
        >
          {toast()}
        </div>
      </Show>
    </>
  );
}

function getVisibleMembers(
  workspace: Workspace,
  realtimeMembers: WorkspaceMember[],
  now: number,
): WorkspaceMember[] {
  const members = new Map<string, WorkspaceMember>();

  for (const member of workspace.members) {
    members.set(member.clientId, member);
  }

  for (const member of realtimeMembers) {
    members.set(member.clientId, member);
  }

  const self: WorkspaceMember = {
    clientId: workspace.clientId,
    name: workspace.memberName,
    avatarHash: createAvatarHash(workspace.memberEmail),
    device: workspace.device,
    lastSeenAt: now,
  };

  if (self.name) {
    members.set(self.clientId, self);
  }

  return [...members.values()]
    .filter((member) => member.name && member.lastSeenAt && now - member.lastSeenAt < PRESENCE_WINDOW_MS)
    .sort((left, right) => {
      if (left.clientId === workspace.clientId) return -1;
      if (right.clientId === workspace.clientId) return 1;
      return Number(right.lastSeenAt) - Number(left.lastSeenAt);
    });
}

function getRouteRoomCode(): string {
  const match = window.location.pathname.match(/^\/room\/([A-Za-z0-9]{3}-[A-Za-z0-9]{3})\/?$/);
  return match?.[1]?.toUpperCase() || "";
}

function requireMemberName(name: unknown): string {
  const value = normalizeMemberName(name);

  if (!value) {
    throw new Error(text().error.nameRequired);
  }

  return value;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function updateMeta(
  attribute: "name" | "property",
  value: string,
  content: string,
): void {
  document.querySelector<HTMLMetaElement>(`meta[${attribute}="${value}"]`)?.setAttribute("content", content);
}

function setCanonicalUrl(url: string): void {
  let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');

  if (!canonical) {
    canonical = document.createElement("link");
    canonical.rel = "canonical";
    document.head.append(canonical);
  }

  canonical.href = url;
}
