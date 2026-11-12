import type { Metadata } from "next";
import Nav from "./nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "물품 대장",
  description: "물품 관리와 반납 확인",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="min-h-screen antialiased">
        <Nav />
        {/* 폰에서는 아래쪽 탭에 내용이 가리지 않게 여백을 둔다. */}
        <main className="mx-auto max-w-5xl px-5 pt-8 pb-28 sm:pb-12">{children}</main>
      </body>
    </html>
  );
}
