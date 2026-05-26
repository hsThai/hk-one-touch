/* StockTransferPage.jsx — Chuyển linh kiện giữa 2 kho */
import { useState, useEffect, useCallback } from "react";
import { StockTransfer, StockLedger, StockMovement, Warehouse, SparePart } from "./pb.js";

const PRIMARY = "#6366f1";
const LIGHT   = "#eef2ff";

// ── Gen mã phiếu CK-YYMMDD-XXXX ──────────────────────────
function genTransferCode() {
  const now = new Date();
  const yy  = String(now.getFullYear()).slice(2);
  const mm  = String(now.getMonth() + 1).padStart(2, "0");
  const dd  = String(now.getDate()).padStart(2, "0");
  const rnd = String(Math.floor(Math.random() * 9000) + 1000);
  return `CK-${yy}${mm}${dd}-${rnd}`;
}

const STATUS_MAP = {
  pending:   { label: "Chờ xác nhận", bg: "#fef9c3", color: "#92400e" },
  confirmed: { label: "Đã xác nhận",  bg: "#dcfce7", color: "#065f46" },
  cancelled: { label: "Đã huỷ",       bg: "#fee2e2", color: "#991b1b" },
};

// ════════════════════════════════════════════════════════
//  FORM TẠO PHIẾU CHUYỂN KHO
// ════════════════════════════════════════════════════════
function TransferForm({ currentUser, allWarehouses, onSaved, onCancel }) {
  const [fromWHId,   setFromWHId]   = useState("");
  const [fromWHName, setFromWHName] = useState("");
  const [toWHId,     setToWHId]     = useState("");
  const [toWHName,   setToWHName]   = useState("");
  const [note,       setNote]       = useState("");
  const [items,      setItems]      = useState([]); // [{part_id,part_name,sku,qty,unit_price,avail}]
  const [search,     setSearch]     = useState("");
  const [searchRes,  setSearchRes]  = useState([]);
  const [searching,  setSearching]  = useState(false);
  const [ledgers,    setLedgers]    = useState([]); // tồn kho kho nguồn
  const [saving,     setSaving]     = useState(false);
  const [err,        setErr]        = useState("");

  // Kho nguồn: filter theo warehouse_ids
  const currentIds    = currentUser?.warehouse_ids || [];
  const sourceWarehouses = currentIds.length > 0
    ? allWarehouses.filter(w => currentIds.includes(w.id))
    : allWarehouses;
  // Kho đích: tất cả, trừ kho nguồn
  const destWarehouses = allWarehouses.filter(w => w.id !== fromWHId);

  // Load ledger khi đổi kho nguồn
  useEffect(() => {
    if (!fromWHId) { setLedgers([]); return; }
    StockLedger.filter({ warehouse_id: fromWHId })
      .then(setLedgers)
      .catch(() => setLedgers([]));
    setItems([]);
  }, [fromWHId]);

  // Tìm linh kiện
  useEffect(() => {
    if (!search.trim() || !fromWHId) { setSearchRes([]); return; }
    const q = search.toLowerCase();
    const matched = ledgers.filter(
      l => l.qty_available > 0 &&
        (l.part_name?.toLowerCase().includes(q) || l.sku?.toLowerCase().includes(q))
    );
    setSearchRes(matched.slice(0, 20));
  }, [search, ledgers]);

  function addItem(led) {
    if (items.find(i => i.part_id === led.part_id)) {
      setErr("Linh kiện này đã có trong danh sách."); return;
    }
    setItems(prev => [...prev, {
      part_id:    led.part_id,
      part_name:  led.part_name,
      sku:        led.sku || "",
      qty:        1,
      unit_price: led.cost_price || 0,
      avail:      led.qty_available || 0,
    }]);
    setSearch(""); setSearchRes([]); setErr("");
  }

  function updateQty(idx, val) {
    const n = parseInt(val) || 0;
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, qty: n } : it));
  }

  function removeItem(idx) {
    setItems(prev => prev.filter((_, i) => i !== idx));
  }

  const totalValue = items.reduce((s, it) => s + it.qty * it.unit_price, 0);
  const hasOverQty = items.some(it => it.qty > it.avail);

  async function handleSave(doConfirm = false) {
    setErr("");
    if (!fromWHId) { setErr("Chọn kho nguồn."); return; }
    if (!toWHId)   { setErr("Chọn kho đích."); return; }
    if (fromWHId === toWHId) { setErr("Kho nguồn và kho đích không được trùng nhau."); return; }
    if (items.length === 0)  { setErr("Thêm ít nhất 1 linh kiện."); return; }
    if (hasOverQty)          { setErr("Có linh kiện vượt quá tồn kho khả dụng."); return; }

    setSaving(true);
    try {
      const code   = genTransferCode();
      const status = doConfirm ? "confirmed" : "pending";
      const payload = {
        transfer_code:      code,
        from_warehouse_id:   fromWHId,
        from_warehouse_name: fromWHName,
        to_warehouse_id:     toWHId,
        to_warehouse_name:   toWHName,
        items:               items.map(({ avail: _, ...rest }) => rest),
        status,
        total_items:         items.reduce((s, i) => s + i.qty, 0),
        total_value:         totalValue,
        note,
        requested_by_id:   currentUser?.id   || "",
        requested_by_name: currentUser?.full_name || "",
        ...(doConfirm ? {
          confirmed_by_id:   currentUser?.id   || "",
          confirmed_by_name: currentUser?.full_name || "",
          confirmed_at:      new Date().toISOString(),
        } : {}),
      };

      const rec = await StockTransfer.create(payload);

      if (doConfirm) {
        await applyTransfer(rec.id, items, fromWHId, fromWHName, toWHId, toWHName, code, currentUser);
      }

      onSaved(doConfirm ? "confirmed" : "pending", code);
    } catch (e) {
      setErr("Lỗi lưu phiếu: " + e.message);
    }
    setSaving(false);
  }

  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14, maxWidth: 640, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={onCancel}
          style={{ width: 36, height: 36, borderRadius: "50%", border: "none", background: "#f3f4f6", fontSize: 16, cursor: "pointer" }}>←</button>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16, color: "#1e1b4b" }}>🔀 Tạo phiếu chuyển kho</div>
          <div style={{ fontSize: 12, color: "#9ca3af" }}>Điền đầy đủ thông tin bên dưới</div>
        </div>
      </div>

      {/* Kho nguồn */}
      <div style={cardStyle}>
        <Label>📤 Kho nguồn <span style={{ color: "#ef4444" }}>*</span></Label>
        <select value={fromWHId} onChange={e => {
            const wh = allWarehouses.find(w => w.id === e.target.value);
            setFromWHId(e.target.value);
            setFromWHName(wh?.name || "");
          }}
          style={selectStyle}>
          <option value="">-- Chọn kho nguồn --</option>
          {sourceWarehouses.map(w => (
            <option key={w.id} value={w.id}>{w.name}{w.code ? ` (${w.code})` : ""}</option>
          ))}
        </select>
      </div>

      {/* Kho đích */}
      <div style={cardStyle}>
        <Label>📥 Kho đích <span style={{ color: "#ef4444" }}>*</span></Label>
        <select value={toWHId} onChange={e => {
            const wh = allWarehouses.find(w => w.id === e.target.value);
            setToWHId(e.target.value);
            setToWHName(wh?.name || "");
          }}
          style={selectStyle}
          disabled={!fromWHId}>
          <option value="">-- Chọn kho đích --</option>
          {destWarehouses.map(w => (
            <option key={w.id} value={w.id}>{w.name}{w.code ? ` (${w.code})` : ""}</option>
          ))}
        </select>
        {!fromWHId && <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 4 }}>Chọn kho nguồn trước</div>}
      </div>

      {/* Thêm linh kiện */}
      {fromWHId && toWHId && (
        <div style={cardStyle}>
          <Label>🔩 Linh kiện cần chuyển</Label>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="🔍 Tìm theo tên hoặc SKU..."
            style={inputStyle}
          />
          {searchRes.length > 0 && (
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden", marginTop: 6 }}>
              {searchRes.map(led => (
                <button key={led.part_id} onClick={() => addItem(led)}
                  style={{ width: "100%", textAlign: "left", padding: "9px 12px", background: "#fff", border: "none", borderBottom: "1px solid #f3f4f6", cursor: "pointer", fontSize: 13 }}>
                  <span style={{ fontWeight: 700 }}>{led.part_name}</span>
                  <span style={{ color: "#6b7280", marginLeft: 8 }}>{led.sku}</span>
                  <span style={{ float: "right", color: led.qty_available > 0 ? "#059669" : "#dc2626", fontWeight: 700 }}>
                    Tồn: {led.qty_available}
                  </span>
                </button>
              ))}
            </div>
          )}
          {search && searchRes.length === 0 && (
            <div style={{ textAlign: "center", padding: "10px 0", fontSize: 13, color: "#9ca3af" }}>Không tìm thấy linh kiện trong kho nguồn</div>
          )}

          {/* Danh sách đã thêm */}
          {items.length > 0 && (
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
              {items.map((it, idx) => (
                <div key={it.part_id} style={{ background: "#f8fafc", borderRadius: 10, padding: "10px 12px", border: it.qty > it.avail ? "1.5px solid #ef4444" : "1px solid #e5e7eb" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{it.part_name}</div>
                      <div style={{ fontSize: 11, color: "#9ca3af" }}>{it.sku} · Tồn: {it.avail}</div>
                      {it.qty > it.avail && (
                        <div style={{ fontSize: 11, color: "#ef4444", marginTop: 2 }}>⚠️ Vượt quá tồn kho!</div>
                      )}
                    </div>
                    <button onClick={() => removeItem(idx)}
                      style={{ background: "#fee2e2", color: "#dc2626", border: "none", borderRadius: 8, width: 28, height: 28, cursor: "pointer", fontSize: 14, flexShrink: 0 }}>✕</button>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
                    <Label style={{ margin: 0 }}>Số lượng:</Label>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <button onClick={() => updateQty(idx, Math.max(1, it.qty - 1))}
                        style={qtyBtnStyle}>−</button>
                      <input type="number" min="1" max={it.avail} value={it.qty}
                        onChange={e => updateQty(idx, e.target.value)}
                        style={{ width: 56, textAlign: "center", padding: "6px 0", borderRadius: 8, border: "1.5px solid #e5e7eb", fontSize: 14, fontWeight: 700 }} />
                      <button onClick={() => updateQty(idx, Math.min(it.avail, it.qty + 1))}
                        style={qtyBtnStyle}>＋</button>
                    </div>
                    {it.unit_price > 0 && (
                      <span style={{ marginLeft: "auto", fontSize: 12, color: "#6b7280" }}>
                        {(it.qty * it.unit_price).toLocaleString()}đ
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {/* Tổng */}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 16, padding: "8px 4px" }}>
                <span style={{ fontSize: 13, color: "#6b7280" }}>Tổng SL: <b>{items.reduce((s, i) => s + i.qty, 0)}</b> linh kiện</span>
                {totalValue > 0 && (
                  <span style={{ fontSize: 13, color: PRIMARY, fontWeight: 700 }}>
                    {totalValue.toLocaleString()}đ
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Ghi chú */}
      <div style={cardStyle}>
        <Label>📝 Ghi chú</Label>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Nhập ghi chú (không bắt buộc)..."
          rows={2}
          style={{ ...inputStyle, resize: "vertical" }}
        />
      </div>

      {/* Error */}
      {err && (
        <div style={{ background: "#fef2f2", color: "#dc2626", padding: "10px 14px", borderRadius: 10, fontSize: 13, fontWeight: 600 }}>
          ⚠️ {err}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={() => handleSave(false)} disabled={saving}
          style={{ flex: 1, height: 48, borderRadius: 14, border: "2px solid " + PRIMARY, background: "#fff", color: PRIMARY, fontWeight: 800, fontSize: 15, cursor: "pointer" }}>
          {saving ? "Đang lưu..." : "💾 Lưu nháp"}
        </button>
        <button onClick={() => handleSave(true)} disabled={saving || hasOverQty || items.length === 0}
          style={{ flex: 1, height: 48, borderRadius: 14, border: "none", background: (saving || hasOverQty || items.length === 0) ? "#9ca3af" : PRIMARY, color: "#fff", fontWeight: 800, fontSize: 15, cursor: saving ? "not-allowed" : "pointer" }}>
          {saving ? "Đang xử lý..." : "✅ Xác nhận chuyển"}
        </button>
      </div>
    </div>
  );
}

// ── Logic cập nhật tồn kho khi confirm ───────────────────
async function applyTransfer(transferId, items, fromWHId, fromWHName, toWHId, toWHName, code, currentUser) {
  for (const it of items) {
    // 1. Trừ kho nguồn
    const srcList = await StockLedger.filter({ warehouse_id: fromWHId, part_id: it.part_id });
    const src = srcList[0];
    if (src) {
      const newQty = Math.max(0, (src.qty_on_hand || 0) - it.qty);
      await StockLedger.update(src.id, {
        qty_on_hand:  newQty,
        qty_available: Math.max(0, (src.qty_available || 0) - it.qty),
        last_movement_at: new Date().toISOString(),
      });
    }

    // 2. Cộng kho đích
    const dstList = await StockLedger.filter({ warehouse_id: toWHId, part_id: it.part_id });
    const dst = dstList[0];
    if (dst) {
      const newQty = (dst.qty_on_hand || 0) + it.qty;
      await StockLedger.update(dst.id, {
        qty_on_hand:  newQty,
        qty_available: (dst.qty_available || 0) + it.qty,
        last_movement_at: new Date().toISOString(),
      });
    } else {
      // Tạo mới ledger ở kho đích
      await StockLedger.create({
        warehouse_id:   toWHId,
        warehouse_name: toWHName,
        part_id:        it.part_id,
        part_name:      it.part_name,
        sku:            it.sku || "",
        qty_on_hand:    it.qty,
        qty_reserved:   0,
        qty_available:  it.qty,
        cost_price:     it.unit_price || 0,
        last_movement_at: new Date().toISOString(),
      });
    }

    // 3. Stock movements
    await StockMovement.create({
      movement_code:  `SM-${Date.now()}-OUT`,
      movement_type:  "transfer_out",
      warehouse_id:   fromWHId,
      warehouse_name: fromWHName,
      part_id:        it.part_id,
      part_name:      it.part_name,
      sku:            it.sku || "",
      qty_before:     src?.qty_on_hand || 0,
      qty_change:     -it.qty,
      qty_after:      Math.max(0, (src?.qty_on_hand || 0) - it.qty),
      unit_price:     it.unit_price || 0,
      ref_type:       "stock_transfer",
      ref_id:         transferId,
      ref_code:       code,
      created_by_id:  currentUser?.id   || "",
      created_by_name: currentUser?.full_name || "",
    });

    await StockMovement.create({
      movement_code:  `SM-${Date.now()}-IN`,
      movement_type:  "transfer_in",
      warehouse_id:   toWHId,
      warehouse_name: toWHName,
      part_id:        it.part_id,
      part_name:      it.part_name,
      sku:            it.sku || "",
      qty_before:     dst?.qty_on_hand || 0,
      qty_change:     it.qty,
      qty_after:      (dst?.qty_on_hand || 0) + it.qty,
      unit_price:     it.unit_price || 0,
      ref_type:       "stock_transfer",
      ref_id:         transferId,
      ref_code:       code,
      created_by_id:  currentUser?.id   || "",
      created_by_name: currentUser?.full_name || "",
    });
  }
}

// ════════════════════════════════════════════════════════
//  DANH SÁCH PHIẾU CHUYỂN KHO
// ════════════════════════════════════════════════════════
function TransferList({ currentUser, allWarehouses, onNew, onView }) {
  const [list,      setList]      = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [filterSt,  setFilterSt]  = useState("all");
  const [filterDate,setFilterDate]= useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const all = await StockTransfer.list({ limit: 300, sort: "-created" });
      // filter theo warehouse_ids của user
      const ids = currentUser?.warehouse_ids || [];
      const filtered = ids.length > 0
        ? all.filter(t =>
            !t.from_warehouse_id ||
            ids.includes(t.from_warehouse_id) ||
            ids.includes(t.to_warehouse_id)
          )
        : all;
      setList(filtered);
    } catch { setList([]); }
    setLoading(false);
  }, [currentUser]);

  useEffect(() => { load(); }, [load]);

  const shown = list.filter(t => {
    const matchSt   = filterSt === "all" || t.status === filterSt;
    const matchDate = !filterDate || (t.created || "").startsWith(filterDate);
    return matchSt && matchDate;
  });

  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 17, color: "#1e1b4b" }}>🔀 Chuyển kho</div>
          <div style={{ fontSize: 12, color: "#9ca3af" }}>{list.length} phiếu</div>
        </div>
        <button onClick={onNew}
          style={{ height: 40, padding: "0 18px", background: PRIMARY, color: "#fff", border: "none", borderRadius: 12, fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
          ＋ Tạo phiếu
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <select value={filterSt} onChange={e => setFilterSt(e.target.value)}
          style={{ ...selectStyle, flex: "none", minWidth: 150 }}>
          <option value="all">Tất cả trạng thái</option>
          <option value="pending">Chờ xác nhận</option>
          <option value="confirmed">Đã xác nhận</option>
          <option value="cancelled">Đã huỷ</option>
        </select>
        <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)}
          style={{ ...inputStyle, flex: 1, minWidth: 140 }} />
      </div>

      {/* List */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "#9ca3af" }}>Đang tải...</div>
      ) : shown.length === 0 ? (
        <div style={{ textAlign: "center", padding: 48 }}>
          <div style={{ fontSize: 40 }}>🔀</div>
          <div style={{ color: "#9ca3af", marginTop: 8 }}>Chưa có phiếu chuyển kho nào</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {shown.map(t => {
            const st = STATUS_MAP[t.status] || STATUS_MAP.pending;
            const itemList = Array.isArray(t.items) ? t.items : (typeof t.items === "string" ? JSON.parse(t.items || "[]") : []);
            return (
              <div key={t.id} onClick={() => onView(t)}
                style={{ background: "#fff", borderRadius: 16, padding: 14, boxShadow: "0 2px 10px rgba(0,0,0,.06)", border: "1.5px solid #f3f4f6", cursor: "pointer" }}>
                {/* Top row */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ fontWeight: 800, fontSize: 15, color: "#1e1b4b" }}>{t.transfer_code}</div>
                  <span style={{ background: st.bg, color: st.color, fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 20 }}>{st.label}</span>
                </div>
                {/* Route */}
                <div style={{ fontSize: 13, color: "#374151", marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontWeight: 600 }}>{t.from_warehouse_name || "?"}</span>
                  <span style={{ color: "#9ca3af" }}>→</span>
                  <span style={{ fontWeight: 600 }}>{t.to_warehouse_name || "?"}</span>
                </div>
                {/* Meta */}
                <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 4, display: "flex", gap: 12 }}>
                  <span>📦 {t.total_items || itemList.length} linh kiện</span>
                  {t.total_value > 0 && <span>💰 {Number(t.total_value).toLocaleString()}đ</span>}
                  <span>👤 {t.requested_by_name}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════
//  MODAL CHI TIẾT PHIẾU
// ════════════════════════════════════════════════════════
function TransferDetailModal({ transfer, currentUser, onClose, onRefresh }) {
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const itemList = (() => {
    try {
      if (Array.isArray(transfer.items)) return transfer.items;
      return JSON.parse(transfer.items || "[]");
    } catch { return []; }
  })();

  const st = STATUS_MAP[transfer.status] || STATUS_MAP.pending;

  async function doConfirm() {
    setConfirming(true);
    try {
      await applyTransfer(
        transfer.id, itemList,
        transfer.from_warehouse_id, transfer.from_warehouse_name,
        transfer.to_warehouse_id,   transfer.to_warehouse_name,
        transfer.transfer_code, currentUser
      );
      await StockTransfer.update(transfer.id, {
        status:            "confirmed",
        confirmed_by_id:   currentUser?.id   || "",
        confirmed_by_name: currentUser?.full_name || "",
        confirmed_at:      new Date().toISOString(),
      });
      onRefresh();
      onClose();
    } catch (e) { alert("Lỗi: " + e.message); }
    setConfirming(false);
  }

  async function doCancel() {
    if (!confirm("Huỷ phiếu chuyển kho này?")) return;
    setCancelling(true);
    try {
      await StockTransfer.update(transfer.id, { status: "cancelled" });
      onRefresh();
      onClose();
    } catch (e) { alert("Lỗi: " + e.message); }
    setCancelling(false);
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 3000, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "#fff", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 560, maxHeight: "85vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Header */}
        <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid #f3f4f6" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: "#1e1b4b" }}>🔀 {transfer.transfer_code}</div>
            <button onClick={onClose} style={{ background: "#f3f4f6", border: "none", borderRadius: "50%", width: 32, height: 32, cursor: "pointer", fontSize: 16 }}>✕</button>
          </div>
          <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span style={{ background: st.bg, color: st.color, fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 20 }}>{st.label}</span>
            <span style={{ fontSize: 13, color: "#6b7280" }}>
              {transfer.from_warehouse_name} → {transfer.to_warehouse_name}
            </span>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "14px 20px" }}>
          <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 10 }}>
            👤 {transfer.requested_by_name}
            {transfer.confirmed_by_name && ` · ✅ ${transfer.confirmed_by_name}`}
          </div>

          {/* Items */}
          <div style={{ fontWeight: 700, fontSize: 13, color: "#374151", marginBottom: 8 }}>📦 Danh sách linh kiện:</div>
          {itemList.map((it, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #f3f4f6" }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{it.part_name}</div>
                <div style={{ fontSize: 11, color: "#9ca3af" }}>{it.sku}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>×{it.qty}</div>
                {it.unit_price > 0 && <div style={{ fontSize: 11, color: "#6b7280" }}>{(it.qty * it.unit_price).toLocaleString()}đ</div>}
              </div>
            </div>
          ))}

          {transfer.note && (
            <div style={{ marginTop: 12, padding: "10px 12px", background: "#f9fafb", borderRadius: 10, fontSize: 13, color: "#374151" }}>
              📝 {transfer.note}
            </div>
          )}
        </div>

        {/* Actions */}
        {transfer.status === "pending" && (
          <div style={{ padding: "12px 20px 20px", borderTop: "1px solid #f3f4f6", display: "flex", gap: 10 }}>
            <button onClick={doCancel} disabled={cancelling}
              style={{ flex: 1, height: 46, borderRadius: 12, border: "2px solid #dc2626", background: "#fff", color: "#dc2626", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
              {cancelling ? "..." : "❌ Huỷ phiếu"}
            </button>
            <button onClick={doConfirm} disabled={confirming}
              style={{ flex: 2, height: 46, borderRadius: 12, border: "none", background: confirming ? "#9ca3af" : PRIMARY, color: "#fff", fontWeight: 800, fontSize: 15, cursor: confirming ? "not-allowed" : "pointer" }}>
              {confirming ? "Đang xử lý..." : "✅ Xác nhận chuyển kho"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
//  MAIN EXPORT
// ════════════════════════════════════════════════════════
export function StockTransferPage({ currentUser, allWarehouses = [] }) {
  const [view,     setView]     = useState("list"); // "list" | "form"
  const [selected, setSelected] = useState(null);
  const [refresh,  setRefresh]  = useState(0);

  function handleSaved(status, code) {
    const msg = status === "confirmed"
      ? `✅ Đã xác nhận chuyển kho! Mã phiếu: ${code}`
      : `💾 Đã lưu nháp phiếu ${code}`;
    alert(msg);
    setView("list");
    setRefresh(r => r + 1);
  }

  if (view === "form") {
    return (
      <div style={{ height: "100%", overflowY: "auto" }}>
        <TransferForm
          currentUser={currentUser}
          allWarehouses={allWarehouses}
          onSaved={handleSaved}
          onCancel={() => setView("list")}
        />
      </div>
    );
  }

  return (
    <div style={{ height: "100%", overflowY: "auto", position: "relative" }}>
      <TransferList
        key={refresh}
        currentUser={currentUser}
        allWarehouses={allWarehouses}
        onNew={() => setView("form")}
        onView={t => setSelected(t)}
      />
      {selected && (
        <TransferDetailModal
          transfer={selected}
          currentUser={currentUser}
          onClose={() => setSelected(null)}
          onRefresh={() => setRefresh(r => r + 1)}
        />
      )}
    </div>
  );
}

// ── Shared styles ─────────────────────────────────────────
const cardStyle = {
  background: "#fff", borderRadius: 14, padding: "14px 14px 16px",
  border: "1px solid #f3f4f6", boxShadow: "0 1px 6px rgba(0,0,0,.04)",
};
const inputStyle = {
  width: "100%", boxSizing: "border-box",
  padding: "9px 12px", borderRadius: 10,
  border: "1.5px solid #e5e7eb", fontSize: 13, outline: "none", background: "#fff",
};
const selectStyle = {
  width: "100%", boxSizing: "border-box",
  padding: "9px 12px", borderRadius: 10,
  border: "1.5px solid #e5e7eb", fontSize: 13, background: "#fff", cursor: "pointer",
};
const qtyBtnStyle = {
  width: 32, height: 32, borderRadius: 8, border: "1.5px solid #e5e7eb",
  background: "#f9fafb", fontSize: 16, cursor: "pointer", fontWeight: 700,
  display: "flex", alignItems: "center", justifyContent: "center",
};
function Label({ children, style }) {
  return <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4, fontWeight: 600, ...style }}>{children}</div>;
}
