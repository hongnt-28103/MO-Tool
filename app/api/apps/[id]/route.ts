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
        category: app.liftoffCategory ?? undefined,
        coppa: app.liftoffCoppa,
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

// ────────────────────────────────────────────────────────────
//  POST (add platform) helper — shared between retry and add
// ────────────────────────────────────────────────────────────
export async function POST(
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
  const addPlatform = body.addPlatform as PlatformKey | undefined;
  if (!addPlatform || !["admob","pangle","liftoff","mintegral"].includes(addPlatform)) {
    return NextResponse.json({ error: "addPlatform bắt buộc" }, { status: 400 });
  }

  // Must be "none" to add — use Retry for "error" status
  const statusField = (`${addPlatform}Status`) as keyof typeof app;
  if (app[statusField] !== "none") {
    return NextResponse.json({
      error: `${addPlatform} đã ở trạng thái "${app[statusField]}" — dùng Retry nếu muốn thử lại`
    }, { status: 400 });
  }

  // Save any new metadata fields before attempting platform creation
  const metaUpdates: Record<string, unknown> = {};
  if (typeof body.pangleCategoryCode !== "undefined") {
    const code = Number(body.pangleCategoryCode);
    if (!Number.isNaN(code) && code > 0) metaUpdates.pangleCategoryCode = code;
  }
  if (typeof body.liftoffCategory === "string" && body.liftoffCategory.trim()) {
    metaUpdates.liftoffCategory = body.liftoffCategory.trim();
  }
  if (typeof body.liftoffCoppa === "boolean") {
    metaUpdates.liftoffCoppa = body.liftoffCoppa;
  }
  if (typeof body.mintegralAndroidStore === "string" && body.mintegralAndroidStore.trim()) {
    metaUpdates.mintegralAndroidStore = body.mintegralAndroidStore.trim();
  }
  if (typeof body.mintegralStoreName === "string") {
    metaUpdates.mintegralStoreName = body.mintegralStoreName.trim() || null;
  }
  if (typeof body.mintegralPreviewLink === "string") {
    metaUpdates.mintegralPreviewLink = body.mintegralPreviewLink.trim() || null;
  }

  let currentApp = app;
  if (Object.keys(metaUpdates).length > 0) {
    currentApp = await db.app.update({ where: { id }, data: metaUpdates });
  }

  const isLive = currentApp.isLive;
  const platform = currentApp.platform as MobilePlatform;

  try {
    let updateData: Record<string, unknown> = {};

    if (addPlatform === "admob") {
      const publisherId = currentApp.admobPublisherId;
      if (!publisherId) throw new Error("Không có AdMob publisher ID trong record này");
      const result = await admob.createApp(email, publisherId, {
        platform,
        manualAppInfo: { displayName: currentApp.name },
      });
      const appId = result?.appId ?? result?.name?.split("/").pop();
      updateData = { admobAppId: appId ?? null, admobStatus: "ok", admobError: null };
    }

    if (addPlatform === "pangle") {
      const categoryCode = currentApp.pangleCategoryCode;
      if (!categoryCode) throw new Error("Thiếu Pangle category code");
      const result = await pangle.createApp(
        currentApp.name, categoryCode,
        isLive ? "live" : "test",
        isLive ? currentApp.storeUrl ?? undefined : undefined
      );
      const appId = result?.data?.app_id != null ? String(result.data.app_id) : null;
      const pStatus = result?.data?.status;
      updateData = { pangleAppId: appId, pangleStatus: pStatus === 1 ? "verifying" : "ok", pangleError: null };
    }

    if (addPlatform === "liftoff") {
      const category = currentApp.liftoffCategory;
      if (!category) throw new Error("Thiếu Liftoff category");
      const result = await liftoff.createApp({
        platform: platform === "IOS" ? "ios" : "android",
        name: currentApp.name,
        isLive,
        bundleId: isLive ? currentApp.bundleId ?? undefined : undefined,
        storeUrl: isLive ? currentApp.storeUrl ?? undefined : undefined,
        category,
        coppa: currentApp.liftoffCoppa,
      });
      updateData = { liftoffAppId: result?.id ?? null, liftoffStatus: "ok", liftoffError: null };
    }

    if (addPlatform === "mintegral") {
      const result = await mintegral.createApp({
        appName: currentApp.name,
        os: platform,
        isLive,
        packageName: currentApp.bundleId ?? undefined,
        storeUrl: isLive ? currentApp.storeUrl ?? undefined : undefined,
        storeName: currentApp.mintegralStoreName ?? undefined,
        previewLink: currentApp.mintegralPreviewLink ?? undefined,
      });
      const appId = result?.data?.app_id != null ? String(result.data.app_id) : null;
      updateData = { mintegralAppId: appId, mintegralStatus: "ok", mintegralError: null };
    }

    const updated = await db.app.update({ where: { id }, data: updateData });

    await auditLog({
      email,
      action: `add_platform_${addPlatform}`,
      publisherId: currentApp.admobPublisherId ?? "none",
      payload: { appId: id, addPlatform },
      result: updateData,
      statusCode: 200,
    });

    return NextResponse.json({ app: updated });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    const errorField = `${addPlatform}Error`;
    const statusKey = `${addPlatform}Status`;
    await db.app.update({ where: { id }, data: { [errorField]: msg, [statusKey]: "error" } });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
