import { ArrowRight, Clock3, Plus } from "lucide-solid";
import { For, Show, createSignal } from "solid-js";
import { text } from "../i18n";
import type { RecentRoom, Workspace } from "../types";
import { normalizeRoomCode } from "../workspace";
import { BrandMark } from "./BrandMark";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
  REGEXP_ONLY_DIGITS_AND_CHARS,
} from "./ui/input-otp";

type LandingPageProps = {
  workspace: Workspace;
  recentRooms: RecentRoom[];
  initialCode: string;
  busy: boolean;
  onJoin: (details: { code: string; name: string }) => Promise<void>;
  onRecentJoin: (room: RecentRoom, name: string) => Promise<void>;
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
    <main class="landing-page relative flex h-dvh flex-col overflow-hidden bg-background">
      <div class="absolute inset-0 landing-grid opacity-45" aria-hidden="true" />
      <header class="landing-header relative z-10 mx-auto flex w-full max-w-6xl shrink-0 items-center justify-between px-5 py-4 sm:px-6 lg:px-8 lg:py-6">
        <div class="flex items-center gap-3">
          <BrandMark />
          <span class="text-sm font-semibold tracking-tight">{text.appName}</span>
        </div>
        <span class="hidden text-xs text-muted-foreground sm:block">{text.landing.tagline}</span>
      </header>

      <section class="landing-content relative z-10 mx-auto grid min-h-0 w-full max-w-6xl flex-1 items-center gap-7 px-5 py-3 sm:px-6 sm:py-5 lg:grid-cols-[1fr_460px] lg:gap-16 lg:px-8 lg:py-8">
        <div class="max-w-2xl">
          <h1 class="landing-title max-w-xl text-balance text-4xl font-semibold leading-[0.98] tracking-[-0.055em] sm:text-5xl lg:text-7xl">
            {text.landing.heroLead}
            <span class="block text-muted-foreground">{text.landing.heroAccent}</span>
          </h1>
          <p class="landing-description mt-4 max-w-lg text-pretty text-sm leading-6 text-muted-foreground sm:mt-5 sm:text-base sm:leading-7 lg:mt-7 lg:text-lg">
            {text.landing.description}
          </p>
        </div>

        <div class="landing-card rounded-xl border border-border bg-card p-2 shadow-2xl shadow-black/60">
          <div class="rounded-lg border border-border bg-background p-4 sm:p-6 lg:p-7">
            <div class="mb-4 sm:mb-6">
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

              <Button
                class="mt-2 w-full"
                size="lg"
                type="button"
                disabled={unavailable()}
                onClick={() => void generateRoom()}
              >
                <Plus class={`size-4 ${generating() ? "animate-pulse" : ""}`} />
                {generating() ? text.landing.generating : text.landing.generate}
              </Button>

              <div class="my-2 flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground sm:my-3">
                <span class="h-px flex-1 bg-border" />
                {text.landing.or}
                <span class="h-px flex-1 bg-border" />
              </div>

              <div class="flex items-center gap-2">
                <InputOTP
                  class="min-w-0 flex-1 justify-center"
                  value={roomCode().replace("-", "")}
                  onValueChange={(value) => setRoomCode(normalizeRoomCode(value))}
                  maxLength={6}
                  pattern={REGEXP_ONLY_DIGITS_AND_CHARS}
                  disabled={unavailable()}
                  aria-label={text.landing.roomCode}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !unavailable()) {
                      event.preventDefault();
                      void props.onJoin({ code: roomCode(), name: name() });
                    }
                  }}
                >
                  <InputOTPGroup class="gap-1 sm:gap-2">
                    <InputOTPSlot class="size-10 uppercase sm:size-11" index={0} />
                    <InputOTPSlot class="size-10 uppercase sm:size-11" index={1} />
                    <InputOTPSlot class="size-10 uppercase sm:size-11" index={2} />
                  </InputOTPGroup>
                  <InputOTPSeparator />
                  <InputOTPGroup class="gap-1 sm:gap-2">
                    <InputOTPSlot class="size-10 uppercase sm:size-11" index={3} />
                    <InputOTPSlot class="size-10 uppercase sm:size-11" index={4} />
                    <InputOTPSlot class="size-10 uppercase sm:size-11" index={5} />
                  </InputOTPGroup>
                </InputOTP>
                <Button
                  class="h-11 self-center px-4 sm:h-12"
                  type="button"
                  disabled={unavailable()}
                  aria-label={text.landing.enterRoom}
                  onClick={() => void props.onJoin({ code: roomCode(), name: name() })}
                >
                  <ArrowRight class="size-4" />
                </Button>
              </div>
            </div>

            <Show when={props.recentRooms.length > 0}>
              <div class="landing-recent mt-5 border-t border-border pt-4 sm:mt-7 sm:pt-5">
                <div class="mb-3 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Clock3 class="size-3.5" />
                  {text.landing.recent}
                </div>
                <div class="grid gap-2">
                  <For each={props.recentRooms}>
                    {(room) => (
                      <button
                        type="button"
                        class="group flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2.5 text-left transition hover:bg-muted"
                        onClick={() => void props.onRecentJoin(room, name())}
                      >
                        <span class="min-w-0">
                          <span class="block truncate text-sm font-medium">{room.name}</span>
                          <span class="mt-0.5 block font-mono text-[10px] font-semibold tracking-[0.16em] text-muted-foreground">
                            {room.code}
                          </span>
                        </span>
                        <ArrowRight class="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                      </button>
                    )}
                  </For>
                </div>
              </div>
            </Show>
          </div>
        </div>
      </section>

      <footer class="landing-footer relative z-10 mx-auto flex w-full max-w-6xl shrink-0 items-center gap-2 px-5 py-3 text-xs text-muted-foreground sm:px-6 lg:px-8 lg:py-5">
        <span>{text.landing.footer}</span>
        <span aria-hidden="true">–</span>
        <a
          class="font-medium text-foreground underline-offset-4 hover:underline"
          href="https://tecera.ar"
          target="_blank"
          rel="noreferrer"
        >
          {text.landing.contact}
        </a>
      </footer>
    </main>
  );
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}
