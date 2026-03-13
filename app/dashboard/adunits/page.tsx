"use client";
import { useState, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

const C = {
  ink:"#F8FAFC", ink2:"#FFFFFF", panel:"#FFFFFF", border:"#E2E8F0", border2:"#CBD5E1",
  text:"#0F172A", text2:"#475569", text3:"#94A3B8",
  accent:"#059669", accentDim:"rgba(5,150,105,0.10)",
  blue:"#2563EB", blueDim:"rgba(37,99,235,0.10)",
  yellow:"#D97706", yellowDim:"rgba(217,119,6,0.10)",
  red:"#DC2626", redDim:"rgba(220,38,38,0.10)",
  green:"#059669",
};
const FD = "'Syne','Inter',system-ui,sans-serif";
const FS = "'Instrument Sans','Inter',system-ui,sans-serif";
const FM = "'IBM Plex Mono','Courier New',monospace";

type ParsedUnit = { name:string; format:string|null; valid:boolean; error?:string; };

const FORMAT_DETECT: [string, RegExp][] = [
  ["INTERSTITIAL", /inter|full|fs/i],
  ["REWARDED",     /reward|rv|video/i],
  ["APP_OPEN",     /open|splash|aoa/i],
  ["BANNER",       /mrec|300x250|banner|top|bottom/i],
  ["NATIVE",       /native|feed|card/i],
];

const FORMAT_COLORS: Record<string,[string,string]> = {
  INTERSTITIAL: [C.yellow, C.yellowDim],
  REWARDED:     [C.accent, C.accentDim],
  APP_OPEN:     [C.blue,   C.blueDim],
  BANNER:       [C.blue,   C.blueDim],
  NATIVE:       [C.text2,  "rgba(139,147,160,0.15)"],
};

function detectFormat(name: string): string|null {
  for (const [fmt, re] of FORMAT_DETECT) if (re.test(name)) return fmt;
  return null;
}

const card: React.CSSProperties = { background:C.panel, border:`1px solid ${C.border}`, borderRadius:12, overflow:"hidden", marginBottom:16 };
const cH  : React.CSSProperties = { padding:"13px 18px", borderBottom:`1px solid ${C.border}`, display:"flex", alignItems:"center", justifyContent:"space-between" };
const cT  : React.CSSProperties = { fontFamily:FD, fontWeight:700, fontSize:13, color:C.text };
const inp : React.CSSProperties = { width:"100%", background:C.ink2, border:`1px solid ${C.border2}`, borderRadius:8, padding:"10px 13px", fontSize:13, color:C.text, fontFamily:FS, outline:"none", boxSizing:"border-box" };
const lbl : React.CSSProperties = { display:"block", fontSize:11, fontWeight:700, color:C.text2, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:6 };
const btnP = (dis=false): React.CSSProperties => ({ display:"inline-flex", alignItems:"center", justifyContent:"center", gap:8, padding:"11px 22px", borderRadius:8, border:"none", background:dis?"#2a3040":C.accent, color:dis?C.text3:C.ink, fontSize:13.5, fontWeight:700, cursor:dis?"not-allowed":"pointer", fontFamily:FS, opacity:dis?.6:1 });
const btnG : React.CSSProperties = { display:"inline-flex", alignItems:"center", gap:7, padding:"8px 14px", borderRadius:8, background:"transparent", border:`1px solid ${C.border2}`, color:C.text2, fontSize:12.5, fontWeight:600, cursor:"pointer", fontFamily:FS };
const chip = (col:string, bg:string): React.CSSProperties => ({ display:"inline-flex", alignItems:"center", padding:"2px 8px", borderRadius:99, fontSize:9.5, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em", color:col, background:bg });

function AdUnitsContent() {
  const router = useRouter();
  const params = useSearchParams();
  const [step,    setStep]    = useState<0|1|2|3>(0);
  const [appId,   setAppId]   = useState(params.get("appId") ?? "");
  const [csvText, setCsvText] = useState("");
  const [parsed,  setParsed]  = useState<ParsedUnit[]>([]);
  const [drag,    setDrag]    = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [error,   setError]   = useState<string|null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const parseCSV = useCallback((text: string) => {
    const lines = text.trim().split("\n");
    const hdr0  = lines[0]?.toLowerCase();
    const isHeader = hdr0?.includes("ad_unit_name") || hdr0?.includes("name");
    const data  = isHeader ? lines.slice(1) : lines;
    const hdr   = isHeader ? lines[0].split(",").map(h=>h.trim().replace(/^"|"$/g,"").toLowerCase()) : null;
    const ixFmt = hdr ? hdr.indexOf("ad_format") : -1;

    const units: ParsedUnit[] = data.map(line => {
      const cols = line.split(",").map(c=>c.trim().replace(/^"|"$/g,""));
      const name = cols[0] ?? "";
      if (!name) return { name, format:null, valid:false, error:"Tên trống" };
      const fmt  = (ixFmt >= 0 ? cols[ixFmt] : null) || detectFormat(name);
      return { name, format:fmt, valid:!!fmt, error:fmt?undefined:"Không nhận diện được format" };
    }).filter(u=>u.name);

    setParsed(units);
    setStep(1);
  }, []);

  const handleFile = (f: File) => {
    const r = new FileReader();
    r.onload = e => { const t = e.target?.result as string; setCsvText(t); parseCSV(t); };
    r.readAsText(f);
  };

  const handleCreate = async () => {
    if (!appId.trim()) { setError("Vui lòng nhập AdMob App ID"); return; }
    const valid = parsed.filter(u=>u.valid);
    if (!valid.length) { setError("Không có ad unit hợp lệ"); return; }
    setLoading(true); setError(null); setStep(2);
    try {
      const res  = await fetch("/api/adunits", {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({ appId, units: valid.map(u=>({ name:u.name, format:u.format })) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Tạo thất bại");
      setResults(data.results);
      setStep(3);
    } catch(e:any) { setError(e.message); setStep(1); }
    finally { setLoading(false); }
  };

  const reset = () => { setStep(0); setParsed([]); setCsvText(""); setResults([]); setError(null); };

  const valid   = parsed.filter(u=>u.valid);
  const invalid = parsed.filter(u=>!u.valid);
  const STEPS   = ["Upload CSV","Review","Tạo","Kết quả"];

  return (
    <div style={{ fontFamily:FS, background:C.ink, minHeight:"100vh", color:C.text }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=IBM+Plex+Mono:wght@400;500&family=Instrument+Sans:wght@400;500;600&display=swap');
        *{box-sizing:border-box;}
        input::placeholder{color:${C.text3};}
        input:focus,textarea:focus{outline:none!important;border-color:${C.accent}!important;}
        ::-webkit-scrollbar{width:4px;} ::-webkit-scrollbar-thumb{background:${C.border2};border-radius:2px;}
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}} .fu{animation:fadeUp .3s ease;}
        @keyframes spin{to{transform:rotate(360deg)}} .sp{animation:spin .8s linear infinite;display:inline-block;}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}} .pl{animation:pulse 1.4s infinite;}
        table{border-collapse:collapse;width:100%;}
        th{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:${C.text3};padding:9px 14px;text-align:left;border-bottom:1px solid ${C.border};}
        td{font-size:12.5px;color:${C.text2};padding:9px 14px;border-bottom:1px solid ${C.border};}
        tr:last-child td{border-bottom:none;}
        tr:hover td{background:rgba(79,240,180,0.025);}
      `}</style>

      {/* Topbar */}
      <div style={{ height:52, background:C.ink2, borderBottom:`1px solid ${C.border}`,
        padding:"0 28px", display:"flex", alignItems:"center", justifyContent:"space-between",
        position:"sticky", top:0, zIndex:20 }}>
        <div style={{ fontFamily:FD, fontWeight:700, fontSize:15 }}>Tạo Ad Unit</div>
        {step > 0 && <button style={btnG} onClick={reset}>← Bắt đầu lại</button>}
      </div>

      <div className="fu" style={{ padding:"28px 32px", maxWidth:900 }}>

        {/* Stepper */}
        <div style={{ display:"flex", maxWidth:440, marginBottom:32 }}>
          {STEPS.map((s, i) => {
            const done = i < step, act = i === step;
            return (
              <div key={s} style={{ flex:1, textAlign:"center", position:"relative" }}>
                {i < STEPS.length-1 && <div style={{ position:"absolute", top:13, left:"50%", width:"100%", height:1, background:done?"rgba(79,240,180,0.35)":C.border, zIndex:0 }}/>}
                <div style={{ width:26, height:26, borderRadius:"50%", margin:"0 auto 6px",
                  border:`1.5px solid ${act?C.accent:done?C.accent:C.border2}`,
                  background:act?C.accent:done?C.accentDim:C.ink2,
                  display:"flex", alignItems:"center", justifyContent:"center",
                  fontSize:10, fontWeight:700, position:"relative", zIndex:1,
                  color:act?C.ink:done?C.accent:C.text3,
                  boxShadow:act?`0 0 14px rgba(79,240,180,0.25)`:"none" }}>
                  {done ? "✓" : i+1}
                </div>
                <div style={{ fontSize:10, fontWeight:500, color:act?C.accent:done?C.text2:C.text3 }}>{s}</div>
              </div>
            );
          })}
        </div>

        {/* ═══ STEP 0 ═══ */}
        {step === 0 && (
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
            <div>
              {/* App ID */}
              <div style={card}>
                <div style={cH}><span style={cT}>AdMob App ID</span></div>
                <div style={{ padding:"18px" }}>
                  <label style={lbl}>App ID <span style={{color:C.red}}>*</span></label>
                  <input style={{...inp, fontFamily:FM, fontSize:12}} placeholder="ca-app-pub-XXXX~YYYYYYYYYY"
                    value={appId} onChange={e=>setAppId(e.target.value)}/>
                  <div style={{ fontSize:11, color:C.text3, marginTop:5 }}>Lấy từ AdMob Console hoặc từ kết quả Tạo App.</div>
                </div>
              </div>

              {/* Upload */}
              <div style={card}>
                <div style={cH}><span style={cT}>Upload CSV</span></div>
                <div style={{ padding:"18px" }}>
                  <input type="file" ref={fileRef} style={{display:"none"}} accept=".csv,.txt"
                    onChange={e=>e.target.files?.[0]&&handleFile(e.target.files[0])}/>
                  <div
                    onDragOver={e=>{e.preventDefault();setDrag(true);}} onDragLeave={()=>setDrag(false)}
                    onDrop={e=>{e.preventDefault();setDrag(false);e.dataTransfer.files[0]&&handleFile(e.dataTransfer.files[0]);}}
                    onClick={()=>fileRef.current?.click()}
                    style={{ border:`2px dashed ${drag?C.accent:C.border2}`, borderRadius:10, padding:"32px 20px",
                      textAlign:"center", cursor:"pointer", background:drag?C.accentDim:"transparent", transition:"all .2s" }}>
                    <div style={{fontSize:30,marginBottom:10}}>📄</div>
                    <div style={{fontSize:13.5,fontWeight:600,color:C.text,marginBottom:4}}>Kéo thả CSV vào đây</div>
                    <div style={{fontSize:12,color:C.text3}}>hoặc click để chọn file</div>
                  </div>

                  <div style={{ margin:"14px 0", borderTop:`1px solid ${C.border}` }}/>
                  <div style={{ fontSize:12, color:C.text3, marginBottom:8 }}>Hoặc nhập trực tiếp:</div>
                  <textarea style={{...inp, fontFamily:FM, fontSize:11.5, resize:"vertical"} as React.CSSProperties}
                    placeholder={"ad_unit_name,ad_format\ninter_gameplay,INTERSTITIAL\nrewarded_extra,REWARDED"}
                    rows={4} value={csvText} onChange={e=>setCsvText(e.target.value)}/>
                  {csvText && (
                    <button style={{...btnG, marginTop:10}} onClick={()=>parseCSV(csvText)}>→ Parse CSV</button>
                  )}
                </div>
              </div>
            </div>

            {/* Guide */}
            <div style={{...card, alignSelf:"start", marginBottom:0}}>
              <div style={cH}><span style={cT}>Cấu trúc CSV</span></div>
              <div style={{ padding:"18px" }}>
                <div style={{ padding:"10px 13px", background:C.ink2, borderRadius:7, fontSize:12, color:C.text3, lineHeight:1.6, marginBottom:16 }}>
                  Cột <span style={{fontFamily:FM,color:C.text2,fontSize:11}}>ad_format</span> có thể bỏ trống — tool tự detect từ tên ad unit.
                </div>
                {[{col:"ad_unit_name",req:true,desc:"Tên ad unit"},
                  {col:"ad_format",req:false,desc:"INTERSTITIAL · REWARDED · BANNER · NATIVE · APP_OPEN"},
                ].map(f=>(
                  <div key={f.col} style={{display:"flex",gap:10,marginBottom:14,paddingBottom:14,borderBottom:`1px solid ${C.border}`}}>
                    <span style={{fontFamily:FM,fontSize:11,background:C.ink2,padding:"3px 8px",borderRadius:4,color:C.text2,border:`1px solid ${C.border2}`,flexShrink:0,height:"fit-content",marginTop:2}}>{f.col}</span>
                    <div>
                      <div style={{fontSize:12,color:C.text3,marginBottom:4}}>{f.desc}</div>
                      <span style={{...chip(f.req?C.yellow:C.text3,f.req?C.yellowDim:"rgba(78,87,104,.2)")}}>{f.req?"Bắt buộc":"Tùy chọn"}</span>
                    </div>
                  </div>
                ))}
                <div style={{fontSize:12,fontWeight:600,color:C.text2,marginBottom:10}}>Auto-detect từ tên:</div>
                {[["inter/full/fs","INTERSTITIAL"],["reward/rv","REWARDED"],["open/splash","APP_OPEN"],["mrec/banner","BANNER"],["native/feed","NATIVE"]].map(([k,v])=>(
                  <div key={k} style={{display:"flex",justifyContent:"space-between",fontSize:11.5,marginBottom:6}}>
                    <span style={{fontFamily:FM,color:C.text3}}>{k}</span>
                    <span style={{color:C.accent,fontWeight:600}}>→ {v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ═══ STEP 1 ═══ */}
        {step === 1 && (
          <div className="fu">
            {/* Summary */}
            <div style={{display:"flex",gap:10,marginBottom:20}}>
              {[{l:"Tổng",v:parsed.length,c:C.text2},{l:"✓ Hợp lệ",v:valid.length,c:C.accent},{l:"✗ Lỗi",v:invalid.length,c:C.red}].map(s=>(
                <div key={s.l} style={{padding:"12px 18px",background:C.panel,border:`1px solid ${C.border}`,borderRadius:10}}>
                  <div style={{fontSize:9.5,color:C.text3,textTransform:"uppercase",letterSpacing:".1em",marginBottom:4}}>{s.l}</div>
                  <div style={{fontFamily:FD,fontSize:26,fontWeight:800,color:s.c}}>{s.v}</div>
                </div>
              ))}
            </div>

            <div style={{display:"grid",gridTemplateColumns:"1fr 280px",gap:16}}>
              <div style={card}>
                <div style={cH}><span style={cT}>Ad Units đã parse</span></div>
                <div style={{maxHeight:400,overflowY:"auto"}}>
                  <table>
                    <thead><tr><th>#</th><th>Tên Ad Unit</th><th>Format</th><th>Status</th></tr></thead>
                    <tbody>
                      {parsed.map((u,i)=>(
                        <tr key={i}>
                          <td style={{color:C.text3,fontFamily:FM,fontSize:10.5}}>{i+1}</td>
                          <td style={{fontFamily:FM,fontSize:11.5,color:C.text}}>{u.name}</td>
                          <td>{u.format?<span style={{...chip(...(FORMAT_COLORS[u.format]??[C.text2,"rgba(139,147,160,.15)"])),fontSize:9}}>{u.format}</span>:<span style={{color:C.text3,fontSize:11}}>—</span>}</td>
                          <td>{u.valid?<span style={{...chip(C.accent,C.accentDim),fontSize:9}}>✓ OK</span>:<span style={{...chip(C.red,C.redDim),fontSize:9}} title={u.error}>✗ {u.error}</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                <div style={card}>
                  <div style={cH}><span style={cT}>Cấu hình</span></div>
                  <div style={{padding:"16px"}}>
                    <div style={{fontSize:10,color:C.text3,textTransform:"uppercase",letterSpacing:".08em",marginBottom:4}}>App ID</div>
                    <div style={{fontFamily:FM,fontSize:11,color:C.text2,wordBreak:"break-all",marginBottom:12}}>{appId}</div>
                    <div style={{borderTop:`1px solid ${C.border}`,marginBottom:12}}/>
                    {[["Sẽ tạo",`${valid.length} ad units`],["Bỏ qua",`${invalid.length} hàng lỗi`]].map(([k,v])=>(
                      <div key={k} style={{display:"flex",justifyContent:"space-between",fontSize:12.5,marginBottom:8}}>
                        <span style={{color:C.text3}}>{k}</span>
                        <span style={{fontWeight:700,color:C.text}}>{v}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {error && <div style={{padding:"10px 13px",background:C.redDim,border:`1px solid rgba(255,95,95,.3)`,borderRadius:8,fontSize:12,color:C.red}}>{error}</div>}
                {invalid.length>0 && <div style={{padding:"10px 13px",background:C.yellowDim,border:`1px solid rgba(255,216,77,.3)`,borderRadius:8,fontSize:11.5,color:C.yellow}}>{invalid.length} hàng không nhận diện được format — sẽ bị bỏ qua.</div>}

                <button style={{...btnP(!valid.length),width:"100%"}} disabled={!valid.length} onClick={handleCreate}>
                  Tạo {valid.length} Ad Unit →
                </button>
                <button style={{...btnG,justifyContent:"center"}} onClick={reset}>← Upload lại</button>
              </div>
            </div>
          </div>
        )}

        {/* ═══ STEP 2 ═══ */}
        {step === 2 && (
          <div style={{...card, maxWidth:460}}>
            <div style={{padding:"52px 32px",textAlign:"center"}}>
              <div className="sp" style={{fontSize:38,color:C.accent,marginBottom:16}}>⟳</div>
              <div style={{fontFamily:FD,fontSize:18,fontWeight:800,marginBottom:8}}>Đang tạo Ad Units…</div>
              <div style={{fontSize:12.5,color:C.text3}}>Gọi AdMob API cho {valid.length} ad units</div>
              <div style={{height:3,background:C.border,borderRadius:2,maxWidth:280,margin:"24px auto 0",overflow:"hidden"}}>
                <div className="pl" style={{height:"100%",width:"60%",background:`linear-gradient(90deg,${C.accent},${C.blue})`,borderRadius:2}}/>
              </div>
            </div>
          </div>
        )}

        {/* ═══ STEP 3 ═══ */}
        {step === 3 && (
          <div className="fu">
            <div style={{padding:"11px 14px",background:C.accentDim,border:"1px solid rgba(79,240,180,.35)",borderRadius:8,color:C.accent,fontSize:13,marginBottom:16}}>
              ✓ Hoàn tất! {results.filter(r=>r.status==="ok").length}/{results.length} ad units tạo thành công.
            </div>
            <div style={card}>
              <div style={cH}>
                <span style={cT}>Kết quả</span>
                <button style={btnG} onClick={()=>{
                  const csv = "name,adUnitId,status\n"+results.map(r=>`${r.name},${r.adUnitId??""},${r.status}`).join("\n");
                  const a = document.createElement("a"); a.href="data:text/csv,"+encodeURIComponent(csv); a.download="adunits_result.csv"; a.click();
                }}>⬇ Tải CSV</button>
              </div>
              <div style={{maxHeight:480,overflowY:"auto"}}>
                <table>
                  <thead><tr><th>Tên</th><th>Ad Unit ID</th><th>Status</th></tr></thead>
                  <tbody>
                    {results.map((r,i)=>(
                      <tr key={i}>
                        <td style={{fontFamily:FM,fontSize:11.5,color:C.text}}>{r.name}</td>
                        <td style={{fontFamily:FM,fontSize:11,color:C.text3}}>{r.adUnitId??"—"}</td>
                        <td>{r.status==="ok"?<span style={{...chip(C.accent,C.accentDim),fontSize:9}}>✓ OK</span>:<span style={{...chip(C.red,C.redDim),fontSize:9}} title={r.error}>✗ Lỗi</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div style={{display:"flex",gap:10}}>
              <button style={{...btnP(false),flex:1}} onClick={()=>router.push("/dashboard/mapping")}>→ Mapping</button>
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
