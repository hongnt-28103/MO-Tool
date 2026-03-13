import { NextResponse } from "next/server";
import { getSessionEmail } from "@/lib/session";
import { admob } from "@/lib/admob";
import { resolvePublisher, resolvePublisherByEmail } from "@/lib/whitelist";
import { db } from "@/lib/db";

export async function GET() {
  const email = await getSessionEmail();
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    // First, try to auto-detect based on email
    let result = resolvePublisherByEmail(email);
    if (result) {
      // Save to DB
      await db.userToken.update({
        where: { email },
        data: {
          publisherId: result.publisherId,
          publisherName: result.publisherName,
        },
      });
      return NextResponse.json({
        publisherId: result.publisherId,
        publisherName: result.publisherName,
        email,
        autoDetected: true,
      });
    }

    // Fallback to permission-based detection
    const data = await admob.getAccounts(email);
    const resolveResult = resolvePublisher(data.account ?? []);
    if (resolveResult.status === "no_access") {
      return NextResponse.json({ error: resolveResult.message }, { status: 403 });
    }
    if (resolveResult.status === "multiple") {
      return NextResponse.json(
        { error: resolveResult.message, matched: resolveResult.matched },
        { status: 409 }
      );
    }

    // Save publisherId to DB
    await db.userToken.update({
      where: { email },
      data: {
        publisherId: resolveResult.publisherId,
        publisherName: resolveResult.publisherName,
      },
    });

    return NextResponse.json({
      publisherId: resolveResult.publisherId,
      publisherName: resolveResult.publisherName,
      email,
      autoDetected: false,
    });
  } catch (e: any) {
    if (e.message === "ADMOB_FORBIDDEN")
      return NextResponse.json({ error: "Thiếu quyền truy cập AdMob" }, { status: 403 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
