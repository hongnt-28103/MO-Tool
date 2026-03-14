import crypto from "crypto";

const BASE = "https://open-api.pangleglobal.com";

export type PangleCategoryOption = {
  code: number;
  label: string;
};

const PANGLE_CATEGORY_FALLBACK: PangleCategoryOption[] = [
  { code: 1201, label: "Business" },
  { code: 1202, label: "Travel and Transportation" },
  { code: 1203, label: "Shopping/E-commerce" },
  { code: 1204, label: "Health" },
  { code: 1205, label: "Education" },
  { code: 1206, label: "Finance" },
  { code: 1207, label: "Social Game" },
  { code: 1208, label: "Lifestyle" },
  { code: 1209, label: "Videos" },
  { code: 1210, label: "Images" },
  { code: 1211, label: "Tools" },
  { code: 1212, label: "Music Games" },
  { code: 1213, label: "Games" },
  { code: 1214, label: "Reading" },
  { code: 1215, label: "Government" },
  { code: 1216, label: "Smart Devices" },
  { code: 1217, label: "News" },
  { code: 1218, label: "Other" },
  { code: 1219, label: "Tech Finance" },
  { code: 1220, label: "Infrastructure" },
  { code: 1221, label: "Media Outlets" },
];

let categoryCache: { at: number; data: PangleCategoryOption[]; source: "crawl" | "fallback" } | null = null;

function decodeUnicodeEscapes(value: string) {
  return value.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) =>
    String.fromCharCode(parseInt(hex, 16))
  );
}

