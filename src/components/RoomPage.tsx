import {
  ArrowLeft,
  Check,
  ChevronDown,
  Clock3,
  Clipboard,
  Cloud,
  CloudOff,
  Download,
  ExternalLink,
  Link2,
  LoaderCircle,
  LockKeyhole,
  Plus,
  RefreshCw,
  Settings2,
  Upload,
  X,
} from "lucide-solid";
import { For, Show, createEffect, createMemo, createSignal } from "solid-js";
import { downloadCsv, exportBoardsCsv, importBoardsCsv } from "../csv";
import { formatRelativeTime } from "../format";
import { text } from "../i18n";
import { formatWorkedTime, getPomodoroTotalSeconds } from "../pomodoro";
import type { CsvImportError, PomodoroAction, RoomRecord, Workspace } from "../types";
import { normalizeEmail } from "../workspace";
import { BoardsTable } from "./BoardsTable";
import { BrandMark } from "./BrandMark";
import { ParticipantGroup } from "./ParticipantGroup";
import { PomodoroCard } from "./PomodoroCard";
import { PreferencesMenu } from "./PreferencesMenu";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import { Input } from "./ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
  REGEXP_ONLY_DIGITS,
} from "./ui/input-otp";

type RoomPageProps = {
  workspace: Workspace;
  boards: RoomRecord[];
  now: number;
  busy: boolean;
  onLeave: () => void;
  onRefresh: () => void;
  onCopyCode: () => void;
  onCopyInvite: () => void;
  onRenameRoom: (name: string) => void;
  onUpdateProfile: (details: { name: string; email: string }) => void;
  onUpdatePin: (pin: string | null) => Promise<void>;
  onPomodoroAction: (action: PomodoroAction, durationMinutes?: number) => Promise<void>;
  onCreateBoard: (name: string) => Promise<void>;
  onAddBoard: (details: { name: string; url: string }) => Promise<void>;
  onImportBoards: (boards: RoomRecord[]) => void;
  onOpenBoard: (board: RoomRecord) => void;
  onCopyBoard: (board: RoomRecord) => void;
  onArchiveBoard: (board: RoomRecord) => void;
  onRenameBoard: (board: RoomRecord, name: string) => void;
};

