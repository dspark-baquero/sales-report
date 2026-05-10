"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatKRWShort } from "@/lib/format";

type CustomerOption = {
  customer: string;
  totalRevenue: number;
  category: string | null;
};

type Props = {
  options: CustomerOption[];
  current: string | null;
  paramKey?: string;        // 기본 "customer", 비교용은 "compare"
  label?: string;
  className?: string;
};

const CAT_BADGE: Record<string, string> = {
  수출: "bg-blue-100 text-blue-700",
  B2B: "bg-violet-100 text-violet-700",
  B2C: "bg-emerald-100 text-emerald-700",
  면세점: "bg-amber-100 text-amber-700",
};

export function CustomerSelect({
  options,
  current,
  paramKey = "customer",
  label = "거래처 선택",
  className,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options.slice(0, 100);
    return options.filter((o) => o.customer.toLowerCase().includes(q)).slice(0, 100);
  }, [options, query]);

  function pick(customer: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (customer) params.set(paramKey, customer);
    else params.delete(paramKey);
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
    setOpen(false);
    setQuery("");
  }

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-3 py-1.5 h-9 rounded-md border border-input bg-background text-sm hover:bg-muted/50 min-w-[200px] max-w-[320px]"
      >
        <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="truncate flex-1 text-left">
          {current ? (
            <span className="font-medium">{current}</span>
          ) : (
            <span className="text-muted-foreground">{label}</span>
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
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute right-0 z-50 mt-1 w-[360px] bg-popover border border-border rounded-md shadow-lg max-h-[460px] overflow-hidden flex flex-col">
            <div className="p-2 border-b">
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="거래처 검색..."
                className="w-full px-2 py-1 text-sm rounded border border-input bg-background outline-none focus:ring-2 focus:ring-ring"
              />
              <div className="text-[10px] text-muted-foreground mt-1">
                {filtered.length === 100 ? "상위 100건만 표시 — 검색어로 좁혀주세요" : `${filtered.length}건`}
              </div>
            </div>
            <div className="overflow-y-auto flex-1">
              {filtered.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground">검색 결과 없음</div>
              ) : (
                filtered.map((o) => (
                  <button
                    key={o.customer}
                    onClick={() => pick(o.customer)}
                    className={cn(
                      "w-full text-left px-3 py-2 hover:bg-muted/50 flex items-center gap-2 text-sm border-b last:border-0",
                      current === o.customer && "bg-muted",
                    )}
                  >
                    <span className="flex-1 truncate">{o.customer}</span>
                    {o.category && (
                      <span
                        className={cn(
                          "text-[10px] px-1.5 py-0.5 rounded",
                          CAT_BADGE[o.category] ?? "bg-slate-100 text-slate-700",
                        )}
                      >
                        {o.category}
                      </span>
                    )}
                    <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                      {formatKRWShort(o.totalRevenue)}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
