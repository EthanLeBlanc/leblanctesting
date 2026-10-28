// Signed download links: base64url(payload).base64url(HMAC-SHA256(payload)).
// The worker never stores orders; a valid signature is proof of purchase.

type TokenPayload = {
  // R2 object key
  f: string;
  // Expiry, unix seconds
  e: number;
};

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array {
  const binary = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signDownload(
  secret: string,
  file: string,
  expiresAt: number,
): Promise<string> {
  const payload = toBase64Url(
    encoder.encode(JSON.stringify({ f: file, e: expiresAt } satisfies TokenPayload)),
  );
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(payload));
  return `${payload}.${toBase64Url(new Uint8Array(sig))}`;
}

// Returns the R2 key if the token is authentic and unexpired, otherwise null.
export async function verifyDownload(secret: string, token: string): Promise<string | null> {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(secret),
      fromBase64Url(sig),
      encoder.encode(payload),
    );
    if (!valid) return null;
    const data = JSON.parse(new TextDecoder().decode(fromBase64Url(payload))) as TokenPayload;
    if (typeof data.f !== "string" || typeof data.e !== "number") return null;
    return data.e > Date.now() / 1000 ? data.f : null;
  } catch {
    return null;
  }
}
