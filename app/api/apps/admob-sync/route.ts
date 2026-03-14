import { NextResponse } from "next/server";
import { getSessionEmail } from "@/lib/session";
import { admob } from "@/lib/admob";
import { liftoff } from "@/lib/liftoff";
import { pangle } from "@/lib/pangle";
import { mintegral } from "@/lib/mintegral";
import { db } from "@/lib/db";

async function getAllAdmobApps(email: string, publisherId: string) {
  const apps: any[] = [];
  let pageToken: string | undefined;
  let safety = 0;
  do {
    const data = await admob.getApps(email, publisherId, pageToken);
    if (Array.isArray(data.apps)) apps.push(...data.apps);
    pageToken = data.nextPageToken ?? undefined;
    safety++;
  } while (pageToken && safety < 20);
  return apps;
}

export async function GET() {
  const email = await getSessionEmail();
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Get or resolve publisherId
  let record = await db.userToken.findUnique({ where: { email } });
  let publisherId = record?.publisherId;

  if (!publisherId) {
    try {
      const res = await admob.getAccounts(email);
      const accounts: any[] = res.account ?? [];
      const found = accounts.find((a: any) => a.publisherId);
      if (found) {
        publisherId = found.publisherId;
        await db.userToken.update({
          where: { email },
          data: { publisherId, publisherName: found.name ?? publisherId },
        });
      }
    } catch {
      // ignore, return error below
    }
  }

  if (!publisherId) {
    return NextResponse.json(
      { error: "Chưa xác định được Publisher ID. Vui lòng truy cập Dashboard trước để xác thực tài khoản AdMob." },
      { status: 400 }
    );
  }

  try {
    const [admobResult, liftoffResult, pangleResult, mintegralResult, dbResult] =
      await Promise.allSettled([
        getAllAdmobApps(email, publisherId),
        liftoff.listApps(),
        pangle.listApps(),
        mintegral.listApps(),
        db.app.findMany({
          where: { email },
          select: {
            id: true,
            admobAppId: true,
            bundleId: true,
            liftoffAppId: true,
            liftoffStatus: true,
            pangleAppId: true,
            pangleStatus: true,
            mintegralAppId: true,
            mintegralStatus: true,
          },
        }),
      ]);

    if (admobResult.status === "rejected") {
      return NextResponse.json(
        { error: `AdMob error: ${admobResult.reason?.message}` },
        { status: 500 }
      );
    }

    const admobList: any[] = admobResult.value;
    const liftoffList = liftoffResult.status === "fulfilled" ? liftoffResult.value : [];
    const pangleList  = pangleResult.status  === "fulfilled" ? pangleResult.value  : [];
    const mintegralList = mintegralResult.status === "fulfilled" ? mintegralResult.value : [];
    const dbList = dbResult.status === "fulfilled" ? dbResult.value : [];

    // Lookup maps for cross-referencing
    const dbByAdmobId   = new Map(dbList.filter(a => a.admobAppId).map(a => [a.admobAppId!, a]));
    const dbByBundleId  = new Map(dbList.filter(a => a.bundleId).map(a => [a.bundleId!, a]));
    const liftoffByBundle   = new Map(liftoffList.filter(a => a.bundleId).map(a => [a.bundleId!, a]));
    const pangleByBundle    = new Map(pangleList.filter(a => a.bundleId).map(a => [a.bundleId!, a]));
    const mintegralByBundle = new Map(mintegralList.filter(a => a.bundleId).map(a => [a.bundleId!, a]));

    const resolvePlatform = (
      dbStatus: string | undefined,
      dbAppId: string | null | undefined,
      apiMatch: { id?: string; appId?: string } | undefined
    ): { status: string; appId?: string | null } => {
      if (dbStatus === "ok") return { status: "ok", appId: dbAppId };
      if (apiMatch) return { status: "ok", appId: apiMatch.id ?? apiMatch.appId ?? null };
      return { status: "none" };
    };

    const enriched = admobList.map((app: any) => {
      const appId: string = app.appId ?? app.name?.split("/").pop() ?? "";
      const displayName: string = app.manualAppInfo?.displayName ?? app.appId ?? "";
      const platform: string = (app.platform ?? "ANDROID").toUpperCase();
      const bundleId: string | undefined = app.linkedAppInfo?.appStoreId ?? undefined;

      const dbRecord =
        (appId ? dbByAdmobId.get(appId) : undefined) ??
        (bundleId ? dbByBundleId.get(bundleId) : undefined) ??
        null;

      return {
        admobAppId: appId,
        displayName,
        platform,
        bundleId,
        dbId: dbRecord?.id ?? null,
        liftoff: resolvePlatform(
          dbRecord?.liftoffStatus,
          dbRecord?.liftoffAppId,
          bundleId ? liftoffByBundle.get(bundleId) : undefined
        ),
        pangle: resolvePlatform(
          dbRecord?.pangleStatus,
          dbRecord?.pangleAppId,
          bundleId ? pangleByBundle.get(bundleId) : undefined
        ),
        mintegral: resolvePlatform(
          dbRecord?.mintegralStatus,
          dbRecord?.mintegralAppId,
          bundleId ? mintegralByBundle.get(bundleId) : undefined
        ),
      };
    });

    return NextResponse.json({
      publisherId,
      total: enriched.length,
      apps: enriched,
      platformErrors: {
        liftoff:    liftoffResult.status    === "rejected" ? (liftoffResult.reason?.message ?? "Unknown error") : null,
        pangle:     pangleResult.status     === "rejected" ? (pangleResult.reason?.message  ?? "Unknown error") : null,
        mintegral:  mintegralResult.status  === "rejected" ? (mintegralResult.reason?.message ?? "Unknown error") : null,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// ────────────────────────────────────────────────────────────
//  POST /api/apps/admob-sync — import an AdMob app into DB
//  Body: { admobAppId, displayName, platform, bundleId? }
//  Returns: { app: AppRecord } — the DB record (created or found)
// ────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  const email = await getSessionEmail();
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { admobAppId, displayName, platform, bundleId } = body as {
    admobAppId?: string; displayName?: string; platform?: string; bundleId?: string;
  };

  if (!admobAppId || !displayName || !platform) {
    return NextResponse.json({ error: "admobAppId, displayName, platform bắt buộc" }, { status: 400 });
  }

  const normPlatform = (platform ?? "ANDROID").toUpperCase();

  // 1. Check if DB record already exists (dedup: by admobAppId or bundleId)
  const existing = await db.app.findFirst({
    where: {
      email,
      OR: [
        { admobAppId },
        ...(bundleId ? [{ bundleId }] : []),
      ],
    },
  });

  if (existing) {
    // Return the existing record so UI can navigate to /dashboard/apps/[id]
    return NextResponse.json({ app: existing, existed: true });
  }

  // 2. Resolve publisher for this user
  const tokenRecord = await db.userToken.findUnique({ where: { email } });
  const publisherId = tokenRecord?.publisherId ?? null;

  // 3. Create DB record seeded from AdMob data
  const app = await db.app.create({
    data: {
      email,
      name: displayName,
      platform: normPlatform,
      isLive: false,           // unknown — user can update
      admobPublisherId: publisherId,
      admobAppId,
      admobStatus: "ok",       // already exists in AdMob
      bundleId: bundleId ?? null,
    },
  });

  return NextResponse.json({ app, existed: false }, { status: 201 });
}
