import type { Workspace } from "./types";

export function getPomodoroRemainingSeconds(workspace: Workspace, now: number): number {
  if (workspace.pomodoroStatus === "running" && workspace.pomodoroEndsAt) {
    return Math.max(0, Math.ceil((workspace.pomodoroEndsAt - now) / 1000));
  }

  return workspace.pomodoroRemainingSeconds;
}

export function getPomodoroTotalSeconds(workspace: Workspace, now: number): number {
  if (
    workspace.pomodoroStatus !== "running" ||
    !workspace.pomodoroStartedAt ||
    !workspace.pomodoroEndsAt
  ) {
    return workspace.pomodoroAccumulatedSeconds;
  }

  const segmentSeconds = Math.max(
    0,
    Math.round((workspace.pomodoroEndsAt - workspace.pomodoroStartedAt) / 1000),
  );
  const elapsedSeconds = Math.max(
    0,
    Math.min(segmentSeconds, Math.floor((now - workspace.pomodoroStartedAt) / 1000)),
  );

  return workspace.pomodoroAccumulatedSeconds + elapsedSeconds;
}

export function formatTimer(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function formatWorkedTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
