import { NextRequest, NextResponse } from "next/server";
import { getSessionEmail } from "@/lib/session";
import { admob, auditLog } from "@/lib/admob";
import { db } from "@/lib/db";
import { liftoff } from "@/lib/liftoff";
import { mintegral } from "@/lib/mintegral";
import { pangle } from "@/lib/pangle";
import type { MobilePlatform, PlatformResult, CreateAppResult } from "@/lib/types";

// ────────────────────────────────────────────────────────────
//  GET /api/apps — list apps from local DB
// ────────────────────────────────────────────────────────────
export async function GET() {
  const email = await getSessionEmail();
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apps = await db.app.findMany({
    where: { email },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ apps });
}

// ────────────────────────────────────────────────────────────
//  POST /api/apps — create app on 4 platforms concurrently
// ────────────────────────────────────────────────────────────
type CreatePayload = {
  mode: "live" | "not_live";
  appName: string;
  platform: MobilePlatform;
  storeUrl?: string;
  bundleId?: string;
  pangleCategoryCode: number;
  targets: {
    admob: boolean;
    liftoff: boolean;
    minter: boolean;
    pangle: boolean;
  };
  // Liftoff
  liftoffCoppa: boolean;
  liftoffCategory?: string;
  // Mintegral
  mintegralAndroidStore?: "google_play" | "amazon" | "other_store" | "not_live";
  mintegralStoreName?: string;
  mintegralPreviewLink?: string;
};

