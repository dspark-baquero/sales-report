"use client";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/cn";

// 종합 리포트 스코프 탭: 전체 / 국내 / 해외.
// 국내 = 수출(해외) 제외, 해외 = 수출만. 디폴트 = 전체.
const SCOPES = ["전체", "국내", "해외"] as const;
type Scope = (typeof SCOPES)[number];

export function ScopeTabs() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const raw = searchParams.get("scope");
  const current: Scope = (SCOPES as readonly string[]).includes(raw ?? "")
    ? (raw as Scope)
    : "전체";

  return (
    <div className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5">
      {SCOPES.map((s) => {
        const active = s === current;
        return (
          <button
            key={s}
            type="button"
            onClick={() => {
              const params = new URLSearchParams(searchParams.toString());
              if (s === "전체") params.delete("scope");
              else params.set("scope", s);
              const qs = params.toString();
              router.push(qs ? `${pathname}?${qs}` : pathname);
            }}
            className={cn(
              "px-3 py-1 text-sm rounded-md transition-colors",
              active
                ? "bg-background font-semibold text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {s}
          </button>
        );
      })}
    </div>
  );
}
