import { db } from "./db";
import { decryptToken, refreshAccessToken } from "./auth";

const BASE = "https://admob.googleapis.com";

/** Get valid access_token, auto-refresh if needed */
async function getValidToken(email: string): Promise<string> {
  const record = await db.userToken.findUniqueOrThrow({ where: { email } });
  const fiveMin = 5 * 60 * 1000;
  if (record.accessTokenExpiry.getTime() - Date.now() > fiveMin) {
    return record.accessToken;
  }
  const refreshToken = decryptToken(record.refreshTokenEnc);
  const newTokens = await refreshAccessToken(refreshToken);
  const newExpiry = new Date(Date.now() + newTokens.expires_in * 1000);
  await db.userToken.update({
    where: { email },
    data: { accessToken: newTokens.access_token, accessTokenExpiry: newExpiry },
  });
  return newTokens.access_token;
}

/** Generic AdMob fetch */
async function admobFetch(email: string, path: string, init?: RequestInit) {
  const token = await getValidToken(email);
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (res.status === 401) throw new Error("ADMOB_UNAUTHORIZED");
  if (res.status === 403) throw new Error("ADMOB_FORBIDDEN");
  if (res.status === 429) throw new Error("ADMOB_RATE_LIMIT");
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ADMOB_ERROR_${res.status}: ${body}`);
  }
  return res.json();
}

export const admob = {
  getAccounts: (email: string) => admobFetch(email, "/v1/accounts"),

  getApps: (email: string, publisherId: string, pageToken?: string) =>
    admobFetch(
      email,
      `/v1beta/accounts/${publisherId}/apps?pageSize=100${pageToken ? `&pageToken=${pageToken}` : ""}`
    ),

  createApp: (email: string, publisherId: string, body: object) =>
    admobFetch(email, `/v1beta/accounts/${publisherId}/apps`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getAdUnits: (email: string, publisherId: string, pageToken?: string) =>
    admobFetch(
      email,
      `/v1beta/accounts/${publisherId}/adUnits?pageSize=500${pageToken ? `&pageToken=${pageToken}` : ""}`
    ),

  createAdUnit: (email: string, publisherId: string, body: object) =>
    admobFetch(email, `/v1beta/accounts/${publisherId}/adUnits`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getAdSources: (email: string, publisherId: string) =>
    admobFetch(email, `/v1beta/accounts/${publisherId}/adSources`),

  getAdapters: (email: string, publisherId: string, adSourceId: string) =>
    admobFetch(
      email,
      `/v1beta/accounts/${publisherId}/adSources/${adSourceId}/adapters`
    ),

  createAdUnitMapping: (
    email: string,
    publisherId: string,
    adUnitFragment: string,
    body: object
  ) =>
    admobFetch(
      email,
      `/v1beta/accounts/${publisherId}/adUnits/${adUnitFragment}/adUnitMappings`,
      { method: "POST", body: JSON.stringify(body) }
    ),

  createMediationGroup: (
    email: string,
    publisherId: string,
    body: object
  ) =>
    admobFetch(email, `/v1beta/accounts/${publisherId}/mediationGroups`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
};

/** Log write actions to DB */
export async function auditLog(params: {
  email: string;
  action: string;
  publisherId: string;
  payload: object;
  result: object;
  statusCode: number;
}) {
  try {
    await db.auditLog.create({
      data: {
        email: params.email,
        action: params.action,
        publisherId: params.publisherId,
        payload: JSON.stringify(params.payload),
        result: JSON.stringify(params.result),
        statusCode: params.statusCode,
      },
    });
  } catch (e) {
    console.error("[AUDIT_LOG] Failed to write:", e);
  }
}
