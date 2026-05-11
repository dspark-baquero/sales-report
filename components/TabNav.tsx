"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/cn";

const TABS = [
  { href: "/", label: "종합" },
  { href: "/targets", label: "목표 달성" },
  { href: "/b2b", label: "B2B" },
  { href: "/b2c", label: "B2C" },
  { href: "/duty-free", label: "면세점" },
  { href: "/brand", label: "브랜드 분석" },
  { href: "/accounts", label: "거래처 분석" },
  { href: "/changes", label: "변동 분석" },
  { href: "/insights", label: "심층 분석" },
];

export function TabNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const month = searchParams.get("month");
  const qs = month ? `?month=${month}` : "";

  return (
    <nav className="flex gap-0.5 overflow-x-auto border-b border-border">
      {TABS.map((tab) => {
        const active =
          pathname === tab.href ||
          (tab.href === "/brand" && pathname.startsWith("/brand")) ||
          (tab.href === "/accounts" && pathname.startsWith("/accounts"));
        return (
          <Link
            key={tab.href}
            href={`${tab.href}${qs}`}
            className={cn(
              "px-4 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors",
              active
                ? "border-foreground font-semibold text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
