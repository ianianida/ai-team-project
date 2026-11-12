"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const MENUS = [
  { href: "/items", label: "물품 관리" },
  { href: "/returns", label: "반납 확인" },
];

// PC: 화면 위쪽 메뉴 / 폰: 화면 아래쪽 탭
export default function Nav() {
  const pathname = usePathname();
  const isActive = (href: string) => pathname.startsWith(href);

  return (
    <>
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-8 px-5">
          <Link href="/items" className="text-lg font-extrabold tracking-tight">
            물품 대장
          </Link>
          <nav aria-label="메뉴" className="hidden h-full gap-6 sm:flex">
            {MENUS.map((menu) => (
              <Link
                key={menu.href}
                href={menu.href}
                aria-current={isActive(menu.href) ? "page" : undefined}
                className={`flex items-center border-b-2 pt-0.5 font-semibold ${
                  isActive(menu.href)
                    ? "border-brand text-brand"
                    : "border-transparent text-muted hover:text-ink"
                }`}
              >
                {menu.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <nav
        aria-label="메뉴"
        className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-2 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] sm:hidden"
      >
        {MENUS.map((menu) => (
          <Link
            key={menu.href}
            href={menu.href}
            aria-current={isActive(menu.href) ? "page" : undefined}
            className={`border-t-2 py-4 text-center font-semibold ${
              isActive(menu.href)
                ? "border-brand text-brand"
                : "border-transparent text-muted"
            }`}
          >
            {menu.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
