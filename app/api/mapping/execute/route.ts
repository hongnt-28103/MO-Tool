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
  const { uiState, adUnits, appCode, countryGroups, sdkKeyApplovin, networks } = body as {
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

  const findAdSource = (title: string) =>
    adSources.find((s) => s.title.toLowerCase().includes(title.toLowerCase()));

  const pangleSource = findAdSource("pangle");
  const liftoffSource = findAdSource("liftoff");
  const mintegralSource = findAdSource("mintegral");
  const applovinSource = findAdSource("applovin");
  const metaSource = findAdSource("meta");

  // Step 2: Get adapters + build adUnitMappings per network
  const mappingResults: Record<string, { name: string; status: string }> = {};

  for (const unit of adUnits) {
    const fragment = unit.adUnitId.split("/").pop()!;
    const format = unit.format ?? detectAdFormat(unit.name) ?? "INTERSTITIAL";

    // Pangle mapping
    if (networks.includes("pangle") && pangleSource && unit.panglePlacementId) {
      try {
        const adapters = await admob.getAdapters(email, publisherId, pangleSource.adSourceId);
        const adapter = adapters.adapters?.[0];
        if (adapter) {
          const appIdCfg = adapter.adapterConfigMetadata?.find((m: any) =>
            m.adapterConfigMetadataLabel === "App ID"
          );
          const placementCfg = adapter.adapterConfigMetadata?.find((m: any) =>
            m.adapterConfigMetadataLabel === "Placement ID"
          );
          const mapping = await admob.createAdUnitMapping(email, publisherId, fragment, {
            adapterId: adapter.adapterId,
            adUnitConfigurations: {
              [appIdCfg.adapterConfigMetadataId]: unit.adUnitId.split("/")[0].replace("ca-app-pub-", ""),
              [placementCfg.adapterConfigMetadataId]: unit.panglePlacementId,
            },
            displayName: `${unit.name}_pangle`,
          });
          mappingResults[`${unit.adUnitId}_pangle`] = { name: mapping.name, status: "ok" };
        }
      } catch (e: any) {
        mappingResults[`${unit.adUnitId}_pangle`] = { name: "", status: `error: ${e.message}` };
      }
    }

    // Liftoff mapping
    if (networks.includes("liftoff") && liftoffSource && unit.liftoffReferenceId) {
      try {
        const adapters = await admob.getAdapters(email, publisherId, liftoffSource.adSourceId);
        const adapter = adapters.adapters?.[0];
        if (adapter) {
          const appIdCfg = adapter.adapterConfigMetadata?.find((m: any) =>
            m.adapterConfigMetadataLabel === "App ID"
          );
          const refCfg = adapter.adapterConfigMetadata?.find((m: any) =>
            m.adapterConfigMetadataLabel === "Reference ID"
          );
          const mapping = await admob.createAdUnitMapping(email, publisherId, fragment, {
            adapterId: adapter.adapterId,
            adUnitConfigurations: {
              [appIdCfg.adapterConfigMetadataId]: unit.liftoffAppId ?? "",
              [refCfg.adapterConfigMetadataId]: unit.liftoffReferenceId,
            },
            displayName: `${unit.name}_liftoff`,
          });
          mappingResults[`${unit.adUnitId}_liftoff`] = { name: mapping.name, status: "ok" };
        }
      } catch (e: any) {
        mappingResults[`${unit.adUnitId}_liftoff`] = { name: "", status: `error: ${e.message}` };
      }
    }

    // Mintegral mapping
    if (networks.includes("mintegral") && mintegralSource && unit.mintegralPlacementId) {
      try {
        const adapters = await admob.getAdapters(email, publisherId, mintegralSource.adSourceId);
        const adapter = adapters.adapters?.[0];
        if (adapter) {
          const meta = adapter.adapterConfigMetadata ?? [];
          const find = (label: string) => meta.find((m: any) => m.adapterConfigMetadataLabel === label);
          const mapping = await admob.createAdUnitMapping(email, publisherId, fragment, {
            adapterId: adapter.adapterId,
            adUnitConfigurations: {
              [find("App ID")?.adapterConfigMetadataId]: unit.mintegralAppId ?? "",
              [find("App Key")?.adapterConfigMetadataId]: unit.mintegralAppKey ?? "",
              [find("Placement ID")?.adapterConfigMetadataId]: unit.mintegralPlacementId,
              [find("Unit ID")?.adapterConfigMetadataId]: unit.mintegralUnitId ?? "",
            },
            displayName: `${unit.name}_mintegral`,
          });
          mappingResults[`${unit.adUnitId}_mintegral`] = { name: mapping.name, status: "ok" };
        }
      } catch (e: any) {
        mappingResults[`${unit.adUnitId}_mintegral`] = { name: "", status: `error: ${e.message}` };
      }
    }

    // Meta mapping
    if (networks.includes("meta") && metaSource && unit.metaPlacementId) {
      try {
        const adapters = await admob.getAdapters(email, publisherId, metaSource.adSourceId);
        const adapter = adapters.adapters?.[0];
        if (adapter) {
          const meta = adapter.adapterConfigMetadata ?? [];
          const placementCfg = meta.find((m: any) =>
            String(m.adapterConfigMetadataLabel ?? "").toLowerCase().includes("placement")
          );

          if (!placementCfg?.adapterConfigMetadataId) {
            throw new Error("Meta adapter thiếu trường Placement ID");
          }

          const mapping = await admob.createAdUnitMapping(email, publisherId, fragment, {
            adapterId: adapter.adapterId,
            adUnitConfigurations: {
              [placementCfg.adapterConfigMetadataId]: unit.metaPlacementId,
            },
            displayName: `${unit.name}_meta`,
          });
          mappingResults[`${unit.adUnitId}_meta`] = { name: mapping.name, status: "ok" };
        }
      } catch (e: any) {
        mappingResults[`${unit.adUnitId}_meta`] = { name: "", status: `error: ${e.message}` };
      }
    }
  }

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
      const format = unit.format ?? detectAdFormat(unit.name) ?? "INTERSTITIAL";
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

  // Get platform from first unit
  const platform = adUnits[0]?.adUnitId?.includes("ANDROID") ? "ANDROID" : "IOS";

  for (const [groupName, { adUnitIds, format, targeting }] of groupMap) {
    const mediationGroupLines: Record<string, object> = {};
    let lineIdx = -1;

    // Build adUnitMappings for this group
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
        mediationGroupLines[String(lineIdx--)] = {
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
        mediationGroupLines[String(lineIdx--)] = {
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
        mediationGroupLines[String(lineIdx--)] = {
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
        mediationGroupLines[String(lineIdx--)] = {
          displayName: "Meta bidding",
          adSourceId: metaSource.adSourceId,
          cpmMode: "LIVE",
          state: "ENABLED",
          adUnitMappings: m,
        };
      }
    }

    try {
      const res = await admob.createMediationGroup(email, publisherId, {
        displayName: groupName,
        targeting: {
          platform,
          format,
          adUnitIds,
          ...targeting,
        },
        state: "ENABLED",
        mediationGroupLines,
      });
      mediationResults.push({ groupName, status: "ok", id: res.mediationGroupId });
    } catch (e: any) {
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
