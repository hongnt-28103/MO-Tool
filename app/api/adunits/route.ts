import { NextRequest, NextResponse } from "next/server";
import { getSessionEmail } from "@/lib/session";
import { admob, auditLog } from "@/lib/admob";
import { db } from "@/lib/db";
import { detectAdFormat, detectFloorTier } from "@/lib/scenarios";
import { pangle, PANGLE_FORMAT_MAP } from "@/lib/pangle";
import { liftoff, LIFTOFF_FORMAT_MAP } from "@/lib/liftoff";
import { mintegral, MINTEGRAL_FORMAT_MAP } from "@/lib/mintegral";

const AD_TYPES: Record<string, string[]> = {
  BANNER: ["RICH_MEDIA"],
  NATIVE: ["RICH_MEDIA"],
  INTERSTITIAL: ["RICH_MEDIA", "VIDEO"],
  REWARDED: ["RICH_MEDIA", "VIDEO"],
  APP_OPEN: ["RICH_MEDIA", "VIDEO"],
};

type PlatformRule = "per_unit" | "per_format";

export async function GET(req: NextRequest) {
  const email = await getSessionEmail();
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const appId = searchParams.get("appId");

  // If appId provided, return saved ad units from DB
  if (appId) {
    const adUnits = await db.adUnit.findMany({
      where: { appId },
      include: { placements: true },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ adUnits });
  }

  // Otherwise return AdMob ad units (legacy)
  const record = await db.userToken.findUnique({ where: { email } });
  if (!record?.publisherId)
    return NextResponse.json({ error: "Publisher chưa được resolve" }, { status: 403 });
  try {
    const data = await admob.getAdUnits(email, record.publisherId);
    return NextResponse.json(data);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const email = await getSessionEmail();
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const record = await db.userToken.findUnique({ where: { email } });
  if (!record?.publisherId)
    return NextResponse.json({ error: "Publisher chưa được resolve" }, { status: 403 });

  const body = await req.json();
  const {
    appId,       // DB App id
    units,       // [{ name, format? }]
    platforms,   // { admob: true, pangle: true, liftoff: true, mintegral: true }
    rules,       // { pangle: "per_unit"|"per_format", liftoff: ..., mintegral: ... }
  } = body as {
    appId: string;
    units: Array<{ name: string; format?: string }>;
    platforms: Record<string, boolean>;
    rules: Record<string, PlatformRule>;
  };

  if (!appId || !Array.isArray(units) || units.length === 0)
    return NextResponse.json({ error: "Thiếu appId hoặc units" }, { status: 400 });

  // Fetch app from DB
  const app = await db.app.findUnique({ where: { id: appId } });
  if (!app) return NextResponse.json({ error: "App không tồn tại" }, { status: 404 });

  const publisherId = record.publisherId;

  // Pre-process units: detect format & tier
  const processed = units.map(u => {
    const format = u.format ?? detectAdFormat(u.name) ?? "INTERSTITIAL";
    const tier = detectFloorTier(u.name);
    return { name: u.name, format, tier };
  });

  // ═══ 1. Create AdMob ad units ═══
  type AdUnitResult = {
    name: string; format: string; tier: string;
    admobAdUnitId?: string; admobStatus: string; admobError?: string;
    placements: Record<string, { placementId?: string; status: string; error?: string }>;
  };

  const results: AdUnitResult[] = [];

  for (const unit of processed) {
    const result: AdUnitResult = {
      name: unit.name, format: unit.format, tier: unit.tier,
      admobStatus: "none", placements: {},
    };

    if (platforms.admob) {
      try {
        // Build AdMob create body
        const admobBody: Record<string, unknown> = {
          displayName: unit.name,
          adFormat: unit.format,
          appId: app.admobAppId,
          adTypes: AD_TYPES[unit.format] ?? ["RICH_MEDIA", "VIDEO"],
        };

        // If "high" tier → set eCPM floor: Google optimized + High floor
        if (unit.tier === "high") {
          admobBody.rewardSettings = undefined; // keep API clean
          admobBody.adUnitSizeConfig = undefined;
          // eCPM floor config: highFloor = true means Google optimized high floor
          admobBody.eCpmFloorSettings = {
            eCpmFloorState: "GOOGLE_OPTIMIZED",
            method: "HIGH",
          };
        }

        const res = await admob.createAdUnit(email, publisherId, admobBody);
        result.admobAdUnitId = res.adUnitId ?? res.name;
        result.admobStatus = "ok";
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        result.admobStatus = "error";
        result.admobError = msg;
      }
    }

    results.push(result);
  }

  // ═══ 2. Create placements on other platforms ═══

  // Helper: get unique formats from processed units
  const uniqueFormats = [...new Set(processed.map(u => u.format))];

  // --- Pangle ---
  if (platforms.pangle && app.pangleAppId) {
    const pangleAppIdNum = parseInt(app.pangleAppId);
    const rule: PlatformRule = rules.pangle ?? "per_unit";

    if (rule === "per_format") {
      // 1 format = 1 placement
      const formatPlacementMap: Record<string, { id?: string; status: string; error?: string }> = {};
      for (const fmt of uniqueFormats) {
        const slotType = PANGLE_FORMAT_MAP[fmt];
        if (!slotType) { formatPlacementMap[fmt] = { status: "error", error: `Unknown format: ${fmt}` }; continue; }
        try {
          const res = await pangle.createPlacement({
            appId: pangleAppIdNum,
            adSlotType: slotType,
            adSlotName: `${app.name}_${fmt.toLowerCase()}`,
          });
          formatPlacementMap[fmt] = { id: String(res.data?.code_id ?? res.data?.ad_slot_id), status: "ok" };
        } catch (e: unknown) {
          formatPlacementMap[fmt] = { status: "error", error: e instanceof Error ? e.message : String(e) };
        }
      }
      // Assign same placement per format to all units
      for (const r of results) {
        const fp = formatPlacementMap[r.format];
        r.placements.pangle = fp ? { placementId: fp.id, status: fp.status, error: fp.error } : { status: "none" };
      }
    } else {
      // 1 unit = 1 placement
      for (const r of results) {
        const slotType = PANGLE_FORMAT_MAP[r.format];
        if (!slotType) { r.placements.pangle = { status: "error", error: `Unknown format: ${r.format}` }; continue; }
        try {
          const res = await pangle.createPlacement({
            appId: pangleAppIdNum,
            adSlotType: slotType,
            adSlotName: r.name,
          });
          r.placements.pangle = { placementId: String(res.data?.code_id ?? res.data?.ad_slot_id), status: "ok" };
        } catch (e: unknown) {
          r.placements.pangle = { status: "error", error: e instanceof Error ? e.message : String(e) };
        }
      }
    }
  }

  // --- Liftoff ---
  if (platforms.liftoff && app.liftoffAppId) {
    const rule: PlatformRule = rules.liftoff ?? "per_unit";

    if (rule === "per_format") {
      const formatPlacementMap: Record<string, { id?: string; status: string; error?: string }> = {};
      for (const fmt of uniqueFormats) {
        const type = LIFTOFF_FORMAT_MAP[fmt];
        if (!type) { formatPlacementMap[fmt] = { status: "error", error: `Unknown format: ${fmt}` }; continue; }
        try {
          const res = await liftoff.createPlacement({
            vungleAppId: app.liftoffAppId!,
            name: `${app.name}_${fmt.toLowerCase()}`,
            type,
          });
          formatPlacementMap[fmt] = { id: res.id ?? res.reference, status: "ok" };
        } catch (e: unknown) {
          formatPlacementMap[fmt] = { status: "error", error: e instanceof Error ? e.message : String(e) };
        }
      }
      for (const r of results) {
        const fp = formatPlacementMap[r.format];
        r.placements.liftoff = fp ? { placementId: fp.id, status: fp.status, error: fp.error } : { status: "none" };
      }
    } else {
      for (const r of results) {
        const type = LIFTOFF_FORMAT_MAP[r.format];
        if (!type) { r.placements.liftoff = { status: "error", error: `Unknown format: ${r.format}` }; continue; }
        try {
          const res = await liftoff.createPlacement({
            vungleAppId: app.liftoffAppId!,
            name: r.name,
            type,
          });
          r.placements.liftoff = { placementId: res.id ?? res.reference, status: "ok" };
        } catch (e: unknown) {
          r.placements.liftoff = { status: "error", error: e instanceof Error ? e.message : String(e) };
        }
      }
    }
  }

  // --- Mintegral ---
  if (platforms.mintegral && app.mintegralAppId) {
    const mAppId = parseInt(app.mintegralAppId);
    const rule: PlatformRule = rules.mintegral ?? "per_unit";

    if (rule === "per_format") {
      const formatPlacementMap: Record<string, { id?: string; status: string; error?: string }> = {};
      for (const fmt of uniqueFormats) {
        const adType = MINTEGRAL_FORMAT_MAP[fmt];
        if (!adType) { formatPlacementMap[fmt] = { status: "error", error: `Unknown format: ${fmt}` }; continue; }
        try {
          const res = await mintegral.createPlacement({
            appId: mAppId,
            placementName: `${app.name}_${fmt.toLowerCase()}`,
            adType,
          });
          formatPlacementMap[fmt] = { id: String(res.data?.placement_id), status: "ok" };
        } catch (e: unknown) {
          formatPlacementMap[fmt] = { status: "error", error: e instanceof Error ? e.message : String(e) };
        }
      }
      for (const r of results) {
        const fp = formatPlacementMap[r.format];
        r.placements.mintegral = fp ? { placementId: fp.id, status: fp.status, error: fp.error } : { status: "none" };
      }
    } else {
      for (const r of results) {
        const adType = MINTEGRAL_FORMAT_MAP[r.format];
        if (!adType) { r.placements.mintegral = { status: "error", error: `Unknown format: ${r.format}` }; continue; }
        try {
          const res = await mintegral.createPlacement({
            appId: mAppId,
            placementName: r.name,
            adType,
          });
          r.placements.mintegral = { placementId: String(res.data?.placement_id), status: "ok" };
        } catch (e: unknown) {
          r.placements.mintegral = { status: "error", error: e instanceof Error ? e.message : String(e) };
        }
      }
    }
  }

  // ═══ 3. Save to DB ═══
  const savedUnits = [];
  for (const r of results) {
    const adUnit = await db.adUnit.create({
      data: {
        appId,
        name: r.name,
        format: r.format,
        tier: r.tier,
        admobAdUnitId: r.admobAdUnitId ?? null,
        admobStatus: r.admobStatus,
        admobError: r.admobError ?? null,
        placements: {
          create: Object.entries(r.placements).map(([platform, p]) => ({
            platform,
            placementId: p.placementId ?? null,
            placementName: r.name,
            status: p.status,
            error: p.error ?? null,
          })),
        },
      },
      include: { placements: true },
    });
    savedUnits.push(adUnit);
  }

  await auditLog({
    email,
    action: "create_adunit_multi",
    publisherId,
    payload: { appId, count: units.length, platforms, rules },
    result: { resultCount: results.length },
    statusCode: 200,
  });

  return NextResponse.json({ results, savedUnits });
}
