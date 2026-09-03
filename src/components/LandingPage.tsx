import { ArrowRight, Clock3, LoaderCircle, Plus, ShieldCheck } from "lucide-solid";
import { For, Show, createSignal, onCleanup, onMount } from "solid-js";
import { text } from "../i18n";
import type { RecentRoom, Workspace } from "../types";
import { normalizeRoomCode } from "../workspace";
import { BrandMark } from "./BrandMark";
import { PreferencesMenu } from "./PreferencesMenu";
import { TurnstileChallenge } from "./TurnstileChallenge";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import { Input } from "./ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
  REGEXP_ONLY_DIGITS_AND_CHARS,
} from "./ui/input-otp";

const VISIBLE_RECENT_ROOMS = 3;

type LandingPageProps = {
  workspace: Workspace;
  recentRooms: RecentRoom[];
  initialCode: string;
  busy: boolean;
  onJoin: (details: { code: string; name: string }) => Promise<void>;
  onRecentJoin: (room: RecentRoom, name: string) => Promise<void>;
  onCreate: (details: { name: string; turnstileToken?: string }) => Promise<string>;
  onOpenGenerated: (code: string) => void;
};

const TURNSTILE_ENABLED = String(import.meta.env.VITE_TURNSTILE_ENABLED || "") === "true";
const TURNSTILE_SITE_KEY = String(import.meta.env.VITE_TURNSTILE_SITE_KEY || "").trim();
const USE_TURNSTILE = TURNSTILE_ENABLED || Boolean(TURNSTILE_SITE_KEY);

