// 文件: app/layout.tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google"; // 1. 从 'next/font/google' 导入 'Inter'
import "./globals.css";

// 2. 初始化 Inter 字体
const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "AI Travel Planner", 
  description: "AI 旅行规划师",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // 3. 将 inter.className 应用到 <html> 或 <body>
    // (应用到 <html> 标签更标准)
    <html lang="en" className={inter.className}>
      <body>{children}</body>
    </html>
  );
}