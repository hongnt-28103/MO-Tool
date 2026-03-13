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
      return await fetchIosAppName(parsed.bundleId);
    }
    return await fetchAndroidAppName(parsed.bundleId);
  } catch {
    return null;
  }
}

/** iOS: iTunes Lookup API (public, no auth) */
async function fetchIosAppName(bundleId: string): Promise<string | null> {
  // bundleId = "id987654321" → numericId = "987654321"
  const numericId = bundleId.replace(/^id/, "");
  const res = await fetch(
    `https://itunes.apple.com/lookup?id=${encodeURIComponent(numericId)}&country=us`,
    { cache: "no-store" }
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data?.results?.[0]?.trackName ?? null;
}

/** Android: Scrape Play Store HTML <title> tag (server-side to bypass CORS) */
async function fetchAndroidAppName(packageName: string): Promise<string | null> {
  const res = await fetch(
    `https://play.google.com/store/apps/details?id=${encodeURIComponent(packageName)}&hl=en`,
    {
      headers: { "User-Agent": "Mozilla/5.0" },
      cache: "no-store",
    }
  );
  if (!res.ok) return null;
  const html = await res.text();
  // <title>App Name - Apps on Google Play</title>
  const match = html.match(/<title>([^<]+)<\/title>/);
  if (!match) return null;
  const raw = match[1];
  // Strip " - Apps on Google Play" suffix
  const idx = raw.lastIndexOf(" - Apps on Google Play");
  return idx > 0 ? raw.substring(0, idx).trim() : raw.trim();
}

/**
 * Full pipeline: parse URL → fetch name → return StoreMetadata.
 */
export async function getStoreMetadata(rawUrl: string): Promise<StoreMetadata> {
  const parsed = parseStoreUrl(rawUrl);
  const appName = await fetchAppName(parsed);
  return { ...parsed, appName };
}
