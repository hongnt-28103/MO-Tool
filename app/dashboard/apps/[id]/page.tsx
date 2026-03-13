"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type PlatformKey = "admob" | "pangle" | "liftoff" | "mintegral";
type PlatformStatus = "none" | "ok" | "verifying" | "error";

type AppRecord = {
  id: string; name: string; platform: string; isLive: boolean;
  storeUrl: string | null; bundleId: string | null;
  admobPublisherId: string | null; admobAppId: string | null; admobStatus: string; admobError: string | null;
  pangleAppId: string | null; pangleCategoryCode: number | null; pangleStatus: string; pangleError: string | null;
  liftoffAppId: string | null; liftoffStatus: string; liftoffError: string | null;
  mintegralAppId: string | null; mintegralAppKey: string | null; mintegralStatus: string; mintegralError: string | null;
  createdAt: string; updatedAt: string;
};

const C = {
  ink:"#0A0C10", ink2:"#131720", panel:"#161B26", border:"#1F2737", border2:"#27313F",
  text:"#E8EBF0", text2:"#8B93A0", text3:"#4E5768",
  accent:"#4FF0B4", accentDim:"rgba(79,240,180,0.12)",
  yellow:"#FFD84D", yellowDim:"rgba(255,216,77,0.12)",
  red:"#FF5F5F", redDim:"rgba(255,95,95,0.12)",
  blue:"#4D9EFF",
};
const FD = "'Syne','Inter',system-ui,sans-serif";
const FS = "'Instrument Sans','Inter',system-ui,sans-serif";
const FM = "'IBM Plex Mono','Courier New',monospace";

const card: React.CSSProperties = {
  background:C.panel, border:`1px solid ${C.border}`, borderRadius:12, overflow:"hidden", marginBottom:16,
};
const inp: React.CSSProperties = {
  width:"100%", background:C.ink2, border:`1px solid ${C.border2}`,
  borderRadius:8, padding:"10px 13px", fontSize:13.5, color:C.text,
  fontFamily:FS, outline:"none", boxSizing:"border-box",
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

  const fetchApp = async () => {
    try {
      const res = await fetch(`/api/apps/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setApp(data.app);
      setMintegralKeyInput(data.app.mintegralAppKey ?? "");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchApp(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

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
      setKeyMsg("Đã lưu App Key thành công!");
    } catch (e: unknown) {
      setKeyMsg(e instanceof Error ? e.message : "Error");
    } finally {
      setSavingKey(false);
    }
  };

  const statusBadge = (s: string) => {
    const map: Record<string, { color: string; icon: string; label: string }> = {
      ok: { color: C.accent, icon: "✓", label: "OK" },
      verifying: { color: C.yellow, icon: "⏳", label: "VERIFYING" },
      error: { color: C.red, icon: "✗", label: "ERROR" },
      none: { color: C.text3, icon: "—", label: "NOT CREATED" },
    };
    const { color, icon, label } = map[s] ?? map.none;
    return <span style={{ color, fontWeight:700, fontSize:11, letterSpacing:"0.04em" }}>{icon} {label}</span>;
  };

  if (loading) return (
    <div style={{ fontFamily:FS, color:C.text, padding:40, textAlign:"center" }}>
      <span style={{ fontSize:22, display:"inline-block", animation:"spin .8s linear infinite" }}>↻</span>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (error || !app) return (
    <div style={{ fontFamily:FS, color:C.red, padding:40 }}>⚠ {error ?? "App not found"}</div>
  );

  const platforms: Array<{
    key: PlatformKey; name: string; appId: string | null; status: string; error: string | null;
  }> = [
    { key:"admob", name:"AdMob", appId:app.admobAppId, status:app.admobStatus, error:app.admobError },
    { key:"pangle", name:"Pangle", appId:app.pangleAppId, status:app.pangleStatus, error:app.pangleError },
    { key:"liftoff", name:"Liftoff", appId:app.liftoffAppId, status:app.liftoffStatus, error:app.liftoffError },
    { key:"mintegral", name:"Mintegral", appId:app.mintegralAppId, status:app.mintegralStatus, error:app.mintegralError },
  ];

  return (
    <div style={{ fontFamily:FS, background:C.ink, minHeight:"100vh", color:C.text }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=Instrument+Sans:wght@400;500;600&display=swap');
        *{box-sizing:border-box;}
        input:focus{outline:none!important;border-color:${C.accent}!important;}
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
          ←
        </button>
        <div style={{ fontFamily:FD, fontWeight:700, fontSize:15 }}>Chi tiết app</div>
      </div>

      <div className="fu" style={{ padding:"32px", maxWidth:680 }}>

        {/* App Info */}
        <div style={card}>
          <div style={{ padding:"13px 18px", borderBottom:`1px solid ${C.border}`,
            fontFamily:FD, fontWeight:700, fontSize:13 }}>
            Thông tin chung
          </div>
          <div style={{ padding:"16px 18px" }}>
            {[
              ["Tên app", app.name],
              ["Platform", app.platform],
              ["Chế độ", app.isLive ? "Live" : "Test (chưa live)"],
              ["Store URL", app.storeUrl ?? "—"],
              ["Bundle ID", app.bundleId ?? "—"],
              ["AdMob Publisher", app.admobPublisherId ?? "—"],
              ["Tạo lúc", new Date(app.createdAt).toLocaleString("vi-VN")],
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
                border:`1px solid ${C.border}`, background:C.ink2 }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6 }}>
                  <span style={{ fontSize:12, fontWeight:700, color:C.text2, textTransform:"uppercase",
                    letterSpacing:"0.06em" }}>{p.name}</span>
                  {statusBadge(p.status)}
                </div>

                {p.appId && (
                  <div style={{ fontSize:12, color:C.text, fontFamily:FM, marginBottom:4, wordBreak:"break-all" }}>
                    App ID: {p.appId}
                  </div>
                )}

                {p.status === "error" && p.error && (
                  <div style={{ fontSize:11.5, color:C.red, marginBottom:8, wordBreak:"break-word" }}>✗ {p.error}</div>
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
                    {retrying === p.key ? "Đang retry..." : "↻ Retry"}
                  </button>
                )}
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
              App Key <strong>không có</strong> trong Create App API response.
              Lấy từ <strong>Mintegral Dashboard → APP Setting</strong> rồi paste vào đây.
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
                {savingKey ? "..." : "Lưu"}
              </button>
            </div>
            {keyMsg && (
              <div style={{ marginTop:8, fontSize:12,
                color: keyMsg.includes("thành công") ? C.accent : C.red }}>
                {keyMsg}
              </div>
            )}
            {app.mintegralAppKey && (
              <div style={{ marginTop:10, fontSize:12, color:C.accent }}>
                ✓ App Key hiện tại: <span style={{ fontFamily:FM }}>{app.mintegralAppKey}</span>
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
            ← Tạo app mới
          </button>
          <button onClick={() => router.push("/dashboard/apps/list")}
            style={{
              padding:"11px 22px", borderRadius:8, background:"transparent",
              border:`1px solid ${C.border2}`, color:C.text2, fontSize:13,
              fontWeight:600, cursor:"pointer", fontFamily:FS,
            }}>
            Danh sách
          </button>
        </div>
      </div>
    </div>
  );
}
