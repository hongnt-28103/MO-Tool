"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type MobilePlatform = "ANDROID" | "IOS";
type TargetKey = "admob" | "liftoff" | "minter" | "pangle";
type PangleCategoryOption = { code: number; label: string };

type CreateAppResult = {
  displayName: string;
  mobilePlatform: MobilePlatform;
  createdTargets: TargetKey[];
  results: Partial<Record<TargetKey, { ok: boolean; data?: any; error?: string; warning?: string }>>;
  hasErrors: boolean;
};

type SyncApp = {
  admobAppId: string;
  displayName: string;
  platform: "ANDROID" | "IOS";
  bundleId?: string;
  dbId?: string | null;
  liftoff:   { status: string; appId?: string | null };
  pangle:    { status: string; appId?: string | null };
  mintegral: { status: string; appId?: string | null };
};

type SyncResult = {
  publisherId: string;
  total: number;
  apps: SyncApp[];
  platformErrors: { liftoff?: string | null; pangle?: string | null; mintegral?: string | null };
};

const C = {
  ink:"#F8FAFC", ink2:"#FFFFFF", panel:"#FFFFFF", border:"#E2E8F0", border2:"#CBD5E1",
  text:"#0F172A", text2:"#475569", text3:"#94A3B8",
  accent:"#059669", accentDim:"rgba(5,150,105,0.10)",
  yellow:"#D97706", yellowDim:"rgba(217,119,6,0.10)",
  red:"#DC2626", redDim:"rgba(220,38,38,0.10)",
};
const FD = "'Syne','Inter',system-ui,sans-serif";
const FS = "'Instrument Sans','Inter',system-ui,sans-serif";

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

