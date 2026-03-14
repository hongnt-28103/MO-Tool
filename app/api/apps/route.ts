import { NextRequest, NextResponse } from "next/server";
import { getSessionEmail } from "@/lib/session";
import { admob, auditLog } from "@/lib/admob";
import { db } from "@/lib/db";
import { liftoff } from "@/lib/liftoff";
import { mintegral } from "@/lib/mintegral";
import { getPangleCategoryOptions, pangle } from "@/lib/pangle";
import { getStoreMetadata } from "@/lib/store";
import type { MobilePlatform, PlatformResult } from "@/lib/types";

// GET /api/apps - list apps from local DB
export async function GET() {
  const email = await getSessionEmail();
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apps = await db.app.findMany({ where: { email }, orderBy: { createdAt: "desc" } });
  return NextResponse.json({ apps });
}

type TargetFlags = {
  admob: boolean;
  liftoff: boolean;
  minter: boolean;
  pangle: boolean;
};

type CreatePayload = {
  appStatus: "live" | "not_live";
  platform: MobilePlatform;
  appUrl?: string;
  appName?: string;
  pangleCategoryCode?: number;
  mintegralAndroidStore?: "google_play" | "amazon";
  mintegralManualIdentifier?: string;
  liftoffBundleId?: string;
  targets: TargetFlags;
};

function normalizeTargets(raw: unknown): TargetFlags {
  const t = (raw ?? {}) as Record<string, unknown>;
  return {
    admob: !!t.admob,
    liftoff: !!t.liftoff,
    minter: !!t.minter,
    pangle: !!t.pangle,
  };
}

function parseAndValidate(body: unknown):
  | { ok: true; data: CreatePayload }
  | { ok: false; errors: string[] } {
  const b = (body ?? {}) as Record<string, unknown>;
  const errors: string[] = [];

  const appStatus = b.appStatus === "live" ? "live" : b.appStatus === "not_live" ? "not_live" : null;
  if (!appStatus) errors.push("appStatus phải là 'live' hoặc 'not_live'");

  const platform = String(b.platform ?? "").toUpperCase() as MobilePlatform;
  if (!platform || !["ANDROID", "IOS"].includes(platform)) {
    errors.push("platform phải là ANDROID hoặc IOS");
  }

  const appUrl = typeof b.appUrl === "string" ? b.appUrl.trim() : "";
  const appName = typeof b.appName === "string" ? b.appName.trim() : "";
  const targets = normalizeTargets(b.targets);

  if (!Object.values(targets).some(Boolean)) {
    errors.push("Chọn ít nhất 1 nền tảng để tạo app");
  }

  if (appStatus === "live" && !appUrl) {
    errors.push("App URL bắt buộc khi app đã Live");
  }

  if (appStatus === "not_live" && !appName) {
    errors.push("App Name bắt buộc khi app chưa Live");
  }

  const pangleCategoryCode = Number(b.pangleCategoryCode);
  if (targets.pangle && appStatus === "not_live" && (!pangleCategoryCode || Number.isNaN(pangleCategoryCode))) {
    errors.push("Pangle category bắt buộc cho luồng Not Live");
  }

  const mintegralManualIdentifier =
    typeof b.mintegralManualIdentifier === "string" ? b.mintegralManualIdentifier.trim() : "";
  if (targets.minter && appStatus === "not_live" && !mintegralManualIdentifier) {
    errors.push("Mintegral Not Live yêu cầu nhập Package Name/Bundle ID/App ID");
  }

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    data: {
      appStatus: appStatus!,
      platform,
      appUrl: appUrl || undefined,
      appName: appName || undefined,
      pangleCategoryCode: Number.isNaN(pangleCategoryCode) ? undefined : pangleCategoryCode,
      mintegralAndroidStore:
        b.mintegralAndroidStore === "amazon" ? "amazon" : "google_play",
      mintegralManualIdentifier: mintegralManualIdentifier || undefined,
      liftoffBundleId: typeof b.liftoffBundleId === "string" ? b.liftoffBundleId.trim() || undefined : undefined,
      targets,
    },
  };
}

