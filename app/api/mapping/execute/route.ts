import { NextRequest, NextResponse } from "next/server";
import { getSessionEmail } from "@/lib/session";
import { admob, auditLog } from "@/lib/admob";
import { db } from "@/lib/db";
import { resolveScenario, detectAdFormat, detectFloorTier, buildGroupName, CountryGroup, UIState } from "@/lib/scenarios";

export async function POST(req: NextRequest) {
  const email = await getSessionEmail();
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const record = await db.userToken.findUnique({ where: { email } });
  if (!record?.publisherId)
    return NextResponse.json({ error: "Publisher chưa được resolve" }, { status: 403 });

  const body = await req.json();
  const { uiState, adUnits, appCode, countryGroups, sdkKeyApplovin, networks, appId } = body as {
    uiState: UIState;
    adUnits: Array<{
      name: string;
      format?: string;
      adUnitId: string;
      panglePlacementId?: string;
      liftoffReferenceId?: string;
      liftoffAppId?: string;
      mintegralPlacementId?: string;
      mintegralUnitId?: string;
      mintegralAppId?: string;
      mintegralAppKey?: string;
      metaPlacementId?: string;
    }>;
    appCode: string;
    countryGroups?: CountryGroup[];
    sdkKeyApplovin?: string;
    networks: string[];
    appId?: string;
  };

  if (uiState.groupBy === "AD_UNIT" && !uiState.ecpmFloor)
    return NextResponse.json({ error: "INVALID" }, { status: 400 });
  if (uiState.countryMode === "GROUPS" && (!countryGroups?.length))
    return NextResponse.json({ error: "MISSING_GROUPS" }, { status: 400 });

  const publisherId = record.publisherId;
  const scenario = resolveScenario(uiState);

  // Step 1: Get adSources for mapping
  const adSourcesData = await admob.getAdSources(email, publisherId);
  const adSources: Array<{ adSourceId: string; title: string }> = adSourcesData.adSources ?? [];
  console.log("[MAPPING] Ad sources found:", adSources.map(s => s.title));

  // CRITICAL: Phải tìm version "(bidding)" cho mỗi network
  // VD: "AppLovin (bidding)" thay vì "AppLovin" (waterfall)
  const findBiddingAdSource = (keyword: string) => {
    // Ưu tiên tìm "(bidding)" version trước
    const bidding = adSources.find((s) => {
      const t = s.title.toLowerCase();
      return t.includes(keyword.toLowerCase()) && t.includes("(bidding)");
    });
    if (bidding) return bidding;
    // Fallback sang non-bidding
    return adSources.find((s) => s.title.toLowerCase().includes(keyword.toLowerCase()));
  };

  const pangleSource = findBiddingAdSource("pangle");
  const liftoffSource = findBiddingAdSource("liftoff");
  const mintegralSource = findBiddingAdSource("mintegral");
  const applovinSource = findBiddingAdSource("applovin");
  const metaSource = findBiddingAdSource("meta");
  console.log("[MAPPING] Matched BIDDING sources:", {
    pangle: pangleSource?.title ?? "NOT FOUND",
    liftoff: liftoffSource?.title ?? "NOT FOUND",
    mintegral: mintegralSource?.title ?? "NOT FOUND",
    applovin: applovinSource?.title ?? "NOT FOUND",
    meta: metaSource?.title ?? "NOT FOUND",
  });

  // Resolve platform early (needed for adapter selection)
  let platform: "ANDROID" | "IOS" = "IOS";
  if (appId) {
    const app = await db.app.findUnique({ where: { id: appId } });
    if (app?.platform) {
      platform = app.platform as "ANDROID" | "IOS";
      console.log("[MAPPING] Platform from app DB:", platform, "for app:", app.name);
    } else {
      console.warn("[MAPPING] App not found or missing platform, using default IOS");
    }
  } else {
    console.warn("[MAPPING] No appId provided, using default platform IOS");
  }

  // Helper: tìm adapter phù hợp theo platform + format từ danh sách adapters
  const findMatchingAdapter = (adapters: any[], adFormat: string) => {
    // Map format sang adapter format names
    const formatMap: Record<string, string[]> = {
      "BANNER": ["BANNER"],
      "INTERSTITIAL": ["INTERSTITIAL"],
      "REWARDED": ["REWARDED"],
      "REWARDED_INTERSTITIAL": ["REWARDED_INTERSTITIAL"],
      "NATIVE": ["NATIVE"],
      "NATIVE_ADVANCED": ["NATIVE"],
      "APP_OPEN": ["APP_OPEN"],
    };
    const acceptFormats = formatMap[adFormat] ?? [adFormat];
    const platformLower = platform.toLowerCase();

    for (const adapter of adapters) {
      const ap = String(adapter.platform ?? "").toLowerCase();
      const af = String(adapter.formats?.[0] ?? adapter.supportedAdFormat ?? "").toUpperCase();
      
      const platformMatch = ap.includes(platformLower) || ap === "" || !adapter.platform;
      const formatMatch = acceptFormats.includes(af) || af === "" || !af;

      if (platformMatch && formatMatch) {
        return adapter;
      }
    }

    // Nếu không tìm được exact match, log tất cả adapters và chọn theo platform only
    console.log(`[MAPPING] No exact adapter match for platform=${platform}, format=${adFormat}. Disponible:`,
      adapters.map((a: any) => ({ id: a.adapterId, platform: a.platform, format: a.formats || a.supportedAdFormat, title: a.title }))
    );

    // Fallback: tìm theo platform only
    for (const adapter of adapters) {
      const ap = String(adapter.platform ?? "").toLowerCase();
      if (ap.includes(platformLower)) return adapter;
    }

    // Last fallback: return first adapter
    return adapters[0];
  };

  // Step 2: Get adapters + build adUnitMappings per network
  const mappingResults: Record<string, { name: string; status: string }> = {};

  for (const unit of adUnits) {
    const fragment = unit.adUnitId.split("/").pop()!;
    const format = unit.format ?? detectAdFormat(unit.name) ?? (() => { throw new Error(`Không nhận diện được ad format từ tên "${unit.name}". Tên phải chứa: inter, reward, aoa, banner, native.`); })();

    // Pangle mapping
    if (networks.includes("pangle") && pangleSource && unit.panglePlacementId) {
      try {
        const adaptersData = await admob.getAdapters(email, publisherId, pangleSource.adSourceId);
        const adapter = findMatchingAdapter(adaptersData.adapters ?? [], format);
        if (adapter) {
          const meta = adapter.adapterConfigMetadata ?? [];
          console.log(`[MAPPING] Pangle adapter metadata for ${unit.name}:`, JSON.stringify(meta.map((m:any) => ({label: m.adapterConfigMetadataLabel, id: m.adapterConfigMetadataId}))));
          
          const appIdCfg = meta.find((m: any) => {
            const lbl = String(m.adapterConfigMetadataLabel ?? "").toLowerCase();
            return lbl.includes("app") && lbl.includes("id");
          });
          const placementCfg = meta.find((m: any) => {
            const lbl = String(m.adapterConfigMetadataLabel ?? "").toLowerCase();
            return lbl.includes("placement");
          });

          if (!placementCfg?.adapterConfigMetadataId) {
            const available = meta.map((m:any) => m.adapterConfigMetadataLabel).join(", ");
            throw new Error(`Pangle adapter thiếu trường Placement ID. Available: [${available}]`);
          }

          const mapping = await admob.createAdUnitMapping(email, publisherId, fragment, {
            adapterId: adapter.adapterId,
            adUnitConfigurations: {
              [placementCfg.adapterConfigMetadataId]: unit.panglePlacementId,
            },
            displayName: `${unit.name}_pangle`,
          });
          console.log(`[MAPPING] ✓ Pangle mapping created for ${unit.name}`);
          mappingResults[`${unit.adUnitId}_pangle`] = { name: mapping.name, status: "ok" };
        }
      } catch (e: any) {
        console.error(`[MAPPING] Pangle mapping failed for ${unit.name}:`, e.message);
        mappingResults[`${unit.adUnitId}_pangle`] = { name: "", status: `error: ${e.message}` };
      }
    }

    // Liftoff mapping
    if (networks.includes("liftoff") && liftoffSource && unit.liftoffReferenceId) {
      try {
        const adaptersData = await admob.getAdapters(email, publisherId, liftoffSource.adSourceId);
        const adapter = findMatchingAdapter(adaptersData.adapters ?? [], format);
        if (adapter) {
          const meta = adapter.adapterConfigMetadata ?? [];
          console.log(`[MAPPING] Liftoff adapter metadata for ${unit.name}:`, JSON.stringify(meta.map((m:any) => ({label: m.adapterConfigMetadataLabel, id: m.adapterConfigMetadataId}))));
          
          // Flexible matching - tìm theo contains thay vì exact match
          const appIdCfg = meta.find((m: any) => {
            const lbl = String(m.adapterConfigMetadataLabel ?? "").toLowerCase();
            return lbl.includes("app") && lbl.includes("id");
          });
          const refCfg = meta.find((m: any) => {
            const lbl = String(m.adapterConfigMetadataLabel ?? "").toLowerCase();
            return lbl.includes("placement") || lbl.includes("reference");
          });

          if (!appIdCfg?.adapterConfigMetadataId || !refCfg?.adapterConfigMetadataId) {
            const available = meta.map((m:any) => m.adapterConfigMetadataLabel).join(", ");
            throw new Error(`Liftoff adapter thiếu trường App ID hoặc Placement/Reference ID. Available: [${available}]`);
          }

          const mapping = await admob.createAdUnitMapping(email, publisherId, fragment, {
            adapterId: adapter.adapterId,
            adUnitConfigurations: {
              [appIdCfg.adapterConfigMetadataId]: unit.liftoffAppId ?? "",
              [refCfg.adapterConfigMetadataId]: unit.liftoffReferenceId,
            },
            displayName: `${unit.name}_liftoff`,
          });
          console.log(`[MAPPING] ✓ Liftoff mapping created for ${unit.name}`);
          mappingResults[`${unit.adUnitId}_liftoff`] = { name: mapping.name, status: "ok" };
        }
      } catch (e: any) {
        console.error(`[MAPPING] Liftoff mapping failed for ${unit.name}:`, e.message);
        mappingResults[`${unit.adUnitId}_liftoff`] = { name: "", status: `error: ${e.message}` };
      }
    }

    // Mintegral mapping
    if (networks.includes("mintegral") && mintegralSource && unit.mintegralPlacementId) {
      try {
        const adaptersData = await admob.getAdapters(email, publisherId, mintegralSource.adSourceId);
        const adapter = findMatchingAdapter(adaptersData.adapters ?? [], format);
        if (adapter) {
          const meta = adapter.adapterConfigMetadata ?? [];
          const find = (label: string) => meta.find((m: any) => m.adapterConfigMetadataLabel === label);
          
          const appIdCfg = find("App ID");
          const appKeyCfg = find("App Key");
          const placementCfg = find("Placement ID");
          const unitCfg = find("Unit ID");

          if (!placementCfg?.adapterConfigMetadataId) {
            const available = meta.map((m:any) => m.adapterConfigMetadataLabel).join(", ");
            throw new Error(`Mintegral adapter thiếu trường Placement ID. Available: [${available}]`);
          }

          const configs: Record<string, string> = {};
          if (appIdCfg?.adapterConfigMetadataId) configs[appIdCfg.adapterConfigMetadataId] = unit.mintegralAppId ?? "";
          if (appKeyCfg?.adapterConfigMetadataId) configs[appKeyCfg.adapterConfigMetadataId] = unit.mintegralAppKey ?? "";
          if (placementCfg?.adapterConfigMetadataId) configs[placementCfg.adapterConfigMetadataId] = unit.mintegralPlacementId;
          if (unitCfg?.adapterConfigMetadataId) configs[unitCfg.adapterConfigMetadataId] = unit.mintegralUnitId ?? "";

          const mapping = await admob.createAdUnitMapping(email, publisherId, fragment, {
            adapterId: adapter.adapterId,
            adUnitConfigurations: configs,
            displayName: `${unit.name}_mintegral`,
          });
          console.log(`[MAPPING] ✓ Mintegral mapping created for ${unit.name}`);
          mappingResults[`${unit.adUnitId}_mintegral`] = { name: mapping.name, status: "ok" };
        }
      } catch (e: any) {
        console.error(`[MAPPING] Mintegral mapping failed for ${unit.name}:`, e.message);
        mappingResults[`${unit.adUnitId}_mintegral`] = { name: "", status: `error: ${e.message}` };
      }
    }

    // Meta mapping
    if (networks.includes("meta") && metaSource && unit.metaPlacementId) {
      try {
        const adaptersData = await admob.getAdapters(email, publisherId, metaSource.adSourceId);
        const adapter = findMatchingAdapter(adaptersData.adapters ?? [], format);
        if (adapter) {
          const meta = adapter.adapterConfigMetadata ?? [];
          const placementCfg = meta.find((m: any) =>
            String(m.adapterConfigMetadataLabel ?? "").toLowerCase().includes("placement")
          );

          if (!placementCfg?.adapterConfigMetadataId) {
            const available = meta.map((m:any) => m.adapterConfigMetadataLabel).join(", ");
            throw new Error(`Meta adapter thiếu trường Placement ID. Available: [${available}]`);
          }

          const mapping = await admob.createAdUnitMapping(email, publisherId, fragment, {
            adapterId: adapter.adapterId,
            adUnitConfigurations: {
              [placementCfg.adapterConfigMetadataId]: unit.metaPlacementId,
            },
            displayName: `${unit.name}_meta`,
          });
          console.log(`[MAPPING] ✓ Meta mapping created for ${unit.name}`);
          mappingResults[`${unit.adUnitId}_meta`] = { name: mapping.name, status: "ok" };
        }
      } catch (e: any) {
        console.error(`[MAPPING] Meta mapping failed for ${unit.name}:`, e.message);
        mappingResults[`${unit.adUnitId}_meta`] = { name: "", status: `error: ${e.message}` };
      }
    }

    // AppLovin mapping
    if (networks.includes("applovin") && applovinSource && sdkKeyApplovin) {
      try {
        const adaptersData = await admob.getAdapters(email, publisherId, applovinSource.adSourceId);
        const adapter = findMatchingAdapter(adaptersData.adapters ?? [], format);
        if (adapter) {
          const meta = adapter.adapterConfigMetadata ?? [];
          const sdkKeyCfg = meta.find((m: any) =>
            String(m.adapterConfigMetadataLabel ?? "").toLowerCase().includes("sdk")
          );

          if (!sdkKeyCfg?.adapterConfigMetadataId) {
            const available = meta.map((m:any) => m.adapterConfigMetadataLabel).join(", ");
            throw new Error(`AppLovin adapter thiếu trường SDK Key. Available: [${available}]`);
          }

          const mapping = await admob.createAdUnitMapping(email, publisherId, fragment, {
            adapterId: adapter.adapterId,
            adUnitConfigurations: {
              [sdkKeyCfg.adapterConfigMetadataId]: sdkKeyApplovin,
            },
            displayName: `${unit.name}_applovin`,
          });
          console.log(`[MAPPING] ✓ AppLovin mapping created for ${unit.name}`);
          mappingResults[`${unit.adUnitId}_applovin`] = { name: mapping.name, status: "ok" };
        }
      } catch (e: any) {
        console.error(`[MAPPING] AppLovin mapping failed for ${unit.name}:`, e.message);
        mappingResults[`${unit.adUnitId}_applovin`] = { name: "", status: `error: ${e.message}` };
      }
    }
  }

  console.log("[MAPPING] Total mappings created:", Object.values(mappingResults).filter(r => r.status === "ok").length, "/", Object.keys(mappingResults).length);

  // Step 3: Create mediation groups
  const mediationResults: Array<{ groupName: string; status: string; id?: string }> = [];
  const cgList = uiState.countryMode === "GROUPS" && countryGroups?.length
    ? countryGroups
    : [null];

  // Group ad units
  const groupMap = new Map<string, {
    adUnitIds: string[];
    format: string;
    targeting: { targetedRegionCodes?: string[]; excludedRegionCodes?: string[] };
  }>();

  for (const cg of cgList) {
    for (const unit of adUnits) {
      const format = unit.format ?? detectAdFormat(unit.name) ?? (() => { throw new Error(`Không nhận diện được ad format từ tên "${unit.name}". Tên phải chứa: inter, reward, aoa, banner, native.`); })();
      const floorTier = detectFloorTier(unit.name);

      const groupName = buildGroupName({
        appCode,
        scenario,
        adUnitName: unit.name,
        adFormat: format,
        floorTier,
        countryGroupName: cg?.name,
      });

      if (!groupMap.has(groupName)) {
        const targeting: { targetedRegionCodes?: string[]; excludedRegionCodes?: string[] } = {};
        if (cg) {
          if (cg.mode === "INCLUDE") targeting.targetedRegionCodes = cg.countries;
          else targeting.excludedRegionCodes = cg.countries;
        }
        groupMap.set(groupName, { adUnitIds: [], format, targeting });
      }
      groupMap.get(groupName)!.adUnitIds.push(unit.adUnitId);
    }
  }

  for (const [groupName, { adUnitIds, format, targeting }] of groupMap) {
    const mediationGroupLines: Record<string, object> = {};
    let lineIdx = -1;

    // Build adUnitMappings for this group
    // Keys = ad unit ID in ca-app-pub-xxx/yyy format (same as targeting.adUnitIds)
    // Values = mapping resource name (accounts/pub-xxx/adUnits/yyy/adUnitMappings/zzz)
    const buildAdUnitMappings = (networkKey: string) => {
      const mappings: Record<string, string> = {};
      for (const auId of adUnitIds) {
        const key = `${auId}_${networkKey}`;
        if (mappingResults[key]?.name) {
          mappings[auId] = mappingResults[key].name;
        }
      }
      return mappings;
    };

    if (pangleSource && networks.includes("pangle")) {
      const m = buildAdUnitMappings("pangle");
      if (Object.keys(m).length > 0) {
        const lineId = String(lineIdx--);
        mediationGroupLines[lineId] = {
          id: lineId,
          displayName: "Pangle bidding",
          adSourceId: pangleSource.adSourceId,
          cpmMode: "LIVE",
          state: "ENABLED",
          adUnitMappings: m,
        };
      }
    }
    if (liftoffSource && networks.includes("liftoff")) {
      const m = buildAdUnitMappings("liftoff");
      if (Object.keys(m).length > 0) {
        const lineId = String(lineIdx--);
        mediationGroupLines[lineId] = {
          id: lineId,
          displayName: "Liftoff bidding",
          adSourceId: liftoffSource.adSourceId,
          cpmMode: "LIVE",
          state: "ENABLED",
          adUnitMappings: m,
        };
      }
    }
    if (mintegralSource && networks.includes("mintegral")) {
      const m = buildAdUnitMappings("mintegral");
      if (Object.keys(m).length > 0) {
        const lineId = String(lineIdx--);
        mediationGroupLines[lineId] = {
          id: lineId,
          displayName: "Mintegral bidding",
          adSourceId: mintegralSource.adSourceId,
          cpmMode: "LIVE",
          state: "ENABLED",
          adUnitMappings: m,
        };
      }
    }
    if (metaSource && networks.includes("meta")) {
      const m = buildAdUnitMappings("meta");
      if (Object.keys(m).length > 0) {
        const lineId = String(lineIdx--);
        mediationGroupLines[lineId] = {
          id: lineId,
          displayName: "Meta bidding",
          adSourceId: metaSource.adSourceId,
          cpmMode: "LIVE",
          state: "ENABLED",
          adUnitMappings: m,
        };
      }
    }
    if (applovinSource && networks.includes("applovin")) {
      const m = buildAdUnitMappings("applovin");
      if (Object.keys(m).length > 0) {
        const lineId = String(lineIdx--);
        mediationGroupLines[lineId] = {
          id: lineId,
          displayName: "AppLovin bidding",
          adSourceId: applovinSource.adSourceId,
          cpmMode: "LIVE",
          state: "ENABLED",
          adUnitMappings: m,
        };
      }
    }

    try {
      const groupPayload = {
        displayName: groupName,
        targeting: {
          platform,
          format,
          adUnitIds,
          ...targeting,
        },
        state: "ENABLED",
        mediationGroupLines,
      };
      console.log(`[MAPPING] Creating group "${groupName}" with ${Object.keys(mediationGroupLines).length} lines, platform=${platform}, format=${format}`);
      console.log(`[MAPPING] Group payload:`, JSON.stringify(groupPayload, null, 2));
      const res = await admob.createMediationGroup(email, publisherId, groupPayload);
      mediationResults.push({ groupName, status: "ok", id: res.mediationGroupId });
    } catch (e: any) {
      console.error(`[MAPPING] Group creation failed for "${groupName}":`, e.message);
      console.error(`[MAPPING] Group had ${Object.keys(mediationGroupLines).length} mediation lines`);
      mediationResults.push({ groupName, status: `error: ${e.message}` });
    }
  }

  await auditLog({
    email,
    action: "mapping",
    publisherId,
    payload: { scenario, groupCount: groupMap.size },
    result: { mappingResults, mediationResults },
    statusCode: 200,
  });

  return NextResponse.json({
    scenario,
    mappingResults,
    mediationResults,
    summary: {
      totalGroups: groupMap.size,
      successGroups: mediationResults.filter((r) => r.status === "ok").length,
      failedGroups: mediationResults.filter((r) => r.status !== "ok").length,
    },
  });
}
