/* PaymentModal.jsx — Thanh toán đơn sửa chữa */
import React, { useState, useEffect, useRef } from "react";
import { SparePartUsage, RepairOrder, Notification } from "./pb.js";

const PRIMARY = "#3730a3";
const LIGHT = "#ede9fe";

// ── Format tiền ──────────────────────────────────────────
function fmtMoney(n) {
  if (!n && n !== 0) return "—";
  return Number(n).toLocaleString("vi-VN") + "đ";
}

// ── In bill ──────────────────────────────────────────────
function printBill({ order, parts, totalCost, deposit, remaining, payMethod }) {
  const now = new Date().toLocaleString("vi-VN");
  const html = `<!DOCTYPE html><html><head>
<meta charset="UTF-8"/>
<title>Hóa đơn ${order.order_code || order.id}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 13px; margin: 0; padding: 20px; max-width: 400px; margin: auto; }
  h1 { font-size: 18px; text-align: center; color: #3730a3; margin: 0; }
  .sub { text-align: center; color: #6b7280; font-size: 12px; margin-bottom: 12px; }
  .divider { border: none; border-top: 1px dashed #d1d5db; margin: 10px 0; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { background: #ede9fe; color: #3730a3; text-align: left; padding: 6px 8px; }
  td { padding: 5px 8px; border-bottom: 1px solid #f3f4f6; }
  .right { text-align: right; }
  .total-row td { font-weight: bold; font-size: 13px; border-top: 2px solid #3730a3; }
  .remain-row td { font-weight: bold; font-size: 15px; color: #dc2626; }
  .sign { margin-top: 32px; display: flex; justify-content: space-between; }
  .sign div { text-align: center; font-size: 12px; color: #374151; }
  .sign div strong { display: block; margin-top: 48px; }
  .badge { display:inline-block; background:#ede9fe; color:#3730a3; border-radius:20px; padding:2px 10px; font-size:11px; font-weight:700; }
  @media print { body { padding: 8px; } }
</style>
</head><body>
<h1>🔧 HOÀNG KHÁNH MOBILE</h1>
<div class="sub">Dịch vụ sửa chữa điện thoại chuyên nghiệp<br/>📞 Hotline: ___________</div>
<hr class="divider"/>
<table>
  <tr><td><b>Mã phiếu</b></td><td class="right">${order.order_code || order.id}</td></tr>
  <tr><td><b>Khách hàng</b></td><td class="right">${order.customer_name || "—"}</td></tr>
  <tr><td><b>SĐT</b></td><td class="right">${order.customer_phone || "—"}</td></tr>
  <tr><td><b>Thiết bị</b></td><td class="right">${order.device_name || ""} ${order.device_model || ""}</td></tr>
  <tr><td><b>Ngày in</b></td><td class="right">${now}</td></tr>
  ${order.warranty_days ? `<tr><td><b>Bảo hành</b></td><td class="right">${order.warranty_days} ngày</td></tr>` : ""}
</table>
<hr class="divider"/>
<table>
  <thead><tr><th>Hạng mục</th><th class="right">SL</th><th class="right">Đơn giá</th><th class="right">Thành tiền</th></tr></thead>
  <tbody>
    <tr><td>Phí sửa chữa</td><td class="right">1</td><td class="right">${fmtMoney(order.final_cost || order.estimated_cost)}</td><td class="right">${fmtMoney(order.final_cost || order.estimated_cost)}</td></tr>
    ${parts.map(p => `<tr><td>${p.part_name}</td><td class="right">${p.qty_used || p.qty_requested || 1}</td><td class="right">${fmtMoney(p.unit_price)}</td><td class="right">${fmtMoney(p.total_price)}</td></tr>`).join("")}
    <tr class="total-row"><td colspan="3">Tổng cộng</td><td class="right">${fmtMoney(totalCost)}</td></tr>
    <tr><td colspan="3">Đã đặt cọc</td><td class="right" style="color:#059669">- ${fmtMoney(deposit)}</td></tr>
    <tr class="remain-row"><td colspan="3">Còn lại thu</td><td class="right">${fmtMoney(remaining)}</td></tr>
  </tbody>
</table>
<hr class="divider"/>
<p style="margin:6px 0;font-size:12px;color:#6b7280">Hình thức: <span class="badge">${payMethod}</span></p>
<div class="sign">
  <div>Khách hàng ký<strong>____________________</strong></div>
  <div>Thu ngân<strong>____________________</strong></div>
</div>
<p style="text-align:center;font-size:11px;color:#9ca3af;margin-top:20px">Cảm ơn quý khách! Hẹn gặp lại 🙏</p>
</body></html>`;

  const win = window.open("", "_blank", "width=480,height=700");
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
}

