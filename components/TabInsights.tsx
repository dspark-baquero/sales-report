// 탭 상단 자동 인사이트 불릿 패널.
// lib/tabInsights.ts 의 InsightBullet[] 을 받아 카드로 렌더.
// severity 별로 좌측 보더 색상 / 아이콘 분기.

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Info,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import type { InsightBullet, Severity } from "@/lib/tabInsights";

const SEVERITY_STYLES: Record<Severity, { border: string; bg: string; chip: string; icon: React.ComponentType<{ className?: string }>; iconColor: string }> = {
  critical: {
    border: "border-l-rose-500",
    bg: "bg-rose-50/40",
    chip: "bg-rose-100 text-rose-800",
    icon: AlertTriangle,
    iconColor: "text-rose-600",
  },
  warn: {
    border: "border-l-amber-500",
    bg: "bg-amber-50/40",
    chip: "bg-amber-100 text-amber-800",
    icon: TrendingDown,
    iconColor: "text-amber-600",
  },
  positive: {
    border: "border-l-emerald-500",
    bg: "bg-emerald-50/40",
    chip: "bg-emerald-100 text-emerald-800",
    icon: TrendingUp,
    iconColor: "text-emerald-600",
  },
  info: {
    border: "border-l-slate-400",
    bg: "bg-slate-50/40",
    chip: "bg-slate-100 text-slate-700",
    icon: Info,
    iconColor: "text-slate-500",
  },
};

export function TabInsights({
  bullets,
  title = "이번달 핵심 변동",
}: {
  bullets: InsightBullet[];
  title?: string;
}) {
  if (!bullets || bullets.length === 0) return null;

  return (
    <Card className="border-primary/20">
      <CardContent className="py-3 px-4">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <h3 className="text-xs font-semibold text-foreground">{title}</h3>
          <span className="text-[10px] text-muted-foreground ml-1">
            (자동 분석 · {bullets.length}건)
          </span>
        </div>
        <ul className="space-y-1.5">
          {bullets.map((b, i) => {
            const s = SEVERITY_STYLES[b.severity];
            const Icon = s.icon;
            const inner = (
              <div
                className={cn(
                  "flex items-start gap-2 pl-2 pr-2 py-1.5 border-l-2 rounded-sm",
                  s.border,
                  s.bg,
                )}
              >
                <Icon className={cn("h-3.5 w-3.5 mt-0.5 shrink-0", s.iconColor)} />
                <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium tracking-tight shrink-0", s.chip)}>
                  {b.category}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs leading-tight text-foreground">{b.text}</div>
                  {b.detail && (
                    <div className="text-[10px] text-muted-foreground mt-0.5">{b.detail}</div>
                  )}
                </div>
                {b.href && (
                  <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0 mt-1" />
                )}
              </div>
            );
            return (
              <li key={i}>
                {b.href ? (
                  <Link href={b.href} className="block hover:opacity-80 transition-opacity">
                    {inner}
                  </Link>
                ) : (
                  inner
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
