import { loadSalesRows, loadFactCube } from "@/lib/load";
import { resolveMonth } from "@/lib/months";
import {
  kpi,
  filterMonth,
  filterRange,
  ymMinusMonths,
} from "@/lib/aggregate";
import { computeExportInsights } from "@/lib/tabInsights";
import { TabInsights } from "@/components/TabInsights";
import { YearToDateChart } from "@/components/YearToDateChart";
import { ytdCountrySeries } from "@/lib/ytd";
import {
  prevMonth,
  prevYearSameMonth,
  quarterOf,
  prevQuarter,
  quarterProgress,
} from "@/lib/compare";
import {
  exportRows,
  revenueByCountry,
  countryBrandMatrix,
  countryMonthlyTrend,
  exportCustomers,
} from "@/lib/dimensions";
import { attributeChange } from "@/lib/changeAttribution";
import { loadTargets, targetsForMonthWithProspective } from "@/lib/targets";
import { COMPARE_LABEL } from "@/lib/labels";
import { MetricCard } from "@/components/MetricCard";
import { ChangeBreakdown } from "@/components/ChangeBreakdown";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LineChart } from "@/components/charts/LineChart";
import { BarChart } from "@/components/charts/BarChart";
import { HeatmapChart } from "@/components/charts/HeatmapChart";
import {
  formatKRWLong,
  formatInt,
  formatYM,
  formatPctAbs,
  buildChange,
  buildAchievement,
} from "@/lib/format";

type SearchParams = Promise<{ month?: string }>;

