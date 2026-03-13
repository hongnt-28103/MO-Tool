import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const getSecret = () =>
  new TextEncoder().encode(process.env.SESSION_SECRET ?? "dev-secret-change-me");

export async function createSession(email: string): Promise<string> {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("8h")
    .setIssuedAt()
    .sign(getSecret());
}

export async function getSessionEmail(req?: Request): Promise<string | null> {
  try {
    // Try from Next.js cookies() for server components / route handlers without request
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    if (!token) return null;
    const { payload } = await jwtVerify(token, getSecret());
    return (payload as { email: string }).email ?? null;
  } catch {
    return null;
  }
}

export async function verifySessionToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return (payload as { email: string }).email ?? null;
  } catch {
    return null;
  }
}
