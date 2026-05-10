import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  formatKRW,
  formatKRWLong,
  formatInt,
  buildChange,
  buildAchievement,
  formatPctAbs,
} from "@/lib/format";
import { cn } from "@/lib/cn";
import { ArrowUp, ArrowDown, Minus, Sparkles } from "lucide-react";

type ComparisonInput = {
  label: string;       // "전월" / "전분기 동기간" / "전년 동월"
  prev: number;
  note?: string;       // "분기 진행률 33%" 등 옵션
};

type Target = {
  value: number;
  label?: string;       // "본월 목표"
};

type MetricCardProps = {
  label: string;
  current: number;
  unit?: "won" | "qty" | "raw";
  comparisons?: ComparisonInput[];
  target?: Target;
  hint?: string;
  highlight?: boolean;
};

function fmtValue(n: number, unit: "won" | "qty" | "raw"): { primary: string; secondary?: string } {
  if (unit === "won") return { primary: formatKRWLong(n), secondary: formatKRW(n) };
  if (unit === "qty") return { primary: `${formatInt(n)}개`, secondary: undefined };
  return { primary: formatInt(n), secondary: undefined };
}

function DirectionIcon({ direction }: { direction: ReturnType<typeof buildChange>["direction"] }) {
  const cls = "h-3 w-3";
  if (direction === "up") return <ArrowUp className={cn(cls, "text-emerald-600")} />;
  if (direction === "down") return <ArrowDown className={cn(cls, "text-rose-600")} />;
  if (direction === "new") return <Sparkles className={cn(cls, "text-violet-600")} />;
  if (direction === "lost") return <Minus className={cn(cls, "text-rose-600")} />;
  return <Minus className={cn(cls, "text-neutral-400")} />;
}

function directionTextClass(direction: ReturnType<typeof buildChange>["direction"]) {
  if (direction === "up" || direction === "new") return "text-emerald-700";
  if (direction === "down" || direction === "lost") return "text-rose-700";
  return "text-neutral-500";
}

export function MetricCard({
  label,
  current,
  unit = "won",
  comparisons = [],
  target,
  hint,
  highlight,
}: MetricCardProps) {
  const { primary, secondary } = fmtValue(current, unit);
  const ach = target ? buildAchievement(current, target.value) : null;

  return (
    <Card className={cn("avoid-break", highlight && "border-primary/40 bg-primary/[0.02]")}>
      <CardHeader className="pb-1">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs text-muted-foreground font-medium">{label}</CardTitle>
          {hint && <span className="text-[10px] text-muted-foreground">{hint}</span>}
        </div>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        <div>
          <div className="text-2xl font-bold tabular-nums leading-tight">{primary}</div>
          {secondary && unit === "won" && (
            <div className="text-[11px] text-muted-foreground tabular-nums">{secondary}</div>
          )}
        </div>

        {comparisons.length > 0 && (
          <>
            <Separator />
            <div className="space-y-1">
              {comparisons.map((c) => {
                const change = buildChange(current, c.prev, c.label);
                return (
                  <div key={c.label} className="flex items-start justify-between text-[11px]">
                    <div className="text-muted-foreground">
                      <div>{c.label}</div>
                      {c.note && <div className="text-[10px]">{c.note}</div>}
                    </div>
                    <div className="text-right">
                      <div className="tabular-nums text-foreground">
                        {change.prev > 0 ? formatKRWLong(change.prev) : "—"}
                      </div>
                      <div
                        className={cn(
                          "flex items-center gap-1 justify-end font-medium tabular-nums",
                          directionTextClass(change.direction),
                        )}
                      >
                        <DirectionIcon direction={change.direction} />
                        <span>{change.diffText}</span>
                        <span>({change.pctText})</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {ach && target && (
          <>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[11px] text-muted-foreground">
                  {target.label ?? "본월 목표"}
                </div>
                <div className="text-xs font-medium tabular-nums">{formatKRWLong(target.value)}</div>
              </div>
              <div className="text-right">
                {ach.status === "no-target" ? (
                  <Badge variant="muted">목표 미설정</Badge>
                ) : (
                  <>
                    <div
                      className={cn(
                        "text-base font-bold tabular-nums",
                        ach.status === "underperform" && "text-rose-600",
                        ach.status === "ontrack" && "text-amber-600",
                        ach.status === "near" && "text-emerald-600",
                        ach.status === "overperform" && "text-emerald-700",
                      )}
                    >
                      달성률 {formatPctAbs(ach.rate, 1)}
                    </div>
                    <div className="text-[10px] text-muted-foreground">{ach.diffText}</div>
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
