"use client";
import Link from "next/link";
import { Fragment } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Lock } from "lucide-react";
import { cn } from "@/lib/cn";

// group: "report" = 채널·실적 보고 / "analysis" = 횡단 분석 도구
const TABS = [
  { href: "/", label: "종합", group: "report" },
  { href: "/targets", label: "목표달성", group: "report" },
  { href: "/export", label: "해외영업", group: "report" },
  { href: "/b2b-summary", label: "B2B종합", group: "report" },
  { href: "/b2b", label: "B2B", group: "report" },
  { href: "/agencies", label: "대리점", group: "report" },
  { href: "/baquerohouse", label: "바크로하우스", group: "report" },
  { href: "/b2c", label: "B2C", group: "report" },
  { href: "/duty-free", label: "면세점", group: "report" },
  { href: "/brand", label: "브랜드 분석", group: "analysis" },
  { href: "/accounts", label: "거래처 분석", group: "analysis" },
  { href: "/members", label: "거래처 관리", group: "analysis" },
  { href: "/products", label: "제품 분석", group: "analysis" },
  { href: "/insights", label: "심층 분석", group: "analysis" },
  { href: "/non-revenue", label: "비매출 출고", group: "analysis" },
] as const;

// 자물쇠 아이콘으로 잠금 표시할 탭 경로들. 클릭은 가능 — 페이지가 권한 메시지 렌더.
export function TabNav({ lockedTabs }: { lockedTabs?: string[] }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const month = searchParams.get("month");
  const qs = month ? `?month=${month}` : "";
  const lockedSet = new Set(lockedTabs ?? []);

  return (
    <nav className="flex gap-0.5 overflow-x-auto border-b border-border">
      {TABS.map((tab, i) => {
        const active =
          pathname === tab.href ||
          (tab.href === "/brand" && pathname.startsWith("/brand")) ||
          (tab.href === "/accounts" && pathname.startsWith("/accounts")) ||
          (tab.href === "/members" && pathname.startsWith("/members")) ||
          (tab.href === "/products" && pathname.startsWith("/products"));
        const locked = lockedSet.has(tab.href);
        const isAnalysis = tab.group === "analysis";
        // 그룹 경계(보고 → 분석)에 세로 구분선 삽입
        const showDivider = i > 0 && TABS[i - 1].group !== tab.group;
        return (
          <Fragment key={tab.href}>
            {showDivider && (
              <span
                aria-hidden
                className="mx-2 my-1.5 w-px self-stretch bg-border shrink-0"
              />
            )}
            <Link
              href={`${tab.href}${qs}`}
              title={locked ? "열람 권한 필요" : undefined}
              className={cn(
                "px-4 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors inline-flex items-center gap-1",
                active
                  ? isAnalysis
                    ? "border-indigo-500 font-semibold text-indigo-700"
                    : "border-foreground font-semibold text-foreground"
                  : isAnalysis
                    ? "border-transparent text-indigo-600/70 hover:text-indigo-700 hover:bg-indigo-50"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted",
              )}
            >
              {tab.label}
              {locked && <Lock className="h-3 w-3 text-muted-foreground" />}
            </Link>
          </Fragment>
        );
      })}
    </nav>
  );
}
