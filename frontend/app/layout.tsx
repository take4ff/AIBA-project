import type { Metadata } from "next";
import "./globals.css";
import AuthProvider from "@/components/AuthProvider";
import AuthButton from "@/components/AuthButton";

export const metadata: Metadata = {
  title: "AIBA — 次世代技術投資分析",
  description: "テクニカルとセンチメントの乖離から最適な投資タイミングを検知するダッシュボード",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <AuthProvider>
          <AuthButton />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
