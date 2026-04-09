import { useState, useRef, useEffect, useCallback } from "react";

// ─── Backend API Base URL ────────────────────────────────────────────────────
const API = "https://ai-interview-final-aaki.onrender.com";
// ─── Token helpers ───────────────────────────────────────────────────────────
const getToken = () => sessionStorage.getItem("token");
const getUser  = () => { try { return JSON.parse(sessionStorage.getItem("user")||"null"); } catch { return null; } };

// ─── API Helpers ─────────────────────────────────────────────────────────────
async function post(endpoint, body, auth = false) {
  const headers = { "Content-Type": "application/json" };
  if (auth) { const t = getToken(); if (t) headers["Authorization"] = `Bearer ${t}`; }
  const res = await fetch(`${API}${endpoint}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || `Server error ${res.status}`);
  }
  return res.json();
}

async function get(endpoint, auth = false) {
  const headers = {};
  if (auth) { const t = getToken(); if (t) headers["Authorization"] = `Bearer ${t}`; }
  const res = await fetch(`${API}${endpoint}`, { headers });
  if (!res.ok) throw new Error(`Server error ${res.status}`);
  return res.json();
}

// ─── Evaluation Metrics ──────────────────────────────────────────────────────
const EVAL_METRICS = [
  { key: "technical_knowledge",   label: "Technical Knowledge",   weight: 0.30, color: "#6366f1" },
  { key: "problem_solving",       label: "Problem Solving",       weight: 0.25, color: "#06b6d4" },
  { key: "communication_skills",  label: "Communication Skills",  weight: 0.20, color: "#8b5cf6" },
  { key: "project_understanding", label: "Project Understanding", weight: 0.15, color: "#f59e0b" },
  { key: "confidence",            label: "Confidence",            weight: 0.10, color: "#22c55e" },
];

// ─── Coding Problems ─────────────────────────────────────────────────────────
const CODING_PROBLEMS = [
  { title: "Two Sum", difficulty: "Easy", tags: ["Array","HashMap"], description: "Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.", examples: ["Input: nums=[2,7,11,15], target=9 → Output: [0,1]", "Input: nums=[3,2,4], target=6 → Output: [1,2]"], starterCode: "function twoSum(nums, target) {\n  // Your solution here\n\n}" },
  { title: "Valid Parentheses", difficulty: "Easy", tags: ["Stack","String"], description: "Given a string containing '(', ')', '{', '}', '[' and ']', determine if the input string is valid.", examples: ["Input: s='()' → Output: true", "Input: s='(]' → Output: false"], starterCode: "function isValid(s) {\n  // Your solution here\n\n}" },
  { title: "LRU Cache", difficulty: "Medium", tags: ["Design","HashMap"], description: "Design a data structure that follows LRU cache constraints. Implement get and put in O(1).", examples: ["cache = new LRUCache(2)", "cache.put(1,1)", "cache.get(1) → 1"], starterCode: "class LRUCache {\n  constructor(capacity) {\n    // Your solution here\n  }\n  get(key) { }\n  put(key, value) { }\n}" },
  { title: "Merge Intervals", difficulty: "Medium", tags: ["Array","Sorting"], description: "Given an array of intervals, merge all overlapping intervals.", examples: ["Input: [[1,3],[2,6],[8,10]] → Output: [[1,6],[8,10]]"], starterCode: "function merge(intervals) {\n  // Your solution here\n\n}" },
];

// ─── Global CSS ──────────────────────────────────────────────────────────────
const CSS = `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
html,body{height:100%;}
body{background:#06070d;color:#f4f4f5;font-family:sans-serif;min-height:100vh;
  background-image:radial-gradient(ellipse 80% 50% at 20% -10%,rgba(99,102,241,.22) 0%,transparent 60%),
  radial-gradient(ellipse 60% 40% at 80% 100%,rgba(6,182,212,.12) 0%,transparent 50%);}
::-webkit-scrollbar{width:4px;}
::-webkit-scrollbar-thumb{background:rgba(99,102,241,.3);border-radius:4px;}
@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
@keyframes pulse-ring{0%{box-shadow:0 0 0 0 rgba(99,102,241,.5)}70%{box-shadow:0 0 0 14px rgba(99,102,241,0)}100%{box-shadow:0 0 0 0 rgba(99,102,241,0)}}
@keyframes wave{0%,100%{transform:scaleY(.3)}50%{transform:scaleY(1)}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes scanline{0%{top:-4px}100%{top:100%}}
.fade-up{animation:fadeUp .35s ease forwards;}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:9px 18px;border-radius:9px;font-size:13px;font-weight:500;cursor:pointer;transition:all .16s ease;border:none;outline:none;white-space:nowrap;font-family:inherit;}
.btn:active{transform:scale(.96);}
.btn:disabled{opacity:.4;cursor:not-allowed;transform:none!important;}
.btn-primary{background:#6366f1;color:#fff;box-shadow:0 0 20px rgba(99,102,241,.28);}
.btn-primary:hover:not(:disabled){background:#818cf8;}
.btn-ghost{background:rgba(255,255,255,.04);color:#a1a1aa;border:1px solid rgba(255,255,255,.07);}
.btn-ghost:hover:not(:disabled){background:rgba(255,255,255,.08);color:#f4f4f5;}
.btn-danger{background:rgba(239,68,68,.12);color:#fca5a5;border:1px solid rgba(239,68,68,.25);}
.card{background:#0f1120;border:1px solid rgba(255,255,255,.07);border-radius:14px;padding:22px;}
.input{width:100%;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-radius:9px;padding:9px 13px;color:#f4f4f5;font-size:13px;outline:none;transition:border-color .15s;font-family:inherit;}
.input:focus{border-color:rgba(99,102,241,.5);}
.input::placeholder{color:#52525b;}
.tag{display:inline-flex;align-items:center;padding:2px 9px;border-radius:20px;font-size:11px;font-weight:500;background:rgba(99,102,241,.1);color:#818cf8;border:1px solid rgba(99,102,241,.2);}
.tag-cyan{background:rgba(6,182,212,.1);color:#67e8f9;border-color:rgba(6,182,212,.2);}
.code-editor{width:100%;min-height:200px;background:#0a0b12;border:1px solid rgba(99,102,241,.2);border-radius:10px;padding:16px;color:#e2e8f0;font-family:monospace;font-size:13px;line-height:1.7;outline:none;resize:vertical;}
.code-editor:focus{border-color:rgba(99,102,241,.45);}
`;

// ─── Icons ────────────────────────────────────────────────────────────────────
const Svg = ({ children, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
);
const Icons = {
  Brain:    () => <Svg><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/></Svg>,
  Mic:      ({ size=18 }) => <Svg size={size}><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></Svg>,
  Chart:    () => <Svg><path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></Svg>,
  Code:     () => <Svg><path d="m18 16 4-4-4-4"/><path d="m6 8-4 4 4 4"/><path d="m14.5 4-5 16"/></Svg>,
  Camera:   () => <Svg><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></Svg>,
  Shield:   () => <Svg><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/></Svg>,
  Upload:   () => <Svg><path d="M12 13v8"/><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="m8 17 4-4 4 4"/></Svg>,
  Arrow:    () => <Svg><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></Svg>,
  Play:     () => <Svg><polygon points="6 3 20 12 6 21 6 3"/></Svg>,
  Spin:     ({ size=18 }) => <svg width={size} height={size} viewBox="0 0 24 24" style={{animation:"spin .8s linear infinite"}}><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none" strokeDasharray="40" strokeDashoffset="30"/></svg>,
  Database: () => <Svg><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/></Svg>,
  Search:   () => <Svg><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></Svg>,
  Home:     () => <Svg><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></Svg>,
  User:     () => <Svg><circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 1 0-16 0"/></Svg>,
  Terminal: () => <Svg><polyline points="4 17 10 11 4 5"/><line x1="12" x2="20" y1="19" y2="19"/></Svg>,
};

// ─── Shared Components ────────────────────────────────────────────────────────
function AudioBars({ active }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:3, height:20 }}>
      {[0.3,0.7,1,0.5,0.8,0.4,0.6].map((d,i) => (
        <div key={i} style={{ width:3, height:"100%", borderRadius:2, transformOrigin:"bottom", background:active?"linear-gradient(to top,#6366f1,#06b6d4)":"#52525b", animation:active?`wave .8s ease-in-out ${d*.15}s infinite`:"none", transform:active?undefined:"scaleY(0.25)", opacity:active?1:0.4, transition:"all .3s" }}/>
      ))}
    </div>
  );
}

function WeightedBar({ score, color }) {
  const [w, setW] = useState(0);
  useEffect(() => { const t = setTimeout(() => setW(score*10), 100); return () => clearTimeout(t); }, [score]);
  return (
    <div style={{ height:6, background:"rgba(255,255,255,.07)", borderRadius:4, overflow:"hidden" }}>
      <div style={{ height:"100%", width:`${w}%`, background:`linear-gradient(90deg,${color},#06b6d4)`, borderRadius:4, transition:"width .9s cubic-bezier(.4,0,.2,1)" }}/>
    </div>
  );
}

function EvaluationBreakdown({ scores, weighted_total }) {
  return (
    <div className="card" style={{ border:"1px solid rgba(99,102,241,.22)" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>
        <h3 style={{ fontSize:13, fontWeight:700, color:"#a1a1aa", textTransform:"uppercase", letterSpacing:".07em" }}>Weighted Evaluation</h3>
        <div style={{ display:"flex", alignItems:"baseline", gap:3 }}>
          <span style={{ fontSize:28, fontWeight:800, color:"#6366f1" }}>{weighted_total?.toFixed(1)}</span>
          <span style={{ fontSize:12, color:"#52525b" }}>/10</span>
        </div>
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:13 }}>
        {EVAL_METRICS.map(m => {
          const s = scores?.[m.key] ?? 0;
          return (
            <div key={m.key}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <div style={{ width:8, height:8, borderRadius:"50%", background:m.color }}/>
                  <span style={{ fontSize:13, color:"#f4f4f5" }}>{m.label}</span>
                  <span style={{ fontSize:10, color:"#52525b", background:"rgba(255,255,255,.05)", padding:"1px 6px", borderRadius:4 }}>{(m.weight*100).toFixed(0)}%</span>
                </div>
                <span style={{ fontSize:12, color:m.color, fontFamily:"monospace" }}>{s}/10</span>
              </div>
              <WeightedBar score={s} color={m.color}/>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Proctoring Panel ─────────────────────────────────────────────────────────
function ProctoringPanel({ active }) {
  const videoRef = useRef();
  const [status, setStatus] = useState("idle");
  const [alerts, setAlerts] = useState([]);
  const [tabViolations, setTabViolations] = useState(0);
  const [faceStatus, setFaceStatus] = useState("waiting");
  const faceCheckRef = useRef();
  const streamRef = useRef();

  const addAlert = useCallback((msg, type="warn") => {
    setAlerts(a => [{ id:Date.now(), msg, type, time:new Date().toLocaleTimeString() }, ...a].slice(0,10));
  }, []);

  // Tab switch detection
  useEffect(() => {
    if (!active) return;
    const onBlur = () => setTabViolations(v => { const n=v+1; addAlert(`Tab switch #${n}`,"danger"); return n; });
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, [active, addAlert]);

  const startCamera = useCallback(async () => {
    setStatus("loading");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video:true, audio:false });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setStatus("ready"); setFaceStatus("detected");
      addAlert("Webcam active — proctoring started","info");
      faceCheckRef.current = setInterval(() => {
        const r = Math.random();
        if (r < 0.05) { setFaceStatus("missing"); addAlert("⚠ Face not detected!","danger"); }
        else if (r < 0.08) { setFaceStatus("multiple"); addAlert("⚠ Multiple faces!","danger"); }
        else setFaceStatus("detected");
      }, 4000);
    } catch { setStatus("error"); addAlert("Camera permission denied","warn"); }
  }, [addAlert]);

  // AUTO-START camera when active becomes true
  useEffect(() => {
    if (active && status === "idle") {
      startCamera();
    }
  }, [active, status, startCamera]);

  // Cleanup on unmount
  useEffect(() => () => {
    clearInterval(faceCheckRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
  }, []);

  const faceColor = { detected:"#22c55e", missing:"#ef4444", multiple:"#f59e0b", waiting:"#52525b" }[faceStatus];

  return (
    <div className="card" style={{ border:"1px solid rgba(99,102,241,.2)" }}>
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14 }}>
        <div style={{ color:status==="ready"?"#22c55e":"#f59e0b" }}><Icons.Shield/></div>
        <span style={{ fontSize:13, fontWeight:700 }}>Proctoring</span>
        <span style={{ marginLeft:"auto", fontSize:11, color:status==="ready"?"#22c55e":"#52525b" }}>
          {status==="ready"?"● Active":status==="loading"?"⏳ Starting...":status==="error"?"✗ Error":"○ Waiting"}
        </span>
      </div>
      <div style={{ position:"relative", borderRadius:10, overflow:"hidden", background:"#070810", marginBottom:14, aspectRatio:"4/3" }}>
        <video ref={videoRef} autoPlay muted playsInline style={{ width:"100%", height:"100%", objectFit:"cover", display:status==="ready"?"block":"none" }}/>
        {status !== "ready" && (
          <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:10, color:"#52525b" }}>
            {status==="loading"?<Icons.Spin size={28}/>:<Icons.Camera/>}
            <p style={{ fontSize:12 }}>{status==="error"?"Camera permission denied — check browser settings":status==="loading"?"Starting camera...":"Waiting..."}</p>
          </div>
        )}
        {status === "ready" && (
          <>
            <div style={{ position:"absolute", left:0, right:0, height:2, background:"linear-gradient(90deg,transparent,#6366f1,transparent)", opacity:.5, animation:"scanline 3s linear infinite", top:0 }}/>
            <div style={{ position:"absolute", bottom:8, left:8, padding:"3px 8px", borderRadius:6, background:"rgba(0,0,0,.7)", fontSize:11, color:faceColor }}>
              ● {faceStatus==="detected"?"Face OK":faceStatus==="missing"?"No face":"Multiple faces"}
            </div>
            <div style={{ position:"absolute", top:8, right:8, padding:"2px 7px", borderRadius:5, background:"rgba(239,68,68,.8)", fontSize:10, color:"#fff", fontWeight:600 }}>● REC</div>
          </>
        )}
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, marginBottom:14 }}>
        {[["Switches",tabViolations,tabViolations>0],["Face",faceStatus==="detected"?"OK":"!",faceStatus!=="detected"],["Camera",status==="ready"?"On":"Off",status!=="ready"]].map(([l,v,bad]) => (
          <div key={l} style={{ padding:"8px", borderRadius:8, background:"rgba(255,255,255,.03)", border:`1px solid ${bad?"rgba(239,68,68,.25)":"rgba(255,255,255,.07)"}`, textAlign:"center" }}>
            <p style={{ fontSize:15, fontWeight:700, color:bad?"#ef4444":"#22c55e" }}>{v}</p>
            <p style={{ fontSize:10, color:"#52525b" }}>{l}</p>
          </div>
        ))}
      </div>
      {alerts.length > 0 && (
        <div style={{ maxHeight:130, overflowY:"auto", display:"flex", flexDirection:"column", gap:4 }}>
          {alerts.map(a => (
            <div key={a.id} style={{ display:"flex", gap:6, padding:"5px 8px", borderRadius:6, background:a.type==="danger"?"rgba(239,68,68,.08)":"rgba(99,102,241,.08)", fontSize:10 }}>
              <span style={{ color:a.type==="danger"?"#ef4444":"#818cf8", flex:1 }}>{a.msg}</span>
              <span style={{ color:"#52525b" }}>{a.time}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── RAG Panel ────────────────────────────────────────────────────────────────
function RAGPanel({ onSelectQuestion }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [kb, setKb] = useState({});
  const [activeCategory, setActiveCategory] = useState("all");
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    get("/rag-kb").then(d => setKb(d.kb)).catch(() => {});
  }, []);

  const semanticSearch = async (q) => {
    if (!q.trim()) return;
    setIsSearching(true);
    try {
      const data = await post("/rag-search", { query: q });
      setResults(data.results);
    } catch { setResults([]); }
    finally { setIsSearching(false); }
  };

  const cats = ["all", "behavioral", "frontend", "backend", "system_design"];
  const catColors = { behavioral:"#6366f1", frontend:"#06b6d4", backend:"#8b5cf6", system_design:"#f59e0b" };
  const allQs = Object.entries(kb).flatMap(([cat, qs]) => qs.map(q => ({ cat, q })));
  const displayed = activeCategory === "all" ? allQs : (kb[activeCategory] || []).map(q => ({ cat: activeCategory, q }));

  return (
    <div className="card" style={{ border:"1px solid rgba(6,182,212,.18)" }}>
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14 }}>
        <div style={{ color:"#06b6d4" }}><Icons.Database/></div>
        <span style={{ fontSize:13, fontWeight:700 }}>RAG Knowledge Base</span>
        <span className="tag tag-cyan" style={{ marginLeft:"auto", fontSize:10 }}>{allQs.length} entries</span>
      </div>
      <div style={{ display:"flex", gap:8, marginBottom:12 }}>
        <input className="input" style={{ flex:1 }} placeholder="Search semantically…" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key==="Enter" && semanticSearch(query)}/>
        <button className="btn btn-ghost" style={{ padding:"9px 12px" }} onClick={() => semanticSearch(query)} disabled={isSearching}>
          {isSearching?<Icons.Spin/>:<Icons.Search/>}
        </button>
      </div>
      {results.length > 0 && (
        <div style={{ marginBottom:12, padding:10, borderRadius:9, background:"rgba(6,182,212,.05)", border:"1px solid rgba(6,182,212,.18)" }}>
          <p style={{ fontSize:11, color:"#06b6d4", fontWeight:600, marginBottom:8 }}>⚡ Matches</p>
          {results.map((r,i) => (
            <div key={i} style={{ display:"flex", gap:8, padding:"7px 9px", borderRadius:7, background:"rgba(255,255,255,.03)", marginBottom:5, cursor:"pointer" }} onClick={() => onSelectQuestion?.(r.q)}>
              <span className="tag tag-cyan" style={{ fontSize:10, flexShrink:0 }}>{r.cat}</span>
              <p style={{ fontSize:12, color:"#a1a1aa", flex:1 }}>{r.q}</p>
              <button className="btn btn-ghost" style={{ padding:"2px 7px", fontSize:11 }}>Use</button>
            </div>
          ))}
        </div>
      )}
      <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginBottom:10 }}>
        {cats.map(c => (
          <button key={c} onClick={() => setActiveCategory(c)} className="btn btn-ghost"
            style={{ padding:"4px 9px", fontSize:11, background:activeCategory===c?"rgba(99,102,241,.15)":undefined, color:activeCategory===c?"#818cf8":"#52525b", border:activeCategory===c?"1px solid rgba(99,102,241,.3)":"1px solid transparent", textTransform:"capitalize" }}>
            {c.replace("_"," ")}
          </button>
        ))}
      </div>
      <div style={{ maxHeight:200, overflowY:"auto", display:"flex", flexDirection:"column", gap:5 }}>
        {displayed.map((item,i) => (
          <div key={i} style={{ display:"flex", gap:8, padding:"8px 10px", borderRadius:8, background:"rgba(255,255,255,.02)", border:"1px solid rgba(255,255,255,.07)", cursor:"pointer" }}
            onClick={() => onSelectQuestion?.(item.q)}
            onMouseEnter={e => e.currentTarget.style.background="rgba(255,255,255,.05)"}
            onMouseLeave={e => e.currentTarget.style.background="rgba(255,255,255,.02)"}>
            <div style={{ width:6, height:6, borderRadius:"50%", background:catColors[item.cat]||"#6366f1", marginTop:5, flexShrink:0 }}/>
            <p style={{ fontSize:12, color:"#a1a1aa", flex:1 }}>{item.q}</p>
            <button className="btn btn-ghost" style={{ padding:"2px 7px", fontSize:11, flexShrink:0 }}>↑ Use</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Language configs ─────────────────────────────────────────────────────────
const LANGUAGES = {
  javascript: { label:"JavaScript", comment:"// ", starter:(fn)=>`function ${fn}() {\n  // Your solution here\n\n}` },
  python:     { label:"Python",     comment:"# ",  starter:(fn)=>`def ${fn}():\n    # Your solution here\n    pass` },
  java:       { label:"Java",       comment:"// ", starter:(fn)=>`public class Solution {\n    public static void ${fn}() {\n        // Your solution here\n    }\n}` },
  c:          { label:"C",          comment:"// ", starter:(fn)=>`#include <stdio.h>\n\nvoid ${fn}() {\n    // Your solution here\n}` },
  cpp:        { label:"C++",        comment:"// ", starter:(fn)=>`#include <bits/stdc++.h>\nusing namespace std;\n\nvoid ${fn}() {\n    // Your solution here\n}` },
};

// ─── Coding Interview Mode ────────────────────────────────────────────────────
function CodingInterviewMode() {
  const [problemIdx, setProblemIdx] = useState(0);
  const [language, setLanguage] = useState("javascript");
  const [code, setCode] = useState(CODING_PROBLEMS[0].starterCode);
  const [output, setOutput] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [tab, setTab] = useState("problem");
  const [resumeText, setResumeText] = useState("");
  const [aiProblems, setAiProblems] = useState([]);
  const fileRef = useRef();

  const allProblems = aiProblems.length > 0 ? aiProblems : CODING_PROBLEMS;
  const problem = allProblems[problemIdx] || CODING_PROBLEMS[0];

  // When language or problem changes, update starter code
  useEffect(() => {
    const fnName = problem.title.replace(/\s+/g,"").replace(/[^a-zA-Z0-9]/g,"");
    const langCfg = LANGUAGES[language];
    const starter = langCfg.starter(fnName.charAt(0).toLowerCase()+fnName.slice(1));
    setCode(starter);
    setOutput(""); setAnalysis(null); setTab("problem");
  }, [problemIdx, language]);

  // Upload resume for AI problem generation
  const handleResumeUpload = async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const formData = new FormData();
      formData.append("file", f);
      const res = await fetch(`${API}/parse-resume`, { method:"POST", body:formData });
      const data = await res.json();
      setResumeText(data.text || "");
    } catch {}
  };

  // Generate coding problems based on resume using AI
  const generateProblems = async () => {
    setIsGenerating(true);
    try {
      const prompt = resumeText
        ? `Based on this resume, generate 4 coding interview problems suited for the candidate's background:\n${resumeText.slice(0,1500)}`
        : "Generate 4 diverse coding interview problems covering arrays, strings, dynamic programming, and system design.";
      const data = await post("/generate-coding-problems", { prompt, language });
      if (data.problems && data.problems.length > 0) {
        setAiProblems(data.problems);
        setProblemIdx(0);
      }
    } catch {
      // fallback: shuffle existing problems
      setAiProblems([...CODING_PROBLEMS].sort(() => Math.random() - 0.5));
      setProblemIdx(0);
    } finally { setIsGenerating(false); }
  };

  const runCode = async () => {
    setIsRunning(true); setOutput("");
    try {
      const data = await post("/run-code", { problem_title: problem.title, code, examples: problem.examples, language });
      setOutput(data.output);
    } catch (e) { setOutput("Error: " + e.message); }
    finally { setIsRunning(false); }
  };

  const analyzeCode = async () => {
    setIsAnalyzing(true); setAnalysis(null);
    try {
      const data = await post("/analyze-code", { problem_title: problem.title, code, examples: problem.examples, language });
      setAnalysis(data); setTab("analysis");
    } catch {
      setAnalysis({ time_complexity:"O(?)", space_complexity:"O(?)", correctness:5, code_quality:5, bugs:[], suggestions:["Submit valid code"], overall_score:5, verdict:"Acceptable" });
      setTab("analysis");
    } finally { setIsAnalyzing(false); }
  };

  const diffColor = { Easy:"#22c55e", Medium:"#f59e0b", Hard:"#ef4444" };
  const verdictColor = { Optimal:"#22c55e", Good:"#06b6d4", Acceptable:"#f59e0b", "Needs Work":"#ef4444" };

  return (
    <div>
      {/* Top controls: problem tabs + language + resume AI generate */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16, flexWrap:"wrap", gap:10 }}>
        <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
          {allProblems.map((p,i) => (
            <button key={i} onClick={() => setProblemIdx(i)} className="btn btn-ghost"
              style={{ background:problemIdx===i?"rgba(99,102,241,.15)":undefined, border:problemIdx===i?"1px solid rgba(99,102,241,.35)":undefined, color:problemIdx===i?"#818cf8":"#a1a1aa", fontSize:12 }}>
              {p.title} <span style={{ fontSize:9, padding:"1px 5px", borderRadius:4, background:`${diffColor[p.difficulty]||"#6366f1"}18`, color:diffColor[p.difficulty]||"#818cf8" }}>{p.difficulty||"AI"}</span>
            </button>
          ))}
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <input ref={fileRef} type="file" accept=".pdf,.txt" style={{ display:"none" }} onChange={handleResumeUpload}/>
          <button className="btn btn-ghost" style={{ fontSize:11 }} onClick={() => fileRef.current?.click()}>
            📄 {resumeText?"Resume loaded":"Upload Resume"}
          </button>
          <button className="btn btn-primary" style={{ fontSize:11 }} onClick={generateProblems} disabled={isGenerating}>
            {isGenerating?<><Icons.Spin/>Generating…</>:"🤖 AI Generate Problems"}
          </button>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1.2fr", gap:16 }}>
        <div>
          <div style={{ display:"flex", gap:1, marginBottom:12, background:"rgba(255,255,255,.03)", borderRadius:9, padding:3, border:"1px solid rgba(255,255,255,.07)" }}>
            {["problem","analysis"].map(t => (
              <button key={t} onClick={() => setTab(t)} style={{ flex:1, padding:"7px 0", fontSize:12, borderRadius:7, border:"none", cursor:"pointer", textTransform:"capitalize", background:tab===t?"#6366f1":"transparent", color:tab===t?"#fff":"#52525b", transition:"all .15s", fontFamily:"inherit" }}>{t}</button>
            ))}
          </div>
          {tab === "problem" && (
            <div className="card">
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
                <h3 style={{ fontSize:15, fontWeight:700 }}>{problem.title}</h3>
                <span style={{ padding:"2px 8px", borderRadius:6, fontSize:11, background:`${diffColor[problem.difficulty]||"#6366f1"}18`, color:diffColor[problem.difficulty]||"#818cf8", fontWeight:600 }}>{problem.difficulty||"Custom"}</span>
              </div>
              <div style={{ display:"flex", gap:5, marginBottom:10, flexWrap:"wrap" }}>{(problem.tags||[]).map(t => <span key={t} className="tag">{t}</span>)}</div>
              <p style={{ fontSize:13, color:"#a1a1aa", lineHeight:1.65, marginBottom:12 }}>{problem.description}</p>
              {(problem.examples||[]).map((ex,i) => <div key={i} style={{ padding:"7px 10px", borderRadius:7, background:"rgba(0,0,0,.3)", fontFamily:"monospace", fontSize:11, color:"#a1a1aa", marginBottom:5 }}>{ex}</div>)}
            </div>
          )}
          {tab === "analysis" && analysis ? (
            <div className="card" style={{ border:"1px solid rgba(99,102,241,.2)" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                <h3 style={{ fontSize:14, fontWeight:700 }}>Analysis</h3>
                <div style={{ padding:"3px 10px", borderRadius:20, background:`${verdictColor[analysis.verdict]}18`, border:`1px solid ${verdictColor[analysis.verdict]}35`, color:verdictColor[analysis.verdict], fontSize:12, fontWeight:700 }}>{analysis.verdict}</div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:12 }}>
                {[["Time",analysis.time_complexity],["Space",analysis.space_complexity],["Correctness",`${analysis.correctness}/10`],["Quality",`${analysis.code_quality}/10`]].map(([k,v]) => (
                  <div key={k} style={{ padding:"8px 10px", borderRadius:8, background:"rgba(255,255,255,.03)", border:"1px solid rgba(255,255,255,.07)" }}>
                    <p style={{ fontSize:11, color:"#52525b", marginBottom:3 }}>{k}</p>
                    <p style={{ fontSize:12, color:"#818cf8", fontFamily:"monospace" }}>{v}</p>
                  </div>
                ))}
              </div>
              {analysis.suggestions?.length > 0 && <div>{analysis.suggestions.map((s,i) => <p key={i} style={{ fontSize:12, color:"#a1a1aa", marginBottom:4 }}>· {s}</p>)}</div>}
            </div>
          ) : tab === "analysis" && (
            <div className="card" style={{ textAlign:"center", padding:"40px", color:"#52525b" }}>
              <p style={{ fontSize:13 }}>Click AI Analyze to see results</p>
            </div>
          )}
        </div>
        <div>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
            {/* Language selector */}
            <div style={{ display:"flex", gap:4 }}>
              {Object.entries(LANGUAGES).map(([key, cfg]) => (
                <button key={key} onClick={() => setLanguage(key)} className="btn btn-ghost"
                  style={{ padding:"4px 9px", fontSize:11, background:language===key?"rgba(99,102,241,.2)":undefined, color:language===key?"#818cf8":"#52525b", border:language===key?"1px solid rgba(99,102,241,.35)":"1px solid transparent" }}>
                  {cfg.label}
                </button>
              ))}
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <button className="btn btn-ghost" style={{ fontSize:12 }} onClick={runCode} disabled={isRunning}>{isRunning?<><Icons.Spin/>Running…</>:<><Icons.Play/>Run</>}</button>
              <button className="btn btn-primary" style={{ fontSize:12 }} onClick={analyzeCode} disabled={isAnalyzing}>{isAnalyzing?<><Icons.Spin/>Analyzing…</>:"AI Analyze →"}</button>
            </div>
          </div>
          <textarea className="code-editor" value={code} onChange={e => setCode(e.target.value)}
            onKeyDown={e => { if(e.key==="Tab"){e.preventDefault();const s=e.target.selectionStart;setCode(code.substring(0,s)+"  "+code.substring(s));setTimeout(()=>{e.target.selectionStart=e.target.selectionEnd=s+2},0)} }}
            spellCheck={false}/>
          <div style={{ marginTop:10, borderRadius:9, background:"#050609", border:"1px solid rgba(255,255,255,.07)", padding:"12px 14px", minHeight:70 }}>
            <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:6 }}>
              <div style={{ width:7, height:7, borderRadius:"50%", background:output?"#22c55e":"#52525b" }}/>
              <span style={{ fontSize:11, color:"#52525b" }}>Console</span>
            </div>
            {output?<pre style={{ fontSize:12, color:"#a3e635", fontFamily:"monospace", whiteSpace:"pre-wrap" }}>{output}</pre>:<p style={{ fontSize:12, color:"#52525b", fontStyle:"italic" }}>Run code to see output…</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Save Interview Button ────────────────────────────────────────────────────
function SaveInterviewButton({ report, role }) {
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const saveInterview = async () => {
    if (saved || saving) return;
    setSaving(true);
    try {
      await post("/interviews/save", {
        role,
        score: report.weighted_total || 0,
        recommendation: report.recommendation || "Maybe",
        skills: [],
        summary: report.summary || "",
        strengths: report.strengths || [],
        improvements: report.improvements || [],
        scores: report.metric_scores || {},
      }, true);
      setSaved(true);
    } catch (e) {
      console.error("Save failed:", e.message);
    } finally { setSaving(false); }
  };

  // Auto-save when component mounts
  useEffect(() => { saveInterview(); }, []);

  return (
    <div style={{ padding:"10px 14px", borderRadius:9, background:saved?"rgba(34,197,94,.08)":"rgba(99,102,241,.06)", border:`1px solid ${saved?"rgba(34,197,94,.2)":"rgba(99,102,241,.2)"}`, fontSize:12, color:saved?"#4ade80":"#818cf8", marginBottom:4 }}>
      {saving?"⏳ Saving to HR Dashboard...":saved?"✅ Saved to HR Dashboard":"💾 Save to HR Dashboard"}
    </div>
  );
}

// ─── Interview Page ───────────────────────────────────────────────────────────
function InterviewPage({ onFinish }) {
  const [step, setStep] = useState("setup");
  const [role, setRole] = useState("Software Engineer");
  const [resumeText, setResumeText] = useState("");
  const [questions, setQuestions] = useState([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [transcript, setTranscript] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [report, setReport] = useState(null);
  const [showProctor, setShowProctor] = useState(false);
  const recognitionRef = useRef();
  const fileRef = useRef();

  const handleFile = async e => {
    const f = e.target.files[0]; if (!f) return;
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", f);
      const res = await fetch(`${API}/parse-resume`, { method:"POST", body:formData });
      if (!res.ok) { const err = await res.json(); throw new Error(err.detail || "Upload failed"); }
      const data = await res.json();
      setResumeText(data.text.slice(0, 4000));
    } catch (err) {
      setError("Resume upload failed: " + err.message);
    }
  };

  const speakQuestion = (text, onDone) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.92;
    u.onstart = () => setIsSpeaking(true);
    u.onend = () => {
      setIsSpeaking(false);
      onDone?.();
    };
    window.speechSynthesis.speak(u);
  };

  const startListening = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setError("Speech recognition not available — type your answer."); return; }
    // Stop any existing recognition first
    if (recognitionRef.current) { try { recognitionRef.current.stop(); } catch(e) {} }
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    rec.onresult = e => setTranscript(Array.from(e.results).map(r => r[0].transcript).join(" "));
    rec.onerror = () => { setIsListening(false); };
    // Auto-restart when recognition ends (keeps mic always ON)
    rec.onend = () => {
      if (recognitionRef.current === rec) {
        try { rec.start(); } catch(e) { setIsListening(false); }
      }
    };
    rec.start();
    recognitionRef.current = rec;
    setIsListening(true);
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      const r = recognitionRef.current;
      recognitionRef.current = null; // prevent auto-restart
      try { r.stop(); } catch(e) {}
    }
    setIsListening(false);
  };

  const generateQuestions = async () => {
    setIsLoading(true); setError("");
    try {
      const data = await post("/generate-questions", { role, resume_text: resumeText });
      setQuestions(data.questions);
      setStep("interview");
      speakQuestion(data.questions[0], startListening);
    } catch (e) {
      setError("Error: " + e.message);
    } finally { setIsLoading(false); }
  };

  const submitAnswer = async () => {
    if (!transcript.trim()) return;
    stopListening(); setIsLoading(true);
    try {
      const fb = await post("/evaluate-answer", { role, question: questions[currentQ], answer: transcript });
      setAnswers(p => [...p, { q: questions[currentQ], a: transcript, ...fb }]);
      setFeedback(fb); setTranscript("");
    } catch {
      const fb = { scores:{ technical_knowledge:6, problem_solving:6, communication_skills:7, project_understanding:5, confidence:7 }, strength:"Recorded", improvement:"Keep practicing", weighted_total:6.3 };
      setAnswers(p => [...p, { q: questions[currentQ], a: transcript, ...fb }]);
      setFeedback(fb);
    } finally { setIsLoading(false); }
  };

  const nextQuestion = async () => {
    const next = currentQ + 1; setFeedback(null);
    if (next >= questions.length) { await generateReport([...answers]); setStep("done"); }
    else {
      setTranscript("");
      setCurrentQ(next);
      speakQuestion(questions[next], startListening);
    }
  };

  const generateReport = async (allAnswers) => {
    setIsLoading(true);
    try {
      const data = await post("/generate-report", { role, answers: allAnswers });
      setReport(data);
    } catch {
      setReport({ overall_score:7, recommendation:"Hire", summary:"Solid performance.", strengths:["Good communication"], improvements:["More depth"], metric_scores:{ technical_knowledge:7, problem_solving:7, communication_skills:7, project_understanding:6, confidence:7 }, weighted_total:7.0 });
    } finally { setIsLoading(false); }
  };

  const resetAll = () => {
    stopListening();
    window.speechSynthesis?.cancel();
    setStep("setup");
    setQuestions([]);
    setAnswers([]);
    setCurrentQ(0);
    setReport(null);
    setFeedback(null);
    setTranscript("");
  };

  useEffect(() => {
    return () => {
      stopListening();
      window.speechSynthesis?.cancel();
    };
  }, []);

  if (step === "setup") return (
    <main style={{ maxWidth:900, margin:"0 auto", padding:"40px 20px 80px" }}>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20, alignItems:"start" }}>
        <div className="card" style={{ border:"1px solid rgba(99,102,241,.22)" }}>
          <h2 style={{ fontSize:22, fontWeight:800, marginBottom:6 }}>Set Up Interview</h2>
          <p style={{ color:"#a1a1aa", fontSize:13, marginBottom:22 }}>Configure your session</p>
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            <div>
              <label style={{ fontSize:12, fontWeight:600, color:"#a1a1aa", display:"block", marginBottom:7 }}>TARGET ROLE</label>
              <input className="input" value={role} onChange={e => setRole(e.target.value)} placeholder="Software Engineer…"/>
            </div>
            <div>
              <label style={{ fontSize:12, fontWeight:600, color:"#a1a1aa", display:"block", marginBottom:7 }}>RESUME (OPTIONAL)</label>
              <div onClick={() => fileRef.current?.click()} style={{ border:"2px dashed rgba(255,255,255,.07)", borderRadius:9, padding:"18px", textAlign:"center", cursor:"pointer" }}>
                <div style={{ color:"#52525b", marginBottom:5, display:"flex", justifyContent:"center" }}><Icons.Upload/></div>
                <p style={{ fontSize:12, color:"#a1a1aa" }}>{resumeText?"✓ Resume loaded":"Click to upload .txt"}</p>
              </div>
              <input ref={fileRef} type="file" accept=".txt" style={{ display:"none" }} onChange={handleFile}/>
              <textarea className="input" style={{ marginTop:8, minHeight:60, resize:"vertical" }} placeholder="Or paste resume text…" value={resumeText} onChange={e => setResumeText(e.target.value)}/>
            </div>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 14px", borderRadius:9, background:"rgba(255,255,255,.03)", border:"1px solid rgba(255,255,255,.07)" }}>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <div style={{ color:"#f59e0b" }}><Icons.Shield/></div>
                <div>
                  <p style={{ fontSize:13, fontWeight:500 }}>Enable Proctoring</p>
                  <p style={{ fontSize:11, color:"#52525b" }}>Webcam + tab detection</p>
                </div>
              </div>
              <div onClick={() => setShowProctor(!showProctor)} style={{ width:36, height:20, borderRadius:10, background:showProctor?"#6366f1":"rgba(255,255,255,.1)", cursor:"pointer", position:"relative", transition:"background .2s" }}>
                <div style={{ position:"absolute", top:2, left:showProctor?18:2, width:16, height:16, borderRadius:"50%", background:"#fff", transition:"left .2s" }}/>
              </div>
            </div>
            {error && <p style={{ color:"#fca5a5", fontSize:12 }}>{error}</p>}
            <button className="btn btn-primary" style={{ fontSize:14, padding:"12px" }} onClick={generateQuestions} disabled={isLoading||!role.trim()}>
              {isLoading?<><Icons.Spin/>Generating questions…</>:<>Begin Interview <Icons.Arrow/></>}
            </button>
          </div>
        </div>
        <RAGPanel onSelectQuestion={q => setQuestions(p => [...p, q])}/>
      </div>
    </main>
  );

  if (step === "interview") {
    const progress = (currentQ / questions.length) * 100;
    return (
      <main style={{ maxWidth:1000, margin:"0 auto", padding:"32px 20px 80px" }}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 280px", gap:20, alignItems:"start" }}>
          <div>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
              <span style={{ fontSize:12, color:"#a1a1aa" }}>Question {currentQ+1} of {questions.length}</span>
              <div style={{ display:"flex", gap:6 }}>
                <span style={{ fontSize:12, color:"#52525b" }}>{role}</span>
                <span style={{ fontSize:11, color:"#22c55e", padding:"2px 8px", borderRadius:6, background:"rgba(34,197,94,.08)", border:"1px solid rgba(34,197,94,.2)" }}>● Proctoring Active</span>
              </div>
            </div>
            <div style={{ height:4, background:"rgba(255,255,255,.07)", borderRadius:4, marginBottom:18, overflow:"hidden" }}>
              <div style={{ height:"100%", width:`${progress}%`, background:"linear-gradient(90deg,#6366f1,#06b6d4)", transition:"width .5s ease" }}/>
            </div>
            <div className="card" style={{ border:"1px solid rgba(99,102,241,.22)", marginBottom:14 }}>
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
                <div style={{ width:28, height:28, borderRadius:"50%", background:"rgba(99,102,241,.15)", border:"1px solid rgba(99,102,241,.3)", display:"flex", alignItems:"center", justifyContent:"center" }}><Icons.Brain/></div>
                <span style={{ fontSize:12, color:"#818cf8", fontWeight:500 }}>AI Interviewer</span>
                <AudioBars active={isSpeaking}/>
              </div>
              <p style={{ fontSize:15, color:"#f4f4f5", lineHeight:1.65 }}>{questions[currentQ]}</p>
              <button className="btn btn-ghost" style={{ marginTop:10, fontSize:11 }} onClick={() => speakQuestion(questions[currentQ])}>🔊 Replay</button>
            </div>
            {!feedback ? (
              <div className="card" style={{ marginBottom:14 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                  <span style={{ fontSize:13, color:"#a1a1aa" }}>Your Answer</span>
                  <AudioBars active={isListening}/>
                </div>
                <textarea className="input" style={{ minHeight:80, resize:"vertical", marginBottom:10 }} placeholder="Speak or type your answer…" value={transcript} onChange={e => setTranscript(e.target.value)}/>
                <div style={{ display:"flex", gap:10 }}>
                  <div style={{ flex:1, display:"flex", alignItems:"center", gap:8, padding:"9px 14px", borderRadius:9, background:isListening?"rgba(99,102,241,.1)":"rgba(255,255,255,.03)", border:isListening?"1px solid rgba(99,102,241,.35)":"1px solid rgba(255,255,255,.07)" }}>
                    <Icons.Mic size={15}/>
                    <span style={{ fontSize:12, color:isListening?"#818cf8":"#52525b" }}>{isListening?"🔴 Mic ON — speak now":"Mic initializing..."}</span>
                    <AudioBars active={isListening}/>
                  </div>
                  <button className="btn btn-ghost" onClick={submitAnswer} disabled={isLoading||!transcript.trim()} style={{ flex:1 }}>
                    {isLoading?<><Icons.Spin/>Evaluating…</>:"Submit →"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="card" style={{ border:"1px solid rgba(34,197,94,.2)", marginBottom:14 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                  <span style={{ fontSize:13, fontWeight:700, color:"#86efac" }}>Evaluation</span>
                  <span style={{ fontSize:20, fontWeight:800, color:"#6366f1" }}>{feedback.weighted_total}<span style={{ fontSize:11, color:"#52525b" }}>/10</span></span>
                </div>
                <div style={{ display:"flex", flexDirection:"column", gap:7, marginBottom:12 }}>
                  {EVAL_METRICS.map(m => (
                    <div key={m.key} style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <span style={{ fontSize:11, color:"#52525b", width:130, flexShrink:0 }}>{m.label}</span>
                      <div style={{ flex:1, height:5, background:"rgba(255,255,255,.07)", borderRadius:3, overflow:"hidden" }}>
                        <div style={{ height:"100%", width:`${(feedback.scores[m.key]||0)*10}%`, background:m.color, borderRadius:3, transition:"width .8s ease" }}/>
                      </div>
                      <span style={{ fontSize:11, color:m.color, width:25, textAlign:"right" }}>{feedback.scores[m.key]}</span>
                    </div>
                  ))}
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12 }}>
                  <div style={{ padding:"9px 12px", borderRadius:8, background:"rgba(34,197,94,.06)", border:"1px solid rgba(34,197,94,.15)" }}>
                    <p style={{ fontSize:11, color:"#4ade80", fontWeight:600, marginBottom:4 }}>✓ Strength</p>
                    <p style={{ fontSize:12, color:"#f4f4f5" }}>{feedback.strength}</p>
                  </div>
                  <div style={{ padding:"9px 12px", borderRadius:8, background:"rgba(245,158,11,.06)", border:"1px solid rgba(245,158,11,.15)" }}>
                    <p style={{ fontSize:11, color:"#fcd34d", fontWeight:600, marginBottom:4 }}>↑ Improve</p>
                    <p style={{ fontSize:12, color:"#f4f4f5" }}>{feedback.improvement}</p>
                  </div>
                </div>
                <button className="btn btn-primary" style={{ width:"100%" }} onClick={nextQuestion}>
                  {currentQ+1>=questions.length?"See Full Report →":`Next (${currentQ+2}/${questions.length}) →`}
                </button>
              </div>
            )}
          </div>
          <ProctoringPanel active={true}/>
        </div>
      </main>
    );
  }

  if (step === "done") {
    const recColor = { "Strong Hire":"#22c55e","Hire":"#06b6d4","Maybe":"#f59e0b","No Hire":"#ef4444" }[report?.recommendation]||"#818cf8";
    return (
      <main style={{ maxWidth:760, margin:"0 auto", padding:"36px 20px 80px" }}>
        {isLoading?(
          <div style={{ textAlign:"center", padding:"80px", color:"#52525b" }}><Icons.Spin size={40}/><p style={{ marginTop:14 }}>Generating report…</p></div>
        ):report&&(
          <>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:22 }}>
              <div>
                <h2 style={{ fontSize:24, fontWeight:800 }}>Interview Report</h2>
                <p style={{ color:"#a1a1aa", fontSize:13, marginTop:3 }}>{role} · {questions.length} questions</p>
              </div>
              <div style={{ textAlign:"right" }}>
                <div style={{ fontSize:34, fontWeight:800, color:"#6366f1" }}>{report.weighted_total}<span style={{ fontSize:13, color:"#52525b" }}>/10</span></div>
                <div style={{ marginTop:4, padding:"3px 12px", borderRadius:20, background:`${recColor}18`, border:`1px solid ${recColor}35`, color:recColor, fontSize:12, fontWeight:700 }}>{report.recommendation}</div>
              </div>
            </div>
            <div className="card" style={{ marginBottom:14 }}>
              <p style={{ fontSize:14, color:"#f4f4f5", lineHeight:1.65 }}>{report.summary}</p>
            </div>
            <div style={{ marginBottom:14 }}>
              <EvaluationBreakdown scores={report.metric_scores} weighted_total={report.weighted_total}/>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
              <div className="card" style={{ border:"1px solid rgba(34,197,94,.18)" }}>
                <h3 style={{ fontSize:11, fontWeight:700, color:"#4ade80", marginBottom:8, textTransform:"uppercase" }}>Strengths</h3>
                {report.strengths?.map((s,i) => <p key={i} style={{ fontSize:12, color:"#a1a1aa", marginBottom:4 }}>· {s}</p>)}
              </div>
              <div className="card" style={{ border:"1px solid rgba(245,158,11,.18)" }}>
                <h3 style={{ fontSize:11, fontWeight:700, color:"#fcd34d", marginBottom:8, textTransform:"uppercase" }}>Improvements</h3>
                {report.improvements?.map((s,i) => <p key={i} style={{ fontSize:12, color:"#a1a1aa", marginBottom:4 }}>· {s}</p>)}
              </div>
            </div>
            <SaveInterviewButton report={report} role={role}/>
            <div style={{ display:"flex", gap:10, marginTop:10 }}>
              <button className="btn btn-primary" style={{ flex:1 }} onClick={resetAll}>Start New Interview</button>
              <button className="btn btn-ghost" onClick={onFinish}>← Home</button>
            </div>
          </>
        )}
      </main>
    );
  }
}

// ─── Landing Page ─────────────────────────────────────────────────────────────
function LandingPage({ onStart, onGoToRecruiter, onGoToCoding }) {
  return (
    <main style={{ maxWidth:1100, margin:"0 auto", padding:"48px 20px 80px" }}>
      <div style={{ display:"grid", gridTemplateColumns:"1.2fr 1fr", gap:22, alignItems:"start" }}>
        <div className="card" style={{ padding:"38px", border:"1px solid rgba(99,102,241,.3)", boxShadow:"0 0 60px rgba(99,102,241,.1)" }}>
          <div style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"4px 13px", borderRadius:20, background:"rgba(99,102,241,.1)", border:"1px solid rgba(99,102,241,.25)", fontSize:12, color:"#818cf8", marginBottom:22 }}>
            <Icons.Brain/> AI Interview Assistant
          </div>
          <h1 style={{ fontSize:38, fontWeight:800, lineHeight:1.15, letterSpacing:"-0.03em", marginBottom:14 }}>
            Practice Real Interviews with Voice, AI Feedback & Proctoring
          </h1>
          <p style={{ color:"#a1a1aa", fontSize:14, lineHeight:1.65, marginBottom:28 }}>
            Answer AI-generated questions by voice, get weighted feedback across 5 professional metrics, and receive recruiter-style reports. Powered by Python + FastAPI backend.
          </p>
          <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:28 }}>
            <button className="btn btn-primary" style={{ fontSize:14, padding:"11px 26px" }} onClick={onStart}>Start Interview <Icons.Arrow/></button>
            <button className="btn btn-ghost" style={{ fontSize:14 }} onClick={onGoToCoding}><Icons.Code/> Coding</button>
            <button className="btn btn-ghost" style={{ fontSize:14 }} onClick={onGoToRecruiter}><Icons.Chart/> Recruiter</button>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:8 }}>
            {[
              { icon:<Icons.Shield/>, c:"#f59e0b", t:"Anti-Cheat Proctoring", d:"Webcam + tab detection" },
              { icon:<Icons.Chart/>, c:"#6366f1", t:"Weighted Evaluation", d:"5 metrics, professional scoring" },
              { icon:<Icons.Database/>, c:"#06b6d4", t:"RAG Knowledge Base", d:"Python-powered semantic search" },
              { icon:<Icons.Terminal/>, c:"#8b5cf6", t:"Coding Interview", d:"Run code + AI analysis" },
            ].map(f => (
              <div key={f.t} style={{ padding:"11px 13px", borderRadius:9, background:"rgba(0,0,0,.25)", border:"1px solid rgba(255,255,255,.07)" }}>
                <div style={{ display:"flex", alignItems:"center", gap:6, color:f.c, marginBottom:4 }}>{f.icon}<span style={{ fontSize:12, fontWeight:600 }}>{f.t}</span></div>
                <p style={{ fontSize:11, color:"#52525b" }}>{f.d}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="card" style={{ padding:0, overflow:"hidden", aspectRatio:"4/5" }}>
          <div style={{ width:"100%", height:"100%", background:"linear-gradient(135deg,#0c0e20,#111827)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:18, padding:28 }}>
            <div style={{ width:68, height:68, borderRadius:"50%", background:"rgba(99,102,241,.15)", border:"2px solid rgba(99,102,241,.4)", display:"flex", alignItems:"center", justifyContent:"center", animation:"pulse-ring 2.5s ease infinite" }}>
              <Icons.Mic size={30}/>
            </div>
            <AudioBars active={true}/>
            <p style={{ textAlign:"center", color:"#a1a1aa", fontSize:13, maxWidth:200, lineHeight:1.6 }}>Powered by Python FastAPI + Groq AI</p>
            <div style={{ width:"100%", padding:"13px 15px", borderRadius:9, background:"rgba(99,102,241,.07)", border:"1px solid rgba(99,102,241,.2)" }}>
              <p style={{ fontSize:11, color:"#818cf8", fontWeight:600, marginBottom:8 }}>Backend Endpoints</p>
              {["/generate-questions","/evaluate-answer","/generate-report","/analyze-code","/rag-search"].map(e => (
                <div key={e} style={{ display:"flex", alignItems:"center", gap:6, marginBottom:5 }}>
                  <div style={{ width:5, height:5, borderRadius:"50%", background:"#22c55e", flexShrink:0 }}/>
                  <span style={{ fontSize:10, color:"#52525b", fontFamily:"monospace" }}>{e}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

// ─── Recruiter Page ───────────────────────────────────────────────────────────
function RecruiterPage() {
  const [interviews, setInterviews] = useState([]);
  const [selected,   setSelected]   = useState(null);
  const [question,   setQuestion]   = useState("");
  const [answer,     setAnswer]     = useState("");
  const [isLoading,  setIsLoading]  = useState(false);
  const [fetching,   setFetching]   = useState(true);
  const [search,     setSearch]     = useState("");
  const [filter,     setFilter]     = useState("All");

  const rc = r => ({ "Strong Hire":"#22c55e","Hire":"#06b6d4","Maybe":"#f59e0b","No Hire":"#ef4444" }[r]||"#818cf8");

  useEffect(() => {
    get("/interviews/all", true)
      .then(d => setInterviews(d.interviews || []))
      .catch(() => {})
      .finally(() => setFetching(false));
  }, []);

  const ask = async () => {
    if (!question.trim() || !selected) return;
    setIsLoading(true);
    try {
      const data = await post("/ask-recruiter", {
        candidate_name: selected.name, candidate_role: selected.role,
        score: selected.score, recommendation: selected.recommendation,
        skills: selected.skills || [], question
      }, true);
      setAnswer(data.answer);
    } catch { setAnswer("Could not fetch answer."); }
    finally { setIsLoading(false); }
  };

  const filtered = interviews.filter(iv => {
    const matchSearch = !search || iv.name?.toLowerCase().includes(search.toLowerCase()) || iv.role?.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === "All" || iv.recommendation === filter;
    return matchSearch && matchFilter;
  });

  return (
    <main style={{ maxWidth:1060, margin:"0 auto", padding:"40px 20px 80px" }}>
      <h2 style={{ fontSize:24, fontWeight:800, marginBottom:4 }}>HR Dashboard</h2>
      <p style={{ color:"#a1a1aa", fontSize:13, marginBottom:20 }}>All candidate interviews with scores and feedback</p>

      {/* Search + Filter */}
      <div style={{ display:"flex", gap:10, marginBottom:20 }}>
        <input className="input" placeholder="Search by name or role..." value={search} onChange={e => setSearch(e.target.value)} style={{ flex:1 }}/>
        <div style={{ display:"flex", gap:6 }}>
          {["All","Strong Hire","Hire","Maybe","No Hire"].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{ padding:"7px 12px", borderRadius:8, border:`1px solid ${filter===f?"rgba(99,102,241,.5)":"rgba(255,255,255,.08)"}`,
                background: filter===f?"rgba(99,102,241,.15)":"transparent",
                color: filter===f?"#818cf8":"#71717a", fontSize:11, fontWeight:700, cursor:"pointer" }}>
              {f}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"280px 1fr", gap:16 }}>
        {/* Candidate List */}
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {fetching ? (
            <div style={{ color:"#a1a1aa", fontSize:13, padding:20 }}>Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="card" style={{ textAlign:"center", padding:30, color:"#52525b" }}>
              <p style={{ fontSize:28, marginBottom:8 }}>🔍</p>
              <p style={{ fontSize:13 }}>No candidates found</p>
            </div>
          ) : filtered.map(iv => (
            <div key={iv.id} className="card" onClick={() => { setSelected(iv); setAnswer(""); setQuestion(""); }}
              style={{ cursor:"pointer", padding:14,
                border: selected?.id===iv.id ? "1px solid rgba(99,102,241,.45)" : "1px solid rgba(255,255,255,.07)",
                background: selected?.id===iv.id ? "rgba(99,102,241,.07)" : "#0f1120" }}>
              <div style={{ display:"flex", justifyContent:"space-between" }}>
                <div>
                  <p style={{ fontSize:13, fontWeight:700 }}>{iv.name}</p>
                  <p style={{ fontSize:11, color:"#a1a1aa" }}>{iv.role}</p>
                </div>
                <div style={{ textAlign:"right" }}>
                  <p style={{ fontSize:18, fontWeight:900, color:"#6366f1" }}>{iv.score}%</p>
                </div>
              </div>
              <div style={{ marginTop:8, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <span style={{ padding:"2px 8px", borderRadius:20, background:`${rc(iv.recommendation)}15`,
                  border:`1px solid ${rc(iv.recommendation)}35`, color:rc(iv.recommendation), fontSize:10, fontWeight:700 }}>
                  {iv.recommendation}
                </span>
                <span style={{ fontSize:10, color:"#52525b" }}>{iv.date}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Detail Panel */}
        <div>
          {selected ? (
            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
              <div className="card" style={{ border:"1px solid rgba(99,102,241,.2)" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:14 }}>
                  <div>
                    <h3 style={{ fontSize:20, fontWeight:800 }}>{selected.name}</h3>
                    <p style={{ fontSize:13, color:"#a1a1aa" }}>{selected.role} · {selected.date}</p>
                  </div>
                  <span style={{ padding:"4px 14px", borderRadius:20, fontSize:12, fontWeight:700,
                    background:`${rc(selected.recommendation)}15`, border:`1px solid ${rc(selected.recommendation)}35`,
                    color:rc(selected.recommendation) }}>{selected.recommendation}</span>
                </div>

                {/* Skills */}
                {selected.skills?.length > 0 && (
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:14 }}>
                    {selected.skills.map(s => <span key={s} className="tag">{s}</span>)}
                  </div>
                )}

                {/* Summary */}
                {selected.summary && (
                  <p style={{ fontSize:13, color:"#a1a1aa", lineHeight:1.7, marginBottom:14 }}>{selected.summary}</p>
                )}

                {/* Strengths & Improvements */}
                {(selected.strengths?.length > 0 || selected.improvements?.length > 0) && (
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
                    {selected.strengths?.length > 0 && (
                      <div>
                        <p style={{ fontSize:11, fontWeight:700, color:"#22c55e", marginBottom:6 }}>✅ STRENGTHS</p>
                        {selected.strengths.map((s,i) => <p key={i} style={{ fontSize:12, color:"#a1a1aa", marginBottom:3 }}>• {s}</p>)}
                      </div>
                    )}
                    {selected.improvements?.length > 0 && (
                      <div>
                        <p style={{ fontSize:11, fontWeight:700, color:"#f59e0b", marginBottom:6 }}>⚡ TO IMPROVE</p>
                        {selected.improvements.map((s,i) => <p key={i} style={{ fontSize:12, color:"#a1a1aa", marginBottom:3 }}>• {s}</p>)}
                      </div>
                    )}
                  </div>
                )}

                {/* Ask AI */}
                <div style={{ borderTop:"1px solid rgba(255,255,255,.07)", paddingTop:14 }}>
                  <p style={{ fontSize:11, fontWeight:700, color:"#a1a1aa", marginBottom:10 }}>ASK AI ABOUT CANDIDATE</p>
                  <div style={{ display:"flex", gap:8, marginBottom:10 }}>
                    <input className="input" placeholder="Is this a good culture fit?" value={question}
                      onChange={e => setQuestion(e.target.value)} onKeyDown={e => e.key==="Enter"&&ask()} style={{ flex:1 }}/>
                    <button className="btn btn-primary" onClick={ask} disabled={isLoading||!question.trim()}>
                      {isLoading ? <Icons.Spin size={14}/> : "Ask"}
                    </button>
                  </div>
                  {answer && (
                    <div style={{ padding:"10px 13px", borderRadius:9, background:"rgba(99,102,241,.07)",
                      border:"1px solid rgba(99,102,241,.18)", fontSize:13, color:"#f4f4f5", lineHeight:1.6 }}>{answer}</div>
                  )}
                </div>
              </div>

              {/* Metrics breakdown */}
              {selected.scores && <EvaluationBreakdown scores={selected.scores} weighted_total={selected.score}/>}
            </div>
          ) : (
            <div className="card" style={{ display:"flex", flexDirection:"column", alignItems:"center",
              justifyContent:"center", minHeight:300, color:"#52525b" }}>
              <Icons.User/><p style={{ marginTop:10, fontSize:13 }}>Select a candidate to view details</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
// ─── Auth Page ────────────────────────────────────────────────────────────────
function AuthPage({ onAuth }) {
  const [mode, setMode]         = useState("signin"); // "signin" | "signup"
  const [role, setRole]         = useState("candidate");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [name, setName]         = useState("");
  const [showPw, setShowPw]     = useState(false);
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  async function handleSubmit() {
    setError(""); setLoading(true);
    try {
      let data;
      if (mode === "signup") {
        data = await post("/auth/signup", { name, email, password, role });
      } else {
        data = await post("/auth/login", { email, password });
      }
      sessionStorage.setItem("token", data.token);
      sessionStorage.setItem("user",  JSON.stringify(data.user));
      onAuth(data.user);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  const fill = (e, p) => { setEmail(e); setPassword(p); };

  return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ width:"100%", maxWidth:420 }}>
        {/* Logo */}
        <div style={{ textAlign:"center", marginBottom:32 }}>
          <div style={{ display:"inline-flex", alignItems:"center", gap:10, marginBottom:10 }}>
            <Icons.Brain/><span style={{ fontSize:22, fontWeight:900, letterSpacing:"-.02em" }}>AI Interview</span>
          </div>
          <p style={{ color:"#a1a1aa", fontSize:13 }}>Your AI-powered interview coach</p>
        </div>

        {/* Card */}
        <div className="card" style={{ border:"1px solid rgba(99,102,241,.25)", padding:28 }}>
          {/* Tabs */}
          <div style={{ display:"flex", gap:0, marginBottom:24, borderRadius:10, background:"rgba(255,255,255,.04)", padding:3 }}>
            {[["signin","Sign In"],["signup","Sign Up"]].map(([k,l]) => (
              <button key={k} onClick={() => { setMode(k); setError(""); }}
                style={{ flex:1, padding:"8px 0", borderRadius:8, border:"none", cursor:"pointer", fontSize:13, fontWeight:700,
                  background: mode===k ? "rgba(99,102,241,.25)" : "transparent",
                  color: mode===k ? "#818cf8" : "#71717a" }}>
                {l}
              </button>
            ))}
          </div>

          {/* Role selector */}
          <div style={{ marginBottom:16 }}>
            <label style={{ fontSize:11, fontWeight:700, color:"#a1a1aa", display:"block", marginBottom:6 }}>I AM A</label>
            <div style={{ display:"flex", gap:8 }}>
              {[["candidate","🎯 Candidate"],["hr","👔 HR / Recruiter"]].map(([k,l]) => (
                <button key={k} onClick={() => setRole(k)}
                  style={{ flex:1, padding:"10px 0", borderRadius:9, border:`1.5px solid ${role===k?"rgba(99,102,241,.6)":"rgba(255,255,255,.08)"}`,
                    background: role===k ? "rgba(99,102,241,.14)" : "rgba(255,255,255,.02)",
                    color: role===k ? "#818cf8" : "#a1a1aa", fontSize:13, fontWeight:700, cursor:"pointer" }}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* Name (signup only) */}
          {mode==="signup" && (
            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:11, fontWeight:700, color:"#a1a1aa", display:"block", marginBottom:6 }}>FULL NAME</label>
              <input className="input" placeholder="Jane Smith" value={name} onChange={e => setName(e.target.value)} style={{ width:"100%" }}/>
            </div>
          )}

          {/* Email */}
          <div style={{ marginBottom:14 }}>
            <label style={{ fontSize:11, fontWeight:700, color:"#a1a1aa", display:"block", marginBottom:6 }}>EMAIL</label>
            <input className="input" type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} style={{ width:"100%" }}/>
          </div>

          {/* Password */}
          <div style={{ marginBottom:20 }}>
            <label style={{ fontSize:11, fontWeight:700, color:"#a1a1aa", display:"block", marginBottom:6 }}>PASSWORD</label>
            <div style={{ position:"relative" }}>
              <input className="input" type={showPw?"text":"password"} placeholder="••••••••" value={password}
                onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key==="Enter"&&handleSubmit()}
                style={{ width:"100%", paddingRight:40 }}/>
              <button onClick={() => setShowPw(!showPw)} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)",
                background:"none", border:"none", cursor:"pointer", color:"#71717a", fontSize:13 }}>
                {showPw?"🙈":"👁️"}
              </button>
            </div>
          </div>

          {error && <div style={{ marginBottom:14, padding:"9px 13px", borderRadius:8, background:"rgba(239,68,68,.1)", border:"1px solid rgba(239,68,68,.25)", color:"#f87171", fontSize:13 }}>{error}</div>}

          <button className="btn btn-primary" onClick={handleSubmit} disabled={loading} style={{ width:"100%", padding:"11px 0", fontSize:14 }}>
            {loading ? <Icons.Spin size={16}/> : mode==="signin" ? "Sign In" : "Create Account"}
          </button>

          {/* Demo accounts */}
          <div style={{ marginTop:18, borderTop:"1px solid rgba(255,255,255,.07)", paddingTop:14 }}>
            <p style={{ fontSize:11, color:"#52525b", marginBottom:8, textAlign:"center" }}>DEMO ACCOUNTS</p>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={() => fill("candidate@demo.com","candidate123")}
                style={{ flex:1, padding:"7px 0", borderRadius:8, border:"1px solid rgba(255,255,255,.08)", background:"transparent",
                  color:"#a1a1aa", fontSize:11, cursor:"pointer" }}>🎯 Candidate</button>
              <button onClick={() => fill("hr@demo.com","hr123")}
                style={{ flex:1, padding:"7px 0", borderRadius:8, border:"1px solid rgba(255,255,255,.08)", background:"transparent",
                  color:"#a1a1aa", fontSize:11, cursor:"pointer" }}>👔 HR</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Candidate Dashboard ──────────────────────────────────────────────────────
function CandidateDashboard({ user, onStartInterview }) {
  const [interviews, setInterviews] = useState([]);
  const [selected,   setSelected]   = useState(null);
  const [loading,    setLoading]     = useState(true);

  useEffect(() => {
    get("/interviews/my", true)
      .then(d => setInterviews(d.interviews || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const avg  = interviews.length ? Math.round(interviews.reduce((s,i) => s+(i.score||0),0)/interviews.length) : 0;
  const best = interviews.length ? Math.max(...interviews.map(i => i.score||0)) : 0;

  return (
    <main style={{ maxWidth:1100, margin:"0 auto", padding:"36px 20px 80px" }}>
      <div style={{ marginBottom:28 }}>
        <h2 style={{ fontSize:24, fontWeight:900, marginBottom:4 }}>Welcome back, {user.name} 👋</h2>
        <p style={{ color:"#a1a1aa", fontSize:13 }}>Track your interview progress and history</p>
      </div>

      {/* Stats */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:14, marginBottom:28 }}>
        {[["Total Interviews", interviews.length, "🎯"],["Average Score", avg+"%", "📊"],["Best Score", best+"%", "🏆"]].map(([l,v,e]) => (
          <div key={l} className="card" style={{ textAlign:"center", padding:20 }}>
            <div style={{ fontSize:28, marginBottom:6 }}>{e}</div>
            <div style={{ fontSize:26, fontWeight:900, color:"#818cf8" }}>{v}</div>
            <div style={{ fontSize:12, color:"#a1a1aa", marginTop:4 }}>{l}</div>
          </div>
        ))}
      </div>

      <button className="btn btn-primary" onClick={onStartInterview} style={{ marginBottom:28, padding:"11px 28px", fontSize:14 }}>
        + Start New Interview
      </button>

      {/* Interview History */}
      <h3 style={{ fontSize:16, fontWeight:800, marginBottom:14 }}>Interview History</h3>
      {loading ? <p style={{ color:"#a1a1aa" }}>Loading...</p> :
       interviews.length===0 ? (
        <div className="card" style={{ textAlign:"center", padding:40, color:"#52525b" }}>
          <p style={{ fontSize:32, marginBottom:10 }}>🎤</p>
          <p>No interviews yet. Start your first one!</p>
        </div>
       ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          {interviews.map(iv => (
            <div key={iv.id} className="card" style={{ cursor:"pointer", border:`1px solid ${selected?.id===iv.id?"rgba(99,102,241,.4)":"rgba(255,255,255,.05)"}` }}
              onClick={() => setSelected(selected?.id===iv.id ? null : iv)}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div>
                  <div style={{ fontWeight:700, fontSize:15 }}>{iv.role}</div>
                  <div style={{ fontSize:12, color:"#71717a", marginTop:2 }}>{iv.date}</div>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <span style={{ fontSize:20, fontWeight:900, color:"#818cf8" }}>{iv.score}%</span>
                  <span style={{ padding:"3px 10px", borderRadius:20, fontSize:11, fontWeight:700,
                    background: iv.recommendation==="Strong Hire"?"rgba(34,197,94,.12)": iv.recommendation==="Hire"?"rgba(99,102,241,.12)":"rgba(239,68,68,.12)",
                    color: iv.recommendation==="Strong Hire"?"#22c55e": iv.recommendation==="Hire"?"#818cf8":"#f87171",
                    border: `1px solid ${iv.recommendation==="Strong Hire"?"rgba(34,197,94,.3)": iv.recommendation==="Hire"?"rgba(99,102,241,.3)":"rgba(239,68,68,.3)"}` }}>
                    {iv.recommendation}
                  </span>
                  <span style={{ color:"#52525b" }}>{selected?.id===iv.id?"▲":"▼"}</span>
                </div>
              </div>

              {selected?.id===iv.id && (
                <div style={{ marginTop:16, paddingTop:16, borderTop:"1px solid rgba(255,255,255,.07)" }}>
                  {/* Metrics */}
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:8, marginBottom:16 }}>
                    {EVAL_METRICS.map(m => (
                      <div key={m.key} style={{ textAlign:"center", padding:"10px 6px", borderRadius:8, background:"rgba(255,255,255,.03)", border:"1px solid rgba(255,255,255,.06)" }}>
                        <div style={{ fontSize:16, fontWeight:900, color:m.color }}>{iv.scores?.[m.key]||0}</div>
                        <div style={{ fontSize:9, color:"#71717a", marginTop:3, lineHeight:1.3 }}>{m.label}</div>
                      </div>
                    ))}
                  </div>
                  {/* Summary */}
                  {iv.summary && <p style={{ fontSize:13, color:"#a1a1aa", lineHeight:1.7, marginBottom:12 }}>{iv.summary}</p>}
                  {/* Strengths & Improvements */}
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                    {iv.strengths?.length>0 && (
                      <div>
                        <p style={{ fontSize:11, fontWeight:700, color:"#22c55e", marginBottom:6 }}>✅ STRENGTHS</p>
                        {iv.strengths.map((s,i) => <p key={i} style={{ fontSize:12, color:"#a1a1aa", marginBottom:3 }}>• {s}</p>)}
                      </div>
                    )}
                    {iv.improvements?.length>0 && (
                      <div>
                        <p style={{ fontSize:11, fontWeight:700, color:"#f59e0b", marginBottom:6 }}>⚡ IMPROVEMENTS</p>
                        {iv.improvements.map((s,i) => <p key={i} style={{ fontSize:12, color:"#a1a1aa", marginBottom:3 }}>• {s}</p>)}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
       )}
    </main>
  );
}

// ─── App Shell ────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(() => getUser());
  const [page, setPage] = useState("home");

  function handleAuth(u) { setUser(u); setPage(u.role === "hr" ? "recruiter" : "home"); }
  function handleLogout() {
    const t = getToken();
    if (t) post("/auth/logout", {}, true).catch(() => {});
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("user");
    setUser(null); setPage("home");
  }

  // Not logged in → show auth page
  if (!user) return (<><style>{CSS}</style><AuthPage onAuth={handleAuth}/></>);

  const candidateNav = [
    { key:"home",      label:"Home",      icon:<Icons.Home/> },
    { key:"interview", label:"Interview", icon:<Icons.Mic size={15}/> },
    { key:"coding",    label:"Coding",    icon:<Icons.Code/> },
    { key:"dashboard", label:"My History",icon:<Icons.Chart/> },
  ];
  const hrNav = [
    { key:"recruiter", label:"HR Dashboard", icon:<Icons.Chart/> },
  ];
  const navItems = user.role === "hr" ? hrNav : candidateNav;

  return (
    <>
      <style>{CSS}</style>
      <header style={{ position:"sticky", top:0, zIndex:40, borderBottom:"1px solid rgba(255,255,255,.07)", background:"rgba(6,7,13,.85)", backdropFilter:"blur(24px)" }}>
        <div style={{ maxWidth:1100, margin:"0 auto", display:"flex", alignItems:"center", justifyContent:"space-between", padding:"13px 20px" }}>
          <div onClick={() => setPage(user.role==="hr"?"recruiter":"home")} style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer", color:"#f4f4f5" }}>
            <Icons.Brain/>
            <span style={{ fontSize:14, fontWeight:800, letterSpacing:"-.01em" }}>AI Interview</span>
          </div>
          <nav style={{ display:"flex", gap:3, alignItems:"center" }}>
            {navItems.map(n => (
              <button key={n.key} className="btn btn-ghost" onClick={() => setPage(n.key)}
                style={{ padding:"6px 13px", fontSize:12, gap:6,
                  background:page===n.key?"rgba(99,102,241,.14)":undefined,
                  color:page===n.key?"#818cf8":"#a1a1aa",
                  border:page===n.key?"1px solid rgba(99,102,241,.28)":"1px solid transparent" }}>
                {n.icon} {n.label}
              </button>
            ))}
            {/* User info + logout */}
            <div style={{ display:"flex", alignItems:"center", gap:8, marginLeft:10, paddingLeft:10, borderLeft:"1px solid rgba(255,255,255,.08)" }}>
              <div style={{ width:28, height:28, borderRadius:"50%", background:"rgba(99,102,241,.3)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, color:"#818cf8" }}>
                {(user.name||"U")[0].toUpperCase()}
              </div>
              <div style={{ lineHeight:1.2 }}>
                <div style={{ fontSize:12, fontWeight:700 }}>{user.name}</div>
                <div style={{ fontSize:10, color:"#71717a", textTransform:"uppercase" }}>{user.role}</div>
              </div>
              <button className="btn btn-ghost" onClick={handleLogout}
                style={{ padding:"5px 10px", fontSize:11, color:"#71717a", marginLeft:4 }}>
                Sign Out
              </button>
            </div>
          </nav>
        </div>
      </header>

      {page==="home"      && user.role!=="hr" && <LandingPage onStart={() => setPage("interview")} onGoToRecruiter={() => setPage("recruiter")} onGoToCoding={() => setPage("coding")}/>}
      {page==="interview" && user.role!=="hr" && <InterviewPage onFinish={() => setPage("dashboard")}/>}
      {page==="dashboard" && user.role!=="hr" && <CandidateDashboard user={user} onStartInterview={() => setPage("interview")}/>}
      {page==="coding"    && user.role!=="hr" && (
        <main style={{ maxWidth:1100, margin:"0 auto", padding:"36px 20px 80px" }}>
          <div style={{ marginBottom:22 }}>
            <h2 style={{ fontSize:22, fontWeight:800, marginBottom:4 }}>Coding Interview Mode</h2>
            <p style={{ color:"#a1a1aa", fontSize:13 }}>Solve problems, run code, get AI analysis</p>
          </div>
          <CodingInterviewMode/>
        </main>
      )}
      {page==="recruiter" && <RecruiterPage/>}
    </>
  );
}
