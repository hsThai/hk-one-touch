/* v4-loginv2-real-db */
import React, { lazy, Suspense, useState, useEffect, useRef, useCallback } from "react";
import { RepairChat, Notification, Staff, RepairOrder, Customer } from "./pb.js";
import { uploadFile } from "./pb.js";
const SparePartModal = lazy(() => import("./SparePartModal").catch(() => ({ default: ({ onClose }) => (
  <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center"}}>
    <div style={{background:"#fff",borderRadius:16,padding:32,textAlign:"center"}}>
      <div style={{fontSize:32}}>⚠️</div>
      <div style={{fontWeight:700,marginTop:8}}>Module không tải được</div>
      <button onClick={onClose} style={{marginTop:16,padding:"10px 24px",background:"#4f46e5",color:"#fff",border:"none",borderRadius:8,cursor:"pointer"}}>Đóng</button>
    </div>
  </div>
)})));
const StaffManagerPage = lazy(() => import("./StaffManager").catch(() => ({ default: () => (
  <div style={{padding:32,textAlign:"center"}}>
    <div style={{fontSize:32}}>⚠️</div>
    <div style={{fontWeight:700,marginTop:8}}>Module không tải được</div>
  </div>
)})));
const SettingsPage = lazy(() => import("./Settings").catch(() => ({ default: () => (
  <div style={{padding:32,textAlign:"center"}}>
    <div style={{fontSize:32}}>⚠️</div>
    <div style={{fontWeight:700,marginTop:8}}>Module không tải được</div>
  </div>
)})));


// Components loaded from OrderComponents
import { QRScanModal, QRPrintModal } from "./QRComponents";
import { MediaViewer, AcceptChecklistModal, AcceptTimer, timeAgo, genOrderId, getKpiTimerInfo } from "./MediaViewer";
import { OrderDrawer } from "./OrderDrawer";
import { NewOrderModal, KPIPage } from "./OrderForms";
import LoginPage from "./LoginV2";
import { usePreventBack, ExitAppButton } from "./PWAUtils";

const _BUILD_V4 = "loginv2-real-db";

