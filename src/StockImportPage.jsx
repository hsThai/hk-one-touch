/* StockImportPage.jsx — Nhập kho từ nhà cung cấp */
import React, { useState, useEffect, useRef, useMemo } from "react";
import { StockImport, StockImportItem, StockLedger, StockMovement, SparePart } from "./pb.js";

const PRIMARY = "#3730a3";
const LIGHT   = "#ede9fe";

// ── Helpers ──────────────────────────────────────────────
function fmtMoney(n) {
  if (!n && n !== 0) return "—";
  return Number(n).toLocaleString("vi-VN") + "đ";
}
function genImportCode() {
  const now = new Date();
  const yy  = String(now.getFullYear()).slice(2);
  const mm  = String(now.getMonth() + 1).padStart(2, "0");
  const dd  = String(now.getDate()).padStart(2, "0");
  const rnd = Math.floor(Math.random() * 9000 + 1000);
  return `NK-${yy}${mm}${dd}-${rnd}`;
}
function genMoveCode() {
  return "MV-" + Date.now().toString(36).toUpperCase();
}

const IMPORT_TYPES = ["Mua mới", "Đổi trả", "Hoàn LK"];
const CONDITIONS   = ["new", "used"];
const COND_LABEL   = { new: "Mới", used: "Đã dùng" };

// ── Upsert StockLedger ────────────────────────────────────
async function upsertLedger(warehouseId, warehouseName, item) {
  try {
    // Tìm ledger hiện tại
    const existing = await StockLedger.filter({
      warehouse_id: warehouseId,
      part_id: item.part_id || "",
      sku: item.sku || "",
    });
    const qty = Number(item.qty) || 0;
    if (existing.length > 0) {
      const old = existing[0];
      const newQty = Number(old.qty_on_hand || 0) + qty;
      await StockLedger.update(old.id, {
        qty_on_hand:   newQty,
        qty_available: newQty - Number(old.qty_reserved || 0),
        cost_price:    item.unit_price || old.cost_price,
        last_movement_at: new Date().toISOString(),
      });
    } else {
      await StockLedger.create({
        warehouse_id:   warehouseId,
        warehouse_name: warehouseName,
        part_id:        item.part_id || "",
        part_name:      item.name,
        sku:            item.sku || "",
        category:       item.category || "",
        unit:           item.unit || "",
        qty_on_hand:    qty,
        qty_reserved:   0,
        qty_available:  qty,
        min_qty:        0,
        cost_price:     item.unit_price || 0,
        last_movement_at: new Date().toISOString(),
      });
    }
  } catch (e) {
    console.warn("upsertLedger err:", e.message);
  }
}

// ── Update spare_parts.stock_qty ──────────────────────────
async function updateSparePartQty(partId, deltaQty) {
  if (!partId) return;
  try {
    const part = await SparePart.get(partId);
    await SparePart.update(partId, { stock_qty: Number(part.stock_qty || 0) + deltaQty });
  } catch {}
}

