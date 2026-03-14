"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type PlatformKey = "admob" | "pangle" | "liftoff" | "mintegral";

type AppRecord = {
  id: string; name: string; platform: string; isLive: boolean;
  storeUrl: string | null; bundleId: string | null;
  admobPublisherId: string | null; admobAppId: string | null; admobStatus: string; admobError: string | null;
  pangleAppId: string | null; pangleCategoryCode: number | null; pangleStatus: string; pangleError: string | null;
  liftoffAppId: string | null; liftoffStatus: string; liftoffError: string | null;
  liftoffCategory: string | null; liftoffCoppa: boolean;
  mintegralAppId: string | null; mintegralAppKey: string | null; mintegralStatus: string; mintegralError: string | null;
  mintegralAndroidStore: string | null; mintegralStoreName: string | null; mintegralPreviewLink: string | null;
  createdAt: string; updatedAt: string;
};

type AddFormState = {
  pangleCategoryCode: string;
  liftoffCategory: string;
  liftoffCoppa: boolean;
  mintegralAndroidStore: string;
  mintegralStoreName: string;
  mintegralPreviewLink: string;
};

const LIFTOFF_CATEGORIES = [
  "Games","Books & Reference","Business","Card","Comics","Communication",
  "Dating","Education","Entertainment","Finance","Food & Drink",
  "Health & Fitness","Lifestyle","Medical","Music","Navigation","News",
  "Personalization","Photo & Video","Productivity","Racing","Shopping",
  "Simulation","Social","Sports","Travel","Trivia","Utilities","Weather","Word",
];

const C = {
  ink:"#0A0C10", ink2:"#131720", panel:"#161B26", border:"#1F2737", border2:"#27313F",
  text:"#E8EBF0", text2:"#8B93A0", text3:"#4E5768",
  accent:"#4FF0B4", accentDim:"rgba(79,240,180,0.12)",
  yellow:"#FFD84D", yellowDim:"rgba(255,216,77,0.12)",
  red:"#FF5F5F", redDim:"rgba(255,95,95,0.12)",
  blue:"#4D9EFF", blueDim:"rgba(77,158,255,0.12)",
};
const FD = "Arial, sans-serif";
const FS = "Arial, sans-serif";
const FM = "Arial, sans-serif";

const card: React.CSSProperties = {
  background:C.panel, border:`1px solid ${C.border}`, borderRadius:12, overflow:"hidden", marginBottom:16,
};
const inp: React.CSSProperties = {
  width:"100%", background:C.ink2, border:`1px solid ${C.border2}`,
  borderRadius:8, padding:"10px 13px", fontSize:13.5, color:C.text,
  fontFamily:FS, outline:"none", boxSizing:"border-box",
};
const sel: React.CSSProperties = { ...inp };
const lbl: React.CSSProperties = {
  display:"block", fontSize:11, fontWeight:600, color:C.text3,
  textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:6,
};

