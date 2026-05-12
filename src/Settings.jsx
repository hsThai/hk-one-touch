/* v1774860462-7212 */
import React, { useState, useEffect, useRef } from "react";
import { AppSettings, getPbUrl, setPbUrl, testConnection } from "./pb.js";

const KV_KEYS = [
  { key:"kv_client_id",     label:"Client ID",       placeholder:"83a5bcbe-3c39-458c-bdd9-...",  type:"text" },
  { key:"kv_client_secret", label:"Client Secret",   placeholder:"3B52F3A9DDE194966DAE2CE0A...", type:"password" },
  { key:"kv_retailer",      label:"Tên gian hàng",   placeholder:"tengianhang (không dấu)",      type:"text" },
];

const SHOP_KEYS = [
  { key:"shop_name",     label:"Tên cửa hàng",   placeholder:"Sửa Chữa Điện Thoại ABC" },
  { key:"shop_phone",    label:"Số điện thoại",  placeholder:"0901234567" },
  { key:"shop_address",  label:"Địa chỉ",        placeholder:"123 Đường ABC, Q.1, TP.HCM" },
  { key:"warranty_note", label:"Cam kết bảo hành",placeholder:"Bảo hành linh kiện 30 ngày, lỗi do sửa 7 ngày" },
];

// ── Âm thanh thông báo ──
const BUILT_IN_SOUNDS = [
  { key:"none",    label:"🔕 Tắt âm thanh",   url:null },
  { key:"ding",    label:"🔔 Ding (mặc định)", url:"data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2ozLS5bnNPsqmE3Li5bm9PtqmE5MC5bm9PsqmE3MC5anNPuqmI4MC5anNPuqmE4MC5am9PuqmE3MC5anNPuqmE4MC5am9PuqmE3MC5am9PuqmE3MC1am9PvqmE4MC1am9PvqmE4MC1am9PvqmE4MC1am9PvqmE4MC1am9PvqmE4MC1am9PvqmE3MC1am9Pvql84MC1am9PvqmE4MC1am9Pvql84MC1am9PvqmE4MC1am9PvqmE4MC1am9PvqmE4MC1am9PvqmE4MC1am9PvqmE3" },
  { key:"chime",   label:"🎵 Chime nhẹ",       url:"data:audio/wav;base64,UklGRl9vT1hXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YT" },
  { key:"beep",    label:"📳 Beep ngắn",       url:"beep" },
  { key:"bell",    label:"🔔 Chuông điện thoại", url:"bell" },
];

const NOTIF_TYPES = [
  { key:"notif_sound_new_order", label:"📋 Đơn mới",       default:"ding" },
  { key:"notif_sound_chat",      label:"💬 Tin nhắn chat", default:"ding" },
  { key:"notif_sound_done",      label:"✅ Sửa xong",      default:"ding" },
  { key:"notif_sound_assign",    label:"🔧 Giao việc KTV", default:"ding" },
];

// Tạo âm thanh bằng Web Audio API
function playSound(type) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === "ding" || type === "bell") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.5, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.5);
      if (type === "bell") {
        // double ding
        setTimeout(() => {
          try {
            const ctx2 = new (window.AudioContext || window.webkitAudioContext)();
            const o2 = ctx2.createOscillator();
            const g2 = ctx2.createGain();
            o2.connect(g2); g2.connect(ctx2.destination);
            o2.type = "sine";
            o2.frequency.setValueAtTime(880, ctx2.currentTime);
            o2.frequency.exponentialRampToValueAtTime(440, ctx2.currentTime + 0.3);
            g2.gain.setValueAtTime(0.5, ctx2.currentTime);
            g2.gain.exponentialRampToValueAtTime(0.001, ctx2.currentTime + 0.5);
            o2.start(ctx2.currentTime); o2.stop(ctx2.currentTime + 0.5);
          } catch {}
        }, 400);
      }
    } else if (type === "beep") {
      osc.type = "square";
      osc.frequency.setValueAtTime(1000, ctx.currentTime);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.15);
    } else if (type === "chime") {
      osc.type = "triangle";
      [523, 659, 784, 1047].forEach((freq, i) => {
        setTimeout(() => {
          try {
            const c = new (window.AudioContext || window.webkitAudioContext)();
            const o = c.createOscillator(); const g = c.createGain();
            o.connect(g); g.connect(c.destination);
            o.type = "triangle"; o.frequency.value = freq;
            g.gain.setValueAtTime(0.35, c.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.4);
            o.start(c.currentTime); o.stop(c.currentTime + 0.4);
          } catch {}
        }, i * 130);
      });
    }
  } catch (e) {}
}