// ════════════════════════════════════════════════════════
//  FORM TẠO PHIẾU NHẬP
// ════════════════════════════════════════════════════════
function ImportForm({ currentUser, warehouseId, warehouseName, onSaved, onCancel }) {
  const [importCode]         = useState(genImportCode);
  const [importType, setImportType] = useState("Mua mới");
  const [supplier, setSupplier]     = useState("");
  const [supplierPhone, setSupplierPhone] = useState("");
  const [note, setNote]             = useState("");
  const [items, setItems]           = useState([]);        // [{...}]
  const [saving, setSaving]         = useState(false);

  // Search spare parts
  const [searchQ, setSearchQ]       = useState("");
  const [searchRes, setSearchRes]   = useState([]);
  const [searching, setSearching]   = useState(false);
  const searchTimer                 = useRef(null);

  // ── Search spare_parts ──────────────────────────────
  useEffect(() => {
    clearTimeout(searchTimer.current);
    if (!searchQ.trim()) { setSearchRes([]); return; }
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const q = searchQ.toLowerCase();
        const all = await SparePart.list({ limit: 300, filter: "is_active=true" });
        const res = all.filter(p =>
          (p.name || "").toLowerCase().includes(q) ||
          (p.sku  || "").toLowerCase().includes(q)
        ).slice(0, 8);
        setSearchRes(res);
      } catch { setSearchRes([]); }
      setSearching(false);
    }, 350);
  }, [searchQ]);

  // ── Thêm linh kiện từ search ─────────────────────────
  function addFromSearch(part) {
    setItems(prev => [
      ...prev,
      {
        _id:       Math.random().toString(36).slice(2),
        part_id:   part.id,
        name:      part.name,
        sku:       part.sku || "",
        category:  part.category || "",
        unit:      part.unit || "",
        qty:       1,
        unit_price: part.price || 0,
        total_price: part.price || 0,
        condition: "new",
        note:      "",
      },
    ]);
    setSearchQ("");
    setSearchRes([]);
  }

  // ── Thêm dòng tay ────────────────────────────────────
  function addManual() {
    setItems(prev => [
      ...prev,
      { _id: Math.random().toString(36).slice(2), part_id: "", name: "", sku: "", category: "", unit: "", qty: 1, unit_price: 0, total_price: 0, condition: "new", note: "" },
    ]);
  }

  // ── Sửa item ─────────────────────────────────────────
  function updateItem(id, field, val) {
    setItems(prev => prev.map(i => {
      if (i._id !== id) return i;
      const updated = { ...i, [field]: val };
      if (field === "qty" || field === "unit_price") {
        updated.total_price = Number(updated.qty || 0) * Number(updated.unit_price || 0);
      }
      return updated;
    }));
  }

  function removeItem(id) {
    setItems(prev => prev.filter(i => i._id !== id));
  }

  // ── Tổng ─────────────────────────────────────────────
  const totalValue = useMemo(
    () => items.reduce((s, i) => s + Number(i.total_price || 0), 0),
    [items]
  );

  // ── Lưu ──────────────────────────────────────────────
  async function handleSave(status) {
    if (!supplier.trim()) { alert("Vui lòng nhập tên nhà cung cấp!"); return; }
    if (items.length === 0) { alert("Chưa có linh kiện nào!"); return; }
    if (items.some(i => !i.name.trim())) { alert("Có linh kiện chưa nhập tên!"); return; }

    setSaving(true);
    try {
      const now = new Date().toISOString();

      // 1. Tạo stock_import
      const importRec = await StockImport.create({
        import_code:        importCode,
        import_type:        importType,
        supplier_name:      supplier.trim(),
        supplier_phone:     supplierPhone.trim(),
        total_items:        items.length,
        total_value:        totalValue,
        status,
        note:               note.trim(),
        created_by:         currentUser?.id || "",
        created_by_name:    currentUser?.name || currentUser?.full_name || "",
        ...(status === "confirmed" ? {
          confirmed_by:      currentUser?.id || "",
          confirmed_by_name: currentUser?.name || currentUser?.full_name || "",
          confirmed_at:      now,
        } : {}),
      });

      // 2. Tạo stock_import_items
      for (const item of items) {
        await StockImportItem.create({
          import_id:   importRec.id,
          import_code: importCode,
          name:        item.name,
          sku:         item.sku,
          qty:         Number(item.qty),
          unit_price:  Number(item.unit_price),
          total_price: Number(item.total_price),
          condition:   item.condition,
          note:        item.note,
        });

        // 3. Nếu confirmed → cập nhật kho
        if (status === "confirmed") {
          // Upsert ledger
          await upsertLedger(warehouseId, warehouseName, item);

          // Tạo movement
          // Lấy qty_before từ ledger (đã upsert nên lấy lại)
          let qtyBefore = 0;
          try {
            const led = await StockLedger.filter({ warehouse_id: warehouseId, sku: item.sku });
            qtyBefore = Math.max(0, Number(led[0]?.qty_on_hand || 0) - Number(item.qty));
          } catch {}

          await StockMovement.create({
            movement_code:    genMoveCode(),
            movement_type:    "import",
            warehouse_id:     warehouseId,
            warehouse_name:   warehouseName,
            part_id:          item.part_id || "",
            part_name:        item.name,
            sku:              item.sku,
            qty_before:       qtyBefore,
            qty_change:       Number(item.qty),
            qty_after:        qtyBefore + Number(item.qty),
            unit_price:       Number(item.unit_price),
            ref_type:         "stock_import",
            ref_id:           importRec.id,
            ref_code:         importCode,
            note:             `Nhập kho: ${importType}`,
            created_by_id:    currentUser?.id || "",
            created_by_name:  currentUser?.name || currentUser?.full_name || "",
          });

          // Cập nhật spare_parts.stock_qty
          await updateSparePartQty(item.part_id, Number(item.qty));
        }
      }

      onSaved(status);
    } catch (e) {
      alert("Lỗi lưu phiếu: " + e.message);
    } finally {
      setSaving(false);
    }
  }

  // ── Render ────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#f8fafc" }}>
      {/* Subheader */}
      <div style={{ background: "#fff", padding: "12px 16px", borderBottom: "1px solid #f3f4f6", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <button onClick={onCancel} style={{ background: LIGHT, border: "none", color: PRIMARY, width: 34, height: 34, borderRadius: "50%", fontSize: 16, cursor: "pointer", fontWeight: 700 }}>←</button>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15, color: "#111827" }}>📥 Tạo phiếu nhập kho</div>
          <div style={{ fontSize: 11, color: "#9ca3af", fontFamily: "monospace" }}>{importCode}</div>
        </div>
      </div>

      {/* Scroll body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 14 }}>

        {/* Thông tin nhà cung cấp */}
        <Section title="🏪 Nhà cung cấp">
          <Label>Tên nhà cung cấp *</Label>
          <Input placeholder="Nhập tên NCC..." value={supplier} onChange={e => setSupplier(e.target.value)} />

          <Label style={{ marginTop: 8 }}>Số điện thoại</Label>
          <Input placeholder="0xxx..." type="tel" value={supplierPhone} onChange={e => setSupplierPhone(e.target.value)} />

          <Label style={{ marginTop: 8 }}>Loại nhập kho</Label>
          <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
            {IMPORT_TYPES.map(t => (
              <button key={t} onClick={() => setImportType(t)} style={{
                flex: 1, padding: "9px 6px", borderRadius: 10,
                border: `2px solid ${importType === t ? PRIMARY : "#e5e7eb"}`,
                background: importType === t ? LIGHT : "#fff",
                color: importType === t ? PRIMARY : "#374151",
                fontWeight: importType === t ? 700 : 500,
                fontSize: 12, cursor: "pointer",
              }}>{t}</button>
            ))}
          </div>
        </Section>

        {/* Tìm & thêm linh kiện */}
        <Section title="⚙️ Linh kiện nhập">
          {/* Search box */}
          <div style={{ position: "relative", marginBottom: 8 }}>
            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 15, color: "#9ca3af" }}>🔍</span>
            <input
              type="text"
              placeholder="Tìm linh kiện theo tên, SKU..."
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
              style={{ width: "100%", boxSizing: "border-box", padding: "9px 10px 9px 34px", borderRadius: 10, border: "1.5px solid #e5e7eb", fontSize: 13, outline: "none", background: "#f9fafb" }}
            />
          </div>

          {/* Search results dropdown */}
          {(searching || searchRes.length > 0) && (
            <div style={{ background: "#fff", border: "1.5px solid #e5e7eb", borderRadius: 12, overflow: "hidden", marginBottom: 8, boxShadow: "0 4px 16px rgba(0,0,0,.08)" }}>
              {searching && <div style={{ padding: "10px 14px", color: "#9ca3af", fontSize: 13 }}>⏳ Đang tìm...</div>}
              {searchRes.map(p => (
                <button key={p.id} onClick={() => addFromSearch(p)} style={{
                  width: "100%", textAlign: "left", padding: "10px 14px",
                  background: "#fff", border: "none", borderBottom: "1px solid #f3f4f6",
                  cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center",
                }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: "#111827" }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: "#9ca3af" }}>{p.sku} · {p.category}</div>
                  </div>
                  <div style={{ fontSize: 12, color: PRIMARY, fontWeight: 700 }}>{fmtMoney(p.price)}</div>
                </button>
              ))}
            </div>
          )}

          {/* Item rows */}
          {items.length === 0 ? (
            <div style={{ textAlign: "center", padding: "20px 0", color: "#d1d5db", fontSize: 13 }}>
              Chưa có linh kiện — tìm hoặc thêm tay bên dưới
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 8 }}>
              {items.map((item, idx) => (
                <ItemRow key={item._id} item={item} idx={idx} onChange={updateItem} onRemove={removeItem} />
              ))}
            </div>
          )}

          {/* Nút thêm tay */}
          <button onClick={addManual} style={{
            width: "100%", padding: "10px", borderRadius: 10,
            border: `2px dashed #c4b5fd`, background: LIGHT,
            color: PRIMARY, fontWeight: 700, fontSize: 13, cursor: "pointer",
          }}>
            + Thêm thủ công
          </button>

          {/* Tổng tiền */}
          {items.length > 0 && (
            <div style={{ marginTop: 12, background: "#f0f4ff", borderRadius: 12, padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, color: "#6b7280" }}>Tổng cộng ({items.length} mặt hàng)</span>
              <span style={{ fontWeight: 800, fontSize: 17, color: PRIMARY }}>{fmtMoney(totalValue)}</span>
            </div>
          )}
        </Section>

        {/* Ghi chú */}
        <Section title="📝 Ghi chú">
          <textarea
            placeholder="Ghi chú thêm (nếu có)..."
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={3}
            style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 10, border: "1.5px solid #e5e7eb", fontSize: 13, outline: "none", resize: "vertical", fontFamily: "inherit" }}
          />
        </Section>
      </div>

      {/* Footer buttons */}
      <div style={{ padding: "12px 16px 20px", display: "flex", gap: 10, borderTop: "1px solid #f3f4f6", background: "#fff", flexShrink: 0 }}>
        <button
          onClick={() => handleSave("draft")}
          disabled={saving}
          style={{ flex: 1, height: 50, borderRadius: 14, border: `2px solid ${PRIMARY}`, background: "#fff", color: PRIMARY, fontWeight: 700, fontSize: 14, cursor: saving ? "wait" : "pointer", opacity: saving ? .7 : 1 }}
        >
          💾 Lưu nháp
        </button>
        <button
          onClick={() => handleSave("confirmed")}
          disabled={saving}
          style={{ flex: 2, height: 50, borderRadius: 14, border: "none", background: PRIMARY, color: "#fff", fontWeight: 800, fontSize: 15, cursor: saving ? "wait" : "pointer", opacity: saving ? .7 : 1 }}
        >
          {saving ? "⏳ Đang lưu..." : "✅ Xác nhận nhập kho"}
        </button>
      </div>
    </div>
  );
}

