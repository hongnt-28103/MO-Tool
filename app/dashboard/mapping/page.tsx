"use client";
import { useState, useCallback, useRef, useEffect } from "react";

// ─── Design tokens ────────────────────────────────────────────
const C = {
  ink:       "#F8FAFC", ink2: "#FFFFFF", ink3: "#EFF2F6",
  panel:     "#FFFFFF", border: "#E2E8F0", border2: "#CBD5E1",
  text:      "#0F172A", text2: "#475569", text3: "#94A3B8",
  accent:    "#059669", accentDim: "rgba(5,150,105,0.10)", accentGlow: "rgba(5,150,105,0.20)",
  blue:      "#2563EB", blueDim: "rgba(37,99,235,0.10)",
  yellow:    "#D97706", yellowDim: "rgba(217,119,6,0.10)",
  red:       "#DC2626", redDim: "rgba(220,38,38,0.10)",
};
const FD = "'Syne','Inter',system-ui,sans-serif";
const FS = "'Instrument Sans','Inter',system-ui,sans-serif";
const FM = "'IBM Plex Mono','Courier New',monospace";

// ─── Types ────────────────────────────────────────────────────
type AdUnit = {
  name: string; adUnitId: string; format?: string;
  panglePlacementId?: string; liftoffReferenceId?: string; liftoffAppId?: string;
  mintegralPlacementId?: string; mintegralUnitId?: string; mintegralAppId?: string;
  mintegralAppKey?: string; metaPlacementId?: string;
};
type AppRecord = {
  id: string;
  name: string;
  platform: string;
  admobStatus: string;
  pangleStatus: string;
  liftoffStatus: string;
  mintegralStatus: string;
  admobAppId: string | null;
  pangleAppId: string | null;
  liftoffAppId: string | null;
  mintegralAppId: string | null;
};
type CG  = { name: string; mode: "INCLUDE"|"EXCLUDE"; countries: string[] };
type UIS = { groupBy: "AD_FORMAT"|"AD_UNIT"; ecpmFloor: boolean; countryMode: "ALL"|"GROUPS" };

const FORMAT_DETECT: [string, RegExp][] = [
  ["INTERSTITIAL", /inter/i],
  ["REWARDED", /reward/i],
  ["APP_OPEN", /aoa/i],
  ["BANNER", /banner/i],
  ["NATIVE", /native/i],
];

const CSV_TEMPLATE = [
  "ad_unit_name,admob_ad_unit_id,mintegral_app_key,mintegral_app_id,mintegral_placement_id,mintegral_ad_unit_id,liftoff_app_id,liftoff_placement_reference_id,pangle_app_id,pangle_ad_placement_id,meta_placement_id",
  "101-spl-a-banner-new,ca-app-pub-xxx/111,mt_app_key_001,mt_app_id_001,mt_placement_001,mt_unit_001,lf_app_001,lf_ref_001,pa_app_001,123456,meta_placement_001",
].join("\n");

// ─── Scenario ─────────────────────────────────────────────────
const LABELS: Record<string,string> = {
  S1:"S1 — Mỗi ad unit → 1 group riêng. Toàn cầu.",
  S2:"S2 — Gom theo ad format, không phân biệt floor. Toàn cầu.",
  S3:"S3 — Gom theo ad format + eCPM floor tier. Toàn cầu.",
  S4:"S4 — Mỗi ad unit × mỗi country group → 1 group.",
  S5:"S5 — Gom theo ad format, không phân biệt floor. Theo country groups.",
  S6:"S6 — Gom theo ad format + eCPM floor tier. Theo country groups.",
};
const resolve = (u: UIS) =>
  u.groupBy==="AD_UNIT" ? (u.countryMode==="ALL"?"S1":"S4")
  : u.countryMode==="ALL" ? (u.ecpmFloor?"S3":"S2") : (u.ecpmFloor?"S6":"S5");

