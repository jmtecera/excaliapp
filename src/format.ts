import { text } from "./i18n";

export function formatRelativeTime(timestamp: number | null, now = Date.now()): string {
  if (!timestamp) {
    return text.time.never;
  }

  const elapsedMs = now - timestamp;
  const elapsedMinutes = Math.max(0, Math.floor(elapsedMs / 60000));

  if (elapsedMinutes < 1) {
    return text.time.now;
  }

  if (elapsedMinutes < 60) {
    return text.time.minutesAgo(elapsedMinutes);
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60);

  if (elapsedHours < 24) {
    return text.time.hoursAgo(elapsedHours);
  }

  return text.time.daysAgo(Math.floor(elapsedHours / 24));
}

export function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const currentYear = new Date().getFullYear();

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() === currentYear ? {} : { year: "numeric" }),
  });
}

export async function writeClipboard(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const input = document.createElement("input");
  input.value = value;
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.append(input);
  input.select();
  document.execCommand("copy");
  input.remove();
}
