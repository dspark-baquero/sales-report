import { loadSalesRows, loadFactCube } from "@/lib/load";
import { resolveMonth } from "@/lib/months";
import {
  kpi,
  filterMonth,
  filterRange,
  ymMinusMonths,
  monthlyRevenueOf,
  dailyRevenue,
  dailyCumulative,
  weeklyRevenue,
} from "@/lib/aggregate";
import { computeDutyFreeInsights } from "@/lib/tabInsights";
import { TabInsights } from "@/components/TabInsights";
import { YearToDateChart } from "@/components/YearToDateChart";
import { ytdCustomerSeries } from "@/lib/ytd";
import {
  prevMonth,
  prevYearSameMonth,
  quarterOf,
  prevQuarter,
  quarterProgress,
} from "@/lib/compare";
import {
  dutyFreeRows,
  dutyFreeCustomers,
  dutyFreeBrandRevenue,
} from "@/lib/dimensions";
import { attributeChange } from "@/lib/changeAttribution";
import { loadTargets, targetsForMonthWithProspective } from "@/lib/targets";
import { COMPARE_LABEL, BRAND_COLOR } from "@/lib/labels";
import { MetricCard } from "@/components/MetricCard";
import { ChangeBreakdown } from "@/components/ChangeBreakdown";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart } from "@/components/charts/LineChart";
import { BarChart } from "@/components/charts/BarChart";
import {
  formatKRWLong,
  formatInt,
  formatYM,
  formatPctAbs,
  buildChange,
  buildAchievement,
} from "@/lib/format";

type SearchParams = Promise<{ month?: string }>;

