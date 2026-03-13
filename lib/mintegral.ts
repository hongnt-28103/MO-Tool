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
    packageName: string;
    isLiveInStore?: boolean;
    storeUrl?: string;
  }) {
    return mintegralPost("/app/open_api_create", {
      app_name: params.appName,
      os: params.os,
      package: params.packageName,
      is_live_in_store: params.isLiveInStore ? 1 : 0,
      ...(params.isLiveInStore && params.storeUrl ? { store_url: params.storeUrl } : {}),
      coppa: 0,
      mediation_platform: 14,
    });
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
