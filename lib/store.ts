import type { StoreParseResult, StoreMetadata } from "./types";

/**
 * Parse a store URL and extract platform, bundleId, and normalized URL.
 * Only accepts apps.apple.com and play.google.com.
 */
export function parseStoreUrl(rawUrl: string): StoreParseResult {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new Error("URL không hợp lệ");
  }

  const host = url.hostname.replace(/^www\./, "");

  // iOS — apps.apple.com/…/id123456789
  if (host === "apps.apple.com" || host === "itunes.apple.com") {
    const match = url.pathname.match(/\/id(\d+)/);
    if (!match) throw new Error("Không tìm thấy App ID trong URL iOS (cần /idXXX)");
    return {
      platform: "IOS",
      bundleId: `id${match[1]}`, // "id987654321" — format Liftoff + Mintegral expect
      storeUrl: rawUrl.trim(),
    };
  }

  // Android — play.google.com/store/apps/details?id=com.example.app
  if (host === "play.google.com") {
    const pkg = url.searchParams.get("id");
    if (!pkg) throw new Error("Không tìm thấy package name trong URL Android (cần ?id=…)");
    return {
      platform: "ANDROID",
      bundleId: pkg, // "com.example.app"
      storeUrl: rawUrl.trim(),
    };
  }

  throw new Error("Chỉ chấp nhận URL từ apps.apple.com hoặc play.google.com");
}

/**
 * Fetch app name from the store. Returns null on failure — never throws.
 */
export async function fetchAppName(parsed: StoreParseResult): Promise<string | null> {
  try {
    if (parsed.platform === "IOS") {
      return await fetchIosLookup(parsed.bundleId).then((d) => d.appName);
    }
    return await fetchAndroidLookup(parsed.bundleId).then((d) => d.appName);
  } catch {
    return null;
  }
}

/** Fetch app category from store. Returns null on failure — never throws. */
export async function fetchAppCategory(parsed: StoreParseResult): Promise<string | null> {
  try {
    if (parsed.platform === "IOS") {
      return await fetchIosLookup(parsed.bundleId).then((d) => d.category);
    }
    return await fetchAndroidLookup(parsed.bundleId).then((d) => d.category);
  } catch {
    return null;
  }
}

/** iOS: iTunes Lookup API (public, no auth) */
async function fetchIosLookup(bundleId: string): Promise<{ appName: string | null; category: string | null }> {
  // bundleId = "id987654321" → numericId = "987654321"
  const numericId = bundleId.replace(/^id/, "");
  const res = await fetch(
    `https://itunes.apple.com/lookup?id=${encodeURIComponent(numericId)}&country=us`,
    { cache: "no-store" }
  );
  if (!res.ok) return { appName: null, category: null };
  const data = await res.json();
  const row = data?.results?.[0];
  return {
    appName: row?.trackName ?? null,
    category: row?.primaryGenreName ?? row?.genres?.[0] ?? null,
  };
}

/** Android: Scrape Play Store HTML <title> tag (server-side to bypass CORS) */
async function fetchAndroidLookup(packageName: string): Promise<{ appName: string | null; category: string | null }> {
  const res = await fetch(
    `https://play.google.com/store/apps/details?id=${encodeURIComponent(packageName)}&hl=en`,
    {
      headers: { "User-Agent": "Mozilla/5.0" },
      cache: "no-store",
    }
  );
  if (!res.ok) return { appName: null, category: null };
  const html = await res.text();

  let appName: string | null = null;
  let category: string | null = null;

  // 1) Try JSON-LD — most reliable source for both name and category
  const jsonLdMatch = html.match(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i);
  if (jsonLdMatch?.[1]) {
    try {
      const json = JSON.parse(jsonLdMatch[1]);
      if (typeof json?.name === "string") {
        appName = json.name.trim();
      }
      if (typeof json?.applicationCategory === "string") {
        category = json.applicationCategory.trim();
      }
    } catch {
      // Ignore parse issues and continue fallback extraction.
    }
  }

  // 2) Fallback: itemprop="genre" for category
  if (!category) {
    const genreMatch = html.match(/itemprop="genre"[^>]*>([^<]+)</i);
    if (genreMatch?.[1]) category = genreMatch[1].trim();
  }

  // 3) Fallback: <title> tag for app name
  if (!appName) {
    const titleMatch = html.match(/<title>([^<]+)<\/title>/);
    if (titleMatch?.[1]) {
      const raw = titleMatch[1];
      const idx = raw.lastIndexOf(" - Apps on Google Play");
      appName = idx > 0 ? raw.substring(0, idx).trim() : raw.trim();
    }
  }

  return { appName, category };
}

/**
 * Full pipeline: parse URL → fetch name → return StoreMetadata.
 */
export async function getStoreMetadata(rawUrl: string): Promise<StoreMetadata> {
  const parsed = parseStoreUrl(rawUrl);
  const [appName, category] = await Promise.all([
    fetchAppName(parsed),
    fetchAppCategory(parsed),
  ]);
  return { ...parsed, appName, category };
}
