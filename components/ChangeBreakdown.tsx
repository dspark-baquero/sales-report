import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { WaterfallChart } from "@/components/charts/WaterfallChart";
import {
  buildWaterfall,
  topGainers,
  topDecliners,
  type ChangeContribution,
} from "@/lib/changeAttribution";
import { formatKRWLong, formatPct } from "@/lib/format";
import { cn } from "@/lib/cn";

type ChangeBreakdownProps = {
  title: string;
  prevTotal: number;
  curTotal: number;
  contribs: ChangeContribution[];
  topN?: number;
  prevLabel?: string;          // "전월" / "전년 동월"
  showWaterfall?: boolean;
  hint?: string;
};

function badgeForType(type: ChangeContribution["type"]) {
  switch (type) {
    case "신규":
      return <Badge variant="info">신규</Badge>;
    case "이탈":
      return <Badge variant="negative">이탈</Badge>;
    case "증가":
      return <Badge variant="positive">증가</Badge>;
    case "감소":
      return <Badge variant="negative">감소</Badge>;
    case "유지":
      return <Badge variant="muted">유지</Badge>;
  }
}

export function ChangeBreakdown({
  title,
  prevTotal,
  curTotal,
  contribs,
  topN = 5,
  prevLabel = "전월",
  showWaterfall = true,
  hint,
}: ChangeBreakdownProps) {
  const steps = buildWaterfall(prevTotal, curTotal, contribs, topN);
  const gainers = topGainers(contribs, topN);
  const decliners = topDecliners(contribs, topN);

  return (
    <Card className="avoid-break">
      <CardHeader className="pb-1">
        <div className="flex items-center justify-between">
          <CardTitle>{title}</CardTitle>
          {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
        </div>
        <div className="text-xs text-muted-foreground">
          {prevLabel} {formatKRWLong(prevTotal)} → 본월 {formatKRWLong(curTotal)} ({formatPct((curTotal - prevTotal) / Math.max(1, Math.abs(prevTotal)))})
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {showWaterfall && contribs.length > 0 && <WaterfallChart steps={steps} height={300} />}

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <div className="text-muted-foreground mb-1 font-medium">상승 요인 (상위 {topN})</div>
            {gainers.length === 0 ? (
              <div className="text-muted-foreground">—</div>
            ) : (
              <ul className="space-y-1">
                {gainers.map((g) => (
                  <li key={g.entity} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1 min-w-0">
                      {badgeForType(g.type)}
                      <span className="truncate">{g.entity}</span>
                    </div>
                    <div className="text-right shrink-0 tabular-nums">
                      <div className="text-emerald-700 font-medium">+{formatKRWLong(Math.abs(g.diff))}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {prevLabel} {formatKRWLong(g.prev)} → {formatKRWLong(g.current)}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <div className="text-muted-foreground mb-1 font-medium">하락 요인 (하위 {topN})</div>
            {decliners.length === 0 ? (
              <div className="text-muted-foreground">—</div>
            ) : (
              <ul className="space-y-1">
                {decliners.map((g) => (
                  <li key={g.entity} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1 min-w-0">
                      {badgeForType(g.type)}
                      <span className="truncate">{g.entity}</span>
                    </div>
                    <div className="text-right shrink-0 tabular-nums">
                      <div className="text-rose-700 font-medium">{formatKRWLong(g.diff)}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {prevLabel} {formatKRWLong(g.prev)} → {formatKRWLong(g.current)}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