export async function getPangleCategoryOptions(): Promise<{
  source: "crawl" | "fallback";
  categories: PangleCategoryOption[];
}> {
  const now = Date.now();
  const ttl = 10 * 60_000;
  if (categoryCache && now - categoryCache.at < ttl) {
    return { source: categoryCache.source, categories: categoryCache.data };
  }

  try {
    const res = await fetch("https://www.pangleglobal.com/knowledge/set-up-apps", {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "text/html",
      },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`crawl_status_${res.status}`);
    const html = await res.text();

    const regex = /"category_(\d+)":"([^"\\]*(?:\\.[^"\\]*)*)"/g;
    const found = new Map<number, string>();
    let match: RegExpExecArray | null;

    while ((match = regex.exec(html)) !== null) {
      const code = Number(match[1]);
      const labelRaw = decodeUnicodeEscapes(match[2]).trim();
      if (Number.isNaN(code) || !labelRaw) continue;
      if (!found.has(code)) found.set(code, labelRaw);
    }

    const categories = Array.from(found.entries())
      .map(([code, label]) => ({ code, label }))
      .sort((a, b) => a.label.localeCompare(b.label));

    if (categories.length >= 5) {
      categoryCache = { at: now, data: categories, source: "crawl" };
      return { source: "crawl", categories };
    }
  } catch {
    // Fallback below when crawl fails.
  }

  categoryCache = { at: now, data: PANGLE_CATEGORY_FALLBACK, source: "fallback" };
  return { source: "fallback", categories: PANGLE_CATEGORY_FALLBACK };
}

function pangleSign(): Record<string, string | number> {
  const ts = Math.floor(Date.now() / 1000);
  const nonce = Math.floor(Math.random() * 999999) + 1;
  const secKey = process.env.PANGLE_SECURITY_KEY!;
  const sign = crypto
    .createHash("sha1")
    .update([secKey, String(ts), String(nonce)].sort().join(""))
    .digest("hex");
  return {
    user_id: parseInt(process.env.PANGLE_USER_ID!),
    role_id: parseInt(process.env.PANGLE_ROLE_ID!),
    timestamp: ts,
    nonce,
    sign,
    version: "1.0",
  };
}

export const pangle = {
  async createApp(
    appName: string,
    categoryCode: number,
    status: "test" | "live",
    platform: "ANDROID" | "IOS",
    downloadUrl?: string,
    bundleId?: string
  ) {
    const body: Record<string, unknown> = {
      ...pangleSign(),
      app_name: appName,
      app_category_code: categoryCode,
      os: platform === "IOS" ? 2 : 1,
      status: status === "test" ? 6 : 2,
    };
    if (bundleId) {
      body.package_name = bundleId;
    }
    if (status === "live" && downloadUrl) {
      body.download_url = downloadUrl;
    }

    // Log exact request for debugging
    const { sign: _s, ...bodyForLog } = body;
    console.log("[PANGLE] createApp request:", JSON.stringify(bodyForLog));

    const res = await fetch(`${BASE}/union/media/open_api/site/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    console.log("[PANGLE] createApp response:", JSON.stringify(data));
    if (data.code === 50007) {
      // App may already exist on Pangle. Try to resolve and link by bundleId/name.
      const normalize = (v: string) => v.trim().toLowerCase();
      const apps = await pangle.listApps();
      const byBundle = bundleId
        ? apps.find((a) => a.bundleId && normalize(a.bundleId) === normalize(bundleId))
        : undefined;
      const byName = apps.find((a) => normalize(a.name) === normalize(appName));
      const matched = byBundle ?? byName;

      if (matched?.appId) {
        return {
          code: 0,
          message: "EXISTING_APP_LINKED",
          data: {
            app_id: matched.appId,
            status: 1,
            existing: true,
          },
        };
      }

      throw new Error(
        `PANGLE_APP_DUPLICATED_OR_PENDING: ${data.message ?? "App đã tồn tại hoặc đang chờ duyệt"}`
      );
    }
    if (data.code !== 0)
      throw new Error(`Pangle createApp error: ${data.code} ${data.message}`);
    if (!data?.data?.app_id) {
      throw new Error(`Pangle createApp error: response thiếu app_id (${JSON.stringify(data)})`);
    }

    // Verify the account has ad-placement authority by probing /code/create.
    // If "third level style auth" error occurs, the app was created
    // but won't be usable/visible because the Pangle account lacks approval.
    let authOk = true;
    try {
      const probe = {
        ...pangleSign(),
        app_id: data.data.app_id,
        ad_slot_type: 2,
        ad_slot_name: "__probe__",
        bidding_type: 1,
        render_type: 1,
        slide_banner: 1,
      };
      const probeRes = await fetch(`${BASE}/union/media/open_api/code/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(probe),
      });
      const probeData = await probeRes.json();
      console.log("[PANGLE] auth probe response:", JSON.stringify(probeData));
      if (probeData.code === 50003) {
        authOk = false;
      }
    } catch {
      // probe failed — don't block, just flag
    }

    data.data.auth_ok = authOk;
    return data;
  },

  async createPlacement(params: {
    appId: number;
    adSlotType: number;
    adSlotName?: string;
    biddingType?: number;
    extraFields?: Record<string, unknown>;
  }) {
    const body: Record<string, unknown> = {
      ...pangleSign(),
      app_id: params.appId,
      ad_slot_type: params.adSlotType,
      bidding_type: params.biddingType ?? 1, // In-App Bidding default
      ...(params.adSlotName ? { ad_slot_name: params.adSlotName } : {}),
      ...(params.extraFields ?? {}),
    };
    const res = await fetch(`${BASE}/union/media/open_api/code/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.code !== 0)
      throw new Error(`Pangle createPlacement error: ${data.code} ${data.message}`);
    return data;
  },

  async listApps(): Promise<Array<{ appId: string; name: string; bundleId?: string; platform?: string }>> {
    // NOTE: Pangle Open API does NOT provide a /site/list endpoint (returns 404).
    // This function is kept as a stub for future use if Pangle adds the endpoint.
    console.warn("[PANGLE] listApps called but /site/list is not available in Pangle Open API");
    return [];
  },
};

/** Map AdMob ad format to Pangle ad_slot_type */
export const PANGLE_FORMAT_MAP: Record<string, number> = {
  BANNER: 2,
  INTERSTITIAL: 6,
  REWARDED: 5,
  NATIVE: 1,
  APP_OPEN: 3,
};