// ── Main Component ───────────────────────────────────────
export function PaymentModal({ order, currentUser, onClose, onDone }) {
  const [parts, setParts]             = useState([]);
  const [loading, setLoading]         = useState(true);
  const [payMethod, setPayMethod]     = useState("Tiền mặt");
  const [actualAmount, setActualAmount] = useState("");
  const [saving, setSaving]           = useState(false);
  const [confirmed, setConfirmed]     = useState(false);

  // ── Load spare parts used ──────────────────────────────
  useEffect(() => {
    if (!order?.id) return;
    setLoading(true);
    SparePartUsage.filter({ order_id: order.id })
      .then(items => {
        // Chỉ lấy linh kiện đã dùng (qty_used > 0 hoặc status confirmed)
        const used = items.filter(i => (i.qty_used > 0) || i.status === "ktv_confirmed" || i.status === "done");
        setParts(used);
      })
      .catch(() => setParts([]))
      .finally(() => setLoading(false));
  }, [order?.id]);

  // ── Tính tiền ──────────────────────────────────────────
  const repairCost  = Number(order?.final_cost || order?.estimated_cost || 0);
  const partsCost   = parts.reduce((s, p) => s + Number(p.total_price || 0), 0);
  const totalCost   = repairCost + partsCost;
  const deposit     = Number(order?.deposit || 0);
  const remaining   = Math.max(0, totalCost - deposit);

  // ── Xác nhận thanh toán ───────────────────────────────
  async function handleConfirm() {
    if (saving) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      await RepairOrder.update(order.id, {
        status:    "Đã thanh toán",
        done_date: now,
        final_cost: totalCost,
      });

      // Gửi notification cho manager
      const managers = []; // sẽ notify all managers qua Notification
      await Notification.create({
        title:      "💰 Đã thanh toán",
        message:    `Đơn ${order.order_code || order.id} — ${order.customer_name} — Còn lại: ${fmtMoney(remaining)}`,
        order_id:   order.id,
        order_code: order.order_code || order.id,
        type:       "payment",
        user_id:    "__all_managers__",
        user_name:  "Tất cả quản lý",
        is_read:    false,
      });

      setConfirmed(true);
      setTimeout(() => { onDone && onDone(); onClose(); }, 1800);
    } catch (e) {
      alert("Lỗi xác nhận: " + e.message);
    } finally {
      setSaving(false);
    }
  }

  // ── Backdrop click ────────────────────────────────────
  function handleBackdrop(e) {
    if (e.target === e.currentTarget) onClose();
  }

  // ── Render ────────────────────────────────────────────
  return (
    <div
      onClick={handleBackdrop}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,.55)",
        zIndex: 9999, display: "flex", alignItems: "flex-end", justifyContent: "center",
      }}
    >
      <div style={{
        background: "#fff", borderRadius: "24px 24px 0 0",
        width: "100%", maxWidth: 520, maxHeight: "92vh",
        display: "flex", flexDirection: "column", overflow: "hidden",
        boxShadow: "0 -8px 40px rgba(0,0,0,.2)",
      }}>
        {/* Header */}
        <div style={{
          background: PRIMARY, color: "#fff",
          padding: "18px 20px 14px", display: "flex", alignItems: "center", justifyContent: "space-between",
          borderRadius: "24px 24px 0 0", flexShrink: 0,
        }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 17 }}>💰 Thu tiền đơn sửa</div>
            <div style={{ fontSize: 12, opacity: .8, marginTop: 2 }}>{order.order_code || order.id} · {order.customer_name}</div>
          </div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,.2)", border: "none", color: "#fff", width: 36, height: 36, borderRadius: "50%", fontSize: 18, cursor: "pointer" }}>✕</button>
        </div>

        {/* Body scroll */}
        <div style={{ flex: 1, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Tóm tắt đơn */}
          <div style={{ background: LIGHT, borderRadius: 16, padding: 14 }}>
            <div style={{ fontWeight: 700, color: PRIMARY, fontSize: 13, marginBottom: 8 }}>📋 Thông tin đơn</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 12px", fontSize: 13 }}>
              <Row label="Mã phiếu"   value={order.order_code || order.id} />
              <Row label="Khách hàng" value={order.customer_name} />
              <Row label="SĐT"        value={order.customer_phone} />
              <Row label="Thiết bị"   value={`${order.device_name || ""} ${order.device_model || ""}`.trim()} />
              {order.warranty_days > 0 && <Row label="Bảo hành" value={`${order.warranty_days} ngày`} />}
            </div>
          </div>

          {/* Bảng chi phí */}
          <div style={{ borderRadius: 16, border: "1.5px solid #e5e7eb", overflow: "hidden" }}>
            <div style={{ background: PRIMARY, color: "#fff", padding: "10px 14px", fontWeight: 700, fontSize: 13 }}>📊 Chi tiết chi phí</div>

            {loading ? (
              <div style={{ padding: 20, textAlign: "center", color: "#9ca3af" }}>Đang tải...</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#f9fafb" }}>
                    <th style={{ textAlign: "left",  padding: "8px 12px", color: "#374151", fontWeight: 600 }}>Hạng mục</th>
                    <th style={{ textAlign: "right", padding: "8px 12px", color: "#374151", fontWeight: 600 }}>Thành tiền</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Phí sửa */}
                  <tr style={{ borderTop: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "9px 12px" }}>🔧 Phí sửa chữa</td>
                    <td style={{ padding: "9px 12px", textAlign: "right", fontWeight: 600, color: PRIMARY }}>{fmtMoney(repairCost)}</td>
                  </tr>

                  {/* Linh kiện */}
                  {parts.map((p, i) => (
                    <tr key={i} style={{ borderTop: "1px solid #f3f4f6", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                      <td style={{ padding: "8px 12px" }}>
                        <span style={{ fontSize: 12 }}>⚙️ {p.part_name}</span>
                        {(p.qty_used || p.qty_requested) > 1 && (
                          <span style={{ fontSize: 11, color: "#9ca3af", marginLeft: 4 }}>×{p.qty_used || p.qty_requested}</span>
                        )}
                      </td>
                      <td style={{ padding: "8px 12px", textAlign: "right", fontSize: 13 }}>{fmtMoney(p.total_price)}</td>
                    </tr>
                  ))}

                  {parts.length === 0 && (
                    <tr style={{ borderTop: "1px solid #f3f4f6" }}>
                      <td colSpan={2} style={{ padding: "8px 12px", color: "#9ca3af", fontStyle: "italic", fontSize: 12 }}>Không có linh kiện thay thế</td>
                    </tr>
                  )}

                  {/* Tổng */}
                  <tr style={{ borderTop: "2px solid #e5e7eb", background: "#f0f4ff" }}>
                    <td style={{ padding: "10px 12px", fontWeight: 700 }}>Tổng cộng</td>
                    <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 800, fontSize: 15, color: PRIMARY }}>{fmtMoney(totalCost)}</td>
                  </tr>
                  {deposit > 0 && (
                    <tr style={{ borderTop: "1px solid #f3f4f6", background: "#f0fdf4" }}>
                      <td style={{ padding: "9px 12px", color: "#059669" }}>✅ Đã đặt cọc</td>
                      <td style={{ padding: "9px 12px", textAlign: "right", color: "#059669", fontWeight: 600 }}>- {fmtMoney(deposit)}</td>
                    </tr>
                  )}
                  <tr style={{ borderTop: "2px solid #fca5a5", background: "#fef2f2" }}>
                    <td style={{ padding: "10px 12px", fontWeight: 700, color: "#dc2626" }}>💵 Còn lại phải thu</td>
                    <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 800, fontSize: 18, color: "#dc2626" }}>{fmtMoney(remaining)}</td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>

          {/* Hình thức thanh toán */}
          <div style={{ borderRadius: 16, border: "1.5px solid #e5e7eb", padding: 14 }}>
            <div style={{ fontWeight: 700, color: PRIMARY, fontSize: 13, marginBottom: 10 }}>💳 Hình thức thanh toán</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {["Tiền mặt", "Chuyển khoản", "Kết hợp"].map(m => (
                <button
                  key={m}
                  onClick={() => setPayMethod(m)}
                  style={{
                    flex: 1, minWidth: 100, padding: "10px 8px", borderRadius: 12, border: `2px solid ${payMethod === m ? PRIMARY : "#e5e7eb"}`,
                    background: payMethod === m ? LIGHT : "#fff", color: payMethod === m ? PRIMARY : "#374151",
                    fontWeight: payMethod === m ? 700 : 500, fontSize: 13, cursor: "pointer",
                  }}
                >
                  {m === "Tiền mặt" ? "💵" : m === "Chuyển khoản" ? "🏦" : "🔀"} {m}
                </button>
              ))}
            </div>

            {payMethod === "Kết hợp" && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>Số tiền mặt thu thực tế:</div>
                <input
                  type="number"
                  placeholder="Nhập số tiền mặt..."
                  value={actualAmount}
                  onChange={e => setActualAmount(e.target.value)}
                  style={{
                    width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid #c4b5fd",
                    fontSize: 15, outline: "none", boxSizing: "border-box",
                  }}
                />
                {actualAmount && (
                  <div style={{ fontSize: 12, color: "#7c3aed", marginTop: 4 }}>
                    Chuyển khoản: {fmtMoney(remaining - Number(actualAmount))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Thành công */}
          {confirmed && (
            <div style={{ textAlign: "center", padding: 16, background: "#f0fdf4", borderRadius: 16, border: "1.5px solid #86efac" }}>
              <div style={{ fontSize: 36 }}>✅</div>
              <div style={{ fontWeight: 700, color: "#059669", marginTop: 4 }}>Thanh toán thành công!</div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "12px 20px 20px", display: "flex", gap: 10, flexShrink: 0, borderTop: "1px solid #f3f4f6" }}>
          <button
            onClick={() => printBill({ order, parts, totalCost, deposit, remaining, payMethod })}
            style={{
              flex: 1, height: 50, borderRadius: 14, border: `2px solid ${PRIMARY}`,
              background: "#fff", color: PRIMARY, fontWeight: 700, fontSize: 14, cursor: "pointer",
            }}
          >
            🖨️ In Bill
          </button>
          <button
            onClick={handleConfirm}
            disabled={saving || confirmed}
            style={{
              flex: 2, height: 50, borderRadius: 14, border: "none",
              background: confirmed ? "#059669" : PRIMARY,
              color: "#fff", fontWeight: 800, fontSize: 15, cursor: saving ? "wait" : "pointer",
              opacity: saving ? .7 : 1,
            }}
          >
            {saving ? "⏳ Đang lưu..." : confirmed ? "✅ Xong!" : "Xác nhận Thanh toán"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Helper row ────────────────────────────────────────────
function Row({ label, value }) {
  if (!value) return null;
  return (
    <>
      <span style={{ color: "#6b7280", fontSize: 12 }}>{label}</span>
      <span style={{ fontWeight: 600, fontSize: 12, color: "#111827" }}>{value}</span>
    </>
  );
}
