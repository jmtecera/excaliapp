import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { writeClipboard, formatRelativeTime } from "./format";
import {
  archiveOtherRooms,
  createRoomRecord,
  generateCollaborationLinkData,
  isSameRoom,
  parseCollaborationInput,
  sortRooms,
} from "./room";
import { loadRoomRecords, loadWorkspace, saveRoomRecords, saveWorkspace } from "./storage";
import { syncWorkspace as syncRemoteWorkspace } from "./sync";
import type { RoomRecord, Workspace, WorkspaceMember } from "./types";
import {
  DEFAULT_WORKSPACE_NAME,
  buildWorkspaceCode,
  createWorkspaceData,
  hasWorkspace,
  inferDefaultSyncEndpoint,
  isWorkspaceSyncReady,
  normalizeEndpoint,
  normalizeWorkspace,
  parseWorkspaceCode,
  requireMemberName,
  requireWorkspaceName,
} from "./workspace";

type Filter = "active" | "inactive" | "all";
type ThemeMode = "system" | "light" | "dark";

const THEME_STORAGE_KEY = "excalidrawWebThemeMode";
const THEME_MODES: ThemeMode[] = ["system", "light", "dark"];
const AUTO_REFRESH_MS = 30000;

export function App() {
  let memberNameInput!: HTMLInputElement;
  let workspaceNameInput!: HTMLInputElement;
  let endpointInput!: HTMLInputElement;
  let sessionCodeInput!: HTMLInputElement;
  let createTitleInput!: HTMLInputElement;
  let boardLinkInput!: HTMLInputElement;

  const [workspace, setWorkspace] = createSignal<Workspace>(loadWorkspace());
  const [rooms, setRooms] = createSignal<RoomRecord[]>(loadRoomRecords());
  const [filter, setFilter] = createSignal<Filter>("active");
  const [themeMode, setThemeMode] = createSignal<ThemeMode>(loadThemeMode());
  const [now, setNow] = createSignal(Date.now());
  const [syncBusy, setSyncBusy] = createSignal(false);
  const [toast, setToast] = createSignal("");
  let toastTimeout = 0;

  const joined = createMemo(() => hasWorkspace(workspace()));
  const syncReady = createMemo(() => isWorkspaceSyncReady(workspace()));
  const boardSummary = createMemo(() => {
    const visibleRooms = rooms().filter((room) => !room.deletedAt);
    const activeCount = visibleRooms.filter((room) => room.status === "active").length;
    const inactiveCount = visibleRooms.filter((room) => room.status === "inactive").length;

    return `${visibleRooms.length} boards / ${activeCount} active / ${inactiveCount} old`;
  });
  const currentRoom = createMemo(() => rooms().find((room) => !room.deletedAt && room.status === "active") || null);
  const filteredRooms = createMemo(() =>
    rooms().filter((room) => !room.deletedAt && (filter() === "all" || room.status === filter())),
  );
  const visibleMembers = createMemo(() => getVisibleMembers(workspace(), now()));
  const syncStatus = createMemo(() => getSyncStatus(workspace(), joined(), now()));

  createEffect(() => {
    document.title = joined() ? `${workspace().workspaceName} / Excalidraw` : "Excalidraw Room Manager";
  });

  createEffect(() => {
    const mode = themeMode();
    applyThemeMode(mode);
    localStorage.setItem(THEME_STORAGE_KEY, mode);
  });

  onMount(() => {
    void refreshState({ sync: true, silent: true });
    const interval = window.setInterval(() => {
      setNow(Date.now());
      void refreshState({ sync: true, silent: true });
    }, AUTO_REFRESH_MS);
    const handleVisibility = () => {
      if (!document.hidden) {
        void refreshState({ sync: true, silent: true });
      }
    };
    const handleOnline = () => {
      void refreshState({ sync: true, silent: true });
    };
    const handleStorage = () => {
      refreshLocalState();
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("online", handleOnline);
    window.addEventListener("storage", handleStorage);

    onCleanup(() => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("storage", handleStorage);
    });
  });

  async function handleSaveSettings(event: SubmitEvent) {
    event.preventDefault();

    const hadWorkspace = joined();

    try {
      const memberName = requireMemberName(memberNameInput.value);
      const endpoint = normalizeEndpoint(endpointInput.value);
      const patch: Partial<Workspace> = {
        memberName,
        endpoint,
      };

      if (hadWorkspace) {
        const workspaceName = requireWorkspaceName(workspaceNameInput.value);
        patch.workspaceName = workspaceName;

        if (workspaceName !== workspace().workspaceName) {
          patch.workspaceNameUpdatedAt = Date.now();
        }
      }

      updateWorkspace(normalizeWorkspace({ ...workspace(), ...patch }));
      await syncWorkspace({ silent: !hadWorkspace });
      showToast(hadWorkspace ? "Session settings saved" : "Settings saved");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not save settings");
      memberNameInput.focus();
    }
  }

  async function handleJoinSession(event: SubmitEvent) {
    event.preventDefault();

    try {
      const memberName = requireMemberName(memberNameInput.value);
      const parsedWorkspace = parseWorkspaceCode(sessionCodeInput.value);
      const nextWorkspace = normalizeWorkspace({
        ...workspace(),
        ...parsedWorkspace,
        endpoint: normalizeEndpoint(endpointInput.value || parsedWorkspace.endpoint || workspace().endpoint),
        memberName,
        revision: 0,
        members: [],
        lastError: "",
        lastSyncAt: null,
      });

      sessionCodeInput.value = "";
      updateWorkspace(nextWorkspace);
      await syncWorkspace();
      showToast("Session joined");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not join session");
    }
  }

  async function handleCreateBoard(event: SubmitEvent) {
    event.preventDefault();

    if (!joined()) {
      showToast("Create or join a session first");
      return;
    }

    if (!workspace().memberName) {
      showToast("Enter your name first");
      memberNameInput.focus();
      return;
    }

    try {
      const roomData = await generateCollaborationLinkData();
      const now = Date.now();
      const room = createRoomRecord({
        ...roomData,
        title: createTitleInput.value,
        status: "active",
        now,
      });
      updateRooms(archiveOtherRooms([room, ...loadRoomRecords({ includeDeleted: true })], room.id, now));
      createTitleInput.value = "";
      await syncWorkspace({ silent: true });
      window.open(room.url, "_blank", "noopener");
      showToast("Board created");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not create board");
    }
  }

  async function handleAddBoard(event: SubmitEvent) {
    event.preventDefault();

    if (!joined()) {
      showToast("Create or join a session first");
      return;
    }

    if (!workspace().memberName) {
      showToast("Enter your name first");
      memberNameInput.focus();
      return;
    }

    try {
      const room = upsertRoomFromInput(boardLinkInput.value, { activate: true });
      boardLinkInput.value = "";
      await syncWorkspace({ silent: true });
      window.open(room.url, "_blank", "noopener");
      showToast("Board added");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not add board");
    }
  }

  async function handleCopySessionCode() {
    if (!joined()) {
      showToast("Create or join a session first");
      return;
    }

    await writeClipboard(buildWorkspaceCode(workspace()));
    showToast("Session code copied");
  }

  async function handleNewSession() {
    if (
      joined() &&
      !window.confirm("Start a new local session? Saved boards remain on this device but the shared session identity changes.")
    ) {
      return;
    }

    try {
      const memberName = requireMemberName(memberNameInput.value);
      const workspaceName = joined() ? requireWorkspaceName(workspaceNameInput.value) : DEFAULT_WORKSPACE_NAME;
      const nextWorkspace = normalizeWorkspace({
        ...createWorkspaceData({
          name: workspaceName,
          endpoint: endpointInput.value || workspace().endpoint,
        }),
        memberName,
        clientId: workspace().clientId,
      });

      updateWorkspace(nextWorkspace);
      await syncWorkspace();
      showToast("New session created");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not create session");
      memberNameInput.focus();
    }
  }

  async function handleOpenRoom(room: RoomRecord) {
    touchRoomFromInput(room.url);
    await syncWorkspace({ silent: true });
    window.open(room.url, "_blank", "noopener");
  }

  async function handleCopyBoardLink(room: RoomRecord) {
    await writeClipboard(room.url);
    showToast("Board link copied");
  }

  async function handleToggleStatus(room: RoomRecord) {
    const nextStatus = room.status === "active" ? "inactive" : "active";
    setRoomStatus(room.id, nextStatus);
    await syncWorkspace({ silent: true });
    showToast(nextStatus === "inactive" ? "Board archived" : "Board activated");
  }

  async function handleRename(room: RoomRecord) {
    const title = window.prompt("Board name", room.title);

    if (!title) {
      return;
    }

    renameRoom(room.id, title);
    await syncWorkspace({ silent: true });
  }

  async function handleRemove(room: RoomRecord) {
    if (!window.confirm(`Remove "${room.title}" from this shared session?`)) {
      return;
    }

    removeRoom(room.id);
    await syncWorkspace({ silent: true });
    showToast("Board removed");
  }

  async function syncWorkspace({ silent = false } = {}) {
    if (syncBusy()) {
      return;
    }

    if (!syncReady()) {
      if (!silent) {
        showToast(getSyncBlockedMessage(workspace(), joined()));
      }
      return;
    }

    setSyncBusy(true);

    try {
      const result = await syncRemoteWorkspace({
        workspace: workspace(),
        rooms: loadRoomRecords({ includeDeleted: true }),
      });
      updateRooms(result.rooms);
      updateWorkspace(result.workspace);

      if (!silent) {
        showToast("Synced");
      }
    } catch (error) {
      updateWorkspace(
        normalizeWorkspace({
          ...workspace(),
          lastError: error instanceof Error ? error.message : "Sync failed",
        }),
      );

      if (!silent) {
        showToast(error instanceof Error ? error.message : "Sync failed");
      }
    } finally {
      setSyncBusy(false);
    }
  }

  async function refreshState({ sync = false, silent = false } = {}) {
    refreshLocalState();

    if (sync) {
      await syncWorkspace({ silent });
    } else if (!silent) {
      showToast("Refreshed");
    }
  }

  function refreshLocalState() {
    setNow(Date.now());
    setWorkspace(loadWorkspace());
    setRooms(loadRoomRecords());
  }

  function upsertRoomFromInput(input: string, { title, activate = true }: { title?: string; activate?: boolean }) {
    const roomData = parseCollaborationInput(input);
    const now = Date.now();
    const existingRooms = loadRoomRecords({ includeDeleted: true });
    const index = existingRooms.findIndex((room) => isSameRoom(room, roomData));
    const status = activate ? "active" : "inactive";
    let room: RoomRecord;
    let nextRooms: RoomRecord[];

    if (index >= 0) {
      room = {
        ...existingRooms[index],
        title: title?.trim() ? title.trim().slice(0, 80) : existingRooms[index].title,
        status,
        updatedAt: now,
        lastOpenedAt: now,
        deletedAt: null,
      };
      nextRooms = existingRooms.map((existingRoom, roomIndex) => (roomIndex === index ? room : existingRoom));
    } else {
      room = createRoomRecord({ ...roomData, title, now, status });
      nextRooms = [room, ...existingRooms];
    }

    updateRooms(activate ? archiveOtherRooms(nextRooms, room.id, now) : sortRooms(nextRooms));
    return room;
  }

  function touchRoomFromInput(input: string) {
    const roomData = parseCollaborationInput(input);
    const now = Date.now();

    updateRooms(
      rooms().map((room) => {
        if (room.deletedAt || !isSameRoom(room, roomData)) {
          return room;
        }

        return {
          ...room,
          lastOpenedAt: now,
          updatedAt: now,
        };
      }),
    );
  }

  function setRoomStatus(id: string, status: RoomRecord["status"]) {
    const now = Date.now();
    const targetRoom = rooms().find((room) => room.id === id);

    if (!targetRoom) {
      return null;
    }

    const changedRoom: RoomRecord = {
      ...targetRoom,
      status,
      updatedAt: now,
    };
    const nextRooms = rooms().map((room) => {
      if (room.id !== id) {
        return room;
      }

      return changedRoom;
    });

    updateRooms(status === "active" ? archiveOtherRooms(nextRooms, changedRoom.id, now) : sortRooms(nextRooms));
    return changedRoom;
  }

  function renameRoom(id: string, title: string) {
    const cleanTitle = title.trim().slice(0, 80);

    if (!cleanTitle) {
      return;
    }

    const now = Date.now();
    updateRooms(
      rooms().map((room) =>
        room.id === id
          ? {
              ...room,
              title: cleanTitle,
              updatedAt: now,
            }
          : room,
      ),
    );
  }

  function removeRoom(id: string) {
    const now = Date.now();
    updateRooms(
      rooms().map((room) =>
        room.id === id
          ? {
              ...room,
              status: "inactive",
              updatedAt: now,
              deletedAt: now,
            }
          : room,
      ),
    );
  }

  function updateWorkspace(nextWorkspace: Workspace) {
    const savedWorkspace = saveWorkspace(nextWorkspace);
    setWorkspace(savedWorkspace);
  }

  function updateRooms(nextRooms: RoomRecord[]) {
    const savedRooms = saveRoomRecords(nextRooms);
    setRooms(savedRooms);
  }

  function showToast(message: string) {
    setToast(message);
    window.clearTimeout(toastTimeout);
    toastTimeout = window.setTimeout(() => {
      setToast("");
    }, 2400);
  }

  return (
    <main class="app">
      <header class="topbar">
        <div class="brand">
          <img class="brand-icon" src="/assets/icon-48.png" alt="" aria-hidden="true" />
          <div>
            <p class="eyebrow">Excalidraw</p>
            <h1>Room Manager</h1>
          </div>
        </div>
        <div class="header-actions">
          <div class="theme-switch" aria-label="Theme mode">
            <button
              type="button"
              class={themeMode() === "system" ? "is-selected" : ""}
              aria-pressed={themeMode() === "system"}
              title="System"
              onClick={() => setThemeMode("system")}
            >
              System
            </button>
            <button
              type="button"
              class={themeMode() === "light" ? "is-selected" : ""}
              aria-pressed={themeMode() === "light"}
              title="Light"
              onClick={() => setThemeMode("light")}
            >
              Light
            </button>
            <button
              type="button"
              class={themeMode() === "dark" ? "is-selected" : ""}
              aria-pressed={themeMode() === "dark"}
              title="Dark"
              onClick={() => setThemeMode("dark")}
            >
              Dark
            </button>
          </div>
          <div class="summary">{boardSummary()}</div>
          <button class="secondary-button" type="button" disabled={syncBusy()} onClick={() => void refreshState({ sync: true })}>
            {syncBusy() ? "Refreshing" : "Refresh"}
          </button>
          <button class="secondary-button" type="button" disabled={!joined()} onClick={() => void handleCopySessionCode()}>
            Copy session
          </button>
        </div>
      </header>

      <section class="session-panel">
        <div class="section-title">
          <div>
            <p class="status-label">{joined() ? "Joined session" : "No session"}</p>
            <h2>{joined() ? workspace().workspaceName : "Shared extension session"}</h2>
          </div>
          <button class="small-button" type="button" onClick={() => void handleNewSession()}>
            New session
          </button>
        </div>

        <form class="settings-grid" onSubmit={(event) => void handleSaveSettings(event)}>
          <label>
            Your name
            <input ref={memberNameInput} type="text" maxLength="60" autocomplete="name" placeholder="Your name" value={workspace().memberName} required />
          </label>
          <label>
            Session name
            <input
              ref={workspaceNameInput}
              type="text"
              maxLength="80"
              placeholder="Shared Excalidraw"
              value={joined() ? workspace().workspaceName || DEFAULT_WORKSPACE_NAME : ""}
              disabled={!joined()}
              required={joined()}
            />
          </label>
          <label>
            Sync endpoint
            <input ref={endpointInput} type="url" placeholder="https://your-project.supabase.co/functions/v1/excalidraw-sync" value={workspace().endpoint || inferDefaultSyncEndpoint()} />
          </label>
          <button class="primary-button" type="submit">Save</button>
        </form>

        <form class="join-grid" onSubmit={(event) => void handleJoinSession(event)}>
          <div class="paste-field">
            <input ref={sessionCodeInput} type="text" spellcheck={false} autocomplete="off" placeholder="Paste EXM2 session code" />
            <span class="paste-prefix">EXM2</span>
          </div>
          <button class="secondary-button" type="submit">Join</button>
        </form>

        <div class="session-row">
          <div class="sync-status">{syncBusy() ? "Syncing..." : syncStatus()}</div>
          <div class="member-list">
            <For each={visibleMembers()}>
              {(member) => (
                <span class={`member-chip ${member.clientId === workspace().clientId ? "is-you" : ""}`}>
                  {member.name}
                </span>
              )}
            </For>
          </div>
        </div>
      </section>

      <Show when={joined()}>
        <section class="quick-panel">
          <div class={currentRoom() ? "current-room" : "empty-state"}>
            <Show when={currentRoom()} fallback="No active board saved.">
              {(room) => (
                <article class="current-card">
                  <div class="room-main">
                    <div class="room-title">{room().title}</div>
                    <div class="room-url" title={room().url}>{room().url}</div>
                    <div class="room-meta">Last opened {formatRelativeTime(room().lastOpenedAt, now())}</div>
                  </div>
                  <div class="room-actions">
                    <button class="primary-button" type="button" onClick={() => void handleOpenRoom(room())}>Open</button>
                    <button class="secondary-button" type="button" onClick={() => void handleCopyBoardLink(room())}>Copy link</button>
                  </div>
                </article>
              )}
            </Show>
          </div>

          <form class="create-form" onSubmit={(event) => void handleCreateBoard(event)}>
            <input ref={createTitleInput} type="text" maxLength="80" placeholder="New board name" />
            <button class="primary-button" type="submit">Create board</button>
          </form>
        </section>

        <section class="toolbar">
          <form class="add-form" onSubmit={(event) => void handleAddBoard(event)}>
            <div class="paste-field">
              <input ref={boardLinkInput} type="text" spellcheck={false} autocomplete="off" placeholder="Paste Excalidraw board link" />
              <span class="paste-prefix">URL</span>
            </div>
            <button class="secondary-button" type="submit">Add board</button>
          </form>
        </section>

        <section class="manager">
          <div class="section-title">
            <h2>Saved rooms</h2>
            <div class="segmented" role="tablist" aria-label="Room filter">
              <FilterButton filter="active" selected={filter()} onSelect={setFilter} />
              <FilterButton filter="inactive" selected={filter()} onSelect={setFilter} />
              <FilterButton filter="all" selected={filter()} onSelect={setFilter} />
            </div>
          </div>

          <div class="room-list">
            <Show when={filteredRooms().length} fallback={<div class="empty-state">No {filter()} boards.</div>}>
              <For each={filteredRooms()}>
                {(room) => (
                  <article class="room-card">
                    <div class="room-main">
                      <div class="room-title">{room.title}</div>
                      <div class="room-url" title={room.url}>{room.url}</div>
                      <div class="room-meta">
                        <span class={`status-pill ${room.status === "inactive" ? "is-inactive" : ""}`}>{room.status}</span>
                        <span>Last opened {formatRelativeTime(room.lastOpenedAt, now())}</span>
                      </div>
                    </div>
                    <div class="room-actions">
                      <button class="primary-button" type="button" onClick={() => void handleOpenRoom(room)}>Open</button>
                      <button class="secondary-button" type="button" onClick={() => void handleCopyBoardLink(room)}>Copy link</button>
                      <button class="small-button" type="button" onClick={() => void handleToggleStatus(room)}>
                        {room.status === "active" ? "Archive" : "Activate"}
                      </button>
                      <button class="small-button" type="button" onClick={() => void handleRename(room)}>Rename</button>
                      <button class="danger-button" type="button" onClick={() => void handleRemove(room)}>Remove</button>
                    </div>
                  </article>
                )}
              </For>
            </Show>
          </div>
        </section>
      </Show>

      <Show when={toast()}>
        <div class="toast" role="status" aria-live="polite">{toast()}</div>
      </Show>
    </main>
  );
}

