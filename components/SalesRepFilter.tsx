"use client";
import { useState, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Users, X, Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatInt } from "@/lib/format";

export type RepOption = {
  salesRep: string;
  activeCount: number;
  dormantCount: number;
};

// 담당자 필터 — 목록/차트를 특정 담당자로 좁힌다.
// 담당자 수가 10명 남짓이라 검색 없이 전체를 펼쳐 보여준다.
export function SalesRepFilter({
  options,
  current,
  paramKey = "rep",
  className,
}: {
  options: RepOption[];
  current: string | null;
  paramKey?: string;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();

  function pick(rep: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (rep) params.set(paramKey, rep);
    else params.delete(paramKey);
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
    setOpen(false);
  }

  const total = options.reduce((s, o) => s + o.dormantCount, 0);

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-3 py-1.5 h-9 rounded-md border border-input bg-background text-sm hover:bg-muted/50 min-w-[190px]"
      >
        <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="truncate flex-1 text-left">
          {current ? (
            <span className="font-medium">{current}</span>
          ) : (
            <span className="text-muted-foreground">담당자 전체</span>
          )}
        </span>
        {current && (
          <X
            className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              pick(null);
            }}
          />
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute right-0 z-50 mt-1 w-[280px] bg-popover border border-border rounded-md shadow-lg max-h-[420px] overflow-y-auto">
            <button
              onClick={() => pick(null)}
              className={cn(
                "w-full text-left px-3 py-2 hover:bg-muted/50 flex items-center gap-2 text-sm border-b",
                !current && "bg-muted",
              )}
            >
              <span className="w-4 shrink-0">
                {!current && <Check className="h-3.5 w-3.5" />}
              </span>
              <span className="flex-1">담당자 전체</span>
              <span className="text-[10px] text-muted-foreground tabular-nums">
                무매출 {formatInt(total)}개
              </span>
            </button>
            {options.map((o) => (
              <button
                key={o.salesRep}
                onClick={() => pick(o.salesRep)}
                className={cn(
                  "w-full text-left px-3 py-2 hover:bg-muted/50 flex items-center gap-2 text-sm border-b last:border-0",
                  current === o.salesRep && "bg-muted",
                )}
              >
                <span className="w-4 shrink-0">
                  {current === o.salesRep && <Check className="h-3.5 w-3.5" />}
                </span>
                <span className="flex-1 truncate">{o.salesRep}</span>
                <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                  무매출 {formatInt(o.dormantCount)} / 활성 {formatInt(o.activeCount)}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
