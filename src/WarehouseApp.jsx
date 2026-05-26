/* WarehouseApp.jsx — App Kho (layout chính + bottom nav) */
import React, { useState, useEffect } from "react";
import { Warehouse } from "./pb.js";
import { StockLedgerPage } from "./StockLedgerPage.jsx";
import { StockImportPage } from "./StockImportPage.jsx";
import { StockExportPage } from "./StockExportPage.jsx";
import { StockTransferPage } from "./StockTransferPage.jsx";

const PRIMARY   = "#3730a3";
const LIGHT     = "#ede9fe";
const NAV_H     = 64;

// ── Tabs ──────────────────────────────────────────────────
const TABS = [
  { key: "stock",    icon: "📦", label: "Tồn kho" },
  { key: "import",   icon: "📥", label: "Nhập kho" },
  { key: "export",   icon: "📤", label: "Xuất kho" },
  { key: "transfer", icon: "🔀", label: "Chuyển kho" },
];

// ── Placeholder tab ───────────────────────────────────────
function ComingSoon({ icon, label }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 12, color: "#9ca3af" }}>
      <div style={{ fontSize: 52 }}>{icon}</div>
      <div style={{ fontWeight: 700, fontSize: 17, color: "#374151" }}>{label}</div>
      <div style={{ fontSize: 13, background: LIGHT, color: PRIMARY, padding: "6px 18px", borderRadius: 20, fontWeight: 600 }}>🚧 Đang phát triển</div>
    </div>
  );
}