// Helper lưu/đọc setting
export async function getNotifSound(type) {
  try {
    const list = await AppSettings.filter({ key: type });
    return list?.[0]?.value || "ding";
  } catch { return "ding"; }
}

export default function Settings() {
  const [settings, setSettings] = useState({});
  const [saving, setSaving]     = useState(false);
  const [testing, setTesting]   = useState(false);
  const [kvStatus, setKvStatus] = useState(null);
  const [toast, setToast]       = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [customSoundFile, setCustomSoundFile] = useState(null);
  const customAudioRef = useRef();

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const list = await AppSettings.list();
      const map = {};
      list.forEach(s => { map[s.key] = s.value; });
      // defaults
      NOTIF_TYPES.forEach(n => { if (!map[n.key]) map[n.key] = n.default; });
      if (!map["notif_sound_master"]) map["notif_sound_master"] = "on";
      setSettings(map);
    } catch {}
  }

  async function saveSetting(key, value) {
    try {
      const list = await AppSettings.filter({ key });
      if (list.length > 0) await AppSettings.update(list[0].id, { value });
      else await AppSettings.create({ key, value, label: key, group: key.startsWith("kv_") ? "kiotviet" : key.startsWith("notif_") ? "notification" : "shop" });
    } catch {}
  }

  async function saveAll(keys) {
    setSaving(true);
    for (const k of keys) await saveSetting(k, settings[k] || "");
    showToast("✅ Đã lưu cài đặt!");
    setSaving(false);
  }

  async function saveNotifSettings() {
    setSaving(true);
    const keys = ["notif_sound_master", ...NOTIF_TYPES.map(n=>n.key), "notif_custom_url"];
    for (const k of keys) await saveSetting(k, settings[k] || "");
    showToast("✅ Đã lưu cài đặt âm thanh!");
    setSaving(false);
  }

  function handleCustomFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setCustomSoundFile(url);
    setSettings(p => ({...p, notif_sound_master:"on"}));
    // Set tất cả về "custom"
    const patch = {};
    NOTIF_TYPES.forEach(n => { patch[n.key] = "custom"; });
    setSettings(p => ({...p, ...patch, notif_custom_url: url}));
    showToast("✅ Đã tải âm thanh tùy chỉnh!");
  }

  function testSound(key) {
    const soundKey = settings[key] || "ding";
    if (soundKey === "none") { showToast("🔕 Âm thanh đã tắt"); return; }
    if (soundKey === "custom" && customSoundFile) {
      const audio = new Audio(customSoundFile);
      audio.play().catch(() => {});
      return;
    }
    playSound(soundKey);
  }

  async function testKiotViet() {
    setTesting(true); setKvStatus(null);
    const clientId     = settings["kv_client_id"]     || "";
    const clientSecret = settings["kv_client_secret"] || "";
    if (!clientId || !clientSecret) {
      setKvStatus("error");
      showToast("⚠️ Vui lòng nhập đầy đủ Client ID và Secret!");
      setTesting(false); return;
    }
    try {
      const res = await fetch("https://id.kiotviet.vn/connect/token", {
        method:"POST",
        headers:{"Content-Type":"application/x-www-form-urlencoded"},
        body: new URLSearchParams({ scopes:"PublicApi.Access", grant_type:"client_credentials", client_id:clientId, client_secret:clientSecret }),
      });
      const data = await res.json();
      if (data.access_token) { setKvStatus("ok"); showToast("🎉 Kết nối KiotViet thành công!"); }
      else { setKvStatus("error"); showToast("❌ Sai Client ID hoặc Secret!"); }
    } catch { setKvStatus("error"); showToast("❌ Không kết nối được!"); }
    setTesting(false);
  }

  function showToast(msg) { setToast(msg); setTimeout(()=>setToast(""),3000); }


  // ── PocketBase config ──
  const [pbUrl, setPbUrlState] = React.useState(getPbUrl());
  const [pbSaved, setPbSaved] = React.useState(false);
  const [pbTesting, setPbTesting] = React.useState(false);
  const [pbConnStatus, setPbConnStatus] = React.useState(null);

  const savePbUrl = () => {
    setPbUrl(pbUrl.trim().replace(/\/$/, ""));
    setPbSaved(true);
    setTimeout(() => setPbSaved(false), 2000);
  };

  const doTestPb = async () => {
    setPbTesting(true); setPbConnStatus(null);
    const ok = await testConnection(pbUrl);
    setPbConnStatus(ok ? "ok" : "fail");
    setPbTesting(false);
  };

  const pbSection = (
    <div style={{ background:"#f0f9ff", borderRadius:18, padding:20, marginBottom:20, border:"1.5px solid #bae6fd" }}>
      <div style={{ fontWeight:800, fontSize:15, color:"#0369a1", marginBottom:14 }}>🖥️ Kết nối PocketBase Server</div>
      <label style={{ fontSize:13, fontWeight:700, color:"#0369a1", display:"block", marginBottom:6 }}>Địa chỉ server (IP:Port)</label>
      <input value={pbUrl} onChange={e => { setPbUrlState(e.target.value); setPbConnStatus(null); }}
        placeholder="http://192.168.1.234:8090"
        style={{ width:"100%", height:46, borderRadius:12, border:"1.5px solid #7dd3fc", padding:"0 14px", fontSize:14, outline:"none", boxSizing:"border-box", fontFamily:"monospace", background:"#fff" }} />
      <div style={{ fontSize:11, color:"#64748b", marginTop:4 }}>Máy chủ PocketBase chạy trên mạng LAN nội bộ</div>
      <div style={{ display:"flex", gap:8, marginTop:10 }}>
        <button onClick={doTestPb} disabled={pbTesting}
          style={{ flex:1, height:42, background:"#0ea5e9", color:"#fff", border:"none", borderRadius:10, fontWeight:700, fontSize:13, cursor:"pointer" }}>
          {pbTesting ? "⏳ Đang test..." : "🔌 Test kết nối"}
        </button>
        <button onClick={savePbUrl}
          style={{ flex:1, height:42, background: pbSaved ? "#059669" : "#0284c7", color:"#fff", border:"none", borderRadius:10, fontWeight:700, fontSize:13, cursor:"pointer" }}>
          {pbSaved ? "✅ Đã lưu!" : "💾 Lưu địa chỉ"}
        </button>
      </div>
      {pbConnStatus === "ok" && (
        <div style={{ marginTop:10, background:"#ecfdf5", border:"1px solid #6ee7b7", borderRadius:10, padding:"10px 14px", fontSize:13, color:"#065f46", fontWeight:700 }}>
          ✅ Kết nối thành công! Server đang hoạt động.
        </div>
      )}
      {pbConnStatus === "fail" && (
        <div style={{ marginTop:10, background:"#fef2f2", border:"1px solid #fca5a5", borderRadius:10, padding:"10px 14px", fontSize:13, color:"#dc2626", fontWeight:700 }}>
          ❌ Không kết nối được! Kiểm tra:<br/>• Máy tính đang bật PocketBase chưa?<br/>• IP có đúng không? ({pbUrl})<br/>• Thiết bị có cùng mạng WiFi không?
        </div>
      )}
    </div>
  );

  return (
    <div style={{ padding:16, maxWidth:640, margin:"0 auto", paddingBottom:40 }}>
      <div style={{ fontSize:20, fontWeight:900, color:"#1e1b4b", marginBottom:4 }}>⚙️ Cài đặt hệ thống</div>
      <div style={{ fontSize:13, color:"#6b7280", marginBottom:24 }}>Thông tin cửa hàng · Âm thanh thông báo · KiotViet</div>

      {/* ── Thông tin cửa hàng ── */}
      <div style={{ background:"#fff", borderRadius:20, padding:24, marginBottom:20, boxShadow:"0 2px 12px rgba(0,0,0,.07)" }}>
        <div style={{ fontSize:16, fontWeight:800, color:"#1e1b4b", marginBottom:16 }}>🏪 Thông tin cửa hàng</div>
        {SHOP_KEYS.map(f => (
          <div key={f.key} style={{ marginBottom:14 }}>
            <label style={{ fontSize:13, fontWeight:700, color:"#374151", display:"block", marginBottom:5 }}>{f.label}</label>
            <input value={settings[f.key]||""} onChange={e=>setSettings(p=>({...p,[f.key]:e.target.value}))}
              placeholder={f.placeholder}
              style={{ width:"100%", height:44, borderRadius:10, border:"1.5px solid #e5e7eb", padding:"0 12px", fontSize:14, outline:"none", boxSizing:"border-box" }} />
          </div>
        ))}
        <button onClick={() => saveAll(SHOP_KEYS.map(f=>f.key))} disabled={saving}
          style={{ height:44, padding:"0 24px", background:"#4f46e5", color:"#fff", border:"none", borderRadius:12, fontWeight:800, fontSize:14, cursor:"pointer" }}>
          {saving ? "Đang lưu..." : "💾 Lưu thông tin"}
        </button>
      </div>

      {/* ── Âm thanh thông báo ── */}
      <div style={{ background:"#fff", borderRadius:20, padding:24, marginBottom:20, boxShadow:"0 2px 12px rgba(0,0,0,.07)" }}>
        <div style={{ fontSize:16, fontWeight:800, color:"#1e1b4b", marginBottom:6 }}>🔔 Âm thanh thông báo</div>
        <div style={{ fontSize:13, color:"#6b7280", marginBottom:16 }}>Tùy chỉnh âm thanh cho từng loại thông báo trên điện thoại</div>

        {/* Master switch */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", background:"#f9fafb", borderRadius:14, padding:"14px 16px", marginBottom:16 }}>
          <div>
            <div style={{ fontWeight:700, fontSize:14, color:"#374151" }}>Âm thanh thông báo</div>
            <div style={{ fontSize:12, color:"#6b7280" }}>Bật/tắt toàn bộ âm thanh</div>
          </div>
          <button onClick={() => setSettings(p => ({...p, notif_sound_master: p.notif_sound_master==="on"?"off":"on"}))}
            style={{ width:52, height:28, borderRadius:20, border:"none", cursor:"pointer", position:"relative",
              background: settings["notif_sound_master"]==="on" ? "#4f46e5" : "#d1d5db", transition:"background .2s" }}>
            <div style={{ position:"absolute", top:3, width:22, height:22, borderRadius:"50%", background:"#fff", transition:"left .2s",
              left: settings["notif_sound_master"]==="on" ? 26 : 3, boxShadow:"0 1px 4px rgba(0,0,0,.2)" }} />
          </button>
        </div>

        {settings["notif_sound_master"] === "on" && (
          <>
            {/* Từng loại thông báo */}
            {NOTIF_TYPES.map(nt => (
              <div key={nt.key} style={{ marginBottom:14, background:"#f9fafb", borderRadius:14, padding:"12px 14px" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                  <span style={{ fontWeight:700, fontSize:14, color:"#374151" }}>{nt.label}</span>
                  <button onClick={() => testSound(nt.key)}
                    style={{ height:30, padding:"0 12px", borderRadius:8, border:"1.5px solid #c7d2fe", background:"#eef2ff", color:"#4f46e5", fontWeight:700, fontSize:12, cursor:"pointer" }}>
                    ▶ Thử
                  </button>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:6 }}>
                  {BUILT_IN_SOUNDS.filter(s=>s.key!=="chime").map(s => (
                    <button key={s.key} onClick={() => { setSettings(p=>({...p,[nt.key]:s.key})); if(s.key!=="none") playSound(s.key); }}
                      style={{ padding:"8px 4px", borderRadius:10, border:`2px solid ${settings[nt.key]===s.key?"#4f46e5":"#e5e7eb"}`,
                        background: settings[nt.key]===s.key?"#eef2ff":"#fff", color: settings[nt.key]===s.key?"#4f46e5":"#374151",
                        fontWeight: settings[nt.key]===s.key?800:500, fontSize:11, cursor:"pointer", textAlign:"center" }}>
                      {s.label}
                    </button>
                  ))}
                  <button onClick={() => { setSettings(p=>({...p,[nt.key]:"chime"})); playSound("chime"); }}
                    style={{ padding:"8px 4px", borderRadius:10, border:`2px solid ${settings[nt.key]==="chime"?"#4f46e5":"#e5e7eb"}`,
                      background: settings[nt.key]==="chime"?"#eef2ff":"#fff", color: settings[nt.key]==="chime"?"#4f46e5":"#374151",
                      fontWeight: settings[nt.key]==="chime"?800:500, fontSize:11, cursor:"pointer" }}>
                    🎵 Chime
                  </button>
                  {customSoundFile && (
                    <button onClick={() => setSettings(p=>({...p,[nt.key]:"custom"}))}
                      style={{ padding:"8px 4px", borderRadius:10, border:`2px solid ${settings[nt.key]==="custom"?"#7c3aed":"#e5e7eb"}`,
                        background: settings[nt.key]==="custom"?"#f5f3ff":"#fff", color: settings[nt.key]==="custom"?"#7c3aed":"#374151",
                        fontWeight: settings[nt.key]==="custom"?800:500, fontSize:11, cursor:"pointer" }}>
                      🎶 Tùy chỉnh
                    </button>
                  )}
                </div>
              </div>
            ))}

            {/* Upload âm thanh tùy chỉnh */}
            <div style={{ border:"2px dashed #c7d2fe", borderRadius:14, padding:16, marginTop:4, textAlign:"center" }}>
              <div style={{ fontSize:13, fontWeight:700, color:"#374151", marginBottom:4 }}>🎶 Upload âm thanh tùy chỉnh</div>
              <div style={{ fontSize:12, color:"#6b7280", marginBottom:12 }}>Hỗ trợ .mp3, .wav, .ogg (tối đa 2MB)</div>
              <label style={{ display:"inline-block", height:40, padding:"0 20px", lineHeight:"40px", background:"#4f46e5", color:"#fff", borderRadius:10, fontWeight:700, fontSize:13, cursor:"pointer" }}>
                📁 Chọn file âm thanh
                <input type="file" accept="audio/mp3,audio/wav,audio/ogg,audio/*" onChange={handleCustomFile} style={{ display:"none" }} />
              </label>
              {customSoundFile && (
                <div style={{ marginTop:10 }}>
                  <audio ref={customAudioRef} src={customSoundFile} controls style={{ width:"100%", borderRadius:8 }} />
                  <div style={{ fontSize:11, color:"#059669", fontWeight:600, marginTop:6 }}>✅ File đã tải — chọn "Tùy chỉnh" ở các loại thông báo bên trên</div>
                </div>
              )}
            </div>

            <div style={{ background:"#eff6ff", border:"1px solid #bfdbfe", borderRadius:12, padding:"10px 14px", marginTop:12, fontSize:12, color:"#1d4ed8" }}>
              💡 <b>Lưu ý:</b> Trình duyệt chỉ phát âm thanh khi người dùng đã tương tác với trang (bấm/chạm ít nhất 1 lần). Trên iOS Safari cần bật "Allow Audio" trong cài đặt.
            </div>
          </>
        )}

        <button onClick={saveNotifSettings} disabled={saving}
          style={{ marginTop:16, height:44, padding:"0 24px", background:"#4f46e5", color:"#fff", border:"none", borderRadius:12, fontWeight:800, fontSize:14, cursor:"pointer" }}>
          {saving ? "Đang lưu..." : "💾 Lưu cài đặt âm thanh"}
        </button>
      </div>

      {/* ── KiotViet API ── */}
      <div style={{ background:"#fff", borderRadius:20, padding:24, boxShadow:"0 2px 12px rgba(0,0,0,.07)" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
          <div style={{ fontSize:16, fontWeight:800, color:"#1e1b4b" }}>🔗 Kết nối KiotViet</div>
          {kvStatus==="ok"    && <span style={{ background:"#ecfdf5", color:"#059669", fontSize:12, fontWeight:700, padding:"4px 12px", borderRadius:20 }}>✅ Đã kết nối</span>}
          {kvStatus==="error" && <span style={{ background:"#fef2f2", color:"#dc2626", fontSize:12, fontWeight:700, padding:"4px 12px", borderRadius:20 }}>❌ Lỗi kết nối</span>}
        </div>
        <div style={{ fontSize:13, color:"#6b7280", marginBottom:16 }}>Đồng bộ khách hàng, linh kiện và xuất hóa đơn tự động.</div>

        <div style={{ background:"#fffbeb", border:"1px solid #fde68a", borderRadius:12, padding:"12px 14px", marginBottom:18, fontSize:13, color:"#92400e" }}>
          📌 <b>Cách lấy API:</b> Đăng nhập KiotViet (Admin) → Thiết lập → Thiết lập cửa hàng → <b>Thiết lập kết nối API</b>
        </div>

        {KV_KEYS.map(f => (
          <div key={f.key} style={{ marginBottom:14 }}>
            <label style={{ fontSize:13, fontWeight:700, color:"#374151", display:"block", marginBottom:5 }}>{f.label}</label>
            <div style={{ position:"relative" }}>
              <input value={settings[f.key]||""} onChange={e=>setSettings(p=>({...p,[f.key]:e.target.value}))}
                type={f.type==="password" && !showSecret ? "password" : "text"}
                placeholder={f.placeholder}
                style={{ width:"100%", height:44, borderRadius:10, border:"1.5px solid #e5e7eb", padding:`0 ${f.type==="password"?"44px":"12px"} 0 12px`, fontSize:13, outline:"none", boxSizing:"border-box", fontFamily:"monospace" }} />
              {f.type==="password" && (
                <button onClick={()=>setShowSecret(v=>!v)}
                  style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", fontSize:16 }}>
                  {showSecret ? "🙈" : "👁️"}
                </button>
              )}
            </div>
          </div>
        ))}

        <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
          <button onClick={() => saveAll(KV_KEYS.map(f=>f.key))} disabled={saving}
            style={{ flex:1, height:46, borderRadius:12, border:"none", background:"#4f46e5", color:"#fff", fontWeight:800, fontSize:14, cursor:"pointer", minWidth:120 }}>
            {saving ? "Đang lưu..." : "💾 Lưu API"}
          </button>
          <button onClick={testKiotViet} disabled={testing}
            style={{ flex:1, height:46, borderRadius:12, border:"2px solid #4f46e5", background:"#eef2ff", color:"#4f46e5", fontWeight:800, fontSize:14, cursor:"pointer", minWidth:120 }}>
            {testing ? "Đang test..." : "🔌 Test kết nối"}
          </button>
        </div>

        {kvStatus==="ok" && (
          <div style={{ marginTop:16, background:"#ecfdf5", border:"1px solid #6ee7b7", borderRadius:12, padding:"12px 16px", fontSize:13, color:"#065f46", fontWeight:600 }}>
            🎉 KiotViet đã kết nối!
          </div>
        )}
      </div>

      {toast && (
        <div style={{ position:"fixed", bottom:24, left:"50%", transform:"translateX(-50%)", background:"#1e1b4b", color:"#fff", borderRadius:14, padding:"12px 24px", fontSize:14, fontWeight:700, zIndex:5000, boxShadow:"0 8px 24px rgba(0,0,0,.3)" }}>
          {toast}
        </div>
      )}
    </div>
  );
}
