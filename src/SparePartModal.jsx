/* v1774860462-8691 */
import { useState, useEffect } from "react";
import { SparePart, SparePartUsage, RepairChat, RepairOrder } from "./pb.js";

// ── Màn hình linh kiện cho KTV ──
// Props:
//   order       — RepairOrder record
//   currentStaff — staff đang login
//   onClose     — đóng modal
//   onDone      — sau khi bấm "Sửa Xong" thành công

export default function SparePartModal({ order, currentStaff, onClose, onDone }) {
  // Null guards
  const staffName = currentStaff?.full_name || "Nhân viên";
  const staffId   = currentStaff?.id || "";
  const staffRole = currentStaff?.role || "";
  const [parts, setParts]       = useState([]);   // danh sách SparePart
  const [usages, setUsages]     = useState([]);   // SparePartUsage của đơn này
  const [search, setSearch]     = useState("");
  const [loading, setLoading]   = useState(true);
  const [tab, setTab]           = useState("list"); // "list" | "used"
  const [toast, setToast]       = useState("");
  const [confirming, setConfirming] = useState(false); // confirm "Sửa Xong"
  const [finishing, setFinishing]   = useState(false);

  useEffect(() => { loadAll(); }, [order.id]);

  async function loadAll() {
    setLoading(true);
    try {
      const [p, u] = await Promise.all([
        SparePart.filter({ is_active: true }),
        SparePartUsage.filter({ order_id: order.id }),
      ]);
      setParts(p.sort((a,b) => a.name.localeCompare(b.name)));
      setUsages(u);
    } catch {}
    setLoading(false);
  }

  // ── Thêm linh kiện vào đơn ──
  async function addPart(part) {
    // Kiểm tra đã có chưa
    const exist = usages.find(u => u.part_id === part.id && u.status !== "returned");
    if (exist) { showToast("⚠️ Linh kiện này đã được thêm vào đơn!"); return; }

    try {
      const usage = await SparePartUsage.create({
        order_id:     order.id,
        order_code:   order.order_code,
        part_id:      part.id,
        part_name:    part.name,
        sku:          part.sku || "",
        qty_requested: 1,
        qty_returned:  0,
        qty_used:      1,
        unit_price:   part.price || 0,
        total_price:  part.price || 0,
        status:       "pending",
        is_extra:     order.status === "Đang sửa", // nếu đã đang sửa thì là phát sinh
      });

      // Auto chat kho
      await sendWarehouseChat(part, usage.id);

      setUsages(prev => [...prev, usage]);
      setTab("used");
      showToast(`✅ Đã thêm "${part.name}" — đã nhắn kho xuất tạm`);
    } catch (e) {
      showToast("❌ Lỗi thêm linh kiện!");
    }
  }

  // ── Gửi chat tự động cho kho ──
  async function sendWarehouseChat(part, usageId) {
    const isExtra = order.status === "Đang sửa";
    const msg = `📦 [TỰ ĐỘNG] Yêu cầu xuất tạm linh kiện\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `📋 Đơn: ${order.order_code}\n` +
      `📱 Máy: ${order.device_model || order.device_name || "?"}\n` +
      `🔧 KTV: ${staffName}\n` +
      `📦 LK: ${part.name}${part.sku ? ` (${part.sku})` : ""}\n` +
      `📊 SL: 1 ${part.unit || "cái"}\n` +
      (isExtra ? `⚠️ PHÁT SINH trong quá trình sửa\n` : "") +
      `━━━━━━━━━━━━━━━━━━\n` +
      `👉 Vui lòng xuất tạm và xác nhận trong App`;

    await RepairChat.create({
      order_id:    order.id,
      order_code:  order.order_code,
      sender_id:   "system",
      sender_name: "🤖 Hệ thống",
      message:     msg,
      message_type:"system",
    });
  }

  // ── Xác nhận kho đã xuất tạm ──
  async function confirmIssued(usage) {
    try {
      await SparePartUsage.update(usage.id, {
        status: "issued",
        warehouse_confirmed_by: staffName,
      });
      setUsages(prev => prev.map(u => u.id===usage.id ? {...u, status:"issued", warehouse_confirmed_by: staffName} : u));
      showToast("✅ Đã xác nhận xuất tạm");

      // Chat xác nhận
      await RepairChat.create({
        order_id:    order.id,
        order_code:  order.order_code,
        sender_id:   staffId,
        sender_name: `📦 ${staffName} (Kho)`,
        message:     `✅ Đã xuất tạm: ${usage.part_name} × ${usage.qty_requested} ${usage.unit || "cái"} cho KTV ${order.assigned_to_name || ""}`,
        message_type:"system",
      });
    } catch { showToast("❌ Lỗi xác nhận!"); }
  }

  // ── Trả linh kiện ──
  async function returnPart(usage) {
    const qtyReturn = Number(prompt(`Trả lại bao nhiêu "${usage.part_name}"? (Đã xuất: ${usage.qty_requested})`, usage.qty_requested));
    if (!qtyReturn || qtyReturn <= 0) return;
    const actualQtyReturn = Math.min(qtyReturn, usage.qty_requested);
    const qtyUsed = usage.qty_requested - actualQtyReturn;

    try {
      await SparePartUsage.update(usage.id, {
        qty_returned: actualQtyReturn,
        qty_used:     qtyUsed,
        total_price:  qtyUsed * usage.unit_price,
        status:       qtyUsed === 0 ? "returned" : "issued",
      });
      setUsages(prev => prev.map(u => u.id===usage.id ? {
        ...u, qty_returned: actualQtyReturn, qty_used: qtyUsed,
        total_price: qtyUsed * usage.unit_price,
        status: qtyUsed===0 ? "returned" : "issued"
      } : u));
      showToast(`↩️ Trả ${actualQtyReturn} "${usage.part_name}" — còn dùng ${qtyUsed}`);

      // Chat kho
      await RepairChat.create({
        order_id:    order.id,
        order_code:  order.order_code,
        sender_id:   staffId,
        sender_name: `🔧 ${staffName} (KTV)`,
        message:     `↩️ Trả linh kiện: ${usage.part_name} × ${actualQtyReturn}\nCòn dùng: ${qtyUsed} | Tính tiền: ${(qtyUsed * usage.unit_price).toLocaleString()}đ`,
        message_type:"system",
      });
    } catch { showToast("❌ Lỗi trả linh kiện!"); }
  }

  // ── Sửa số lượng ──
  async function updateQty(usage, newQty) {
    if (newQty < 1) return;
    try {
      const total = newQty * usage.unit_price;
      await SparePartUsage.update(usage.id, { qty_requested: newQty, qty_used: newQty, total_price: total });
      setUsages(prev => prev.map(u => u.id===usage.id ? {...u, qty_requested:newQty, qty_used:newQty, total_price:total} : u));
    } catch {}
  }

  // ── SỬA XONG ──
  async function handleFinish() {
    setFinishing(true);
    try {
      // Finalize tất cả usage
      const activeUsages = usages.filter(u => u.status !== "returned");
      for (const u of activeUsages) {
        await SparePartUsage.update(u.id, { status: "finalized" });
      }

      // Tính final_cost
      const partCost = activeUsages.reduce((s, u) => s + (u.total_price || 0), 0);
      const finalCost = (order.estimated_cost || 0) + partCost;

      // Cập nhật đơn hàng
      await RepairOrder.update(order.id, {
        status:     "Hoàn thành",
        done_date:  new Date().toISOString(),
        final_cost: finalCost,
      });

      // Chat thông báo
      await RepairChat.create({
        order_id:    order.id,
        order_code:  order.order_code,
        sender_id:   staffId,
        sender_name: `🔧 ${staffName}`,
        message:     `✅ SỬA XONG!\nLinh kiện đã dùng: ${activeUsages.length} loại\nTổng LK: ${partCost.toLocaleString()}đ\nCông sửa: ${(order.estimated_cost||0).toLocaleString()}đ\nTổng bill dự kiến: ${finalCost.toLocaleString()}đ\n\n📡 KiotViet sẽ tự trừ kho khi đồng bộ.`,
        message_type:"system",
      });

      showToast("🎉 Sửa xong! Đã cập nhật đơn hàng.");
      setConfirming(false);
      setTimeout(() => onDone && onDone(), 1200);
    } catch (e) {
      showToast("❌ Lỗi cập nhật! Thử lại.");
    }
    setFinishing(false);
  }

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(""), 2800); }

  // ── Tính tổng ──
  const activeUsages  = usages.filter(u => u.status !== "returned");
  const totalPartCost = activeUsages.reduce((s, u) => s + (u.total_price || 0), 0);
  const totalBill     = (order.estimated_cost || 0) + totalPartCost;

  const filteredParts = parts.filter(p => {
    const q = search.toLowerCase();
    return !q || p.name.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q) || p.category?.toLowerCase().includes(q);
  });

  const STATUS_BADGE = {
    pending:   { label:"Chờ kho",   bg:"#fef9c3", color:"#92400e" },
    issued:    { label:"Đã xuất",   bg:"#dcfce7", color:"#065f46" },
    returned:  { label:"Đã trả",    bg:"#f3f4f6", color:"#6b7280" },
    finalized: { label:"Hoàn tất",  bg:"#dbeafe", color:"#1d4ed8" },
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.55)", zIndex:2000, display:"flex", alignItems:"flex-end", justifyContent:"center" }}>
      <div style={{ background:"#f8faff", borderRadius:"24px 24px 0 0", width:"100%", maxWidth:560, maxHeight:"92vh", display:"flex", flexDirection:"column", boxShadow:"0 -8px 40px rgba(0,0,0,.25)" }}>

        {/* Header */}
        <div style={{ padding:"20px 20px 0", flexShrink:0 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
            <div>
              <div style={{ fontSize:17, fontWeight:900, color:"#1e1b4b" }}>🔩 Linh kiện — {order.order_code}</div>
              <div style={{ fontSize:13, color:"#6b7280", marginTop:2 }}>{order.device_model || order.device_name} · {order.customer_name}</div>
            </div>
            <button onClick={onClose} style={{ background:"#f3f4f6", border:"none", width:34, height:34, borderRadius:"50%", cursor:"pointer", fontSize:15 }}>✕</button>
          </div>

          {/* Tabs */}
          <div style={{ display:"flex", gap:0, marginTop:14, borderBottom:"2px solid #e5e7eb" }}>
            {[
              { key:"list", label:`📦 Danh sách LK` },
              { key:"used", label:`🔧 Đã dùng (${activeUsages.length})` },
            ].map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                style={{ flex:1, height:40, border:"none", background:"none", fontWeight: tab===t.key?800:600, color: tab===t.key?"#4f46e5":"#6b7280", fontSize:13, cursor:"pointer", borderBottom: tab===t.key?"3px solid #4f46e5":"3px solid transparent", marginBottom:-2 }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div style={{ flex:1, overflowY:"auto", padding:"16px 20px" }}>
          {loading ? (
            <div style={{ textAlign:"center", padding:40, color:"#9ca3af" }}>Đang tải...</div>
          ) : tab === "list" ? (
            <>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="🔍 Tìm tên, SKU, loại linh kiện..."
                style={{ width:"100%", height:44, borderRadius:12, border:"1.5px solid #e5e7eb", padding:"0 14px", fontSize:14, outline:"none", marginBottom:12, boxSizing:"border-box", background:"#fff" }} />
              {filteredParts.length === 0 ? (
                <div style={{ textAlign:"center", padding:32, color:"#9ca3af" }}>
                  <div style={{ fontSize:36 }}>📦</div>
                  <div style={{ marginTop:8 }}>Không có linh kiện nào</div>
                  <div style={{ fontSize:12, marginTop:4 }}>Thêm linh kiện trong phần Quản lý kho</div>
                </div>
              ) : (
                filteredParts.map(p => {
                  const alreadyAdded = usages.some(u => u.part_id === p.id && u.status !== "returned");
                  return (
                    <div key={p.id} style={{ background:"#fff", borderRadius:14, padding:14, marginBottom:8, border: alreadyAdded?"2px solid #6ee7b7":"1.5px solid #f3f4f6", display:"flex", alignItems:"center", gap:12 }}>
                      <div style={{ flex:1 }}>
                        <div style={{ fontWeight:700, fontSize:14, color:"#1e1b4b" }}>{p.name}</div>
                        <div style={{ fontSize:12, color:"#6b7280", marginTop:2 }}>
                          {p.sku ? `SKU: ${p.sku} · ` : ""}{p.category || "Linh kiện"} · Tồn: <b style={{ color: (p.stock_qty||0)>0?"#065f46":"#dc2626" }}>{p.stock_qty || 0}</b>
                        </div>
                        <div style={{ fontSize:13, fontWeight:800, color:"#4f46e5", marginTop:2 }}>{(p.price||0).toLocaleString()}đ</div>
                      </div>
                      {alreadyAdded ? (
                        <span style={{ background:"#ecfdf5", color:"#065f46", fontSize:12, fontWeight:700, padding:"6px 12px", borderRadius:10 }}>✅ Đã thêm</span>
                      ) : (p.stock_qty || 0) <= 0 ? (
                        <span style={{ background:"#fef2f2", color:"#dc2626", fontSize:12, fontWeight:700, padding:"6px 12px", borderRadius:10 }}>Hết hàng</span>
                      ) : (
                        <button onClick={() => addPart(p)}
                          style={{ background:"#4f46e5", color:"#fff", border:"none", borderRadius:10, padding:"8px 16px", fontWeight:800, fontSize:13, cursor:"pointer" }}>
                          ＋ Thêm
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </>
          ) : (
            // Tab "Đã dùng"
            <>
              {usages.length === 0 ? (
                <div style={{ textAlign:"center", padding:32, color:"#9ca3af" }}>
                  <div style={{ fontSize:36 }}>🔩</div>
                  <div style={{ marginTop:8 }}>Chưa chọn linh kiện nào</div>
                  <button onClick={() => setTab("list")} style={{ marginTop:12, padding:"10px 24px", background:"#4f46e5", color:"#fff", border:"none", borderRadius:10, fontWeight:700, cursor:"pointer" }}>
                    Chọn linh kiện
                  </button>
                </div>
              ) : (
                <>
                  {usages.map(u => {
                    const sb = STATUS_BADGE[u.status] || STATUS_BADGE.pending;
                    return (
                      <div key={u.id} style={{ background:"#fff", borderRadius:14, padding:14, marginBottom:8, border:`1.5px solid ${u.status==="returned"?"#e5e7eb":"#f3f4f6"}`, opacity: u.status==="returned"?0.6:1 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                          <div style={{ flex:1 }}>
                            <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                              <span style={{ fontWeight:700, fontSize:14, color:"#1e1b4b" }}>{u.part_name}</span>
                              {u.is_extra && <span style={{ background:"#fef9c3", color:"#92400e", fontSize:10, fontWeight:700, padding:"2px 7px", borderRadius:10 }}>⚠️ Phát sinh</span>}
                              <span style={{ background:sb.bg, color:sb.color, fontSize:10, fontWeight:700, padding:"2px 7px", borderRadius:10 }}>{sb.label}</span>
                            </div>
                            {u.status === "pending" && (
                              <div style={{ fontSize:11, color:"#f59e0b", marginTop:3 }}>⏳ Đang chờ kho xác nhận...</div>
                            )}
                          </div>
                        </div>

                        {/* Qty + price */}
                        <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:10 }}>
                          {u.status !== "finalized" && u.status !== "returned" ? (
                            <div style={{ display:"flex", alignItems:"center", gap:6, background:"#f9fafb", borderRadius:10, padding:"4px 8px" }}>
                              <button onClick={() => updateQty(u, (u.qty_requested||1)-1)}
                                style={{ width:26, height:26, borderRadius:8, border:"none", background:"#e5e7eb", cursor:"pointer", fontWeight:800, fontSize:14 }}>−</button>
                              <span style={{ fontWeight:800, fontSize:14, minWidth:20, textAlign:"center" }}>{u.qty_requested || 1}</span>
                              <button onClick={() => updateQty(u, (u.qty_requested||1)+1)}
                                style={{ width:26, height:26, borderRadius:8, border:"none", background:"#e5e7eb", cursor:"pointer", fontWeight:800, fontSize:14 }}>＋</button>
                            </div>
                          ) : (
                            <span style={{ fontWeight:700, fontSize:13, color:"#374151" }}>SL: {u.qty_used || u.qty_requested}</span>
                          )}
                          <span style={{ fontSize:12, color:"#9ca3af" }}>×</span>
                          <span style={{ fontSize:13, color:"#6b7280" }}>{(u.unit_price||0).toLocaleString()}đ</span>
                          <span style={{ fontSize:13, color:"#9ca3af" }}>=</span>
                          <span style={{ fontWeight:800, fontSize:14, color:"#4f46e5", marginLeft:"auto" }}>{(u.total_price||0).toLocaleString()}đ</span>
                        </div>

                        {/* Action buttons */}
                        {u.status !== "finalized" && u.status !== "returned" && (
                          <div style={{ display:"flex", gap:8, marginTop:10 }}>
                            {u.status === "pending" && staffRole === "warehouse" && (
                              <button onClick={() => confirmIssued(u)}
                                style={{ flex:1, height:36, borderRadius:10, border:"none", background:"#ecfdf5", color:"#065f46", fontWeight:700, fontSize:13, cursor:"pointer" }}>
                                ✅ Xác nhận xuất tạm
                              </button>
                            )}
                            {(u.status === "issued" || u.status === "pending") && (
                              <button onClick={() => returnPart(u)}
                                style={{ flex:1, height:36, borderRadius:10, border:"1.5px solid #e5e7eb", background:"#f9fafb", color:"#374151", fontWeight:700, fontSize:13, cursor:"pointer" }}>
                                ↩️ Trả linh kiện
                              </button>
                            )}
                          </div>
                        )}
                        {u.qty_returned > 0 && (
                          <div style={{ fontSize:11, color:"#6b7280", marginTop:6 }}>↩️ Đã trả: {u.qty_returned} · Thực dùng: {u.qty_used}</div>
                        )}
                      </div>
                    );
                  })}

                  {/* Tổng */}
                  <div style={{ background:"#eef2ff", borderRadius:14, padding:14, marginTop:4, border:"1.5px solid #c7d2fe" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, color:"#374151", marginBottom:6 }}>
                      <span>💼 Công sửa (dự kiến)</span>
                      <span style={{ fontWeight:700 }}>{(order.estimated_cost||0).toLocaleString()}đ</span>
                    </div>
                    <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, color:"#374151", marginBottom:6 }}>
                      <span>🔩 Linh kiện ({activeUsages.length} loại)</span>
                      <span style={{ fontWeight:700 }}>{totalPartCost.toLocaleString()}đ</span>
                    </div>
                    <div style={{ display:"flex", justifyContent:"space-between", fontSize:15, color:"#1e1b4b", fontWeight:900, paddingTop:8, borderTop:"1.5px solid #c7d2fe" }}>
                      <span>💰 Tổng bill dự kiến</span>
                      <span style={{ color:"#4f46e5" }}>{totalBill.toLocaleString()}đ</span>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>



        {tab === "list" && usages.length > 0 && (
          <div style={{ padding:"12px 20px 20px", flexShrink:0, borderTop:"1.5px solid #e5e7eb", background:"#fff" }}>
            <button onClick={() => setTab("used")}
              style={{ width:"100%", height:48, background:"#4f46e5", color:"#fff", border:"none", borderRadius:14, fontWeight:800, fontSize:14, cursor:"pointer" }}>
              Xem {activeUsages.length} LK đã chọn → Sửa Xong
            </button>
          </div>
        )}
      </div>

      {toast && (
        <div style={{ position:"fixed", bottom:100, left:"50%", transform:"translateX(-50%)", background:"#1e1b4b", color:"#fff", borderRadius:14, padding:"12px 24px", fontSize:14, fontWeight:700, zIndex:5000, whiteSpace:"pre-line", maxWidth:320, textAlign:"center" }}>
          {toast}
        </div>
      )}
    </div>
  );
}
