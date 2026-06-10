import { LockKeyhole, LoaderCircle, X } from "lucide-solid";
import { Show, createSignal } from "solid-js";
import { text } from "../i18n";
import { Button } from "./ui/button";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
  REGEXP_ONLY_DIGITS,
} from "./ui/input-otp";

export function PinPrompt(props: {
  busy: boolean;
  onSubmit: (pin: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [pin, setPin] = createSignal("");
  const [error, setError] = createSignal("");

  async function submit(event: SubmitEvent) {
    event.preventDefault();

    if (!/^[0-9]{4}$/.test(pin())) {
      setError(text.pin.invalid);
      return;
    }

    setError("");
    await props.onSubmit(pin());
  }

  return (
    <div class="modal-backdrop fixed inset-0 z-50 grid place-items-center bg-black/65 p-4 backdrop-blur-sm">
      <div class="modal-panel w-full max-w-sm rounded-xl border border-border bg-background p-2 shadow-2xl">
        <form class="rounded-lg border border-border bg-card p-6" onSubmit={(event) => void submit(event)}>
          <div class="flex items-start justify-between gap-4">
            <div class="grid size-10 place-items-center rounded-lg border border-border bg-background">
              <LockKeyhole class="size-4" />
            </div>
            <Button
              class="size-8"
              variant="ghost"
              size="icon"
              type="button"
              aria-label={text.pin.cancel}
              onClick={props.onCancel}
            >
              <X class="size-4" />
            </Button>
          </div>
          <h2 class="mt-5 text-lg font-semibold tracking-tight">{text.pin.title}</h2>
          <p class="mt-1 text-sm leading-6 text-muted-foreground">{text.pin.description}</p>
          <InputOTP
            class="mt-5 justify-center"
            value={pin()}
            onValueChange={setPin}
            maxLength={4}
            pattern={REGEXP_ONLY_DIGITS}
            autofocus
            aria-label={text.pin.label}
          >
            <InputOTPGroup>
              <InputOTPSlot index={0} />
              <InputOTPSlot index={1} />
              <InputOTPSlot index={2} />
              <InputOTPSlot index={3} />
            </InputOTPGroup>
          </InputOTP>
          <Show when={error()}>
            <p class="mt-2 text-xs text-destructive">{error()}</p>
          </Show>
          <Button class="mt-4 w-full" size="lg" type="submit" disabled={props.busy || pin().length !== 4}>
            <Show when={props.busy}>
              <LoaderCircle class="size-4 animate-spin" />
            </Show>
            {text.pin.submit}
          </Button>
        </form>
      </div>
    </div>
  );
}
