"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="vi">
      <body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", background: "#0A0C10", color: "#E8EBF0", fontFamily: "system-ui" }}>
        <div style={{ width: "min(560px, 92vw)", border: "1px solid #27313F", borderRadius: 12, background: "#161B26", padding: 20 }}>
          <h2 style={{ marginBottom: 8, fontSize: 20 }}>Ứng dụng gặp lỗi nghiêm trọng</h2>
          <p style={{ color: "#8B93A0", marginBottom: 8 }}>Vui lòng tải lại trang hoặc thử lại.</p>
          <pre style={{ whiteSpace: "pre-wrap", color: "#FF5F5F", fontSize: 12, marginBottom: 16 }}>
            {error?.message}
          </pre>
          <button
            onClick={reset}
            style={{ border: 0, borderRadius: 8, padding: "10px 14px", cursor: "pointer", background: "#4FF0B4", color: "#0A0C10", fontWeight: 700 }}
          >
            Thử lại
          </button>
        </div>
      </body>
    </html>
  );
}
