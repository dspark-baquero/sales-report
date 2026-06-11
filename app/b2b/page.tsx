import Link from "next/link";
import { loadFactCube, loadMonthRows, loadRangeRows } from "@/lib/load";
import { resolveMonth } from "@/lib/months";
import {
  kpi,
  ymMinusMonths,
  monthlyRevenueOf,
  topNProductsEnhanced,
  topNCustomersWithPrev,
} from "@/lib/aggregate";
import { computeB2BInsights } from "@/lib/tabInsights";
import { TabInsights } from "@/components/TabInsights";
import { YearToDateChart } from "@/components/YearToDateChart";
import {
  ytdMonths,
  ytdAchievementForCustomerKeys,
  ytdMonthlyTargets,
  ytdMonthlyPrevYear,
} from "@/lib/ytd";
import { CustomerLink } from "@/components/CustomerLink";
import {
  prevMonth,
  prevYearSameMonth,
  quarterOf,
  prevQuarter,
  quarterProgress,
} from "@/lib/compare";
import {
  b2bNonAgencyRows,
  revenueByCustomerType,
  b2bNewLost,
  b2bBrandRevenue,
} from "@/lib/dimensions";
import { attributeChange } from "@/lib/changeAttribution";
import { loadTargets, targetsForMonthWithProspective } from "@/lib/targets";
import { COMPARE_LABEL, BRAND_COLOR } from "@/lib/labels";
import { MetricCard } from "@/components/MetricCard";
import { ChangeBreakdown } from "@/components/ChangeBreakdown";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart } from "@/components/charts/BarChart";
import { DonutChart } from "@/components/charts/DonutChart";
import { TopProductsTable } from "@/components/TopProductsTable";
import {
  formatKRWLong,
  formatKRWShort,
  formatInt,
  formatYM,
  formatPctAbs,
  buildChange,
  buildAchievement,
} from "@/lib/format";

type SearchParams = Promise<{ month?: string }>;

const TYPE_COLORS: Record<string, string> = {
  병원: "#6366f1",
  "병원(프랜차이즈)": "#818cf8",
  "병원(대리점)": "#a5b4fc",
  피부관리실: "#10b981",
  "피부관리실(프랜차이즈)": "#34d399",
  "피부관리실(대리점)": "#6ee7b7",
  대리점: "#f59e0b",
  기타: "#9ca3af",
};

// 거래처 유형별 → target 키
function typeToTargetKey(type: string): string | null {
  if (type.startsWith("병원")) return "병원";
  if (type.startsWith("피부관리실")) return "피부관리실";
  return null;
}

