"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const C = { ink:"#0A0C10", ink2:"#131720", panel:"#161B26", border:"#1F2737", border2:"#27313F",
  text:"#E8EBF0", text2:"#8B93A0", text3:"#4E5768", accent:"#4FF0B4", accentDim:"rgba(79,240,180,0.12)",
  blue:"#4D9EFF", blueDim:"rgba(77,158,255,0.12)", yellow:"#FFD84D", yellowDim:"rgba(255,216,77,0.12)",
  green:"#4FF0B4", red:"#FF5F5F" };
const FD = "'Syne','Inter',system-ui,sans-serif";
const FS = "'Instrument Sans','Inter',system-ui,sans-serif";
const FM = "'IBM Plex Mono','Courier New',monospace";

export default function DashboardPage() {
  const router = useRouter();
  const [apps,    setApps]    = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string|null>(null);

  useEffect(() => {
    fetch("/api/apps").then(r=>r.json()).then(d=>{
      if (d.error) { setError(d.error); } else { setApps(d.apps??[]); }
      setLoading(false);
    }).catch(()=>{ setError("Lỗi kết nối"); setLoading(false); });
  }, []);

  const STATS = [
    { label:"Tổng Apps",    value: loading ? "—" : String(apps.length), color:C.accent,  sub:"Trên AdMob" },
    { label:"Networks",     value:"4",                                    color:C.blue,   sub:"Pangle · Liftoff · MT · Meta" },
    { label:"Publishers",   value:"2",                                    color:C.yellow, sub:"Nami · Nasus" },
    { label:"API Status",   value:"OK",                                   color:C.green,  sub:"AdMob connected" },
  ];

  const ACTIONS = [
    { title:"Tạo App mới",  desc:"Tạo app trên 4 nền tảng đồng thời", icon:"📱", href:"/dashboard/apps",    color:C.accent },
    { title:"Tạo Ad Unit",  desc:"Bulk create từ CSV",             icon:"🔲", href:"/dashboard/adunits", color:C.blue   },
    { title:"Mapping",      desc:"Map placement + mediation group",icon:"⚡", href:"/dashboard/mapping", color:C.yellow },
  ];

  return (
    <div style={{ color:C.text, fontFamily:FS }}>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}.fu{animation:fadeUp .3s ease;} @keyframes spin{to{transform:rotate(360deg)}}.sp{animation:spin .8s linear infinite;display:inline-block;}`}</style>

      {/* Topbar */}
      <div style={{ height:52, background:C.ink2, borderBottom:`1px solid ${C.border}`,
        padding:"0 28px", display:"flex", alignItems:"center", justifyContent:"space-between",
        position:"sticky", top:0, zIndex:20 }}>
        <div style={{ fontFamily:FD, fontWeight:800, fontSize:15 }}>Dashboard</div>
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={()=>{console.log('Topbar create app'); router.push("/dashboard/apps")}}
            style={{ padding:"7px 14px", borderRadius:7, border:"none", background:C.accent,
              color:C.ink, fontSize:12.5, fontWeight:700, cursor:"pointer", fontFamily:FS }}>
            + Tạo App
          </button>
          <button onClick={()=>router.push("/dashboard/mapping")}
            style={{ padding:"7px 14px", borderRadius:7, background:"transparent", color:C.text2,
              border:`1px solid ${C.border2}`, fontSize:12.5, fontWeight:600, cursor:"pointer", fontFamily:FS }}>
            ⚡ Mapping
          </button>
        </div>
      </div>

      <div className="fu" style={{ padding:"28px 32px", maxWidth:1100 }}>

        {/* Stats */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:24 }}>
          {STATS.map(st => (
            <div key={st.label} style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:12, padding:"16px 18px" }}>
              <div style={{ fontSize:10, fontWeight:600, color:C.text3, textTransform:"uppercase", letterSpacing:".1em", marginBottom:8 }}>{st.label}</div>
              <div style={{ fontFamily:FD, fontSize:28, fontWeight:800, marginBottom:3, color:st.color }}>{st.value}</div>
              <div style={{ fontSize:11, color:C.text3 }}>{st.sub}</div>
            </div>
          ))}
        </div>

        {/* Quick actions */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:14, marginBottom:24 }}>
          {ACTIONS.map(a => (
            <div key={a.title}
              onClick={()=>{console.log('Navigating to', a.href); router.push(a.href)}}
              style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:12,
                padding:"18px", cursor:"pointer", transition:"border-color .15s" }}
              onMouseEnter={e=>(e.currentTarget.style.borderColor=a.color)}
              onMouseLeave={e=>(e.currentTarget.style.borderColor=C.border)}>
              <div style={{ display:"flex", gap:13, alignItems:"flex-start" }}>
                <div style={{ width:42, height:42, borderRadius:10, fontSize:21,
                  background:`rgba(${a.color==="#4FF0B4"?"79,240,180":a.color==="#4D9EFF"?"77,158,255":"255,216,77"},0.15)`,
                  border:`1px solid rgba(${a.color==="#4FF0B4"?"79,240,180":a.color==="#4D9EFF"?"77,158,255":"255,216,77"},0.3)`,
                  display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                  {a.icon}
                </div>
                <div>
                  <div style={{ fontFamily:FD, fontWeight:700, fontSize:14, marginBottom:4, color:C.text }}>{a.title}</div>
                  <div style={{ fontSize:12, color:C.text3, lineHeight:1.5 }}>{a.desc}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Apps table */}
        <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:12, overflow:"hidden" }}>
          <div style={{ padding:"13px 18px", borderBottom:`1px solid ${C.border}`,
            display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <span style={{ fontFamily:FD, fontWeight:700, fontSize:13 }}>Danh sách Apps</span>
            <button onClick={()=>router.push("/dashboard/apps/list")}
              style={{ padding:"5px 11px", borderRadius:6, background:"transparent",
                border:`1px solid ${C.border2}`, color:C.text2, fontSize:11.5,
                fontWeight:600, cursor:"pointer", fontFamily:FS }}>
              Xem tất cả →
            </button>
          </div>
          {loading ? (
            <div style={{ padding:40, textAlign:"center", color:C.text3 }}>
              <span className="sp" style={{ fontSize:22 }}>↻</span>
              <div style={{ marginTop:10, fontSize:13 }}>Đang tải...</div>
            </div>
          ) : error ? (
            <div style={{ padding:20 }}>
              <div style={{ padding:"11px 14px", background:"rgba(255,95,95,0.12)", border:"1px solid rgba(255,95,95,0.3)", borderRadius:8, fontSize:12.5, color:C.red }}>{error}</div>
            </div>
          ) : apps.length===0 ? (
            <div style={{ padding:40, textAlign:"center", color:C.text3 }}>
              <div style={{ fontSize:32, marginBottom:12 }}>📱</div>
              <div style={{ fontSize:14, fontWeight:600, marginBottom:10 }}>Chưa có app nào</div>
              <button onClick={()=>router.push("/dashboard/apps")}
                style={{ padding:"8px 18px", borderRadius:7, border:"none", background:C.accent,
                  color:C.ink, fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:FS }}>
                Tạo App đầu tiên
              </button>
            </div>
          ) : (
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead>
                <tr>
                  {["Tên App","Platform","Chế độ","Hành động"].map(h=>(
                    <th key={h} style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:".1em",
                      color:C.text3, padding:"9px 14px", textAlign:"left", borderBottom:`1px solid ${C.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {apps.slice(0, 10).map((app:any)=>(
                  <tr key={app.id} style={{ transition:"background .1s", cursor:"pointer" }}
                    onClick={()=>router.push(`/dashboard/apps/${app.id}`)}
                    onMouseEnter={e=>(e.currentTarget.style.background="rgba(79,240,180,0.03)")}
                    onMouseLeave={e=>(e.currentTarget.style.background="transparent")}>
                    <td style={{ padding:"10px 14px", fontSize:13, color:C.text, fontWeight:500, borderBottom:`1px solid ${C.border}` }}>
                      {app.name ?? "—"}
                    </td>
                    <td style={{ padding:"10px 14px", borderBottom:`1px solid ${C.border}` }}>
                      <span style={{ display:"inline-flex", alignItems:"center", padding:"2px 8px", borderRadius:99,
                        fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:".06em",
                        color: app.platform==="IOS"?C.blue:C.accent,
                        background: app.platform==="IOS"?C.blueDim:C.accentDim }}>
                        {app.platform}
                      </span>
                    </td>
                    <td style={{ padding:"10px 14px", fontSize:11, color:C.text3, borderBottom:`1px solid ${C.border}` }}>
                      {app.isLive ? "Live" : "Test"}
                    </td>
                    <td style={{ padding:"10px 14px", borderBottom:`1px solid ${C.border}` }}>
                      <span style={{ fontSize:11, color:C.text3 }}>→ Chi tiết</span>
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
