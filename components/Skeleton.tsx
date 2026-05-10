import { cn } from "@/lib/cn";
import type { CSSProperties } from "react";

// 단순 회색 박스 스켈레톤 (Tailwind animate-pulse).
// loading.tsx 와 Suspense fallback에 사용.
export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return <div className={cn("bg-muted/60 rounded animate-pulse", className)} style={style} />;
}

// 페이지 레벨 — KPI 카드 + 차트 + 표 자리잡기
export function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-24" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border bg-card p-4 space-y-3">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-3 w-40" />
          </div>
        ))}
      </div>
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-72 w-full" />
      </div>
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <Skeleton className="h-4 w-40" />
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}

// 차트 자리만 (Suspense fallback에서 사용)
export function ChartSkeleton({ height = 320 }: { height?: number }) {
  return <Skeleton className="w-full" style={{ height }} />;
}

// 표 자리만
export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-6 w-full" />
      ))}
    </div>
  );
}