export default function MainApp() {
  usePreventBack();
  const [user, setUser] = useState(null);
  const [orders, setOrders] = useState([]);
  const [users, setUsers] = useState([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [page, setPage] = useState("board");
  const [search, setSearch] = useState("");
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [showNotif, setShowNotif] = useState(false);
  const [qrOrder, setQrOrder] = useState(null);
  const [showQRScan, setShowQRScan] = useState(false);
  const [highlightId, setHighlightId] = useState(null);
  const [createdOrder, setCreatedOrder] = useState(null); // toast xác nhận tạo đơn

  // ── Load real data from entities ──────────────────────────
  useEffect(() => {
    async function loadData() {
      try {
        setDataLoading(true);
        const [staffList, orderList] = await Promise.all([
          Staff.list(),
          RepairOrder.list({ sort: "-created_date", limit: 200 }),
        ]);
        const mappedUsers = staffList.map(s => ({
          id: s.id,
          name: s.full_name,
          username: s.username,
          password: s.password_hash,
          role: s.role,
          kpi: s.kpi_score || 0,
          phone: s.phone || "",
          note: s.note || "",
          is_active: s.is_active !== false,
          avatar_url: s.avatar_url || "",
        }));
        const mappedOrders = orderList.map(o => ({
          id: o.order_code || o.id,
          _id: o.id,
          customer_id: o.customer_name,
          device_model: o.device_model || o.device_name || "",
          imei_serial: o.imei || "",
          passcode: "",
          issues: o.issue_description ? [o.issue_description] : [],
          status: o.status || "Mới Nhận",
          notes: o.technician_note || "",
          assigned_to: o.assigned_to || "",
          assigned_at: o.received_date || o.created_date,
          accept_stage: o.status === "Hoàn Thành" || o.status === "Đã Giao" ? 3 : 0,
          created: o.received_date || o.created_date,
          images: o.images || [],
          qr_code: o.order_code || "",
          customer_name: o.customer_name || "",
          customer_phone: o.customer_phone || "",
        }));
        setUsers(mappedUsers);
        setOrders(mappedOrders);
      } catch(e) {
        console.error("Load data error:", e);
      } finally {
        setDataLoading(false);
      }
    }
    loadData();
  }, []);

  // ── Auto KPI deduction per timeline diagram ──────────────
  useEffect(() => {
    const iv = setInterval(() => {
      const now = Date.now();
      let kpiChanges = []; // { userId, delta }
      let notifMsgs = [];

      setOrders(prev => {
        let changed = false;
        kpiChanges = [];
        notifMsgs = [];
        const next = prev.map(o => {
          if (!o.assigned_to || !o.assigned_at || o.accept_stage >= 3) return o;
          if (["Hoàn Thành","Đã Giao"].includes(o.status)) return o;
          const assignedAt = new Date(o.assigned_at).getTime();
          let patch = {};

          // Mốc 1: T=60' — chưa cập nhật lần 1, chưa bị trừ
          if ((o.accept_stage||0) === 0 && !o.kpi_stage1_penalized && now >= assignedAt + 60*60000) {
            patch.kpi_stage1_penalized = true;
            kpiChanges.push({ userId: o.assigned_to, delta: -1 });
            notifMsgs.push(`⚠️ Đơn ${o.id}: KTV quá 60 phút chưa Nhận máy → -1 KPI`);
            changed = true;
          }

          // Mốc 2: T=120' — chưa cập nhật lần 2, chưa bị trừ
          if ((o.accept_stage||0) < 2 && !o.kpi_stage2_penalized && now >= assignedAt + 120*60000) {
            patch.kpi_stage2_penalized = true;
            patch.needs_reassign = true;
            kpiChanges.push({ userId: o.assigned_to, delta: -3 });
            notifMsgs.push(`🚨 Đơn ${o.id}: KTV quá 120 phút → -3 KPI. Quản lý cần xử lý!`);
            changed = true;
          }

          if (Object.keys(patch).length > 0) { changed = true; return {...o, ...patch}; }
          return o;
        });
        return changed ? next : prev;
      });

      // Apply KPI changes after orders update
      if (kpiChanges.length > 0) {
        setUsers(u => {
          let next = [...u];
          kpiChanges.forEach(({ userId, delta }) => {
            next = next.map(x => x.id===userId ? {...x, kpi:Math.max(0,x.kpi+delta)} : x);
          });
          return next;
        });
      }
      if (notifMsgs.length > 0) {
        setNotifications(n => [
          ...notifMsgs.map(msg => ({ id: Math.random().toString(36), msg, time: new Date().toISOString() })),
          ...n
        ].slice(0, 10));
      }
    }, 15000); // check mỗi 15 giây
    return () => clearInterval(iv);
  }, []);

  if (dataLoading) return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(135deg,#1e1b4b,#4f46e5)", display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:16 }}>
      <div style={{ fontSize:56 }}>🔧</div>
      <div style={{ color:"#fff", fontWeight:800, fontSize:20 }}>Đang tải hệ thống...</div>
      <div style={{ color:"#c7d2fe", fontSize:14 }}>⏳ Vui lòng chờ</div>
    </div>
  );
  if (!user) return <LoginPage onLogin={u => { setUser(u); setPage(u.role==="technician"?"tasks":u.role==="receptionist"?"new":"dashboard"); }} />;

  function updateOrder(id, patch, kpiEvent) {
    setOrders(p => p.map(o => o.id===id ? {...o,...patch} : o));
    if (selectedOrder?.id===id) setSelectedOrder(p => ({...p,...patch}));
    if (kpiEvent) setUsers(p => p.map(u => u.id===kpiEvent.userId ? {...u, kpi:Math.max(0,u.kpi+kpiEvent.delta)} : u));
  }
  function createOrder(data) {
    setOrders(p => [data, ...p]);
    if (data.assigned_to) {
      const ktv = users.find(u => u.id===data.assigned_to);
      setNotifications(n => [{ id:Math.random().toString(36), msg:`🔔 Đơn ${data.id} giao cho ${ktv?.name}. Quy trình KPI đã bắt đầu!`, time:new Date().toISOString() }, ...n.slice(0,9)]);
    }
    setCreatedOrder(data);
    setPage("board");
  }
  function goToPendingAccept() {
    setPage("tasks");
    const p = orders.find(o => o.assigned_to===user.id && (o.accept_stage||0)<2 && o.assigned_at);
    if (p) { setHighlightId(p.id); setTimeout(() => setHighlightId(null), 3000); }
  }

  function handleGlobalQRScan(result) {
    setShowQRScan(false);
    if (result.type === "order") setSelectedOrder(result.data);
  }

  const myOrders = user.role==="technician" ? orders.filter(o => o.assigned_to===user.id) : orders;
  const filtered = myOrders.filter(o => {
    if (!search) return true;
    const q = search.toLowerCase().trim();
    const nameMatch = (o.customer_name||"").toLowerCase().includes(q);
    const phoneMatch = (o.customer_phone||"").includes(q);
    const deviceMatch = (o.device_model||"").toLowerCase().includes(q);
    const idMatch = (o.id||"").toLowerCase().includes(q);
    const qrMatch = (o.qr_code||"").toLowerCase().includes(q);
    const imeiMatch = (o.imei_serial||"").includes(q);
    const noteMatch = (o.notes||"").toLowerCase().includes(q);
    return nameMatch || phoneMatch || deviceMatch || idMatch || qrMatch || imeiMatch || noteMatch;
  });
  const pendingAccepts = orders.filter(o => o.assigned_to===user.id && (o.accept_stage||0)<2 && o.assigned_at && !["Hoàn Thành","Đã Giao"].includes(o.status));

  const navItems = [
    ...(user.role==="manager"?[{key:"dashboard",icon:"📊",label:"Tổng quan"}]:[]),
    ...(user.role!=="technician"?[{key:"board",icon:"📋",label:"Bảng theo dõi"},{key:"new",icon:"➕",label:"Tạo đơn mới"}]:[]),
    {key:"tasks",icon:"✅",label:user.role==="manager"?"Tất cả việc":"Việc của tôi"},
    ...(user.role!=="receptionist"?[{key:"kpi",icon:"🏆",label:"KPI Kỹ thuật"}]:[]),
    ...(user.role!=="technician"?[{key:"customers",icon:"👥",label:"Khách hàng"}]:[]),
    ...(user.role==="admin"||user.role==="manager"?[{key:"staff",icon:"👤",label:"Nhân viên"},{key:"settings",icon:"⚙️",label:"Cài đặt"}]:[]),
  ];

  // ── Kanban Board ─────────────────────────────────────────
  const COLUMNS = ["Mới Nhận","Đang Kiểm Tra","Chờ Linh Kiện","Đang Sửa","Hoàn Thành","Đã Giao"];
  const colColors = { "Mới Nhận":"#dbeafe","Đang Kiểm Tra":"#fef3c7","Chờ Linh Kiện":"#fce7f3","Đang Sửa":"#ede9fe","Hoàn Thành":"#dcfce7","Đã Giao":"#f1f5f9" };
  const colBorder = { "Mới Nhận":"#93c5fd","Đang Kiểm Tra":"#fcd34d","Chờ Linh Kiện":"#f9a8d4","Đang Sửa":"#c4b5fd","Hoàn Thành":"#86efac","Đã Giao":"#cbd5e1" };

  function KanbanBoard() {
    return (
      <div style={{ overflowX:"auto", padding:"0 16px 80px" }}>
        <div style={{ display:"flex", gap:12, minWidth: COLUMNS.length * 240 }}>
          {COLUMNS.map(col => {
            const colOrders = filtered.filter(o => o.status===col);
            return (
              <div key={col} style={{ flex:"0 0 230px", background:colColors[col], borderRadius:16, border:`1.5px solid ${colBorder[col]}`, padding:12, minHeight:300 }}>
                <div style={{ fontWeight:800, fontSize:13, color:"#374151", marginBottom:10, display:"flex", justifyContent:"space-between" }}>
                  <span>{col}</span>
                  <span style={{ background:"#fff", borderRadius:99, padding:"2px 10px", fontSize:12 }}>{colOrders.length}</span>
                </div>
                {colOrders.map(o => <OrderCard key={o.id} order={o} highlight={highlightId===o.id} onClick={() => setSelectedOrder(o)} users={users} />)}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function OrderCard({ order: o, highlight, onClick, users }) {
    const ktv = users.find(u => u.id===o.assigned_to);
    const timerInfo = ktv ? getKpiTimerInfo(o) : null;
    return (
      <div onClick={onClick} style={{ background:"#fff", borderRadius:12, padding:12, marginBottom:8, cursor:"pointer", boxShadow:highlight?"0 0 0 3px #f59e0b":"0 1px 4px rgba(0,0,0,.08)", border:highlight?"2px solid #f59e0b":"2px solid transparent", transition:"box-shadow .2s" }}>
        <div style={{ fontWeight:800, fontSize:13, color:"#1e1b4b", marginBottom:4 }}>{o.id}</div>
        <div style={{ fontSize:12, color:"#374151", marginBottom:2 }}>👤 {o.customer_name||"?"} · {o.customer_phone||""}</div>
        <div style={{ fontSize:12, color:"#6b7280", marginBottom:4 }}>📱 {o.device_model}</div>
        {o.issues?.length>0 && <div style={{ fontSize:11, color:"#7c3aed", marginBottom:4 }}>{o.issues.slice(0,2).join(" · ")}</div>}
        {ktv && <div style={{ fontSize:11, color:"#059669", marginBottom:timerInfo?4:0 }}>🔧 {ktv.name}</div>}
        {timerInfo && (
          <div style={{ fontSize:11, color:timerInfo.urgent?"#dc2626":"#d97706", fontWeight:700 }}>
            ⏱ {timerInfo.label}: {timerInfo.timeStr}
          </div>
        )}
      </div>
    );
  }

  // ── Tasks list ───────────────────────────────────────────
  function TaskList() {
    const list = user.role==="technician" ? filtered : filtered.filter(o => !["Đã Giao"].includes(o.status));
    return (
      <div style={{ padding:"0 16px 80px" }}>
        {pendingAccepts.length > 0 && user.role==="technician" && (
          <div style={{ background:"#fef3c7", borderRadius:14, padding:14, marginBottom:12, border:"2px solid #fcd34d" }}>
            <div style={{ fontWeight:800, color:"#d97706" }}>⏰ Có {pendingAccepts.length} đơn cần xác nhận!</div>
            <div style={{ fontSize:12, color:"#92400e", marginTop:4 }}>Nhớ cập nhật trạng thái để tránh bị trừ KPI nhé!</div>
          </div>
        )}
        {list.length===0 && <div style={{ textAlign:"center", color:"#9ca3af", padding:40 }}>Không có đơn nào</div>}
        {list.map(o => {
          const ktv = users.find(u=>u.id===o.assigned_to);
          const timerInfo = getKpiTimerInfo(o);
          return (
            <div key={o.id} onClick={() => setSelectedOrder(o)}
              style={{ background:"#fff", borderRadius:14, padding:14, marginBottom:10, cursor:"pointer", boxShadow:"0 2px 8px rgba(0,0,0,.08)", border:`2px solid ${o.needs_reassign?"#ef4444":"#f3f4f6"}` }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                <div style={{ fontWeight:800, color:"#1e1b4b" }}>{o.id}</div>
                <div style={{ fontSize:12, padding:"3px 10px", borderRadius:99, background: o.status==="Hoàn Thành"?"#dcfce7":o.status==="Đang Sửa"?"#ede9fe":"#fef3c7", color:"#374151" }}>{o.status}</div>
              </div>
              <div style={{ fontSize:13, color:"#374151", marginBottom:2 }}>👤 {o.customer_name} · 📱 {o.device_model}</div>
              {ktv && <div style={{ fontSize:12, color:"#6b7280" }}>🔧 {ktv.name}</div>}
              {timerInfo && <div style={{ fontSize:12, color:timerInfo.urgent?"#dc2626":"#d97706", fontWeight:700, marginTop:4 }}>⏱ {timerInfo.label}: {timerInfo.timeStr}</div>}
              {o.needs_reassign && <div style={{ fontSize:12, color:"#ef4444", fontWeight:700, marginTop:4 }}>🚨 Cần chuyển KTV khác!</div>}
            </div>
          );
        })}
      </div>
    );
  }

  // ── Customer List ─────────────────────────────────────────
  function CustomerList() {
    const custMap = {};
    orders.forEach(o => {
      if (o.customer_phone) {
        if (!custMap[o.customer_phone]) custMap[o.customer_phone] = { name:o.customer_name, phone:o.customer_phone, orders:0, lastOrder:o.created };
        custMap[o.customer_phone].orders++;
        if (o.created > custMap[o.customer_phone].lastOrder) custMap[o.customer_phone].lastOrder = o.created;
      }
    });
    const custs = Object.values(custMap).sort((a,b) => b.orders - a.orders);
    return (
      <div style={{ padding:"0 16px 80px" }}>
        <div style={{ fontWeight:900, fontSize:18, color:"#1e1b4b", marginBottom:12 }}>👥 Khách Hàng ({custs.length})</div>
        {custs.length===0 && <div style={{ textAlign:"center", color:"#9ca3af", padding:40 }}>Chưa có khách hàng</div>}
        {custs.map(c => (
          <div key={c.phone} style={{ background:"#fff", borderRadius:14, padding:14, marginBottom:8, boxShadow:"0 1px 4px rgba(0,0,0,.06)" }}>
            <div style={{ fontWeight:800, fontSize:15 }}>{c.name}</div>
            <div style={{ fontSize:13, color:"#6b7280", marginTop:2 }}>📞 {c.phone} · {c.orders} đơn</div>
          </div>
        ))}
      </div>
    );
  }

  // ── Dashboard ─────────────────────────────────────────────
  function Dashboard() {
    const stats = {
      total: orders.length,
      active: orders.filter(o=>!["Hoàn Thành","Đã Giao"].includes(o.status)).length,
      done: orders.filter(o=>o.status==="Hoàn Thành"||o.status==="Đã Giao").length,
      needsReassign: orders.filter(o=>o.needs_reassign).length,
    };
    const cards = [
      { label:"Tổng đơn", value:stats.total, icon:"📋", bg:"#eef2ff", color:"#4f46e5" },
      { label:"Đang xử lý", value:stats.active, icon:"⚙️", bg:"#fffbeb", color:"#d97706" },
      { label:"Hoàn thành", value:stats.done, icon:"✅", bg:"#f0fdf4", color:"#059669" },
      { label:"Cần xử lý", value:stats.needsReassign, icon:"🚨", bg:"#fef2f2", color:"#dc2626" },
    ];
    return (
      <div style={{ padding:"0 16px 80px" }}>
        <div style={{ fontWeight:900, fontSize:18, color:"#1e1b4b", marginBottom:16 }}>📊 Tổng quan hôm nay</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:20 }}>
          {cards.map(c => (
            <div key={c.label} style={{ background:c.bg, borderRadius:16, padding:16, textAlign:"center" }}>
              <div style={{ fontSize:32 }}>{c.icon}</div>
              <div style={{ fontSize:32, fontWeight:900, color:c.color }}>{c.value}</div>
              <div style={{ fontSize:12, color:"#6b7280", marginTop:2 }}>{c.label}</div>
            </div>
          ))}
        </div>
        <KPIPage users={users} orders={orders} />
      </div>
    );
  }

  return (
    <div style={{ minHeight:"100vh", background:"#f8fafc", fontFamily:"system-ui,-apple-system,sans-serif" }}>
      {/* Header */}
      <div style={{ position:"sticky", top:0, zIndex:100, background:"#1e1b4b", padding:"12px 16px", display:"flex", alignItems:"center", gap:12 }}>
        <button onClick={() => setSidebarOpen(v=>!v)} style={{ background:"none", border:"none", color:"#fff", fontSize:22, cursor:"pointer", padding:4 }}>☰</button>
        <div style={{ flex:1, fontWeight:800, fontSize:16, color:"#fff" }}>🔧 Quản Lý Sửa Chữa</div>
        <div style={{ position:"relative" }}>
          <button onClick={() => setShowNotif(v=>!v)} style={{ background:"none", border:"none", color:"#fff", fontSize:22, cursor:"pointer", padding:4 }}>
            🔔
            {notifications.length>0 && <span style={{ position:"absolute", top:-2, right:-2, background:"#ef4444", color:"#fff", borderRadius:"50%", width:16, height:16, fontSize:10, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800 }}>{notifications.length}</span>}
          </button>
        </div>
        <button onClick={() => setShowQRScan(true)} style={{ background:"none", border:"none", color:"#fff", fontSize:22, cursor:"pointer", padding:4 }}>📷</button>
        <button onClick={() => setUser(null)} style={{ background:"rgba(255,255,255,.15)", border:"none", color:"#fff", borderRadius:10, padding:"6px 12px", fontSize:12, cursor:"pointer", fontWeight:700 }}>Thoát</button>
      </div>

      {/* Sidebar */}
      {sidebarOpen && (
        <div style={{ position:"fixed", inset:0, zIndex:200 }}>
          <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,.4)" }} onClick={() => setSidebarOpen(false)} />
          <div style={{ position:"absolute", left:0, top:0, bottom:0, width:260, background:"#fff", boxShadow:"4px 0 20px rgba(0,0,0,.15)", display:"flex", flexDirection:"column" }}>
            <div style={{ background:"#1e1b4b", padding:24, color:"#fff" }}>
              <div style={{ fontSize:40 }}>{user.avatar_url ? <img src={user.avatar_url} style={{width:48,height:48,borderRadius:"50%"}} alt="" /> : "👤"}</div>
              <div style={{ fontWeight:800, fontSize:16, marginTop:8 }}>{user.name}</div>
              <div style={{ fontSize:12, color:"#c7d2fe", marginTop:2 }}>{user.role} · KPI: {user.kpi}</div>
            </div>
            <div style={{ flex:1, overflowY:"auto", padding:8 }}>
              {navItems.map(n => (
                <button key={n.key} onClick={() => { setPage(n.key); setSidebarOpen(false); }}
                  style={{ width:"100%", textAlign:"left", padding:"14px 16px", borderRadius:12, border:"none", background:page===n.key?"#eef2ff":"transparent", color:page===n.key?"#4f46e5":"#374151", fontWeight:page===n.key?800:500, fontSize:15, cursor:"pointer", display:"flex", alignItems:"center", gap:10, marginBottom:2 }}>
                  <span style={{fontSize:20}}>{n.icon}</span> {n.label}
                </button>
              ))}
            </div>
            <div style={{ padding:16, borderTop:"1px solid #f3f4f6", display:"flex", flexDirection:"column", gap:8 }}>
              <button onClick={() => { setUser(null); setSidebarOpen(false); }} style={{ width:"100%", padding:14, background:"#fef2f2", border:"none", borderRadius:12, color:"#dc2626", fontWeight:700, cursor:"pointer" }}>🚪 Đăng xuất</button>
              <ExitAppButton />
            </div>
          </div>
        </div>
      )}

      {/* Notification panel */}
      {showNotif && (
        <div style={{ position:"fixed", inset:0, zIndex:300 }}>
          <div style={{ position:"absolute", inset:0 }} onClick={() => setShowNotif(false)} />
          <div style={{ position:"absolute", top:60, right:8, width:320, background:"#fff", borderRadius:16, boxShadow:"0 8px 32px rgba(0,0,0,.2)", overflow:"hidden" }}>
            <div style={{ padding:"14px 16px", fontWeight:800, borderBottom:"1px solid #f3f4f6" }}>🔔 Thông báo</div>
            {notifications.length===0 ? <div style={{ padding:24, textAlign:"center", color:"#9ca3af" }}>Không có thông báo</div> : notifications.map(n => (
              <div key={n.id} style={{ padding:"12px 16px", borderBottom:"1px solid #f9fafb", fontSize:13 }}>
                <div>{n.msg}</div>
                <div style={{ color:"#9ca3af", fontSize:11, marginTop:2 }}>{timeAgo(n.time)}</div>
              </div>
            ))}
            <button onClick={() => { setNotifications([]); setShowNotif(false); }} style={{ width:"100%", padding:12, background:"#f9fafb", border:"none", cursor:"pointer", color:"#6b7280", fontWeight:600 }}>Xóa tất cả</button>
          </div>
        </div>
      )}

      {/* Page title bar */}
      <div style={{ padding:"14px 16px 8px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div style={{ fontWeight:900, fontSize:18, color:"#1e1b4b" }}>
          {navItems.find(n=>n.key===page)?.icon} {navItems.find(n=>n.key===page)?.label || ""}
        </div>
        {(page==="board"||page==="tasks") && (
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="🔍 Tìm kiếm..."
              style={{ height:36, borderRadius:10, border:"1.5px solid #e5e7eb", padding:"0 12px", fontSize:13, outline:"none", width:160 }} />
            {user.role!=="technician" && (
              <button onClick={() => setShowNewOrder(true)}
                style={{ height:36, padding:"0 14px", background:"#4f46e5", color:"#fff", border:"none", borderRadius:10, fontWeight:700, fontSize:13, cursor:"pointer" }}>
                ➕ Tạo đơn
              </button>
            )}
          </div>
        )}
      </div>

      {/* Main content */}
      <Suspense fallback={<div style={{padding:40,textAlign:"center",color:"#9ca3af"}}>⏳ Đang tải...</div>}>
        {page==="board" && <KanbanBoard />}
        {page==="tasks" && <TaskList />}
        {page==="new" && <div style={{padding:16}}><button onClick={() => setShowNewOrder(true)} style={{ width:"100%", height:56, background:"#4f46e5", color:"#fff", border:"none", borderRadius:16, fontWeight:800, fontSize:16, cursor:"pointer" }}>➕ Tạo Đơn Mới</button></div>}
        {page==="kpi" && <KPIPage users={users} orders={orders} />}
        {page==="customers" && <CustomerList />}
        {page==="dashboard" && <Dashboard />}
        {page==="staff" && <StaffManagerPage />}
        {page==="settings" && <SettingsPage />}
      </Suspense>

      {/* Bottom nav */}
      <div style={{ position:"fixed", bottom:0, left:0, right:0, background:"#fff", borderTop:"1px solid #e5e7eb", display:"flex", zIndex:50, paddingBottom:"env(safe-area-inset-bottom)" }}>
        {navItems.slice(0,5).map(n => (
          <button key={n.key} onClick={() => setPage(n.key)}
            style={{ flex:1, padding:"10px 4px", background:"none", border:"none", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:2 }}>
            <span style={{ fontSize:20 }}>{n.icon}</span>
            <span style={{ fontSize:10, color:page===n.key?"#4f46e5":"#9ca3af", fontWeight:page===n.key?800:500 }}>{n.label}</span>
          </button>
        ))}
      </div>

      {/* Modals */}
      {showNewOrder && <NewOrderModal onClose={() => setShowNewOrder(false)} onCreate={createOrder} users={users} orders={orders} />}
      {selectedOrder && (
        <OrderDrawer
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onUpdate={(id, patch, kpiEvent) => { updateOrder(id, patch, kpiEvent); }}
          onAcceptStage={(id, stage) => updateOrder(id, { accept_stage:stage, assigned_at: stage===1 ? new Date().toISOString() : selectedOrder.assigned_at })}
          users={users}
          currentUser={user}
          onGoToPendingAccept={goToPendingAccept}
        />
      )}
      {qrOrder && <QRPrintModal order={qrOrder} onClose={() => setQrOrder(null)} />}
      {showQRScan && <QRScanModal onClose={() => setShowQRScan(false)} onResult={handleGlobalQRScan} orders={orders} />}

      {/* Created order toast */}
      {createdOrder && (
        <div style={{ position:"fixed", bottom:80, left:16, right:16, zIndex:400, background:"#059669", borderRadius:16, padding:"14px 18px", color:"#fff", boxShadow:"0 8px 24px rgba(0,0,0,.2)", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div>
            <div style={{ fontWeight:800 }}>✅ Đã tạo đơn {createdOrder.id}</div>
            <div style={{ fontSize:12, opacity:.9, marginTop:2 }}>{createdOrder.customer_name} · {createdOrder.device_model}</div>
          </div>
          <button onClick={() => { setCreatedOrder(null); setQrOrder(createdOrder); }}
            style={{ background:"rgba(255,255,255,.2)", border:"none", color:"#fff", borderRadius:10, padding:"8px 14px", cursor:"pointer", fontWeight:700, fontSize:13 }}>
            In QR
          </button>
          <button onClick={() => setCreatedOrder(null)}
            style={{ background:"rgba(255,255,255,.2)", border:"none", color:"#fff", borderRadius:10, padding:"8px 14px", cursor:"pointer", fontWeight:700, fontSize:13 }}>
            OK
          </button>
        </div>
      )}
    </div>
  );
}