// ── Warehouse Dropdown ────────────────────────────────────
function WarehouseDropdown({ warehouses, selectedId, onChange }) {
  const [open, setOpen] = useState(false);
  const selected = warehouses.find(w => w.id === selectedId);

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          background: "rgba(255,255,255,.18)", border: "1.5px solid rgba(255,255,255,.35)",
          color: "#fff", borderRadius: 10, padding: "5px 10px 5px 12px",
          fontSize: 13, fontWeight: 700, cursor: "pointer", maxWidth: 180,
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
          🏭 {selected?.name || "Tất cả kho"}
        </span>
        <span style={{ fontSize: 10, opacity: .8 }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", right: 0,
          background: "#fff", borderRadius: 14, boxShadow: "0 8px 32px rgba(0,0,0,.18)",
          minWidth: 200, zIndex: 9999, overflow: "hidden",
          border: "1px solid #e5e7eb",
        }}>
          {[{ id: "", name: "Tất cả kho", code: "" }, ...warehouses].map(w => (
            <button
              key={w.id}
              onClick={() => { onChange(w.id, w.name); setOpen(false); }}
              style={{
                width: "100%", textAlign: "left", padding: "11px 16px",
                background: selectedId === w.id ? LIGHT : "#fff",
                color: selectedId === w.id ? PRIMARY : "#111827",
                fontWeight: selectedId === w.id ? 700 : 400,
                border: "none", cursor: "pointer", fontSize: 14,
                borderBottom: "1px solid #f3f4f6",
              }}
            >
              {w.id ? `🏭 ${w.name}` : "🗂️ Tất cả kho"}
              {w.code && <span style={{ fontSize: 11, color: "#9ca3af", marginLeft: 6 }}>({w.code})</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────
export function WarehouseApp({ currentUser, onBack }) {
  const [tab, setTab]                   = useState("stock");
  const [warehouses, setWarehouses]     = useState([]);
  const [selectedWHId, setSelectedWHId] = useState("");
  const [selectedWHName, setSelectedWHName] = useState("Tất cả kho");
  const [loadingWH, setLoadingWH]       = useState(true);

  // ── Auth guard ─────────────────────────────────────────
  const allowedRoles = ["manager", "warehouse", "admin"];
  if (currentUser && !allowedRoles.includes(currentUser.role)) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", gap: 12, padding: 24 }}>
        <div style={{ fontSize: 52 }}>🔒</div>
        <div style={{ fontWeight: 700, fontSize: 18, textAlign: "center" }}>Không có quyền truy cập</div>
        <div style={{ fontSize: 13, color: "#6b7280", textAlign: "center" }}>Chỉ Quản lý và Nhân viên kho mới được vào module này.</div>
        {onBack && (
          <button onClick={onBack} style={{ marginTop: 8, padding: "10px 24px", borderRadius: 12, background: PRIMARY, color: "#fff", border: "none", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
            ← Quay lại
          </button>
        )}
      </div>
    );
  }

  // ── Load danh sách kho ─────────────────────────────────
  useEffect(() => {
    Warehouse.list({ filter: "is_active=true", limit: 100 })
      .then(all => {
        const ids = currentUser?.warehouse_ids || [];
        const allowed = ids.length > 0
          ? all.filter(w => ids.includes(w.id))
          : all;
        setWarehouses(allowed);
        // Auto-select nếu chỉ có 1 kho
        if (allowed.length === 1) {
          setSelectedWHId(allowed[0].id);
          setSelectedWHName(allowed[0].name);
        }
      })
      .catch(() => setWarehouses([]))
      .finally(() => setLoadingWH(false));
  }, [currentUser]);

  // ── Low stock count cho badge ──────────────────────────
  // (sẽ được cập nhật từ StockLedgerPage qua prop nếu cần — hiện để 0)

  // ── Render tab content ─────────────────────────────────
  function renderTab() {
    switch (tab) {
      case "stock":
        return (
          <StockLedgerPage
            warehouseId={selectedWHId || null}
            warehouseName={selectedWHName}
          />
        );
      case "import":
        return (
          <StockImportPage
            currentUser={currentUser}
            warehouseId={selectedWHId || ""}
            warehouseName={selectedWHName}
          />
        );
      case "export":
        return (
          <StockExportPage
            currentUser={currentUser}
            warehouseId={selectedWHId || ""}
            warehouseName={selectedWHName}
          />
        );
      case "transfer":
        return (
          <StockTransferPage
            currentUser={currentUser}
            allWarehouses={warehouses}
          />
        );
      default:
        return null;
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#f8fafc", overflow: "hidden" }}>

      {/* Header */}
      <div style={{
        background: `linear-gradient(135deg, ${PRIMARY} 0%, #4f46e5 100%)`,
        padding: "14px 16px 12px",
        flexShrink: 0,
        boxShadow: "0 2px 12px rgba(55,48,163,.25)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {/* Back + Title */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {onBack && (
              <button
                onClick={onBack}
                style={{ background: "rgba(255,255,255,.18)", border: "none", color: "#fff", width: 34, height: 34, borderRadius: "50%", fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                ←
              </button>
            )}
            <div>
              <div style={{ fontWeight: 800, fontSize: 16, color: "#fff" }}>🏭 App Kho</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,.7)", marginTop: 1 }}>Quản lý tồn kho · Hoàng Khánh</div>
            </div>
          </div>

          {/* Dropdown chọn kho */}
          {!loadingWH && (
            <WarehouseDropdown
              warehouses={warehouses}
              selectedId={selectedWHId}
              onChange={(id, name) => { setSelectedWHId(id); setSelectedWHName(name || "Tất cả kho"); }}
            />
          )}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {renderTab()}
      </div>

      {/* Bottom Navigation */}
      <div style={{
        display: "flex", background: "#fff",
        borderTop: "1px solid #f3f4f6",
        height: NAV_H, flexShrink: 0,
        boxShadow: "0 -2px 12px rgba(0,0,0,.06)",
      }}>
        {TABS.map(t => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
                justifyContent: "center", gap: 3,
                border: "none", background: "none", cursor: "pointer",
                borderTop: `3px solid ${active ? PRIMARY : "transparent"}`,
                transition: "border-color .15s",
                position: "relative",
              }}
            >
              <span style={{ fontSize: 20 }}>{t.icon}</span>
              <span style={{
                fontSize: 11, fontWeight: active ? 700 : 500,
                color: active ? PRIMARY : "#9ca3af",
              }}>{t.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
