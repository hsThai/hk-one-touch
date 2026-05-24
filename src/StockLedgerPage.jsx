/* StockLedgerPage.jsx — Trang xem tồn kho */
import React, { useState, useEffect, useMemo } from "react";
import { StockLedger, SparePart } from "./pb.js";

const PRIMARY = "#3730a3";
const LIGHT   = "#ede9fe";

function fmtMoney(n) {
  if (!n && n !== 0) return "—";
  return Number(n).toLocaleString("vi-VN") + "đ";
}

function fmtNum(n) {
  if (n === undefined || n === null || n === "") return "—";
  return Number(n).toLocaleString("vi-VN");
}

export function StockLedgerPage({ warehouseId, warehouseName }) {
  const [ledgers, setLedgers]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [categories, setCategories] = useState([]);

  // ── Load dữ liệu ──────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    const fetchData = async () => {
      try {
        let items = [];
        if (warehouseId) {
          items = await StockLedger.filter({ warehouse_id: warehouseId });
        } else {
          items = await StockLedger.list({ limit: 500 });
        }
        setLedgers(items);

        // Lấy danh mục unique
        const cats = [...new Set(items.map(i => i.category).filter(Boolean))].sort();
        setCategories(cats);
      } catch {
        // Nếu stock_ledgers trống, thử load từ spare_parts
        try {
          const parts = await SparePart.list({ limit: 500, filter: "is_active=true" });
          // Map spare_parts → giả định như ledger để hiển thị
          const mapped = parts.map(p => ({
            id:            p.id,
            part_id:       p.id,
            part_name:     p.name,
            sku:           p.sku,
            category:      p.category,
            unit:          p.unit,
            qty_on_hand:   p.stock_qty || 0,
            qty_available: p.stock_qty || 0,
            qty_reserved:  0,
            min_qty:       0,
            cost_price:    p.price || 0,
            warehouse_name: warehouseName || "Tất cả kho",
            _from_spare_parts: true,
          }));
          setLedgers(mapped);
          const cats = [...new Set(mapped.map(i => i.category).filter(Boolean))].sort();
          setCategories(cats);
        } catch {}
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [warehouseId]);

  // ── Filter + Search ──────────────────────────────────
  const filtered = useMemo(() => {
    return ledgers.filter(item => {
      const matchCat = catFilter === "all" || item.category === catFilter;
      const q = search.toLowerCase();
      const matchSearch = !q
        || (item.part_name || "").toLowerCase().includes(q)
        || (item.sku || "").toLowerCase().includes(q);
      return matchCat && matchSearch;
    });
  }, [ledgers, search, catFilter]);

  // Số hàng sắp hết
  const lowStockCount = useMemo(
    () => ledgers.filter(i => Number(i.qty_available) < Number(i.min_qty || 0) && Number(i.min_qty) > 0).length,
    [ledgers]
  );

  // ── Render ────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 240, gap: 12 }}>
        <div style={{ width: 36, height: 36, border: `4px solid ${LIGHT}`, borderTop: `4px solid ${PRIMARY}`, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <div style={{ color: "#9ca3af", fontSize: 14 }}>Đang tải tồn kho...</div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#f8fafc" }}>

      {/* Thanh tìm kiếm + filter */}
      <div style={{ background: "#fff", padding: "12px 16px", borderBottom: "1px solid #f3f4f6", flexShrink: 0 }}>
        {/* Search */}
        <div style={{ position: "relative", marginBottom: 10 }}>
          <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 16, color: "#9ca3af" }}>🔍</span>
          <input
            type="text"
            placeholder="Tìm theo tên, SKU..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: "100%", boxSizing: "border-box",
              padding: "10px 12px 10px 38px",
              borderRadius: 12, border: "1.5px solid #e5e7eb",
              fontSize: 14, outline: "none",
              background: "#f9fafb",
            }}
          />
          {search && (
            <button onClick={() => setSearch("")} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "#9ca3af" }}>✕</button>
          )}
        </div>

        {/* Category chips */}
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
          {["all", ...categories].map(cat => (
            <button
              key={cat}
              onClick={() => setCatFilter(cat)}
              style={{
                flexShrink: 0,
                padding: "5px 12px", borderRadius: 20,
                border: `1.5px solid ${catFilter === cat ? PRIMARY : "#e5e7eb"}`,
                background: catFilter === cat ? LIGHT : "#fff",
                color: catFilter === cat ? PRIMARY : "#374151",
                fontWeight: catFilter === cat ? 700 : 500,
                fontSize: 12, cursor: "pointer", whiteSpace: "nowrap",
              }}
            >
              {cat === "all" ? "Tất cả" : cat}
            </button>
          ))}
        </div>

        {/* Summary bar */}
        <div style={{ display: "flex", gap: 12, marginTop: 10 }}>
          <StatChip label="Mặt hàng" value={ledgers.length} color={PRIMARY} />
          <StatChip label="Đang lọc" value={filtered.length} color="#0891b2" />
          {lowStockCount > 0 && (
            <StatChip label="⚠️ Sắp hết" value={lowStockCount} color="#dc2626" bg="#fef2f2" />
          )}
        </div>
      </div>

      {/* Danh sách */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "#9ca3af" }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>📦</div>
            <div>Không tìm thấy dữ liệu</div>
          </div>
        ) : (
          filtered.map(item => {
            const isLow = Number(item.min_qty) > 0 && Number(item.qty_available) < Number(item.min_qty);
            return (
              <div
                key={item.id}
                style={{
                  background: "#fff",
                  borderRadius: 14,
                  padding: "12px 14px",
                  border: `1.5px solid ${isLow ? "#fca5a5" : "#f3f4f6"}`,
                  boxShadow: isLow ? "0 0 0 1px #fca5a5" : "none",
                }}
              >
                {/* Dòng 1: Tên + badge sắp hết */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "#111827", flex: 1 }}>
                    {isLow && <span style={{ marginRight: 4 }}>🔴</span>}
                    {item.part_name || "—"}
                  </div>
                  {isLow && (
                    <span style={{ background: "#fef2f2", color: "#dc2626", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20, flexShrink: 0, marginLeft: 8 }}>
                      ⚠️ Sắp hết
                    </span>
                  )}
                </div>

                {/* Dòng 2: SKU + category */}
                <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
                  {item.sku && (
                    <span style={{ background: "#f3f4f6", color: "#374151", fontSize: 11, padding: "2px 8px", borderRadius: 20, fontFamily: "monospace" }}>
                      {item.sku}
                    </span>
                  )}
                  {item.category && (
                    <span style={{ background: LIGHT, color: PRIMARY, fontSize: 11, padding: "2px 8px", borderRadius: 20, fontWeight: 600 }}>
                      {item.category}
                    </span>
                  )}
                  {item.unit && (
                    <span style={{ background: "#f0fdf4", color: "#059669", fontSize: 11, padding: "2px 8px", borderRadius: 20 }}>
                      {item.unit}
                    </span>
                  )}
                </div>

                {/* Dòng 3: Số lượng */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                  <QtyBox label="Tồn thực" value={fmtNum(item.qty_on_hand)} color="#1e40af" bg="#eff6ff" />
                  <QtyBox
                    label="Khả dụng"
                    value={fmtNum(item.qty_available)}
                    color={isLow ? "#dc2626" : "#059669"}
                    bg={isLow ? "#fef2f2" : "#f0fdf4"}
                    bold
                  />
                  <QtyBox label="Dự trữ" value={fmtNum(item.qty_reserved)} color="#d97706" bg="#fffbeb" />
                </div>

                {/* Dòng 4: min_qty + cost_price */}
                {(item.min_qty > 0 || item.cost_price > 0) && (
                  <div style={{ display: "flex", gap: 12, marginTop: 8, paddingTop: 8, borderTop: "1px solid #f3f4f6", fontSize: 12, color: "#6b7280" }}>
                    {item.min_qty > 0 && <span>🔔 Tối thiểu: <strong>{fmtNum(item.min_qty)}</strong></span>}
                    {item.cost_price > 0 && <span>💰 Giá vốn: <strong>{fmtMoney(item.cost_price)}</strong></span>}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ── Mini components ───────────────────────────────────────
function QtyBox({ label, value, color, bg, bold }) {
  return (
    <div style={{ background: bg || "#f9fafb", borderRadius: 10, padding: "7px 8px", textAlign: "center" }}>
      <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: bold ? 800 : 700, color }}>{value}</div>
    </div>
  );
}

function StatChip({ label, value, color, bg }) {
  return (
    <div style={{ background: bg || "#f3f4f6", borderRadius: 10, padding: "5px 10px", display: "flex", alignItems: "center", gap: 5 }}>
      <span style={{ fontSize: 18, fontWeight: 800, color }}>{value}</span>
      <span style={{ fontSize: 11, color: "#6b7280" }}>{label}</span>
    </div>
  );
}
