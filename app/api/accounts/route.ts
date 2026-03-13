import { NextResponse } from "next/server";
import { getSessionEmail } from "@/lib/session";
import { admob } from "@/lib/admob";
import { resolvePublisher } from "@/lib/whitelist";
import { db } from "@/lib/db";

export async function GET() {
  const email = await getSessionEmail();
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const data = await admob.getAccounts(email);
    const result = resolvePublisher(data.account ?? []);

    if (result.status === "no_access") {
      return NextResponse.json({ error: result.message }, { status: 403 });
    }
    if (result.status === "multiple") {
      return NextResponse.json(
        { error: result.message, matched: result.matched },
        { status: 409 }
      );
    }

    // Save publisherId to DB
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
    });
  } catch (e: any) {
    if (e.message === "ADMOB_FORBIDDEN")
      return NextResponse.json({ error: "Thiếu quyền truy cập AdMob" }, { status: 403 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
