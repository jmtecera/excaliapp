import { createRoomRecordFromUrl } from "./room";
import { text } from "./i18n";
import type { CsvImportResult, RoomRecord, Workspace } from "./types";

const IMPORT_COLUMNS = ["board_name", "excalidraw_url", "archived"];

export function exportBoardsCsv(workspace: Workspace, boards: RoomRecord[]): string {
  const header = [
    "room_name",
    "room_code",
    "board_name",
    "excalidraw_url",
    "archived",
    "created_at",
    "updated_at",
  ];
  const rows = boards.map((board) => [
    workspace.roomName,
    workspace.roomCode,
    board.name,
    board.excalidrawUrl,
    String(board.archived),
    new Date(board.createdAt).toISOString(),
    new Date(board.updatedAt).toISOString(),
  ]);

  return [header, ...rows].map((row) => row.map(escapeCsvCell).join(",")).join("\n");
}

export function importBoardsCsv(csv: string): CsvImportResult {
  const rows = parseCsv(csv);

  if (rows.length === 0) {
    return { boards: [], errors: [{ row: 1, message: text().csv.empty }] };
  }

  const header = rows[0]?.map((cell) => cell.trim().toLowerCase()) || [];
  const missingColumns = IMPORT_COLUMNS.filter((column) => !header.includes(column));

  if (missingColumns.length > 0) {
    return {
      boards: [],
      errors: [{ row: 1, message: text().csv.missingColumns(missingColumns) }],
    };
  }

  const nameIndex = header.indexOf("board_name");
  const urlIndex = header.indexOf("excalidraw_url");
  const archivedIndex = header.indexOf("archived");
  const boards: RoomRecord[] = [];
  const errors: CsvImportResult["errors"] = [];

  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index] || [];

    if (row.every((cell) => !cell.trim())) {
      continue;
    }

    const boardName = (row[nameIndex] || "").trim();
    const url = (row[urlIndex] || "").trim();
    const archivedValue = (row[archivedIndex] || "").trim().toLowerCase();

    if (!boardName) {
      errors.push({ row: index + 1, message: text().csv.nameRequired });
      continue;
    }

    if (!["", "true", "false", "1", "0", "yes", "no"].includes(archivedValue)) {
      errors.push({ row: index + 1, message: text().csv.archivedBoolean });
      continue;
    }

    try {
      boards.push(
        createRoomRecordFromUrl({
          name: boardName,
          url,
          archived: ["true", "1", "yes"].includes(archivedValue),
        }),
      );
    } catch (error) {
      errors.push({
        row: index + 1,
        message: error instanceof Error ? error.message : text().csv.invalidUrl,
      });
    }
  }

  return { boards, errors };
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function escapeCsvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function parseCsv(value: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    const nextCharacter = value[index + 1];

    if (character === '"' && quoted && nextCharacter === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && nextCharacter === "\n") {
        index += 1;
      }
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }

  if (cell || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}