// ── Item row trong bảng ───────────────────────────────────
function ItemRow({ item, idx, onChange, onRemove }) {
  return (
    <div style={{ background: "#f9fafb", borderRadius: 12, padding: 12, border: "1px solid #e5e7eb" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: PRIMARY }}>#{idx + 1}</span>
        <button onClick={() => onRemove(item._id)} style={{ background: "#fef2f2", border: "none", color: "#dc2626", borderRadius: 6, padding: "3px 8px", fontSize: 12, cursor: "pointer", fontWeight: 700 }}>✕</button>
      </div>

      <Label>Tên linh kiện *</Label>
      <Input value={item.name} onChange={e => onChange(item._id, "name", e.target.value)} placeholder="Tên linh kiện..." />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
        <div>
          <Label>SKU</Label>
          <Input value={item.sku} onChange={e => onChange(item._id, "sku", e.target.value)} placeholder="SKU..." />
        </div>
        <div>
          <Label>Tình trạng</Label>
          <select
            value={item.condition}
            onChange={e => onChange(item._id, "condition", e.target.value)}
            style={{ width: "100%", padding: "9px 10px", borderRadius: 9, border: "1.5px solid #e5e7eb", fontSize: 13, background: "#fff", outline: "none" }}
          >
            {CONDITIONS.map(c => <option key={c} value={c}>{COND_LABEL[c]}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
        <div>
          <Label>Số lượng</Label>
          <Input type="number" min="1" value={item.qty} onChange={e => onChange(item._id, "qty", e.target.value)} />
        </div>
        <div>
          <Label>Đơn giá (đ)</Label>
          <Input type="number" min="0" value={item.unit_price} onChange={e => onChange(item._id, "unit_price", e.target.value)} />
        </div>
      </div>

      {item.qty > 0 && item.unit_price > 0 && (
        <div style={{ marginTop: 6, textAlign: "right", fontSize: 13, color: PRIMARY, fontWeight: 700 }}>
          = {fmtMoney(item.total_price)}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════
//  DANH SÁCH PHIẾU NHẬP
// ════════════════════════════════════════════════════════
const STATUS_CFG = {
  draft:     { label: "Nháp",    bg: "#f3f4f6", color: "#374151", icon: "📋" },
  confirmed: { label: "Đã nhập", bg: "#f0fdf4", color: "#059669", icon: "✅" },
};

function ImportList({ onNew, onView }) {
  const [imports, setImports]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [filterStatus, setFilter] = useState("all");
  const [filterDate, setFilterDate] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const all = await StockImport.list({ sort: "-created", limit: 200 });
      setImports(all);
    } catch { setImports([]); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    return imports.filter(i => {
      const matchStatus = filterStatus === "all" || i.status === filterStatus;
      const matchDate = !filterDate || (i.created || "").startsWith(filterDate);
      return matchStatus && matchDate;
    });
  }, [imports, filterStatus, filterDate]);

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200 }}>
      <div style={{ color: "#9ca3af" }}>⏳ Đang tải...</div>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#f8fafc" }}>
      {/* Filter bar */}
      <div style={{ background: "#fff", padding: "12px 16px", borderBottom: "1px solid #f3f4f6", flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center" }}>
          {["all", "draft", "confirmed"].map(s => (
            <button key={s} onClick={() => setFilter(s)} style={{
              padding: "5px 12px", borderRadius: 20,
              border: `1.5px solid ${filterStatus === s ? PRIMARY : "#e5e7eb"}`,
              background: filterStatus === s ? LIGHT : "#fff",
              color: filterStatus === s ? PRIMARY : "#374151",
              fontWeight: filterStatus === s ? 700 : 500,
              fontSize: 12, cursor: "pointer",
            }}>
              {s === "all" ? "Tất cả" : STATUS_CFG[s]?.label}
            </button>
          ))}
          <input
            type="date"
            value={filterDate}
            onChange={e => setFilterDate(e.target.value)}
            style={{ marginLeft: "auto", border: "1.5px solid #e5e7eb", borderRadius: 10, padding: "5px 8px", fontSize: 12, outline: "none" }}
          />
        </div>
        <div style={{ fontSize: 12, color: "#6b7280" }}>{filtered.length} phiếu nhập</div>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "#9ca3af" }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>📭</div>
            <div>Chưa có phiếu nhập nào</div>
            <button onClick={onNew} style={{ marginTop: 12, padding: "10px 24px", borderRadius: 12, background: PRIMARY, color: "#fff", border: "none", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
              + Tạo phiếu nhập
            </button>
          </div>
        ) : (
          filtered.map(imp => {
            const cfg = STATUS_CFG[imp.status] || STATUS_CFG.draft;
            return (
              <button key={imp.id} onClick={() => onView && onView(imp)} style={{
                background: "#fff", borderRadius: 14, padding: "13px 14px",
                border: "1.5px solid #f3f4f6", cursor: "pointer",
                textAlign: "left", width: "100%", display: "block",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontWeight: 800, fontSize: 14, color: "#111827", fontFamily: "monospace" }}>{imp.import_code}</span>
                  <span style={{ background: cfg.bg, color: cfg.color, fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20 }}>
                    {cfg.icon} {cfg.label}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: "#374151", marginBottom: 4 }}>
                  🏪 {imp.supplier_name || "—"}
                  {imp.import_type && <span style={{ marginLeft: 8, fontSize: 11, color: "#9ca3af" }}>· {imp.import_type}</span>}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#6b7280" }}>
                  <span>📦 {imp.total_items || 0} mặt hàng</span>
                  <span style={{ fontWeight: 700, color: PRIMARY }}>{fmtMoney(imp.total_value)}</span>
                </div>
                {imp.created_by_name && (
                  <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>👤 {imp.created_by_name}</div>
                )}
              </button>
            );
          })
        )}
      </div>

      {/* FAB */}
      <button
        onClick={onNew}
        style={{
          position: "absolute", bottom: 80, right: 20,
          width: 54, height: 54, borderRadius: "50%",
          background: PRIMARY, color: "#fff", border: "none",
          fontSize: 26, cursor: "pointer", boxShadow: "0 4px 16px rgba(55,48,163,.35)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 100,
        }}
      >+</button>
    </div>
  );
}

