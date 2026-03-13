"use client";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

const C = { ink:"#0A0C10", ink2:"#131720", panel:"#161B26", border:"#1F2737", border2:"#27313F",
  text:"#E8EBF0", text2:"#8B93A0", text3:"#4E5768", accent:"#4FF0B4", accentDim:"rgba(79,240,180,0.12)",
  yellow:"#FFD84D", yellowDim:"rgba(255,216,77,0.12)", red:"#FF5F5F" };
const FD = "'Syne','Inter',system-ui,sans-serif";
const FS = "'Instrument Sans','Inter',system-ui,sans-serif";

const ERRORS: Record<string,string> = {
  invalid_state:"Phiên xác thực không hợp lệ. Vui lòng thử lại.",
  auth_failed:"Đăng nhập thất bại. Vui lòng thử lại.",
  no_code:"Không nhận được authorization code từ Google.",
  access_denied:"Bạn đã từ chối quyền truy cập.",
};

function LoginContent() {
  const params = useSearchParams();
  const error  = params.get("error");

  return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center",
      background:C.ink, position:"relative", overflow:"hidden", fontFamily:FS }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=Instrument+Sans:wght@400;500;600&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        body{background:${C.ink};}
        @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        .fu{animation:fadeUp .4s ease;}
      `}</style>

      {/* Grid bg */}
      <div style={{ position:"absolute", inset:0,
        backgroundImage:`linear-gradient(${C.border} 1px, transparent 1px), linear-gradient(90deg, ${C.border} 1px, transparent 1px)`,
        backgroundSize:"48px 48px", opacity:.25,
        maskImage:"radial-gradient(ellipse 70% 70% at 50% 50%, black, transparent)",
      }}/>
      {/* Glow */}
      <div style={{ position:"absolute", width:600, height:600, borderRadius:"50%",
        background:"radial-gradient(circle, rgba(79,240,180,0.07) 0%, transparent 70%)",
        top:"50%", left:"50%", transform:"translate(-50%,-50%)", pointerEvents:"none" }}/>

      <div className="fu" style={{ position:"relative", width:400, background:C.panel,
        border:`1px solid ${C.border2}`, borderRadius:16, padding:36,
        boxShadow:"0 24px 80px rgba(0,0,0,0.6)" }}>

        {/* Top accent line */}
        <div style={{ position:"absolute", top:0, left:"20%", right:"20%", height:2,
          background:`linear-gradient(90deg, transparent, ${C.accent}, transparent)`, borderRadius:2 }}/>

        {/* Logo */}
        <div style={{ textAlign:"center", marginBottom:32 }}>
          <div style={{ display:"inline-flex", alignItems:"center", justifyContent:"center",
            width:52, height:52, borderRadius:14, marginBottom:16,
            background:C.accentDim, border:"1px solid rgba(79,240,180,0.3)", fontSize:24 }}>
            📡
          </div>
          <div style={{ fontFamily:FD, fontSize:22, fontWeight:800, color:C.text, marginBottom:4 }}>
            AdMob Tool
          </div>
          <div style={{ fontSize:12.5, color:C.text3 }}>Mediation Automation · Internal</div>
        </div>

        {error && (
          <div style={{ padding:"11px 14px", borderRadius:8, fontSize:12.5, marginBottom:20,
            background:"rgba(255,95,95,0.12)", border:"1px solid rgba(255,95,95,0.3)", color:"#FF5F5F",
            display:"flex", gap:8, alignItems:"flex-start" }}>
            ⚠ {ERRORS[error] ?? "Đã có lỗi xảy ra."}
          </div>
        )}

        <div style={{ fontSize:13, color:C.text2, lineHeight:1.6, marginBottom:20 }}>
          Đăng nhập bằng email Google của bạn. Hệ thống sẽ yêu cầu quyền đọc và quản lý AdMob mediation.
        </div>

        <div style={{ background:C.ink2, border:`1px solid ${C.border}`, borderRadius:8,
          padding:"10px 14px", marginBottom:20, fontSize:11.5, color:C.text3, lineHeight:1.6 }}>
          <span style={{ color:C.yellow, fontWeight:600 }}>⚠ Lưu ý:</span>{" "}
          Chỉ dành cho nhân sự có quyền truy cập publisher{" "}
          <span style={{ color:C.text2, fontFamily:"monospace" }}>Nami</span> hoặc{" "}
          <span style={{ color:C.text2, fontFamily:"monospace" }}>Nasus</span>.
          Email khác sẽ bị từ chối.
        </div>

        <a href="/api/auth/login" style={{ display:"block", textDecoration:"none" }}>
          <button style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:10,
            width:"100%", padding:"13px", borderRadius:8, border:"none",
            background:C.accent, color:C.ink, fontSize:14, fontWeight:700,
            fontFamily:FS, cursor:"pointer", letterSpacing:"0.01em" }}>
            <svg width={18} height={18} viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Đăng nhập với Google
          </button>
        </a>

        <div style={{ marginTop:20, textAlign:"center", fontSize:11, color:C.text3 }}>
          Token mã hoá AES-256-GCM · Session 8 giờ · httpOnly cookie
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense><LoginContent /></Suspense>;
}
