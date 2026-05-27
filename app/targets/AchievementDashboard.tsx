"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TargetGauge } from "@/components/TargetGauge";
import { BarChart } from "@/components/charts/BarChart";
import { formatKRWLong } from "@/lib/format";
import type { PeriodAgg } from "@/lib/targets";

function PeriodDetail({ period }: { period: PeriodAgg }) {
  const activeChannels = period.byChannel.filter((c) => !c.prospective && (c.target > 0 || c.actual > 0));
  const topBrands = period.byBrand.slice(0, 3);

  return (
    <div className="space-y-4">
      {/* 종합 + 상위 브랜드 게이지 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <TargetGauge
          title="종합"
          actual={period.totalActual}
          target={period.totalTarget}
          hint={period.periodDesc}
        />
        {topBrands.map((b) => (
          <TargetGauge
            key={b.brand}
            title={b.brand}
            actual={b.actual}
            target={b.target}
            hint={`목표 ${formatKRWLong(b.target)}`}
          />
        ))}
      </div>

      {/* 거래처별 목표 vs 실적 차트 */}
      {activeChannels.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>거래처별 목표 vs 실적</CardTitle>
            <div className="text-[11px] text-muted-foreground">
              {period.label} ({period.periodDesc}) — 브랜드 합계
            </div>
          </CardHeader>
          <CardContent>
            <BarChart
              categories={activeChannels.map((r) => `${r.division === "해외" ? "[해외] " : ""}${r.customerKey}`)}
              series={[
                {
                  name: "목표",
                  values: activeChannels.map((r) => r.target),
                  color: "#cbd5e1",
                },
                {
                  name: "실적",
                  values: activeChannels.map((r) => r.actual),
                  color: "#0f172a",
                },
              ]}
              height={Math.max(280, activeChannels.length * 32)}
              horizontal
              yLabel="실매출"
              showValueLabels
            />
          </CardContent>
        </Card>
      )}

      {/* 브랜드별 게이지 그리드 */}
      {period.byBrand.length > 3 && (
        <Card>
          <CardHeader>
            <CardTitle>브랜드별 달성률</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {period.byBrand.map((b) => (
                <TargetGauge
                  key={b.brand}
                  title={b.brand}
                  actual={b.actual}
                  target={b.target}
                  hint={`목표 ${formatKRWLong(b.target)}`}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export function AchievementDashboard({ periods }: { periods: PeriodAgg[] }) {
  const tabIds = ["month", "quarter", "half", "annual"];

  return (
    <Card>
      <CardHeader>
        <CardTitle>기간별 상세 달성 현황</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="month">
          <TabsList className="mb-4">
            {periods.map((p, i) => (
              <TabsTrigger key={tabIds[i]} value={tabIds[i]}>
                {p.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {periods.map((p, i) => (
            <TabsContent key={tabIds[i]} value={tabIds[i]}>
              <PeriodDetail period={p} />
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}
