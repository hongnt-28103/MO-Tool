import { NextRequest, NextResponse } from "next/server";
import { getSessionEmail } from "@/lib/session";
import { admob, auditLog } from "@/lib/admob";
import { db } from "@/lib/db";
import { liftoff } from "@/lib/liftoff";
import { mintegral } from "@/lib/mintegral";
import { pangle } from "@/lib/pangle";

type MobilePlatform = "ANDROID" | "IOS";

type TargetPayload = {
  admob?: { enabled?: boolean };
  liftoff?: { enabled?: boolean; bundleId?: string };
  minter?: {
    enabled?: boolean;
    packageName?: string;
    isLiveInStore?: boolean;
    storeUrl?: string;
  };
  pangle?: {
    enabled?: boolean;
    categoryCode?: number;
    status?: "test" | "live";
    downloadUrl?: string;
  };
};

function normalizeTargets(targets: TargetPayload | undefined) {
  if (!targets) {
    return {
      admob: { enabled: true },
      liftoff: { enabled: false },
      minter: { enabled: false },
      pangle: { enabled: false },
    };
  }
  return {
    admob: { enabled: !!targets.admob?.enabled },
    liftoff: { enabled: !!targets.liftoff?.enabled, bundleId: targets.liftoff?.bundleId },
    minter: {
      enabled: !!targets.minter?.enabled,
      packageName: targets.minter?.packageName,
      isLiveInStore: !!targets.minter?.isLiveInStore,
      storeUrl: targets.minter?.storeUrl,
    },
    pangle: {
      enabled: !!targets.pangle?.enabled,
      categoryCode: targets.pangle?.categoryCode,
      status: targets.pangle?.status ?? "test",
      downloadUrl: targets.pangle?.downloadUrl,
    },
  };
}

function validateCreatePayload(input: {
  displayName?: string;
  platform?: string;
  targets: ReturnType<typeof normalizeTargets>;
}) {
  const errors: string[] = [];
  const displayName = input.displayName?.trim();
  const mobilePlatform = input.platform?.toUpperCase() as MobilePlatform | undefined;
  const selected = Object.entries(input.targets)
    .filter(([, v]) => v.enabled)
    .map(([k]) => k);

  if (!displayName || displayName.length < 3) {
    errors.push("displayName tối thiểu 3 ký tự");
  }
  if (!mobilePlatform || !["ANDROID", "IOS"].includes(mobilePlatform)) {
    errors.push("platform phải là ANDROID hoặc IOS");
  }
  if (selected.length === 0) {
    errors.push("Chọn ít nhất 1 nền tảng để tạo app");
  }

  if (input.targets.minter.enabled) {
    if (!input.targets.minter.packageName?.trim()) {
      errors.push("Minter yêu cầu packageName");
    }
    if (input.targets.minter.isLiveInStore && !input.targets.minter.storeUrl?.trim()) {
      errors.push("Minter live app yêu cầu storeUrl");
    }
  }

  if (input.targets.pangle.enabled) {
    if (!input.targets.pangle.categoryCode || Number.isNaN(Number(input.targets.pangle.categoryCode))) {
      errors.push("Pangle yêu cầu categoryCode hợp lệ");
    }
    if (input.targets.pangle.status === "live" && !input.targets.pangle.downloadUrl?.trim()) {
      errors.push("Pangle live app yêu cầu downloadUrl");
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    displayName,
    mobilePlatform,
    selected,
  };
}

export async function GET() {
  const email = await getSessionEmail();
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const record = await db.userToken.findUnique({ where: { email } });
  if (!record?.publisherId)
    return NextResponse.json({ error: "Publisher chưa được resolve" }, { status: 403 });

  try {
    const data = await admob.getApps(email, record.publisherId);
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
  const targets = normalizeTargets(body.targets as TargetPayload | undefined);
  const valid = validateCreatePayload({
    displayName: body.displayName,
    platform: body.platform,
    targets,
  });

  if (!valid.ok) {
    return NextResponse.json(
      { error: "Payload không hợp lệ", details: valid.errors },
      { status: 400 }
    );
  }

  const displayName = valid.displayName!;
  const platform = valid.mobilePlatform!;

  try {
    const results: Record<string, { ok: boolean; data?: unknown; error?: string; warning?: string }> = {};

    if (targets.admob.enabled) {
      try {
        const result = await admob.createApp(email, record.publisherId, {
          platform,
          manualAppInfo: { displayName },
        });
        results.admob = { ok: true, data: result };
      } catch (e: any) {
        results.admob = { ok: false, error: e.message };
      }
    }

    if (targets.liftoff.enabled) {
      try {
        const result = await liftoff.createApp({
          platform: platform === "IOS" ? "ios" : "android",
          name: displayName,
          bundleId: targets.liftoff.bundleId?.trim() || undefined,
          isManual: true,
        });
        results.liftoff = { ok: true, data: result };
      } catch (e: any) {
        results.liftoff = { ok: false, error: e.message };
      }
    }

    if (targets.minter.enabled) {
      try {
        const result = await mintegral.createApp({
          appName: displayName,
          os: platform,
          packageName: targets.minter.packageName!.trim(),
          isLiveInStore: targets.minter.isLiveInStore,
          storeUrl: targets.minter.storeUrl?.trim() || undefined,
        });
        results.minter = { ok: true, data: result };
      } catch (e: any) {
        results.minter = { ok: false, error: e.message };
      }
    }

    if (targets.pangle.enabled) {
      try {
        const result = await pangle.createApp(
          displayName,
          Number(targets.pangle.categoryCode),
          targets.pangle.status ?? "test",
          targets.pangle.downloadUrl?.trim() || undefined
        );
        const pangleStatus = result?.data?.status;
        results.pangle = {
          ok: true,
          data: result,
          warning:
            pangleStatus === 6
              ? "App đã được tạo ở trạng thái TEST (status=6). Portal có thể hiển thị trễ vài phút hoặc khác theo account/role đăng nhập."
              : undefined,
        };
      } catch (e: any) {
        results.pangle = { ok: false, error: e.message };
      }
    }

    const hasSuccess = Object.values(results).some((r) => r.ok);
    const hasErrors = Object.values(results).some((r) => !r.ok);

    if (!hasSuccess) {
      await auditLog({
        email,
        action: "create_app_multi",
        publisherId: record.publisherId,
        payload: { displayName, platform, targets },
        result: results,
        statusCode: 500,
      });
      return NextResponse.json(
        { error: "Không tạo được app trên nền tảng nào", results },
        { status: 500 }
      );
    }

    await auditLog({
      email,
      action: "create_app_multi",
      publisherId: record.publisherId,
      payload: { displayName, platform, targets },
      result: results,
      statusCode: 200,
    });

    return NextResponse.json(
      {
        displayName,
        mobilePlatform: platform,
        createdTargets: valid.selected,
        results,
        hasErrors,
      },
      { status: 201 }
    );
  } catch (e: any) {
    await auditLog({
      email,
      action: "create_app_multi",
      publisherId: record.publisherId,
      payload: { displayName, platform, targets },
      result: { error: e.message },
      statusCode: 500,
    });
    if (e.message === "ADMOB_FORBIDDEN")
      return NextResponse.json(
        { error: "Không có quyền tạo app trên publisher này" },
        { status: 403 }
      );
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
