import { NextRequest, NextResponse } from "next/server";
import { getSessionEmail } from "@/lib/session";
import {
  resolveScenario,
  detectAdFormat,
  detectFloorTier,
  detectInappObd,
  buildGroupName,
  estimateGroupCount,
  SCENARIO_LABELS,
  CountryGroup,
  UIState,
} from "@/lib/scenarios";

export async function POST(req: NextRequest) {
  const email = await getSessionEmail();
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { uiState, adUnits, appCode, countryGroups } = body as {
    uiState: UIState;
    adUnits: Array<{ name: string; format?: string; adUnitId: string }>;
    appCode: string;
    countryGroups?: CountryGroup[];
  };

  // Validate
  if (uiState.groupBy === "AD_UNIT" && !uiState.ecpmFloor) {
    return NextResponse.json({ error: "INVALID: AD_UNIT requires ecpmFloor=true" }, { status: 400 });
  }
  if (uiState.countryMode === "GROUPS" && (!countryGroups || countryGroups.length === 0)) {
    return NextResponse.json({ error: "MISSING_GROUPS: Cần ít nhất 1 country group" }, { status: 400 });
  }

  // Validate country codes
  if (countryGroups) {
    for (const cg of countryGroups) {
      for (const cc of cg.countries) {
        if (!/^[A-Z]{2}$/.test(cc)) {
          return NextResponse.json(
            { error: `INVALID_COUNTRY_CODE: "${cc}" không phải ISO alpha-2` },
            { status: 400 }
          );
        }
      }
    }
  }

  const scenario = resolveScenario(uiState);

  // Build preview group names
  const groups: Array<{ name: string; adUnitIds: string[]; format: string }> = [];
  const seen = new Set<string>();

  const cgList = uiState.countryMode === "GROUPS" && countryGroups?.length
    ? countryGroups
    : [null];

  for (const cg of cgList) {
    for (const unit of adUnits) {
      const format = unit.format ?? detectAdFormat(unit.name) ?? "INTERSTITIAL";
      const floorTier = detectFloorTier(unit.name);
      const inappObd = detectInappObd(unit.name);

      const groupName = buildGroupName({
        appCode,
        scenario,
        adUnitName: unit.name,
        adFormat: format,
        floorTier,
        countryGroupName: cg?.name,
        inappObd: inappObd ?? undefined,
      });

      if (!seen.has(groupName)) {
        seen.add(groupName);
        groups.push({ name: groupName, adUnitIds: [], format });
      }
      // Add unit to group
      const g = groups.find((x) => x.name === groupName);
      if (g) g.adUnitIds.push(unit.adUnitId);
    }
  }

  const formats = [...new Set(adUnits.map((u) => u.format ?? detectAdFormat(u.name) ?? "INTERSTITIAL"))];
  const tiers = adUnits.map((u) => detectFloorTier(u.name));

  return NextResponse.json({
    scenario,
    label: SCENARIO_LABELS[scenario],
    groupCount: groups.length,
    groups,
    estimatedCount: estimateGroupCount({
      scenario,
      adUnitCount: adUnits.length,
      formats,
      floorTiers: tiers,
      countryGroups: countryGroups ?? [],
    }),
  });
}
