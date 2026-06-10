import md5 from "blueimp-md5";

const AVATAR_HASH_PATTERN = /^[a-f0-9]{32}$/;

export function createAvatarHash(email: string): string {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  return normalizedEmail ? md5(normalizedEmail) : "";
}

export function normalizeAvatarHash(value: unknown): string {
  const hash = String(value || "").trim().toLowerCase();
  return AVATAR_HASH_PATTERN.test(hash) ? hash : "";
}
