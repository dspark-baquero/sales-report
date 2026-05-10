import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GaugeChart } from "@/components/charts/GaugeChart";
import { buildAchievement, formatKRWLong, formatPctAbs } from "@/lib/format";
import { cn } from "@/lib/cn";

type TargetGaugeProps = {
  title: string;
  actual: number;
  target: number;
  hint?: string;
  className?: string;
};

export function TargetGauge({ title, actual, target, hint, className }: TargetGaugeProps) {
  const ach = buildAchievement(actual, target);
  const statusLabel: Record<typeof ach.status, string> = {
    "no-target": "목표 미설정",
    underperform: "심각 미달",
    ontrack: "정상 진행",
    near: "근접 달성",
    overperform: "초과 달성",
  };
  const statusVariant: Record<typeof ach.status, "muted" | "negative" | "warn" | "positive"> = {
    "no-target": "muted",
    underperform: "negative",
    ontrack: "warn",
    near: "positive",
    overperform: "positive",
  };
  return (
    <Card className={cn("avoid-break", className)}>
      <CardHeader className="pb-1">
        <div className="flex items-center justify-between">
          <CardTitle>{title}</CardTitle>
          <Badge variant={statusVariant[ach.status]}>{statusLabel[ach.status]}</Badge>
        </div>
        {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
      </CardHeader>
      <CardContent>
        <GaugeChart rate={ach.rate} height={180} />
        <div className="grid grid-cols-2 gap-3 mt-2 text-sm">
          <div>
            <div className="text-[11px] text-muted-foreground">실적</div>
            <div className="font-semibold tabular-nums">{formatKRWLong(actual)}</div>
          </div>
          <div className="text-right">
            <div className="text-[11px] text-muted-foreground">목표</div>
            <div className="font-semibold tabular-nums">{formatKRWLong(target)}</div>
          </div>
          <div className="col-span-2 text-[11px] text-muted-foreground">
            {ach.diffText}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
