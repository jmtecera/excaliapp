import { ArrowRight, Clock3, Plus } from "lucide-solid";
import { For, Index, Show, createSignal } from "solid-js";
import { text } from "../i18n";
import type { Workspace } from "../types";
import { normalizeRoomCode } from "../workspace";
import { BrandMark } from "./BrandMark";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

type LandingPageProps = {
  workspace: Workspace;
  recentCodes: string[];
  initialCode: string;
  busy: boolean;
  onJoin: (details: { code: string; name: string }) => Promise<void>;
  onCreate: (details: { name: string }) => Promise<string>;
  onOpenGenerated: (code: string) => void;
};

export function LandingPage(props: LandingPageProps) {
  const [roomCode, setRoomCode] = createSignal(props.initialCode);
  const [name, setName] = createSignal(props.workspace.memberName);
  const [generating, setGenerating] = createSignal(false);
  const unavailable = () => props.busy || generating();

  async function generateRoom() {
    setGenerating(true);
    setRoomCode("");

    try {
      const generatedCode = await props.onCreate({ name: name() });

      if (!generatedCode) {
        return;
      }

      for (let index = 1; index <= generatedCode.length; index += 1) {
        setRoomCode(generatedCode.slice(0, index));
        await wait(index === 4 ? 140 : 90);
      }

      await wait(260);
      props.onOpenGenerated(generatedCode);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <main class="relative flex min-h-dvh flex-col overflow-hidden bg-background">
      <div class="absolute inset-0 landing-grid opacity-45" aria-hidden="true" />
      <header class="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6 lg:px-8">
        <div class="flex items-center gap-3">
          <BrandMark />
          <span class="text-sm font-semibold tracking-tight">{text.appName}</span>
        </div>
        <span class="hidden text-xs text-muted-foreground sm:block">{text.landing.tagline}</span>
      </header>

      <section class="relative z-10 mx-auto grid w-full max-w-6xl flex-1 items-center gap-16 px-6 py-12 lg:grid-cols-[1fr_460px] lg:px-8 lg:py-20">
        <div class="max-w-2xl">
          <h1 class="max-w-xl text-balance text-5xl font-semibold leading-[0.98] tracking-[-0.055em] sm:text-6xl lg:text-7xl">
            {text.landing.heroLead}
            <span class="block text-muted-foreground">{text.landing.heroAccent}</span>
          </h1>
          <p class="mt-7 max-w-lg text-pretty text-base leading-7 text-muted-foreground sm:text-lg">
            {text.landing.description}
          </p>
        </div>

        <div class="rounded-xl border border-border bg-card p-2 shadow-2xl shadow-black/[0.06] dark:shadow-black/60">
          <div class="rounded-lg border border-border bg-background p-5 sm:p-7">
            <div class="mb-6">
              <h2 class="text-lg font-semibold tracking-tight">{text.landing.enterTitle}</h2>
              <p class="mt-1 text-sm text-muted-foreground">{text.landing.enterDescription}</p>
            </div>

            <div class="grid gap-3">
              <Input
                value={name()}
                onInput={(event) => setName(event.currentTarget.value)}
                placeholder={text.landing.name}
                autocomplete="name"
                maxlength={60}
                aria-label={text.landing.name}
              />
              <div class="mt-2 flex gap-2">
                <Show
                  when={generating()}
                  fallback={
                    <Input
                      class="h-12 font-mono text-base font-semibold uppercase tracking-[0.22em]"
                      value={roomCode()}
                      onInput={(event) => setRoomCode(normalizeRoomCode(event.currentTarget.value))}
                      placeholder="ABC-DEF"
                      maxlength={7}
                      spellcheck={false}
                      autocomplete="off"
                      aria-label={text.landing.roomCode}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void props.onJoin({ code: roomCode(), name: name() });
                        }
                      }}
                    />
                  }
                >
                  <div
                    class="flex h-12 w-full items-center rounded-md border border-input bg-background px-3 font-mono text-base font-semibold uppercase tracking-[0.22em] shadow-sm"
                    aria-label={text.landing.generating}
                    aria-live="polite"
                  >
                    <Show
                      when={roomCode()}
                      fallback={<span class="animate-pulse text-muted-foreground">···-···</span>}
                    >
                      <Index each={roomCode().split("")}>
                        {(letter) => <span class="code-letter">{letter()}</span>}
                      </Index>
                    </Show>
                  </div>
                </Show>
                <Button
                  class="h-12 px-4"
                  type="button"
                  disabled={unavailable()}
                  aria-label={text.landing.enterRoom}
                  onClick={() => void props.onJoin({ code: roomCode(), name: name() })}
                >
                  <ArrowRight class="size-4" />
                </Button>
              </div>
            </div>

            <div class="my-6 flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              <span class="h-px flex-1 bg-border" />
              {text.landing.or}
              <span class="h-px flex-1 bg-border" />
            </div>

            <Button
              class="w-full"
              variant="secondary"
              size="lg"
              type="button"
              disabled={unavailable()}
              onClick={() => void generateRoom()}
            >
              <Plus class={`size-4 ${generating() ? "animate-pulse" : ""}`} />
              {generating() ? text.landing.generating : text.landing.generate}
            </Button>

            <Show when={props.recentCodes.length > 0}>
              <div class="mt-7 border-t border-border pt-5">
                <div class="mb-3 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Clock3 class="size-3.5" />
                  {text.landing.recent}
                </div>
                <div class="flex flex-wrap gap-2">
                  <For each={props.recentCodes}>
                    {(code) => (
                      <button
                        type="button"
                        class="rounded-md border border-border bg-background px-3 py-1.5 font-mono text-xs font-semibold tracking-[0.14em] text-foreground transition hover:bg-muted"
                        onClick={() => setRoomCode(code)}
                      >
                        {code}
                      </button>
                    )}
                  </For>
                </div>
              </div>
            </Show>
          </div>
        </div>
      </section>

      <footer class="relative z-10 mx-auto w-full max-w-6xl px-6 py-6 text-xs text-muted-foreground lg:px-8">
        {text.landing.footer}
      </footer>
    </main>
  );
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}