export function LandingPage(props: LandingPageProps) {
  let heroRef!: HTMLDivElement;
  let cardRef!: HTMLDivElement;
  const [roomCode, setRoomCode] = createSignal(props.initialCode);
  const [name, setName] = createSignal(props.workspace.memberName);
  const [generating, setGenerating] = createSignal(false);
  const [challengeOpen, setChallengeOpen] = createSignal(false);
  const [challengeToken, setChallengeToken] = createSignal("");
  const [challengeError, setChallengeError] = createSignal("");
  const unavailable = () => props.busy || generating();

  onMount(() => {
    let disposed = false;
    let revertMedia: (() => void) | undefined;

    void import("gsap").then(({ gsap }) => {
      if (disposed) return;

      const media = gsap.matchMedia();
      media.add(
        "(prefers-reduced-motion: no-preference)",
        () => {
          const words = [...heroRef.querySelectorAll<HTMLElement>("[data-hero-word]")];
          const description = heroRef.querySelector<HTMLElement>("[data-hero-description]");
          const animatedTargets = [
            ...words,
            ...(description ? [description] : []),
            cardRef,
          ];
          const timeline = gsap.timeline({
            defaults: { ease: "power4.out" },
            onComplete: () => gsap.set(animatedTargets, { clearProps: "all" }),
          });

          gsap.set(animatedTargets, { willChange: "transform, opacity, filter" });

          timeline.from(words, {
            autoAlpha: 0,
            y: 38,
            rotationX: -18,
            filter: "blur(6px)",
            duration: 0.72,
            stagger: { each: 0.055, from: "start" },
          });

          if (description) {
            timeline.from(
              description,
              { autoAlpha: 0, y: 16, filter: "blur(4px)", duration: 0.5 },
              "-=0.42",
            );
          }

          timeline.from(
            cardRef,
            { autoAlpha: 0, y: 32, scale: 0.965, duration: 0.78 },
            "-=0.28",
          );

          return () => {
            timeline.kill();
            gsap.set(animatedTargets, { clearProps: "all" });
          };
        },
        heroRef,
      );
      revertMedia = () => media.revert();
    });

    onCleanup(() => {
      disposed = true;
      revertMedia?.();
    });
  });

  function handleCreateClick() {
    if (unavailable()) return;

    if (!name().trim() || !USE_TURNSTILE) {
      void generateRoom();
      return;
    }

    setChallengeToken("");
    setChallengeError("");
    setChallengeOpen(true);
  }

  function handleChallengeOpenChange(open: boolean) {
    setChallengeOpen(open);

    if (!open) {
      setChallengeToken("");
      setChallengeError("");
    }
  }

  function handleChallengeToken(token: string) {
    setChallengeToken(token);

    if (token) {
      setChallengeError("");
    }
  }

  function submitCreate() {
    const token = challengeToken();

    if (!token) {
      setChallengeError(text().landing.verificationRequired);
      return;
    }

    handleChallengeOpenChange(false);
    void generateRoom(token);
  }

  async function generateRoom(turnstileToken = "") {
    setGenerating(true);
    setRoomCode("");

    try {
      const generatedCode = await props.onCreate({ name: name(), turnstileToken });

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
    <main class="landing-page relative flex min-h-dvh flex-col overflow-x-hidden bg-background">
      <header class="landing-header relative z-10 mx-auto w-full max-w-6xl shrink-0 px-5 py-4 sm:px-6 lg:px-8 lg:py-6">
        <div class="flex items-center justify-between gap-4">
          <div class="flex items-center gap-3">
            <BrandMark />
            <span class="text-sm font-semibold tracking-tight">{text().appName}</span>
          </div>
          <span class="hidden text-xs text-muted-foreground sm:block">{text().landing.tagline}</span>
        </div>
      </header>

      <section class="landing-content relative z-10 mx-auto grid min-h-0 w-full max-w-6xl flex-1 items-center gap-7 px-5 py-3 sm:px-6 sm:py-5 lg:grid-cols-[1fr_460px] lg:gap-16 lg:px-8 lg:py-8">
        <div ref={heroRef} class="landing-hero max-w-2xl">
            <h1
              class="landing-title max-w-xl text-balance text-4xl font-semibold leading-[0.98] tracking-[-0.055em] sm:text-5xl lg:text-7xl"
              aria-label={`${text().landing.heroLead} ${text().landing.heroAccent}`}
            >
              <AnimatedWordLine value={text().landing.heroLead} />
              <AnimatedWordLine value={text().landing.heroAccent} muted />
            </h1>
          <p data-hero-description class="landing-description mt-4 max-w-lg text-pretty text-sm leading-6 text-muted-foreground sm:mt-5 sm:text-base sm:leading-7 lg:mt-7 lg:text-lg">
            {text().landing.description}
          </p>
        </div>

        <div ref={cardRef} class="landing-card rounded-xl border border-border bg-card p-2 shadow-2xl shadow-black/60">
          <div class="rounded-lg border border-border bg-background p-4 sm:p-6 lg:p-7">
            <div class="mb-4 sm:mb-6">
              <h2 class="text-lg font-semibold tracking-tight">{text().landing.enterTitle}</h2>
              <p class="mt-1 text-sm text-muted-foreground">{text().landing.enterDescription}</p>
            </div>

            <div class="grid gap-3">
              <Input
                value={name()}
                onInput={(event) => setName(event.currentTarget.value)}
                placeholder={text().landing.name}
                autocomplete="name"
                maxlength={60}
                aria-label={text().landing.name}
              />

              <Button
                class="mt-2 w-full"
                size="lg"
                type="button"
                disabled={unavailable()}
                onClick={handleCreateClick}
              >
                <Plus class={`size-4 ${generating() ? "animate-pulse" : ""}`} />
                {generating() ? text().landing.generating : text().landing.generate}
              </Button>

              <div class="my-2 flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground sm:my-3">
                <span class="h-px flex-1 bg-border" />
                {text().landing.or}
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
                  aria-label={text().landing.roomCode}
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
                  aria-busy={props.busy}
                  aria-label={text().landing.enterRoom}
                  onClick={() => void props.onJoin({ code: roomCode(), name: name() })}
                >
                  <Show when={props.busy} fallback={<ArrowRight class="size-4" />}>
                    <LoaderCircle class="size-4 animate-spin" />
                  </Show>
                </Button>
              </div>
            </div>

            <Show when={props.recentRooms.length > 0}>
              <div class="landing-recent mt-5 border-t border-border pt-4 sm:mt-7 sm:pt-5">
                <div class="mb-3 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Clock3 class="size-3.5" />
                  {text().landing.recent}
                </div>
                <div class="grid gap-2">
                  <For each={props.recentRooms.slice(0, VISIBLE_RECENT_ROOMS)}>
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

      <footer class="landing-footer relative z-10 mx-auto flex w-full max-w-6xl shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-5 py-3 text-xs text-muted-foreground sm:px-6 lg:px-8 lg:py-5">
        <div class="landing-footer-copy flex min-w-0 items-center gap-2">
          <span class="truncate">{text().landing.footer}</span>
          <span aria-hidden="true">–</span>
          <a
            class="shrink-0 font-medium text-foreground underline-offset-4 hover:underline"
            href="https://tecera.com.ar"
            target="_blank"
            rel="noreferrer"
          >
            {text().landing.contact}
          </a>
        </div>
        <PreferencesMenu placement="top" variant="subtle" />
      </footer>

      <Dialog
        open={challengeOpen()}
        onOpenChange={handleChallengeOpenChange}
        title={text().landing.verificationTitle}
        description={text().landing.verificationDescription}
      >
        <div class="grid gap-5">
          <div class="rounded-lg border border-border bg-card p-3 sm:p-4">
            <Show
              when={TURNSTILE_SITE_KEY}
              fallback={
                <p class="py-4 text-center text-sm leading-6 text-muted-foreground" role="alert">
                  {text().landing.verificationUnavailable}
                </p>
              }
            >
              <TurnstileChallenge
                siteKey={TURNSTILE_SITE_KEY}
                onToken={handleChallengeToken}
                onError={() => setChallengeError(text().landing.verificationError)}
              />
            </Show>
          </div>

          <Show when={challengeError()}>
            <p class="-mt-2 text-sm leading-6 text-destructive" role="alert">
              {challengeError()}
            </p>
          </Show>

          <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" type="button" onClick={() => handleChallengeOpenChange(false)}>
              {text().landing.verificationCancel}
            </Button>
            <Button
              type="button"
              disabled={!challengeToken() || props.busy}
              onClick={submitCreate}
            >
              <Show when={props.busy} fallback={<ShieldCheck class="size-4" />}>
                <LoaderCircle class="size-4 animate-spin" />
              </Show>
              {text().landing.verificationContinue}
            </Button>
          </div>
        </div>
      </Dialog>
    </main>
  );
}

function AnimatedWordLine(props: { value: string; muted?: boolean }) {
  const words = () => props.value.trim().split(/\s+/).filter(Boolean);

  return (
    <span class={`block ${props.muted ? "text-muted-foreground" : ""}`} aria-hidden="true">
      <For each={words()}>
        {(word, index) => (
          <span class="hero-word" data-hero-word>
            {word}{index() < words().length - 1 ? "\u00a0" : ""}
          </span>
        )}
      </For>
    </span>
  );
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}
