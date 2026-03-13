"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const C = {
  ink:"#0A0C10", ink2:"#131720", panel:"#161B26", border:"#1F2737", border2:"#27313F",
  text:"#E8EBF0", text2:"#8B93A0", text3:"#4E5768",
  accent:"#4FF0B4", accentDim:"rgba(79,240,180,0.12)",
  yellow:"#FFD84D", red:"#FF5F5F", blue:"#4D9EFF", blueDim:"rgba(77,158,255,0.12)",
};
const FD = "'Syne','Inter',system-ui,sans-serif";
const FS = "'Instrument Sans','Inter',system-ui,sans-serif";
const FM = "'IBM Plex Mono','Courier New',monospace";

type AppRow = {
  id: string; name: string; platform: string; isLive: boolean;
  admobStatus: string; pangleStatus: string; liftoffStatus: string; mintegralStatus: string;
  createdAt: string;
};

const dot = (status: string) => {
  const color = status === "ok" ? C.accent : status === "verifying" ? C.yellow : status === "error" ? C.red : C.text3;
  return <span style={{ display:"inline-block", width:8, height:8, borderRadius:"50%", background:color }} title={status} />;
};

export default function AppListPage() {
  const router = useRouter();
  const [apps, setApps] = useState<AppRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/apps")
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error);
        else setApps(d.apps ?? []);
      })
      .catch(() => setError("Lỗi kết nối"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ fontFamily:FS, background:C.ink, minHeight:"100vh", color:C.text }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=Instrument+Sans:wght@400;500;600&display=swap');
        *{box-sizing:border-box;}
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        .fu{animation:fadeUp .35s ease;}
        @keyframes spin{to{transform:rotate(360deg)}} .sp{animation:spin .8s linear infinite;display:inline-block;}
      `}</style>

      {/* Topbar */}
      <div style={{ height:52, background:C.ink2, borderBottom:`1px solid ${C.border}`,
        padding:"0 28px", display:"flex", alignItems:"center", justifyContent:"space-between",
        position:"sticky", top:0, zIndex:20 }}>
        <div style={{ fontFamily:FD, fontWeight:700, fontSize:15 }}>Danh sách App</div>
        <button onClick={() => router.push("/dashboard/apps")}
          style={{
            padding:"7px 14px", borderRadius:7, border:"none", background:C.accent,
            color:C.ink, fontSize:12.5, fontWeight:700, cursor:"pointer", fontFamily:FS,
          }}>
          + Tạo App mới
        </button>
      </div>

      <div className="fu" style={{ padding:"28px 32px", maxWidth:1100 }}>
        <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:12, overflow:"hidden" }}>
          {loading ? (
            <div style={{ padding:40, textAlign:"center", color:C.text3 }}>
              <span className="sp" style={{ fontSize:22 }}>↻</span>
              <div style={{ marginTop:10, fontSize:13 }}>Đang tải...</div>
            </div>
          ) : error ? (
            <div style={{ padding:20 }}>
              <div style={{ padding:"11px 14px", background:"rgba(255,95,95,0.12)",
                border:"1px solid rgba(255,95,95,0.3)", borderRadius:8, fontSize:12.5, color:C.red }}>
                {error}
              </div>
            </div>
          ) : apps.length === 0 ? (
            <div style={{ padding:40, textAlign:"center", color:C.text3 }}>
              <div style={{ fontSize:32, marginBottom:12 }}>📱</div>
              <div style={{ fontSize:14, fontWeight:600, marginBottom:10 }}>Chưa có app nào</div>
              <button onClick={() => router.push("/dashboard/apps")}
                style={{ padding:"8px 18px", borderRadius:7, border:"none", background:C.accent,
                  color:C.ink, fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:FS }}>
                Tạo App đầu tiên
              </button>
            </div>
          ) : (
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead>
                <tr>
                  {["Tên App", "Platform", "Chế độ", "AdMob", "Pangle", "Liftoff", "Mintegral", "Ngày tạo", ""].map(h => (
                    <th key={h} style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:".1em",
                      color:C.text3, padding:"10px 12px", textAlign:"left", borderBottom:`1px solid ${C.border}` }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {apps.map(app => (
                  <tr key={app.id}
                    style={{ cursor:"pointer", transition:"background .1s" }}
                    onClick={() => router.push(`/dashboard/apps/${app.id}`)}
                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(79,240,180,0.03)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                    <td style={{ padding:"10px 12px", fontSize:13, color:C.text, fontWeight:500,
                      borderBottom:`1px solid ${C.border}`, maxWidth:200, overflow:"hidden",
                      textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                      {app.name}
                    </td>
                    <td style={{ padding:"10px 12px", borderBottom:`1px solid ${C.border}` }}>
                      <span style={{
                        display:"inline-flex", padding:"2px 8px", borderRadius:99,
                        fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:".06em",
                        color: app.platform === "IOS" ? C.blue : C.accent,
                        background: app.platform === "IOS" ? C.blueDim : C.accentDim,
                      }}>
                        {app.platform}
                      </span>
                    </td>
                    <td style={{ padding:"10px 12px", fontSize:11, color:C.text3, borderBottom:`1px solid ${C.border}` }}>
                      {app.isLive ? "Live" : "Test"}
                    </td>
                    <td style={{ padding:"10px 12px", borderBottom:`1px solid ${C.border}`, textAlign:"center" }}>
                      {dot(app.admobStatus)}
                    </td>
                    <td style={{ padding:"10px 12px", borderBottom:`1px solid ${C.border}`, textAlign:"center" }}>
                      {dot(app.pangleStatus)}
                    </td>
                    <td style={{ padding:"10px 12px", borderBottom:`1px solid ${C.border}`, textAlign:"center" }}>
                      {dot(app.liftoffStatus)}
                    </td>
                    <td style={{ padding:"10px 12px", borderBottom:`1px solid ${C.border}`, textAlign:"center" }}>
                      {dot(app.mintegralStatus)}
                    </td>
                    <td style={{ padding:"10px 12px", fontSize:11, color:C.text3, fontFamily:FM,
                      borderBottom:`1px solid ${C.border}`, whiteSpace:"nowrap" }}>
                      {new Date(app.createdAt).toLocaleDateString("vi-VN")}
                    </td>
                    <td style={{ padding:"10px 12px", borderBottom:`1px solid ${C.border}` }}>
                      <span style={{ fontSize:11, color:C.text3 }}>→</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