export default async function B2BPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const ym = await resolveMonth(sp.month);
  const { qStart } = quarterOf(ym);
  const prevQ = prevQuarter(ym);
  const qProg = quarterProgress(ym);

  const [cube, targets, cur, prevMo, prevYr, curQ, prevQRows] = await Promise.all([
    loadFactCube(),
    loadTargets(),
    loadMonthRows(ym),
    loadMonthRows(prevMonth(ym)),
    loadMonthRows(prevYearSameMonth(ym)),
    loadRangeRows(qStart, ym),
    loadRangeRows(prevQ.qStart, prevQ.qEnd),
  ]);
  const insights = computeB2BInsights(cube, ym);

  const k = kpi(b2bNonAgencyRows(cur));
  const kPrevMo = kpi(b2bNonAgencyRows(prevMo));
  const kPrevYr = kpi(b2bNonAgencyRows(prevYr));
  const kCurQ = kpi(b2bNonAgencyRows(curQ));
  const kPrevQ = kpi(b2bNonAgencyRows(prevQRows));

  // B2B 전체 목표 (병원+피부관리실+직거래처, 대리점 제외)
  const ta = targetsForMonthWithProspective(targets, ym);
  const b2bTarget = ta
    .filter((t) => ["병원", "피부관리실", "직거래처"].includes(t.customerKey) && !t.prospective)
    .reduce((s, t) => s + t.target, 0);

  // 거래처 유형별 (대리점 제외)
  const byType = revenueByCustomerType(cur, { excludeAgency: true });
  const byTypePrevMo = new Map(revenueByCustomerType(prevMo, { excludeAgency: true }).map((t) => [t.type, t.revenue]));

  // 유형별 목표 (target.csv는 그룹 기준 — "병원" 합계로 매칭)
  const typeTargetByGroup = new Map<string, number>();
  for (const t of ta) {
    if (t.prospective) continue;
    if (["병원", "피부관리실", "직거래처"].includes(t.customerKey)) {
      typeTargetByGroup.set(
        t.customerKey,
        (typeTargetByGroup.get(t.customerKey) ?? 0) + t.target,
      );
    }
  }

  const activeCustomers = new Set(
    cur
      .filter((r) => r.category === "B2B" && r.b2bCustomerType !== "대리점" && !r.isNonRevenue && r.realRevenue > 0)
      .map((r) => r.customer),
  ).size;
  const activeCustomersPrev = new Set(
    prevMo
      .filter((r) => r.category === "B2B" && r.b2bCustomerType !== "대리점" && !r.isNonRevenue && r.realRevenue > 0)
      .map((r) => r.customer),
  ).size;

  // 거래처유형 12개월 추이
  const fromYM = ymMinusMonths(ym, 11);
  const rangeRows12 = await loadRangeRows(fromYM, ym);
  const typeKeys = byType.map((t) => t.type);
  const typeMonthlySeries = typeKeys.map((t) => ({
    type: t,
    series: monthlyRevenueOf(
      rangeRows12,
      fromYM,
      ym,
      (r) => r.category === "B2B" && r.b2bCustomerType === t,
    ),
  }));
  const trendMonths = typeMonthlySeries[0]?.series.map((s) => s.yearMonth) ?? [];

  // 신규/이탈 (대리점 제외, rangeRows12 covers 12 months)
  const { newOnes, lost } = b2bNewLost(
    rangeRows12.filter((r) => r.category === "B2B" && r.b2bCustomerType !== "대리점"),
    ym,
  );

  // B2B 브랜드 (대리점 제외)
  const brandRev = b2bBrandRevenue(cur, { excludeAgency: true });
  const brandTotal = brandRev.reduce((s, b) => s + b.revenue, 0);

  // Top 20 제품 (YTD)
  const [yearStr] = ym.split("-");
  const annualStart = `${yearStr}-01`;
  const ytdB2bRows = await loadRangeRows(annualStart, ym);
  const ytdNonAgency = b2bNonAgencyRows(ytdB2bRows);
  const topProducts = topNProductsEnhanced(b2bNonAgencyRows(cur), b2bNonAgencyRows(prevMo), ytdNonAgency, 20);

  // 변화 요인 — 거래처 단위 (대리점 제외)
  const customerContribs = attributeChange(
    b2bNonAgencyRows(cur),
    b2bNonAgencyRows(prevMo),
    (r) => r.customer || null,
  );

  // 상위 20 거래처 (대리점 제외, 전월 비교)
  const topCustomers = topNCustomersWithPrev(
    b2bNonAgencyRows(cur),
    b2bNonAgencyRows(prevMo),
    20,
  );

  // 전년 동기 매출 + 월별 목표 (B2B 대리점 제외)
  const prevYearStart = `${Number(yearStr) - 1}-01`;
  const prevYearEnd = prevYearSameMonth(ym);
  const prevYearRangeRows = await loadRangeRows(prevYearStart, prevYearEnd);
  const b2bKeySet = new Set(["병원", "피부관리실", "직거래처"]);
  const b2bMonthlyTargets = ytdMonthlyTargets(targets, ym, {
    targetFilter: (t) => b2bKeySet.has(t.customerKey),
  });
  const b2bMonthlyPrevYear = ytdMonthlyPrevYear(prevYearRangeRows, ym, {
    rowFilter: (r) => r.category === "B2B" && r.b2bCustomerType !== "대리점",
  });

  // YTD 누적 (B2B 대리점 제외) — 거래처 중심 단일 시리즈
  const months = ytdMonths(ym);
  const b2bYtdValues = months.map((m) => {
    const catRev = cube.byMonthCategory.get(m)?.get("B2B")?.revenue ?? 0;
    const agRev = cube.byMonthB2bType.get(m)?.get("대리점")?.revenue ?? 0;
    return Math.max(0, catRev - agRev);
  });

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{formatYM(ym)} B2B (대리점 제외)</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            활성 거래처 {formatInt(activeCustomers)}개 · 거래처 유형별·브랜드별 실적 (영업사원별 종합은 B2B종합 탭)
          </p>
        </div>
      </div>

      <TabInsights bullets={insights} />

      <YearToDateChart
        ym={ym}
        series={[{ name: "B2B (대리점 제외)", color: "#6366f1", values: b2bYtdValues }]}
        caption="B2B 월별 매출 (대리점 제외)"
        achievement={ytdAchievementForCustomerKeys(
          rangeRows12,
          targets,
          ym,
          ["병원", "피부관리실", "직거래처"],
          (r) => r.category === "B2B" && r.b2bCustomerType !== "대리점",
        )}
        achievementLabel="B2B (대리점 제외)"
        monthlyTargets={b2bMonthlyTargets}
        prevYearValues={b2bMonthlyPrevYear}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="B2B 실매출"
          current={k.revenue}
          comparisons={[
            { label: COMPARE_LABEL.prevMonth, prev: kPrevMo.revenue },
            { label: COMPARE_LABEL.curQuarter, prev: kPrevQ.revenue, note: `${qProg}/3개월` },
            { label: COMPARE_LABEL.prevYear, prev: kPrevYr.revenue },
          ]}
          target={{ value: b2bTarget, label: "B2B 목표 합계" }}
          highlight
        />
        <MetricCard
          label="활성 거래처 수"
          current={activeCustomers}
          unit="raw"
          unitSuffix="개"
          hint="이번달 매출 발생"
          comparisons={[{ label: COMPARE_LABEL.prevMonth, prev: activeCustomersPrev }]}
        />
        <MetricCard
          label="거래처당 평균 매출"
          current={activeCustomers > 0 ? k.revenue / activeCustomers : 0}
          comparisons={[
            {
              label: COMPARE_LABEL.prevMonth,
              prev: activeCustomersPrev > 0 ? kPrevMo.revenue / activeCustomersPrev : 0,
            },
          ]}
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
      </div>

      {/* 거래처 유형별 + 12개월 추이 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>거래처 유형별 비중</CardTitle>
          </CardHeader>
          <CardContent>
            <DonutChart
              items={byType.map((t) => ({
                name: t.type,
                value: t.revenue,
                color: TYPE_COLORS[t.type] ?? "#9ca3af",
              }))}
              height={260}
              showCenter={{
                label: "B2B 합계",
                value: formatKRWShort(k.revenue),
              }}
            />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>거래처 유형별 12개월 추이 (스택)</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart
              categories={trendMonths.map((m) => formatYM(m).replace("년 ", "/").replace("월", ""))}
              series={typeMonthlySeries.map((s) => ({
                name: s.type,
                values: s.series.map((m) => m.revenue),
                stack: "유형",
                color: TYPE_COLORS[s.type] ?? "#9ca3af",
              }))}
              height={260}
              yLabel="실매출"
            />
          </CardContent>
        </Card>
      </div>

      {/* 거래처 유형별 목표 vs 실적 표 */}
      <Card>
        <CardHeader>
          <CardTitle>거래처 유형별 목표 vs 실적</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="px-4 pb-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-muted-foreground border-b">
                  <th className="py-2">유형</th>
                  <th className="py-2 text-right">이번달 실매출</th>
                  <th className="py-2 text-right">전월</th>
                  <th className="py-2 text-right">전월 대비</th>
                  <th className="py-2 text-right">이번달 목표</th>
                  <th className="py-2 text-right">달성률</th>
                </tr>
              </thead>
              <tbody>
                {byType.map((t) => {
                  const pm = byTypePrevMo.get(t.type) ?? 0;
                  const tg = typeToTargetKey(t.type);
                  const target = tg ? typeTargetByGroup.get(tg) ?? 0 : 0;
                  const chMo = buildChange(t.revenue, pm, "전월");
                  const ach = buildAchievement(t.revenue, target);
                  const moCls =
                    chMo.direction === "up" || chMo.direction === "new"
                      ? "text-emerald-700"
                      : chMo.direction === "down" || chMo.direction === "lost"
                        ? "text-rose-700"
                        : "text-muted-foreground";
                  const achCls =
                    ach.status === "no-target"
                      ? "text-muted-foreground"
                      : ach.status === "underperform"
                        ? "text-rose-700"
                        : ach.status === "shortfall"
                          ? "text-amber-600"
                          : "text-emerald-700";
                  return (
                    <tr key={t.type} className="border-b last:border-0">
                      <td className="py-2 font-medium">{t.type}</td>
                      <td className="py-2 text-right tabular-nums">{formatKRWLong(t.revenue)}</td>
                      <td className="py-2 text-right tabular-nums text-muted-foreground">
                        {pm > 0 ? formatKRWLong(pm) : "—"}
                      </td>
                      <td className={`py-2 text-right tabular-nums ${moCls}`}>
                        <div>{chMo.diffText}</div>
                        <div className="text-[10px]">{chMo.pctText}</div>
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {target > 0 ? formatKRWLong(target) : "—"}
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

      {/* 거래처 변화 요인 */}
      <ChangeBreakdown
        title="전월 대비 거래처 변화 요인"
        prevTotal={kPrevMo.revenue}
        curTotal={k.revenue}
        contribs={customerContribs}
        topN={5}
        prevLabel={COMPARE_LABEL.prevMonth}
        hint="어느 거래처가 B2B 증감을 만들었는지 — 항목 클릭 시 거래처 분석으로 이동"
        customerLinkMonth={ym}
      />

      {/* 상위 20 거래처 (대리점 제외) */}
      <Card>
        <CardHeader>
          <CardTitle>이번달 상위 20 거래처 (대리점 제외, 전월 비교)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="px-4 pb-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-muted-foreground border-b">
                  <th className="py-2">거래처</th>
                  <th className="py-2 text-right">이번달 실매출</th>
                  <th className="py-2 text-right">전월 실매출</th>
                  <th className="py-2 text-right">차이</th>
                  <th className="py-2 text-right">변화율</th>
                </tr>
              </thead>
              <tbody>
                {topCustomers.map((c, i) => {
                  const ch = buildChange(c.current, c.prev, "전월");
                  const cls =
                    ch.direction === "up" || ch.direction === "new"
                      ? "text-emerald-700"
                      : ch.direction === "down" || ch.direction === "lost"
                        ? "text-rose-700"
                        : "text-muted-foreground";
                  return (
                    <tr key={c.customer} className="border-b last:border-0">
                      <td className="py-2 font-medium">
                        <span className="text-muted-foreground mr-1">{i + 1}</span>
                        <Link
                          href={`/accounts?customer=${encodeURIComponent(c.customer)}&month=${ym}`}
                          className="hover:underline"
                        >
                          {c.customer}
                        </Link>
                      </td>
                      <td className="py-2 text-right tabular-nums">{formatKRWLong(c.current)}</td>
                      <td className="py-2 text-right tabular-nums text-muted-foreground">
                        {c.prev > 0 ? formatKRWLong(c.prev) : "—"}
                      </td>
                      <td className={`py-2 text-right tabular-nums ${cls}`}>{ch.diffText}</td>
                      <td className={`py-2 text-right tabular-nums ${cls}`}>{ch.pctText}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* 신규/이탈 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>신규 거래처 (직전 6개월 무매출 → 이번달)</CardTitle>
              <Badge variant="info">{newOnes.length}개</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="px-4 pb-4 overflow-x-auto">
              {newOnes.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4">해당 없음</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] text-muted-foreground border-b">
                      <th className="py-2">거래처</th>
                      <th className="py-2 text-right">이번달 매출</th>
                    </tr>
                  </thead>
                  <tbody>
                    {newOnes.slice(0, 20).map((c) => (
                      <tr key={c.customer} className="border-b last:border-0">
                        <td className="py-2"><CustomerLink customer={c.customer} ym={ym} /></td>
                        <td className="py-2 text-right tabular-nums">{formatKRWLong(c.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>이탈 거래처 (직전 3개월 매출 → 이번달 0)</CardTitle>
              <Badge variant="negative">{lost.length}개</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="px-4 pb-4 overflow-x-auto">
              {lost.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4">해당 없음</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] text-muted-foreground border-b">
                      <th className="py-2">거래처</th>
                      <th className="py-2 text-right">직전 3개월 평균</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lost.slice(0, 20).map((c) => (
                      <tr key={c.customer} className="border-b last:border-0">
                        <td className="py-2"><CustomerLink customer={c.customer} ym={ym} /></td>
                        <td className="py-2 text-right tabular-nums">{formatKRWLong(c.prevAvg)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* B2B 브랜드 비중 */}
      <Card>
        <CardHeader>
          <CardTitle>B2B 브랜드별 매출 비중</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="px-4 pb-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-muted-foreground border-b">
                  <th className="py-2">브랜드</th>
                  <th className="py-2 text-right">실매출</th>
                  <th className="py-2 text-right">비중</th>
                </tr>
              </thead>
              <tbody>
                {brandRev.map((b) => (
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <TopProductsTable products={topProducts} title="이번달 상위 20 제품 (B2B, 대리점 제외)" ym={ym} />
    </div>
  );
}
