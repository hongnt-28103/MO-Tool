import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALG = "aes-256-gcm";
const KEY = Buffer.from(process.env.ENCRYPTION_KEY ?? "0".repeat(64), "hex"); // 32 bytes

/** Encrypt refresh_token before saving to DB */
export function encryptToken(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALG, KEY, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = (cipher as any).getAuthTag() as Buffer;
  return [iv, tag, enc].map((b) => b.toString("hex")).join(".");
}

/** Decrypt to get original refresh_token */
export function decryptToken(encoded: string): string {
  const [ivHex, tagHex, encHex] = encoded.split(".");
  const decipher = createDecipheriv(ALG, KEY, Buffer.from(ivHex, "hex"));
  (decipher as any).setAuthTag(Buffer.from(tagHex, "hex"));
  return (
    decipher.update(Buffer.from(encHex, "hex"), undefined, "utf8") +
    decipher.final("utf8")
  );
}

/** Exchange authorization code → tokens */
export async function exchangeCode(code: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token exchange failed: ${res.status} ${err}`);
  }
  return res.json();
}

/** Refresh access_token using refresh_token */
export async function refreshAccessToken(refreshToken: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const err = await res.json();
    if (err.error === "invalid_grant") throw new Error("REFRESH_TOKEN_EXPIRED");
    throw new Error(`Refresh failed: ${res.status}`);
  }
  return res.json(); // { access_token, expires_in }
}
