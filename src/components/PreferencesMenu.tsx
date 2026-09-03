import { ChevronDown, Languages, Monitor, Moon, Sun } from "lucide-solid";
import { For } from "solid-js";
import { locale, setLocale, text } from "../i18n";
import { setThemePreference, themePreference, type ThemePreference } from "../preferences";
import { cn } from "../lib/utils";

type PreferencesMenuProps = {
  inline?: boolean;
};

const themeIcons = {
  dark: Moon,
  light: Sun,
  system: Monitor,
} as const;

export function PreferencesMenu(props: PreferencesMenuProps = {}) {
  const themeOptions: Array<{ value: ThemePreference; label: () => string }> = [
    { value: "system", label: () => text().preferences.system },
    { value: "light", label: () => text().preferences.light },
    { value: "dark", label: () => text().preferences.dark },
  ];

  return (
    <details
      class={cn(
        "relative",
        props.inline && "landing-preferences flex flex-col items-end",
      )}
    >
      <summary
        class={cn(
          "inline-flex h-9 w-fit shrink-0 cursor-pointer list-none items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
          props.inline && "self-end",
        )}
        aria-label={text().preferences.open}
      >
        <Languages class="size-3.5" />
        <span>{locale().toUpperCase()}</span>
        <ChevronDown class="size-3" />
      </summary>

      <div
        class={cn(
          "preferences-panel w-56 rounded-xl border border-border bg-card p-2 shadow-xl shadow-black/15",
          props.inline
            ? "mt-2"
            : "absolute right-0 top-[calc(100%+0.5rem)] z-40",
        )}
      >
        <div class="border-b border-border px-2 pb-2 pt-1">
          <p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {text().preferences.language}
          </p>
          <div class="mt-2 grid grid-cols-2 gap-1" role="group" aria-label={text().preferences.language}>
            <button
              type="button"
              class={optionClass(locale() === "es")}
              aria-pressed={locale() === "es"}
              onClick={() => setLocale("es")}
            >
              {text().preferences.spanish}
            </button>
            <button
              type="button"
              class={optionClass(locale() === "en")}
              aria-pressed={locale() === "en"}
              onClick={() => setLocale("en")}
            >
              {text().preferences.english}
            </button>
          </div>
        </div>

        <div class="px-2 pb-1 pt-2">
          <p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {text().preferences.theme}
          </p>
          <div class="mt-2 grid gap-1" role="group" aria-label={text().preferences.theme}>
            <For each={themeOptions}>
              {(option) => {
                const Icon = themeIcons[option.value];
                return (
                  <button
                    type="button"
                    class={cn(
                      "flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                      themePreference() === option.value
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                    aria-pressed={themePreference() === option.value}
                    onClick={() => setThemePreference(option.value)}
                  >
                    <Icon class="size-3.5" />
                    {option.label()}
                  </button>
                );
              }}
            </For>
          </div>
        </div>
      </div>
    </details>
  );
}

function optionClass(selected: boolean): string {
  return cn(
    "rounded-md px-2 py-1.5 text-xs transition-colors",
    selected ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
  );
}
