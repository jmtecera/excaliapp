import { X } from "lucide-solid";
import { Portal } from "solid-js/web";
import { Show, createEffect, onCleanup, type JSX } from "solid-js";
import { Button } from "./button";

export function Dialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: JSX.Element;
}) {
  createEffect(() => {
    if (!props.open) return;

    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") props.onOpenChange(false);
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    onCleanup(() => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    });
  });

  return (
    <Show when={props.open}>
      <Portal>
        <div
          class="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) props.onOpenChange(false);
          }}
        >
          <section
            class="relative max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-background p-6 shadow-2xl shadow-black/50"
            role="dialog"
            aria-modal="true"
            aria-labelledby="room-settings-title"
            aria-describedby={props.description ? "room-settings-description" : undefined}
          >
            <div class="pr-10">
              <h2 id="room-settings-title" class="text-lg font-semibold tracking-tight">
                {props.title}
              </h2>
              <Show when={props.description}>
                <p id="room-settings-description" class="mt-1 text-sm text-muted-foreground">
                  {props.description}
                </p>
              </Show>
            </div>
            <Button
              class="absolute right-4 top-4"
              variant="ghost"
              size="icon"
              type="button"
              aria-label="Close"
              onClick={() => props.onOpenChange(false)}
            >
              <X class="size-4" />
            </Button>
            <div class="mt-6">{props.children}</div>
          </section>
        </div>
      </Portal>
    </Show>
  );
}
