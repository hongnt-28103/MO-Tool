"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type MobilePlatform = "ANDROID" | "IOS";
type PlatformKey = "admob" | "pangle" | "liftoff" | "mintegral";
type TargetKey = "admob" | "pangle" | "liftoff" | "minter";
type PlatformStatus = "none" | "ok" | "verifying" | "error";
type PangleCategoryOption = { code: number; label: string };

type PlatformResult = {
  status: PlatformStatus;
  appId?: string;
  warning?: string;
  error?: string;
  raw?: unknown;
};

type CreateAppResult = {
  id: string;
  name: string;
  platform: MobilePlatform;
  isLive: boolean;
  results: Record<PlatformKey, PlatformResult>;
};

type StoreMetadata = {
  platform: MobilePlatform;
  bundleId: string;
  storeUrl: string;
  appName: string | null;
};

type LiftoffAppStore = "apple" | "google_play" | "microsoft" | "amazon";
type MintegralAndroidStore = "google_play" | "amazon" | "other_store" | "not_live";

const C = {
  ink:"#0A0C10", ink2:"#131720", panel:"#161B26", border:"#1F2737", border2:"#27313F",
  text:"#E8EBF0", text2:"#8B93A0", text3:"#4E5768",
  accent:"#4FF0B4", accentDim:"rgba(79,240,180,0.12)",
  yellow:"#FFD84D", yellowDim:"rgba(255,216,77,0.12)",
  red:"#FF5F5F", redDim:"rgba(255,95,95,0.12)",
  blue:"#4D9EFF", blueDim:"rgba(77,158,255,0.12)",
};
const FD = "'Syne','Inter',system-ui,sans-serif";
const FS = "'Instrument Sans','Inter',system-ui,sans-serif";
const FM = "'IBM Plex Mono','Courier New',monospace";

const btnP = (disabled=false): React.CSSProperties => ({
  display:"inline-flex", alignItems:"center", justifyContent:"center", gap:8,
  padding:"11px 22px", borderRadius:8, border:"none",
  background: disabled ? "#2a3040" : C.accent,
  color: disabled ? C.text3 : C.ink,
  fontSize:14, fontWeight:700, cursor: disabled ? "not-allowed" : "pointer",
  fontFamily:FS, width:"100%", opacity: disabled ? 0.6 : 1,
});
const btnG: React.CSSProperties = {
  display:"inline-flex", alignItems:"center", gap:7,
  padding:"8px 16px", borderRadius:8, background:"transparent",
  border:`1px solid ${C.border2}`, color:C.text2, fontSize:13,
  fontWeight:600, cursor:"pointer", fontFamily:FS,
};
const btnSmall = (color: string): React.CSSProperties => ({
  padding:"5px 12px", borderRadius:6, border:`1px solid ${color}`,
  background:"transparent", color, fontSize:11, fontWeight:700,
  cursor:"pointer", fontFamily:FS,
});
const inp: React.CSSProperties = {
  width:"100%", background:C.ink2, border:`1px solid ${C.border2}`,
  borderRadius:8, padding:"10px 13px", fontSize:13.5, color:C.text,
  fontFamily:FS, outline:"none", boxSizing:"border-box",
};
const lbl: React.CSSProperties = {
  display:"block", fontSize:11, fontWeight:700, color:C.text2,
  textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:6,
};
const card: React.CSSProperties = {
  background:C.panel, border:`1px solid ${C.border}`,
  borderRadius:12, overflow:"hidden", marginBottom:16,
};

const ADMOB_ACCOUNTS = [
  { id: process.env.NEXT_PUBLIC_ADMOB_PUB_NAMI || "pub-4973559944609228", name: "NAMI" },
  { id: process.env.NEXT_PUBLIC_ADMOB_PUB_NASUS || "pub-4584260126367940", name: "NASUS" },
];

const LIFTOFF_CATEGORIES = [
  "Games","Books & Reference","Business","Card","Comics","Communication",
  "Dating","Education","Entertainment","Finance","Food & Drink",
  "Health & Fitness","Lifestyle","Medical","Music","Navigation","News",
  "Personalization","Photo & Video","Productivity","Racing","Shopping",
  "Simulation","Social","Sports","Travel","Trivia","Utilities",
  "Weather","Word",
];

