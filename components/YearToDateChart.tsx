// 올해 월별 매출 추이 (모든 탭 첫 화면 공통 차트).
// 1월 ~ ym 인클루시브 스택 막대. 시리즈는 호출 페이지가 lib/ytd.ts 로 빌드.
// achievement 가 주어지면 차트 옆에 누적 목표/실적/달성률 사이드 패널 노출.

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BarChart, type LineOverlay, type XAxisSubLabel } from "@/components/charts/BarChart";
import { YTDAchievementPanel } from "@/components/YTDAchievementPanel";
import { ytdMonthLabels } from "@/lib/ytd";
import { buildAchievement, formatPctAbs } from "@/lib/format";
import type { YTDSeries, YTDAchievement } from "@/lib/ytd";

type Props = {
  ym: string;
  series: YTDSeries[];
  title?: string;
  caption?: string;
  height?: number;
  achievement?: YTDAchievement | null;
  achievementLabel?: string;
  monthlyTargets?: number[];    // length === ytdMonths(ym).length
  prevYearValues?: number[];
};

export function YearToDateChart({
  ym,
  series,
  title,
  caption,
  height = 320,
  achievement,
  achievementLabel,
  monthlyTargets,
  prevYearValues,
}: Props) {
  const labels = ytdMonthLabels(ym);
  const year = ym.slice(0, 4);
  const firstMonth = Number(labels[0]?.replace("월", "")) || 1;
  const lastMonth = Number(labels[labels.length - 1]?.replace("월", "")) || 1;
  const range =
    labels.length === 1 ? `${firstMonth}월` : `${firstMonth}월~${lastMonth}월`;
  const heading = title ?? `${year}년 월별 매출 추이 (${range})`;

  const hasData = series.length > 0 && series.some((s) => s.values.some((v) => v > 0));

  const overlays: LineOverlay[] = [];
  if (monthlyTargets && monthlyTargets.some((v) => v > 0)) {
    overlays.push({
      name: "월별 목표",
      values: monthlyTargets,
      color: "#f59e0b",
      symbol: "diamond",
    });
  }
  if (prevYearValues && prevYearValues.some((v) => v > 0)) {
    overlays.push({
      name: "전년 동기",
      values: prevYearValues,
      color: "#94a3b8",
      dashed: true,
      symbol: "circle",
    });
  }

  // 각 월 라벨 아래 그 달의 달성률(스택 실적 합 / 그 달 목표) 표기.
  // 목표가 있는 달만 표기, 색상은 달성 상태로 구분.
  let xAxisSubLabels: (XAxisSubLabel | null)[] | undefined;
  if (monthlyTargets && monthlyTargets.some((v) => v > 0)) {
    xAxisSubLabels = labels.map((_, i) => {
      const target = monthlyTargets[i] ?? 0;
      const actual = series.reduce((sum, s) => sum + (s.values[i] ?? 0), 0);
      const ach = buildAchievement(actual, target);
      if (ach.status === "no-target" || ach.rate === null) return null;
      const tone: XAxisSubLabel["tone"] =
        ach.status === "underperform" ? "bad" : ach.status === "shortfall" ? "warn" : "good";
      return { text: formatPctAbs(ach.rate, 0), tone };
    });
  }

  const chart = hasData ? (
    <BarChart
      categories={labels}
      series={series.map((s) => ({
        name: s.name,
        values: s.values,
        color: s.color,
        stack: "ytd",
      }))}
      height={height}
      showLegend={series.length > 1 || overlays.length > 0}
      showValueLabels={false}
      showStackTotals
      lineOverlays={overlays.length > 0 ? overlays : undefined}
      xAxisSubLabels={xAxisSubLabels}
    />
  ) : (
    <div className="text-sm text-muted-foreground py-12 text-center">
      올해 데이터가 없습니다.
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{heading}</CardTitle>
        {caption ? <CardDescription>{caption}</CardDescription> : null}
      </CardHeader>
      <CardContent>
        {achievement ? (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            <div className="lg:col-span-3">{chart}</div>
            <div className="lg:col-span-1">
              <YTDAchievementPanel
                achievement={achievement}
                caption={achievementLabel}
                prevYearActual={
                  prevYearValues && prevYearValues.some((v) => v > 0)
                    ? prevYearValues.reduce((a, b) => a + b, 0)
                    : undefined
                }
              />
            </div>
          </div>
        ) : (
          chart
        )}
      </CardContent>
    </Card>
  );
}
