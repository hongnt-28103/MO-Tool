import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangeCode, encryptToken } from "@/lib/auth";
import { db } from "@/lib/db";
import { createSession } from "@/lib/session";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL(`/login?error=${error}`, req.url));
  }

  // CSRF check
  const cookieStore = await cookies();
  const savedState = cookieStore.get("oauth_state")?.value;
  if (!state || state !== savedState) {
    return NextResponse.redirect(new URL("/login?error=invalid_state", req.url));
  }
  cookieStore.delete("oauth_state");

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=no_code", req.url));
  }

  try {
    const tokens = await exchangeCode(code);

    // Decode id_token to get email (just need payload, not full verify)
    const payload = JSON.parse(
      Buffer.from(tokens.id_token.split(".")[1], "base64url").toString()
    );
    const email: string = payload.email;

    // Save tokens to DB
    await db.userToken.upsert({
      where: { email },
      create: {
        email,
        refreshTokenEnc: encryptToken(tokens.refresh_token),
        accessToken: tokens.access_token,
        accessTokenExpiry: new Date(Date.now() + tokens.expires_in * 1000),
      },
      update: {
        refreshTokenEnc: encryptToken(tokens.refresh_token),
        accessToken: tokens.access_token,
        accessTokenExpiry: new Date(Date.now() + tokens.expires_in * 1000),
      },
    });

    // Create session JWT
    const jwt = await createSession(email);
    const res = NextResponse.redirect(new URL("/dashboard", req.url));
    res.cookies.set("session", jwt, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 8 * 3600,
    });
    return res;
  } catch (e) {
    console.error("[AUTH_CALLBACK]", e);
    return NextResponse.redirect(new URL("/login?error=auth_failed", req.url));
  }
}
