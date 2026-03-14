"use client";
import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Suspense } from "react";

/* ─── Design tokens ─── */
const C = {
  ink:"#F8FAFC", ink2:"#FFFFFF", ink3:"#EFF2F6", panel:"#FFFFFF",
  border:"#E2E8F0", border2:"#CBD5E1",
  text:"#0F172A", text2:"#475569", text3:"#94A3B8",
  accent:"#059669", accentDim:"rgba(5,150,105,0.10)",
  blue:"#2563EB", blueDim:"rgba(37,99,235,0.10)",
  yellow:"#D97706", yellowDim:"rgba(217,119,6,0.10)",
  red:"#DC2626", redDim:"rgba(220,38,38,0.10)",
};
const FD = "'Syne','Inter',system-ui,sans-serif";
const FS = "'Instrument Sans','Inter',system-ui,sans-serif";
const FM = "'IBM Plex Mono','Courier New',monospace";

/* ─── Types ─── */
type AppRecord = {
  id:string; name:string; platform:string; isLive:boolean;
  dbId?:string|null;
  admobAppId:string|null; pangleAppId:string|null; liftoffAppId:string|null;
  mintegralAppId:string|null; mintegralAppKey:string|null;
  admobStatus:string; pangleStatus:string; liftoffStatus:string; mintegralStatus:string;
};
type AdmobSyncApp = {
  admobAppId: string;
  displayName: string;
  platform: string;
  bundleId?: string;
  dbId?: string | null;
  liftoff?: { status?: string; appId?: string | null };
  pangle?: { status?: string; appId?: string | null };
  mintegral?: { status?: string; appId?: string | null };
};
type ParsedUnit = { name:string; format:string; tier:string; valid:boolean; error?:string };
type PlatformRule = "per_unit" | "per_format";
type PlacementResult = { placementId?:string; status:string; error?:string };
type UnitResult = {
  name:string; format:string; tier:string;
  admobAdUnitId?:string; admobStatus:string; admobError?:string;
  placements: Record<string, PlacementResult>;
};

/* ─── Format detection ─── */
const FORMAT_DETECT: [string, RegExp][] = [
  ["INTERSTITIAL", /inter|full|fs/i],
  ["REWARDED",     /reward|rv|video/i],
  ["APP_OPEN",     /open|splash|aoa/i],
  ["BANNER",       /mrec|300x250|banner|top|bottom/i],
  ["NATIVE",       /native|feed|card/i],
];
function detectFormat(name:string):string|null {
  for (const [fmt,re] of FORMAT_DETECT) if (re.test(name)) return fmt;
  return null;
}
function detectTier(name:string):"high"|"med"|"ap" {
  if(/_high\b|_1\b|_2\b/i.test(name)) return "high";
  if(/_med\b|_medium\b/i.test(name)) return "med";
  return "ap";
}

const FORMAT_COLORS: Record<string,[string,string]> = {
  INTERSTITIAL:[C.yellow,C.yellowDim], REWARDED:[C.accent,C.accentDim],
  APP_OPEN:[C.blue,C.blueDim], BANNER:[C.blue,C.blueDim], NATIVE:[C.text2,"rgba(139,147,160,.15)"],
};
const TIER_COLORS: Record<string,[string,string]> = {
  high:[C.red,C.redDim], med:[C.yellow,C.yellowDim], ap:[C.accent,C.accentDim],
};

