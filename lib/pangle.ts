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
  async createApp(appName: string, categoryCode: number, status: "test" | "live", downloadUrl?: string) {
    const body: Record<string, unknown> = {
      ...pangleSign(),
      app_name: appName,
      app_category_code: categoryCode,
      status: status === "test" ? 6 : 2,
    };
    if (status === "live" && downloadUrl) {
      body.download_url = downloadUrl;
    }
    const res = await fetch(`${BASE}/union/media/open_api/site/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.code === 50007) {
      throw new Error(
        `PANGLE_APP_DUPLICATED_OR_PENDING: ${data.message ?? "App đã tồn tại hoặc đang chờ duyệt"}`
      );
    }
    if (data.code !== 0)
      throw new Error(`Pangle createApp error: ${data.code} ${data.message}`);
    if (!data?.data?.app_id) {
      throw new Error(`Pangle createApp error: response thiếu app_id (${JSON.stringify(data)})`);
    }
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
    try {
      const body = { ...pangleSign(), page: 1, page_size: 200 };
      const res = await fetch(`${BASE}/union/media/open_api/site/list`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.code !== 0 || !data.data?.site_list) return [];
      return (data.data.site_list as any[]).map((a) => ({
        appId: String(a.app_id ?? a.site_id ?? ""),
        name: String(a.app_name ?? a.site_name ?? ""),
        bundleId: a.bundle_id ?? a.package_name ?? undefined,
        platform: a.platform_name ?? undefined,
      }));
    } catch {
      return [];
    }
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
