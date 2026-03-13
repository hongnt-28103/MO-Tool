export type ScenarioId = "S1" | "S2" | "S3" | "S4" | "S5" | "S6";

export interface UIState {
  groupBy: "AD_FORMAT" | "AD_UNIT";
  ecpmFloor: boolean;
  countryMode: "ALL" | "GROUPS";
}

export interface CountryGroup {
  name: string;
  mode: "INCLUDE" | "EXCLUDE";
  countries: string[];
}

export function resolveScenario(ui: UIState): ScenarioId {
  if (ui.groupBy === "AD_UNIT" && !ui.ecpmFloor) {
    throw new Error("INVALID: AD_UNIT requires ecpmFloor=true");
  }
  if (ui.groupBy === "AD_UNIT") {
    return ui.countryMode === "ALL" ? "S1" : "S4";
  }
  if (ui.countryMode === "ALL") {
    return ui.ecpmFloor ? "S3" : "S2";
  }
  return ui.ecpmFloor ? "S6" : "S5";
}

export const SCENARIO_LABELS: Record<ScenarioId, string> = {
  S1: "S1: Mỗi ad unit → 1 group riêng. Toàn cầu.",
  S2: "S2: Gom theo ad format, không phân biệt floor. Toàn cầu.",
  S3: "S3: Gom theo ad format + eCPM floor tier. Toàn cầu.",
  S4: "S4: Mỗi ad unit × mỗi country group → 1 group.",
  S5: "S5: Gom theo ad format, không phân biệt floor. Theo country groups.",
  S6: "S6: Gom theo ad format + eCPM floor tier. Theo country groups.",
};

export type FloorTier = "high" | "med" | "ap";

/** Detect floor tier from ad unit name */
export function detectFloorTier(name: string): FloorTier {
  const lower = name.toLowerCase();
  if (/_high\b|_1\b|_2\b/.test(lower)) return "high";
  if (/_med\b|_medium\b/.test(lower)) return "med";
  return "ap";
}

/** Detect ad format from ad unit name */
export function detectAdFormat(
  name: string
): "BANNER" | "INTERSTITIAL" | "REWARDED" | "NATIVE" | "APP_OPEN" | null {
  const lower = name.toLowerCase();
  if (/inter|full|fs/.test(lower)) return "INTERSTITIAL";
  if (/reward|rv|video/.test(lower)) return "REWARDED";
  if (/open|splash|aoa/.test(lower)) return "APP_OPEN";
  if (/mrec|300x250/.test(lower)) return "BANNER";
  if (/banner|top|bottom/.test(lower)) return "BANNER";
  if (/native|feed|card/.test(lower)) return "NATIVE";
  return null;
}

/** Detect in-app vs OBD from ad unit name (Tera) */
export function detectInappObd(name: string): "inapp" | "obd" | null {
  const lower = name.toLowerCase();
  if (/inapp/.test(lower)) return "inapp";
  if (/_fo|[-]fo|^fo/.test(lower)) return "obd";
  return null;
}

/** Build mediation group name */
export function buildGroupName(params: {
  appCode: string;
  scenario: ScenarioId;
  adUnitName?: string;
  adFormat?: string;
  floorTier?: FloorTier;
  countryGroupName?: string;
  inappObd?: "inapp" | "obd";
}): string {
  const { appCode, scenario, adUnitName, adFormat, floorTier, countryGroupName, inappObd } = params;
  switch (scenario) {
    case "S1":
    case "S4":
      // mã app - ad_unit_name [- country_group]
      return countryGroupName
        ? `${appCode} - ${adUnitName} - ${countryGroupName}`
        : `${appCode} - ${adUnitName}`;
    case "S2":
    case "S5":
      // mã app - ad format [- country_group]
      return countryGroupName
        ? `${appCode} - ${adFormat?.toLowerCase()} - ${countryGroupName}`
        : `${appCode} - ${adFormat?.toLowerCase()}`;
    case "S3":
    case "S6": {
      // Check if Tera inapp/obd
      if (inappObd) {
        return countryGroupName
          ? `${appCode} - ${adFormat?.toLowerCase()} - ${inappObd} - ${countryGroupName}`
          : `${appCode} - ${adFormat?.toLowerCase()} - ${inappObd}`;
      }
      // Standard: mã app - ad format - high/normal [- country_group]
      const tier = floorTier === "high" ? "high" : "normal";
      return countryGroupName
        ? `${appCode} - ${adFormat?.toLowerCase()} - ${tier} - ${countryGroupName}`
        : `${appCode} - ${adFormat?.toLowerCase()} - ${tier}`;
    }
  }
}

/** Estimate group count for preview */
export function estimateGroupCount(params: {
  scenario: ScenarioId;
  adUnitCount: number;
  formats: string[];
  floorTiers: FloorTier[];
  countryGroups: CountryGroup[];
}): number {
  const { scenario, adUnitCount, formats, floorTiers, countryGroups } = params;
  const cg = countryGroups.length || 1;
  switch (scenario) {
    case "S1": return adUnitCount;
    case "S2": return formats.length;
    case "S3": return formats.length * new Set(floorTiers).size;
    case "S4": return adUnitCount * cg;
    case "S5": return formats.length * cg;
    case "S6": return formats.length * new Set(floorTiers).size * cg;
  }
}
