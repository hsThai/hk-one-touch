/* v1774860462-4890 */
import React, { useState, useEffect, useRef, useCallback } from "react";
import { RepairChat, Notification, Staff, RepairOrder, Customer, SparePart, SparePartUsage } from "./pb.js";
import { uploadFile } from "./pb.js";


function loadQRLib(cb) {
  if (_qrLibLoaded) { cb(); return; }
  _qrLibCallbacks.push(cb);
  if (_qrLibCallbacks.length > 1) return; // đang load rồi
  const s = document.createElement("script");
  s.src = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";
  s.onload = () => {
    _qrLibLoaded = true;
    _qrLibCallbacks.forEach(f => f());
    _qrLibCallbacks = [];
  };
  s.onerror = () => {
    // fallback
    const s2 = document.createElement("script");
    s2.src = "https://cdn.jsdelivr.net/gh/davidshimjs/qrcodejs@master/qrcode.min.js";
    s2.onload = () => {
      _qrLibLoaded = true;
      _qrLibCallbacks.forEach(f => f());
      _qrLibCallbacks = [];
    };
    document.head.appendChild(s2);
  };
  document.head.appendChild(s);
}

let _jsQRLoaded = false;
let _jsQRCallbacks = [];
function loadJsQR(cb) {
  if (_jsQRLoaded && window.jsQR) { cb(); return; }
  _jsQRCallbacks.push(cb);
  if (_jsQRCallbacks.length > 1) return;
  const s = document.createElement("script");
  s.src = "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js";
  s.onload = () => {
    _jsQRLoaded = true;
    _jsQRCallbacks.forEach(f => f());
    _jsQRCallbacks = [];
  };
  s.onerror = () => { _jsQRCallbacks = []; };
  document.head.appendChild(s);
}

// QRCanvas — mỗi text khác nhau → QR khác nhau
// QUAN TRỌNG: luôn truyền key={text} từ cha để force remount
function QRCanvas({ text, size = 160 }) {
  const divRef = useRef();
  useEffect(() => {
    if (!divRef.current || !text) return;
    const el = divRef.current;
    el.innerHTML = "";
    loadQRLib(() => {
      if (!el || !window.QRCode) return;
      el.innerHTML = "";
      try {
        new window.QRCode(el, {
          text,
          width: size,
          height: size,
          colorDark: "#1e1b4b",
          colorLight: "#ffffff",
          correctLevel: window.QRCode.CorrectLevel.M,
        });
      } catch (e) {
        el.innerHTML = `<div style="width:${size}px;height:${size}px;background:#f3f4f6;display:flex;flex-direction:column;align-items:center;justify-content:center;border-radius:8px;font-size:11px;color:#6b7280;text-align:center;padding:6px"><div style="font-size:24px">📱</div><div style="font-weight:700;margin-top:4px;word-break:break-all">${text}</div></div>`;
      }
    });
  }, [text, size]);
  return <div ref={divRef} style={{ display: "inline-block", lineHeight: 0 }} />;
}

function getQRDataUrl(textOrEl, size = 160) {
  // Nếu là string -> tạo QR canvas tạm rồi lấy dataUrl
  if (typeof textOrEl === "string") {
    return new Promise((resolve) => {
      const div = document.createElement("div");
      div.style.position = "fixed";
      div.style.left = "-9999px";
      document.body.appendChild(div);
      loadQRLib(() => {
        try {
          new window.QRCode(div, { text: textOrEl, width: size, height: size, correctLevel: window.QRCode.CorrectLevel.M });
          setTimeout(() => {
            const canvas = div.querySelector("canvas");
            const url = canvas ? canvas.toDataURL() : "";
            document.body.removeChild(div);
            resolve(url);
          }, 100);
        } catch(e) { document.body.removeChild(div); resolve(""); }
      });
    });
  }
  // Nếu là DOM element
  const canvas = textOrEl?.querySelector("canvas");
  return Promise.resolve(canvas ? canvas.toDataURL() : "");
}