function validatePayload(body: unknown): { ok: true; data: CreatePayload } | { ok: false; errors: string[] } {
  const b = body as Record<string, unknown>;
  const errors: string[] = [];

  const mode = b.mode === "live" ? "live" : b.mode === "not_live" ? "not_live" : null;
  if (!mode) errors.push("mode phải là 'live' hoặc 'not_live'");

  const appName = typeof b.appName === "string" ? b.appName.trim() : "";
  if (!appName || appName.length < 1) errors.push("Tên app không được rỗng");
  if (appName.length > 60) errors.push("Tên app tối đa 60 ký tự (giới hạn Pangle)");

  const platform = String(b.platform ?? "").toUpperCase() as MobilePlatform;
  if (!["ANDROID", "IOS"].includes(platform)) errors.push("platform phải là ANDROID hoặc IOS");

  const rawTargets = (b.targets ?? {}) as Record<string, unknown>;
  const targets = {
    admob: !!rawTargets.admob,
    liftoff: !!rawTargets.liftoff,
    minter: !!rawTargets.minter,
    pangle: !!rawTargets.pangle,
  };

  if (!Object.values(targets).some(Boolean)) {
    errors.push("Chọn ít nhất 1 nền tảng");
  }

  const pangleCategoryCode = Number(b.pangleCategoryCode);
  if (targets.pangle && (!pangleCategoryCode || Number.isNaN(pangleCategoryCode))) {
    errors.push("Pangle category bắt buộc chọn khi bật Pangle");
  }
  if (targets.liftoff) {
    const lc = typeof b.liftoffCategory === "string" ? b.liftoffCategory.trim() : "";
    if (!lc) errors.push("Liftoff category bắt buộc chọn khi bật Liftoff");
  }

  if (mode === "live") {
    if (!b.storeUrl || typeof b.storeUrl !== "string" || !b.storeUrl.trim()) {
      errors.push("Store URL bắt buộc cho app live");
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    data: {
      mode: mode!,
      appName,
      platform,
      storeUrl: typeof b.storeUrl === "string" ? b.storeUrl.trim() : undefined,
      bundleId: typeof b.bundleId === "string" ? b.bundleId.trim() : undefined,
      pangleCategoryCode: Number.isNaN(pangleCategoryCode) ? 0 : pangleCategoryCode,
      targets,
      // Liftoff
      liftoffCoppa: b.liftoffCoppa !== false,
      liftoffCategory: typeof b.liftoffCategory === "string" ? b.liftoffCategory.trim() || undefined : undefined,
      // Mintegral
      mintegralAndroidStore: typeof b.mintegralAndroidStore === "string"
        ? b.mintegralAndroidStore as CreatePayload["mintegralAndroidStore"]
        : undefined,
      mintegralStoreName: typeof b.mintegralStoreName === "string" ? b.mintegralStoreName.trim() || undefined : undefined,
      mintegralPreviewLink: typeof b.mintegralPreviewLink === "string" ? b.mintegralPreviewLink.trim() || undefined : undefined,
    },
  };
}

// ── Individual platform creators ───────────────────────────

async function createAdmob(
  email: string,
  publisherId: string,
  platform: MobilePlatform,
  appName: string
): Promise<PlatformResult> {
  const result = await admob.createApp(email, publisherId, {
    platform, // "IOS" | "ANDROID" — uppercase
    manualAppInfo: { displayName: appName },
  });
  const appId = result?.appId ?? result?.name?.split("/").pop();
  return { status: "ok", appId: appId ?? undefined, raw: result };
}

async function createPangle(
  appName: string,
  categoryCode: number,
  isLive: boolean,
  storeUrl?: string
): Promise<PlatformResult> {
  const result = await pangle.createApp(
    appName,
    categoryCode,
    isLive ? "live" : "test",
    isLive ? storeUrl : undefined
  );
  const appId = result?.data?.app_id != null ? String(result.data.app_id) : undefined;
  const pangleStatus = result?.data?.status;
  return {
    status: pangleStatus === 1 ? "verifying" : "ok",
    appId,
    warning:
      pangleStatus === 6
        ? "App ở trạng thái TEST (status=6). Portal có thể hiển thị trễ vài phút."
        : pangleStatus === 1
          ? "App đang chờ duyệt (status=1 verifying)."
          : undefined,
    raw: result,
  };
}

async function createLiftoff(
  platform: MobilePlatform,
  appName: string,
  isLive: boolean,
  bundleId?: string,
  storeUrl?: string,
  coppa?: boolean,
  category?: string
): Promise<PlatformResult> {
  const result = await liftoff.createApp({
    platform: platform === "IOS" ? "ios" : "android", // MUST be lowercase
    name: appName,
    isLive,
    bundleId: isLive ? bundleId : undefined,
    storeUrl: isLive ? storeUrl : undefined,
    coppa,
    category,
  });
  return { status: "ok", appId: result?.id ?? undefined, raw: result };
}

async function createMintegral(
  platform: MobilePlatform,
  appName: string,
  isLive: boolean,
  bundleId?: string,
  storeUrl?: string,
  storeName?: string,
  previewLink?: string
): Promise<PlatformResult> {
  const result = await mintegral.createApp({
    appName,
    os: platform, // "IOS" | "ANDROID" — uppercase, same as AdMob
    isLive,
    packageName: bundleId,
    storeUrl: isLive ? storeUrl : undefined,
    storeName: isLive ? storeName : undefined,
    previewLink: isLive ? previewLink : undefined,
  });
  const appId = result?.data?.app_id != null ? String(result.data.app_id) : undefined;
  return { status: "ok", appId, raw: result };
}

// ── Main POST handler ──────────────────────────────────────

export async function POST(req: NextRequest) {
  const email = await getSessionEmail();
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const validation = validatePayload(body);
  if (!validation.ok) {
    return NextResponse.json({ error: "Validation failed", details: validation.errors }, { status: 400 });
  }
  const input = validation.data;
  const isLive = input.mode === "live";

  // Resolve AdMob publisher from DB (auto-detected based on login email)
  const record = await db.userToken.findUnique({ where: { email } });
  const admobPublisherId = record?.publisherId;

  // Run selected platform calls in parallel with Promise.allSettled
  const [admobSettled, pangleSettled, liftoffSettled, mintegralSettled] =
    await Promise.allSettled([
      input.targets.admob
        ? (admobPublisherId
            ? createAdmob(email, admobPublisherId, input.platform, input.appName)
            : Promise.reject(new Error("Không có AdMob publisher ID")))
        : Promise.resolve({ status: "none" as const }),
      input.targets.pangle
        ? createPangle(input.appName, input.pangleCategoryCode, isLive, input.storeUrl)
        : Promise.resolve({ status: "none" as const }),
      input.targets.liftoff
        ? createLiftoff(input.platform, input.appName, isLive, input.bundleId, input.storeUrl, input.liftoffCoppa, input.liftoffCategory)
        : Promise.resolve({ status: "none" as const }),
      input.targets.minter
        ? createMintegral(input.platform, input.appName, isLive, input.bundleId, input.storeUrl, input.mintegralStoreName, input.mintegralPreviewLink)
        : Promise.resolve({ status: "none" as const }),
    ]);

  // Extract results
  function extract(settled: PromiseSettledResult<PlatformResult>): PlatformResult {
    if (settled.status === "fulfilled") return settled.value;
    return { status: "error", error: settled.reason?.message ?? "Unknown error" };
  }

  const results = {
    admob: extract(admobSettled),
    pangle: extract(pangleSettled),
    liftoff: extract(liftoffSettled),
    mintegral: extract(mintegralSettled),
  };

  // Save to DB — always save, even if all platforms fail
  const app = await db.app.create({
    data: {
      email,
      name: input.appName,
      platform: input.platform,
      isLive,
      storeUrl: input.storeUrl ?? null,
      bundleId: input.bundleId ?? null,
      admobPublisherId: admobPublisherId ?? null,
      admobAppId: results.admob.appId ?? null,
      admobStatus: results.admob.status,
      admobError: results.admob.error ?? null,
      pangleAppId: results.pangle.appId ?? null,
      pangleCategoryCode: input.targets.pangle ? input.pangleCategoryCode : null,
      pangleStatus: results.pangle.status,
      pangleError: results.pangle.error ?? null,
      liftoffAppId: results.liftoff.appId ?? null,
      liftoffStatus: results.liftoff.status,
      liftoffError: results.liftoff.error ?? null,
      mintegralAppId: results.mintegral.appId ?? null,
      mintegralStatus: results.mintegral.status,
      mintegralError: results.mintegral.error ?? null,
    },
  });

  // Audit log
  await auditLog({
    email,
    action: "create_app",
    publisherId: admobPublisherId ?? "none",
    payload: input,
    result: results,
    statusCode: 201,
  });

  const response: CreateAppResult = {
    id: app.id,
    name: app.name,
    platform: app.platform as MobilePlatform,
    isLive: app.isLive,
    results,
  };

  return NextResponse.json(response, { status: 201 });
}
