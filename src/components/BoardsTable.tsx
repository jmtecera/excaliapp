import {
  Archive,
  ArchiveRestore,
  ArrowUpRight,
  Check,
  Clipboard,
  Pencil,
  X,
} from "lucide-solid";
import { For, Show, createSignal } from "solid-js";
import { formatDate } from "../format";
import { text } from "../i18n";
import type { RoomRecord } from "../types";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

type BoardsTableProps = {
  boards: RoomRecord[];
  archived: boolean;
  onOpen: (board: RoomRecord) => void;
  onCopy: (board: RoomRecord) => void;
  onArchive: (board: RoomRecord) => void;
  onRename: (board: RoomRecord, name: string) => void;
};

export function BoardsTable(props: BoardsTableProps) {
  return (
    <div class="overflow-hidden rounded-lg border border-border">
      <Show
        when={props.boards.length > 0}
        fallback={
          <div class="grid min-h-36 place-items-center bg-card px-6 text-center">
            <div>
              <p class="text-sm font-medium">{props.archived ? text.boards.noArchived : text.boards.noBoards}</p>
              <p class="mt-1 text-xs text-muted-foreground">
                {props.archived ? text.boards.archivedHint : text.boards.emptyHint}
              </p>
            </div>
          </div>
        }
      >
        <div class="hidden grid-cols-[minmax(0,1fr)_140px_210px] border-b border-border bg-muted/40 px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground sm:grid">
          <span>{text.boards.board}</span>
          <span>{text.boards.updated}</span>
          <span class="text-right">{text.boards.actions}</span>
        </div>
        <div class="divide-y divide-border bg-card">
          <For each={props.boards}>
            {(board) => (
              <BoardRow
                board={board}
                archived={props.archived}
                onOpen={props.onOpen}
                onCopy={props.onCopy}
                onArchive={props.onArchive}
                onRename={props.onRename}
              />
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

function BoardRow(props: {
  board: RoomRecord;
  archived: boolean;
  onOpen: (board: RoomRecord) => void;
  onCopy: (board: RoomRecord) => void;
  onArchive: (board: RoomRecord) => void;
  onRename: (board: RoomRecord, name: string) => void;
}) {
  const [editing, setEditing] = createSignal(false);
  const [name, setName] = createSignal(props.board.name);

  function saveName() {
    const value = name().trim();

    if (value && value !== props.board.name) {
      props.onRename(props.board, value);
    }

    setEditing(false);
  }

  return (
    <div class="grid gap-3 px-4 py-3.5 sm:grid-cols-[minmax(0,1fr)_140px_210px] sm:items-center">
      <div class="min-w-0">
        <Show
          when={editing()}
          fallback={
            <button
              type="button"
              class="group flex max-w-full items-center gap-2 text-left"
              onClick={() => props.onOpen(props.board)}
            >
              <span class="truncate text-sm font-medium text-foreground group-hover:underline">{props.board.name}</span>
              <ArrowUpRight class="size-3.5 shrink-0 text-muted-foreground" />
            </button>
          }
        >
          <div class="flex max-w-md items-center gap-1.5">
            <Input
              class="h-8"
              value={name()}
              maxlength={80}
              autofocus
              onInput={(event) => setName(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") saveName();
                if (event.key === "Escape") setEditing(false);
              }}
            />
            <Button variant="ghost" size="icon" class="size-8" type="button" onClick={saveName} aria-label={text.boards.saveName}>
              <Check class="size-3.5" />
            </Button>
            <Button variant="ghost" size="icon" class="size-8" type="button" onClick={() => setEditing(false)} aria-label={text.boards.cancel}>
              <X class="size-3.5" />
            </Button>
          </div>
        </Show>
        <p class="mt-1 truncate font-mono text-[11px] text-muted-foreground">{props.board.excalidrawUrl}</p>
      </div>

      <div class="flex items-center gap-2 text-xs text-muted-foreground">
        <Show when={props.archived}>
          <Badge>{text.boards.archived}</Badge>
        </Show>
        <span>{formatDate(props.board.updatedAt)}</span>
      </div>

      <div class="flex items-center justify-start gap-1 sm:justify-end">
        <Button
          class="mr-1"
          variant="secondary"
          size="sm"
          type="button"
          onClick={() => props.onOpen(props.board)}
        >
          <ArrowUpRight class="size-3.5" />
          {text.boards.openPrimary}
        </Button>
        <Button variant="ghost" size="icon" type="button" title={text.boards.copy} onClick={() => props.onCopy(props.board)}>
          <Clipboard class="size-4" />
        </Button>
        <Button variant="ghost" size="icon" type="button" title={text.boards.rename} onClick={() => setEditing(true)}>
          <Pencil class="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          type="button"
          title={props.archived ? text.boards.restore : text.boards.archive}
          onClick={() => props.onArchive(props.board)}
        >
          <Show when={props.archived} fallback={<Archive class="size-4" />}>
            <ArchiveRestore class="size-4" />
          </Show>
        </Button>
      </div>
    </div>
  );
}
