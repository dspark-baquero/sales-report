import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatKRWLong, formatPctAbs } from "@/lib/format";
import { cn } from "@/lib/cn";

type Props = {
  title: string;
  ytdActual: number;
  annualTarget: number;
  monthsElapsed: number;     // 1~12
  totalMonths?: number;       // 기본 12
  hint?: string;
};

// 연 목표 대비 진도 카드 — 표준 게이지로는 4월 25%가 "미달"로 잘못 읽힘.
// 시간 진도(예: 4/12=33.3%)를 마커로 함께 보여주고 페이스 평가를 구분.
export function AnnualProgressCard({
  title,
  ytdActual,
  annualTarget,
  monthsElapsed,
  totalMonths = 12,
  hint,
}: Props) {
  const achRate = annualTarget > 0 ? ytdActual / annualTarget : null;
  const timeRate = monthsElapsed / totalMonths;
  const pace = achRate !== null && timeRate > 0 ? achRate / timeRate : null;
  const expectedActual = annualTarget * timeRate;
  const diffFromPace = ytdActual - expectedActual;

  let paceLabel: string;
  let paceVariant: "positive" | "warn" | "negative" | "muted";
  if (achRate === null) {
    paceLabel = "목표 미설정";
    paceVariant = "muted";
  } else if (pace === null || !Number.isFinite(pace)) {
    paceLabel = "—";
    paceVariant = "muted";
  } else if (pace >= 1.0) {
    paceLabel = "페이스 정상";
    paceVariant = "positive";
  } else if (pace >= 0.85) {
    paceLabel = "페이스 근접";
    paceVariant = "warn";
  } else {
    paceLabel = "페이스 미달";
    paceVariant = "negative";
  }

  const barColor =
    achRate === null
      ? "bg-neutral-300"
      : pace !== null && pace >= 1.0
        ? "bg-emerald-600"
        : pace !== null && pace >= 0.85
          ? "bg-amber-500"
          : "bg-rose-600";

  const fillPct = achRate === null ? 0 : Math.min(100, Math.max(0, achRate * 100));
  const timeMarkerPct = Math.min(100, Math.max(0, timeRate * 100));

  return (
    <Card className="avoid-break">
      <CardHeader className="pb-1">
        <div className="flex items-center justify-between">
          <CardTitle>{title}</CardTitle>
          <Badge variant={paceVariant}>{paceLabel}</Badge>
        </div>
        {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <div className="text-2xl font-bold tabular-nums leading-tight">
            {achRate === null ? "—" : formatPctAbs(achRate, 1)}
          </div>
          <div className="text-[11px] text-muted-foreground tabular-nums">
            {formatKRWLong(ytdActual)} / {formatKRWLong(annualTarget)}
          </div>
        </div>

        {/* 진행 바 + 시간 마커 */}
        <div className="relative pt-3">
          {/* 시간 진도 마커 (위쪽 라벨) */}
          <div
            className="absolute top-0 -translate-x-1/2 text-[10px] text-neutral-500 tabular-nums whitespace-nowrap"
            style={{ left: `${timeMarkerPct}%` }}
          >
            시간 {monthsElapsed}/{totalMonths}
          </div>
          {/* 진행 바 */}
          <div className="relative h-2.5 bg-muted rounded-full overflow-visible">
            <div
              className={cn("h-full rounded-full transition-all", barColor)}
              style={{ width: `${fillPct}%` }}
            />
            {/* 시간 마커 라인 */}
            <div
              className="absolute top-[-4px] bottom-[-4px] w-0.5 bg-neutral-700"
              style={{ left: `${timeMarkerPct}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-xs">
          <div>
            <div className="text-[10px] text-muted-foreground">달성률</div>
            <div className="font-medium tabular-nums">
              {achRate === null ? "—" : formatPctAbs(achRate, 1)}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground">시간 진도</div>
            <div className="font-medium tabular-nums">{formatPctAbs(timeRate, 1)}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-muted-foreground">페이스</div>
            <div
              className={cn(
                "font-medium tabular-nums",
                pace !== null && pace >= 1.0 && "text-emerald-700",
                pace !== null && pace < 0.85 && "text-rose-700",
                pace !== null && pace >= 0.85 && pace < 1.0 && "text-amber-600",
              )}
            >
              {pace === null ? "—" : formatPctAbs(pace, 0)}
            </div>
          </div>
        </div>

        {achRate !== null && (
          <div className="text-[11px] text-muted-foreground tabular-nums">
            현 시점 예상 {formatKRWLong(expectedActual)} 대비{" "}
            <span
              className={cn(
                diffFromPace >= 0 ? "text-emerald-700" : "text-rose-700",
                "font-medium",
              )}
            >
              {diffFromPace >= 0 ? "+" : ""}
              {formatKRWLong(diffFromPace)}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
