const AUTH_BASE = "https://auth-api.vungle.com";
const API_BASE = "https://publisher-api.vungle.com/api/v1";

let cachedJwt: { token: string; expiry: number } | null = null;

async function getLiftoffJwt(): Promise<string> {
  if (cachedJwt && cachedJwt.expiry > Date.now() + 60_000) {
    return cachedJwt.token;
  }

  const secretToken = process.env.LIFTOFF_SECRET_TOKEN;
  if (!secretToken) {
    throw new Error("LIFTOFF_SECRET_TOKEN chưa được cấu hình trong .env.local");
  }

  const res = await fetch(`${AUTH_BASE}/v2/auth`, {
    headers: {
      "x-api-key": secretToken,
      accept: "application/json",
    },
  });

  if (!res.ok) {
    let detail = "";
    try {
      const errBody = await res.json();
      detail = errBody.messages?.join("; ") ?? JSON.stringify(errBody);
    } catch {
      detail = await res.text().catch(() => "");
    }
    if (res.status === 400 && detail.includes("Forbidden")) {
      throw new Error(
        `Liftoff API key bị từ chối (Forbidden). Key có thể đã hết hạn hoặc bị thu hồi. ` +
        `Vui lòng tạo lại API key trên Liftoff Monetize Dashboard → Settings → API Keys, ` +
        `rồi cập nhật LIFTOFF_SECRET_TOKEN trong .env.local.`
      );
    }
    throw new Error(`Liftoff auth failed (${res.status}): ${detail}`);
  }

  const data = await res.json();
  if (!data.token) {
    throw new Error("Liftoff auth response thiếu token");
  }
  // JWT typically 1h; cache for 55 min
  cachedJwt = { token: data.token, expiry: Date.now() + 55 * 60_000 };
  return data.token;
}

async function liftoffFetch(path: string, init?: RequestInit) {
  const jwt = await getLiftoffJwt();
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
      accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    // If 401, invalidate cached JWT so next call re-authenticates
    if (res.status === 401) cachedJwt = null;
    const errText = await res.text().catch(() => "");
    throw new Error(`Liftoff API error (${res.status}): ${errText}`);
  }
  return res.json();
}

export const liftoff = {
  async createApp(params: {
    platform: "ios" | "android";
    name: string;
    isLive: boolean;
    bundleId?: string;
    storeUrl?: string;
    coppa?: boolean;
    category?: string;
  }) {
    const store: Record<string, unknown> = {
      isManual: !params.isLive,
      isPaid: false,
      // id is always required; use bundleId for live apps, placeholder for not-live
      id: params.isLive && params.bundleId ? params.bundleId : `com.placeholder.${Date.now()}`,
    };
    if (params.isLive && params.storeUrl) store.url = params.storeUrl;
    // category is required by Liftoff API; fallback to "Games" if not provided
    store.category = params.category || "Games";

    const body: Record<string, unknown> = {
      platform: params.platform, // must be lowercase "ios" | "android"
      name: params.name,
      store,
      isCoppa: params.coppa ?? true,
    };

    return liftoffFetch("/applications", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  async createPlacement(params: {
    vungleAppId: string;
    name: string;
    type: string;
  }) {
    return liftoffFetch("/placements", {
      method: "POST",
      body: JSON.stringify({
        application: params.vungleAppId,
        name: params.name,
        type: params.type,
        allowEndCards: false,
      }),
    });
  },

  async listApps(): Promise<Array<{ id: string; name: string; platform: string; bundleId?: string }>> {
    try {
      const result = await liftoffFetch("/applications");
      const list: any[] = Array.isArray(result) ? result : (result?.data ?? []);
      return list.map((app: any) => ({
        id: String(app.id ?? app._id ?? ""),
        name: String(app.name ?? ""),
        platform: String(app.platform ?? "").toUpperCase(),
        bundleId: app.store?.id ?? app.bundleId ?? undefined,
      }));
    } catch {
      return [];
    }
  },
};

/** Map AdMob ad format to Liftoff placement type */
export const LIFTOFF_FORMAT_MAP: Record<string, string> = {
  BANNER: "banner",
  INTERSTITIAL: "interstitial",
  REWARDED: "rewarded",
  NATIVE: "native",
  APP_OPEN: "interstitial",
};
