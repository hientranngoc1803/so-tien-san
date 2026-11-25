import type { Metadata, Viewport } from "next";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";

const AUTHOR = "Hien Tran Ngoc";

export const metadata: Metadata = {
  title: "Sổ tiền sân",
  description: "Sổ tiền sân của đội cầu lông",
  robots: { index: false, follow: false },
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1f6feb",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <div className="page">{children}</div>
        <footer className="site-footer">
          © 2026 {AUTHOR}. All rights reserved. | Designed &amp; Built by {AUTHOR}
        </footer>
      </body>
    </html>
  );
}
