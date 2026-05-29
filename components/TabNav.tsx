"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Lock } from "lucide-react";
import { cn } from "@/lib/cn";

const TABS = [
  { href: "/", label: "종합" },
  { href: "/targets", label: "목표달성" },
  { href: "/export", label: "해외영업" },
  { href: "/b2b", label: "B2B" },
  { href: "/agencies", label: "대리점" },
  { href: "/baquerohouse", label: "바크로하우스" },
  { href: "/b2c", label: "B2C" },
  { href: "/duty-free", label: "면세점" },
  { href: "/brand", label: "브랜드 분석" },
  { href: "/accounts", label: "거래처 분석" },
  { href: "/insights", label: "심층 분석" },
  { href: "/non-revenue", label: "비매출 출고" },
];

// 자물쇠 아이콘으로 잠금 표시할 탭 경로들. 클릭은 가능 — 페이지가 권한 메시지 렌더.
export function TabNav({ lockedTabs }: { lockedTabs?: string[] }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const month = searchParams.get("month");
  const qs = month ? `?month=${month}` : "";
  const lockedSet = new Set(lockedTabs ?? []);

  return (
    <nav className="flex gap-0.5 overflow-x-auto border-b border-border">
      {TABS.map((tab) => {
        const active =
          pathname === tab.href ||
          (tab.href === "/brand" && pathname.startsWith("/brand")) ||
          (tab.href === "/accounts" && pathname.startsWith("/accounts"));
        const locked = lockedSet.has(tab.href);
        return (
          <Link
            key={tab.href}
            href={`${tab.href}${qs}`}
            title={locked ? "열람 권한 필요" : undefined}
            className={cn(
              "px-4 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors inline-flex items-center gap-1",
              active
                ? "border-foreground font-semibold text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted",
            )}
          >
            {tab.label}
            {locked && <Lock className="h-3 w-3 text-muted-foreground" />}
          </Link>
        );
      })}
    </nav>
  );
}