async function createAdmob(params: {
  email: string;
  publisherId: string;
  platform: MobilePlatform;
  appName: string;
  isLive: boolean;
  storeAppId?: string;
}): Promise<PlatformResult> {
  const body = params.isLive && params.storeAppId
    ? {
        platform: params.platform,
        linkedAppInfo: {
          appStoreId: params.storeAppId,
          ...(params.platform === "ANDROID" ? { androidAppStores: ["GOOGLE_PLAY_APP_STORE"] } : {}),
        },
      }
    : {
        platform: params.platform,
        manualAppInfo: { displayName: params.appName },
      };

  const result = await admob.createApp(params.email, params.publisherId, body);
  const appId = result?.appId ?? result?.name?.split("/").pop();
  return { status: "ok", appId: appId ?? undefined, raw: result };
}

function pickPangleCategoryCode(params: {
  requestedCode?: number;
  detectedCategory?: string | null;
  categories: Array<{ code: number; label: string }>;
  isLive: boolean;
}): number {
  if (params.requestedCode && Number.isFinite(params.requestedCode)) return params.requestedCode;

  const fallback = 1218; // Other
  if (!params.isLive || !params.detectedCategory) return fallback;

  const keyword = params.detectedCategory.toLowerCase();

  // First pass: direct text matching against Pangle category labels.
  const direct = params.categories.find((c) => {
    const lbl = c.label.toLowerCase();
    return keyword.includes(lbl) || lbl.includes(keyword);
  });
  if (direct) return direct.code;

  // Second pass: broad mapping by keyword.
  const keywordToCode: Array<{ keys: string[]; code: number }> = [
    { keys: ["game"], code: 1213 },
    { keys: ["finance", "business"], code: 1206 },
    { keys: ["education"], code: 1205 },
    { keys: ["health", "fitness"], code: 1204 },
    { keys: ["music", "audio"], code: 1212 },
    { keys: ["shopping", "commerce"], code: 1203 },
    { keys: ["news"], code: 1217 },
    { keys: ["video"], code: 1209 },
    { keys: ["book", "reading"], code: 1214 },
    { keys: ["travel"], code: 1202 },
    { keys: ["social"], code: 1207 },
    { keys: ["lifestyle"], code: 1208 },
    { keys: ["tool", "utility"], code: 1211 },
  ];

  const mapped = keywordToCode.find((row) => row.keys.some((k) => keyword.includes(k)));
  return mapped?.code ?? fallback;
}

async function createPangle(params: {
  appName: string;
  isLive: boolean;
  platform: MobilePlatform;
  storeUrl?: string;
  bundleId?: string;
  requestedCategoryCode?: number;
  detectedCategory?: string | null;
}): Promise<PlatformResult> {
  const categoryOptions = await getPangleCategoryOptions();
  const categoryCode = pickPangleCategoryCode({
    requestedCode: params.requestedCategoryCode,
    detectedCategory: params.detectedCategory,
    categories: categoryOptions.categories,
    isLive: params.isLive,
  });

  const result = await pangle.createApp(
    params.appName,
    categoryCode,
    params.isLive ? "live" : "test",
    params.platform,
    params.isLive ? params.storeUrl : undefined,
    params.bundleId
  );

  const appId = result?.data?.app_id != null ? String(result.data.app_id) : undefined;
  const pangleStatus = result?.data?.status;
  const existingLinked = Boolean(result?.data?.existing);
  const authOk = result?.data?.auth_ok !== false;

  let warning: string | undefined;
  if (existingLinked) {
    warning = "App đã tồn tại trên Pangle, hệ thống đã auto-link theo app_id hiện có.";
  } else if (!authOk) {
    warning = "⚠ Account Pangle chưa được phê duyệt đầy đủ quyền (third level auth). App đã tạo qua API nhưng có thể không hiển thị trên portal. Vui lòng liên hệ Pangle support để kích hoạt account.";
  } else if (pangleStatus === 6) {
    warning = "App ở trạng thái TEST (status=6). Trên Pangle portal cần lọc theo Test Apps.";
  } else if (pangleStatus === 1) {
    warning = "App đang chờ duyệt (status=1 verifying).";
  }

  return {
    status: !authOk ? "warning" : pangleStatus === 1 ? "verifying" : "ok",
    appId,
    warning,
    raw: result,
  };
}

async function createLiftoff(params: {
  platform: MobilePlatform;
  appName: string;
  isLive: boolean;
  bundleId?: string;
  storeUrl?: string;
}): Promise<PlatformResult> {
  const result = await liftoff.createApp({
    platform: params.platform === "IOS" ? "ios" : "android",
    name: params.appName,
    isLive: params.isLive,
    bundleId: params.bundleId,
    storeUrl: params.isLive ? params.storeUrl : undefined,
    coppa: true,
  });
  return { status: "ok", appId: result?.id ?? undefined, raw: result };
}

