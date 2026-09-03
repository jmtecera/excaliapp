import { onCleanup, onMount } from "solid-js";

type TurnstileWidgetOptions = {
  sitekey: string;
  action: string;
  theme: "dark";
  size: "flexible";
  callback: (token: string) => void;
  "error-callback": () => void;
  "expired-callback": () => void;
};

type TurnstileApi = {
  ready: (callback: () => void) => void;
  render: (container: HTMLElement, options: TurnstileWidgetOptions) => string | number;
  remove: (widgetId: string | number) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const TURNSTILE_SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let scriptPromise: Promise<void> | undefined;

type TurnstileChallengeProps = {
  siteKey: string;
  onToken: (token: string) => void;
  onError: () => void;
};

export function TurnstileChallenge(props: TurnstileChallengeProps) {
  let container!: HTMLDivElement;
  let widgetId: string | number | undefined;
  let disposed = false;

  onMount(() => {
    void mountWidget();
  });

  onCleanup(() => {
    disposed = true;

    if (widgetId !== undefined && window.turnstile) {
      window.turnstile.remove(widgetId);
    }
  });

  async function mountWidget() {
    try {
      await loadTurnstileScript();

      if (disposed || !window.turnstile) {
        return;
      }

      window.turnstile.ready(() => {
        if (disposed || !window.turnstile) {
          return;
        }

        widgetId = window.turnstile.render(container, {
          sitekey: props.siteKey,
          action: "create-room",
          theme: "dark",
          size: "flexible",
          callback: (token) => {
            if (!disposed) props.onToken(token);
          },
          "error-callback": () => {
            if (!disposed) props.onError();
          },
          "expired-callback": () => {
            if (!disposed) props.onToken("");
          },
        });
      });
    } catch {
      if (!disposed) props.onError();
    }
  }

  return <div ref={container} class="flex min-h-[65px] justify-center" />;
}

function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) {
    return Promise.resolve();
  }

  if (scriptPromise) {
    return scriptPromise;
  }

  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = TURNSTILE_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.dataset.excaliappTurnstile = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Turnstile script failed to load."));
    document.head.append(script);
  }).catch((error) => {
    scriptPromise = undefined;
    throw error;
  });

  return scriptPromise;
}
