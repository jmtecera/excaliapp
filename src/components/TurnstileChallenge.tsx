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
      await waitForTurnstile();

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

function waitForTurnstile(): Promise<void> {
  if (window.turnstile) {
    return Promise.resolve();
  }

  const script = document.querySelector<HTMLScriptElement>(
    `script[src="${TURNSTILE_SCRIPT_URL}"]`,
  );

  if (!script) {
    return Promise.reject(new Error("Turnstile script is not present."));
  }

  return new Promise<void>((resolve, reject) => {
    let interval = 0;
    let timeout = 0;
    let cleanup = () => {};
    const checkReady = () => {
      if (!window.turnstile) return;
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error("Turnstile script failed to load."));
    };

    cleanup = () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
      script.removeEventListener("error", handleError);
    };
    timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Turnstile API did not become available."));
    }, 10000);
    script.addEventListener("error", handleError, { once: true });
    interval = window.setInterval(checkReady, 50);
    checkReady();
  });
}
