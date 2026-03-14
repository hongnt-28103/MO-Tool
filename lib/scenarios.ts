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

  // Match keyword before or after separator (- _ . space) or at start/end
  // high/med/ap can be followed by digits (e.g. high1, high2)
  if (/(^|[-_.\s])high\d*([-_.\s]|$)/.test(lower)) return "high";
  if (/(^|[-_.\s])med\d*([-_.\s]|$)/.test(lower)) return "med";
  if (/(^|[-_.\s])ap\d*([-_.\s]|$)/.test(lower)) return "ap";

  return "ap";
}

/** Detect ad format from ad unit name */
export function detectAdFormat(
  name: string
): "BANNER" | "INTERSTITIAL" | "REWARDED" | "NATIVE" | "APP_OPEN" | null {
  const lower = name.toLowerCase();
  if (lower.includes("inter")) return "INTERSTITIAL";
  if (lower.includes("reward")) return "REWARDED";
  if (lower.includes("aoa")) return "APP_OPEN";
  if (lower.includes("banner")) return "BANNER";
  if (lower.includes("native")) return "NATIVE";
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
}): string {
  const { appCode, scenario, adUnitName, adFormat, floorTier, countryGroupName } = params;
  const fmt = adFormat?.toLowerCase();
  switch (scenario) {
    case "S1":
      return `${appCode} - ${adUnitName}`;
    case "S4":
      return `${appCode} - ${adUnitName} - ${countryGroupName}`;
    case "S2":
      // ecpmFloor OFF → allfloor
      return `${appCode} - ${fmt} - allfloor`;
    case "S5":
      return `${appCode} - ${fmt} - allfloor - ${countryGroupName}`;
    case "S3":
      // ecpmFloor ON → 3 bucket: high / med / ap
      return `${appCode} - ${fmt} - ${floorTier ?? "ap"}`;
    case "S6":
      return `${appCode} - ${fmt} - ${floorTier ?? "ap"} - ${countryGroupName}`;
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
  // 3 bucket: high, med, ap — count unique tiers present
  const uniqueTiers = new Set(floorTiers);
  const tierCount = Math.max(1, uniqueTiers.size);
  switch (scenario) {
    case "S1": return adUnitCount;
    case "S2": return formats.length;
    case "S3": return formats.length * tierCount;
    case "S4": return adUnitCount * cg;
    case "S5": return formats.length * cg;
    case "S6": return formats.length * tierCount * cg;
  }
}
