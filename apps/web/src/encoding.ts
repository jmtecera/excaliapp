export function randomBase64Url(byteCount: number): string {
  const buffer = new Uint8Array(byteCount);
  crypto.getRandomValues(buffer);
  return encodeBase64Url(buffer);
}

export function randomHex(byteCount: number): string {
  const buffer = new Uint8Array(byteCount);
  crypto.getRandomValues(buffer);
  return [...buffer].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function decodeBase64Url(value: string): string {
  const paddedValue = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (paddedValue.length % 4)) % 4);
  const binary = atob(`${paddedValue}${padding}`);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new TextDecoder().decode(bytes);
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
