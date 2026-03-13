import crypto from "crypto";

const BASE = "https://dev.mintegral.com";

function mintegralAuth(): Record<string, string | number> {
  const ts = String(Math.floor(Date.now() / 1000));
  const inner = crypto.createHash("md5").update(ts).digest("hex");
  const sign = crypto
    .createHash("md5")
    .update(process.env.MINTEGRAL_SECRET! + inner)
    .digest("hex");
  return {
    skey: process.env.MINTEGRAL_SKEY!,
    time: ts,
    sign,
    publisher_id: parseInt(process.env.MINTEGRAL_PUBLISHER_ID!),
  };
}

async function mintegralPost(path: string, params: Record<string, unknown>) {
  const body = new URLSearchParams();
  const auth = mintegralAuth();
  for (const [k, v] of Object.entries({ ...auth, ...params })) {
    body.append(k, String(v));
  }
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await res.json();
  if (data.code !== 200)
    throw new Error(`Mintegral error ${data.code}: ${data.msg ?? JSON.stringify(data)}`);
  return data;
}

export const mintegral = {
  async createApp(params: {
    appName: string;
    os: "ANDROID" | "IOS";
    isLive: boolean;
    packageName?: string;   // package name (Android) or bundle ID (iOS)
    storeUrl?: string;
    storeName?: string;     // Android "Other Store" — store display name
    previewLink?: string;   // Android "Other Store" — preview/download link
    appIdOnStore?: string;  // iOS — numeric App Store ID
  }) {
    const fields: Record<string, unknown> = {
      app_name: params.appName,
      os: params.os,
      is_live_in_store: params.isLive ? 1 : 0,
      coppa: 0,
      mediation_platform: 14,
    };
    // Package / bundle ID always included when provided
    if (params.packageName) fields.package = params.packageName;
    if (params.isLive) {
      if (params.storeUrl)   fields.store_url    = params.storeUrl;
      if (params.storeName)  fields.store_name   = params.storeName;
      if (params.previewLink) fields.preview_link = params.previewLink;
      if (params.appIdOnStore) fields.app_id      = params.appIdOnStore;
    }
    return mintegralPost("/app/open_api_create", fields);
  },

  async createPlacement(params: {
    appId: number;
    placementName: string;
    adType: string;
    hbUnitName?: string;
  }) {
    return mintegralPost("/v2/placement/open_api_create", {
      app_id: params.appId,
      placement_name: params.placementName,
      ad_type: params.adType,
      integrate_type: "sdk",
      ...(params.hbUnitName ? { hb_unit_name: params.hbUnitName } : {}),
    });
  },
};

/** Map AdMob ad format to Mintegral ad_type */
export const MINTEGRAL_FORMAT_MAP: Record<string, string> = {
  BANNER: "banner",
  INTERSTITIAL: "new_interstitial",
  REWARDED: "rewarded_video",
  NATIVE: "native",
  APP_OPEN: "splash_ad",
};