// ══════════════════════════════════════════════
//  QR SCANNER — camera + nhập tay
//  mode="search"  → tìm đơn theo mã quét được
//  mode="capture" → chỉ trả về chuỗi raw, không tìm
// ══════════════════════════════════════════════
function QRScanModal({ onClose, onFound, orders = [], mode = "search" }) {
  const videoRef = useRef();
  const canvasRef = useRef();
  const rafRef = useRef();
  const streamRef = useRef();
  const [camReady, setCamReady] = useState(false);
  const [libOk, setLibOk] = useState(false);
  const [err, setErr] = useState("");
  const [manual, setManual] = useState("");
  const isCapture = mode === "capture";

  // load jsQR
  useEffect(() => {
    loadJsQR(() => setLibOk(true));
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop());
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // start camera khi lib xong
  useEffect(() => {
    if (!libOk) return;
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: "environment", width: 640, height: 640 } })
      .then(stream => {
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().then(() => { setCamReady(true); scan(); });
        }
      })
      .catch(() => setErr("Không mở được camera. Dùng nhập thủ công bên dưới."));
  }, [libOk]);

  function scan() {
    rafRef.current = requestAnimationFrame(() => {
      const v = videoRef.current; const c = canvasRef.current;
      if (!v || !c || !window.jsQR || v.readyState < 2) { scan(); return; }
      c.width = v.videoWidth; c.height = v.videoHeight;
      const ctx = c.getContext("2d");
      ctx.drawImage(v, 0, 0);
      const img = ctx.getImageData(0, 0, c.width, c.height);
      const code = window.jsQR(img.data, img.width, img.height, { inversionAttempts: "attemptBoth" });
      if (code?.data) {
        streamRef.current?.getTracks().forEach(t => t.stop());
        handleRaw(code.data.trim());
        return;
      }
      scan();
    });
  }

  function handleRaw(raw) {
    if (isCapture) { onFound({ type: "raw", code: raw }); onClose(); return; }
    // search mode
    const order = orders.find(o => o.id === raw || o.qr_code === raw);
    if (order) { onFound({ type: "order", data: order }); onClose(); return; }
    setErr(`Không tìm thấy mã "${raw}" trong hệ thống`);
  }

  function handleManual() {
    if (!manual.trim()) return;
    handleRaw(manual.trim());
  }

  return (
    <div style={{ position:"fixed", inset:0, zIndex:4000, background:"rgba(0,0,0,.92)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:16 }}>
      <div style={{ width:"100%", maxWidth:400 }}>
        {/* Header */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
          <div>
            <div style={{ color:"#fff", fontWeight:800, fontSize:20 }}>
              {isCapture ? "📷 Quét Mã QR Máy" : "🔍 Quét QR Tìm Đơn"}
            </div>
            <div style={{ color:"#a5b4fc", fontSize:12, marginTop:2 }}>
              {isCapture ? "Lấy mã QR dán lên máy → điền vào đơn" : "Quét QR phiếu sửa để tìm đơn hàng"}
            </div>
          </div>
          <button onClick={() => { streamRef.current?.getTracks().forEach(t => t.stop()); onClose(); }}
            style={{ background:"rgba(255,255,255,.2)", border:"none", color:"#fff", width:40, height:40, borderRadius:"50%", fontSize:18, cursor:"pointer" }}>✕</button>
        </div>

        {/* Camera */}
        <div style={{ position:"relative", borderRadius:18, overflow:"hidden", background:"#000", aspectRatio:"1", marginBottom:14 }}>
          <video ref={videoRef} playsInline muted style={{ width:"100%", height:"100%", objectFit:"cover" }} />
          <canvas ref={canvasRef} style={{ display:"none" }} />
          {/* Overlay */}
          <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", pointerEvents:"none" }}>
            <div style={{ width:"60%", height:"60%", position:"relative" }}>
              <div style={{ position:"absolute", inset:0, boxShadow:"0 0 0 9999px rgba(0,0,0,.5)", borderRadius:12 }} />
              <div style={{ position:"absolute", inset:0, border:"3px solid #a5b4fc", borderRadius:12 }} />
              {/* corners */}
              {[[0,0],[0,1],[1,0],[1,1]].map(([t,r],i) => (
                <div key={i} style={{ position:"absolute", width:20, height:20,
                  ...(t===0 ? {top:-2} : {bottom:-2}), ...(r===0 ? {left:-2} : {right:-2}),
                  borderTop: t===0?"3px solid #818cf8":"none", borderBottom: t===1?"3px solid #818cf8":"none",
                  borderLeft: r===0?"3px solid #818cf8":"none", borderRight: r===1?"3px solid #818cf8":"none",
                  borderRadius: `${t===0&&r===0?"4":t===0&&r===1?"0":t===1&&r===0?"0":"0"}px ${t===0&&r===1?"4":"0"}px ${t===1&&r===1?"4":"0"}px ${t===1&&r===0?"4":"0"}px`
                }} />
              ))}
            </div>
          </div>
          {/* Status */}
          <div style={{ position:"absolute", bottom:10, left:0, right:0, textAlign:"center" }}>
            {!libOk && <span style={{ background:"rgba(0,0,0,.7)", color:"#fcd34d", padding:"5px 14px", borderRadius:20, fontSize:12 }}>⏳ Đang tải thư viện QR...</span>}
            {libOk && !camReady && !err && <span style={{ background:"rgba(0,0,0,.7)", color:"#fff", padding:"5px 14px", borderRadius:20, fontSize:12 }}>📷 Đang mở camera...</span>}
            {libOk && camReady && !err && <span style={{ background:"rgba(0,0,0,.7)", color:"#a5b4fc", padding:"5px 14px", borderRadius:20, fontSize:12 }}>Đưa mã QR vào khung...</span>}
          </div>
        </div>

        {/* Error */}
        {err && (
          <div style={{ background:"#fef2f2", border:"1px solid #fca5a5", borderRadius:12, padding:"10px 14px", marginBottom:12, color:"#dc2626", fontSize:13, fontWeight:600, textAlign:"center" }}>
            {err}
            <div style={{ fontSize:12, color:"#6b7280", fontWeight:400, marginTop:4 }}>Thử nhập mã thủ công bên dưới</div>
          </div>
        )}

        {/* Manual */}
        <div style={{ background:"rgba(255,255,255,.08)", borderRadius:14, padding:14 }}>
          <div style={{ color:"#e5e7eb", fontSize:13, fontWeight:600, marginBottom:8 }}>
            {isCapture ? "Hoặc nhập mã QR thủ công:" : "Hoặc nhập mã đơn thủ công:"}
          </div>
          <div style={{ display:"flex", gap:8 }}>
            <input value={manual} onChange={e => { setManual(e.target.value); setErr(""); }}
              onKeyDown={e => e.key === "Enter" && handleManual()}
              placeholder={isCapture ? "Nhập mã QR trên máy..." : "SC240001..."}
              style={{ flex:1, height:48, borderRadius:12, border:"1.5px solid rgba(255,255,255,.3)", background:"rgba(255,255,255,.1)", color:"#fff", padding:"0 14px", fontSize:15, outline:"none" }} />
            <button onClick={handleManual}
              style={{ height:48, padding:"0 20px", borderRadius:12, background:"#4f46e5", color:"#fff", border:"none", fontWeight:800, fontSize:15, cursor:"pointer" }}>OK</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════
//  QR PRINT MODAL
// ══════════════════════════════════════════════

function QRPrintModal({ order, onClose }) {
  if (!order) return null;

  const qrData = order.order_code || order.id;
  const [qrUrl, setQrUrl] = React.useState("");

  React.useEffect(() => {
    getQRDataUrl(qrData, 200).then(url => setQrUrl(url)).catch(() => {});
  }, [qrData]);

  const handlePrint = () => {
    const win = window.open("", "_blank");
    win.document.write(`
      <html><head><title>In QR - ${order.order_code}</title>
      <style>body{font-family:sans-serif;text-align:center;padding:20px}
      img{width:180px;height:180px} h2{margin:10px 0 4px} p{margin:2px;font-size:13px;color:#555}
      </style></head><body>
      <img src="${qrUrl}" />
      <h2>${order.order_code}</h2>
      <p>${order.customer_name || ""}</p>
      <p>${order.device_name || ""} ${order.device_model || ""}</p>
      <script>window.onload=()=>{window.print();window.close()}</script>
      </body></html>
    `);
    win.document.close();
  };

  const overlay = { position:"fixed", inset:0, background:"rgba(0,0,0,.7)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center" };
  const box = { background:"#1e293b", borderRadius:20, padding:28, width:300, textAlign:"center" };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={box} onClick={e => e.stopPropagation()}>
        <div style={{ color:"#fff", fontWeight:800, fontSize:17, marginBottom:16 }}>In mã QR đơn hàng</div>
        {qrUrl && <img src={qrUrl} style={{ width:180, height:180, borderRadius:12, background:"#fff", padding:8 }} />}
        <div style={{ color:"#e2e8f0", fontWeight:700, fontSize:16, margin:"12px 0 4px" }}>{order.order_code}</div>
        <div style={{ color:"#94a3b8", fontSize:13, marginBottom:16 }}>{order.customer_name} — {order.device_name}</div>
        <div style={{ display:"flex", gap:10 }}>
          <button onClick={handlePrint}
            style={{ flex:1, height:44, borderRadius:12, background:"#4f46e5", color:"#fff", border:"none", fontWeight:700, fontSize:15, cursor:"pointer" }}>
            🖨️ In
          </button>
          <button onClick={onClose}
            style={{ flex:1, height:44, borderRadius:12, background:"rgba(255,255,255,.1)", color:"#fff", border:"none", fontWeight:700, fontSize:15, cursor:"pointer" }}>
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}

export { loadQRLib, loadJsQR, QRCanvas, getQRDataUrl, QRScanModal, QRPrintModal };