/* ─── Style helpers ─── */
const card:React.CSSProperties = { background:C.panel, border:`1px solid ${C.border}`, borderRadius:12, overflow:"hidden", marginBottom:16 };
const cH:React.CSSProperties = { padding:"13px 18px", borderBottom:`1px solid ${C.border}`, display:"flex", alignItems:"center", justifyContent:"space-between" };
const cT:React.CSSProperties = { fontFamily:FD, fontWeight:700, fontSize:13, color:C.text };
const inp:React.CSSProperties = { width:"100%", background:C.ink2, border:`1px solid ${C.border2}`, borderRadius:8, padding:"10px 13px", fontSize:13, color:C.text, fontFamily:FS, outline:"none", boxSizing:"border-box" };
const lbl:React.CSSProperties = { display:"block", fontSize:11, fontWeight:700, color:C.text2, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:6 };
const btnP = (dis=false):React.CSSProperties => ({ display:"inline-flex", alignItems:"center", justifyContent:"center", gap:8, padding:"11px 22px", borderRadius:8, border:"none", background:dis?"#d0d5dd":C.accent, color:dis?C.text3:"#fff", fontSize:13.5, fontWeight:700, cursor:dis?"not-allowed":"pointer", fontFamily:FS, opacity:dis?.6:1 });
const btnG:React.CSSProperties = { display:"inline-flex", alignItems:"center", gap:7, padding:"8px 14px", borderRadius:8, background:"transparent", border:`1px solid ${C.border2}`, color:C.text2, fontSize:12.5, fontWeight:600, cursor:"pointer", fontFamily:FS };
const chip = (col:string,bg:string):React.CSSProperties => ({ display:"inline-flex", alignItems:"center", padding:"2px 8px", borderRadius:99, fontSize:9.5, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em", color:col, background:bg });
const alrt = (col:string,bg:string,bc:string):React.CSSProperties => ({ padding:"11px 14px", borderRadius:8, fontSize:12.5, display:"flex", alignItems:"flex-start", gap:9, lineHeight:"1.5", color:col, background:bg, border:`1px solid ${bc}`, marginBottom:14 });

/* ─── CSV Template ─── */
const CSV_TEMPLATE = `ad_unit_name,ad_format\ninter_gameplay,INTERSTITIAL\ninter_high,INTERSTITIAL\nrewarded_extra,REWARDED\nrewarded_high,REWARDED\nbanner_bottom,BANNER\nnative_feed,NATIVE\napp_open_splash,APP_OPEN`;

function AdUnitsContent() {
  const router = useRouter();
  const [step, setStep] = useState<0|1|2|3|4>(0);

  // Step 0: App & Platform selection
  const [apps, setApps] = useState<AppRecord[]>([]);
  const [appsLoading, setAppsLoading] = useState(true);
  const [selectedAppId, setSelectedAppId] = useState("");
  const [platforms, setPlatforms] = useState({ admob:true, pangle:true, liftoff:true, mintegral:true });

  // Step 1: CSV
  const [csvText, setCsvText] = useState("");
  const [parsed, setParsed] = useState<ParsedUnit[]>([]);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Step 2: Rules
  const [rules, setRules] = useState<Record<string,PlatformRule>>({
    pangle:"per_unit", liftoff:"per_unit", mintegral:"per_unit",
  });

  // Step 3-4: Execute & results
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<UnitResult[]>([]);
  const [error, setError] = useState<string|null>(null);

  // Fetch apps
  useEffect(()=>{
    const mapDbApps = (rawApps: any[]): AppRecord[] =>
      rawApps.map((a: any) => ({
        ...a,
        dbId: a.id,
      }));

    const mapAdmobApps = (rawApps: AdmobSyncApp[]): AppRecord[] =>
      rawApps
        .filter((a) => !!a.admobAppId)
        .map((a) => ({
          id: a.dbId ?? `admob:${a.admobAppId}`,
          dbId: a.dbId ?? null,
          name: a.displayName || a.admobAppId,
          platform: (a.platform ?? "ANDROID").toUpperCase(),
          isLive: true,
          admobAppId: a.admobAppId,
          pangleAppId: a.pangle?.appId ?? null,
          liftoffAppId: a.liftoff?.appId ?? null,
          mintegralAppId: a.mintegral?.appId ?? null,
          mintegralAppKey: null,
          admobStatus: "ok",
          pangleStatus: a.pangle?.status ?? "none",
          liftoffStatus: a.liftoff?.status ?? "none",
          mintegralStatus: a.mintegral?.status ?? "none",
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

    (async () => {
      try {
        const syncRes = await fetch("/api/apps/admob-sync");
        const syncData = await syncRes.json();
        if (syncRes.ok && Array.isArray(syncData.apps)) {
          setApps(mapAdmobApps(syncData.apps));
          return;
        }

        const dbRes = await fetch("/api/apps");
        const dbData = await dbRes.json();
        if (dbRes.ok && Array.isArray(dbData.apps)) {
          setApps(mapDbApps(dbData.apps));
          setError("Không tải được full app list từ AdMob, đang hiển thị app đã sync trong hệ thống.");
        }
      } catch {
        setError("Không tải được danh sách app. Vui lòng thử lại.");
      } finally {
        setAppsLoading(false);
      }
    })();
  },[]);

  const selectedApp = apps.find(a=>a.id===selectedAppId);

  // Available platforms based on selected app
  const available = {
    admob: !!selectedApp?.admobAppId && (selectedApp.admobStatus === "ok" || selectedApp.admobStatus === "verifying"),
    pangle: !!selectedApp?.pangleAppId && selectedApp.pangleStatus==="ok",
    liftoff: !!selectedApp?.liftoffAppId && selectedApp.liftoffStatus==="ok",
    mintegral: !!selectedApp?.mintegralAppId && selectedApp.mintegralStatus==="ok",
  };

  // Auto-adjust platforms when app changes
  useEffect(()=>{
    if(selectedApp) {
      setPlatforms({
        admob: available.admob,
        pangle: available.pangle,
        liftoff: available.liftoff,
        mintegral: available.mintegral,
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[selectedAppId]);

  const parseCSV = useCallback((text:string)=>{
    const lines = text.trim().split("\n");
    const hdr0 = lines[0]?.toLowerCase();
    const isHeader = hdr0?.includes("ad_unit_name") || hdr0?.includes("name");
    const data = isHeader ? lines.slice(1) : lines;
    const hdr = isHeader ? lines[0].split(",").map(h=>h.trim().replace(/^"|"$/g,"").toLowerCase()) : null;
    const ixFmt = hdr ? hdr.indexOf("ad_format") : -1;

    const units:ParsedUnit[] = data.map(line=>{
      const cols = line.split(",").map(c=>c.trim().replace(/^"|"$/g,""));
      const name = cols[0]??"";
      if(!name) return { name, format:"", tier:"ap", valid:false, error:"Tên trống" };
      const fmt = (ixFmt>=0 && cols[ixFmt] ? cols[ixFmt] : null) || detectFormat(name);
      if(!fmt) return { name, format:"", tier:"ap", valid:false, error:"Không detect được format" };
      const tier = detectTier(name);
      return { name, format:fmt.toUpperCase(), tier, valid:true };
    }).filter(u=>u.name);

    setParsed(units);
    if(units.length>0) setStep(1);
  },[]);

  const handleFile = (f:File) => {
    const r = new FileReader();
    r.onload = e => { const t=e.target?.result as string; setCsvText(t); parseCSV(t); };
    r.readAsText(f);
  };

  const downloadTemplate = () => {
    const a = document.createElement("a");
    a.href = "data:text/csv," + encodeURIComponent(CSV_TEMPLATE);
    a.download = "ad_unit_template.csv";
    a.click();
  };

  const handleCreate = async () => {
    const validUnits = parsed.filter(u=>u.valid);
    if(!validUnits.length) { setError("Không có ad unit hợp lệ"); return; }
    if(!selectedApp) { setError("Vui lòng chọn app"); return; }

    setLoading(true); setError(null); setStep(3);
    try {
      let targetAppId = selectedApp.dbId ?? selectedApp.id;

      // If app is only from AdMob list (not yet in local DB), import it first.
      if (!selectedApp.dbId && selectedApp.admobAppId) {
        const importRes = await fetch("/api/apps/admob-sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            admobAppId: selectedApp.admobAppId,
            displayName: selectedApp.name,
            platform: selectedApp.platform,
          }),
        });
        const importData = await importRes.json();
        if (!importRes.ok || !importData?.app?.id) {
          throw new Error(importData?.error ?? "Không thể import app từ AdMob vào hệ thống");
        }
        targetAppId = importData.app.id;
        setApps((prev) =>
          prev.map((a) =>
            a.admobAppId === selectedApp.admobAppId
              ? { ...a, id: targetAppId, dbId: targetAppId }
              : a
          )
        );
        setSelectedAppId(targetAppId);
      }

      const res = await fetch("/api/adunits",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          appId: targetAppId,
          units: validUnits.map(u=>({ name:u.name, format:u.format })),
          platforms,
          rules,
        }),
      });
      const data = await res.json();
      if(!res.ok) throw new Error(data.error??"Tạo thất bại");
      setResults(data.results);
      setStep(4);
    } catch(e:unknown) {
      setError(e instanceof Error ? e.message : "Error");
      setStep(2);
    } finally { setLoading(false); }
  };

  const downloadResults = () => {
    const headers = ["ad_unit_name","ad_format","tier"];
    if(platforms.admob) headers.push("admob_ad_unit_id","admob_status");
    if(platforms.pangle) headers.push("pangle_placement_id","pangle_status");
    if(platforms.liftoff) headers.push("liftoff_placement_id","liftoff_status");
    if(platforms.mintegral) headers.push("mintegral_placement_id","mintegral_status");

    const rows = results.map(r=>{
      const row = [r.name,r.format,r.tier];
      if(platforms.admob) row.push(r.admobAdUnitId??"", r.admobStatus);
      if(platforms.pangle) { const p=r.placements.pangle; row.push(p?.placementId??"", p?.status??"none"); }
      if(platforms.liftoff) { const p=r.placements.liftoff; row.push(p?.placementId??"", p?.status??"none"); }
      if(platforms.mintegral) { const p=r.placements.mintegral; row.push(p?.placementId??"", p?.status??"none"); }
      return row.join(",");
    });

    const csv = headers.join(",") + "\n" + rows.join("\n");
    const a = document.createElement("a");
    a.href = "data:text/csv," + encodeURIComponent(csv);
    a.download = `adunits_result_${selectedApp?.name??""}.csv`;
    a.click();
  };

  const reset = () => { setStep(0); setParsed([]); setCsvText(""); setResults([]); setError(null); };

  const valid = parsed.filter(u=>u.valid);
  const invalid = parsed.filter(u=>!u.valid);
  const STEPS = ["Chọn App","Upload CSV","Cấu hình Rule","Đang tạo","Kết quả"];

  const enabledPlatforms = Object.entries(platforms).filter(([,v])=>v).map(([k])=>k);
  const needsRuleConfig = enabledPlatforms.some(p=>p!=="admob");

  return (
    <div style={{fontFamily:FS,background:C.ink,minHeight:"100vh",color:C.text}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=IBM+Plex+Mono:wght@400;500&family=Instrument+Sans:wght@400;500;600&display=swap');
        *{box-sizing:border-box;}
        input::placeholder{color:${C.text3};}
        input:focus,select:focus,textarea:focus{outline:none!important;border-color:${C.accent}!important;}
        ::-webkit-scrollbar{width:4px;} ::-webkit-scrollbar-thumb{background:${C.border2};border-radius:2px;}
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}} .fu{animation:fadeUp .3s ease;}
        @keyframes spin{to{transform:rotate(360deg)}} .sp{animation:spin .8s linear infinite;display:inline-block;}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}} .pl{animation:pulse 1.4s infinite;}
        table{border-collapse:collapse;width:100%;}
        th{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:${C.text3};padding:9px 14px;text-align:left;border-bottom:1px solid ${C.border};}
        td{font-size:12.5px;color:${C.text2};padding:9px 14px;border-bottom:1px solid ${C.border};}
        tr:last-child td{border-bottom:none;}
        tr:hover td{background:rgba(5,150,105,0.03);}
        select{appearance:none;background-image:url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%2394A3B8' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 12px center;padding-right:32px;}
      `}</style>

      {/* Topbar */}
      <div style={{height:52,background:C.ink2,borderBottom:`1px solid ${C.border}`,
        padding:"0 28px",display:"flex",alignItems:"center",justifyContent:"space-between",
        position:"sticky",top:0,zIndex:20}}>
        <div style={{fontFamily:FD,fontWeight:700,fontSize:15}}>🔲 Tạo Ad Unit / Placement</div>
        {step>0&&<button style={btnG} onClick={reset}>← Bắt đầu lại</button>}
      </div>

      <div className="fu" style={{padding:"28px 32px",maxWidth:960}}>

        {/* Stepper */}
        <div style={{display:"flex",maxWidth:600,marginBottom:32}}>
          {STEPS.map((s,i)=>{
            const done=i<step, act=i===step;
            return (
              <div key={s} style={{flex:1,textAlign:"center",position:"relative"}}>
                {i<STEPS.length-1&&<div style={{position:"absolute",top:13,left:"50%",width:"100%",height:1,background:done?"rgba(5,150,105,0.35)":C.border,zIndex:0}}/>}
                <div style={{width:26,height:26,borderRadius:"50%",margin:"0 auto 6px",
                  border:`1.5px solid ${act?C.accent:done?C.accent:C.border2}`,
                  background:act?C.accent:done?C.accentDim:C.ink2,
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontSize:10,fontWeight:700,position:"relative",zIndex:1,
                  color:act?"#fff":done?C.accent:C.text3,
                  boxShadow:act?`0 0 14px rgba(5,150,105,0.25)`:"none"}}>
                  {done?"✓":i+1}
                </div>
                <div style={{fontSize:10,fontWeight:500,color:act?C.accent:done?C.text2:C.text3}}>{s}</div>
              </div>
            );
          })}
        </div>

        {error&&<div style={alrt(C.red,C.redDim,"rgba(220,38,38,.3)")}>✗ {error}</div>}

        {/* ═══ STEP 0: Select App + Platforms ═══ */}
        {step===0&&(
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}} className="fu">
            <div>
              {/* App selector */}
              <div style={card}>
                <div style={cH}><span style={cT}>Chọn App</span></div>
                <div style={{padding:"18px"}}>
                  {appsLoading?(
                    <div style={{height:40,background:C.border,borderRadius:8,opacity:.5}}/>
                  ):(
                    <>
                      <label style={lbl}>App <span style={{color:C.red}}>*</span></label>
                      <select style={{...inp,cursor:"pointer"}} value={selectedAppId}
                        onChange={e=>setSelectedAppId(e.target.value)}>
                        <option value="">— Chọn app —</option>
                        {apps.map(a=>(
                          <option key={a.id} value={a.id}>
                            {a.name} ({a.platform}){a.dbId ? "" : " • AdMob only"}
                          </option>
                        ))}
                      </select>
                      <div style={{fontSize:11,color:C.text3,marginTop:7}}>
                        Đang hiển thị {apps.length} app từ tài khoản AdMob hiện tại.
                      </div>
                      {selectedApp&&(
                        <div style={{marginTop:12,padding:"10px 12px",background:C.ink3,borderRadius:8,fontSize:12}}>
                          {!selectedApp.dbId && (
                            <div style={{marginBottom:8,color:C.blue}}>
                              App này chưa sync trong hệ thống. Khi tạo ad unit, hệ thống sẽ tự import app trước.
                            </div>
                          )}
                          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                            {(["admob","pangle","liftoff","mintegral"] as const).map(p=>{
                              const ok = available[p];
                              return <span key={p} style={{...chip(ok?C.accent:C.text3,ok?C.accentDim:"rgba(148,163,184,.15)"),fontSize:9}}>
                                {ok?"✓":"—"} {p}
                              </span>;
                            })}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Platform selection */}
              {selectedApp&&(
                <div style={card}>
                  <div style={cH}><span style={cT}>Nền tảng tạo</span></div>
                  <div style={{padding:"18px"}}>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                      {(["admob","pangle","liftoff","mintegral"] as const).map(p=>{
                        const ok = available[p];
                        const on = platforms[p];
                        const ic:Record<string,string> = {admob:"📺",pangle:"🌐",liftoff:"🚀",mintegral:"📊"};
                        return (
                          <div key={p}
                            onClick={()=>ok&&setPlatforms(prev=>({...prev,[p]:!prev[p]}))}
                            style={{display:"flex",alignItems:"center",gap:10,padding:"11px 14px",
                              borderRadius:8,cursor:ok?"pointer":"not-allowed",userSelect:"none",
                              border:`1px solid ${on&&ok?C.accent:C.border2}`,
                              background:on&&ok?C.accentDim:C.ink2,
                              opacity:ok?1:0.45}}>
                            <div style={{width:16,height:16,borderRadius:4,
                              border:`1.5px solid ${on&&ok?C.accent:C.border2}`,
                              background:on&&ok?C.accent:"transparent",
                              display:"flex",alignItems:"center",justifyContent:"center"}}>
                              {on&&ok&&<svg width={10} height={10} fill="none" stroke="#fff" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>}
                            </div>
                            <span style={{fontSize:14}}>{ic[p]}</span>
                            <span style={{fontSize:13,fontWeight:500,textTransform:"capitalize",color:ok?C.text:C.text3}}>{p}</span>
                            {!ok&&<span style={{fontSize:9,color:C.text3}}>(chưa có)</span>}
                          </div>
                        );
                      })}
                    </div>
                    {!enabledPlatforms.length&&(
                      <div style={{...alrt(C.yellow,C.yellowDim,"rgba(217,119,6,.3)"),marginTop:12,marginBottom:0}}>⚠ Chọn ít nhất 1 nền tảng.</div>
                    )}
                  </div>
                </div>
              )}

              {selectedApp&&enabledPlatforms.length>0&&(
                <button style={{...btnP(false),width:"100%"}} onClick={()=>setStep(1)}>
                  Upload CSV →
                </button>
              )}
            </div>

            {/* Right: info panel */}
            <div style={{...card,alignSelf:"start"}}>
              <div style={cH}><span style={cT}>Hướng dẫn</span></div>
              <div style={{padding:"18px"}}>
                <div style={{fontSize:13,color:C.text2,lineHeight:1.7,marginBottom:16}}>
                  <strong>Luồng:</strong><br/>
                  1. Chọn app đã tạo<br/>
                  2. Chọn nền tảng muốn tạo ad unit / placement<br/>
                  3. Upload CSV danh sách ad units<br/>
                  4. Cấu hình rule tạo cho từng nền tảng<br/>
                  5. Hệ thống tự tạo trên tất cả nền tảng
                </div>
                <div style={{borderTop:`1px solid ${C.border}`,paddingTop:14}}>
                  <div style={{fontSize:12,fontWeight:600,color:C.text2,marginBottom:10}}>Ad Name Rule:</div>
                  <div style={{fontSize:11.5,color:C.text3,lineHeight:1.7}}>
                    • Chứa <code style={{background:C.ink3,padding:"1px 4px",borderRadius:3}}>_high</code> → tier <strong style={{color:C.red}}>HIGH</strong> (eCPM floor cao)<br/>
                    • Chứa <code style={{background:C.ink3,padding:"1px 4px",borderRadius:3}}>_med</code> → tier <strong style={{color:C.yellow}}>MEDIUM</strong><br/>
                    • Còn lại → tier <strong style={{color:C.accent}}>ALL PRICE</strong>
                  </div>
                </div>
                <div style={{borderTop:`1px solid ${C.border}`,paddingTop:14,marginTop:14}}>
                  <div style={{fontSize:12,fontWeight:600,color:C.text2,marginBottom:10}}>Format detect:</div>
                  {[["inter/full/fs","INTERSTITIAL"],["reward/rv/video","REWARDED"],["open/splash/aoa","APP_OPEN"],["mrec/banner/300x250","BANNER"],["native/feed/card","NATIVE"]].map(([k,v])=>(
                    <div key={k} style={{display:"flex",justifyContent:"space-between",fontSize:11.5,marginBottom:6}}>
                      <span style={{fontFamily:FM,color:C.text3}}>{k}</span>
                      <span style={{color:C.accent,fontWeight:600}}>→ {v}</span>
                    </div>
                  ))}
                </div>
                <div style={{borderTop:`1px solid ${C.border}`,paddingTop:14,marginTop:14}}>
                  <div style={{fontSize:12,fontWeight:600,color:C.text2,marginBottom:10}}>File mẫu CSV:</div>
                  <div style={{fontSize:11.5,color:C.text3,marginBottom:12,lineHeight:1.6}}>
                    Tải file mẫu để điền danh sách ad units theo đúng định dạng.
                  </div>
                  <button
                    onClick={downloadTemplate}
                    style={{display:"flex",alignItems:"center",gap:8,width:"100%",padding:"10px 14px",
                      borderRadius:8,border:`1px solid ${C.accent}`,background:C.accentDim,
                      color:C.accent,fontSize:12.5,fontWeight:700,cursor:"pointer",fontFamily:FS,
                      justifyContent:"center"}}>
                    <svg width={14} height={14} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path d="M12 3v13M7 11l5 5 5-5"/><path d="M5 21h14"/>
                    </svg>
                    Tải CSV mẫu
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══ STEP 1: Upload CSV ═══ */}
        {step===1&&(
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}} className="fu">
            <div>
              {/* App info */}
              <div style={alrt(C.blue,C.blueDim,"rgba(37,99,235,.25)")}>
                📱 App: <strong>{selectedApp?.name}</strong> ({selectedApp?.platform})
                &nbsp;•&nbsp; Nền tảng: {enabledPlatforms.map(p=>p.charAt(0).toUpperCase()+p.slice(1)).join(", ")}
              </div>

              {/* Upload area */}
              <div style={card}>
                <div style={cH}>
                  <span style={cT}>Upload CSV</span>
                  <button style={{...btnG,fontSize:11,padding:"5px 10px"}} onClick={downloadTemplate}>
                    ⬇ Tải file mẫu
                  </button>
                </div>
                <div style={{padding:"18px"}}>
                  <input type="file" ref={fileRef} style={{display:"none"}} accept=".csv,.txt"
                    onChange={e=>e.target.files?.[0]&&handleFile(e.target.files[0])}/>
                  <div
                    onDragOver={e=>{e.preventDefault();setDrag(true);}}
                    onDragLeave={()=>setDrag(false)}
                    onDrop={e=>{e.preventDefault();setDrag(false);e.dataTransfer.files[0]&&handleFile(e.dataTransfer.files[0]);}}
                    onClick={()=>fileRef.current?.click()}
                    style={{border:`2px dashed ${drag?C.accent:C.border2}`,borderRadius:10,padding:"32px 20px",
                      textAlign:"center",cursor:"pointer",background:drag?C.accentDim:"transparent",transition:"all .2s"}}>
                    <div style={{fontSize:30,marginBottom:10}}>📄</div>
                    <div style={{fontSize:13.5,fontWeight:600,color:C.text,marginBottom:4}}>Kéo thả CSV vào đây</div>
                    <div style={{fontSize:12,color:C.text3}}>hoặc click để chọn file</div>
                  </div>
                  <div style={{margin:"14px 0",borderTop:`1px solid ${C.border}`}}/>
                  <div style={{fontSize:12,color:C.text3,marginBottom:8}}>Hoặc nhập trực tiếp:</div>
                  <textarea style={{...inp,fontFamily:FM,fontSize:11.5,resize:"vertical"} as React.CSSProperties}
                    placeholder={"ad_unit_name,ad_format\ninter_gameplay,INTERSTITIAL\nrewarded_extra,REWARDED"}
                    rows={4} value={csvText} onChange={e=>setCsvText(e.target.value)}/>
                  {csvText&&!parsed.length&&(
                    <button style={{...btnG,marginTop:10}} onClick={()=>parseCSV(csvText)}>→ Parse CSV</button>
                  )}
                </div>
              </div>

              {parsed.length>0&&(
                <div style={{display:"flex",gap:10}}>
                  <button style={{...btnP(!valid.length),flex:1}}
                    disabled={!valid.length}
                    onClick={()=>needsRuleConfig?setStep(2):handleCreate()}>
                    {needsRuleConfig?`Cấu hình Rule →`:`Tạo ${valid.length} Ad Units →`}
                  </button>
                  <button style={btnG} onClick={()=>{setParsed([]);setCsvText("");}}>← Upload lại</button>
                </div>
              )}
            </div>

            {/* Preview table */}
            {parsed.length>0?(
              <div>
                {/* Summary */}
                <div style={{display:"flex",gap:10,marginBottom:12}}>
                  {[{l:"Tổng",v:parsed.length,c:C.text2},{l:"✓ Hợp lệ",v:valid.length,c:C.accent},{l:"✗ Lỗi",v:invalid.length,c:C.red}].map(s=>(
                    <div key={s.l} style={{padding:"10px 16px",background:C.panel,border:`1px solid ${C.border}`,borderRadius:10,flex:1}}>
                      <div style={{fontSize:9.5,color:C.text3,textTransform:"uppercase",letterSpacing:".1em",marginBottom:3}}>{s.l}</div>
                      <div style={{fontFamily:FD,fontSize:22,fontWeight:800,color:s.c}}>{s.v}</div>
                    </div>
                  ))}
                </div>
                <div style={{...card,marginBottom:0}}>
                  <div style={cH}><span style={cT}>Preview CSV ({parsed.length} hàng)</span></div>
                  <div style={{maxHeight:400,overflowY:"auto"}}>
                    <table>
                      <thead><tr><th>#</th><th>Tên Ad Unit</th><th>Format</th><th>Tier</th><th>Status</th></tr></thead>
                      <tbody>
                        {parsed.map((u,i)=>(
                          <tr key={i}>
                            <td style={{color:C.text3,fontFamily:FM,fontSize:10.5}}>{i+1}</td>
                            <td style={{fontFamily:FM,fontSize:11.5,color:C.text}}>{u.name}</td>
                            <td>{u.format?<span style={{...chip(...(FORMAT_COLORS[u.format]??[C.text2,"rgba(139,147,160,.15)"])),fontSize:9}}>{u.format}</span>:<span style={{color:C.text3,fontSize:11}}>—</span>}</td>
                            <td>{u.valid?<span style={{...chip(...(TIER_COLORS[u.tier]??[C.text3,"rgba(148,163,184,.15)"])),fontSize:9}}>{u.tier.toUpperCase()}</span>:"—"}</td>
                            <td>{u.valid?<span style={{...chip(C.accent,C.accentDim),fontSize:9}}>✓ OK</span>:<span style={{...chip(C.red,C.redDim),fontSize:9}} title={u.error}>✗ {u.error}</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ):(
              /* CSV guide (when no data yet) */
              <div style={{...card,alignSelf:"start"}}>
                <div style={cH}><span style={cT}>Cấu trúc CSV</span></div>
                <div style={{padding:"18px"}}>
                  {[{col:"ad_unit_name",req:true,desc:"Tên ad unit - dùng detect format + tier"},
                    {col:"ad_format",req:false,desc:"INTERSTITIAL · REWARDED · BANNER · NATIVE · APP_OPEN"},
                  ].map(f=>(
                    <div key={f.col} style={{display:"flex",gap:10,marginBottom:14,paddingBottom:14,borderBottom:`1px solid ${C.border}`}}>
                      <span style={{fontFamily:FM,fontSize:11,background:C.ink3,padding:"3px 8px",borderRadius:4,color:C.text2,border:`1px solid ${C.border2}`,flexShrink:0,height:"fit-content"}}>{f.col}</span>
                      <div>
                        <div style={{fontSize:12,color:C.text3,marginBottom:4}}>{f.desc}</div>
                        <span style={{...chip(f.req?C.yellow:C.text3,f.req?C.yellowDim:"rgba(78,87,104,.2)")}}>{f.req?"Bắt buộc":"Tùy chọn"}</span>
                      </div>
                    </div>
                  ))}
                  <div style={{marginTop:12,padding:"10px 13px",background:C.ink3,borderRadius:7,fontSize:10.5,color:C.text3,fontFamily:FM,lineHeight:1.8}}>
                    ad_unit_name,ad_format<br/>
                    inter_high,INTERSTITIAL<br/>
                    rewarded_normal,REWARDED<br/>
                    banner_bottom,BANNER
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══ STEP 2: Configure Rules ═══ */}
        {step===2&&(
          <div style={{maxWidth:680}} className="fu">
            <div style={alrt(C.blue,C.blueDim,"rgba(37,99,235,.25)")}>
              📱 <strong>{selectedApp?.name}</strong> • {valid.length} ad units • Formats: {[...new Set(valid.map(u=>u.format))].join(", ")}
            </div>

            {/* AdMob info */}
            {platforms.admob&&(
              <div style={card}>
                <div style={cH}><span style={cT}>📺 AdMob</span></div>
                <div style={{padding:"18px"}}>
                  <div style={{fontSize:12.5,color:C.text2,lineHeight:1.6}}>
                    Rule: <strong>1 ad unit → 1 Ad Unit ID</strong><br/>
                    <span style={{color:C.text3}}>Ad units có tier <span style={{color:C.red,fontWeight:600}}>HIGH</span> sẽ tự động bật eCPM Floor → Google Optimized → High Floor.</span>
                  </div>
                  <div style={{marginTop:10,display:"flex",gap:6,flexWrap:"wrap"}}>
                    {Object.entries(valid.reduce((a,u)=>{a[u.tier]=(a[u.tier]??0)+1;return a;},{} as Record<string,number>)).map(([tier,cnt])=>(
                      <span key={tier} style={{...chip(...(TIER_COLORS[tier]??[C.text3,"rgba(148,163,184,.15)"])),fontSize:10,padding:"3px 10px"}}>
                        {tier.toUpperCase()}: {cnt}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Pangle / Liftoff / Mintegral rules */}
            {(["pangle","liftoff","mintegral"] as const).filter(p=>platforms[p]).map(p=>{
              const ic:Record<string,string> = {pangle:"🌐",liftoff:"🚀",mintegral:"📊"};
              const formats = [...new Set(valid.map(u=>u.format))];
              return (
                <div key={p} style={card}>
                  <div style={cH}><span style={cT}>{ic[p]} {p.charAt(0).toUpperCase()+p.slice(1)}</span></div>
                  <div style={{padding:"18px"}}>
                    <label style={lbl}>Rule tạo Placement</label>
                    <div style={{display:"flex",gap:10,marginBottom:12}}>
                      {([["per_unit","1 ad unit → 1 placement"],["per_format","1 ad format → 1 placement"]] as const).map(([val,label])=>(
                        <div key={val}
                          onClick={()=>setRules(prev=>({...prev,[p]:val}))}
                          style={{display:"flex",alignItems:"center",gap:8,padding:"10px 16px",
                            borderRadius:8,cursor:"pointer",userSelect:"none",flex:1,
                            border:`1px solid ${rules[p]===val?C.accent:C.border2}`,
                            background:rules[p]===val?C.accentDim:"transparent"}}>
                          <div style={{width:14,height:14,borderRadius:"50%",border:"1.5px solid currentColor",
                            color:rules[p]===val?C.accent:C.text3,
                            display:"flex",alignItems:"center",justifyContent:"center"}}>
                            {rules[p]===val&&<div style={{width:6,height:6,borderRadius:"50%",background:"currentColor"}}/>}
                          </div>
                          <span style={{fontSize:12.5,fontWeight:500,color:rules[p]===val?C.text:C.text2}}>{label}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{fontSize:11,color:C.text3,padding:"8px 10px",background:C.ink3,borderRadius:6}}>
                      {rules[p]==="per_unit"
                        ? <>Sẽ tạo <strong style={{color:C.text2}}>{valid.length}</strong> placements (1 per ad unit)</>
                        : <>Sẽ tạo <strong style={{color:C.text2}}>{formats.length}</strong> placements ({formats.join(", ")})</>
                      }
                    </div>
                  </div>
                </div>
              );
            })}

            <div style={{display:"flex",gap:10}}>
              <button style={{...btnP(false),flex:1}} onClick={handleCreate}>
                ⚡ Tạo tất cả →
              </button>
              <button style={btnG} onClick={()=>setStep(1)}>← Quay lại</button>
            </div>
          </div>
        )}

        {/* ═══ STEP 3: Creating ═══ */}
        {step===3&&loading&&(
          <div style={{...card,maxWidth:480}} className="fu">
            <div style={{padding:"52px 32px",textAlign:"center"}}>
              <div className="sp" style={{fontSize:38,color:C.accent,marginBottom:16}}>⟳</div>
              <div style={{fontFamily:FD,fontSize:18,fontWeight:800,marginBottom:8}}>Đang tạo Ad Units & Placements…</div>
              <div style={{fontSize:12.5,color:C.text3,lineHeight:1.6}}>
                Đang gọi API cho {valid.length} ad units trên {enabledPlatforms.length} nền tảng
              </div>
              <div style={{height:3,background:C.border,borderRadius:2,maxWidth:280,margin:"24px auto 0",overflow:"hidden"}}>
                <div className="pl" style={{height:"100%",width:"60%",background:`linear-gradient(90deg,${C.accent},${C.blue})`,borderRadius:2}}/>
              </div>
            </div>
          </div>
        )}

        {/* ═══ STEP 4: Results ═══ */}
        {step===4&&(
          <div className="fu">
            {/* Summary */}
            <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap"}}>
              {[
                {l:"Ad Units",v:results.length,c:C.text2},
                ...(platforms.admob?[{l:"AdMob OK",v:results.filter(r=>r.admobStatus==="ok").length,c:C.accent}]:[]),
                ...(["pangle","liftoff","mintegral"] as const)
                  .filter(p=>platforms[p]&&results.some(r=>r.placements[p]))
                  .map(p=>({l:`${p.charAt(0).toUpperCase()+p.slice(1)} OK`,v:results.filter(r=>r.placements[p]?.status==="ok").length,c:C.accent})),
              ].map(s=>(
                <div key={s.l} style={{padding:"12px 18px",background:C.panel,border:`1px solid ${C.border}`,borderRadius:10}}>
                  <div style={{fontSize:9.5,color:C.text3,textTransform:"uppercase",letterSpacing:".1em",marginBottom:3}}>{s.l}</div>
                  <div style={{fontFamily:FD,fontSize:24,fontWeight:800,color:s.c}}>{s.v}</div>
                </div>
              ))}
            </div>

            <div style={alrt(C.accent,C.accentDim,"rgba(5,150,105,.3)")}>
              ✓ Hoàn tất! Đã tạo ad units/placements cho {enabledPlatforms.join(", ")}.
            </div>

            {/* Results table */}
            <div style={card}>
              <div style={cH}>
                <span style={cT}>Kết quả chi tiết</span>
                <button style={{...btnG,fontSize:11}} onClick={downloadResults}>⬇ Tải CSV kết quả</button>
              </div>
              <div style={{maxHeight:500,overflowY:"auto"}}>
                <table>
                  <thead>
                    <tr>
                      <th>Tên</th><th>Format</th><th>Tier</th>
                      {platforms.admob&&<th>AdMob ID</th>}
                      {platforms.pangle&&<th>Pangle ID</th>}
                      {platforms.liftoff&&<th>Liftoff ID</th>}
                      {platforms.mintegral&&<th>Mintegral ID</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r,i)=>(
                      <tr key={i}>
                        <td style={{fontFamily:FM,fontSize:11,color:C.text,fontWeight:500}}>{r.name}</td>
                        <td><span style={{...chip(...(FORMAT_COLORS[r.format]??[C.text2,"rgba(139,147,160,.15)"])),fontSize:9}}>{r.format}</span></td>
                        <td><span style={{...chip(...(TIER_COLORS[r.tier]??[C.text3,"rgba(148,163,184,.15)"])),fontSize:9}}>{r.tier.toUpperCase()}</span></td>
                        {platforms.admob&&(
                          <td>
                            {r.admobStatus==="ok"
                              ?<span style={{fontFamily:FM,fontSize:10,color:C.accent}} title={r.admobAdUnitId}>{r.admobAdUnitId?.split("/").pop()}</span>
                              :r.admobStatus==="error"
                                ?<span style={{...chip(C.red,C.redDim),fontSize:9}} title={r.admobError}>✗ Error</span>
                                :<span style={{color:C.text3}}>—</span>
                            }
                          </td>
                        )}
                        {platforms.pangle&&(
                          <td>
                            {r.placements.pangle?.status==="ok"
                              ?<span style={{fontFamily:FM,fontSize:10,color:C.accent}}>{r.placements.pangle.placementId}</span>
                              :r.placements.pangle?.status==="error"
                                ?<span style={{...chip(C.red,C.redDim),fontSize:9}} title={r.placements.pangle.error}>✗ Error</span>
                                :<span style={{color:C.text3}}>—</span>
                            }
                          </td>
                        )}
                        {platforms.liftoff&&(
                          <td>
                            {r.placements.liftoff?.status==="ok"
                              ?<span style={{fontFamily:FM,fontSize:10,color:C.accent}}>{r.placements.liftoff.placementId}</span>
                              :r.placements.liftoff?.status==="error"
                                ?<span style={{...chip(C.red,C.redDim),fontSize:9}} title={r.placements.liftoff.error}>✗ Error</span>
                                :<span style={{color:C.text3}}>—</span>
                            }
                          </td>
                        )}
                        {platforms.mintegral&&(
                          <td>
                            {r.placements.mintegral?.status==="ok"
                              ?<span style={{fontFamily:FM,fontSize:10,color:C.accent}}>{r.placements.mintegral.placementId}</span>
                              :r.placements.mintegral?.status==="error"
                                ?<span style={{...chip(C.red,C.redDim),fontSize:9}} title={r.placements.mintegral.error}>✗ Error</span>
                                :<span style={{color:C.text3}}>—</span>
                            }
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Action buttons */}
            <div style={{display:"flex",gap:10}}>
              <button style={{...btnP(false),flex:1}} onClick={()=>{
                const mappingData = results.map(r=>{
                  const row:Record<string,string> = {
                    ad_unit_name: r.name,
                    admob_unit_id: r.admobAdUnitId??"",
                    ad_format: r.format,
                  };
                  if(r.placements.pangle?.placementId) row.pangle_placement_id = r.placements.pangle.placementId;
                  if(r.placements.liftoff?.placementId) row.liftoff_placement_id = r.placements.liftoff.placementId;
                  if(r.placements.mintegral?.placementId) row.mintegral_placement_id = r.placements.mintegral.placementId;
                  return row;
                });
                try { sessionStorage.setItem("adunit_mapping_data", JSON.stringify(mappingData)); } catch {}
                try { sessionStorage.setItem("adunit_mapping_app", JSON.stringify(selectedApp)); } catch {}
                router.push("/dashboard/mapping");
              }}>
                ⚡ Auto Mapping →
              </button>
              <button style={btnG} onClick={downloadResults}>⬇ Tải CSV</button>
              <button style={btnG} onClick={reset}>+ Tạo thêm</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdUnitsPage() {
  return <Suspense><AdUnitsContent /></Suspense>;
}
