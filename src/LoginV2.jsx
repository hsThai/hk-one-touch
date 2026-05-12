/* LoginV2 - PocketBase Auth - FIXED: direct staff list lookup */
import React, { useState } from "react";
import { Staff, getPbUrl, setPbUrl, testConnection, setAuth } from "./pb.js";

export default function LoginV2({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [pbUrl, setPbUrlState] = useState(getPbUrl());
  const [showConfig, setShowConfig] = useState(false);
  const [testingConn, setTestingConn] = useState(false);
  const [connStatus, setConnStatus] = useState(null);

  const doLogin = async () => {
    if (!username.trim() || !password.trim()) {
      setErr("Vui lòng nhập đầy đủ thông tin!");
      return;
    }
    setLoading(true);
    setErr("");

    try {
      const staffList = await Staff.list({ limit: 500 });
      const hashedInput = btoa(unescape(encodeURIComponent(password.trim())));

      const found = staffList.find(
        (s) => s.username === username.trim() && s.password_hash === hashedInput
      );

      if (found) {
        if (found.is_active === false) {
          setErr("Tài khoản đã bị vô hiệu hóa!");
          setLoading(false);
          return;
        }
        setAuth("staff_" + found.id, found.id);
        onLogin({
          id: found.id,
          name: found.full_name,
          username: found.username,
          role: found.role,
          kpi: found.kpi_score || 0,
          phone: found.phone || "",
          must_change_password: found.must_change_password,
          avatar_url: found.avatar_url || "",
        });
        return;
      }

      const matchUser = staffList.find((s) => s.username === username.trim());
      if (!matchUser) setErr("Không tìm thấy username!");
      else setErr("Sai mật khẩu!");

    } catch (e) {
      console.error("Login error:", e);
      if (e.message?.includes("fetch") || e.message?.includes("Failed") || e.message?.includes("ERR_")) {
        setErr(`❌ Không kết nối được PocketBase!\nKiểm tra server: ${getPbUrl()}`);
      } else {
        setErr("Lỗi: " + (e.message || "Không xác định"));
      }
    }
    setLoading(false);
  };

  const doTestConn = async () => {
    setTestingConn(true); setConnStatus(null);
    const ok = await testConnection(pbUrl);
    setConnStatus(ok ? "ok" : "fail");
    setTestingConn(false);
  };

  const savePbUrl = () => { setPbUrl(pbUrl); setShowConfig(false); setConnStatus(null); };

  return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(135deg,#1e1b4b,#4f46e5,#7c3aed)", display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
      <div style={{ background:"#fff", borderRadius:24, padding:40, width:"100%", maxWidth:400, boxShadow:"0 24px 64px rgba(0,0,0,.3)" }}>
        <div style={{ textAlign:"center", marginBottom:32 }}>
          <div style={{ fontSize:56 }}>🔧</div>
          <div style={{ fontWeight:900, fontSize:24, color:"#1e1b4b", marginTop:8 }}>Quản Lý Sửa Chữa</div>
          <div style={{ color:"#9ca3af", fontSize:13, marginTop:4 }}>Hệ thống nội bộ — v2025</div>
        </div>

        <div style={{ marginBottom:16 }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6 }}>
            <label style={{ fontSize:12, fontWeight:700, color:"#6b7280" }}>🖥️ Server PocketBase</label>
            <button onClick={() => { setShowConfig(v=>!v); setConnStatus(null); }}
              style={{ fontSize:11, color:"#4f46e5", background:"none", border:"none", cursor:"pointer", fontWeight:700 }}>
              {showConfig ? "Thu gọn ▲" : "Cấu hình ▼"}
            </button>
          </div>
          {!showConfig && (
            <div style={{ fontSize:12, color:"#9ca3af", background:"#f9fafb", borderRadius:8, padding:"6px 12px", fontFamily:"monospace" }}>{getPbUrl()}</div>
          )}
          {showConfig && (
            <div style={{ background:"#f0f9ff", borderRadius:14, padding:14, border:"1.5px solid #bae6fd" }}>
              <label style={{ fontSize:12, fontWeight:700, color:"#0369a1", display:"block", marginBottom:6 }}>Địa chỉ PocketBase (IP:Port)</label>
              <input value={pbUrl} onChange={e => { setPbUrlState(e.target.value); setConnStatus(null); }}
                placeholder="http://192.168.1.234:8090"
                style={{ width:"100%", height:42, borderRadius:10, border:"1.5px solid #7dd3fc", padding:"0 12px", fontSize:14, outline:"none", boxSizing:"border-box", fontFamily:"monospace" }} />
              <div style={{ display:"flex", gap:8, marginTop:8 }}>
                <button onClick={doTestConn} disabled={testingConn}
                  style={{ flex:1, height:36, background:"#0ea5e9", color:"#fff", border:"none", borderRadius:10, fontWeight:700, fontSize:13, cursor:"pointer" }}>
                  {testingConn ? "⏳ Đang test..." : "🔌 Test kết nối"}
                </button>
                <button onClick={savePbUrl}
                  style={{ flex:1, height:36, background:"#059669", color:"#fff", border:"none", borderRadius:10, fontWeight:700, fontSize:13, cursor:"pointer" }}>
                  💾 Lưu
                </button>
              </div>
              {connStatus === "ok" && <div style={{ marginTop:8, color:"#059669", fontWeight:700, fontSize:13, textAlign:"center" }}>✅ Kết nối thành công!</div>}
              {connStatus === "fail" && <div style={{ marginTop:8, color:"#dc2626", fontWeight:700, fontSize:13, textAlign:"center" }}>❌ Không kết nối được!</div>}
            </div>
          )}
        </div>

        <div style={{ marginBottom:16 }}>
          <label style={{ display:"block", fontSize:13, fontWeight:700, color:"#374151", marginBottom:6 }}>👤 Tên đăng nhập</label>
          <input value={username} onChange={e => { setUsername(e.target.value); setErr(""); }}
            onKeyDown={e => e.key==="Enter" && doLogin()} placeholder="Nhập username..." autoFocus
            style={{ width:"100%", height:50, borderRadius:12, border:`2px solid ${err?"#ef4444":"#e5e7eb"}`, padding:"0 16px", fontSize:15, outline:"none", boxSizing:"border-box" }} />
        </div>
        <div style={{ marginBottom:20 }}>
          <label style={{ display:"block", fontSize:13, fontWeight:700, color:"#374151", marginBottom:6 }}>🔑 Mật khẩu</label>
          <div style={{ position:"relative" }}>
            <input value={password} onChange={e => { setPassword(e.target.value); setErr(""); }}
              onKeyDown={e => e.key==="Enter" && doLogin()} placeholder="Nhập mật khẩu..." type={showPw?"text":"password"}
              style={{ width:"100%", height:50, borderRadius:12, border:`2px solid ${err?"#ef4444":"#e5e7eb"}`, padding:"0 50px 0 16px", fontSize:15, outline:"none", boxSizing:"border-box" }} />
            <button onClick={() => setShowPw(v=>!v)} type="button"
              style={{ position:"absolute", right:14, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", fontSize:20, color:"#9ca3af" }}>
              {showPw?"🙈":"👁️"}
            </button>
          </div>
        </div>
        {err && (
          <div style={{ background:"#fef2f2", border:"1px solid #fca5a5", borderRadius:10, padding:"10px 14px", marginBottom:16, fontSize:13, color:"#dc2626", fontWeight:600, whiteSpace:"pre-line" }}>
            ⚠️ {err}
          </div>
        )}
        <button onClick={doLogin} disabled={loading}
          style={{ width:"100%", height:54, background:loading?"#a5b4fc":"#4f46e5", color:"#fff", border:"none", borderRadius:14, fontSize:18, fontWeight:800, cursor:loading?"not-allowed":"pointer" }}>
          {loading?"⏳ Đang kiểm tra...":"🚀 Đăng Nhập"}
        </button>
      </div>
    </div>
  );
}
