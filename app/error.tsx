"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[APP_ERROR]", error);
  }, [error]);

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#F8FAFC", color: "#0F172A", fontFamily: "system-ui" }}>
      <div style={{ width: "min(560px, 92vw)", border: "1px solid #E2E8F0", borderRadius: 12, background: "#FFFFFF", padding: 20 }}>
        <h2 style={{ marginBottom: 8, fontSize: 20 }}>Có lỗi xảy ra</h2>
        <p style={{ color: "#475569", marginBottom: 16 }}>Trang vừa gặp lỗi runtime. Bạn có thể thử lại.</p>
        <button
          onClick={reset}
          style={{ border: 0, borderRadius: 8, padding: "10px 14px", cursor: "pointer", background: "#059669", color: "#FFFFFF", fontWeight: 700 }}
        >
          Thử lại
        </button>
      </div>
    </div>
  );
}
