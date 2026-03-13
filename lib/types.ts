// ────────────────────────────────────────────────────────────
//  Shared types for multi-platform app creation
// ────────────────────────────────────────────────────────────

export type MobilePlatform = "ANDROID" | "IOS";

/** Input from the UI → POST /api/apps */
export type CreateAppInput = {
  /** "live" = app already on store, "not_live" = not yet published */
  mode: "live" | "not_live";

  /** Store URL (live mode only) */
  storeUrl?: string;

  /** App name – auto-fetched for live, user-entered for not_live */
  appName: string;

  /** ANDROID or IOS – auto-detected for live, user-selected for not_live */
  platform: MobilePlatform;

  /** Bundle ID / package name – auto-parsed from URL for live, absent for not_live */
  bundleId?: string;

  /** Which AdMob publisher account to use */
  admobPublisherId?: string;

  /** Pangle category code (required) */
  pangleCategoryCode: number;
};

export type PlatformKey = "admob" | "pangle" | "liftoff" | "mintegral";

export type PlatformStatus = "none" | "ok" | "verifying" | "error";

/** Result from one platform API call */
export type PlatformResult = {
  status: PlatformStatus;
  appId?: string;
  warning?: string;
  error?: string;
  raw?: unknown;
};

/** Aggregate result returned to the UI */
export type CreateAppResult = {
  id: string; // internal DB id
  name: string;
  platform: MobilePlatform;
  isLive: boolean;
  results: Record<PlatformKey, PlatformResult>;
};

/** Store URL parse result */
export type StoreParseResult = {
  platform: MobilePlatform;
  bundleId: string;
  storeUrl: string;
};

/** Store metadata (name fetched from store) */
export type StoreMetadata = StoreParseResult & {
  appName: string | null;
};

/** A row from the App table for display */
export type AppRecord = {
  id: string;
  email: string;
  name: string;
  platform: MobilePlatform;
  isLive: boolean;
  storeUrl: string | null;
  bundleId: string | null;
  admobPublisherId: string | null;
  admobAppId: string | null;
  admobStatus: string;
  admobError: string | null;
  pangleAppId: string | null;
  pangleCategoryCode: number | null;
  pangleStatus: string;
  pangleError: string | null;
  liftoffAppId: string | null;
  liftoffStatus: string;
  liftoffError: string | null;
  mintegralAppId: string | null;
  mintegralAppKey: string | null;
  mintegralStatus: string;
  mintegralError: string | null;
  createdAt: string;
  updatedAt: string;
};
