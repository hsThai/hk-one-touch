// PWA Utilities - Nút tắt app, chặn back, wake lock
import { useEffect } from 'react';

// Hook chặn back button
export function usePreventBack() {
  useEffect(() => {
    const preventBack = () => {
      history.pushState(null, '', window.location.href);
    };
    history.pushState(null, '', window.location.href);
    window.addEventListener('popstate', preventBack);
    return () => window.removeEventListener('popstate', preventBack);
  }, []);
}

// Nút tắt app
export function ExitAppButton({ style = {} }) {
  const handleExit = () => {
    if (window.confirm('Bạn có chắc muốn thoát ứng dụng?')) {
      // Thử đóng window (hoạt động trên một số PWA)
      window.close();
      // Fallback: về trang trắng
      document.body.innerHTML = `
        <div style="
          min-height:100vh;
          background:#1e1b4b;
          display:flex;
          flex-direction:column;
          align-items:center;
          justify-content:center;
          gap:16px;
          color:#fff;
          font-family:sans-serif;
        ">
          <div style="font-size:64px">🔧</div>
          <div style="font-size:20px;font-weight:700">HKApp đã tắt</div>
          <div style="font-size:14px;color:#c7d2fe">Nhấn nút Home để về màn hình chính</div>
        </div>
      `;
      // Release wake lock
      if (window._wakeLock) {
        window._wakeLock.release();
      }
    }
  };

  return (
    <button
      onClick={handleExit}
      style={{
        background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
        color: '#fff',
        border: 'none',
        borderRadius: 12,
        padding: '12px 20px',
        fontWeight: 700,
        fontSize: 15,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        width: '100%',
        justifyContent: 'center',
        boxShadow: '0 4px 12px rgba(220,38,38,0.4)',
        ...style
      }}
    >
      ⏻ Tắt App
    </button>
  );
}
