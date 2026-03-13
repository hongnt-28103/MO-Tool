import { NextRequest, NextResponse } from "next/server";
import { getSessionEmail } from "@/lib/session";
import { admob, auditLog } from "@/lib/admob";
import { db } from "@/lib/db";
import { detectAdFormat } from "@/lib/scenarios";

const AD_TYPES: Record<string, string[]> = {
  BANNER: ["RICH_MEDIA"],
  NATIVE: ["RICH_MEDIA"],
  INTERSTITIAL: ["RICH_MEDIA", "VIDEO"],
  REWARDED: ["RICH_MEDIA", "VIDEO"],
  APP_OPEN: ["RICH_MEDIA", "VIDEO"],
};

export async function GET() {
  const email = await getSessionEmail();
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const record = await db.userToken.findUnique({ where: { email } });
  if (!record?.publisherId)
    return NextResponse.json({ error: "Publisher chưa được resolve" }, { status: 403 });
  try {
    const data = await admob.getAdUnits(email, record.publisherId);
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const email = await getSessionEmail();
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const record = await db.userToken.findUnique({ where: { email } });
  if (!record?.publisherId)
    return NextResponse.json({ error: "Publisher chưa được resolve" }, { status: 403 });

  const body = await req.json();
  // body: { appId, units: [{ name, format }] }
  const { appId, units } = body;
  if (!appId || !Array.isArray(units) || units.length === 0)
    return NextResponse.json({ error: "Thiếu appId hoặc units" }, { status: 400 });

  const results: Array<{ name: string; status: string; adUnitId?: string; error?: string }> = [];

  for (const unit of units) {
    const format: string = unit.format ?? detectAdFormat(unit.name) ?? "INTERSTITIAL";
    try {
      const res = await admob.createAdUnit(email, record.publisherId, {
        displayName: unit.name,
        adFormat: format,
        appId,
        adTypes: AD_TYPES[format] ?? ["RICH_MEDIA", "VIDEO"],
      });
      results.push({ name: unit.name, status: "ok", adUnitId: res.adUnitId });
    } catch (e: any) {
      results.push({ name: unit.name, status: "error", error: e.message });
    }
  }

  await auditLog({
    email,
    action: "create_adunit",
    publisherId: record.publisherId,
    payload: { appId, count: units.length },
    result: { results },
    statusCode: 200,
  });

  return NextResponse.json({ results });
}