export function RoomPage(props: RoomPageProps) {
  let fileInput!: HTMLInputElement;
  let lastRoomName = props.workspace.roomName;
  let lastPomodoroDuration = props.workspace.pomodoroDurationSeconds;
  const [boardName, setBoardName] = createSignal("");
  const [existingName, setExistingName] = createSignal("");
  const [existingUrl, setExistingUrl] = createSignal("");
  const [roomName, setRoomName] = createSignal(props.workspace.roomName);
  const [editingRoomName, setEditingRoomName] = createSignal(false);
  const [profileName, setProfileName] = createSignal(props.workspace.memberName);
  const [profileEmail, setProfileEmail] = createSignal(props.workspace.memberEmail);
  const [pin, setPin] = createSignal("");
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [durationMinutes, setDurationMinutes] = createSignal(
    String(Math.round(props.workspace.pomodoroDurationSeconds / 60)),
  );
  const [view, setView] = createSignal<"active" | "archived">("active");
  const [importErrors, setImportErrors] = createSignal<CsvImportError[]>([]);
  const [importSummary, setImportSummary] = createSignal("");
  const activeBoards = createMemo(() => props.boards.filter((board) => !board.archived));
  const archivedBoards = createMemo(() => props.boards.filter((board) => board.archived));
  const latestBoard = createMemo(() => activeBoards()[0] || null);
  const visibleBoards = createMemo(() =>
    view() === "active"
      ? activeBoards().filter((board) => board.id !== latestBoard()?.id)
      : archivedBoards(),
  );
  const totalWorkedSeconds = createMemo(() =>
    getPomodoroTotalSeconds(props.workspace, props.now),
  );

  createEffect(() => {
    const nextRoomName = props.workspace.roomName;

    if (nextRoomName !== lastRoomName) {
      lastRoomName = nextRoomName;
      setRoomName(nextRoomName);
    }
  });

  createEffect(() => {
    const nextDuration = props.workspace.pomodoroDurationSeconds;

    if (nextDuration !== lastPomodoroDuration) {
      lastPomodoroDuration = nextDuration;
      setDurationMinutes(String(Math.round(nextDuration / 60)));
    }
  });

  async function createBoard(event: SubmitEvent) {
    event.preventDefault();
    const value = boardName().trim();

    if (!value) {
      return;
    }

    await props.onCreateBoard(value);
    setBoardName("");
  }

  async function addExistingBoard(event: SubmitEvent) {
    event.preventDefault();
    await props.onAddBoard({ name: existingName(), url: existingUrl() });
    setExistingName("");
    setExistingUrl("");
  }

  async function importCsvFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) {
      return;
    }

    const result = importBoardsCsv(await file.text());
    setImportErrors(result.errors);

    if (result.boards.length > 0) {
      props.onImportBoards(result.boards);
    }

    setImportSummary(
      text().room.imported(result.boards.length, result.errors.length),
    );
    input.value = "";
  }

  function saveRoomName() {
    const value = roomName().trim();

    if (value) {
      props.onRenameRoom(value);
      setEditingRoomName(false);
    }
  }

  async function savePin() {
    if (!/^[0-9]{4}$/.test(pin())) {
      return;
    }

    await props.onUpdatePin(pin());
    setPin("");
  }

  async function disablePin() {
    await props.onUpdatePin(null);
    setPin("");
  }

  async function savePomodoroDuration() {
    const value = Number.parseInt(durationMinutes(), 10);

    if (!Number.isInteger(value) || value < 1 || value > 120) {
      return;
    }

    await props.onPomodoroAction("set-duration", value);
  }

  return (
    <main class="min-h-dvh bg-background">
      <header class="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur-xl">
        <div class="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-4 sm:px-6 lg:px-8">
          <Button variant="ghost" size="icon" type="button" title={text().room.leave} onClick={props.onLeave}>
            <ArrowLeft class="size-4" />
          </Button>
          <BrandMark />
          <div class="min-w-0 flex-1">
            <Show
              when={editingRoomName()}
              fallback={
                <button
                  type="button"
                  class="block max-w-full truncate text-left text-sm font-semibold tracking-tight hover:underline"
                  onClick={() => setEditingRoomName(true)}
                >
                  {props.workspace.roomName}
                </button>
              }
            >
              <div class="flex max-w-sm items-center gap-1">
                <Input
                  class="h-8"
                  value={roomName()}
                  maxlength={80}
                  autofocus
                  onInput={(event) => setRoomName(event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") saveRoomName();
                    if (event.key === "Escape") setEditingRoomName(false);
                  }}
                />
                <Button variant="ghost" size="icon" class="size-8" onClick={saveRoomName} aria-label={text().room.saveName}>
                  <Check class="size-3.5" />
                </Button>
                <Button variant="ghost" size="icon" class="size-8" onClick={() => setEditingRoomName(false)} aria-label={text().room.cancel}>
                  <X class="size-3.5" />
                </Button>
              </div>
            </Show>
            <button
              type="button"
              class="mt-0.5 flex items-center gap-1.5 font-mono text-[11px] font-medium tracking-[0.14em] text-muted-foreground hover:text-foreground"
              onClick={props.onCopyCode}
            >
              {props.workspace.roomCode}
              <Clipboard class="size-3" />
            </button>
          </div>

          <div class="hidden items-center gap-3 sm:flex">
            <ParticipantGroup members={props.workspace.members} selfId={props.workspace.clientId} />
            <div class="h-5 w-px bg-border" />
          </div>
          <PreferencesMenu />
          <Button
            variant="ghost"
            size="icon"
            type="button"
            title={text().room.refresh}
            disabled={props.busy}
            onClick={props.onRefresh}
          >
            <RefreshCw class={`size-4 ${props.busy ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </header>

      <div class="room-page-content mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <section class="grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div>
            <div class="mb-5 flex items-end justify-between gap-4">
              <div>
                <p class="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">{text().room.newBoard}</p>
                <h1 class="mt-2 text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">{text().room.question}</h1>
              </div>
              <div class="sm:hidden">
                <ParticipantGroup members={props.workspace.members} selfId={props.workspace.clientId} />
              </div>
            </div>

            <form
              class="flex flex-col gap-2 rounded-xl border border-border bg-card p-2 shadow-xl shadow-black/40 sm:flex-row sm:items-center"
              onSubmit={(event) => void createBoard(event)}
            >
              <Input
                class="h-14 flex-1 border-transparent bg-transparent px-4 text-base shadow-none focus-visible:border-transparent focus-visible:ring-0"
                value={boardName()}
                maxlength={80}
                placeholder={text().room.boardName}
                autofocus
                onInput={(event) => setBoardName(event.currentTarget.value)}
              />
              <Button class="h-14 px-6" size="lg" type="submit" disabled={props.busy || !boardName().trim()}>
                <Show when={props.busy} fallback={<Plus class="size-4" />}>
                  <LoaderCircle class="size-4 animate-spin" />
                </Show>
                {text().room.createBoard}
              </Button>
            </form>

            <details class="group mt-3">
              <summary class="inline-flex cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
                <Link2 class="size-3.5" />
                {text().room.addExisting}
                <ChevronDown class="size-3 transition-transform group-open:rotate-180" />
              </summary>
              <form
                class="mt-3 grid gap-2 rounded-lg border border-border bg-card p-3 sm:grid-cols-[180px_minmax(0,1fr)_auto]"
                onSubmit={(event) => void addExistingBoard(event)}
              >
                <Input
                  value={existingName()}
                  maxlength={80}
                  placeholder={text().room.boardName}
                  onInput={(event) => setExistingName(event.currentTarget.value)}
                />
                <Input
                  value={existingUrl()}
                  placeholder="https://excalidraw.com/#room=..."
                  spellcheck={false}
                  onInput={(event) => setExistingUrl(event.currentTarget.value)}
                />
                <Button variant="secondary" type="submit">{text().room.addLink}</Button>
              </form>
            </details>

            <div class="mt-5">
              <PomodoroCard
                workspace={props.workspace}
                now={props.now}
                busy={props.busy}
                onAction={props.onPomodoroAction}
              />
            </div>
          </div>

          <aside class="rounded-xl border border-border bg-card p-5">
            <div class="flex items-start justify-between">
              <div>
                <p class="text-sm font-semibold">{text().room.details}</p>
                <p class="mt-1 text-xs text-muted-foreground">{text().room.shareHint}</p>
              </div>
              <Badge class={props.workspace.lastError ? "text-destructive" : ""}>
                <Show when={props.workspace.lastError} fallback={<Cloud class="mr-1 size-3" />}>
                  <CloudOff class="mr-1 size-3" />
                </Show>
                {props.workspace.lastError ? text().room.offline : text().room.synced}
              </Badge>
            </div>
            <button
              type="button"
              class="mt-5 flex w-full items-center justify-between rounded-lg border border-border bg-background px-3 py-3 text-left transition hover:bg-muted"
              onClick={props.onCopyCode}
            >
              <div>
                <p class="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">{text().room.roomCode}</p>
                <p class="mt-1 font-mono text-lg font-semibold tracking-[0.2em]">{props.workspace.roomCode}</p>
              </div>
              <Clipboard class="size-4 text-muted-foreground" />
            </button>
            <Button class="mt-2 w-full" variant="secondary" size="sm" type="button" onClick={props.onCopyInvite}>
              <Link2 class="size-3.5" />
              {text().room.copyInvite}
            </Button>
            <p class="mt-4 text-xs leading-5 text-muted-foreground">
              {props.workspace.lastSyncAt
                ? `${text().room.updated} ${formatRelativeTime(props.workspace.lastSyncAt, props.now)}`
                : text().room.waitingSync}
            </p>

            <details class="group mt-5 border-t border-border pt-4">
              <summary class="flex cursor-pointer list-none items-center justify-between text-xs font-medium">
                <span class="flex items-center gap-2"><Settings2 class="size-3.5" />{text().room.profile}</span>
                <ChevronDown class="size-3.5 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <div class="mt-3 grid gap-2">
                <Input value={profileName()} maxlength={60} onInput={(event) => setProfileName(event.currentTarget.value)} placeholder={text().landing.name} />
                <Input value={profileEmail()} maxlength={254} type="email" onInput={(event) => setProfileEmail(event.currentTarget.value)} placeholder={text().room.email} />
                <Button
                  variant="secondary"
                  size="sm"
                  type="button"
                  onClick={() => props.onUpdateProfile({ name: profileName(), email: normalizeEmail(profileEmail()) })}
                >
                  {text().room.saveProfile}
                </Button>
              </div>
            </details>

            <button
              type="button"
              class="mt-4 flex w-full items-center justify-between border-t border-border pt-4 text-xs font-medium"
              onClick={() => setSettingsOpen(true)}
            >
              <span class="flex items-center gap-2"><LockKeyhole class="size-3.5" />{text().room.settings}</span>
              <span class="text-muted-foreground">{text().room.openSettings}</span>
            </button>
          </aside>
        </section>

        <Dialog
          open={settingsOpen()}
          onOpenChange={setSettingsOpen}
          title={text().room.settings}
          description={text().room.settingsDescription}
        >
          <div class="grid gap-6">
            <section>
              <p class="text-sm font-medium">{text().room.roomName}</p>
              <p class="mt-1 text-xs leading-5 text-muted-foreground">{text().room.roomNameDescription}</p>
              <div class="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                <Input
                  value={roomName()}
                  maxlength={80}
                  onInput={(event) => setRoomName(event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") saveRoomName();
                  }}
                />
                <Button
                  variant="secondary"
                  type="button"
                  disabled={!roomName().trim() || roomName().trim() === props.workspace.roomName}
                  onClick={saveRoomName}
                >
                  {text().room.saveName}
                </Button>
              </div>
            </section>

            <section class="border-t border-border pt-5">
              <div class="flex items-center gap-2">
                <Clock3 class="size-4 text-muted-foreground" />
                <p class="text-sm font-medium">{text().pomodoro.settingsTitle}</p>
              </div>
              <p class="mt-1 text-xs leading-5 text-muted-foreground">
                {text().pomodoro.settingsDescription}
              </p>
              <div class="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                <Input
                  value={durationMinutes()}
                  type="number"
                  min="1"
                  max="120"
                  inputmode="numeric"
                  aria-label={text().pomodoro.duration}
                  onInput={(event) => setDurationMinutes(event.currentTarget.value)}
                />
                <Button
                  variant="secondary"
                  type="button"
                  disabled={
                    props.busy ||
                    !/^[0-9]+$/.test(durationMinutes()) ||
                    Number(durationMinutes()) < 1 ||
                    Number(durationMinutes()) > 120 ||
                    Number(durationMinutes()) ===
                      Math.round(props.workspace.pomodoroDurationSeconds / 60)
                  }
                  onClick={() => void savePomodoroDuration()}
                >
                  {text().pomodoro.saveDuration}
                </Button>
              </div>
              <p class="mt-1 text-[11px] text-muted-foreground">{text().pomodoro.durationRange}</p>
              <div class="mt-3 flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
                <div>
                  <p class="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    {text().pomodoro.totalWorked}
                  </p>
                  <p class="mt-1 font-mono text-base font-semibold tabular-nums">
                    {formatWorkedTime(totalWorkedSeconds())}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  disabled={props.busy || totalWorkedSeconds() === 0}
                  onClick={() => void props.onPomodoroAction("reset-total")}
                >
                  {text().pomodoro.resetTotal}
                </Button>
              </div>
            </section>

            <section class="border-t border-border pt-5">
              <div class="flex items-center justify-between gap-3">
                <p class="text-sm font-medium">{text().room.pinProtection}</p>
                <Badge>{props.workspace.pinEnabled ? text().room.pinEnabled : text().room.pinDisabled}</Badge>
              </div>
              <p class="mt-1 text-xs leading-5 text-muted-foreground">{text().room.pinDescription}</p>
              <InputOTP
                class="mt-3"
                value={pin()}
                onValueChange={setPin}
                maxLength={4}
                pattern={REGEXP_ONLY_DIGITS}
                disabled={props.busy}
                aria-label={text().room.pinPlaceholder}
              >
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                </InputOTPGroup>
              </InputOTP>
              <div class="mt-3 flex items-center gap-2">
                <Button
                  variant="secondary"
                  type="button"
                  disabled={props.busy || pin().length !== 4}
                  onClick={() => void savePin()}
                >
                  {props.workspace.pinEnabled ? text().room.changePin : text().room.enablePin}
                </Button>
                <Show when={props.workspace.pinEnabled}>
                  <Button
                    variant="ghost"
                    type="button"
                    disabled={props.busy}
                    onClick={() => void disablePin()}
                  >
                    {text().room.disablePin}
                  </Button>
                </Show>
              </div>
            </section>
          </div>
        </Dialog>

        <section class="mt-8">
          <div class="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div class="flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1">
              <button
                type="button"
                class={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                  view() === "active" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
                }`}
                onClick={() => setView("active")}
              >
                {text().room.active} <span class="ml-1 text-muted-foreground">{activeBoards().length}</span>
              </button>
              <button
                type="button"
                class={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                  view() === "archived" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
                }`}
                onClick={() => setView("archived")}
              >
                {text().room.archived} <span class="ml-1 text-muted-foreground">{archivedBoards().length}</span>
              </button>
            </div>

            <div class="flex items-center gap-2">
              <input ref={fileInput} class="hidden" type="file" accept=".csv,text/csv" onChange={(event) => void importCsvFile(event)} />
              <Button variant="secondary" size="sm" type="button" onClick={() => fileInput.click()}>
                <Upload class="size-3.5" />
                {text().room.importCsv}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                type="button"
                disabled={props.boards.length === 0}
                onClick={() =>
                  downloadCsv(
                    `${props.workspace.roomCode.toLowerCase()}-boards.csv`,
                    exportBoardsCsv(props.workspace, props.boards),
                  )
                }
              >
                <Download class="size-3.5" />
                {text().room.exportCsv}
              </Button>
            </div>
          </div>

          <Show when={importSummary()}>
            <div class={`mb-4 rounded-lg border p-3 text-xs ${importErrors().length > 0 ? "border-destructive/30 bg-destructive/5" : "border-border bg-muted/40"}`}>
              <div class="flex items-center justify-between gap-3">
                <p class="font-medium">{importSummary()}</p>
                <button type="button" class="text-muted-foreground hover:text-foreground" onClick={() => setImportSummary("")}>
                  <X class="size-3.5" />
                </button>
              </div>
              <Show when={importErrors().length > 0}>
                <ul class="mt-2 space-y-1 text-muted-foreground">
                  <For each={importErrors().slice(0, 5)}>
                    {(error) => <li>{text().room.row} {error.row}: {error.message}</li>}
                  </For>
                  <Show when={importErrors().length > 5}>
                    <li>{text().room.moreInvalid(importErrors().length - 5)}</li>
                  </Show>
                </ul>
              </Show>
            </div>
          </Show>

          <Show when={view() === "active" && latestBoard()}>
            {(board) => (
              <div class="relative mb-4 overflow-hidden rounded-xl border border-border bg-muted/35 shadow-lg shadow-black/20">
                <div class="grid gap-6 p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-6">
                  <div class="min-w-0">
                    <p class="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      {text().room.latestBoard}
                    </p>
                    <h2 class="mt-2 truncate text-xl font-semibold tracking-tight">{board().name}</h2>
                    <p class="mt-1 truncate font-mono text-[11px] text-muted-foreground">{board().excalidrawUrl}</p>
                    <p class="mt-3 text-xs text-muted-foreground">{text().room.latestBoardHint}</p>
                  </div>
                  <div class="flex items-center gap-2">
                    <Button
                      size="lg"
                      type="button"
                      onClick={() => props.onOpenBoard(board())}
                    >
                      <ExternalLink class="size-4" />
                      {text().boards.open}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      class="size-12"
                      type="button"
                      title={text().boards.copy}
                      onClick={() => props.onCopyBoard(board())}
                    >
                      <Clipboard class="size-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </Show>

          <Show when={view() === "archived" || visibleBoards().length > 0 || !latestBoard()}>
            <BoardsTable
              boards={visibleBoards()}
              archived={view() === "archived"}
              onOpen={props.onOpenBoard}
              onCopy={props.onCopyBoard}
              onArchive={props.onArchiveBoard}
              onRename={props.onRenameBoard}
            />
          </Show>
        </section>
      </div>
    </main>
  );
}
