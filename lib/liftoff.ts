const AUTH_BASE = "https://auth-api.vungle.com";
const API_BASE = "https://publisher-api.vungle.com/api/v1";

let cachedJwt: { token: string; expiry: number } | null = null;

async function getLiftoffJwt(): Promise<string> {
  if (cachedJwt && cachedJwt.expiry > Date.now() + 60_000) {
    return cachedJwt.token;
  }
  const res = await fetch(`${AUTH_BASE}/v2/auth`, {
    headers: {
      "x-api-key": process.env.LIFTOFF_SECRET_TOKEN!,
      accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`Liftoff auth failed: ${res.status}`);
  const data = await res.json();
  // JWT typically 1h; cache for 55 min
  cachedJwt = { token: data.token, expiry: Date.now() + 55 * 60_000 };
  return data.token;
}

async function liftoffFetch(path: string, init?: RequestInit) {
  const jwt = await getLiftoffJwt();
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: jwt, // per Liftoff docs — no "Bearer" prefix
      "Content-Type": "application/json",
      accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (res.status === 401) {
    // Retry with Bearer prefix
    cachedJwt = null;
    const jwt2 = await getLiftoffJwt();
    const res2 = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${jwt2}`,
        "Content-Type": "application/json",
        accept: "application/json",
        ...(init?.headers ?? {}),
      },
    });
    if (!res2.ok) throw new Error(`Liftoff error: ${res2.status}`);
    return res2.json();
  }
  if (!res.ok) throw new Error(`Liftoff error: ${res.status}`);
  return res.json();
}

export const liftoff = {
  async createApp(params: {
    platform: "ios" | "android";
    name: string;
    bundleId?: string;
    isManual?: boolean;
  }) {
    return liftoffFetch("/applications", {
      method: "POST",
      body: JSON.stringify({
        platform: params.platform,
        name: params.name,
        store: {
          id: params.bundleId,
          isManual: params.isManual ?? true,
          isPaid: false,
        },
        isCoppa: false,
      }),
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
};

/** Map AdMob ad format to Liftoff placement type */
export const LIFTOFF_FORMAT_MAP: Record<string, string> = {
  BANNER: "banner",
  INTERSTITIAL: "interstitial",
  REWARDED: "rewarded",
  NATIVE: "native",
  APP_OPEN: "interstitial",
};
