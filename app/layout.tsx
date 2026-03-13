import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AdMob Mediation Tool",
  description: "Internal tool for AdMob Mediation automation",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style dangerouslySetInnerHTML={{ __html: `
          *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
          html { font-size: 14px; }
          body { background: #F8FAFC; color: #0F172A; min-height: 100vh; line-height: 1.5; -webkit-font-smoothing: antialiased; }
        `}} />
      </head>
      <body>{children}</body>
    </html>
  );
}
