/* StockExportPage.jsx — Thủ kho xử lý phiếu xuất linh kiện */
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { StockExportRequest, StockLedger, StockMovement, Notification } from "./pb.js";

const PRIMARY = "#3730a3";
const LIGHT   = "#ede9fe";

// ── Helpers ──────────────────────────────────────────────
function fmtMoney(n) {
  if (!n && n !== 0) return "—";
  return Number(n).toLocaleString("vi-VN") + "đ";
}
function genMoveCode() {
  return "MV-" + Date.now().toString(36).toUpperCase();
}
function isOverdue(dt) {
  if (!dt) return false;
  return new Date(dt) < new Date();
}
function fmtDT(dt) {
  if (!dt) return "—";
  return new Date(dt).toLocaleString("vi-VN", { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit" });
}
function fmtDate(dt) {
  if (!dt) return "—";
  return new Date(dt).toLocaleDateString("vi-VN");
}
function parseItems(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try { return JSON.parse(raw); } catch { return []; }
}

// ── Reduce ledger qty ─────────────────────────────────────
async function reduceLedger(warehouseId, item, delta) {
  try {
    let rows = [];
    if (item.part_id) {
      rows = await StockLedger.filter({ warehouse_id: warehouseId, part_id: item.part_id });
    }
    if (!rows.length && item.sku) {
      rows = await StockLedger.filter({ warehouse_id: warehouseId, sku: item.sku });
    }
    if (!rows.length) return { before: 0, after: 0, found: false };
    const row = rows[0];
    const before  = Number(row.qty_on_hand || 0);
    const after   = Math.max(0, before + delta); // delta âm = xuất, dương = hoàn
    const reserved= Number(row.qty_reserved || 0);
    await StockLedger.update(row.id, {
      qty_on_hand:    after,
      qty_available:  Math.max(0, after - reserved),
      last_movement_at: new Date().toISOString(),
    });
    return { before, after, found: true, ledgerId: row.id };
  } catch { return { before: 0, after: 0, found: false }; }
}

// ── Create movement record ─────────────────────────────────
async function createMovement({ type, warehouseId, warehouseName, item, before, after, refId, refCode, userId, userName }) {
  try {
    await StockMovement.create({
      movement_code:   genMoveCode(),
      movement_type:   type,
      warehouse_id:    warehouseId,
      warehouse_name:  warehouseName,
      part_id:         item.part_id || "",
      part_name:       item.part_name || item.name || "",
      sku:             item.sku || "",
      qty_before:      before,
      qty_change:      Math.abs(item.qty || 1),
      qty_after:       after,
      unit_price:      item.unit_price || 0,
      ref_type:        "stock_export_request",
      ref_id:          refId,
      ref_code:        refCode,
      note:            type === "export_repair" ? "Xuất sửa chữa" : "Hoàn linh kiện",
      created_by_id:   userId || "",
      created_by_name: userName || "",
    });
  } catch {}
}

// ────────────────────────────────────────────────────────
//  PENDING CARD
// ────────────────────────────────────────────────────────
function PendingCard({ req, warehouseId, warehouseName, currentUser, onRefresh }) {
  const [checking, setChecking] = useState(false);
  const [stockInfo, setStockInfo] = useState(null); // {ok, warnings}
  const [confirming, setConfirming] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [whNote, setWhNote] = useState("");

  const items = parseItems(req.items);
  const overdue = isOverdue(req.due_datetime);

  // ── Kiểm tra tồn kho ────────────────────────────────
  async function checkStock() {
    setChecking(true);
    const warnings = [];
    for (const item of items) {
      try {
        let rows = [];
        if (item.part_id) rows = await StockLedger.filter({ warehouse_id: warehouseId, part_id: item.part_id });
        if (!rows.length && item.sku) rows = await StockLedger.filter({ warehouse_id: warehouseId, sku: item.sku });
        const avail = rows[0] ? Number(rows[0].qty_available || 0) : 0;
        const need  = Number(item.qty || 1);
        if (avail < need) {
          warnings.push({ name: item.part_name || item.name, need, avail });
        }
      } catch {}
    }
    setStockInfo({ ok: warnings.length === 0, warnings });
    setChecking(false);
    setShowDetail(true);
  }

  // ── Xác nhận xuất kho ───────────────────────────────
  async function handleConfirmExport() {
    if (confirming) return;
    if (stockInfo?.warnings?.length > 0) {
      const cont = window.confirm(
        `⚠️ Một số linh kiện không đủ:\n` +
        stockInfo.warnings.map(w => `• ${w.name}: cần ${w.need}, còn ${w.avail}`).join("\n") +
        `\n\nVẫn tiếp tục xuất kho?`
      );
      if (!cont) return;
    }
    setConfirming(true);
    try {
      const now = new Date().toISOString();
      // Cập nhật từng ledger + tạo movement
      for (const item of items) {
        const qty = Number(item.qty || 1);
        const { before, after } = await reduceLedger(warehouseId, item, -qty);
        await createMovement({
          type: "export_repair",
          warehouseId, warehouseName, item,
          before, after,
          refId: req.id, refCode: req.request_code,
          userId: currentUser?.id, userName: currentUser?.name || currentUser?.full_name,
        });
      }
      // Cập nhật phiếu
      await StockExportRequest.update(req.id, {
        status:                      "warehouse_confirmed",
        warehouse_confirmed_by:      currentUser?.id || "",
        warehouse_confirmed_by_name: currentUser?.name || currentUser?.full_name || "",
        warehouse_confirmed_at:      now,
        warehouse_note:              whNote.trim(),
      });
      // Gửi notification cho KTV
      await Notification.create({
        title:      "📦 Linh kiện đã xuất kho",
        message:    `Phiếu ${req.request_code} · Đơn ${req.order_code} — Thủ kho đã xuất linh kiện, hãy nhận và xác nhận!`,
        order_id:   req.order_id || "",
        order_code: req.order_code || "",
        type:       "stock_export",
        user_id:    req.requested_by || "__ktv__",
        user_name:  req.requested_by_name || "",
        is_read:    false,
      });
      onRefresh();
    } catch (e) {
      alert("Lỗi xác nhận: " + e.message);
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div style={{
      background: "#fff", borderRadius: 16,
      border: `1.5px solid ${overdue ? "#fca5a5" : "#f3f4f6"}`,
      overflow: "hidden",
      boxShadow: overdue ? "0 0 0 1px #fca5a5" : "none",
    }}>
      {/* Card header */}
      <div
        onClick={() => { if (!showDetail) checkStock(); else setShowDetail(false); }}
        style={{
          padding: "13px 14px", cursor: "pointer",
          background: overdue ? "#fff5f5" : "#fff",
          borderBottom: showDetail ? "1px solid #f3f4f6" : "none",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
              <span style={{ fontWeight: 800, fontSize: 13, color: "#111827", fontFamily: "monospace" }}>{req.request_code}</span>
              <span style={{
                fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 20,
                background: req.export_type === "borrow" ? "#fef3c7" : LIGHT,
                color: req.export_type === "borrow" ? "#d97706" : PRIMARY,
              }}>
                {req.export_type === "borrow" ? "🔄 Mượn" : "🔧 Sửa"}
              </span>
              {overdue && <span style={{ fontSize: 10, fontWeight: 700, color: "#dc2626", background: "#fef2f2", padding: "2px 7px", borderRadius: 20 }}>⏰ Quá giờ!</span>}
            </div>
            <div style={{ fontSize: 12, color: "#374151" }}>📋 Đơn: <strong>{req.order_code || "—"}</strong></div>
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
              👤 {req.requested_by_name || "—"} · ⏱ {fmtDT(req.due_datetime)}
            </div>
          </div>
          <div style={{ fontSize: 11, color: "#9ca3af", marginLeft: 8 }}>
            {showDetail ? "▲" : checking ? "⏳" : "▼ Xem"}
          </div>
        </div>

        {/* Items summary */}
        <div style={{ display: "flex", gap: 4, marginTop: 8, flexWrap: "wrap" }}>
          {items.slice(0, 3).map((it, i) => (
            <span key={i} style={{ fontSize: 11, background: "#f3f4f6", color: "#374151", padding: "2px 8px", borderRadius: 20 }}>
              {it.part_name || it.name} ×{it.qty || 1}
            </span>
          ))}
          {items.length > 3 && <span style={{ fontSize: 11, color: "#9ca3af" }}>+{items.length - 3} khác</span>}
        </div>
      </div>

      {/* Detail panel */}
      {showDetail && (
        <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Stock check result */}
          {stockInfo && (
            <div style={{
              borderRadius: 10, padding: "10px 12px",
              background: stockInfo.ok ? "#f0fdf4" : "#fef2f2",
              border: `1px solid ${stockInfo.ok ? "#86efac" : "#fca5a5"}`,
            }}>
              {stockInfo.ok ? (
                <div style={{ color: "#059669", fontWeight: 700, fontSize: 13 }}>✅ Đủ hàng — sẵn sàng xuất kho</div>
              ) : (
                <>
                  <div style={{ color: "#dc2626", fontWeight: 700, fontSize: 13, marginBottom: 6 }}>⚠️ Một số mặt hàng không đủ:</div>
                  {stockInfo.warnings.map((w, i) => (
                    <div key={i} style={{ fontSize: 12, color: "#dc2626", marginBottom: 2 }}>
                      • {w.name}: cần <strong>{w.need}</strong>, còn <strong>{w.avail}</strong>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {/* Full item list */}
          <div style={{ borderRadius: 10, overflow: "hidden", border: "1px solid #f3f4f6" }}>
            <div style={{ background: PRIMARY, color: "#fff", padding: "7px 12px", fontSize: 12, fontWeight: 700 }}>Danh sách linh kiện</div>
            {items.map((it, i) => (
              <div key={i} style={{ padding: "8px 12px", borderBottom: "1px solid #f9fafb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{it.part_name || it.name || "—"}</div>
                  {it.sku && <div style={{ fontSize: 11, color: "#9ca3af", fontFamily: "monospace" }}>{it.sku}</div>}
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 700, color: PRIMARY }}>×{it.qty || 1}</div>
                  {it.unit_price > 0 && <div style={{ fontSize: 11, color: "#9ca3af" }}>{fmtMoney(it.unit_price)}</div>}
                </div>
              </div>
            ))}
          </div>

          {/* Ghi chú kho */}
          <div>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>📝 Ghi chú kho (tuỳ chọn):</div>
            <textarea
              value={whNote}
              onChange={e => setWhNote(e.target.value)}
              placeholder="Ghi chú cho KTV..."
              rows={2}
              style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 9, border: "1.5px solid #e5e7eb", fontSize: 13, outline: "none", resize: "none", fontFamily: "inherit" }}
            />
          </div>

          {/* Action button */}
          <button
            onClick={handleConfirmExport}
            disabled={confirming}
            style={{
              width: "100%", height: 48, borderRadius: 12, border: "none",
              background: confirming ? "#9ca3af" : "#059669",
              color: "#fff", fontWeight: 800, fontSize: 15, cursor: confirming ? "wait" : "pointer",
            }}
          >
            {confirming ? "⏳ Đang xử lý..." : "📤 Xác nhận xuất kho"}
          </button>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────
//  BORROW CARD (Cần trả)
// ────────────────────────────────────────────────────────
function BorrowCard({ req, warehouseId, warehouseName, currentUser, onRefresh }) {
  const [confirming, setConfirming] = useState(false);
  const [returnNote, setReturnNote] = useState("");
  const [showForm, setShowForm]     = useState(false);
  const items = parseItems(req.items);
  const overReturnDue = isOverdue(req.return_due_date);

  async function handleReturn() {
    if (confirming) return;
    setConfirming(true);
    try {
      const now = new Date().toISOString();
      for (const item of items) {
        const qty = Number(item.qty || 1);
        const { before, after } = await reduceLedger(warehouseId, item, +qty); // cộng lại
        await createMovement({
          type: "return",
          warehouseId, warehouseName, item,
          before, after,
          refId: req.id, refCode: req.request_code,
          userId: currentUser?.id, userName: currentUser?.name || currentUser?.full_name,
        });
      }
      await StockExportRequest.update(req.id, {
        status:               "returned",
        return_confirmed_by:  currentUser?.id || "",
        return_confirmed_at:  now,
        return_note:          returnNote.trim(),
      });
      onRefresh();
    } catch (e) {
      alert("Lỗi xác nhận: " + e.message);
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div style={{
      background: "#fff", borderRadius: 16,
      border: `1.5px solid ${overReturnDue ? "#fca5a5" : "#fde68a"}`,
      overflow: "hidden",
    }}>
      <div onClick={() => setShowForm(f => !f)} style={{ padding: "12px 14px", cursor: "pointer" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 13, color: "#111827", fontFamily: "monospace" }}>{req.request_code}</div>
            <div style={{ fontSize: 12, color: "#374151", marginTop: 2 }}>📋 Đơn: <strong>{req.order_code}</strong></div>
            <div style={{ fontSize: 12, color: overReturnDue ? "#dc2626" : "#d97706", marginTop: 2, fontWeight: overReturnDue ? 700 : 500 }}>
              {overReturnDue ? "⏰ Quá hạn trả!" : "📅 Hạn trả:"} {fmtDate(req.return_due_date)}
            </div>
          </div>
          <span style={{ fontSize: 11, color: "#9ca3af" }}>{showForm ? "▲" : "▼"}</span>
        </div>
        <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
          {items.slice(0, 3).map((it, i) => (
            <span key={i} style={{ fontSize: 11, background: "#fef3c7", color: "#d97706", padding: "2px 8px", borderRadius: 20 }}>
              {it.part_name || it.name} ×{it.qty || 1}
            </span>
          ))}
        </div>
      </div>

      {showForm && (
        <div style={{ padding: "0 14px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 2 }}>📝 Ghi chú hoàn trả:</div>
          <textarea
            value={returnNote}
            onChange={e => setReturnNote(e.target.value)}
            placeholder="Tình trạng LK trả lại..."
            rows={2}
            style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 9, border: "1.5px solid #e5e7eb", fontSize: 13, outline: "none", resize: "none", fontFamily: "inherit" }}
          />
          <button
            onClick={handleReturn}
            disabled={confirming}
            style={{
              width: "100%", height: 46, borderRadius: 12, border: "none",
              background: confirming ? "#9ca3af" : "#d97706",
              color: "#fff", fontWeight: 800, fontSize: 14, cursor: confirming ? "wait" : "pointer",
            }}
          >
            {confirming ? "⏳..." : "🔄 Xác nhận nhận lại LK"}
          </button>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────
//  HISTORY CARD (Đã xuất)
// ────────────────────────────────────────────────────────
function HistoryCard({ req }) {
  const items  = parseItems(req.items);
  const STATUS = {
    warehouse_confirmed: { label: "Đã xuất",     bg: "#f0fdf4", color: "#059669", icon: "✅" },
    ktv_confirmed:       { label: "KTV đã nhận", bg: LIGHT,     color: PRIMARY,   icon: "🔧" },
    returned:            { label: "Đã hoàn trả", bg: "#f3f4f6", color: "#374151", icon: "🔄" },
  };
  const cfg = STATUS[req.status] || STATUS.warehouse_confirmed;

  return (
    <div style={{ background: "#fff", borderRadius: 14, padding: "12px 14px", border: "1px solid #f3f4f6" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
        <div>
          <span style={{ fontWeight: 700, fontSize: 13, color: "#111827", fontFamily: "monospace" }}>{req.request_code}</span>
          <span style={{ marginLeft: 8, fontSize: 11, background: cfg.bg, color: cfg.color, padding: "2px 8px", borderRadius: 20, fontWeight: 700 }}>
            {cfg.icon} {cfg.label}
          </span>
        </div>
        <span style={{
          fontSize: 10, padding: "2px 7px", borderRadius: 20, fontWeight: 700,
          background: req.export_type === "borrow" ? "#fef3c7" : LIGHT,
          color: req.export_type === "borrow" ? "#d97706" : PRIMARY,
        }}>{req.export_type === "borrow" ? "Mượn" : "Sửa"}</span>
      </div>
      <div style={{ fontSize: 12, color: "#374151", marginBottom: 4 }}>📋 Đơn: <strong>{req.order_code || "—"}</strong></div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 6 }}>
        {items.map((it, i) => (
          <span key={i} style={{ fontSize: 11, background: "#f3f4f6", color: "#374151", padding: "2px 7px", borderRadius: 20 }}>
            {it.part_name || it.name} ×{it.qty || 1}
          </span>
        ))}
      </div>
      <div style={{ fontSize: 11, color: "#9ca3af" }}>
        ✅ {req.warehouse_confirmed_by_name || "—"} · {fmtDT(req.warehouse_confirmed_at)}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
//  MAIN EXPORT
// ════════════════════════════════════════════════════════
const TABS = [
  { key: "pending",  label: "Chờ xử lý", icon: "⏳" },
  { key: "exported", label: "Đã xuất",   icon: "✅" },
  { key: "borrow",   label: "Cần trả",   icon: "🔄" },
];

export function StockExportPage({ currentUser, warehouseId, warehouseName }) {
  const [tab, setTab]         = useState("pending");
  const [requests, setReqs]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterDate, setFilterDate] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const all = await StockExportRequest.list({ limit: 300 });
      // Filter theo warehouse_ids của user (rỗng = thấy tất cả)
      const ids = currentUser?.warehouse_ids || [];
      const filtered = ids.length > 0
        ? all.filter(r => !r.warehouse_id || ids.includes(r.warehouse_id))
        : all;
      setReqs(filtered);
    } catch { setReqs([]); }
    setLoading(false);
  }, [currentUser]);

  useEffect(() => { load(); }, [load]);

  // ── Segment theo tab ──────────────────────────────────
  const pending = useMemo(
    () => requests.filter(r => r.status === "pending")
      .sort((a, b) => new Date(a.due_datetime || 0) - new Date(b.due_datetime || 0)),
    [requests]
  );

  const exported = useMemo(() => {
    let list = requests.filter(r => ["warehouse_confirmed","ktv_confirmed","returned"].includes(r.status));
    if (filterDate) list = list.filter(r => (r.warehouse_confirmed_at || "").startsWith(filterDate));
    return list.sort((a, b) => new Date(b.warehouse_confirmed_at || 0) - new Date(a.warehouse_confirmed_at || 0));
  }, [requests, filterDate]);

  const needReturn = useMemo(
    () => requests.filter(r => r.export_type === "borrow" && r.status !== "returned")
      .filter(r => r.status === "warehouse_confirmed" || r.status === "ktv_confirmed")
      .sort((a, b) => new Date(a.return_due_date || 0) - new Date(b.return_due_date || 0)),
    [requests]
  );

  // Badge counts
  const pendingCount    = pending.length;
  const needReturnCount = needReturn.filter(r => isOverdue(r.return_due_date)).length;

  // ── Render list ───────────────────────────────────────
  function renderContent() {
    if (loading) {
      return (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, flexDirection: "column", gap: 10 }}>
          <div style={{ width: 32, height: 32, border: `3px solid ${LIGHT}`, borderTop: `3px solid ${PRIMARY}`, borderRadius: "50%", animation: "spin .8s linear infinite" }} />
          <div style={{ color: "#9ca3af", fontSize: 13 }}>Đang tải...</div>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      );
    }

    if (tab === "pending") {
      return pending.length === 0 ? (
        <EmptyState icon="🎉" msg="Không có phiếu nào đang chờ!" />
      ) : (
        pending.map(r => (
          <PendingCard
            key={r.id} req={r}
            warehouseId={warehouseId} warehouseName={warehouseName}
            currentUser={currentUser} onRefresh={load}
          />
        ))
      );
    }

    if (tab === "exported") {
      return (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 12, color: "#6b7280" }}>Lọc ngày:</span>
            <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)}
              style={{ border: "1.5px solid #e5e7eb", borderRadius: 9, padding: "5px 8px", fontSize: 12, outline: "none" }}
            />
            {filterDate && <button onClick={() => setFilterDate("")} style={{ background: "none", border: "none", color: "#9ca3af", cursor: "pointer", fontSize: 13 }}>✕</button>}
          </div>
          {exported.length === 0
            ? <EmptyState icon="📭" msg="Chưa có lịch sử xuất kho" />
            : exported.map(r => <HistoryCard key={r.id} req={r} />)
          }
        </>
      );
    }

    if (tab === "borrow") {
      return needReturn.length === 0
        ? <EmptyState icon="✅" msg="Không có linh kiện mượn nào cần trả!" />
        : needReturn.map(r => (
            <BorrowCard
              key={r.id} req={r}
              warehouseId={warehouseId} warehouseName={warehouseName}
              currentUser={currentUser} onRefresh={load}
            />
          ));
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#f8fafc" }}>

      {/* Tab selector */}
      <div style={{ background: "#fff", borderBottom: "1px solid #f3f4f6", display: "flex", flexShrink: 0 }}>
        {TABS.map(t => {
          const active = tab === t.key;
          const badge  = t.key === "pending" ? pendingCount : t.key === "borrow" ? needReturnCount : 0;
          return (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              flex: 1, padding: "11px 6px",
              border: "none", background: "none", cursor: "pointer",
              borderBottom: `3px solid ${active ? PRIMARY : "transparent"}`,
              display: "flex", flexDirection: "column", alignItems: "center", gap: 2, position: "relative",
            }}>
              <span style={{ fontSize: 16 }}>{t.icon}</span>
              <span style={{ fontSize: 11, fontWeight: active ? 700 : 500, color: active ? PRIMARY : "#9ca3af" }}>
                {t.label}
              </span>
              {badge > 0 && (
                <span style={{
                  position: "absolute", top: 6, right: "calc(50% - 18px)",
                  background: "#dc2626", color: "#fff", borderRadius: "50%",
                  width: 16, height: 16, fontSize: 9, fontWeight: 800,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>{badge > 9 ? "9+" : badge}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* List area */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        {renderContent()}
      </div>
    </div>
  );
}

function EmptyState({ icon, msg }) {
  return (
    <div style={{ textAlign: "center", padding: 40, color: "#9ca3af" }}>
      <div style={{ fontSize: 40, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontSize: 14 }}>{msg}</div>
    </div>
  );
}
