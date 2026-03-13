import { NextRequest, NextResponse } from "next/server";
import { getSessionEmail } from "@/lib/session";
import { db } from "@/lib/db";
import { admob, auditLog } from "@/lib/admob";
import { pangle } from "@/lib/pangle";
import { liftoff } from "@/lib/liftoff";
import { mintegral } from "@/lib/mintegral";
import type { MobilePlatform, PlatformKey } from "@/lib/types";

// ────────────────────────────────────────────────────────────
//  GET /api/apps/[id] — fetch app detail
// ────────────────────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const email = await getSessionEmail();
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const app = await db.app.findUnique({ where: { id } });
  if (!app || app.email !== email) {
    return NextResponse.json({ error: "App not found" }, { status: 404 });
  }
  return NextResponse.json({ app });
}

// ────────────────────────────────────────────────────────────
//  PATCH /api/apps/[id] — update mintegral_app_key OR retry a platform
// ────────────────────────────────────────────────────────────
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const email = await getSessionEmail();
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const app = await db.app.findUnique({ where: { id } });
  if (!app || app.email !== email) {
    return NextResponse.json({ error: "App not found" }, { status: 404 });
  }

  const body = await req.json();

  // ── Case 1: Update Mintegral App Key ──
  if (typeof body.mintegralAppKey === "string") {
    const key = body.mintegralAppKey.trim();
    if (!key) return NextResponse.json({ error: "App key không được rỗng" }, { status: 400 });
    const updated = await db.app.update({
      where: { id },
      data: { mintegralAppKey: key },
    });
    return NextResponse.json({ app: updated });
  }

  // ── Case 2: Retry a specific platform ──
  const retryPlatform = body.retryPlatform as PlatformKey | undefined;
  if (!retryPlatform || !["admob", "pangle", "liftoff", "mintegral"].includes(retryPlatform)) {
    return NextResponse.json({ error: "Provide mintegralAppKey or retryPlatform" }, { status: 400 });
  }

  // Don't retry if already ok or verifying
  const statusField = `${retryPlatform}Status` as keyof typeof app;
  const currentStatus = app[statusField] as string;
  if (currentStatus === "ok" || currentStatus === "verifying") {
    return NextResponse.json(
      { error: `${retryPlatform} đã ở trạng thái ${currentStatus}, không cần retry` },
      { status: 400 }
    );
  }

  const isLive = app.isLive;
  const platform = app.platform as MobilePlatform;

  try {
    let updateData: Record<string, unknown> = {};

    if (retryPlatform === "admob") {
      const publisherId = app.admobPublisherId;
      if (!publisherId) throw new Error("Không có AdMob publisher ID");
      const result = await admob.createApp(email, publisherId, {
        platform,
        manualAppInfo: { displayName: app.name },
      });
      const appId = result?.appId ?? result?.name?.split("/").pop();
      updateData = { admobAppId: appId ?? null, admobStatus: "ok", admobError: null };
    }

    if (retryPlatform === "pangle") {
      const categoryCode = app.pangleCategoryCode;
      if (!categoryCode) throw new Error("Thiếu Pangle category code");
      const result = await pangle.createApp(
        app.name,
        categoryCode,
        isLive ? "live" : "test",
        isLive ? app.storeUrl ?? undefined : undefined
      );
      const appId = result?.data?.app_id != null ? String(result.data.app_id) : null;
      const pStatus = result?.data?.status;
      updateData = {
        pangleAppId: appId,
        pangleStatus: pStatus === 1 ? "verifying" : "ok",
        pangleError: null,
      };
    }

    if (retryPlatform === "liftoff") {
      const result = await liftoff.createApp({
        platform: platform === "IOS" ? "ios" : "android",
        name: app.name,
        isLive,
        bundleId: isLive ? app.bundleId ?? undefined : undefined,
        storeUrl: isLive ? app.storeUrl ?? undefined : undefined,
      });
      updateData = { liftoffAppId: result?.id ?? null, liftoffStatus: "ok", liftoffError: null };
    }

    if (retryPlatform === "mintegral") {
      const result = await mintegral.createApp({
        appName: app.name,
        os: platform,
        isLive,
        packageName: isLive ? app.bundleId ?? undefined : undefined,
        storeUrl: isLive ? app.storeUrl ?? undefined : undefined,
      });
      const appId = result?.data?.app_id != null ? String(result.data.app_id) : null;
      updateData = { mintegralAppId: appId, mintegralStatus: "ok", mintegralError: null };
    }

    const updated = await db.app.update({ where: { id }, data: updateData });

    await auditLog({
      email,
      action: `retry_${retryPlatform}`,
      publisherId: app.admobPublisherId ?? "none",
      payload: { appId: id, platform: retryPlatform },
      result: updateData,
      statusCode: 200,
    });

    return NextResponse.json({ app: updated });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    // Save error to DB
    const errorField = `${retryPlatform}Error`;
    const statusKey = `${retryPlatform}Status`;
    await db.app.update({
      where: { id },
      data: { [errorField]: msg, [statusKey]: "error" },
    });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
