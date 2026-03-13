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
    displayName: "",
    platform: "ANDROID" as MobilePlatform,
    targets: {
      admob: true,
      liftoff: false,
      minter: false,
      pangle: false,
    } as Record<TargetKey, boolean>,
    minterPackageName: "",
    minterIsLiveInStore: false,
    minterStoreUrl: "",
    pangleCategoryCode: "",
    pangleStatus: "test" as "test" | "live",
    pangleDownloadUrl: "",
    liftoffBundleId: "",
  });
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CreateAppResult | null>(null);
  const [error, setError] = useState<string|null>(null);
  const [pangleCategories, setPangleCategories] = useState<PangleCategoryOption[]>([]);
  const [pangleCategorySource, setPangleCategorySource] = useState<"crawl" | "fallback" | null>(null);
  const [pangleCategoryLoading, setPangleCategoryLoading] = useState(false);

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

  const validationErrors: string[] = [];
  if (form.displayName.trim().length < 3) validationErrors.push("Tên app tối thiểu 3 ký tự");
  if (selectedTargets.length === 0) validationErrors.push("Chọn ít nhất 1 nền tảng để tạo app");
  if (form.targets.minter && !form.minterPackageName.trim())
    validationErrors.push("Mintegral yêu cầu Package Name");
  if (form.targets.minter && form.minterIsLiveInStore && !form.minterStoreUrl.trim())
    validationErrors.push("Mintegral live app yêu cầu Store URL");
  if (form.targets.pangle && !form.pangleCategoryCode.trim())
    validationErrors.push("Pangle yêu cầu App Category Code");
  if (form.targets.pangle && form.pangleStatus === "live" && !form.pangleDownloadUrl.trim())
    validationErrors.push("Pangle live app yêu cầu Download URL");

  const canSubmit = validationErrors.length === 0 && confirmed && !loading;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/apps", {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({
          displayName: form.displayName.trim(),
          platform: form.platform,
          targets: {
            admob: { enabled: form.targets.admob },
            liftoff: { enabled: form.targets.liftoff, bundleId: form.liftoffBundleId.trim() || undefined },
            minter: {
              enabled: form.targets.minter,
              packageName: form.minterPackageName.trim(),
              isLiveInStore: form.minterIsLiveInStore,
              storeUrl: form.minterStoreUrl.trim() || undefined,
            },
            pangle: {
              enabled: form.targets.pangle,
              categoryCode: form.pangleCategoryCode ? Number(form.pangleCategoryCode) : undefined,
              status: form.pangleStatus,
              downloadUrl: form.pangleDownloadUrl.trim() || undefined,
            },
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Tạo app thất bại");
      setResult(data);
    } catch(e: any) {
      setError(e.message);
    } finally { setLoading(false); }
  };

  const reset = () => {
    setForm({
      displayName: "",
      platform: "ANDROID",
      targets: { admob: true, liftoff: false, minter: false, pangle: false },
      minterPackageName: "",
      minterIsLiveInStore: false,
      minterStoreUrl: "",
      pangleCategoryCode: "",
      pangleStatus: "test",
      pangleDownloadUrl: "",
      liftoffBundleId: "",
    });
    setConfirmed(false);
    setResult(null);
    setError(null);
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
        <div style={{ fontFamily:FD, fontWeight:700, fontSize:15 }}>Tạo Ứng dụng</div>
        {result && <button style={btnG} onClick={reset}>+ Tạo app mới</button>}
      </div>

      <div className="fu" style={{ padding:"32px", maxWidth:560 }}>

        {!result ? (
          <>
            {/* Form card */}
            <div style={card}>
              <div style={{ padding:"13px 18px", borderBottom:`1px solid ${C.border}`,
                fontFamily:FD, fontWeight:700, fontSize:13 }}>
                Thông tin App
              </div>
              <div style={{ padding:"22px" }}>

                {/* Display Name */}
                <div style={{ marginBottom:20 }}>
                  <label style={lbl}>Tên hiển thị <span style={{color:C.red}}>*</span></label>
                  <input style={inp} placeholder="VD: My Casual Game, Hyper Runner..."
                    value={form.displayName}
                    onChange={e=>setForm(f=>({...f,displayName:e.target.value}))}/>
                  <div style={{ fontSize:11, color:C.text3, marginTop:5 }}>
                    Tên này chỉ hiển thị trong AdMob Console, không phải tên store.
                  </div>
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
                    <label style={lbl}>Bundle ID (tuỳ chọn)</label>
                    <input
                      style={inp}
                      placeholder="com.company.game"
                      value={form.liftoffBundleId}
                      onChange={(e)=>setForm(f=>({ ...f, liftoffBundleId: e.target.value }))}
                    />
                  </div>
                )}

                {form.targets.minter && (
                  <div style={{ marginBottom:20, padding:"12px", borderRadius:8, border:`1px solid ${C.border}`, background:C.ink2 }}>
                    <div style={{ fontSize:12, color:C.text2, fontWeight:700, marginBottom:10 }}>Minter fields bắt buộc</div>
                    <div style={{ marginBottom:12 }}>
                      <label style={lbl}>Package Name <span style={{color:C.red}}>*</span></label>
                      <input
                        style={inp}
                        placeholder="com.company.game"
                        value={form.minterPackageName}
                        onChange={(e)=>setForm(f=>({ ...f, minterPackageName: e.target.value }))}
                      />
                    </div>
                    <div style={{ marginBottom:10 }}>
                      <label style={{ ...lbl, marginBottom:8 }}>Live in store?</label>
                      <div style={{ display:"flex", gap:10 }}>
                        {["No", "Yes"].map((v) => {
                          const yes = v === "Yes";
                          const selected = form.minterIsLiveInStore === yes;
                          return (
                            <div key={v} onClick={()=>setForm(f=>({ ...f, minterIsLiveInStore: yes }))}
                              style={{
                                padding:"8px 12px",
                                borderRadius:8,
                                border:`1px solid ${selected ? C.accent : C.border2}`,
                                background:selected ? C.accentDim : C.ink,
                                color:selected ? C.accent : C.text2,
                                cursor:"pointer",
                                fontSize:12,
                                fontWeight:600,
                              }}>{v}</div>
                          );
                        })}
                      </div>
                    </div>
                    {form.minterIsLiveInStore && (
                      <div>
                        <label style={lbl}>Store URL <span style={{color:C.red}}>*</span></label>
                        <input
                          style={inp}
                          placeholder="https://play.google.com/store/apps/details?id=..."
                          value={form.minterStoreUrl}
                          onChange={(e)=>setForm(f=>({ ...f, minterStoreUrl: e.target.value }))}
                        />
                      </div>
                    )}
                  </div>
                )}

                {form.targets.pangle && (
                  <div style={{ marginBottom:20, padding:"12px", borderRadius:8, border:`1px solid ${C.border}`, background:C.ink2 }}>
                    <div style={{ fontSize:12, color:C.text2, fontWeight:700, marginBottom:10 }}>Pangle fields bắt buộc</div>
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
                    <div style={{ marginBottom:10 }}>
                      <label style={{ ...lbl, marginBottom:8 }}>Status</label>
                      <div style={{ display:"flex", gap:10 }}>
                        {(["test", "live"] as const).map((s) => {
                          const selected = form.pangleStatus === s;
                          return (
                            <div key={s} onClick={()=>setForm(f=>({ ...f, pangleStatus: s }))}
                              style={{
                                padding:"8px 12px",
                                borderRadius:8,
                                border:`1px solid ${selected ? C.accent : C.border2}`,
                                background:selected ? C.accentDim : C.ink,
                                color:selected ? C.accent : C.text2,
                                cursor:"pointer",
                                fontSize:12,
                                fontWeight:600,
                                textTransform:"uppercase",
                              }}>{s}</div>
                          );
                        })}
                      </div>
                    </div>
                    {form.pangleStatus === "live" && (
                      <div>
                        <label style={lbl}>Download URL <span style={{color:C.red}}>*</span></label>
                        <input
                          style={inp}
                          placeholder="https://apps.apple.com/... hoặc https://play.google.com/..."
                          value={form.pangleDownloadUrl}
                          onChange={(e)=>setForm(f=>({ ...f, pangleDownloadUrl: e.target.value }))}
                        />
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
                    Tôi xác nhận muốn tạo app <strong style={{color:C.text}}>"{form.displayName || "..."}"</strong> trên: {selectedTargets.join(", ") || "..."}.
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