export default function AppsPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    appStatus: "live" as "live" | "not_live",
    appUrl: "",
    appName: "",
    detectedCategory: "",
    platform: "ANDROID" as MobilePlatform,
    targets: {
      admob: true,
      liftoff: false,
      minter: false,
      pangle: false,
    } as Record<TargetKey, boolean>,
    mintegralAndroidStore: "google_play" as "google_play" | "amazon",
    mintegralManualIdentifier: "",
    pangleCategoryCode: "",
    liftoffBundleId: "",
  });
  const [detectingStore, setDetectingStore] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CreateAppResult | null>(null);
  const [error, setError] = useState<string|null>(null);
  const [duplicateId, setDuplicateId] = useState<string | null>(null);
  const [pangleCategories, setPangleCategories] = useState<PangleCategoryOption[]>([]);
  const [pangleCategorySource, setPangleCategorySource] = useState<"crawl" | "fallback" | null>(null);
  const [pangleCategoryLoading, setPangleCategoryLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"list" | "create">("list");
  const [syncData, setSyncData] = useState<SyncResult | null>(null);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncFilter, setSyncFilter] = useState("");
  const [importingId, setImportingId] = useState<string | null>(null);

  useEffect(() => {
    if (!form.targets.pangle || pangleCategories.length > 0 || pangleCategoryLoading) return;
    setPangleCategoryLoading(true);
    fetch("/api/apps/pangle-categories")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.categories)) {
          const cats = d.categories as PangleCategoryOption[];
          setPangleCategories(cats);
          setPangleCategorySource(d.source === "crawl" ? "crawl" : "fallback");
          if (!form.pangleCategoryCode && cats.length > 0) {
            setForm((f) => ({ ...f, pangleCategoryCode: String(cats[0].code) }));
          }
        }
      })
      .finally(() => setPangleCategoryLoading(false));
  }, [form.targets.pangle, pangleCategories.length, pangleCategoryLoading, form.pangleCategoryCode]);

  const selectedTargets = (Object.keys(form.targets) as TargetKey[]).filter((k) => form.targets[k]);
  const isLiveFlow = form.appStatus === "live";

  const handleDetectFromUrl = async () => {
    if (!form.appUrl.trim()) return;
    setDetectingStore(true);
    setError(null);
    try {
      const res = await fetch("/api/apps/store-metadata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeUrl: form.appUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Không detect được metadata từ store URL");

      // Validate that we got app name
      if (!data.appName) {
        throw new Error("Không tìm thấy App Name từ URL này. Vui lòng kiểm tra lại URL hoặc thử URL khác.");
      }

      setForm((f) => ({
        ...f,
        platform: data.platform ?? f.platform,
        appName: data.appName ?? "",
        detectedCategory: data.category ?? "",
      }));
    } catch (e: any) {
      setError(e.message ?? "Không detect được metadata từ store URL");
      // Clear detected values on error
      setForm((f) => ({ ...f, appName: "", detectedCategory: "" }));
    } finally {
      setDetectingStore(false);
    }
  };

  const validationErrors: string[] = [];
  if (selectedTargets.length === 0) validationErrors.push("Chọn ít nhất 1 nền tảng để tạo app");
  if (isLiveFlow && !form.appUrl.trim()) validationErrors.push("App URL bắt buộc cho luồng Live");
  if (!isLiveFlow && form.appName.trim().length < 2) validationErrors.push("App Name tối thiểu 2 ký tự cho luồng Not Live");

  // Pangle: live thì auto-detect category, not-live thì bắt buộc chọn manual category
  if (form.targets.pangle && !isLiveFlow && !form.pangleCategoryCode.trim()) {
    validationErrors.push("Pangle Not Live yêu cầu chọn Category thủ công");
  }

  // Mintegral: not-live cần manual identifier theo platform
  if (form.targets.minter && !isLiveFlow && !form.mintegralManualIdentifier.trim()) {
    validationErrors.push(
      form.platform === "ANDROID"
        ? "Mintegral Not Live (Android) yêu cầu Package Name"
        : "Mintegral Not Live (iOS) yêu cầu App ID on Store hoặc Bundle ID"
    );
  }

  // Liftoff not-live: bundleId chỉ là optional nên không bắt buộc

  const canSubmit = validationErrors.length === 0 && confirmed && !loading;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setLoading(true); setError(null); setDuplicateId(null);
    try {
      const res = await fetch("/api/apps", {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({
          appStatus: form.appStatus,
          appUrl: form.appUrl.trim() || undefined,
          appName: form.appName.trim() || undefined,
          platform: form.platform,
          targets: {
            admob: form.targets.admob,
            liftoff: form.targets.liftoff,
            minter: form.targets.minter,
            pangle: form.targets.pangle,
          },
          liftoffBundleId: form.liftoffBundleId.trim() || undefined,
          mintegralAndroidStore: form.mintegralAndroidStore,
          mintegralManualIdentifier: form.mintegralManualIdentifier.trim() || undefined,
          pangleCategoryCode: form.pangleCategoryCode ? Number(form.pangleCategoryCode) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409 && data.duplicateId) setDuplicateId(data.duplicateId);
        throw new Error(data.error ?? "Tạo app thất bại");
      }
      setResult(data);
    } catch(e: any) {
      setError(e.message);
    } finally { setLoading(false); }
  };

  const reset = () => {
    setForm({
      appStatus: "live",
      appUrl: "",
      appName: "",
      detectedCategory: "",
      platform: "ANDROID",
      targets: { admob: true, liftoff: false, minter: false, pangle: false },
      mintegralAndroidStore: "google_play",
      mintegralManualIdentifier: "",
      pangleCategoryCode: "",
      liftoffBundleId: "",
    });
    setConfirmed(false);
    setResult(null);
    setError(null);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (activeTab === "list" && !syncData && !syncLoading) loadSync(); }, [activeTab]);

  const loadSync = async () => {
    setSyncLoading(true); setSyncError(null);
    try {
      const res = await fetch("/api/apps/admob-sync");
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Đồng bộ thất bại");
      setSyncData(d);
    } catch (e: any) {
      setSyncError(e.message);
    } finally {
      setSyncLoading(false);
    }
  };

  const handleManageApp = async (app: SyncApp) => {
    setImportingId(app.admobAppId);
    try {
      // If already in DB, navigate directly
      if (app.dbId) {
        router.push(`/dashboard/apps/${app.dbId}`);
        return;
      }
      // Import to DB first
      const res = await fetch("/api/apps/admob-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          admobAppId: app.admobAppId,
          displayName: app.displayName,
          platform: app.platform,
          bundleId: app.bundleId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import thất bại");
      router.push(`/dashboard/apps/${data.app.id}`);
    } catch (e: any) {
      setSyncError(`Import thất bại: ${e.message}`);
    } finally {
      setImportingId(null);
    }
  };

  return (
    <div style={{ fontFamily:FS, background:C.ink, minHeight:"100vh", color:C.text }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=Instrument+Sans:wght@400;500;600&display=swap');
        *{box-sizing:border-box;}
        input::placeholder{color:${C.text3};}
        input:focus{outline:none!important;border-color:${C.accent}!important;}
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        .fu{animation:fadeUp .35s ease;}
        @keyframes spin{to{transform:rotate(360deg)}} .sp{animation:spin .8s linear infinite;display:inline-block;}
      `}</style>

      {/* Topbar */}
      <div style={{ height:52, background:C.ink2, borderBottom:`1px solid ${C.border}`,
        padding:"0 28px", display:"flex", alignItems:"center", justifyContent:"space-between",
        position:"sticky", top:0, zIndex:20 }}>
        <div style={{ fontFamily:FD, fontWeight:700, fontSize:15 }}>
          {activeTab === "list" ? "Danh sách App AdMob" : "Tạo Ứng dụng"}
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          {(["list", "create"] as const).map(t => (
            <button key={t} onClick={() => setActiveTab(t)}
              style={{ padding:"6px 14px", borderRadius:7, cursor:"pointer", fontFamily:FS,
                fontSize:12.5, fontWeight:700,
                border: activeTab === t ? "none" : `1px solid ${C.border2}`,
                background: activeTab === t ? C.accent : "transparent",
                color: activeTab === t ? "#fff" : C.text3 }}>
              {t === "list" ? "📋 Danh sách" : "➕ Tạo App"}
            </button>
          ))}
          {activeTab === "create" && result && <button style={btnG} onClick={reset}>+ Tạo app mới</button>}
        </div>
      </div>

      <div className="fu" style={{ padding:"32px", maxWidth: activeTab === "list" ? 860 : 560 }}>

        {activeTab === "list" ? (
          /* === DANH SÁCH APP ADMOB === */
          <div>
            <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:20, gap:12 }}>
              <div>
                <div style={{ fontFamily:FD, fontSize:16, fontWeight:800, marginBottom:4 }}>
                  {syncData ? `${syncData.total} Apps` : "Danh sách App AdMob"}
                </div>
                {syncData && (
                  <div style={{ fontSize:12, color:C.text3, fontFamily:"'IBM Plex Mono','Courier New',monospace" }}>
                    {syncData.publisherId}
                  </div>
                )}
              </div>
              <button
                style={{ ...btnG, opacity: syncLoading ? 0.6 : 1, cursor: syncLoading ? "not-allowed" : "pointer" }}
                onClick={loadSync} disabled={syncLoading}>
                {syncLoading ? <><span className="sp">↻</span> Đang tải...</> : "🔄 Đồng bộ"}
              </button>
            </div>

            {syncError && (
              <div style={{ padding:"11px 14px", background:C.redDim,
                border:`1px solid rgba(220,38,38,0.3)`, borderRadius:8,
                fontSize:13, color:C.red, marginBottom:16 }}>
                ⚠ {syncError}
              </div>
            )}

            {syncLoading && !syncData && (
              <div style={{ textAlign:"center", padding:56, color:C.text3 }}>
                <span className="sp" style={{ fontSize:28 }}>↻</span>
                <div style={{ marginTop:14, fontSize:13 }}>Đang tải toàn bộ app từ AdMob...</div>
              </div>
            )}

            {!syncLoading && !syncData && !syncError && (
              <div style={{ textAlign:"center", padding:60, color:C.text3 }}>
                <div style={{ fontSize:40, marginBottom:14 }}>📱</div>
                <div style={{ fontSize:15, color:C.text2, fontWeight:700, marginBottom:6 }}>Danh sách App AdMob</div>
                <div style={{ fontSize:13, marginBottom:28, lineHeight:1.8 }}>
                  Đồng bộ để xem toàn bộ app trong tài khoản AdMob đang đăng nhập,<br/>
                  kèm trạng thái kết nối Liftoff · Pangle · Mintegral.
                </div>
                <button style={btnP(false)} onClick={loadSync}>🔄 Đồng bộ từ AdMob</button>
              </div>
            )}

            {syncData && (
              <>
                {Object.entries(syncData.platformErrors).filter(([, v]) => v).map(([k, v]) => (
                  <div key={k} style={{ padding:"9px 12px", background:C.yellowDim,
                    border:`1px solid rgba(217,119,6,0.25)`, borderRadius:8,
                    fontSize:12, color:C.yellow, marginBottom:10 }}>
                    ⚠ <strong style={{ textTransform:"capitalize" }}>{k}</strong>: {v as string}
                  </div>
                ))}

                <div style={{ marginBottom:14 }}>
                  <input style={inp} placeholder="🔍 Tìm theo tên app hoặc bundle ID..."
                    value={syncFilter} onChange={e => setSyncFilter(e.target.value)} />
                </div>

                {(() => {
                  const q = syncFilter.toLowerCase();
                  const filtered = syncData.apps.filter(a =>
                    !q || a.displayName.toLowerCase().includes(q) || (a.bundleId ?? "").toLowerCase().includes(q)
                  );
                  if (filtered.length === 0) return (
                    <div style={{ textAlign:"center", padding:32, color:C.text3, fontSize:13 }}>
                      Không tìm thấy app nào khớp với &ldquo;{syncFilter}&rdquo;.
                    </div>
                  );
                  return (
                    <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", padding:"4px 14px",
                        fontSize:11, fontWeight:700, color:C.text3,
                        textTransform:"uppercase", letterSpacing:"0.08em" }}>
                        <span>App ({filtered.length})</span>
                        <span>Liftoff · Pangle · Mintegral</span>
                      </div>
                      {filtered.map(app => {
                        const connected = [app.liftoff, app.pangle, app.mintegral]
                          .filter(p => p.status === "ok").length;
                        const isImporting = importingId === app.admobAppId;
                        const networksToAdd = 3 - connected;
                        return (
                          <div key={app.admobAppId}
                            style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:10, padding:"12px 16px" }}>
                            <div style={{ display:"flex", alignItems:"flex-start",
                              justifyContent:"space-between", gap:12, flexWrap:"wrap" }}>
                              <div style={{ flex:1, minWidth:180 }}>
                                <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:4, flexWrap:"wrap" }}>
                                  <span style={{ fontSize:13.5, fontWeight:700, color:C.text }}>
                                    {app.platform === "ANDROID" ? "🤖" : "🍎"} {app.displayName}
                                  </span>
                                  {app.dbId && (
                                    <span style={{ fontSize:10, padding:"2px 7px", borderRadius:4,
                                      background:C.accentDim, color:C.accent, fontWeight:700, flexShrink:0 }}>
                                      MO Tool ✓
                                    </span>
                                  )}
                                </div>
                                <div style={{ fontSize:11, color:C.text3,
                                  fontFamily:"'IBM Plex Mono','Courier New',monospace", marginBottom:2 }}>
                                  {app.admobAppId}
                                </div>
                                {app.bundleId && (
                                  <div style={{ fontSize:11, color:C.text2,
                                    fontFamily:"'IBM Plex Mono','Courier New',monospace" }}>
                                    {app.bundleId}
                                  </div>
                                )}
                              </div>
                              <div style={{ display:"flex", gap:6, alignItems:"center", flexWrap:"wrap", flexShrink:0 }}>
                                {([
                                  ["Liftoff", app.liftoff],
                                  ["Pangle", app.pangle],
                                  ["Mintegral", app.mintegral],
                                ] as [string, SyncApp["liftoff"]][]).map(([label, pl]) => {
                                  const ok = pl.status === "ok";
                                  return (
                                    <div key={label}
                                      title={ok ? `ID: ${pl.appId ?? "—"}` : "Chưa tạo / chưa kết nối"}
                                      style={{ padding:"3px 9px", borderRadius:6, fontSize:11.5, fontWeight:700,
                                        cursor:"default",
                                        background: ok ? C.accentDim : "rgba(148,163,184,0.10)",
                                        color: ok ? C.accent : C.text3,
                                        border:`1px solid ${ok ? "rgba(5,150,105,0.3)" : "rgba(203,213,225,0.4)"}` }}>
                                      {ok ? "✓" : "—"} {label}
                                    </div>
                                  );
                                })}
                                <div style={{ padding:"3px 9px", borderRadius:6, fontSize:11.5, fontWeight:700,
                                  background: connected===3 ? C.accentDim : connected>0 ? C.yellowDim : "rgba(220,38,38,0.08)",
                                  color: connected===3 ? C.accent : connected>0 ? C.yellow : C.red,
                                  border:`1px solid ${connected===3 ? "rgba(5,150,105,0.3)" : connected>0 ? "rgba(217,119,6,0.25)" : "rgba(220,38,38,0.2)"}` }}>
                                  {connected}/3
                                </div>
                                <button
                                  onClick={() => handleManageApp(app)}
                                  disabled={isImporting}
                                  title={app.dbId ? "Quản lý app / Add Network" : "Import và quản lý app"}
                                  style={{
                                    padding:"4px 12px", borderRadius:6, border:"none",
                                    background: networksToAdd > 0 ? "rgba(79,240,180,0.15)" : "rgba(148,163,184,0.10)",
                                    color: networksToAdd > 0 ? C.accent : C.text2,
                                    fontSize:11.5, fontWeight:700, cursor: isImporting ? "not-allowed" : "pointer",
                                    fontFamily:FS, opacity: isImporting ? 0.6 : 1, flexShrink:0,
                                    display:"flex", alignItems:"center", gap:4,
                                  }}>
                                  {isImporting ? <><span className="sp">↻</span> ...</> :
                                    networksToAdd > 0
                                      ? `➕ Add Network (${networksToAdd})`
                                      : "⚙ Quản lý"
                                  }
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        ) : !result ? (
          <>
            {/* Form card */}
            <div style={card}>
              <div style={{ padding:"13px 18px", borderBottom:`1px solid ${C.border}`,
                fontFamily:FD, fontWeight:700, fontSize:13 }}>
                Thông tin App
              </div>
              <div style={{ padding:"22px" }}>

                {/* App status */}
                <div style={{ marginBottom:20 }}>
                  <label style={lbl}>App Status <span style={{color:C.red}}>*</span></label>
                  <div style={{ display:"flex", gap:10 }}>
                    {([
                      ["live", "Live (đã có trên store)"],
                      ["not_live", "Not Live (chưa lên store)"],
                    ] as const).map(([key, title]) => {
                      const sel = form.appStatus === key;
                      return (
                        <div key={key}
                          onClick={() => setForm((f) => ({ ...f, appStatus: key }))}
                          style={{ flex:1, display:"flex", alignItems:"center", gap:10,
                            padding:"12px 16px", borderRadius:8, cursor:"pointer", userSelect:"none",
                            border:`1px solid ${sel ? C.accent : C.border2}`,
                            background: sel ? C.accentDim : C.ink2,
                            color: sel ? C.accent : C.text2 }}>
                          <div style={{ width:15, height:15, borderRadius:"50%",
                            border:`1.5px solid ${sel ? C.accent : C.border2}`,
                            display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                            {sel && <div style={{ width:7, height:7, borderRadius:"50%", background:C.accent }}/>}
                          </div>
                          <span style={{ fontWeight:600, fontSize:12.5 }}>{title}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* App name */}
                <div style={{ marginBottom:20 }}>
                  <label style={lbl}>
                    App Name <span style={{color:C.red}}>*</span>
                    {isLiveFlow && form.appName && (
                      <span style={{ fontSize:10, marginLeft:8, padding:"2px 7px", borderRadius:4,
                        background:C.accentDim, color:C.accent, fontWeight:700, textTransform:"none" }}>
                        ✓ Auto-detected
                      </span>
                    )}
                  </label>
                  <input
                    style={{...inp, background: isLiveFlow ? C.ink : C.ink2, cursor: isLiveFlow ? "not-allowed" : "text"}}
                    placeholder={isLiveFlow ? "Ấn Search để detect từ App URL" : "Nhập thủ công App Name"}
                    value={form.appName}
                    onChange={(e)=>setForm(f=>({ ...f, appName: e.target.value }))}
                    readOnly={isLiveFlow}
                  />
                  {isLiveFlow && (
                    <div style={{ fontSize:11, color: form.detectedCategory ? C.accent : C.text3, marginTop:6 }}>
                      {form.detectedCategory ? `✓ Category: ${form.detectedCategory}` : "⚠ Chưa detect từ App URL"}
                    </div>
                  )}
                </div>

                {/* Platform */}
                <div style={{ marginBottom:20 }}>
                  <label style={lbl}>Mobile Platform <span style={{color:C.red}}>*</span></label>
                  <div style={{ display:"flex", gap:10 }}>
                    {(["ANDROID","IOS"] as const).map(p => {
                      const sel = form.platform===p;
                      return (
                        <div key={p} onClick={()=>setForm(f=>({...f,platform:p}))}
                          style={{ flex:1, display:"flex", alignItems:"center", gap:10,
                            padding:"12px 16px", borderRadius:8, cursor:"pointer", userSelect:"none",
                            border:`1px solid ${sel ? C.accent : C.border2}`,
                            background: sel ? C.accentDim : C.ink2,
                            color: sel ? C.accent : C.text2 }}>
                          <div style={{ width:15, height:15, borderRadius:"50%",
                            border:`1.5px solid ${sel ? C.accent : C.border2}`,
                            display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                            {sel && <div style={{ width:7, height:7, borderRadius:"50%", background:C.accent }}/>}
                          </div>
                          <span style={{ fontSize:14 }}>{p==="ANDROID" ? "🤖" : "🍎"}</span>
                          <span style={{ fontWeight:600, fontSize:13 }}>{p}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Store URL + detect */}
                {isLiveFlow && (
                  <div style={{ marginBottom:20, padding:"12px", borderRadius:8, border:`1px solid ${C.border}`, background:C.ink2 }}>
                    <div style={{ fontSize:12, color:C.text2, fontWeight:700, marginBottom:10 }}>Live app metadata</div>
                    <label style={lbl}>App URL <span style={{color:C.red}}>*</span></label>
                    <div style={{ display:"flex", gap:8 }}>
                      <input
                        style={inp}
                        placeholder="https://play.google.com/... hoặc https://apps.apple.com/..."
                        value={form.appUrl}
                        onChange={(e)=>{
                          const newUrl = e.target.value;
                          // Clear previous detection results when URL changes
                          setForm(f=>({ ...f, appUrl: newUrl, appName: "", detectedCategory: "" }));
                          setError(null);
                        }}
                      />
                      <button
                        type="button"
                        onClick={handleDetectFromUrl}
                        disabled={detectingStore || !form.appUrl.trim()}
                        style={{ ...btnG, whiteSpace:"nowrap", opacity: detectingStore || !form.appUrl.trim() ? 0.6 : 1 }}>
                        {detectingStore ? "↻ Đang detect" : "Search"}
                      </button>
                    </div>
                    <div style={{ fontSize:11, color:C.text3, marginTop:8, lineHeight:1.5 }}>
                      URL dùng để auto-detect App Name và Category.
                    </div>
                    {error && (
                      <div style={{ padding:"8px 10px", background:"rgba(220,38,38,0.1)", border:`1px solid rgba(220,38,38,0.3)`,
                        borderRadius:6, fontSize:11.5, color:C.red, marginTop:10 }}>
                        ⚠ {error}
                      </div>
                    )}
                  </div>
                )}

                {/* Targets */}
                <div style={{ marginBottom:20 }}>
                  <label style={lbl}>Nền tảng cần tạo app <span style={{color:C.red}}>*</span></label>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                    {([
                      ["admob", "AdMob"],
                      ["liftoff", "Liftoff"],
                      ["minter", "Minter (Mintegral)"],
                      ["pangle", "Pangle"],
                    ] as Array<[TargetKey, string]>).map(([key, title]) => {
                      const checked = form.targets[key];
                      return (
                        <div key={key} onClick={()=>setForm(f=>({ ...f, targets: { ...f.targets, [key]: !checked } }))}
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

                {form.targets.liftoff && (
                  <div style={{ marginBottom:20, padding:"12px", borderRadius:8, border:`1px solid ${C.border}`, background:C.ink2 }}>
                    <div style={{ fontSize:12, color:C.text2, fontWeight:700, marginBottom:10 }}>Liftoff fields</div>
                    <label style={lbl}>Bundle ID (tuỳ chọn cho Not Live)</label>
                    <input
                      style={inp}
                      placeholder={form.platform === "ANDROID" ? "com.company.game" : "id123456789 hoặc com.company.ios"}
                      value={form.liftoffBundleId}
                      onChange={(e)=>setForm(f=>({ ...f, liftoffBundleId: e.target.value }))}
                    />
                  </div>
                )}

                {form.targets.minter && (
                  <div style={{ marginBottom:20, padding:"12px", borderRadius:8, border:`1px solid ${C.border}`, background:C.ink2 }}>
                    <div style={{ fontSize:12, color:C.text2, fontWeight:700, marginBottom:10 }}>Mintegral fields</div>
                    {isLiveFlow ? (
                      <>
                        {form.platform === "ANDROID" && (
                          <div style={{ marginBottom:10 }}>
                            <label style={{ ...lbl, marginBottom:8 }}>Live in Store</label>
                            <div style={{ display:"flex", gap:10 }}>
                              {([
                                ["google_play", "Google Play"],
                                ["amazon", "Amazon Store"],
                              ] as const).map(([k, title]) => {
                                const selected = form.mintegralAndroidStore === k;
                                return (
                                  <div key={k}
                                    onClick={() => setForm((f) => ({ ...f, mintegralAndroidStore: k }))}
                                    style={{
                                      padding:"8px 12px",
                                      borderRadius:8,
                                      border:`1px solid ${selected ? C.accent : C.border2}`,
                                      background:selected ? C.accentDim : C.ink,
                                      color:selected ? C.accent : C.text2,
                                      cursor:"pointer",
                                      fontSize:12,
                                      fontWeight:600,
                                    }}>{title}</div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                        <div style={{ fontSize:11, color:C.text3, lineHeight:1.6 }}>
                          Live flow: Mintegral sẽ dùng App URL để xử lý dữ liệu app.
                        </div>
                      </>
                    ) : (
                      <div>
                        <label style={lbl}>
                          {form.platform === "ANDROID" ? "Package Name" : "App ID on App Store / Bundle ID"}
                          <span style={{color:C.red}}> *</span>
                        </label>
                        <input
                          style={inp}
                          placeholder={form.platform === "ANDROID" ? "com.company.game" : "id123456789 hoặc com.company.ios"}
                          value={form.mintegralManualIdentifier}
                          onChange={(e)=>setForm(f=>({ ...f, mintegralManualIdentifier: e.target.value }))}
                        />
                      </div>
                    )}
                  </div>
                )}

                {form.targets.pangle && (
                  <div style={{ marginBottom:20, padding:"12px", borderRadius:8, border:`1px solid ${C.border}`, background:C.ink2 }}>
                    <div style={{ fontSize:12, color:C.text2, fontWeight:700, marginBottom:10 }}>Pangle fields</div>
                    {isLiveFlow ? (
                      <div style={{ fontSize:11.5, color:C.text3, lineHeight:1.6 }}>
                        Live flow: category sẽ tự detect theo App URL.
                        <br />
                        Category detect hiện tại: <strong style={{ color:C.text2 }}>{form.detectedCategory || "(chưa detect)"}</strong>
                      </div>
                    ) : (
                      <div style={{ marginBottom:12 }}>
                        <label style={lbl}>Category <span style={{color:C.red}}>*</span></label>
                        <select
                          style={inp}
                          value={form.pangleCategoryCode}
                          onChange={(e)=>setForm(f=>({ ...f, pangleCategoryCode: e.target.value }))}
                        >
                          <option value="" disabled>
                            {pangleCategoryLoading ? "Đang tải category..." : "Chọn category"}
                          </option>
                          {pangleCategories.map((cat) => (
                            <option key={cat.code} value={String(cat.code)}>
                              {cat.label} ({cat.code})
                            </option>
                          ))}
                        </select>
                        <div style={{ fontSize:11, color:C.text3, marginTop:6 }}>
                          Nguồn category: {pangleCategorySource === "crawl" ? "crawl từ Pangle website" : "fallback nội bộ"}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Info box */}
                <div style={{ padding:"11px 14px", background:C.ink2, border:`1px solid ${C.border}`,
                  borderRadius:8, marginBottom:20, fontSize:12, color:C.text3, lineHeight:1.6 }}>
                  Hệ thống sẽ tạo app trên các nền tảng đã chọn. Mỗi nền tảng sẽ dùng bộ field bắt buộc riêng.
                </div>

                {/* Confirm */}
                <div onClick={()=>setConfirmed(c=>!c)}
                  style={{ display:"flex", alignItems:"center", gap:10,
                    cursor:"pointer", userSelect:"none", marginBottom:22 }}>
                  <div style={{ width:17, height:17, borderRadius:4, flexShrink:0,
                    border:`1.5px solid ${confirmed ? C.accent : C.border2}`,
                    background: confirmed ? C.accent : "transparent",
                    display:"flex", alignItems:"center", justifyContent:"center", transition:"all .12s" }}>
                    {confirmed && <svg width={10} height={10} fill="none" stroke={C.ink} strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>}
                  </div>
                  <span style={{ fontSize:13, color:C.text2 }}>
                    Tôi xác nhận muốn tạo app <strong style={{color:C.text}}>"{form.appName || "..."}"</strong> ({isLiveFlow ? "Live" : "Not Live"}) trên: {selectedTargets.join(", ") || "..."}.
                  </span>
                </div>

                {!!validationErrors.length && (
                  <div style={{ padding:"11px 14px", background:C.yellowDim, border:`1px solid rgba(255,216,77,0.35)`,
                    borderRadius:8, fontSize:12.5, color:C.yellow, marginBottom:16, lineHeight:1.55 }}>
                    {validationErrors.map((v) => <div key={v}>• {v}</div>)}
                  </div>
                )}

                {error && (
                  <div style={{ padding:"11px 14px", background:C.redDim, border:`1px solid rgba(255,95,95,0.3)`,
                    borderRadius:8, fontSize:13, color:C.red, marginBottom:16 }}>
                    ⚠ {error}
                    {duplicateId && (
                      <div style={{ marginTop:6 }}>
                        <a href={`/dashboard/apps/${duplicateId}`}
                          style={{ color:C.accent, fontWeight:700, textDecoration:"underline", fontSize:12.5 }}>
                          → Xem app đã tồn tại
                        </a>
                      </div>
                    )}
                  </div>
                )}

                <button style={btnP(!canSubmit)} disabled={!canSubmit} onClick={handleSubmit}>
                  {loading ? <><span className="sp">↻</span> Đang tạo...</> : "Tạo App trên các nền tảng đã chọn →"}
                </button>
              </div>
            </div>
          </>
        ) : (
          /* Result */
          <div className="fu">
            <div style={{ padding:"11px 14px", background:"rgba(79,240,180,0.12)",
              border:"1px solid rgba(79,240,180,0.35)", borderRadius:8,
              color:C.accent, fontSize:13, marginBottom:20 }}>
              ✓ App đã được tạo thành công!
            </div>
            <div style={card}>
              <div style={{ padding:"13px 18px", borderBottom:`1px solid ${C.border}`,
                fontFamily:FD, fontWeight:700, fontSize:13 }}>
                Kết quả
              </div>
              <div style={{ padding:"20px" }}>
                {[
                  ["Tên App", result.displayName],
                  ["Mobile Platform", result.mobilePlatform],
                  ["Nền tảng đã chọn", result.createdTargets.join(", ")],
                ].map(([k,v]) => (
                  <div key={k} style={{ display:"flex", justifyContent:"space-between",
                    padding:"10px 0", borderBottom:`1px solid ${C.border}`, gap:12 }}>
                    <span style={{ fontSize:12, color:C.text3, fontWeight:600,
                      textTransform:"uppercase", letterSpacing:"0.07em", flexShrink:0 }}>{k}</span>
                    <span style={{ fontSize:12.5, color:C.text, fontFamily:"'IBM Plex Mono','Courier New',monospace",
                      wordBreak:"break-all", textAlign:"right" }}>{v}</span>
                  </div>
                ))}

                {(Object.keys(result.results) as TargetKey[]).map((target) => {
                  const item = result.results[target];
                  if (!item) return null;
                  return (
                    <div key={target} style={{ marginTop:12, padding:"10px", border:`1px solid ${C.border}`, borderRadius:8, background:C.ink2 }}>
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6 }}>
                        <span style={{ fontSize:12, color:C.text2, textTransform:"uppercase", letterSpacing:"0.06em", fontWeight:700 }}>{target}</span>
                        <span style={{ fontSize:12, color:item.ok ? C.accent : C.red, fontWeight:700 }}>{item.ok ? "SUCCESS" : "FAILED"}</span>
                      </div>
                      <div style={{ fontSize:12, color:item.ok ? C.text2 : C.red, wordBreak:"break-word" }}>
                        {item.ok ? JSON.stringify(item.data) : item.error}
                      </div>
                      {!!item.warning && (
                        <div style={{ marginTop:6, fontSize:11.5, color:C.yellow, lineHeight:1.5 }}>
                          ⚠ {item.warning}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ display:"flex", gap:10 }}>
              <button style={{ ...btnP(false), flex:1 }}
                onClick={()=>router.push(`/dashboard/adunits`)}>
                → Sang tạo Ad Units
              </button>
              <button style={btnG} onClick={reset}>+ Tạo app khác</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
