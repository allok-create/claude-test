import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "企業會計記帳系統", template: "%s｜企業會計記帳系統" },
  description: "科目表、傳票、帳簿、財務報表、應收應付與庫存管理",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant-TW">
      <body>{children}</body>
    </html>
  );
}