async function createMintegral(params: {
  platform: MobilePlatform;
  appName: string;
  isLive: boolean;
  identifier?: string;
  storeUrl?: string;
  androidStore?: "google_play" | "amazon";
}): Promise<PlatformResult> {
  let packageName: string | undefined = undefined;
  let appIdOnStore: string | undefined = undefined;

  if (params.identifier) {
    if (params.platform === "IOS") {
      if (/^id\d+$/.test(params.identifier)) appIdOnStore = params.identifier.replace(/^id/, "");
      else if (/^\d+$/.test(params.identifier)) appIdOnStore = params.identifier;
      else packageName = params.identifier;
    } else {
      packageName = params.identifier;
    }
  }

  const result = await mintegral.createApp({
    appName: params.appName,
    os: params.platform,
    isLive: params.isLive,
    packageName,
    appIdOnStore,
    storeUrl: params.isLive ? params.storeUrl : undefined,
    storeName: params.isLive && params.platform === "ANDROID" && params.androidStore === "amazon"
      ? "Amazon Store"
      : undefined,
  });

  const appId = result?.data?.app_id != null ? String(result.data.app_id) : undefined;
  return { status: "ok", appId, raw: result };
}

function extract(settled: PromiseSettledResult<PlatformResult>): PlatformResult {
  if (settled.status === "fulfilled") return settled.value;
  return { status: "error", error: settled.reason?.message ?? "Unknown error" };
}