export default function AppDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [app, setApp] = useState<AppRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<PlatformKey | null>(null);
  const [mintegralKeyInput, setMintegralKeyInput] = useState("");
  const [savingKey, setSavingKey] = useState(false);
  const [keyMsg, setKeyMsg] = useState<string | null>(null);

  // Add-platform state
  const [expandedAdd, setExpandedAdd] = useState<PlatformKey | null>(null);
  const [addForm, setAddForm] = useState<AddFormState>({
    pangleCategoryCode: "",
    liftoffCategory: "",
    liftoffCoppa: true,
    mintegralAndroidStore: "",
    mintegralStoreName: "",
    mintegralPreviewLink: "",
  });
  const [adding, setAdding] = useState(false);
  const [addMsg, setAddMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pangleCategories, setPangleCategories] = useState<{ code: number; label: string }[]>([]);
  const [pangleCatLoading, setPangleCatLoading] = useState(false);

  const fetchApp = async () => {
    try {
      const res = await fetch(`/api/apps/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setApp(data.app);
      setMintegralKeyInput(data.app.mintegralAppKey ?? "");
      // Pre-populate add form from stored fields
      setAddForm(prev => ({
        ...prev,
        pangleCategoryCode: data.app.pangleCategoryCode ? String(data.app.pangleCategoryCode) : "",
        liftoffCategory: data.app.liftoffCategory ?? "",
        liftoffCoppa: data.app.liftoffCoppa ?? true,
        mintegralAndroidStore: data.app.mintegralAndroidStore ?? "",
        mintegralStoreName: data.app.mintegralStoreName ?? "",
        mintegralPreviewLink: data.app.mintegralPreviewLink ?? "",
      }));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchApp(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadPangleCategories = async () => {
    if (pangleCategories.length > 0) return;
    setPangleCatLoading(true);
    try {
      const res = await fetch("/api/apps/pangle-categories");
      const data = await res.json();
      if (data.categories) setPangleCategories(data.categories);
    } catch { /* ignore */ }
    finally { setPangleCatLoading(false); }
  };

  const handleRetry = async (platform: PlatformKey) => {
    setRetrying(platform);
    try {
      const res = await fetch(`/api/apps/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retryPlatform: platform }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setApp(data.app);
    } catch {
      await fetchApp();
    } finally {
      setRetrying(null);
    }
  };

  const handleSaveKey = async () => {
    if (!mintegralKeyInput.trim()) return;
    setSavingKey(true);
    setKeyMsg(null);
    try {
      const res = await fetch(`/api/apps/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mintegralAppKey: mintegralKeyInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setApp(data.app);
      setKeyMsg("Da luu App Key thanh cong!");
    } catch (e: unknown) {
      setKeyMsg(e instanceof Error ? e.message : "Error");
    } finally {
      setSavingKey(false);
    }
  };

  const handleAddPlatform = async (platform: PlatformKey) => {
    setAdding(true);
    setAddMsg(null);
    const body: Record<string, unknown> = { addPlatform: platform };
    if (platform === "pangle" && addForm.pangleCategoryCode) {
      body.pangleCategoryCode = Number(addForm.pangleCategoryCode);
    }
    if (platform === "liftoff") {
      body.liftoffCategory = addForm.liftoffCategory;
      body.liftoffCoppa = addForm.liftoffCoppa;
    }
    if (platform === "mintegral" && app?.platform === "ANDROID") {
      body.mintegralAndroidStore = addForm.mintegralAndroidStore;
      if (addForm.mintegralStoreName) body.mintegralStoreName = addForm.mintegralStoreName;
      if (addForm.mintegralPreviewLink) body.mintegralPreviewLink = addForm.mintegralPreviewLink;
    }
    try {
      const res = await fetch(`/api/apps/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setApp(data.app);
      setExpandedAdd(null);
      setAddMsg({ ok: true, text: `Da tao app tren ${platform} thanh cong!` });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error";
      setAddMsg({ ok: false, text: `Error: ${msg}` });
      await fetchApp();
    } finally {
      setAdding(false);
    }
  };

  const upd = (k: keyof AddFormState, v: string | boolean) =>
    setAddForm(prev => ({ ...prev, [k]: v }));

  const statusBadge = (s: string) => {
    const map: Record<string, { color: string; icon: string; label: string }> = {
      ok: { color: C.accent, icon: "OK", label: "OK" },
      verifying: { color: C.yellow, icon: "...", label: "VERIFYING" },
      error: { color: C.red, icon: "ERR", label: "ERROR" },
      none: { color: C.text3, icon: "-", label: "NOT CREATED" },
    };
    const { color, icon, label } = map[s] ?? map.none;
    return <span style={{ color, fontWeight:700, fontSize:11, letterSpacing:"0.04em" }}>{icon} {label}</span>;
  };

  if (loading) return (
    <div style={{ fontFamily:FS, color:C.text, padding:40, textAlign:"center" }}>
      <span style={{ fontSize:22, display:"inline-block", animation:"spin .8s linear infinite" }}>...</span>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (error || !app) return (
    <div style={{ fontFamily:FS, color:C.red, padding:40 }}>Error: {error ?? "App not found"}</div>
  );

  const platforms: Array<{
    key: PlatformKey; name: string; appId: string | null; status: string; error: string | null;
  }> = [
    { key:"admob",     name:"AdMob",     appId:app.admobAppId,     status:app.admobStatus,     error:app.admobError },
    { key:"pangle",    name:"Pangle",    appId:app.pangleAppId,    status:app.pangleStatus,    error:app.pangleError },
    { key:"liftoff",   name:"Liftoff",   appId:app.liftoffAppId,   status:app.liftoffStatus,   error:app.liftoffError },
    { key:"mintegral", name:"Mintegral", appId:app.mintegralAppId, status:app.mintegralStatus, error:app.mintegralError },
  ];

  // Check if add-form is ready to submit for a given platform
  const canAdd = (key: PlatformKey): boolean => {
    if (key === "admob") return !!app.admobPublisherId;
    if (key === "pangle") return !!addForm.pangleCategoryCode;
    if (key === "liftoff") return !!addForm.liftoffCategory;
    if (key === "mintegral") {
      if (app.platform === "IOS") return true;
      if (!addForm.mintegralAndroidStore) return false;
      if (addForm.mintegralAndroidStore === "other_store") {
        return !!addForm.mintegralStoreName.trim() && !!addForm.mintegralPreviewLink.trim();
      }
      return true;
    }
    return false;
  };

  // Info row component for "already have" checklist
  const infoRow = (label: string, value: string | null, ok: boolean) => (
    <div style={{ display:"flex", gap:8, alignItems:"baseline", marginBottom:4, fontSize:12 }}>
      <span style={{ color: ok ? C.accent : C.text3 }}>{ok ? "OK" : "-"}</span>
      <span style={{ color:C.text3 }}>{label}:</span>
      <span style={{ color: ok ? C.text2 : C.text3, fontFamily:FM, fontSize:11, wordBreak:"break-all" }}>
        {value ?? "-"}
      </span>
    </div>
  );

  const renderAddForm = (key: PlatformKey) => {
    const isAndroid = app.platform === "ANDROID";
    return (
      <div style={{ marginTop:10, padding:14, borderRadius:8, border:`1px solid ${C.blue}`,
        background:"rgba(77,158,255,0.04)" }}>

        {/* Already-have info */}
        <div style={{ marginBottom:12, padding:"10px 12px", borderRadius:6,
          background:C.ink, border:`1px solid ${C.border}` }}>
          <div style={{ fontSize:10, fontWeight:700, color:C.text3, textTransform:"uppercase",
            letterSpacing:"0.08em", marginBottom:8 }}>Thong tin da co</div>
          {infoRow("Ten app", app.name, true)}
          {infoRow("Platform", app.platform, true)}
          {infoRow("Che do", app.isLive ? "Live" : "Test", true)}
          {app.isLive && infoRow("Store URL", app.storeUrl, !!app.storeUrl)}
          {infoRow("Bundle ID", app.bundleId, !!app.bundleId)}
        </div>

        {/* Platform-specific missing fields */}
        {key === "admob" && (
          app.admobPublisherId
            ? <div style={{ fontSize:12, color:C.accent, marginBottom:12 }}>
                Du thong tin. Publisher: <span style={{ fontFamily:FM }}>{app.admobPublisherId}</span>
              </div>
            : <div style={{ fontSize:12, color:C.red, marginBottom:12 }}>
                App nay khong co AdMob Publisher ID - khong the them vao AdMob.
              </div>
        )}

        {key === "pangle" && (
          <div style={{ marginBottom:12 }}>
            <label style={lbl}>Pangle Category <span style={{ color:C.red }}>*</span></label>
            <select style={sel} value={addForm.pangleCategoryCode}
              onChange={e => upd("pangleCategoryCode", e.target.value)}
              onClick={loadPangleCategories}>
              <option value="">{pangleCatLoading ? "Dang tai..." : "- Chon category -"}</option>
              {pangleCategories.map(c => (
                <option key={c.code} value={c.code}>{c.label}</option>
              ))}
            </select>
          </div>
        )}

        {key === "liftoff" && (
          <>
            <div style={{ marginBottom:10 }}>
              <label style={lbl}>App Category <span style={{ color:C.red }}>*</span></label>
              <select style={sel} value={addForm.liftoffCategory}
                onChange={e => upd("liftoffCategory", e.target.value)}>
                <option value="">- Chon category -</option>
                {LIFTOFF_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
              <input type="checkbox" id="liftoff-coppa-add" checked={addForm.liftoffCoppa}
                onChange={e => upd("liftoffCoppa", e.target.checked)}
                style={{ accentColor:C.accent, width:15, height:15 }} />
              <label htmlFor="liftoff-coppa-add"
                style={{ fontSize:12, color:C.text2, cursor:"pointer" }}>
                COPPA compliant (child-directed)
              </label>
            </div>
          </>
        )}

        {key === "mintegral" && isAndroid && (
          <>
            <div style={{ marginBottom:10 }}>
              <label style={lbl}>Android Store <span style={{ color:C.red }}>*</span></label>
              <select style={sel} value={addForm.mintegralAndroidStore}
                onChange={e => {
                  upd("mintegralAndroidStore", e.target.value);
                  upd("mintegralStoreName", "");
                  upd("mintegralPreviewLink", "");
                }}>
                <option value="">- Chon store -</option>
                <option value="google_play">Google Play</option>
                <option value="amazon">Amazon Appstore</option>
                <option value="other_store">Other Store</option>
                <option value="not_live">Chua live (khong co store)</option>
              </select>
            </div>
            {addForm.mintegralAndroidStore === "other_store" && (
              <>
                <div style={{ marginBottom:10 }}>
                  <label style={lbl}>Store Name <span style={{ color:C.red }}>*</span></label>
                  <input style={inp} placeholder="Ten store..."
                    value={addForm.mintegralStoreName}
                    onChange={e => upd("mintegralStoreName", e.target.value)} />
                </div>
                <div style={{ marginBottom:10 }}>
                  <label style={lbl}>Preview Link <span style={{ color:C.red }}>*</span></label>
                  <input style={inp} placeholder="Link preview app..."
                    value={addForm.mintegralPreviewLink}
                    onChange={e => upd("mintegralPreviewLink", e.target.value)} />
                </div>
              </>
            )}
          </>
        )}

        {key === "mintegral" && !isAndroid && (
          <div style={{ fontSize:12, color:C.accent, marginBottom:12 }}>
            Du thong tin de them vao Mintegral (iOS).
          </div>
        )}

        {/* Buttons */}
        <div style={{ display:"flex", gap:8, marginTop:4 }}>
          <button onClick={() => handleAddPlatform(key)}
            disabled={adding || !canAdd(key)}
            style={{
              padding:"8px 18px", borderRadius:7, border:"none",
              background: canAdd(key) ? C.blue : "#1a2030",
              color: canAdd(key) ? C.ink : C.text3,
              fontSize:12, fontWeight:700, cursor: (!adding && canAdd(key)) ? "pointer" : "not-allowed",
              fontFamily:FS, opacity: adding ? 0.6 : 1,
            }}>
            {adding ? "Dang tao..." : `+ Them vao ${key.charAt(0).toUpperCase()+key.slice(1)}`}
          </button>
          <button onClick={() => { setExpandedAdd(null); setAddMsg(null); }}
            style={{
              padding:"8px 14px", borderRadius:7,
              border:`1px solid ${C.border2}`, background:"transparent",
              color:C.text2, fontSize:12, cursor:"pointer", fontFamily:FS,
            }}>
            Huy
          </button>
        </div>
      </div>
    );
  };

  return (
    <div style={{ fontFamily:FS, background:C.ink, minHeight:"100vh", color:C.text }}>
      <style>{`
        *{box-sizing:border-box;}
        input:focus,select:focus{outline:none!important;border-color:${C.accent}!important;}
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        .fu{animation:fadeUp .35s ease;}
        @keyframes spin{to{transform:rotate(360deg)}} .sp{animation:spin .8s linear infinite;display:inline-block;}
      `}</style>

      {/* Topbar */}
      <div style={{ height:52, background:C.ink2, borderBottom:`1px solid ${C.border}`,
        padding:"0 28px", display:"flex", alignItems:"center", gap:12,
        position:"sticky", top:0, zIndex:20 }}>
        <button onClick={() => router.push("/dashboard/apps/list")}
          style={{ background:"none", border:"none", color:C.text2, cursor:"pointer", fontSize:14 }}>
          Back
        </button>
        <div style={{ fontFamily:FD, fontWeight:700, fontSize:15 }}>Chi tiet app</div>
      </div>

      <div className="fu" style={{ padding:"32px", maxWidth:700 }}>

        {/* Global add-platform success/error message */}
        {addMsg && (
          <div style={{
            marginBottom:16, padding:"10px 16px", borderRadius:8,
            background: addMsg.ok ? C.accentDim : C.redDim,
            border:`1px solid ${addMsg.ok ? C.accent : C.red}`,
            fontSize:12.5, color: addMsg.ok ? C.accent : C.red,
          }}>
            {addMsg.text}
          </div>
        )}

        {/* App Info */}
        <div style={card}>
          <div style={{ padding:"13px 18px", borderBottom:`1px solid ${C.border}`,
            fontFamily:FD, fontWeight:700, fontSize:13 }}>
            Thong tin chung
          </div>
          <div style={{ padding:"16px 18px" }}>
            {[
              ["Ten app", app.name],
              ["Platform", app.platform],
              ["Che do", app.isLive ? "Live" : "Test (chua live)"],
              ["Store URL", app.storeUrl ?? "-"],
              ["Bundle ID", app.bundleId ?? "-"],
              ["AdMob Publisher", app.admobPublisherId ?? "-"],
              ["Tao luc", new Date(app.createdAt).toLocaleString("vi-VN")],
            ].map(([k, v]) => (
              <div key={k as string} style={{ display:"flex", justifyContent:"space-between",
                padding:"8px 0", borderBottom:`1px solid ${C.border}`, gap:12 }}>
                <span style={{ fontSize:11, color:C.text3, fontWeight:600, textTransform:"uppercase",
                  letterSpacing:"0.06em", flexShrink:0 }}>{k}</span>
                <span style={{ fontSize:12, color:C.text, fontFamily:FM, wordBreak:"break-all", textAlign:"right" }}>{v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Per-platform */}
        <div style={card}>
          <div style={{ padding:"13px 18px", borderBottom:`1px solid ${C.border}`,
            fontFamily:FD, fontWeight:700, fontSize:13 }}>
            Platform IDs & Status
          </div>
          <div style={{ padding:"14px 18px" }}>
            {platforms.map(p => (
              <div key={p.key} style={{ marginBottom:14, padding:"12px", borderRadius:8,
                border:`1px solid ${p.status === "none" ? C.border2 : C.border}`,
                background:C.ink2 }}>

                {/* Header row */}
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6 }}>
                  <span style={{ fontSize:12, fontWeight:700, color:C.text2, textTransform:"uppercase",
                    letterSpacing:"0.06em" }}>{p.name}</span>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    {statusBadge(p.status)}
                    {p.status === "none" && expandedAdd !== p.key && (
                      <button
                        onClick={() => {
                          setExpandedAdd(p.key);
                          setAddMsg(null);
                          if (p.key === "pangle") loadPangleCategories();
                        }}
                        style={{
                          padding:"3px 10px", borderRadius:5, border:`1px solid ${C.blue}`,
                          background:C.blueDim, color:C.blue, fontSize:10, fontWeight:700,
                          cursor:"pointer", fontFamily:FS,
                        }}>
                        + Them
                      </button>
                    )}
                  </div>
                </div>

                {p.appId && (
                  <div style={{ fontSize:12, color:C.text, fontFamily:FM, marginBottom:4, wordBreak:"break-all" }}>
                    App ID: {p.appId}
                  </div>
                )}

                {p.status === "error" && p.error && (
                  <div style={{ fontSize:11.5, color:C.red, marginBottom:8, wordBreak:"break-word" }}>
                    Error: {p.error}
                  </div>
                )}

                {p.status === "error" && (
                  <button onClick={() => handleRetry(p.key)}
                    disabled={retrying === p.key}
                    style={{
                      padding:"5px 14px", borderRadius:6, border:`1px solid ${C.yellow}`,
                      background:"transparent", color:C.yellow, fontSize:11, fontWeight:700,
                      cursor: retrying === p.key ? "not-allowed" : "pointer", fontFamily:FS,
                      opacity: retrying === p.key ? 0.5 : 1,
                    }}>
                    {retrying === p.key ? "Dang retry..." : "Retry"}
                  </button>
                )}

                {/* Inline add-platform form */}
                {p.status === "none" && expandedAdd === p.key && renderAddForm(p.key)}
              </div>
            ))}
          </div>
        </div>

        {/* Mintegral App Key */}
        <div style={card}>
          <div style={{ padding:"13px 18px", borderBottom:`1px solid ${C.border}`,
            fontFamily:FD, fontWeight:700, fontSize:13 }}>
            Mintegral App Key
          </div>
          <div style={{ padding:"16px 18px" }}>
            <div style={{ fontSize:12, color:C.text3, marginBottom:12, lineHeight:1.6 }}>
              App Key <strong>khong co</strong> trong Create App API response.
              Lay tu <strong>Mintegral Dashboard -&gt; APP Setting</strong> roi paste vao day.
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <input style={{ ...inp, flex:1 }}
                placeholder="Paste Mintegral App Key..."
                value={mintegralKeyInput}
                onChange={e => setMintegralKeyInput(e.target.value)}
              />
              <button onClick={handleSaveKey}
                disabled={savingKey || !mintegralKeyInput.trim()}
                style={{
                  padding:"10px 18px", borderRadius:8, border:"none",
                  background: !mintegralKeyInput.trim() ? "#2a3040" : C.accent,
                  color: !mintegralKeyInput.trim() ? C.text3 : C.ink,
                  fontSize:13, fontWeight:700, cursor: !mintegralKeyInput.trim() ? "not-allowed" : "pointer",
                  fontFamily:FS, whiteSpace:"nowrap",
                }}>
                {savingKey ? "..." : "Luu"}
              </button>
            </div>
            {keyMsg && (
              <div style={{ marginTop:8, fontSize:12,
                color: keyMsg.includes("thanh cong") ? C.accent : C.red }}>
                {keyMsg}
              </div>
            )}
            {app.mintegralAppKey && (
              <div style={{ marginTop:10, fontSize:12, color:C.accent }}>
                App Key hien tai: <span style={{ fontFamily:FM }}>{app.mintegralAppKey}</span>
              </div>
            )}
          </div>
        </div>

        {/* Quick actions */}
        <div style={{ display:"flex", gap:10 }}>
          <button onClick={() => router.push("/dashboard/apps")}
            style={{
              flex:1, padding:"11px 22px", borderRadius:8, border:"none",
              background:C.accent, color:C.ink, fontSize:14, fontWeight:700,
              cursor:"pointer", fontFamily:FS,
            }}>
            Tao app moi
          </button>
          <button onClick={() => router.push("/dashboard/apps/list")}
            style={{
              padding:"11px 22px", borderRadius:8, background:"transparent",
              border:`1px solid ${C.border2}`, color:C.text2, fontSize:13,
              fontWeight:600, cursor:"pointer", fontFamily:FS,
            }}>
            Danh sach
          </button>
        </div>
      </div>
    </div>
  );
}