export default async function DutyFreePage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const ym = resolveMonth(sp.month);
  const all = loadSalesRows();
  const cube = loadFactCube();
  const targets = loadTargets();
  const insights = computeDutyFreeInsights(cube, ym);

  const cur = filterMonth(all, ym);
  const prevMo = filterMonth(all, prevMonth(ym));
  const prevYr = filterMonth(all, prevYearSameMonth(ym));
  const { qStart } = quarterOf(ym);
  const prevQ = prevQuarter(ym);
  const curQ = filterRange(all, qStart, ym);
  const prevQRows = filterRange(all, prevQ.qStart, prevQ.qEnd);
  const qProg = quarterProgress(ym);

  const k = kpi(dutyFreeRows(cur));
  const kPrevMo = kpi(dutyFreeRows(prevMo));
  const kPrevYr = kpi(dutyFreeRows(prevYr));
  const kCurQ = kpi(dutyFreeRows(curQ));
  const kPrevQ = kpi(dutyFreeRows(prevQRows));

  // 면세점 목표 합산
  const ta = targetsForMonthWithProspective(targets, ym);
  const dutyTarget = ta
    .filter((t) => t.division === "국내" && t.customerKey === "면세점")
    .reduce((s, t) => s + t.target, 0);

  // 12개월 추이 (본 윈도우 + 전년 동기)
  const fromYM = ymMinusMonths(ym, 11);
  const monthly = monthlyRevenueOf(all, fromYM, ym, (r) => r.category === "면세점");
  const prevYearFrom = ymMinusMonths(fromYM, 12);
  const prevYearTo = ymMinusMonths(ym, 12);
  const monthlyPrevYear = monthlyRevenueOf(
    all,
    prevYearFrom,
    prevYearTo,
    (r) => r.category === "면세점",
  );
  const trendMonths = monthly.map((m) => m.yearMonth);

  // 거래처별
  const customers = dutyFreeCustomers(cur);
  const customersPrev = new Map(dutyFreeCustomers(prevMo).map((c) => [c.customer, c.revenue]));

  // 브랜드별 + 목표 (브랜드별 면세점 target)
  const brands = dutyFreeBrandRevenue(cur);
  const brandTotal = brands.reduce((s, b) => s + b.revenue, 0);
  const brandTargets = new Map<string, number>();
  for (const t of ta) {
    if (t.prospective || t.division !== "국내" || t.customerKey !== "면세점") continue;
    brandTargets.set(t.brand, (brandTargets.get(t.brand) ?? 0) + t.target);
  }

  // 일별 출고
  const daily = dailyRevenue(dutyFreeRows(cur));
  const cumulative = dailyCumulative(dutyFreeRows(cur));
  const cumulativePrev = dailyCumulative(dutyFreeRows(prevMo));
  const allDays = Array.from({ length: 31 }, (_, i) => i + 1);
  const buildDayLine = (cum: { day: number; cumulative: number }[]) => {
    const map = new Map(cum.map((d) => [d.day, d.cumulative]));
    let last = 0;
    return allDays.map((d) => {
      if (map.has(d)) last = map.get(d)!;
      return last;
    });
  };

  // 주차별
  const weekly = weeklyRevenue(dutyFreeRows(cur));

  // 변화 요인 — 거래처 단위
  const customerContribs = attributeChange(
    dutyFreeRows(cur),
    dutyFreeRows(prevMo),
    (r) => r.customer || null,
  );

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{formatYM(ym)} 면세점</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {customers.length}곳 거래처 · 이번달 출고 {formatInt(k.qty)}개
          </p>
        </div>
      </div>

      <TabInsights bullets={insights} />

      <YearToDateChart
        ym={ym}
        series={ytdCustomerSeries(cube, ym, 5, { category: "면세점" })}
        caption="거래처 Top 5 + 기타"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="면세 실매출"
          current={k.revenue}
          comparisons={[
            { label: COMPARE_LABEL.prevMonth, prev: kPrevMo.revenue },
            { label: COMPARE_LABEL.curQuarter, prev: kPrevQ.revenue, note: `${qProg}/3개월` },
            { label: COMPARE_LABEL.prevYear, prev: kPrevYr.revenue },
          ]}
          target={{ value: dutyTarget, label: "면세점 목표 합계" }}
          highlight
        />
        <MetricCard
          label="총 판매수량"
          current={k.qty}
          unit="qty"
          comparisons={[
            { label: COMPARE_LABEL.prevMonth, prev: kPrevMo.qty },
            { label: COMPARE_LABEL.prevYear, prev: kPrevYr.qty },
          ]}
        />
        <MetricCard
          label={customers[0] ? `최대 거래처: ${customers[0].customer}` : "최대 거래처"}
          current={customers[0]?.revenue ?? 0}
          comparisons={
            customers[0]
              ? [
                  {
                    label: COMPARE_LABEL.prevMonth,
                    prev: customersPrev.get(customers[0].customer) ?? 0,
                  },
                ]
              : []
          }
        />
        <MetricCard
          label="활성 거래처"
          current={customers.filter((c) => c.revenue > 0).length}
          unit="raw"
          unitSuffix="곳"
          hint="이번달 매출 발생"
          comparisons={[
            {
              label: COMPARE_LABEL.prevMonth,
              prev: dutyFreeCustomers(prevMo).filter((c) => c.revenue > 0).length,
            },
          ]}
        />
      </div>

      {/* 거래처 변화 요인 */}
      <ChangeBreakdown
        title="전월 대비 거래처 변화 요인"
        prevTotal={kPrevMo.revenue}
        curTotal={k.revenue}
        contribs={customerContribs}
        topN={5}
        prevLabel={COMPARE_LABEL.prevMonth}
        hint="어느 면세점 거래처가 이번달 증감을 만들었는지"
      />

      {/* 12개월 추이 + 전년 점선 */}
      <Card>
        <CardHeader>
          <CardTitle>면세 매출 12개월 추이 (전년 동기 점선)</CardTitle>
        </CardHeader>
        <CardContent>
          <LineChart
            categories={trendMonths.map((m) => formatYM(m).replace("년 ", "/").replace("월", ""))}
            series={[
              {
                name: "이번 12개월",
                values: monthly.map((m) => m.revenue),
                color: "#f59e0b",
              },
              {
                name: "전년 동기",
                values: monthlyPrevYear.map((m) => m.revenue),
                color: "#9ca3af",
                dashed: true,
              },
            ]}
            height={300}
            yLabel="실매출"
          />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>면세 거래처별 (이번달)</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="px-4 pb-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] text-muted-foreground border-b">
                    <th className="py-2">거래처</th>
                    <th className="py-2 text-right">이번달 실매출</th>
                    <th className="py-2 text-right">전월 매출</th>
                    <th className="py-2 text-right">변화</th>
                    <th className="py-2 text-right">수량</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((c) => {
                    const pm = customersPrev.get(c.customer) ?? 0;
                    const ch = buildChange(c.revenue, pm, "전월");
                    const cls =
                      ch.direction === "up" || ch.direction === "new"
                        ? "text-emerald-700"
                        : ch.direction === "down" || ch.direction === "lost"
                          ? "text-rose-700"
                          : "text-muted-foreground";
                    return (
                      <tr key={c.customer} className="border-b last:border-0">
                        <td className="py-2 font-medium">{c.customer}</td>
                        <td className="py-2 text-right tabular-nums">{formatKRWLong(c.revenue)}</td>
                        <td className="py-2 text-right tabular-nums text-muted-foreground">
                          {pm > 0 ? formatKRWLong(pm) : "—"}
                        </td>
                        <td className={`py-2 text-right tabular-nums ${cls}`}>
                          <div>{ch.diffText}</div>
                          <div className="text-[10px]">{ch.pctText}</div>
                        </td>
                        <td className="py-2 text-right tabular-nums">{formatInt(c.qty)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>면세 브랜드 분해 + 목표 달성률</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="px-4 pb-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] text-muted-foreground border-b">
                    <th className="py-2">브랜드</th>
                    <th className="py-2 text-right">실매출</th>
                    <th className="py-2 text-right">비중</th>
                    <th className="py-2 text-right">이번달 목표</th>
                    <th className="py-2 text-right">달성률</th>
                  </tr>
                </thead>
                <tbody>
                  {brands.map((b) => {
                    const tg = brandTargets.get(b.brand) ?? 0;
                    const ach = buildAchievement(b.revenue, tg);
                    const achCls =
                      ach.status === "no-target"
                        ? "text-muted-foreground"
                        : ach.status === "underperform"
                          ? "text-rose-700"
                          : ach.status === "ontrack"
                            ? "text-amber-600"
                            : "text-emerald-700";
                    return (
                      <tr key={b.brand} className="border-b last:border-0">
                        <td className="py-2">
                          <span
                            className="inline-block w-2 h-2 rounded-full mr-2"
                            style={{ backgroundColor: BRAND_COLOR[b.brand] ?? "#9ca3af" }}
                          />
                          {b.brand}
                        </td>
                        <td className="py-2 text-right tabular-nums">{formatKRWLong(b.revenue)}</td>
                        <td className="py-2 text-right tabular-nums">
                          {brandTotal > 0 ? formatPctAbs(b.revenue / brandTotal) : "—"}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {tg > 0 ? formatKRWLong(tg) : "—"}
                        </td>
                        <td className={`py-2 text-right tabular-nums font-medium ${achCls}`}>
                          {ach.status === "no-target" ? "—" : formatPctAbs(ach.rate, 1)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 일별 + 누적 */}
      <Card>
        <CardHeader>
          <CardTitle>{formatYM(ym)} 일별 출고 (누적 + 전월 비교)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <BarChart
            categories={daily.map((d) => `${d.day}일`)}
            series={[
              {
                name: "일별 실매출",
                values: daily.map((d) => d.revenue),
                color: "#f59e0b",
              },
            ]}
            height={220}
            showLegend={false}
            yLabel="실매출"
          />
          <LineChart
            categories={allDays.map((d) => `${d}일`)}
            series={[
              { name: "이번달 누적", values: buildDayLine(cumulative), color: "#0f172a" },
              {
                name: "전월 누적",
                values: buildDayLine(cumulativePrev),
                color: "#94a3b8",
                dashed: true,
              },
            ]}
            height={220}
            yLabel="누적 실매출"
          />
        </CardContent>
      </Card>

      {/* 주차별 */}
      <Card>
        <CardHeader>
          <CardTitle>주차별 출고 패턴</CardTitle>
        </CardHeader>
        <CardContent>
          <BarChart
            categories={weekly.map((w) => `${w.week}주차`)}
            series={[
              {
                name: "주차별 실매출",
                values: weekly.map((w) => w.revenue),
                color: "#f59e0b",
              },
            ]}
            height={200}
            showLegend={false}
            showValueLabels
            yLabel="실매출"
          />
        </CardContent>
      </Card>
    </div>
  );
}