// ════════════════════════════════════════════════════════
//  MAIN EXPORT
// ════════════════════════════════════════════════════════
export function StockImportPage({ currentUser, warehouseId, warehouseName }) {
  // warehouse_ids filter đã xử lý ở WarehouseApp — nhận qua props
  const [view, setView] = useState("list"); // "list" | "form"

  function handleSaved(status) {
    const msg = status === "confirmed" ? "✅ Đã nhập kho thành công!" : "💾 Đã lưu nháp!";
    alert(msg);
    setView("list");
  }

  if (view === "form") {
    return (
      <ImportForm
        currentUser={currentUser}
        warehouseId={warehouseId}
        warehouseName={warehouseName}
        onSaved={handleSaved}
        onCancel={() => setView("list")}
      />
    );
  }

  return (
    <div style={{ position: "relative", height: "100%", overflow: "hidden" }}>
      <ImportList
        onNew={() => setView("form")}
        onView={imp => {
          // TODO: Chi tiết phiếu — phase 2
        }}
      />
    </div>
  );
}

// ── Shared mini components ────────────────────────────────
function Section({ title, children }) {
  return (
    <div style={{ background: "#fff", borderRadius: 16, padding: "14px 14px 16px", border: "1px solid #f3f4f6" }}>
      <div style={{ fontWeight: 700, color: PRIMARY, fontSize: 13, marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}
function Label({ children, style }) {
  return <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 3, ...style }}>{children}</div>;
}
function Input({ ...props }) {
  return (
    <input
      {...props}
      style={{ width: "100%", boxSizing: "border-box", padding: "9px 11px", borderRadius: 9, border: "1.5px solid #e5e7eb", fontSize: 13, outline: "none", background: "#fff", ...(props.style || {}) }}
    />
  );
}