export async function POST(req: NextRequest) {
  const email = await getSessionEmail();
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const validation = parseAndValidate(body);
  if (!validation.ok) {
    return NextResponse.json({ error: "Validation failed", details: validation.errors }, { status: 400 });
  }

  const input = validation.data;
  const isLive = input.appStatus === "live";

  let resolvedName = input.appName?.trim() ?? "";
  let resolvedBundleId = input.liftoffBundleId?.trim() ?? "";
  let detectedCategory: string | null = null;

  if (isLive) {
    const meta = await getStoreMetadata(input.appUrl!);
    if (meta.platform !== input.platform) {
      return NextResponse.json(
        {
          error: `Platform không khớp URL store. URL là ${meta.platform}, nhưng bạn đang chọn ${input.platform}.`,
        },
        { status: 400 }
      );
    }
    resolvedName = resolvedName || meta.appName || "Untitled Live App";
    resolvedBundleId = meta.bundleId;
    detectedCategory = meta.category;
  }

  if (!resolvedName) {
    return NextResponse.json({ error: "Không xác định được App Name" }, { status: 400 });
  }

  // Dedup in local DB (name/store/bundle)
  const dedupConditions: { name?: string; storeUrl?: string; bundleId?: string }[] = [{ name: resolvedName }];
  if (input.appUrl?.trim()) dedupConditions.push({ storeUrl: input.appUrl.trim() });
  if (resolvedBundleId) dedupConditions.push({ bundleId: resolvedBundleId });

  const duplicate = await db.app.findFirst({
    where: { email, OR: dedupConditions },
    select: { id: true, name: true },
  });

  if (duplicate) {
    return NextResponse.json(
      {
        error: "Duplicate detected",
        duplicateId: duplicate.id,
        duplicateName: duplicate.name,
        message: `App \"${duplicate.name}\" đã tồn tại trong hệ thống. Vui lòng dùng Add Network trên app đó.`,
      },
      { status: 409 }
    );
  }

  const record = await db.userToken.findUnique({ where: { email } });
  const admobPublisherId = record?.publisherId;

  const liftoffBundleForNotLive = !isLive
    ? (input.liftoffBundleId?.trim() || input.mintegralManualIdentifier?.trim() || undefined)
    : resolvedBundleId;

  const mintegralIdentifier = isLive ? resolvedBundleId : input.mintegralManualIdentifier;

  const storeAppIdForAdmob = resolvedBundleId
    ? (input.platform === "IOS" ? resolvedBundleId.replace(/^id/, "") : resolvedBundleId)
    : undefined;

  const [admobSettled, pangleSettled, liftoffSettled, mintegralSettled] = await Promise.allSettled([
    input.targets.admob
      ? (admobPublisherId
          ? createAdmob({
              email,
              publisherId: admobPublisherId,
              platform: input.platform,
              appName: resolvedName,
              isLive,
              storeAppId: storeAppIdForAdmob,
            })
          : Promise.reject(new Error("Không có AdMob publisher ID")))
      : Promise.resolve({ status: "none" as const }),

    input.targets.pangle
      ? createPangle({
          appName: resolvedName,
          isLive,
          platform: input.platform,
          storeUrl: input.appUrl,
          bundleId: resolvedBundleId,
          requestedCategoryCode: input.pangleCategoryCode,
          detectedCategory,
        })
      : Promise.resolve({ status: "none" as const }),

    input.targets.liftoff
      ? createLiftoff({
          platform: input.platform,
          appName: resolvedName,
          isLive,
          bundleId: liftoffBundleForNotLive,
          storeUrl: input.appUrl,
        })
      : Promise.resolve({ status: "none" as const }),

    input.targets.minter
      ? createMintegral({
          platform: input.platform,
          appName: resolvedName,
          isLive,
          identifier: mintegralIdentifier,
          storeUrl: input.appUrl,
          androidStore: input.mintegralAndroidStore,
        })
      : Promise.resolve({ status: "none" as const }),
  ]);

  const results = {
    admob: extract(admobSettled),
    pangle: extract(pangleSettled),
    liftoff: extract(liftoffSettled),
    mintegral: extract(mintegralSettled),
  };

  const app = await db.app.create({
    data: {
      email,
      name: resolvedName,
      platform: input.platform,
      isLive,
      storeUrl: input.appUrl ?? null,
      bundleId: resolvedBundleId || null,
      admobPublisherId: admobPublisherId ?? null,
      admobAppId: results.admob.appId ?? null,
      admobStatus: results.admob.status,
      admobError: results.admob.error ?? null,
      pangleAppId: results.pangle.appId ?? null,
      pangleCategoryCode: input.targets.pangle
        ? (input.pangleCategoryCode ?? pickPangleCategoryCode({
            requestedCode: undefined,
            detectedCategory,
            categories: (await getPangleCategoryOptions()).categories,
            isLive,
          }))
        : null,
      pangleStatus: results.pangle.status,
      pangleError: results.pangle.error ?? null,
      liftoffAppId: results.liftoff.appId ?? null,
      liftoffStatus: results.liftoff.status,
      liftoffError: results.liftoff.error ?? null,
      liftoffCategory: null,
      liftoffCoppa: true,
      mintegralAppId: results.mintegral.appId ?? null,
      mintegralStatus: results.mintegral.status,
      mintegralError: results.mintegral.error ?? null,
      mintegralAndroidStore: input.targets.minter ? input.mintegralAndroidStore ?? null : null,
      mintegralStoreName: null,
      mintegralPreviewLink: null,
    },
  });

  await auditLog({
    email,
    action: "create_app",
    publisherId: admobPublisherId ?? "none",
    payload: {
      ...input,
      resolvedName,
      resolvedBundleId,
      detectedCategory,
    },
    result: results,
    statusCode: 201,
  });

  const createdTargets = (Object.keys(input.targets) as Array<keyof TargetFlags>).filter((k) => input.targets[k]);
  const uiResults = {
    admob: {
      ok: results.admob.status === "ok" || results.admob.status === "verifying",
      data: results.admob.raw ?? { appId: results.admob.appId, status: results.admob.status },
      error: results.admob.error,
      warning: results.admob.warning,
    },
    liftoff: {
      ok: results.liftoff.status === "ok" || results.liftoff.status === "verifying",
      data: results.liftoff.raw ?? { appId: results.liftoff.appId, status: results.liftoff.status },
      error: results.liftoff.error,
      warning: results.liftoff.warning,
    },
    minter: {
      ok: results.mintegral.status === "ok" || results.mintegral.status === "verifying",
      data: results.mintegral.raw ?? { appId: results.mintegral.appId, status: results.mintegral.status },
      error: results.mintegral.error,
      warning: results.mintegral.warning,
    },
    pangle: {
      ok: results.pangle.status === "ok" || results.pangle.status === "verifying" || results.pangle.status === "warning",
      data: results.pangle.raw ?? { appId: results.pangle.appId, status: results.pangle.status },
      error: results.pangle.error,
      warning: results.pangle.warning,
    },
  };

  return NextResponse.json(
    {
      id: app.id,
      displayName: app.name,
      mobilePlatform: app.platform,
      createdTargets,
      results: uiResults,
      hasErrors: Object.values(uiResults).some((r) => !r.ok),
    },
    { status: 201 }
  );
}
