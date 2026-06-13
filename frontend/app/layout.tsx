import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AIBA — 次世代技術投資分析",
  description: "テクニカルとセンチメントの乖離から最適な投資タイミングを検知するダッシュボード",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
