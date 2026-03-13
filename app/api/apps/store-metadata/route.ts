import { NextRequest, NextResponse } from "next/server";
import { getSessionEmail } from "@/lib/session";
import { getStoreMetadata } from "@/lib/store";

export async function POST(req: NextRequest) {
  const email = await getSessionEmail();
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { storeUrl } = await req.json();
  if (!storeUrl || typeof storeUrl !== "string") {
    return NextResponse.json({ error: "storeUrl is required" }, { status: 400 });
  }

  try {
    const meta = await getStoreMetadata(storeUrl);
    return NextResponse.json(meta);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
