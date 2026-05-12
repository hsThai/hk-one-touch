/* v1774860462-5573 */
import { useState, useEffect } from "react";
import { Staff } from "./pb.js";

const ROLES = [
  { value:"manager",      label:"Quản lý",        color:"#7c3aed", bg:"#f5f3ff", icon:"👑" },
  { value:"receptionist", label:"Tiếp tân",        color:"#1d4ed8", bg:"#dbeafe", icon:"💁" },
  { value:"technician",   label:"Kỹ thuật viên",   color:"#065f46", bg:"#dcfce7", icon:"🔧" },
  { value:"warehouse",    label:"Nhân viên kho",   color:"#0369a1", bg:"#e0f2fe", icon:"📦" },
];

function simpleHash(str) { return btoa(unescape(encodeURIComponent(str))); }
function roleInfo(role) { return ROLES.find(r=>r.value===role) || ROLES[0]; }

const EMPTY = { full_name:"", phone:"", username:"", role:"technician", password:"", note:"", is_active:true };

export default function StaffManager({ currentStaff }) {
  const [list, setList]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal]   = useState(null); // null | {mode:"add"|"edit", data}
  const [form, setForm]     = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState("");
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState("all");
  const [toast, setToast]   = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try { const d = await Staff.list(); setList(d); } catch {}
    setLoading(false);
  }

  function openAdd() { setForm(EMPTY); setErr(""); setModal({ mode:"add" }); }
  function openEdit(s) { setForm({ ...s, password:"" }); setErr(""); setModal({ mode:"edit", id:s.id }); }

  async function save() {
    setErr("");
    if (!form.full_name.trim()) { setErr("Cần nhập họ tên."); return; }
    if (!form.username.trim())  { setErr("Cần nhập username."); return; }
    if (modal.mode==="add" && !form.password) { setErr("Cần nhập mật khẩu tạm."); return; }
    // check duplicate username
    const dup = list.find(s => s.username===form.username.trim() && (modal.mode==="add" || s.id!==modal.id));
    if (dup) { setErr("Username đã tồn tại."); return; }

    setSaving(true);
    try {
      if (modal.mode==="add") {
        await Staff.create({
          full_name: form.full_name.trim(),
          phone: form.phone.trim(),
          username: form.username.trim(),
          role: form.role,
          password_hash: simpleHash(form.password),
          must_change_password: true,
          is_active: true,
          kpi_score: 100,
          note: form.note,
        });
        showToast("✅ Đã tạo tài khoản " + form.full_name);
      } else {
        const patch = {
          full_name: form.full_name.trim(),
          phone: form.phone.trim(),
          username: form.username.trim(),
          role: form.role,
          is_active: form.is_active,
          note: form.note,
        };
        if (form.password) { patch.password_hash = simpleHash(form.password); patch.must_change_password = true; }
        await Staff.update(modal.id, patch);
        showToast("✅ Đã cập nhật " + form.full_name);
      }
      setModal(null);
      load();
    } catch { setErr("Lỗi lưu dữ liệu."); }
    setSaving(false);
  }

  async function toggleActive(s) {
    await Staff.update(s.id, { is_active: !s.is_active });
    showToast(s.is_active ? `🔒 Đã khóa ${s.full_name}` : `🔓 Đã mở khóa ${s.full_name}`);
    load();
  }

  async function resetKpi(s) {
    await Staff.update(s.id, { kpi_score: 100 });
    showToast(`🔄 Reset KPI ${s.full_name} → 100`);
    load();
  }

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(""), 2500); }

  const filtered = list.filter(s => {
    const q = search.toLowerCase();
    const matchQ = !q || s.full_name?.toLowerCase().includes(q) || s.username?.toLowerCase().includes(q) || s.phone?.includes(q);
    const matchR = filterRole==="all" || s.role===filterRole;
    return matchQ && matchR;
  });

  return (
    <div style={{ padding:16, maxWidth:900, margin:"0 auto" }}>
      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20, flexWrap:"wrap", gap:10 }}>
        <div>
          <div style={{ fontSize:20, fontWeight:900, color:"#1e1b4b" }}>👥 Quản lý nhân viên</div>
          <div style={{ fontSize:13, color:"#6b7280" }}>{list.filter(s=>s.is_active).length} đang hoạt động / {list.length} tổng</div>
        </div>
        <button onClick={openAdd}
          style={{ height:44, padding:"0 20px", background:"#4f46e5", color:"#fff", border:"none", borderRadius:12, fontWeight:800, fontSize:14, cursor:"pointer" }}>
          ＋ Thêm nhân viên
        </button>
      </div>

      {/* Filter */}
      <div style={{ display:"flex", gap:10, marginBottom:16, flexWrap:"wrap" }}>
        <input value={search} onChange={e=>setSearch(e.target.value)}
          placeholder="🔍 Tìm tên, username, SĐT..."
          style={{ flex:1, minWidth:200, height:40, borderRadius:10, border:"1.5px solid #e5e7eb", padding:"0 12px", fontSize:14, outline:"none" }} />
        <select value={filterRole} onChange={e=>setFilterRole(e.target.value)}
          style={{ height:40, borderRadius:10, border:"1.5px solid #e5e7eb", padding:"0 12px", fontSize:13, background:"#fff", cursor:"pointer" }}>
          <option value="all">Tất cả vai trò</option>
          {ROLES.map(r=><option key={r.value} value={r.value}>{r.icon} {r.label}</option>)}
        </select>
      </div>

      {/* List */}
      {loading ? (
        <div style={{ textAlign:"center", padding:40, color:"#9ca3af" }}>Đang tải...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign:"center", padding:40, color:"#9ca3af" }}>
          <div style={{ fontSize:40 }}>👤</div>
          <div style={{ marginTop:8 }}>Chưa có nhân viên nào</div>
        </div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {filtered.map(s => {
            const ri = roleInfo(s.role);
            return (
              <div key={s.id} style={{ background:"#fff", borderRadius:16, padding:16, boxShadow:"0 2px 12px rgba(0,0,0,.07)", border:"1.5px solid #f3f4f6", display:"flex", alignItems:"center", gap:14, flexWrap:"wrap" }}>
                {/* Avatar */}
                <div style={{ width:50, height:50, borderRadius:"50%", background: ri.bg, display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, flexShrink:0, border:`2px solid ${ri.color}22` }}>
                  {ri.icon}
                </div>
                {/* Info */}
                <div style={{ flex:1, minWidth:160 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                    <span style={{ fontWeight:800, fontSize:15, color:"#1e1b4b" }}>{s.full_name}</span>
                    <span style={{ background:ri.bg, color:ri.color, fontSize:11, fontWeight:700, padding:"2px 9px", borderRadius:20 }}>{ri.icon} {ri.label}</span>
                    {!s.is_active && <span style={{ background:"#fef2f2", color:"#dc2626", fontSize:11, fontWeight:700, padding:"2px 9px", borderRadius:20 }}>🔒 Đã khóa</span>}
                    {s.must_change_password && <span style={{ background:"#fffbeb", color:"#d97706", fontSize:11, fontWeight:700, padding:"2px 9px", borderRadius:20 }}>⚠️ Chưa đổi pass</span>}
                  </div>
                  <div style={{ fontSize:13, color:"#6b7280", marginTop:3 }}>
                    @{s.username} {s.phone ? `· 📞 ${s.phone}` : ""}
                  </div>
                </div>
                {/* KPI */}
                <div style={{ textAlign:"center", minWidth:60 }}>
                  <div style={{ fontSize:18, fontWeight:900, color: s.kpi_score>=80?"#065f46":s.kpi_score>=50?"#92400e":"#991b1b" }}>{s.kpi_score ?? 100}</div>
                  <div style={{ fontSize:11, color:"#9ca3af" }}>KPI</div>
                </div>
                {/* Actions */}
                <div style={{ display:"flex", gap:8, flexShrink:0 }}>
                  <button onClick={() => openEdit(s)}
                    style={{ height:36, padding:"0 14px", borderRadius:10, border:"1.5px solid #e5e7eb", background:"#f9fafb", fontWeight:700, fontSize:13, cursor:"pointer" }}>
                    ✏️ Sửa
                  </button>
                  {s.id !== currentStaff?.id && (
                    <button onClick={() => toggleActive(s)}
                      style={{ height:36, padding:"0 14px", borderRadius:10, border:"none", background: s.is_active?"#fef2f2":"#ecfdf5", color: s.is_active?"#dc2626":"#059669", fontWeight:700, fontSize:13, cursor:"pointer" }}>
                      {s.is_active ? "🔒 Khóa" : "🔓 Mở"}
                    </button>
                  )}
                  <button onClick={() => resetKpi(s)}
                    style={{ height:36, padding:"0 14px", borderRadius:10, border:"none", background:"#eff6ff", color:"#2563eb", fontWeight:700, fontSize:13, cursor:"pointer" }}>
                    🔄 KPI
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal thêm/sửa */}
      {modal && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.5)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}
          onClick={e => { if(e.target===e.currentTarget) setModal(null); }}>
          <div style={{ background:"#fff", borderRadius:20, padding:28, width:"100%", maxWidth:460, maxHeight:"90vh", overflowY:"auto" }}>
            <div style={{ fontSize:18, fontWeight:900, color:"#1e1b4b", marginBottom:20 }}>
              {modal.mode==="add" ? "➕ Thêm nhân viên mới" : "✏️ Chỉnh sửa nhân viên"}
            </div>
            {[
              { label:"Họ tên *", key:"full_name", placeholder:"Nguyễn Văn A" },
              { label:"Số điện thoại", key:"phone", placeholder:"0901234567" },
              { label:"Username *", key:"username", placeholder:"nguyenvana" },
            ].map(f => (
              <div key={f.key} style={{ marginBottom:14 }}>
                <label style={{ fontSize:13, fontWeight:700, color:"#374151", display:"block", marginBottom:5 }}>{f.label}</label>
                <input value={form[f.key]||""} onChange={e=>setForm(p=>({...p,[f.key]:e.target.value}))}
                  placeholder={f.placeholder}
                  style={{ width:"100%", height:44, borderRadius:10, border:"1.5px solid #e5e7eb", padding:"0 12px", fontSize:14, outline:"none", boxSizing:"border-box" }} />
              </div>
            ))}
            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:13, fontWeight:700, color:"#374151", display:"block", marginBottom:5 }}>Vai trò *</label>
              <select value={form.role} onChange={e=>setForm(p=>({...p,role:e.target.value}))}
                style={{ width:"100%", height:44, borderRadius:10, border:"1.5px solid #e5e7eb", padding:"0 12px", fontSize:14, background:"#fff", boxSizing:"border-box" }}>
                {ROLES.map(r=><option key={r.value} value={r.value}>{r.icon} {r.label}</option>)}
              </select>
            </div>
            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:13, fontWeight:700, color:"#374151", display:"block", marginBottom:5 }}>
                {modal.mode==="add" ? "Mật khẩu tạm *" : "Đặt lại mật khẩu (để trống nếu không đổi)"}
              </label>
              <input value={form.password||""} onChange={e=>setForm(p=>({...p,password:e.target.value}))}
                type="password" placeholder="Tối thiểu 6 ký tự..."
                style={{ width:"100%", height:44, borderRadius:10, border:"1.5px solid #e5e7eb", padding:"0 12px", fontSize:14, outline:"none", boxSizing:"border-box" }} />
              {modal.mode==="add" && <div style={{ fontSize:11, color:"#6b7280", marginTop:4 }}>⚠️ Nhân viên sẽ bị yêu cầu đổi mật khẩu khi đăng nhập lần đầu.</div>}
            </div>
            <div style={{ marginBottom:20 }}>
              <label style={{ fontSize:13, fontWeight:700, color:"#374151", display:"block", marginBottom:5 }}>Ghi chú</label>
              <textarea value={form.note||""} onChange={e=>setForm(p=>({...p,note:e.target.value}))}
                rows={2} placeholder="Ghi chú thêm..."
                style={{ width:"100%", borderRadius:10, border:"1.5px solid #e5e7eb", padding:"10px 12px", fontSize:14, outline:"none", resize:"vertical", boxSizing:"border-box" }} />
            </div>
            {modal.mode==="edit" && (
              <div style={{ marginBottom:20, display:"flex", alignItems:"center", gap:10 }}>
                <input type="checkbox" id="activeChk" checked={form.is_active||false} onChange={e=>setForm(p=>({...p,is_active:e.target.checked}))} />
                <label htmlFor="activeChk" style={{ fontSize:13, fontWeight:700, color:"#374151", cursor:"pointer" }}>Tài khoản đang hoạt động</label>
              </div>
            )}
            {err && <div style={{ background:"#fef2f2", border:"1px solid #fca5a5", borderRadius:10, padding:"10px 14px", fontSize:13, color:"#dc2626", marginBottom:16, fontWeight:600 }}>⚠️ {err}</div>}
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={() => setModal(null)}
                style={{ flex:1, height:46, borderRadius:12, border:"1.5px solid #e5e7eb", background:"#f9fafb", fontWeight:700, fontSize:14, cursor:"pointer" }}>
                Hủy
              </button>
              <button onClick={save} disabled={saving}
                style={{ flex:2, height:46, borderRadius:12, border:"none", background:"#4f46e5", color:"#fff", fontWeight:800, fontSize:14, cursor:"pointer" }}>
                {saving ? "Đang lưu..." : modal.mode==="add" ? "Tạo tài khoản" : "Lưu thay đổi"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{ position:"fixed", bottom:24, left:"50%", transform:"translateX(-50%)", background:"#1e1b4b", color:"#fff", borderRadius:14, padding:"12px 24px", fontSize:14, fontWeight:700, zIndex:5000, boxShadow:"0 8px 24px rgba(0,0,0,.3)" }}>
          {toast}
        </div>
      )}
    </div>
  );
}
