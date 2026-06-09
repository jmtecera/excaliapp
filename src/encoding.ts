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

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