export default function AppsPage() {
  const router = useRouter();

  // ── Mode ──
  const [mode, setMode] = useState<"live" | "not_live">("live");

  // ── Live mode state ──
  const [storeUrl, setStoreUrl] = useState("");
  const [fetchingMeta, setFetchingMeta] = useState(false);
  const [storeMeta, setStoreMeta] = useState<StoreMetadata | null>(null);
  const [storeError, setStoreError] = useState<string | null>(null);
  const [manualAppName, setManualAppName] = useState(""); // fallback if fetch fails

  // ── Not-live mode state ──
  const [appName, setAppName] = useState("");
  const [platform, setPlatform] = useState<MobilePlatform>("ANDROID");

  // ── Shared fields ──
  const [pangleCategoryCode, setPangleCategoryCode] = useState("");
  const [targets, setTargets] = useState<Record<TargetKey, boolean>>({
    admob: true,
    liftoff: false,
    minter: false,
    pangle: false,
  });

  // ── Liftoff specific ──
  const [liftoffAppStore, setLiftoffAppStore] = useState<LiftoffAppStore>("google_play");
  const [liftoffCoppa, setLiftoffCoppa] = useState(true);
  const [liftoffCategory, setLiftoffCategory] = useState("");

  // ── Mintegral specific ──
  const [mintegralAndroidStore, setMintegralAndroidStore] = useState<MintegralAndroidStore>("google_play");
  const [mintegralStoreName, setMintegralStoreName] = useState("");
  const [mintegralPreviewLink, setMintegralPreviewLink] = useState("");
  const [mintegralBundleId, setMintegralBundleId] = useState("");
  const [pangleCategories, setPangleCategories] = useState<PangleCategoryOption[]>([]);
  const [pangleCatLoading, setPangleCatLoading] = useState(false);
  const [pangleCatSource, setPangleCatSource] = useState<string | null>(null);

  // ── Submit state ──
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CreateAppResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ── Load Pangle categories on mount ──
  useEffect(() => {
    if (pangleCategories.length > 0 || pangleCatLoading) return;
    setPangleCatLoading(true);
    fetch("/api/apps/pangle-categories")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.categories)) {
          setPangleCategories(d.categories);
          setPangleCatSource(d.source);
        }
      })
      .finally(() => setPangleCatLoading(false));
  }, [pangleCategories.length, pangleCatLoading]);

  // ── Auto-sync Liftoff app store with platform ──
  useEffect(() => {
    const p = mode === "live" ? (storeMeta?.platform ?? platform) : platform;
    setLiftoffAppStore(p === "IOS" ? "apple" : "google_play");
  }, [mode, storeMeta, platform]);

  // ── Auto-sync Mintegral store type with mode + platform ──
  useEffect(() => {
    const p = mode === "live" ? (storeMeta?.platform ?? platform) : platform;
    if (p === "ANDROID") {
      setMintegralAndroidStore(mode === "not_live" ? "not_live" : "google_play");
    }
  }, [mode, storeMeta, platform]);

  // ── Store URL → fetch metadata ──
  const handleFetchMeta = async () => {
    if (!storeUrl.trim()) return;
    setFetchingMeta(true);
    setStoreMeta(null);
    setStoreError(null);
    setManualAppName("");
    try {
      const res = await fetch("/api/apps/store-metadata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeUrl: storeUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Fetch thất bại");
      setStoreMeta(data as StoreMetadata);
    } catch (e: unknown) {
      setStoreError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setFetchingMeta(false);
    }
  };

  // ── Derived values ──
  const effectivePlatform = mode === "live" ? storeMeta?.platform ?? "ANDROID" : platform;
  const effectiveAppName =
    mode === "live"
      ? storeMeta?.appName ?? manualAppName.trim()
      : appName.trim();
  const effectiveBundleId = mode === "live" ? storeMeta?.bundleId : (mintegralBundleId.trim() || undefined);
  const effectiveStoreUrl = mode === "live" ? storeMeta?.storeUrl : undefined;
  const selectedTargets = (Object.keys(targets) as TargetKey[]).filter((k) => targets[k]);

  // ── Validation ──
  const validationErrors: string[] = [];
  if (selectedTargets.length === 0) validationErrors.push("Chọn ít nhất 1 nền tảng");
  if (!effectiveAppName || effectiveAppName.length < 1) validationErrors.push("Tên app không được rỗng");
  if (effectiveAppName.length > 60) validationErrors.push("Tên app tối đa 60 ký tự");
  if (targets.pangle && !pangleCategoryCode) validationErrors.push("Pangle: chọn category");
  if (targets.liftoff && !liftoffCategory) validationErrors.push("Liftoff: chọn App Category (bắt buộc)");
  if (mode === "live" && !storeMeta) validationErrors.push("Cần fetch metadata từ Store URL trước");
  if (mode === "live" && storeMeta && !storeMeta.appName && !manualAppName.trim())
    validationErrors.push("Không fetch được tên app — hãy nhập thủ công");
  if (targets.minter && effectivePlatform === "ANDROID" && mintegralAndroidStore === "other_store" && !mintegralStoreName.trim())
    validationErrors.push("Mintegral: nhập Store Name");
  if (targets.minter && effectivePlatform === "ANDROID" && mintegralAndroidStore === "other_store" && !mintegralPreviewLink.trim())
    validationErrors.push("Mintegral: nhập Preview Link");
  if (targets.minter && mode === "not_live" && !mintegralBundleId.trim())
    validationErrors.push(`Mintegral: nhập ${effectivePlatform === "IOS" ? "Bundle ID" : "Package Name"}`);

  const canSubmit = validationErrors.length === 0 && !loading;

  // ── Submit ──
  const handleSubmit = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    try {
      const payload = {
        mode,
        appName: effectiveAppName,
        platform: effectivePlatform,
        storeUrl: effectiveStoreUrl,
        bundleId: effectiveBundleId,
        pangleCategoryCode: targets.pangle ? Number(pangleCategoryCode) : undefined,
        targets,
        // Liftoff
        liftoffCoppa,
        liftoffCategory: liftoffCategory.trim() || undefined,
        // Mintegral
        mintegralAndroidStore: effectivePlatform === "ANDROID" ? mintegralAndroidStore : undefined,
        mintegralStoreName: mintegralStoreName.trim() || undefined,
        mintegralPreviewLink: mintegralPreviewLink.trim() || undefined,
      };
      const res = await fetch("/api/apps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok && !data.results) throw new Error(data.error ?? "Tạo app thất bại");
      setResult(data as CreateAppResult);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setMode("live");
    setStoreUrl("");
    setStoreMeta(null);
    setStoreError(null);
    setManualAppName("");
    setAppName("");
    setPlatform("ANDROID");
    setPangleCategoryCode("");
    setTargets({ admob: true, liftoff: false, minter: false, pangle: false });
    setLiftoffAppStore("google_play");
    setLiftoffCoppa(true);
    setLiftoffCategory("");
    setMintegralAndroidStore("google_play");
    setMintegralStoreName("");
    setMintegralPreviewLink("");
    setMintegralBundleId("");
    setResult(null);
    setError(null);
  };

  // ── Status badge helper ──
  const statusBadge = (s: PlatformStatus) => {
    const map: Record<PlatformStatus, { color: string; label: string }> = {
      ok: { color: C.accent, label: "SUCCESS" },
      verifying: { color: C.yellow, label: "VERIFYING" },
      error: { color: C.red, label: "FAILED" },
      none: { color: C.text3, label: "SKIPPED" },
    };
    const { color, label } = map[s] ?? map.none;
    return (
      <span style={{ fontSize:11, color, fontWeight:700, letterSpacing:"0.04em" }}>
        {s === "ok" ? "✓" : s === "error" ? "✗" : s === "verifying" ? "⏳" : "—"} {label}
      </span>
    );
  };

  return (
    <div style={{ fontFamily:FS, background:C.ink, minHeight:"100vh", color:C.text }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=Instrument+Sans:wght@400;500;600&display=swap');
        *{box-sizing:border-box;}
        input::placeholder,select::placeholder{color:${C.text3};}
        input:focus,select:focus{outline:none!important;border-color:${C.accent}!important;}
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        .fu{animation:fadeUp .35s ease;}
        @keyframes spin{to{transform:rotate(360deg)}} .sp{animation:spin .8s linear infinite;display:inline-block;}
      `}</style>

      {/* Topbar */}
      <div style={{ height:52, background:C.ink2, borderBottom:`1px solid ${C.border}`,
        padding:"0 28px", display:"flex", alignItems:"center", justifyContent:"space-between",
        position:"sticky", top:0, zIndex:20 }}>
        <div style={{ fontFamily:FD, fontWeight:700, fontSize:15 }}>Tạo Ứng dụng</div>
        <div style={{ display:"flex", gap:8 }}>
          <button style={btnG} onClick={() => router.push("/dashboard/apps/list")}>
            Danh sách app
          </button>
          {result && <button style={btnG} onClick={reset}>+ Tạo app mới</button>}
        </div>
      </div>

      <div className="fu" style={{ padding:"32px", maxWidth:620 }}>

        {!result ? (
          <>
            {/* Mode selector */}
            <div style={card}>
              <div style={{ padding:"13px 18px", borderBottom:`1px solid ${C.border}`,
                fontFamily:FD, fontWeight:700, fontSize:13 }}>
                Chế độ tạo app
              </div>
              <div style={{ padding:"18px", display:"flex", gap:10 }}>
                {([
                  ["live", "App đã live trên Store", "Paste URL → tự động lấy thông tin"],
                  ["not_live", "App chưa live", "Nhập tên + chọn platform thủ công"],
                ] as const).map(([m, title, desc]) => {
                  const sel = mode === m;
                  return (
                    <div key={m} onClick={() => { setMode(m); setStoreMeta(null); setStoreError(null); }}
                      style={{ flex:1, padding:"14px", borderRadius:10, cursor:"pointer",
                        border:`1.5px solid ${sel ? C.accent : C.border2}`,
                        background: sel ? C.accentDim : C.ink2 }}>
                      <div style={{ fontSize:13, fontWeight:700, color: sel ? C.accent : C.text, marginBottom:4 }}>
                        {title}
                      </div>
                      <div style={{ fontSize:11, color: C.text3, lineHeight:1.5 }}>{desc}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Form card */}
            <div style={card}>
              <div style={{ padding:"13px 18px", borderBottom:`1px solid ${C.border}`,
                fontFamily:FD, fontWeight:700, fontSize:13 }}>
                Thông tin App
              </div>
              <div style={{ padding:"22px" }}>

                {mode === "live" ? (
                  /* ──────── LIVE MODE ──────── */
                  <>
                    {/* Store URL */}
                    <div style={{ marginBottom:20 }}>
                      <label style={lbl}>Store URL <span style={{color:C.red}}>*</span></label>
                      <div style={{ display:"flex", gap:8 }}>
                        <input style={{ ...inp, flex:1 }}
                          placeholder="https://apps.apple.com/… hoặc https://play.google.com/…"
                          value={storeUrl}
                          onChange={e => setStoreUrl(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") handleFetchMeta(); }}
                        />
                        <button
                          onClick={handleFetchMeta}
                          disabled={fetchingMeta || !storeUrl.trim()}
                          style={{
                            ...btnP(fetchingMeta || !storeUrl.trim()),
                            width:"auto", padding:"10px 18px", fontSize:12, whiteSpace:"nowrap",
                          }}>
                          {fetchingMeta ? <span className="sp">↻</span> : "Fetch"}
                        </button>
                      </div>
                      <div style={{ fontSize:11, color:C.text3, marginTop:5 }}>
                        Paste link App Store hoặc Google Play. Hệ thống sẽ tự detect platform, bundle ID và tên app.
                      </div>
                    </div>

                    {storeError && (
                      <div style={{ padding:"11px 14px", background:C.redDim, border:`1px solid rgba(255,95,95,0.3)`,
                        borderRadius:8, fontSize:12.5, color:C.red, marginBottom:16 }}>
                        ⚠ {storeError}
                      </div>
                    )}

                    {storeMeta && (
                      <div style={{ marginBottom:20, padding:"14px", borderRadius:8,
                        border:`1px solid rgba(79,240,180,0.3)`, background:C.accentDim }}>
                        <div style={{ fontSize:11, fontWeight:700, color:C.accent, marginBottom:10, textTransform:"uppercase", letterSpacing:"0.08em" }}>
                          Metadata đã fetch
                        </div>
                        {[
                          ["Platform", storeMeta.platform],
                          ["Bundle ID", storeMeta.bundleId],
                          ["Tên app", storeMeta.appName ?? "⚠ Không fetch được — nhập bên dưới"],
                        ].map(([k, v]) => (
                          <div key={k as string} style={{ display:"flex", justifyContent:"space-between",
                            padding:"6px 0", borderBottom:`1px solid rgba(79,240,180,0.15)` }}>
                            <span style={{ fontSize:11, color:C.text3, fontWeight:600 }}>{k}</span>
                            <span style={{ fontSize:12, color:C.text, fontFamily:FM, wordBreak:"break-all" }}>{v}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Fallback name input — if fetch returned null appName */}
                    {storeMeta && !storeMeta.appName && (
                      <div style={{ marginBottom:20 }}>
                        <label style={lbl}>Tên app (thủ công) <span style={{color:C.red}}>*</span></label>
                        <input style={inp}
                          placeholder="Nhập tên app..."
                          value={manualAppName}
                          onChange={e => setManualAppName(e.target.value)}
                        />
                      </div>
                    )}
                  </>
                ) : (
                  /* ──────── NOT LIVE MODE ──────── */
                  <>
                    <div style={{ marginBottom:20 }}>
                      <label style={lbl}>Tên app <span style={{color:C.red}}>*</span></label>
                      <input style={inp}
                        placeholder="VD: My Casual Game, Hyper Runner..."
                        value={appName}
                        onChange={e => setAppName(e.target.value)}
                        maxLength={60}
                      />
                      <div style={{ fontSize:11, color:C.text3, marginTop:5 }}>
                        Tối đa 60 ký tự. Tên này sẽ dùng cho tất cả 4 platform.
                      </div>
                    </div>

                    <div style={{ marginBottom:20 }}>
                      <label style={lbl}>Platform <span style={{color:C.red}}>*</span></label>
                      <div style={{ display:"flex", gap:10 }}>
                        {(["ANDROID", "IOS"] as const).map(p => {
                          const sel = platform === p;
                          return (
                            <div key={p} onClick={() => setPlatform(p)}
                              style={{ flex:1, display:"flex", alignItems:"center", gap:10,
                                padding:"12px 16px", borderRadius:8, cursor:"pointer", userSelect:"none",
                                border:`1px solid ${sel ? C.accent : C.border2}`,
                                background: sel ? C.accentDim : C.ink2 }}>
                              <div style={{ width:15, height:15, borderRadius:"50%",
                                border:`1.5px solid ${sel ? C.accent : C.border2}`,
                                display:"flex", alignItems:"center", justifyContent:"center" }}>
                                {sel && <div style={{ width:7, height:7, borderRadius:"50%", background:C.accent }}/>}
                              </div>
                              <span style={{ fontSize:14 }}>{p === "ANDROID" ? "🤖" : "🍎"}</span>
                              <span style={{ fontWeight:600, fontSize:13, color: sel ? C.accent : C.text2 }}>{p}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}

                {/* Targets */}
                <div style={{ marginBottom:20 }}>
                  <label style={lbl}>Nền tảng cần tạo app <span style={{color:C.red}}>*</span></label>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                    {([
                      ["admob", "AdMob"],
                      ["liftoff", "Liftoff Monetize"],
                      ["minter", "Minter (Mintegral)"],
                      ["pangle", "Pangle"],
                    ] as Array<[TargetKey, string]>).map(([key, title]) => {
                      const checked = targets[key];
                      return (
                        <div
                          key={key}
                          onClick={() => setTargets((prev) => ({ ...prev, [key]: !checked }))}
                          style={{
                            padding:"10px 12px",
                            borderRadius:8,
                            border:`1px solid ${checked ? C.accent : C.border2}`,
                            background: checked ? C.accentDim : C.ink2,
                            cursor:"pointer",
                            userSelect:"none",
                            display:"flex",
                            alignItems:"center",
                            gap:9,
                          }}>
                          <div style={{
                            width:15,
                            height:15,
                            borderRadius:4,
                            border:`1.5px solid ${checked ? C.accent : C.border2}`,
                            background: checked ? C.accent : "transparent",
                            display:"flex",
                            alignItems:"center",
                            justifyContent:"center",
                            flexShrink:0,
                          }}>
                            {checked && <svg width={9} height={9} fill="none" stroke={C.ink} strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>}
                          </div>
                          <span style={{ fontSize:12.5, color:checked ? C.accent : C.text2, fontWeight:600 }}>{title}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Pangle Category */}
                {targets.pangle && (
                <div style={{ marginBottom:20 }}>
                  <label style={lbl}>Pangle Category <span style={{color:C.red}}>*</span></label>
                  <select style={inp} value={pangleCategoryCode}
                    onChange={e => setPangleCategoryCode(e.target.value)}>
                    <option value="" disabled>
                      {pangleCatLoading ? "Đang tải category..." : "— Chọn category —"}
                    </option>
                    {pangleCategories.map(cat => (
                      <option key={cat.code} value={String(cat.code)}>
                        {cat.label} ({cat.code})
                      </option>
                    ))}
                  </select>
                  {pangleCatSource && (
                    <div style={{ fontSize:10, color:C.text3, marginTop:4 }}>
                      Nguồn: {pangleCatSource === "crawl" ? "crawl từ Pangle website" : "fallback nội bộ"}
                    </div>
                  )}
                </div>
                )}

                {targets.liftoff && (
                <div style={{ marginBottom:20 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:C.blue, textTransform:"uppercase",
                    letterSpacing:"0.08em", marginBottom:8, paddingBottom:6,
                    borderBottom:`1px solid ${C.border}` }}>
                    ↳ Cấu hình Liftoff Monetize
                  </div>
                  <div style={{ padding:"14px 16px", borderRadius:10, border:`1px solid ${C.border}`, background:C.ink2 }}>

                    {/* App Store */}
                    <div style={{ marginBottom:14 }}>
                      <label style={lbl}>App Store</label>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                        {([
                          ["apple", "🍎 Apple App Store"],
                          ["google_play", "🤖 Google Play Store"],
                          ["amazon", "📦 Amazon Appstore"],
                          ["microsoft", "🫟 Microsoft Store"],
                        ] as [LiftoffAppStore, string][]).map(([val, label]) => {
                          const sel = liftoffAppStore === val;
                          return (
                            <div key={val} onClick={() => setLiftoffAppStore(val)}
                              style={{ padding:"8px 10px", borderRadius:7, cursor:"pointer", userSelect:"none",
                                border:`1px solid ${sel ? C.accent : C.border2}`,
                                background: sel ? C.accentDim : "transparent",
                                display:"flex", alignItems:"center", gap:7 }}>
                              <div style={{ width:12, height:12, borderRadius:"50%",
                                border:`1.5px solid ${sel ? C.accent : C.border2}`,
                                background: sel ? C.accent : "transparent", flexShrink:0 }} />
                              <span style={{ fontSize:11.5, color: sel ? C.accent : C.text2, fontWeight:600 }}>{label}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* COPPA */}
                    <div style={{ marginBottom:14 }}>
                      <label style={lbl}>Apps Directed Toward Children Under Age 13</label>
                      <div style={{ display:"flex", gap:8 }}>
                        {([true, false] as const).map(val => {
                          const sel = liftoffCoppa === val;
                          return (
                            <div key={String(val)} onClick={() => setLiftoffCoppa(val)}
                              style={{ flex:1, padding:"8px 12px", borderRadius:7, cursor:"pointer", userSelect:"none",
                                border:`1px solid ${sel ? C.accent : C.border2}`,
                                background: sel ? C.accentDim : "transparent",
                                display:"flex", alignItems:"center", justifyContent:"center", gap:7 }}>
                              <span style={{ fontSize:12.5, color: sel ? C.accent : C.text2, fontWeight:600 }}>
                                {val ? "✓ Agree" : "✗ Disagree"}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Category (required) */}
                    <div>
                      <label style={lbl}>App Category <span style={{color:C.red}}>*</span></label>
                      <select style={inp} value={liftoffCategory} onChange={e => setLiftoffCategory(e.target.value)}>
                        <option value="">— Chọn category —</option>
                        {LIFTOFF_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
                )}

                {targets.minter && (
                <div style={{ marginBottom:20 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:C.blue, textTransform:"uppercase",
                    letterSpacing:"0.08em", marginBottom:8, paddingBottom:6,
                    borderBottom:`1px solid ${C.border}` }}>
                    ↳ Cấu hình Mintegral
                  </div>
                  <div style={{ padding:"14px 16px", borderRadius:10, border:`1px solid ${C.border}`, background:C.ink2 }}>

                    {/* Android: store type */}
                    {effectivePlatform === "ANDROID" && (
                      <div style={{ marginBottom:14 }}>
                        <label style={lbl}>Live in Store</label>
                        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                          {([
                            ["google_play", "🤖 Google Play"],
                            ["amazon", "📦 Amazon Store"],
                            ["other_store", "🏪 Other Store"],
                            ["not_live", "🚫 Not Live in Store"],
                          ] as [MintegralAndroidStore, string][]).map(([val, label]) => {
                            const sel = mintegralAndroidStore === val;
                            return (
                              <div key={val} onClick={() => setMintegralAndroidStore(val)}
                                style={{ padding:"8px 10px", borderRadius:7, cursor:"pointer", userSelect:"none",
                                  border:`1px solid ${sel ? C.accent : C.border2}`,
                                  background: sel ? C.accentDim : "transparent",
                                  display:"flex", alignItems:"center", gap:7 }}>
                                <div style={{ width:12, height:12, borderRadius:"50%",
                                  border:`1.5px solid ${sel ? C.accent : C.border2}`,
                                  background: sel ? C.accent : "transparent", flexShrink:0 }} />
                                <span style={{ fontSize:11.5, color: sel ? C.accent : C.text2, fontWeight:600 }}>{label}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* iOS: info badge */}
                    {effectivePlatform === "IOS" && (
                      <div style={{ marginBottom:14, padding:"8px 12px", borderRadius:7,
                        background:C.blueDim, border:`1px solid rgba(77,158,255,0.3)`,
                        fontSize:11.5, color:C.blue }}>
                        iOS • {mode === "live" ? "Live in Store" : "Not Live in Store"}
                      </div>
                    )}

                    {/* Other Store extra fields */}
                    {effectivePlatform === "ANDROID" && mintegralAndroidStore === "other_store" && (
                      <>
                        <div style={{ marginBottom:12 }}>
                          <label style={lbl}>Store Name <span style={{color:C.red}}>*</span></label>
                          <input style={inp} placeholder="VD: MyCustomStore"
                            value={mintegralStoreName} onChange={e => setMintegralStoreName(e.target.value)} />
                        </div>
                        <div style={{ marginBottom:12 }}>
                          <label style={lbl}>Preview Link <span style={{color:C.red}}>*</span></label>
                          <input style={inp} placeholder="https://..."
                            value={mintegralPreviewLink} onChange={e => setMintegralPreviewLink(e.target.value)} />
                        </div>
                      </>
                    )}

                    {/* Package / Bundle ID for not-live */}
                    {mode === "not_live" && (
                      <div>
                        <label style={lbl}>
                          {effectivePlatform === "IOS" ? "Bundle ID / APP ID on App Store" : "Package Name"}{" "}
                          <span style={{color:C.red}}>*</span>
                        </label>
                        <input style={inp}
                          placeholder={effectivePlatform === "IOS" ? "com.company.appname" : "com.company.appname"}
                          value={mintegralBundleId}
                          onChange={e => setMintegralBundleId(e.target.value)} />
                      </div>
                    )}

                    {/* Live mode: show detected bundle ID */}
                    {mode === "live" && effectiveBundleId && (
                      <div style={{ fontSize:11, color:C.text3, marginTop:4 }}>
                        {effectivePlatform === "IOS" ? "Bundle ID" : "Package"}: <span
                          style={{ color:C.text, fontFamily:"'IBM Plex Mono',monospace" }}>{effectiveBundleId}</span> (từ store URL)
                      </div>
                    )}
                  </div>
                </div>
                )}

                {/* Info */}
                <div style={{ padding:"11px 14px", background:C.ink2, border:`1px solid ${C.border}`,
                  borderRadius:8, marginBottom:20, fontSize:12, color:C.text3, lineHeight:1.6 }}>
                  Hệ thống sẽ tạo app trên các nền tảng đã chọn: <strong style={{color:C.text}}>{selectedTargets.join(" · ") || "(chưa chọn)"}</strong>.
                  {mode === "live"
                    ? " Pangle status=live, Liftoff store.isManual=false, Mintegral is_live_in_store=1."
                    : " Pangle status=test, Liftoff store.isManual=true, Mintegral is_live_in_store=0."
                  }
                </div>

                {/* Validation errors */}
                {!!validationErrors.length && (
                  <div style={{ padding:"11px 14px", background:C.yellowDim,
                    border:`1px solid rgba(255,216,77,0.35)`, borderRadius:8,
                    fontSize:12.5, color:C.yellow, marginBottom:16, lineHeight:1.55 }}>
                    {validationErrors.map(v => <div key={v}>• {v}</div>)}
                  </div>
                )}

                {error && (
                  <div style={{ padding:"11px 14px", background:C.redDim,
                    border:`1px solid rgba(255,95,95,0.3)`, borderRadius:8,
                    fontSize:13, color:C.red, marginBottom:16 }}>
                    ⚠ {error}
                  </div>
                )}

                <button style={btnP(!canSubmit)} disabled={!canSubmit} onClick={handleSubmit}>
                  {loading
                    ? <><span className="sp">↻</span> Đang tạo trên nền tảng đã chọn...</>
                    : "Tạo App trên nền tảng đã chọn →"
                  }
                </button>
              </div>
            </div>
          </>
        ) : (
          /* ──────── RESULT SCREEN ──────── */
          <ResultScreen result={result} router={router} reset={reset} statusBadge={statusBadge} />
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
//  Result Screen Component
// ────────────────────────────────────────────────────────────
function ResultScreen({
  result, router, reset, statusBadge,
}: {
  result: CreateAppResult;
  router: ReturnType<typeof useRouter>;
  reset: () => void;
  statusBadge: (s: PlatformStatus) => React.ReactNode;
}) {
  const [retrying, setRetrying] = useState<PlatformKey | null>(null);
  const [localResults, setLocalResults] = useState(result.results);

  const handleRetry = async (platform: PlatformKey) => {
    setRetrying(platform);
    try {
      const res = await fetch(`/api/apps/${result.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retryPlatform: platform }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Retry thất bại");
      // Refresh app detail to get updated statuses
      const detailRes = await fetch(`/api/apps/${result.id}`);
      const detail = await detailRes.json();
      if (detail.app) {
        setLocalResults({
          admob: { status: detail.app.admobStatus, appId: detail.app.admobAppId, error: detail.app.admobError },
          pangle: { status: detail.app.pangleStatus, appId: detail.app.pangleAppId, error: detail.app.pangleError },
          liftoff: { status: detail.app.liftoffStatus, appId: detail.app.liftoffAppId, error: detail.app.liftoffError },
          mintegral: { status: detail.app.mintegralStatus, appId: detail.app.mintegralAppId, error: detail.app.mintegralError },
        });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Retry error";
      setLocalResults(prev => ({
        ...prev,
        [platform]: { ...prev[platform], status: "error" as PlatformStatus, error: msg },
      }));
    } finally {
      setRetrying(null);
    }
  };

  const activeResults = Object.values(localResults).filter((r) => r.status !== "none");
  const allOk = activeResults.length > 0 && activeResults.every(r => r.status === "ok" || r.status === "verifying");
  const hasError = activeResults.some(r => r.status === "error");

  return (
    <div className="fu">
      <div style={{
        padding:"11px 14px", borderRadius:8, marginBottom:20, fontSize:13,
        background: allOk ? "rgba(79,240,180,0.12)" : hasError ? "rgba(255,216,77,0.12)" : "rgba(79,240,180,0.12)",
        border: `1px solid ${allOk ? "rgba(79,240,180,0.35)" : "rgba(255,216,77,0.35)"}`,
        color: allOk ? C.accent : C.yellow,
      }}>
        {allOk ? "✓ App đã được tạo thành công trên tất cả nền tảng!" : "⚠ Một số nền tảng bị lỗi — có thể Retry bên dưới"}
      </div>

      {/* Summary */}
      <div style={card}>
        <div style={{ padding:"13px 18px", borderBottom:`1px solid ${C.border}`,
          fontFamily:"'Syne','Inter',system-ui,sans-serif", fontWeight:700, fontSize:13 }}>
          Tổng quan
        </div>
        <div style={{ padding:"16px 18px" }}>
          {[
            ["Tên App", result.name],
            ["Platform", result.platform],
            ["Chế độ", result.isLive ? "Live (từ Store URL)" : "Chưa live (test)"],
            ["App ID (nội bộ)", result.id],
          ].map(([k, v]) => (
            <div key={k as string} style={{ display:"flex", justifyContent:"space-between",
              padding:"8px 0", borderBottom:`1px solid ${C.border}` }}>
              <span style={{ fontSize:11, color:C.text3, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.06em" }}>{k}</span>
              <span style={{ fontSize:12, color:C.text, fontFamily:"'IBM Plex Mono','Courier New',monospace" }}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Per-platform results */}
      <div style={card}>
        <div style={{ padding:"13px 18px", borderBottom:`1px solid ${C.border}`,
          fontFamily:"'Syne','Inter',system-ui,sans-serif", fontWeight:700, fontSize:13 }}>
          Kết quả từng nền tảng
        </div>
        <div style={{ padding:"14px 18px" }}>
          {(["admob", "pangle", "liftoff", "mintegral"] as PlatformKey[]).map(pk => {
            const r = localResults[pk];
            if (!r) return null;
            const isError = r.status === "error";
            const canRetry = isError;
            return (
              <div key={pk} style={{ marginBottom:12, padding:"12px", borderRadius:8,
                border:`1px solid ${C.border}`, background:C.ink2 }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
                  <span style={{ fontSize:12, fontWeight:700, color:C.text2, textTransform:"uppercase",
                    letterSpacing:"0.06em" }}>
                    {pk === "mintegral" ? "Mintegral" : pk.charAt(0).toUpperCase() + pk.slice(1)}
                  </span>
                  {statusBadge(r.status)}
                </div>

                {r.appId && (
                  <div style={{ fontSize:12, color:C.text, fontFamily:"'IBM Plex Mono','Courier New',monospace",
                    marginBottom:4, wordBreak:"break-all" }}>
                    App ID: {r.appId}
                  </div>
                )}

                {r.warning && (
                  <div style={{ fontSize:11.5, color:C.yellow, marginBottom:4 }}>⚠ {r.warning}</div>
                )}

                {isError && r.error && (
                  <div style={{ fontSize:11.5, color:C.red, marginBottom:8, wordBreak:"break-word" }}>
                    ✗ {r.error}
                  </div>
                )}

                {canRetry && (
                  <button
                    onClick={() => handleRetry(pk)}
                    disabled={retrying === pk}
                    style={{
                      padding:"5px 14px", borderRadius:6, border:`1px solid ${C.yellow}`,
                      background:"transparent", color:C.yellow, fontSize:11, fontWeight:700,
                      cursor: retrying === pk ? "not-allowed" : "pointer",
                      fontFamily:"'Instrument Sans','Inter',system-ui,sans-serif",
                      opacity: retrying === pk ? 0.5 : 1,
                    }}>
                    {retrying === pk ? "Đang retry..." : "↻ Retry"}
                  </button>
                )}

                {pk === "mintegral" && r.status === "ok" && (
                  <div style={{ marginTop:8, fontSize:11, color:C.text3 }}>
                    App Key chưa có — vào <span style={{ color:C.accent, cursor:"pointer", textDecoration:"underline" }}
                      onClick={() => router.push(`/dashboard/apps/${result.id}`)}>
                      chi tiết app
                    </span> để paste.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display:"flex", gap:10 }}>
        <button style={{ ...btnP(false), flex:1 }}
          onClick={() => router.push(`/dashboard/apps/${result.id}`)}>
          Xem chi tiết App →
        </button>
        <button style={btnG} onClick={reset}>+ Tạo app khác</button>
      </div>
    </div>
  );
}
