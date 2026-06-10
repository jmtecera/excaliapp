import { Clock3, Pause, Play, RotateCcw } from "lucide-solid";
import { Show, createMemo } from "solid-js";
import { text } from "../i18n";
import { formatTimer, formatWorkedTime, getPomodoroRemainingSeconds, getPomodoroTotalSeconds } from "../pomodoro";
import type { PomodoroAction, Workspace } from "../types";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";

export function PomodoroCard(props: {
  workspace: Workspace;
  now: number;
  busy: boolean;
  onAction: (action: PomodoroAction, durationMinutes?: number) => Promise<void>;
}) {
  const seconds = createMemo(() => getPomodoroRemainingSeconds(props.workspace, props.now));
  const totalSeconds = createMemo(() => getPomodoroTotalSeconds(props.workspace, props.now));
  const running = createMemo(
    () => props.workspace.pomodoroStatus === "running" && seconds() > 0,
  );
  const statusLabel = createMemo(() => {
    if (running()) return text.pomodoro.focusing;
    if (props.workspace.pomodoroStatus === "paused" && seconds() > 0) return text.pomodoro.paused;
    if (seconds() === 0) return text.pomodoro.complete;
    return text.pomodoro.ready;
  });

  return (
    <section class="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div class="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div class="flex min-w-0 flex-1 items-center gap-3">
          <div class="grid size-10 shrink-0 place-items-center rounded-lg border border-border bg-background">
            <Clock3 class="size-4 text-muted-foreground" />
          </div>
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <p class="text-sm font-semibold tracking-tight">{text.pomodoro.title}</p>
              <Badge>{statusLabel()}</Badge>
            </div>
            <p class="mt-1 truncate text-xs text-muted-foreground">
              {text.pomodoro.description(Math.round(props.workspace.pomodoroDurationSeconds / 60))}
            </p>
            <p class="mt-1 text-[11px] text-muted-foreground">
              {text.pomodoro.totalWorked}: <span class="font-medium text-foreground">{formatWorkedTime(totalSeconds())}</span>
            </p>
          </div>
        </div>

        <div class="flex items-center justify-between gap-4 sm:justify-end">
          <p class="min-w-20 font-mono text-2xl font-semibold tracking-[-0.04em] tabular-nums">
            {formatTimer(seconds())}
          </p>
          <div class="flex items-center gap-1">
            <Button
              variant="secondary"
              size="sm"
              type="button"
              disabled={props.busy}
              onClick={() => void props.onAction(running() ? "pause" : "start")}
            >
              <Show when={running()} fallback={<Play class="size-3.5" />}>
                <Pause class="size-3.5" />
              </Show>
              {running() ? text.pomodoro.pause : text.pomodoro.start}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              class="size-8"
              type="button"
              title={text.pomodoro.reset}
              disabled={props.busy}
              onClick={() => void props.onAction("reset")}
            >
              <RotateCcw class="size-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