function FilterButton(props: {
  filter: Filter;
  selected: Filter;
  onSelect: (filter: Filter) => void;
}) {
  return (
    <button
      class={`segment ${props.filter === props.selected ? "is-selected" : ""}`}
      type="button"
      role="tab"
      aria-selected={props.filter === props.selected}
      onClick={() => props.onSelect(props.filter)}
    >
      {capitalize(props.filter)}
    </button>
  );
}

function getSyncStatus(workspace: Workspace, joined: boolean, now: number): string {
  if (!joined) {
    return "Create or join a session.";
  }

  if (!workspace.memberName) {
    return "Enter your name in settings.";
  }

  if (!workspace.endpoint) {
    return "Sync endpoint not set.";
  }

  if (workspace.lastError) {
    return `Sync error: ${workspace.lastError}`;
  }

  return workspace.lastSyncAt ? `Synced ${formatRelativeTime(workspace.lastSyncAt, now)}` : "Sync ready";
}

function getSyncBlockedMessage(workspace: Workspace, joined: boolean): string {
  if (!joined) {
    return "Create or join a session first";
  }

  if (!workspace.memberName) {
    return "Enter your name first";
  }

  return workspace.endpoint ? "Sync is not ready" : "Set a sync endpoint first";
}

function getVisibleMembers(workspace: Workspace, now: number): WorkspaceMember[] {
  const members = Array.isArray(workspace.members) ? [...workspace.members] : [];
  const selfMember = {
    clientId: workspace.clientId,
    name: workspace.memberName,
    lastSeenAt: now,
  };
  const index = members.findIndex((member) => member.clientId === selfMember.clientId);

  if (!selfMember.name) {
    return members
      .filter((member) => member.name && member.lastSeenAt && now - member.lastSeenAt < 90000)
      .sort((left, right) => Number(right.lastSeenAt) - Number(left.lastSeenAt));
  }

  if (index >= 0) {
    members[index] = selfMember;
  } else {
    members.unshift(selfMember);
  }

  return members
    .filter((member) => member.name && member.lastSeenAt && now - member.lastSeenAt < 90000)
    .sort((left, right) => Number(right.lastSeenAt) - Number(left.lastSeenAt));
}

function capitalize(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function loadThemeMode(): ThemeMode {
  const mode = localStorage.getItem(THEME_STORAGE_KEY);
  return THEME_MODES.includes(mode as ThemeMode) ? (mode as ThemeMode) : "system";
}

function applyThemeMode(mode: ThemeMode): void {
  document.documentElement.dataset.theme = THEME_MODES.includes(mode) ? mode : "system";
}
