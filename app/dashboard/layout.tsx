"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

const C = { ink:"#0A0C10", ink2:"#131720", panel:"#161B26", border:"#1F2737", border2:"#27313F",
  text:"#E8EBF0", text2:"#8B93A0", text3:"#4E5768", accent:"#4FF0B4", accentDim:"rgba(79,240,180,0.12)", red:"#FF5F5F" };
const FD = "'Syne','Inter',system-ui,sans-serif";
const FS = "'Instrument Sans','Inter',system-ui,sans-serif";

const NAV = [
  { href:"/dashboard",            icon:"⬡",  label:"Dashboard" },
  { href:"/dashboard/apps",       icon:"📱", label:"Tạo App" },
  { href:"/dashboard/apps/list",  icon:"📋", label:"Danh sách App" },
  { href:"/dashboard/adunits",    icon:"🔲", label:"Tạo Ad Unit" },
  { href:"/dashboard/mapping",    icon:"⚡", label:"Mapping" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router   = useRouter();
  const [pub, setPub]       = useState<{ publisherName:string; email:string }|null>(null);
  const [pubErr, setPubErr] = useState<string|null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/accounts")
      .then(r => { if (r.status===401) { router.push("/login"); return null; } return r.json(); })
      .then(d => { if (!d) return; if (d.error) { setPubErr(d.error); } else { setPub(d); } setLoading(false); })
      .catch(() => { setPubErr("Lỗi kết nối"); setLoading(false); });
  }, [router]);

  const isActive = (href: string) => href === "/dashboard" ? pathname === href : pathname.startsWith(href);

  const logout = async () => { await fetch("/api/auth/logout", { method:"POST" }); router.push("/login"); };

  return (
    <div style={{ display:"flex", minHeight:"100vh", background:C.ink, fontFamily:FS }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=Instrument+Sans:wght@400;500;600&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        .fu{animation:fadeUp .3s ease;}
        ::-webkit-scrollbar{width:4px;} ::-webkit-scrollbar-thumb{background:${C.border2};border-radius:2px;}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}} .pl{animation:pulse 1.4s infinite;}
      `}</style>

      {/* Sidebar */}
      <nav style={{ width:220, minWidth:220, background:C.ink2, borderRight:`1px solid ${C.border}`,
        display:"flex", flexDirection:"column", height:"100vh", position:"sticky", top:0, overflowY:"auto" }}>

        {/* Brand */}
        <div style={{ padding:"20px 16px 16px", borderBottom:`1px solid ${C.border}` }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ width:32, height:32, borderRadius:8, background:C.accentDim,
              border:"1px solid rgba(79,240,180,0.3)", display:"flex", alignItems:"center",
              justifyContent:"center", fontSize:16 }}>
              📡
            </div>
            <div>
              <div style={{ fontFamily:FD, fontWeight:800, fontSize:14, color:C.text }}>AdMob Tool</div>
              <div style={{ fontSize:9.5, color:C.text3, letterSpacing:"0.06em", textTransform:"uppercase" }}>Mediation</div>
            </div>
          </div>
        </div>

        {/* Publisher badge */}
        <div style={{ padding:"12px 16px", borderBottom:`1px solid ${C.border}` }}>
          {loading ? (
            <div className="pl" style={{ height:52, background:C.border, borderRadius:7 }}/>
          ) : pubErr ? (
            <div style={{ padding:"8px 10px", background:"rgba(255,95,95,0.12)", border:"1px solid rgba(255,95,95,0.3)",
              borderRadius:7, fontSize:11, color:"#FF5F5F", lineHeight:1.5 }}>{pubErr}</div>
          ) : pub ? (
            <div style={{ background:C.accentDim, border:"1px solid rgba(79,240,180,0.2)", borderRadius:7, padding:"8px 11px" }}>
              <div style={{ fontSize:9.5, color:C.accent, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:2 }}>
                Publisher
              </div>
              <div style={{ fontSize:13, fontWeight:700, color:C.text }}>{pub.publisherName}</div>
              <div style={{ fontSize:10.5, color:C.text3, marginTop:1, fontFamily:"monospace",
                overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                {pub.email}
              </div>
            </div>
          ) : null}
        </div>

        {/* Nav */}
        <div style={{ padding:"8px 0", flex:1 }}>
          <div style={{ fontSize:9.5, color:C.text3, textTransform:"uppercase", letterSpacing:"0.1em",
            padding:"6px 16px 4px", fontWeight:600 }}>Menu</div>
          {NAV.map(item => {
            const active = isActive(item.href);
            return (
              <div key={item.href}
                onClick={() => router.push(item.href)}
                style={{ display:"flex", alignItems:"center", gap:9, padding:"9px 16px",
                  fontSize:13, fontWeight:500, cursor:"pointer", position:"relative",
                  color: active ? C.accent : C.text2,
                  background: active ? C.accentDim : "transparent",
                  borderLeft: active ? `2px solid ${C.accent}` : "2px solid transparent",
                  transition:"all .12s" }}>
                <span style={{ fontSize:15 }}>{item.icon}</span>
                {item.label}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{ padding:"12px 16px", borderTop:`1px solid ${C.border}` }}>
          <button onClick={logout}
            style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:7,
              width:"100%", padding:"8px 12px", borderRadius:7, border:`1px solid ${C.border2}`,
              background:"transparent", color:C.text2, fontSize:12, fontWeight:600,
              cursor:"pointer", fontFamily:FS }}>
            <svg width={13} height={13} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            Đăng xuất
          </button>
        </div>
      </nav>

      {/* Content */}
      <main style={{ flex:1, overflowY:"auto" }}>{children}</main>
    </div>
  );
}
