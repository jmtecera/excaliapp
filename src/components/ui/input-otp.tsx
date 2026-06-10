import {
  createContext,
  splitProps,
  useContext,
  type JSX,
  type ParentProps,
} from "solid-js";
import { cn } from "../../lib/utils";

export const REGEXP_ONLY_DIGITS = "^[0-9]+$";
export const REGEXP_ONLY_DIGITS_AND_CHARS = "^[a-zA-Z0-9]+$";

type InputOTPContextValue = {
  value: () => string;
  maxLength: number;
  disabled: () => boolean;
  label: string;
  inputMode: "numeric" | "text";
  register: (index: number, input: HTMLInputElement) => void;
  update: (index: number, value: string) => void;
  handleKeyDown: (index: number, event: KeyboardEvent) => void;
  handlePaste: (index: number, event: ClipboardEvent) => void;
};

const InputOTPContext = createContext<InputOTPContextValue>();

type InputOTPProps = ParentProps<{
  value: string;
  onValueChange: (value: string) => void;
  maxLength: number;
  pattern?: string;
  disabled?: boolean;
  autofocus?: boolean;
  "aria-label"?: string;
  class?: string;
}> &
  Omit<JSX.HTMLAttributes<HTMLDivElement>, "onInput">;

export function InputOTP(props: InputOTPProps) {
  const [local, containerProps] = splitProps(props, [
    "value",
    "onValueChange",
    "maxLength",
    "pattern",
    "disabled",
    "autofocus",
    "aria-label",
    "class",
    "children",
  ]);
  const inputs: HTMLInputElement[] = [];

  function focus(index: number) {
    inputs[Math.max(0, Math.min(local.maxLength - 1, index))]?.focus();
  }

  function update(index: number, rawValue: string) {
    const characters = filterCharacters(rawValue, local.pattern);

    if (!characters) {
      const next = local.value.padEnd(local.maxLength, " ").split("");
      next[index] = " ";
      local.onValueChange(next.join("").replace(/\s/g, "").slice(0, local.maxLength));
      return;
    }

    const next = local.value.padEnd(local.maxLength, " ").split("");
    characters.slice(0, local.maxLength - index).split("").forEach((character, offset) => {
      next[index + offset] = character;
    });
    const value = next.join("").replace(/\s/g, "").slice(0, local.maxLength);
    local.onValueChange(value);
    focus(Math.min(index + characters.length, local.maxLength - 1));
  }

  function handleKeyDown(index: number, event: KeyboardEvent) {
    if (event.key === "Backspace" && !local.value[index] && index > 0) {
      event.preventDefault();
      focus(index - 1);
      update(index - 1, "");
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      focus(index - 1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      focus(index + 1);
    }
  }

  function handlePaste(index: number, event: ClipboardEvent) {
    const characters = filterCharacters(
      event.clipboardData?.getData("text") || "",
      local.pattern,
    );

    if (!characters) {
      return;
    }

    event.preventDefault();
    update(index, characters);
  }

  const context: InputOTPContextValue = {
    value: () => local.value,
    maxLength: local.maxLength,
    disabled: () => Boolean(local.disabled),
    label: local["aria-label"] || "One-time password",
    inputMode: local.pattern === REGEXP_ONLY_DIGITS ? "numeric" : "text",
    register: (index, input) => {
      inputs[index] = input;
      if (index === 0 && local.autofocus) {
        queueMicrotask(() => input.focus());
      }
    },
    update,
    handleKeyDown,
    handlePaste,
  };

  return (
    <InputOTPContext.Provider value={context}>
      <div
        class={cn("flex items-center", local.class)}
        data-input-otp
        {...containerProps}
      >
        {local.children}
      </div>
    </InputOTPContext.Provider>
  );
}

export function InputOTPGroup(props: JSX.HTMLAttributes<HTMLDivElement>) {
  const [local, groupProps] = splitProps(props, ["class"]);
  return (
    <div
      class={cn("flex items-center gap-2", local.class)}
      role="group"
      {...groupProps}
    />
  );
}

export function InputOTPSeparator(props: JSX.HTMLAttributes<HTMLDivElement>) {
  const [local, separatorProps] = splitProps(props, ["class"]);
  return (
    <div
      class={cn("px-0.5 text-sm font-medium text-muted-foreground", local.class)}
      aria-hidden="true"
      {...separatorProps}
    >
      -
    </div>
  );
}

export function InputOTPSlot(props: { index: number; class?: string }) {
  const context = useContext(InputOTPContext);

  if (!context) {
    throw new Error("InputOTPSlot must be used inside InputOTP.");
  }

  return (
    <input
      ref={(input) => context.register(props.index, input)}
      class={cn(
        "size-11 rounded-md border border-input bg-background text-center font-mono text-base font-semibold text-foreground shadow-sm outline-none transition focus-visible:border-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        props.class,
      )}
      value={context.value()[props.index] || ""}
      type="text"
      inputmode={context.inputMode}
      autocomplete={props.index === 0 ? "one-time-code" : "off"}
      maxlength={1}
      disabled={context.disabled()}
      aria-label={`${context.label} ${props.index + 1}`}
      onFocus={(event) => event.currentTarget.select()}
      onInput={(event) => context.update(props.index, event.currentTarget.value)}
      onKeyDown={(event) => context.handleKeyDown(props.index, event)}
      onPaste={(event) => context.handlePaste(props.index, event)}
    />
  );
}

function filterCharacters(value: string, pattern = REGEXP_ONLY_DIGITS): string {
  const matcher = new RegExp(pattern);
  return [...value].filter((character) => matcher.test(character)).join("");
}