// ─── Style helpers ────────────────────────────────────────────
const s = {
  card: { background:C.panel, border:`1px solid ${C.border}`, borderRadius:12, overflow:"hidden", marginBottom:16 } as React.CSSProperties,
  cH:   { padding:"13px 18px", borderBottom:`1px solid ${C.border}`, display:"flex", alignItems:"center", justifyContent:"space-between" } as React.CSSProperties,
  cT:   { fontFamily:FD, fontWeight:700, fontSize:13, color:C.text } as React.CSSProperties,
  cB:   { padding:"18px" } as React.CSSProperties,
  inp:  { width:"100%", background:C.ink2, border:`1px solid ${C.border2}`, borderRadius:8, padding:"9px 12px", fontSize:13, color:C.text, fontFamily:FS, outline:"none", boxSizing:"border-box" } as React.CSSProperties,
  lbl:  { display:"block", fontSize:11, fontWeight:600, color:C.text2, textTransform:"uppercase" as const, letterSpacing:"0.08em", marginBottom:6 },
  btnP: { display:"inline-flex", alignItems:"center", gap:8, padding:"10px 20px", borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer", border:"none", background:C.accent, color:C.ink, fontFamily:FS, whiteSpace:"nowrap" as const } as React.CSSProperties,
  btnG: { display:"inline-flex", alignItems:"center", gap:8, padding:"7px 13px", borderRadius:8, fontSize:12, fontWeight:600, cursor:"pointer", background:"transparent", color:C.text2, border:`1px solid ${C.border2}`, fontFamily:FS, whiteSpace:"nowrap" as const } as React.CSSProperties,
  chip: (col:string, bg:string) => ({ display:"inline-flex", alignItems:"center", padding:"2px 8px", borderRadius:99, fontSize:10, fontWeight:700, textTransform:"uppercase" as const, letterSpacing:"0.06em", color:col, background:bg }) as React.CSSProperties,
  alrt: (col:string, bg:string, bc:string) => ({ padding:"11px 14px", borderRadius:8, fontSize:12.5, display:"flex", alignItems:"flex-start", gap:9, lineHeight:"1.5", color:col, background:bg, border:`1px solid ${bc}`, marginBottom:14 }) as React.CSSProperties,
};

// ─── Country Group Editor ─────────────────────────────────────
function CGEditor({ groups, onChange }: { groups: CG[]; onChange:(g:CG[])=>void }) {
  const [ti, setTi] = useState<Record<number,string>>({});

  const add = (i:number) => {
    const raw = (ti[i]??"").toUpperCase().trim();
    const codes = raw.split(",").map(c=>c.trim()).filter(c=>/^[A-Z]{2}$/.test(c));
    if (!codes.length) return;
    const u=[...groups]; const ex=new Set(u[i].countries);
    codes.forEach(c=>ex.add(c)); u[i]={...u[i], countries:[...ex]};
    onChange(u); setTi(p=>({...p,[i]:""}));
  };
  const rmTag=(gi:number,cc:string)=>{const u=[...groups];u[gi]={...u[gi],countries:u[gi].countries.filter(c=>c!==cc)};onChange(u);};

  const incl = groups.filter(g=>g.mode==="INCLUDE").flatMap(g=>g.countries);
  const dups = new Set(incl.filter((c,i)=>incl.indexOf(c)!==i));

  return (
    <div>
      {dups.size>0 && <div style={s.alrt(C.yellow,C.yellowDim,"rgba(255,216,77,0.3)")}>⚠ Country code [{[...dups].join(", ")}] xuất hiện ở nhiều INCLUDE group.</div>}
      {groups.map((g,gi)=>(
        <div key={gi} style={{background:C.ink2,border:`1px solid ${C.border2}`,borderRadius:8,padding:14,marginBottom:10}}>
          <div style={{display:"flex",gap:8,marginBottom:10,alignItems:"center"}}>
            <input style={{...s.inp,flex:1,fontSize:12}} placeholder="Tên group: USCA, SEA, ROW..."
              value={g.name}
              onChange={e=>{const u=[...groups];u[gi]={...u[gi],name:e.target.value};onChange(u);}}/>
            {(["INCLUDE","EXCLUDE"] as const).map(m=>(
              <div key={m} onClick={()=>{const u=[...groups];u[gi]={...u[gi],mode:m};onChange(u);}}
                style={{padding:"5px 10px",borderRadius:6,fontSize:11,fontWeight:600,cursor:"pointer",userSelect:"none",
                  border:`1px solid ${g.mode===m?(m==="INCLUDE"?C.accent:C.red):C.border2}`,
                  background:g.mode===m?(m==="INCLUDE"?C.accentDim:C.redDim):"transparent",
                  color:g.mode===m?(m==="INCLUDE"?C.accent:C.red):C.text2}}>
                {m}
              </div>
            ))}
            <button style={{...s.btnG,padding:"5px 9px",fontSize:11,color:C.red,borderColor:"transparent",background:C.redDim}}
              onClick={()=>onChange(groups.filter((_,i)=>i!==gi))}>✕</button>
          </div>
          <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:8}}>
            {g.countries.map(cc=>(
              <span key={cc} onClick={()=>rmTag(gi,cc)}
                style={{display:"inline-block",padding:"2px 8px",fontFamily:FM,fontSize:11,
                  background:g.mode==="INCLUDE"?C.accentDim:C.redDim,
                  border:`1px solid ${g.mode==="INCLUDE"?"rgba(79,240,180,0.3)":"rgba(255,95,95,0.3)"}`,
                  borderRadius:4,color:g.mode==="INCLUDE"?C.accent:C.red,cursor:"pointer"}}>
                {cc} ×
              </span>
            ))}
            {g.countries.length===0&&<span style={{fontSize:11,color:C.text3,fontStyle:"italic"}}>Chưa có quốc gia nào</span>}
          </div>
          <div style={{display:"flex",gap:7}}>
            <input style={{...s.inp,fontFamily:FM,fontSize:12,flex:1}} placeholder="US, VN, JP — ISO alpha-2"
              value={ti[gi]??""} onChange={e=>setTi(p=>({...p,[gi]:e.target.value.toUpperCase()}))}
              onKeyDown={e=>{if(e.key==="Enter"||e.key===","){e.preventDefault();add(gi);}}}/>
            <button style={s.btnG} onClick={()=>add(gi)}>+ Add</button>
          </div>
        </div>
      ))}
      <button style={s.btnG} onClick={()=>onChange([...groups,{name:"",mode:"INCLUDE",countries:[]}])}>+ Thêm nhóm</button>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────
export default function MappingPage() {
  const [step,   setStep]   = useState<0|1|2|3>(0);
  const [units,  setUnits]  = useState<AdUnit[]>([]);
  const [code,   setCode]   = useState("");
  const [apps, setApps] = useState<AppRecord[]>([]);
  const [appsLoading, setAppsLoading] = useState(true);
  const [selectedAppId, setSelectedAppId] = useState("");
  const [ui,     setUi]     = useState<UIS>({groupBy:"AD_FORMAT",ecpmFloor:true,countryMode:"ALL"});
  const [cgs,    setCgs]    = useState<CG[]>([]);
  const [nets,   setNets]   = useState(["pangle","liftoff","mintegral"]);
  const [detectedNets, setDetectedNets] = useState<string[]>([]);
  const [sdkKey, setSdkKey] = useState("");
  const [prev,   setPrev]   = useState<any>(null);
  const [res,    setRes]    = useState<any>(null);
  const [loading,setLoading]= useState(false);
  const [err,    setErr]    = useState<string|null>(null);
  const [drag,   setDrag]   = useState(false);
  const [autoLoaded, setAutoLoaded] = useState(false);
  const fRef = useRef<HTMLInputElement>(null);

  useEffect(()=>{
    fetch("/api/apps")
      .then((r)=>r.json())
      .then((d)=>{ if (d.apps) setApps(d.apps); })
      .catch(()=>{})
      .finally(()=>setAppsLoading(false));
  },[]);

  const selectedApp = apps.find((a)=>a.id===selectedAppId);

  // Auto-load from sessionStorage (from ad unit creation flow)
  useEffect(()=>{
    try {
      const raw = sessionStorage.getItem("adunit_mapping_data");
      const appRaw = sessionStorage.getItem("adunit_mapping_app");
      if(raw){
        const data = JSON.parse(raw) as Array<Record<string,string>>;
        const parsed: AdUnit[] = data.map(r=>({
          name: r.ad_unit_name??"",
          adUnitId: r.admob_unit_id??"",
          format: r.ad_format,
          panglePlacementId: r.pangle_placement_id,
          liftoffReferenceId: r.liftoff_placement_id,
          mintegralPlacementId: r.mintegral_placement_id,
          metaPlacementId: r.meta_placement_id,
        })).filter(u=>u.name&&u.adUnitId);
        if(parsed.length>0){
          setUnits(parsed);
          setAutoLoaded(true);
          if(appRaw){
            try {
              const app = JSON.parse(appRaw);
              if(app.name) setCode(app.name);
              if(app.id) setSelectedAppId(app.id);
            } catch{}
          }
        }
        sessionStorage.removeItem("adunit_mapping_data");
        sessionStorage.removeItem("adunit_mapping_app");
      }
    } catch{}
  },[]);

  useEffect(()=>{
    if (!selectedApp) return;
    setCode((prevCode)=>prevCode || selectedApp.name);
  },[selectedApp]);

  const sc = resolve(ui);
  const dupNames = cgs.map(g=>g.name).filter((n,i,a)=>n&&a.indexOf(n)!==i);
  const networkReady = {
    pangle: units.some((u)=>!!u.panglePlacementId),
    liftoff: units.some((u)=>!!u.liftoffReferenceId),
    mintegral: units.some((u)=>!!u.mintegralPlacementId),
    meta: units.some((u)=>!!u.metaPlacementId),
    applovin: !!sdkKey,
  };
  const canPrev  = (ui.countryMode==="ALL" || (cgs.length>0 && cgs.every(g=>g.name&&g.countries.length>0) && !dupNames.length))
    && !!selectedAppId
    && units.length>0
    && !!code.trim()
    && nets.length>0
    && nets.some((n)=>networkReady[n as keyof typeof networkReady]);

  const parseCSV = useCallback((text:string)=>{
    const lines = text.trim().split("\n").filter(Boolean);
    if (!lines.length) return;
    const hdr   = lines[0]?.split(",").map(h=>h.trim().replace(/^"|"$/g,"").toLowerCase());
    if(!hdr) return;
    const has   = hdr.some(h=>["ad_unit_name","admob_unit_id","admob_ad_unit_id"].includes(h));
    const data  = has ? lines.slice(1) : lines;
    const ix    = (k:string)=>hdr.indexOf(k);
    const detectFormat = (name:string) => {
      for (const [fmt, re] of FORMAT_DETECT) if (re.test(name)) return fmt;
      return "INTERSTITIAL";
    };

    const parsed: AdUnit[] = data.map(line=>{
      const c=line.split(",").map(x=>x.trim().replace(/^"|"$/g,""));
      const g=(k:string,fb?:number)=>{ const i=ix(k); return i>=0?c[i]||undefined:(fb!==undefined?c[fb]:undefined); };
      const name = g("ad_unit_name",0)??"";
      const format = g("ad_format") ?? detectFormat(name);
      return {
        name,
        adUnitId:              g("admob_ad_unit_id") ?? g("admob_unit_id",1) ?? "",
        format,
        panglePlacementId:     g("pangle_ad_placement_id") ?? g("pangle_placement_id"),
        liftoffReferenceId:    g("liftoff_placement_reference_id") ?? g("liftoff_placement_id"),
        liftoffAppId:          g("liftoff_app_id"),
        mintegralPlacementId:  g("mintegral_placement_id"),
        mintegralUnitId:       g("mintegral_ad_unit_id") ?? g("mintegral_unit_id"),
        mintegralAppId:        g("mintegral_app_id"),
        mintegralAppKey:       g("mintegral_app_key"),
        metaPlacementId:       g("meta_placement_id"),
      };
    }).filter(u=>u.name&&u.adUnitId);

    const detected = new Set<string>();
    if (parsed.some((u)=>u.panglePlacementId)) detected.add("pangle");
    if (parsed.some((u)=>u.liftoffReferenceId)) detected.add("liftoff");
    if (parsed.some((u)=>u.mintegralPlacementId)) detected.add("mintegral");
    if (parsed.some((u)=>u.metaPlacementId)) detected.add("meta");

    setUnits(parsed);
    setDetectedNets([...detected]);
    if (detected.size > 0) setNets([...detected]);
  },[]);

  const downloadTemplate = () => {
    const a = document.createElement("a");
    a.href = "data:text/csv," + encodeURIComponent(CSV_TEMPLATE);
    a.download = "mapping_template.csv";
    a.click();
  };

  const handleFile=(f:File)=>{const r=new FileReader();r.onload=e=>parseCSV(e.target?.result as string);r.readAsText(f);};

  const doPreview=async()=>{
    setLoading(true);setErr(null);
    try{
      const r=await fetch("/api/mapping/preview",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({uiState:ui,adUnits:units,appCode:code,countryGroups:cgs})});
      const d=await r.json(); if(!r.ok) throw new Error(d.error??"Preview thất bại");
      setPrev(d);setStep(2);
    }catch(e:any){setErr(e.message);}finally{setLoading(false);}
  };

  const doExec=async()=>{
    setLoading(true);setErr(null);setStep(3);
    try{
      const r=await fetch("/api/mapping/execute",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          uiState:ui,
          adUnits:units,
          appCode:code,
          countryGroups:cgs,
          networks:nets,
          sdkKeyApplovin:sdkKey||undefined,
          appId:selectedAppId,
          appName:selectedApp?.name,
        })});
      const d=await r.json(); if(!r.ok) throw new Error(d.error??"Execute thất bại");
      setRes(d);
    }catch(e:any){setErr(e.message);}finally{setLoading(false);}
  };

  const reset=()=>{setStep(0);setUnits([]);setPrev(null);setRes(null);setErr(null);setDetectedNets([]);};

  const SL = ["Upload CSV","Config","Preview","Kết quả"];

  return (
    <div style={{fontFamily:FS,background:C.ink,minHeight:"100vh",color:C.text}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=IBM+Plex+Mono:wght@400;500&family=Instrument+Sans:wght@400;500;600&display=swap');
        *{box-sizing:border-box;}
        input::placeholder{color:${C.text3};}
        input:focus,textarea:focus,select:focus{outline:none!important;border-color:${C.accent}!important;}
        ::-webkit-scrollbar{width:4px;} ::-webkit-scrollbar-thumb{background:${C.border2};border-radius:2px;}
        table{border-collapse:collapse;width:100%;}
        th{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:${C.text3};
           padding:9px 14px;text-align:left;border-bottom:1px solid ${C.border};}
        td{font-size:12.5px;color:${C.text2};padding:10px 14px;border-bottom:1px solid ${C.border};}
        tr:hover td{background:rgba(79,240,180,0.03);}
        @keyframes spin{to{transform:rotate(360deg);}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
        .sp{animation:spin .8s linear infinite;display:inline-block;}
        .pl{animation:pulse 1.4s infinite;}
      `}</style>

      {/* Topbar */}
      <div style={{height:52,background:C.ink2,borderBottom:`1px solid ${C.border}`,
        padding:"0 28px",display:"flex",alignItems:"center",justifyContent:"space-between",
        position:"sticky",top:0,zIndex:20}}>
        <div style={{fontFamily:FD,fontWeight:800,fontSize:15}}>⚡ Mapping</div>
        {step>0&&<button style={s.btnG} onClick={reset}>← Reset</button>}
      </div>

      <div style={{padding:"28px 32px",maxWidth:860}}>

        {/* Stepper */}
        <div style={{display:"flex",marginBottom:32,maxWidth:520}}>
          {SL.map((lbl,i)=>{
            const done=i<step, act=i===step;
            return (
              <div key={lbl} style={{flex:1,textAlign:"center",position:"relative"}}>
                {i<SL.length-1&&<div style={{position:"absolute",top:13,left:"50%",width:"100%",height:1,
                  background:done?"rgba(79,240,180,0.35)":C.border,zIndex:0}}/>}
                <div style={{width:26,height:26,borderRadius:"50%",margin:"0 auto 6px",
                  border:`1.5px solid ${act?C.accent:done?C.accent:C.border2}`,
                  background:act?C.accent:done?C.accentDim:C.ink2,
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontSize:10,fontWeight:700,position:"relative",zIndex:1,
                  color:act?C.ink:done?C.accent:C.text3,
                  boxShadow:act?`0 0 14px ${C.accentGlow}`:"none"}}>
                  {done?"✓":i+1}
                </div>
                <div style={{fontSize:10,fontWeight:500,color:act?C.accent:done?C.text2:C.text3}}>{lbl}</div>
              </div>
            );
          })}
        </div>

        {/* ═══ STEP 0 — Upload ═══ */}
        {step===0&&(
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
            <div>
              <div style={s.card}>
                <div style={s.cH}><span style={s.cT}>Chọn app để mapping</span></div>
                <div style={s.cB}>
                  {appsLoading ? (
                    <div style={{height:40,background:C.border,borderRadius:8,opacity:.5}}/>
                  ) : (
                    <>
                      <label style={s.lbl}>App <span style={{color:C.red}}>*</span></label>
                      <select
                        style={{...s.inp,cursor:"pointer"}}
                        value={selectedAppId}
                        onChange={(e)=>setSelectedAppId(e.target.value)}>
                        <option value="">- Chọn app -</option>
                        {apps.map((a)=>(
                          <option key={a.id} value={a.id}>{a.name} ({a.platform})</option>
                        ))}
                      </select>
                      {selectedApp && (
                        <div style={{marginTop:10,fontSize:11.5,color:C.text2,lineHeight:1.6}}>
                          Đang mapping cho: <strong>{selectedApp.name}</strong> ({selectedApp.platform})
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              <div style={s.card}>
                <div style={s.cH}>
                  <span style={s.cT}>Upload CSV mapping</span>
                  <button style={{...s.btnG,fontSize:11,padding:"5px 10px"}} onClick={downloadTemplate}>
                    ⬇ Tải CSV mẫu
                  </button>
                </div>
                <div style={s.cB}>
                  <input type="file" ref={fRef} style={{display:"none"}} accept=".csv"
                    onChange={e=>e.target.files?.[0]&&handleFile(e.target.files[0])}/>
                  <div
                    onDragOver={e=>{e.preventDefault();setDrag(true);}}
                    onDragLeave={()=>setDrag(false)}
                    onDrop={e=>{e.preventDefault();setDrag(false);e.dataTransfer.files[0]&&handleFile(e.dataTransfer.files[0]);}}
                    onClick={()=>fRef.current?.click()}
                    style={{border:`2px dashed ${drag?C.accent:C.border2}`,borderRadius:10,padding:"36px 24px",
                      textAlign:"center",cursor:"pointer",transition:"all .2s",
                      background:drag?C.accentDim:"transparent"}}>
                    <div style={{fontSize:32,marginBottom:10}}>📋</div>
                    <div style={{fontSize:13.5,fontWeight:600,color:C.text,marginBottom:4}}>Upload CSV mapping</div>
                    <div style={{fontSize:12,color:C.text3}}>Click để chọn hoặc kéo thả</div>
                  </div>
                  {units.length>0&&(
                    <div style={{...s.alrt(C.accent,C.accentDim,"rgba(79,240,180,0.3)"),marginTop:12}}>
                      ✓ Đã parse {units.length} ad units{autoLoaded?" (auto-load từ Ad Unit Creation)":""}
                    </div>
                  )}
                  {detectedNets.length>0&&(
                    <div style={{...s.alrt(C.blue,C.blueDim,"rgba(37,99,235,.3)"),marginBottom:0}}>
                      Đã detect network từ CSV: {detectedNets.join(", ")}
                    </div>
                  )}
                </div>
              </div>

              <div style={s.card}>
                <div style={s.cH}><span style={s.cT}>Mã App</span></div>
                <div style={s.cB}>
                  <label style={s.lbl}>Mã App <span style={{color:C.red}}>*</span></label>
                  <input style={{...s.inp,fontFamily:FM,fontSize:12}} placeholder="VD: AIP872 hoặc RX901"
                    value={code} onChange={e=>setCode(e.target.value)}/>
                  <div style={{fontSize:11,color:C.text3,marginTop:5}}>
                    Dùng để đặt tên mediation group:{" "}
                    <span style={{fontFamily:FM,color:C.text2}}>{code||"APP"} - inter - high</span>
                  </div>
                </div>
              </div>

              {units.length>0&&code&&selectedAppId&&(
                <button style={{...s.btnP,width:"100%",justifyContent:"center",padding:"13px"}}
                  onClick={()=>setStep(1)}>
                  Cấu hình kịch bản →
                </button>
              )}
            </div>

            {/* CSV guide */}
            <div style={{...s.card,marginBottom:0,alignSelf:"start"}}>
              <div style={s.cH}><span style={s.cT}>Cột CSV cần có</span></div>
              <div style={s.cB}>
                {[
                  {col:"ad_unit_name",req:true},{col:"admob_unit_id",req:true},
                  {col:"ad_format",req:false},{col:"pangle_placement_id",req:false},
                  {col:"liftoff_placement_id",req:false},{col:"mintegral_placement_id",req:false},
                  {col:"meta_placement_id",req:false},
                ].map(f=>(
                  <div key={f.col} style={{display:"flex",justifyContent:"space-between",
                    alignItems:"center",padding:"8px 0",borderBottom:`1px solid ${C.border}`}}>
                    <span style={{fontFamily:FM,fontSize:11.5,background:C.ink3,
                      padding:"2px 8px",borderRadius:4,color:C.text2,border:`1px solid ${C.border2}`}}>
                      {f.col}
                    </span>
                    <span style={{...s.chip(f.req?C.yellow:C.text3,f.req?C.yellowDim:"rgba(78,87,104,.2)"),fontSize:9}}>
                      {f.req?"Bắt buộc":"Optional"}
                    </span>
                  </div>
                ))}
                <div style={{marginTop:12,padding:"10px 12px",background:C.ink2,borderRadius:7,
                  fontSize:10.5,color:C.text3,fontFamily:FM,lineHeight:1.8}}>
                  ad_unit_name,admob_unit_id,ad_format,pangle_placement_id,liftoff_placement_id,mintegral_placement_id,meta_placement_id<br/>
                  inter_high,ca-app-pub-xxx/111,INTERSTITIAL,123456,lf_inter_001,mt_inter_001,meta_inter_001<br/>
                  rewarded_normal,ca-app-pub-xxx/222,REWARDED,123457,lf_reward_001,mt_reward_001,meta_reward_001
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══ STEP 1 — Config ═══ */}
        {step===1&&(
          <div style={{maxWidth:680}}>
            <div style={s.alrt(C.blue,C.blueDim,"rgba(37,99,235,.25)")}>
              📱 App mapping: <strong>{selectedApp?.name ?? "-"}</strong>
              &nbsp;•&nbsp; Platform: {selectedApp?.platform ?? "-"}
              &nbsp;•&nbsp; CSV rows: {units.length}
            </div>

            <div style={s.card}>
              <div style={s.cH}>
                <span style={s.cT}>Kịch bản tạo Mediation Group</span>
                <span style={{...s.chip(C.blue,C.blueDim),fontSize:11,padding:"3px 10px"}}>{sc}</span>
              </div>
              <div style={s.cB}>

                {/* Group by */}
                <div style={{marginBottom:20}}>
                  <label style={s.lbl}>Group by</label>
                  <div style={{display:"flex",gap:8}}>
                    {(["AD_FORMAT","AD_UNIT"] as const).map(g=>(
                      <div key={g}
                        onClick={()=>setUi(u=>({...u,groupBy:g,ecpmFloor:g==="AD_UNIT"?true:u.ecpmFloor}))}
                        style={{display:"flex",alignItems:"center",gap:8,padding:"9px 16px",
                          borderRadius:8,cursor:"pointer",userSelect:"none",transition:"all .12s",
                          border:`1px solid ${ui.groupBy===g?C.accent:C.border2}`,
                          background:ui.groupBy===g?C.accentDim:"transparent",
                          color:ui.groupBy===g?C.accent:C.text2,fontSize:13,fontWeight:500}}>
                        <div style={{width:14,height:14,borderRadius:"50%",border:"1.5px solid currentColor",
                          display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                          {ui.groupBy===g&&<div style={{width:6,height:6,borderRadius:"50%",background:"currentColor"}}/>}
                        </div>
                        {g==="AD_FORMAT"?"Ad Format":"Ad Unit"}
                      </div>
                    ))}
                  </div>
                </div>

                {/* eCPM Floor */}
                <div style={{marginBottom:20}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                    <label style={{...s.lbl,margin:0}}>eCPM Floor Split</label>
                    {ui.groupBy==="AD_UNIT"&&(
                      <span style={{fontSize:10,padding:"2px 7px",borderRadius:4,
                        background:C.yellowDim,color:C.yellow,fontWeight:600}}>
                        🔒 Auto-ON
                      </span>
                    )}
                  </div>
                  <div onClick={()=>ui.groupBy!=="AD_UNIT"&&setUi(u=>({...u,ecpmFloor:!u.ecpmFloor}))}
                    title={ui.groupBy==="AD_UNIT"?"Ad unit đã có floor tier trong tên. Phân biệt floor là bắt buộc.":""}
                    style={{display:"flex",alignItems:"center",gap:10,
                      cursor:ui.groupBy==="AD_UNIT"?"not-allowed":"pointer",
                      opacity:ui.groupBy==="AD_UNIT"?.55:1,userSelect:"none",position:"relative"}}>
                    <div style={{width:16,height:16,borderRadius:4,flexShrink:0,
                      border:`1.5px solid ${ui.ecpmFloor&&ui.groupBy!=="AD_UNIT"?C.accent:C.border2}`,
                      background:ui.ecpmFloor?C.accent:"transparent",
                      display:"flex",alignItems:"center",justifyContent:"center",transition:"all .12s"}}>
                      {ui.ecpmFloor&&<svg width={10} height={10} fill="none"
                        stroke={ui.groupBy==="AD_UNIT"?C.text3:C.ink} strokeWidth="2.5" viewBox="0 0 24 24">
                        <polyline points="20 6 9 17 4 12"/></svg>}
                    </div>
                    <span style={{fontSize:13,color:C.text2}}>Phân biệt High / Medium / All price</span>
                  </div>
                  {ui.groupBy==="AD_UNIT"&&(
                    <div style={{marginTop:6,fontSize:11,color:C.text3,fontStyle:"italic",paddingLeft:26}}>
                      Ad unit đã có floor tier trong tên — eCPM floor luôn được phân biệt khi group theo ad unit.
                    </div>
                  )}
                </div>

                {/* Country */}
                <div style={{marginBottom:20}}>
                  <label style={s.lbl}>Country</label>
                  <div style={{display:"flex",gap:8}}>
                    {(["ALL","GROUPS"] as const).map(c=>(
                      <div key={c}
                        onClick={()=>setUi(u=>({...u,countryMode:c}))}
                        style={{display:"flex",alignItems:"center",gap:8,padding:"9px 16px",
                          borderRadius:8,cursor:"pointer",userSelect:"none",
                          border:`1px solid ${ui.countryMode===c?C.accent:C.border2}`,
                          background:ui.countryMode===c?C.accentDim:"transparent",
                          color:ui.countryMode===c?C.accent:C.text2,fontSize:13,fontWeight:500}}>
                        <div style={{width:14,height:14,borderRadius:"50%",border:"1.5px solid currentColor",
                          display:"flex",alignItems:"center",justifyContent:"center"}}>
                          {ui.countryMode===c&&<div style={{width:6,height:6,borderRadius:"50%",background:"currentColor"}}/>}
                        </div>
                        {c==="ALL"?"Toàn cầu":"Country Groups"}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Country groups */}
                {ui.countryMode==="GROUPS"&&(
                  <div style={{padding:14,background:C.ink2,borderRadius:8,border:`1px solid ${C.border}`,marginBottom:16}}>
                    <CGEditor groups={cgs} onChange={setCgs}/>
                    {cgs.length===0&&<div style={{...s.alrt(C.yellow,C.yellowDim,"rgba(255,216,77,.3)"),marginTop:10}}>
                      ⚠ Chưa có nhóm nào. Nhập ít nhất 1 nhóm để tiếp tục.
                    </div>}
                    {dupNames.length>0&&<div style={{...s.alrt(C.red,C.redDim,"rgba(255,95,95,.3)"),marginTop:10}}>
                      ✗ Tên nhóm bị trùng: {dupNames.join(", ")}
                    </div>}
                  </div>
                )}

                {/* Scenario summary */}
                <div style={{padding:"11px 15px",background:C.accentDim,border:"1px solid rgba(79,240,180,.2)",borderRadius:8}}>
                  <div style={{fontSize:10,color:C.accent,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:3}}>
                    Kịch bản được chọn
                  </div>
                  <div style={{fontSize:13.5,fontWeight:600,color:C.text}}>{LABELS[sc]}</div>
                </div>
              </div>
            </div>

            {/* Networks */}
            <div style={s.card}>
              <div style={s.cH}><span style={s.cT}>Networks</span></div>
              <div style={s.cB}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                  {["pangle","liftoff","mintegral","meta","applovin"].map(n=>{
                    const on=nets.includes(n);
                    const ready = networkReady[n as keyof typeof networkReady];
                    const ic: Record<string,string>={pangle:"🌐",liftoff:"🚀",mintegral:"📊",meta:"📘",applovin:"🎯"};
                    return (
                      <div key={n}
                        onClick={()=>ready&&setNets(p=>on?p.filter(x=>x!==n):[...p,n])}
                        style={{display:"flex",alignItems:"center",gap:10,padding:"11px 14px",
                          borderRadius:8,cursor:ready?"pointer":"not-allowed",userSelect:"none",
                          border:`1px solid ${on?C.accent:C.border2}`,
                          background:on?C.accentDim:C.ink2,
                          opacity:ready?1:0.5}}>
                        <div style={{width:16,height:16,borderRadius:4,
                          border:`1.5px solid ${on?C.accent:C.border2}`,
                          background:on?C.accent:"transparent",
                          display:"flex",alignItems:"center",justifyContent:"center"}}>
                          {on&&<svg width={10} height={10} fill="none" stroke={C.ink} strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>}
                        </div>
                        <span style={{fontSize:14}}>{ic[n]}</span>
                        <span style={{fontSize:13,fontWeight:500,textTransform:"capitalize",color:on?C.text:C.text2}}>{n}</span>
                        <span style={{fontSize:10,color:C.text3,marginLeft:"auto"}}>{ready?"ID OK":"Thiếu ID"}</span>
                      </div>
                    );
                  })}
                </div>
                <div style={{fontSize:11,color:C.text3,marginTop:8,lineHeight:1.6}}>
                  Chỉ network có placement/reference ID trong CSV mới bật được để mapping bidding ad source.
                </div>
              </div>
            </div>

            {/* AppLovin SDK Key */}
            <div style={s.card}>
              <div style={s.cH}><span style={s.cT}>AppLovin SDK Key</span></div>
              <div style={s.cB}>
                <label style={s.lbl}>SDK Key (Optional)</label>
                <input style={{...s.inp,fontFamily:FM,fontSize:11}} placeholder="AppLovin SDK Key cho mediation group"
                  value={sdkKey} onChange={e=>setSdkKey(e.target.value)}/>
                <div style={{fontSize:11,color:C.text3,marginTop:5}}>Cần thiết nếu sử dụng AppLovin MAX mediation.</div>
              </div>
            </div>

            {err&&<div style={s.alrt(C.red,C.redDim,"rgba(255,95,95,.3)")}>{err}</div>}

            <div style={{display:"flex",gap:10}}>
              <button
                style={{...s.btnP,flex:1,justifyContent:"center",padding:"13px",
                  opacity:(loading||!canPrev)?.45:1,cursor:(loading||!canPrev)?"not-allowed":"pointer"}}
                disabled={loading||!canPrev} onClick={doPreview}>
                {loading?<><span className="sp">↻</span> Đang tính...</>:`Preview — Kịch bản ${sc} →`}
              </button>
              <button style={s.btnG} onClick={()=>setStep(0)}>← Quay lại</button>
            </div>
          </div>
        )}

        {/* ═══ STEP 2 — Preview ═══ */}
        {step===2&&prev&&(
          <div>
            <div style={{...s.alrt(C.blue,C.blueDim,"rgba(37,99,235,.25)")}}>
              Đang preview cho app: <strong>{selectedApp?.name ?? "-"}</strong>
            </div>
            <div style={{display:"flex",gap:10,marginBottom:20}}>
              {[{l:"Kịch bản",v:prev.scenario,c:C.blue},{l:"Groups",v:prev.groupCount,c:C.accent},{l:"Ad Units",v:units.length,c:C.yellow}].map(x=>(
                <div key={x.l} style={{padding:"12px 18px",background:C.panel,border:`1px solid ${C.border}`,borderRadius:10}}>
                  <div style={{fontSize:9.5,color:C.text3,textTransform:"uppercase",letterSpacing:".1em",marginBottom:4}}>{x.l}</div>
                  <div style={{fontFamily:FD,fontSize:26,fontWeight:800,color:x.c}}>{x.v}</div>
                </div>
              ))}
            </div>
            <div style={s.alrt(C.blue,C.blueDim,"rgba(77,158,255,.25)")}>ℹ {prev.label}</div>
            <div style={s.card}>
              <div style={s.cH}><span style={s.cT}>Groups sẽ được tạo ({prev.groupCount})</span></div>
              <div style={{maxHeight:380,overflowY:"auto"}}>
                <table>
                  <thead><tr><th>#</th><th>Tên Group</th><th>Format</th><th>Ad Units</th></tr></thead>
                  <tbody>
                    {prev.groups.map((g:any,i:number)=>(
                      <tr key={i}>
                        <td style={{color:C.text3,fontFamily:FM,fontSize:10.5}}>{i+1}</td>
                        <td style={{fontFamily:FM,fontSize:11.5,color:C.text,fontWeight:500}}>{g.name}</td>
                        <td><span style={{...s.chip(C.blue,C.blueDim),fontSize:9}}>{g.format}</span></td>
                        <td><span style={{...s.chip(C.text2,"rgba(139,147,160,.15)"),fontSize:9}}>{g.adUnitIds.length}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div style={{display:"flex",gap:10,marginTop:4}}>
              <button style={{...s.btnP,flex:1,justifyContent:"center",padding:"13px",fontSize:14,
                opacity:loading?.45:1,cursor:loading?"not-allowed":"pointer"}}
                disabled={loading} onClick={doExec}>
                {loading?<><span className="sp">↻</span> Đang tạo...</>:`⚡ Execute — Tạo ${prev.groupCount} groups`}
              </button>
              <button style={s.btnG} onClick={()=>setStep(1)}>← Chỉnh sửa</button>
            </div>
          </div>
        )}

        {/* ═══ STEP 3 — Result ═══ */}
        {step===3&&(
          <div>
            {loading?(
              <div style={{...s.card,maxWidth:480}}>
                <div style={{padding:"52px 32px",textAlign:"center"}}>
                  <div className="sp" style={{fontSize:38,marginBottom:16,color:C.accent}}>⟳</div>
                  <div style={{fontFamily:FD,fontSize:19,fontWeight:800,color:C.text,marginBottom:8}}>Đang thực thi mapping…</div>
                  <div style={{fontSize:12.5,color:C.text3,lineHeight:1.6}}>Tạo AdUnitMapping + Mediation Groups trên AdMob API</div>
                  <div style={{height:3,background:C.border,borderRadius:2,maxWidth:280,margin:"24px auto 0",overflow:"hidden"}}>
                    <div className="pl" style={{height:"100%",width:"70%",background:`linear-gradient(90deg,${C.accent},${C.blue})`,borderRadius:2}}/>
                  </div>
                </div>
              </div>
            ):res?(
              <>
                <div style={s.alrt(C.accent,C.accentDim,"rgba(79,240,180,.3)")}>
                  ✓ Hoàn tất! {res.summary.successGroups}/{res.summary.totalGroups} groups tạo thành công.
                </div>
                <div style={s.card}>
                  <div style={s.cH}><span style={s.cT}>Kết quả Mediation Groups</span></div>
                  <div style={{maxHeight:420,overflowY:"auto"}}>
                    <table>
                      <thead><tr><th>Group Name</th><th>Status</th><th>Group ID</th></tr></thead>
                      <tbody>
                        {res.mediationResults.map((r:any,i:number)=>(
                          <tr key={i}>
                            <td style={{fontFamily:FM,fontSize:11.5,color:C.text,fontWeight:500}}>{r.groupName}</td>
                            <td>{r.status==="ok"
                              ?<span style={{...s.chip(C.accent,C.accentDim),fontSize:9}}>✓ OK</span>
                              :<div style={{display:"flex",flexDirection:"column",gap:4}}>
                                <span style={{...s.chip(C.red,C.redDim),fontSize:9}}>✗ Lỗi</span>
                                <span style={{fontFamily:FM,fontSize:9,color:C.red,wordBreak:"break-word"}}>{r.status.replace("error: ","")}</span>
                              </div>}
                            </td>
                            <td style={{fontFamily:FM,fontSize:10.5,color:C.text3}}>{r.id??"—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <button style={{...s.btnG,marginTop:14}} onClick={reset}>+ Mapping mới</button>
              </>
            ):err?(
              <>
                <div style={s.alrt(C.red,C.redDim,"rgba(255,95,95,.3)")}>{err}</div>
                <button style={{...s.btnG,marginTop:12}} onClick={()=>setStep(2)}>← Quay lại Preview</button>
              </>
            ):null}
          </div>
        )}
      </div>
    </div>
  );
}
