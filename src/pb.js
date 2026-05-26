/**
 * PocketBase SDK Layer — KiosThong / HKApp2
 * Thay thế toàn bộ @/api/entities và @/api/storage
 * Config IP tại: localStorage key "pb_url" hoặc default bên dưới
 */

const DEFAULT_PB_URL = "http://127.0.0.1:8090";

export function getPbUrl() {
  try {
    return localStorage.getItem("pb_url") || DEFAULT_PB_URL;
  } catch {
    return DEFAULT_PB_URL;
  }
}

export function setPbUrl(url) {
  localStorage.setItem("pb_url", url.replace(/\/$/, ""));
}

// ── Auth token management ─────────────────────────────────
let _token = null;
let _userId = null;

export function setAuth(token, userId) {
  _token = token;
  _userId = userId;
  try { localStorage.setItem("pb_token", token); localStorage.setItem("pb_uid", userId); } catch {}
}

export function getAuth() {
  if (_token) return { token: _token, userId: _userId };
  try {
    const t = localStorage.getItem("pb_token");
    const u = localStorage.getItem("pb_uid");
    if (t) { _token = t; _userId = u; return { token: t, userId: u }; }
  } catch {}
  return { token: null, userId: null };
}

export function clearAuth() {
  _token = null; _userId = null;
  try { localStorage.removeItem("pb_token"); localStorage.removeItem("pb_uid"); } catch {}
}

// ── Base fetch helper ─────────────────────────────────────
async function pbFetch(path, options = {}) {
  const base = getPbUrl();
  const { token } = getAuth();
  const url = `${base}/api/${path}`;
  const headers = { "Content-Type": "application/json", ...(token ? { Authorization: token } : {}), ...(options.headers || {}) };
  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const d = await res.json(); msg = d.message || msg; } catch {}
    throw new Error(msg);
  }
  if (res.status === 204) return null;
  return res.json();
}

// ── Auth API ──────────────────────────────────────────────
export const pbAuth = {
  async loginWithPassword(collection, username, password) {
    const data = await pbFetch(`collections/${collection}/auth-with-password`, {
      method: "POST",
      body: JSON.stringify({ identity: username, password }),
    });
    setAuth(data.token, data.record?.id);
    return data;
  },
  async loginStaff(username, password) {
    return pbAuth.loginWithPassword("staff", username, password);
  },
  logout() { clearAuth(); },
};

// ── Collection CRUD helper ────────────────────────────────
function makeCollection(collectionName) {
  return {
    async list(options = {}) {
      const { sort = "", limit = 200, filter = "", page = 1 } = options;
      const params = new URLSearchParams({ perPage: limit, page });
      if (sort) params.set("sort", sort);
      if (filter) params.set("filter", filter);
      const data = await pbFetch(`collections/${collectionName}/records?${params}`);
      return data.items || [];
    },

    async get(id) {
      return pbFetch(`collections/${collectionName}/records/${id}`);
    },

    async filter(query = {}) {
      // Build PocketBase filter string from object
      const parts = Object.entries(query).map(([k, v]) => {
        if (typeof v === "string") return `${k}="${v}"`;
        if (typeof v === "boolean") return `${k}=${v}`;
        return `${k}=${v}`;
      });
      const filter = parts.join(" && ");
      return this.list({ filter });
    },

    async create(data) {
      return pbFetch(`collections/${collectionName}/records`, {
        method: "POST",
        body: JSON.stringify(data),
      });
    },

    async update(id, data) {
      return pbFetch(`collections/${collectionName}/records/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
    },

    async delete(id) {
      return pbFetch(`collections/${collectionName}/records/${id}`, {
        method: "DELETE",
      });
    },
  };
}

// ── Collections ───────────────────────────────────────────
export const Staff         = makeCollection("staff");
export const RepairOrder   = makeCollection("repair_orders");
export const RepairChat    = makeCollection("repair_chats");
export const Notification  = makeCollection("notifications");
export const Customer      = makeCollection("customers");
export const SparePart     = makeCollection("spare_parts");
export const SparePartUsage= makeCollection("spare_part_usages");
export const AppSettings   = makeCollection("app_settings");

// ── File Upload ───────────────────────────────────────────
export async function uploadFile(file) {
  const base = getPbUrl();
  const { token } = getAuth();
  const formData = new FormData();
  formData.append("file", file);
  // Lưu vào collection "media_files"
  formData.append("name", file.name);
  formData.append("type", file.type.startsWith("video/") ? "video" : "image");

  const res = await fetch(`${base}/api/collections/media_files/records`, {
    method: "POST",
    headers: token ? { Authorization: token } : {},
    body: formData,
  });
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  const data = await res.json();
  // Trả về URL public
  return `${base}/api/files/media_files/${data.id}/${data.file}`;
}

// ── Realtime helper (SSE) ─────────────────────────────────
export function subscribeCollection(collectionName, callback) {
  const base = getPbUrl();
  const { token } = getAuth();
  const url = `${base}/api/realtime`;
  const es = new EventSource(`${url}?token=${token || ""}`);

  es.onopen = () => {
    // Subscribe after connect
    fetch(`${url}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: token || "" },
      body: JSON.stringify({ clientId: es.clientId, subscriptions: [`${collectionName}/*`] }),
    });
  };

  es.addEventListener(collectionName, (e) => {
    try { callback(JSON.parse(e.data)); } catch {}
  });

  return () => es.close();
}

// ── Settings helper ───────────────────────────────────────
export const pbSettings = {
  async get(key) {
    try {
      const items = await AppSettings.filter({ key });
      return items[0]?.value || null;
    } catch { return null; }
  },
  async set(key, value, label = "", group = "") {
    try {
      const items = await AppSettings.filter({ key });
      if (items[0]) {
        await AppSettings.update(items[0].id, { value });
      } else {
        await AppSettings.create({ key, value, label, group });
      }
    } catch {}
  },
};

// ── Connection test ───────────────────────────────────────
export async function testConnection(url) {
  try {
    const res = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch { return false; }
}

// ── Warehouse / Kho ───────────────────────────────────────
export const Warehouse          = makeCollection("warehouses");
export const WarehouseZone      = makeCollection("warehouse_zones");
export const WarehouseLocation  = makeCollection("warehouse_locations");

// ── Stock Management ──────────────────────────────────────
export const StockLedger        = makeCollection("stock_ledgers");
export const StockMovement      = makeCollection("stock_movements");
export const StockTransfer      = makeCollection("stock_transfers");
export const StockImport        = makeCollection("stock_imports");
export const StockImportItem    = makeCollection("stock_import_items");
export const StockExportRequest = makeCollection("stock_export_requests");
export const StockCount         = makeCollection("stock_counts");
export const StockCountItem     = makeCollection("stock_count_items");