export default async function ExportPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const ym = resolveMonth(sp.month);
  const all = loadSalesRows();
  const cube = loadFactCube();
  const targets = loadTargets();
  const insights = computeExportInsights(cube, ym);

  const cur = filterMonth(all, ym);
  const prevMo = filterMonth(all, prevMonth(ym));
  const prevYr = filterMonth(all, prevYearSameMonth(ym));
  const { qStart } = quarterOf(ym);
  const prevQ = prevQuarter(ym);
  const curQ = filterRange(all, qStart, ym);
  const prevQRows = filterRange(all, prevQ.qStart, prevQ.qEnd);
  const qProg = quarterProgress(ym);

  const curExp = exportRows(cur);
  const prevMoExp = exportRows(prevMo);
  const prevYrExp = exportRows(prevYr);
  const curQExp = exportRows(curQ);
  const prevQExp = exportRows(prevQRows);

  const k = kpi(curExp);
  const kPrevMo = kpi(prevMoExp);
  const kPrevYr = kpi(prevYrExp);
  const kCurQ = kpi(curQExp);
  const kPrevQ = kpi(prevQExp);

  // 수출 목표 합산 (구분=해외인 모든 target). actual 매칭은 불필요 — 페이지가 별도 집계로 처리.
  const ta = targetsForMonthWithProspective(targets, ym);
  const exportTargetTotal = ta.filter((t) => t.division === "해외").reduce((s, t) => s + t.target, 0);

  // 국가별
  const byCountry = revenueByCountry(cur);
  const byCountryPrev = new Map(revenueByCountry(prevMo).map((c) => [c.country, c.revenue]));
  const byCountryYoy = new Map(revenueByCountry(prevYr).map((c) => [c.country, c.revenue]));

  // 국가별 목표
  const countryTargets = new Map<string, number>();
  for (const t of ta) {
    if (t.division !== "해외" || t.prospective) continue;
    countryTargets.set(t.customerKey, (countryTargets.get(t.customerKey) ?? 0) + t.target);
  }

  // 12개월 추이
  const fromYM = ymMinusMonths(ym, 11);
  const trends = countryMonthlyTrend(all, fromYM, ym);
  const trendMonths = trends[0]?.months ?? [];

  // 국가 × 브랜드 히트맵
  const heatmap = countryBrandMatrix(cur);
  const heatmapData = heatmap.values.flatMap((row, ci) =>
    row.map((v, bi) => ({ x: bi, y: ci, value: v })),
  );

  // 거래처별
  const customers = exportCustomers(cur);
  const prevCustomerMap = new Map(exportCustomers(prevMo).map((c) => [c.customer, c.revenue]));

  // 변화 요인 — 국가 단위
  const countryContribs = attributeChange(curExp, prevMoExp, (r) => r.country || "기타");
  // 거래처 단위
  const customerContribs = attributeChange(curExp, prevMoExp, (r) => r.customer || null);

  // Top 거래처
  const topCustomer = customers[0];
  const topCustomerPrev = topCustomer ? prevCustomerMap.get(topCustomer.customer) ?? 0 : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{formatYM(ym)} 수출</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {byCountry.length}개국 · {customers.length}개 거래처 · 이번달 실매출 {formatKRWLong(k.revenue)}
          </p>
        </div>
      </div>

      <TabInsights bullets={insights} />

      <YearToDateChart
        ym={ym}
        series={ytdCountrySeries(cube, ym, 5)}
        caption="국가 Top 5 + 기타"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="수출 실매출"
          current={k.revenue}
          comparisons={[
            { label: COMPARE_LABEL.prevMonth, prev: kPrevMo.revenue },
            { label: COMPARE_LABEL.curQuarter, prev: kPrevQ.revenue, note: `${qProg}/3개월` },
            { label: COMPARE_LABEL.prevYear, prev: kPrevYr.revenue },
          ]}
          target={{ value: exportTargetTotal, label: "수출 목표 합계" }}
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
          label="활성 국가"
          current={byCountry.filter((c) => c.revenue > 0).length}
          unit="raw"
          unitSuffix="개국"
          hint="이번달 매출 발생 국가 수"
          comparisons={[
            {
              label: COMPARE_LABEL.prevMonth,
              prev: revenueByCountry(prevMo).filter((c) => c.revenue > 0).length,
            },
          ]}
        />
        <MetricCard
          label={topCustomer ? `최대 거래처: ${topCustomer.customer}` : "최대 거래처"}
          current={topCustomer?.revenue ?? 0}
          comparisons={
            topCustomer
              ? [{ label: COMPARE_LABEL.prevMonth, prev: topCustomerPrev }]
              : []
          }
          hint={topCustomer?.country}
        />
      </div>

      {/* 국가별 변화 요인 */}
      <ChangeBreakdown
        title="전월 대비 국가별 변화 요인"
        prevTotal={kPrevMo.revenue}
        curTotal={k.revenue}
        contribs={countryContribs}
        topN={5}
        prevLabel={COMPARE_LABEL.prevMonth}
        hint="어느 국가가 이번달 수출 증감을 만들었는지"
      />

      {/* 국가별 매출 + 목표 비교 표 */}
      <Card>
        <CardHeader>
          <CardTitle>국가별 매출 + 목표 달성률</CardTitle>
          <div className="text-[11px] text-muted-foreground">
            이번달 실매출 막대 + 목표 라인 (목표 미설정 국가는 — 표시)
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <BarChart
            categories={byCountry.map((c) => c.country)}
            series={[
              {
                name: "이번달 실매출",
                values: byCountry.map((c) => c.revenue),
                color: "#0ea5e9",
              },
              {
                name: "이번달 목표",
                values: byCountry.map((c) => countryTargets.get(c.country) ?? 0),
                color: "#cbd5e1",
              },
            ]}
            height={Math.max(280, byCountry.length * 38)}
            horizontal
            yLabel="실매출"
            showValueLabels
          />

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-muted-foreground border-b">
                  <th className="py-2">국가</th>
                  <th className="py-2 text-right">이번달 실매출</th>
                  <th className="py-2 text-right">전월 실매출</th>
                  <th className="py-2 text-right">전월 대비</th>
                  <th className="py-2 text-right">전년 동월</th>
                  <th className="py-2 text-right">전년 대비</th>
                  <th className="py-2 text-right">이번달 목표</th>
                  <th className="py-2 text-right">달성률</th>
                </tr>
              </thead>
              <tbody>
                {byCountry.map((c) => {
                  const pm = byCountryPrev.get(c.country) ?? 0;
                  const yy = byCountryYoy.get(c.country) ?? 0;
                  const tg = countryTargets.get(c.country) ?? 0;
                  const chMo = buildChange(c.revenue, pm, "전월");
                  const chYr = buildChange(c.revenue, yy, "전년");
                  const ach = buildAchievement(c.revenue, tg);
                  const moCls =
                    chMo.direction === "up" || chMo.direction === "new"
                      ? "text-emerald-700"
                      : chMo.direction === "down" || chMo.direction === "lost"
                        ? "text-rose-700"
                        : "text-muted-foreground";
                  const yrCls =
                    chYr.direction === "up" || chYr.direction === "new"
                      ? "text-emerald-700"
                      : chYr.direction === "down" || chYr.direction === "lost"
                        ? "text-rose-700"
                        : "text-muted-foreground";
                  const achCls =
                    ach.status === "no-target"
                      ? "text-muted-foreground"
                      : ach.status === "underperform"
                        ? "text-rose-700"
                        : ach.status === "ontrack"
                          ? "text-amber-600"
                          : "text-emerald-700";
                  return (
                    <tr key={c.country} className="border-b last:border-0">
                      <td className="py-2 font-medium">{c.country}</td>
                      <td className="py-2 text-right tabular-nums">{formatKRWLong(c.revenue)}</td>
                      <td className="py-2 text-right tabular-nums text-muted-foreground">
                        {pm > 0 ? formatKRWLong(pm) : "—"}
                      </td>
                      <td className={`py-2 text-right tabular-nums ${moCls}`}>
                        <div>{chMo.diffText}</div>
                        <div className="text-[10px]">{chMo.pctText}</div>
                      </td>
                      <td className="py-2 text-right tabular-nums text-muted-foreground">
                        {yy > 0 ? formatKRWLong(yy) : "—"}
                      </td>
                      <td className={`py-2 text-right tabular-nums ${yrCls}`}>
                        <div>{chYr.diffText}</div>
                        <div className="text-[10px]">{chYr.pctText}</div>
                      </td>
                      <td className="py-2 text-right tabular-nums">{tg > 0 ? formatKRWLong(tg) : "—"}</td>
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

      {/* 국가별 12개월 추이 */}
      <Card>
        <CardHeader>
          <CardTitle>국가별 12개월 추이 (상위 8개국)</CardTitle>
        </CardHeader>
        <CardContent>
          <LineChart
            categories={trendMonths.map((m) => formatYM(m).replace("년 ", "/").replace("월", ""))}
            series={trends.slice(0, 8).map((t) => ({
              name: t.country,
              values: t.values,
            }))}
            height={320}
            yLabel="실매출"
          />
        </CardContent>
      </Card>

      {/* 국가 × 브랜드 히트맵 */}
      {heatmap.brands.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>국가 × 브랜드 매출 (이번달)</CardTitle>
          </CardHeader>
          <CardContent>
            <HeatmapChart
              xCategories={heatmap.brands}
              yCategories={heatmap.countries}
              data={heatmapData}
              height={Math.max(280, heatmap.countries.length * 36)}
            />
          </CardContent>
        </Card>
      )}

      {/* 거래처 변화 요인 */}
      <ChangeBreakdown
        title="전월 대비 거래처별 변화 요인"
        prevTotal={kPrevMo.revenue}
        curTotal={k.revenue}
        contribs={customerContribs}
        topN={5}
        prevLabel={COMPARE_LABEL.prevMonth}
        hint="어느 거래처가 이번달 수출 증감을 만들었는지"
      />

      {/* 거래처별 표 */}
      <Card>
        <CardHeader>
          <CardTitle>거래처별 매출 (이번달)</CardTitle>
          <div className="text-[11px] text-muted-foreground">{customers.length}개 거래처 · 전월 비교 포함</div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="px-4 pb-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-muted-foreground border-b">
                  <th className="py-2">거래처</th>
                  <th className="py-2">국가</th>
                  <th className="py-2 text-right">이번달 실매출</th>
                  <th className="py-2 text-right">전월 실매출</th>
                  <th className="py-2 text-right">변화</th>
                  <th className="py-2 text-right">수량</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => {
                  const pm = prevCustomerMap.get(c.customer) ?? 0;
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
                      <td className="py-2 text-muted-foreground">{c.country}</td>
                      <td className="py-2 text-right tabular-nums">{formatKRWLong(c.revenue)}</td>
                      <td className="py-2 text-right tabular-nums text-muted-foreground">
                        {pm > 0 ? formatKRWLong(pm) : (
                          <Badge variant="info">신규</Badge>
                        )}
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
    </div>
  );
}
