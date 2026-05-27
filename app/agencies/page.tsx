import { loadFactCube, loadMonthRows, loadRangeRows } from "@/lib/load";
import { resolveMonth } from "@/lib/months";
import { kpi, ymMinusMonths, monthlyRevenueOf } from "@/lib/aggregate";
import { computeAgencyInsights } from "@/lib/tabInsights";
import { TabInsights } from "@/components/TabInsights";
import { YearToDateChart } from "@/components/YearToDateChart";
import { type YTDSeries, ytdMonths, buildYTDAchievement } from "@/lib/ytd";
import {
  prevMonth,
  prevYearSameMonth,
  quarterOf,
  prevQuarter,
  quarterProgress,
} from "@/lib/compare";
import { b2bAgencyRows, b2bNewLost } from "@/lib/dimensions";
import { attributeChange } from "@/lib/changeAttribution";
import { loadTargets, targetsForMonthWithProspective } from "@/lib/targets";
import { loadDealerTargets, buildDealerAchievements } from "@/lib/dealer-targets";
import { enumerateMonths } from "@/lib/aggregate";
import { COMPARE_LABEL } from "@/lib/labels";
import { MetricCard } from "@/components/MetricCard";
import { ChangeBreakdown } from "@/components/ChangeBreakdown";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LineChart } from "@/components/charts/LineChart";
import { BarChart } from "@/components/charts/BarChart";
import {
  formatKRWLong,
  formatKRWShort,
  formatInt,
  formatYM,
  formatPctAbs,
  buildChange,
  buildAchievement,
} from "@/lib/format";
import { revenueRows } from "@/lib/aggregate";
import Link from "next/link";

type SearchParams = Promise<{ month?: string }>;

export default async function AgenciesPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const ym = await resolveMonth(sp.month);
  const [cube, targets, dealerTargets] = await Promise.all([loadFactCube(), loadTargets(), loadDealerTargets()]);
  const insights = computeAgencyInsights(cube, ym);

  const { qStart } = quarterOf(ym);
  const prevQ = prevQuarter(ym);
  const qProg = quarterProgress(ym);

  const [cur, prevMo, prevYr, curQ, prevQRows] = await Promise.all([
    loadMonthRows(ym),
    loadMonthRows(prevMonth(ym)),
    loadMonthRows(prevYearSameMonth(ym)),
    loadRangeRows(qStart, ym),
    loadRangeRows(prevQ.qStart, prevQ.qEnd),
  ]);

  const agCur = b2bAgencyRows(cur);
  const agPrevMo = b2bAgencyRows(prevMo);
  const agPrevYr = b2bAgencyRows(prevYr);
  const agCurQ = b2bAgencyRows(curQ);
  const agPrevQ = b2bAgencyRows(prevQRows);

  const k = kpi(agCur);
  const kPrevMo = kpi(agPrevMo);
  const kPrevYr = kpi(agPrevYr);
  const kCurQ = kpi(agCurQ);
  const kPrevQ = kpi(agPrevQ);

  // 대리점 목표
  const ta = targetsForMonthWithProspective(targets, ym);
  const agencyTarget = ta
    .filter((t) => t.division === "국내" && t.customerKey === "대리점")
    .reduce((s, t) => s + t.target, 0);

  // 12개월 추이
  const fromYM = ymMinusMonths(ym, 11);
  const trendRows = await loadRangeRows(fromYM, ym);
  const monthly = monthlyRevenueOf(trendRows, fromYM, ym, (r) =>
    r.category === "B2B" && r.b2bCustomerType === "대리점",
  );

  // 거래처별 실적
  const custMap = new Map<string, { revenue: number; qty: number }>();
  for (const r of revenueRows(agCur)) {
    const c = custMap.get(r.customer) ?? { revenue: 0, qty: 0 };
    c.revenue += r.realRevenue;
    c.qty += r.qty;
    custMap.set(r.customer, c);
  }
  const agencyCustomers = [...custMap.entries()]
    .map(([customer, v]) => ({ customer, ...v }))
    .sort((a, b) => b.revenue - a.revenue);

  const custPrevMap = new Map<string, number>();
  for (const r of revenueRows(agPrevMo)) {
    custPrevMap.set(r.customer, (custPrevMap.get(r.customer) ?? 0) + r.realRevenue);
  }

  // 브랜드 분해
  const brandMap = new Map<string, number>();
  for (const r of revenueRows(agCur)) {
    brandMap.set(r.brand, (brandMap.get(r.brand) ?? 0) + r.realRevenue);
  }
  const agencyBrands = [...brandMap.entries()]
    .map(([brand, revenue]) => ({ brand, revenue }))
    .sort((a, b) => b.revenue - a.revenue);

  // 변화 요인
  const customerContribs = attributeChange(agCur, agPrevMo, (r) => r.customer || null);

  // ── 대리점별 목표 달성 ──
  const [yearStr] = ym.split("-");
  const annualStart = `${yearStr}-01`;
  const ytdAgMonths = enumerateMonths(annualStart, ym);
  const ytdAgRows = await loadRangeRows(annualStart, ym);
  const ytdAgencyAll = b2bAgencyRows(ytdAgRows);

  const monthAgActual = new Map<string, number>();
  for (const c of agencyCustomers) monthAgActual.set(c.customer, c.revenue);

  const ytdAgActual = new Map<string, number>();
  for (const r of ytdAgencyAll) {
    if (r.isNonRevenue) continue;
    ytdAgActual.set(r.customer, (ytdAgActual.get(r.customer) ?? 0) + r.realRevenue);
  }

  const agencyAch = buildDealerAchievements(
    dealerTargets, monthAgActual, ytdAgActual, ym, ytdAgMonths, "대리점",
  );
  const agencyAchTotal = {
    monthTarget: agencyAch.reduce((s, d) => s + d.monthTarget, 0),
    monthActual: agencyAch.reduce((s, d) => s + d.monthActual, 0),
    ytdTarget: agencyAch.reduce((s, d) => s + d.ytdTarget, 0),
    ytdActual: agencyAch.reduce((s, d) => s + d.ytdActual, 0),
  };

  // 신규/이탈 (대리점 필터 적용한 rows 전체 범위 필요)
  const allAgRows = b2bAgencyRows(trendRows);
  const newLost = b2bNewLost(
    // b2bNewLost 내부에서 b2bRows를 한 번 더 호출하므로 전체 rows를 전달
    // 대리점만 남기기 위해 직접 계산
    trendRows.filter((r) => r.category === "B2B" && r.b2bCustomerType === "대리점"),
    ym,
  );

  // YTD 시리즈 (대리점 월별)
  const months = ytdMonths(ym);
  const ytdSeries: YTDSeries[] = [{
    name: "대리점",
    color: "#8b5cf6",
    values: months.map((m) => {
      const cell = cube.byMonthB2bType.get(m)?.get("대리점");
      return cell?.revenue ?? 0;
    }),
  }];

  // YTD 달성
  const ytdAch = buildYTDAchievement(trendRows, targets, ym, {
    rowFilter: (r) => r.category === "B2B" && r.b2bCustomerType === "대리점",
    targetFilter: (t) => t.division === "국내" && t.customerKey === "대리점",
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">{formatYM(ym)} 대리점</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          {agencyCustomers.length}개 활성 거래처 · 이번달 출고 {formatInt(k.qty)}개
        </p>
      </div>

      <TabInsights bullets={insights} />

      <YearToDateChart
        ym={ym}
        series={ytdSeries}
        caption="대리점 월별 매출"
        achievement={ytdAch}
        achievementLabel="대리점"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="대리점 실매출"
          current={k.revenue}
          comparisons={[
            { label: COMPARE_LABEL.prevMonth, prev: kPrevMo.revenue },
            {
              label: COMPARE_LABEL.curQuarter,
              prev: kPrevQ.revenue,
              note: `${qProg}/3개월 진행`,
            },
            { label: COMPARE_LABEL.prevYear, prev: kPrevYr.revenue },
          ]}
          target={agencyTarget > 0 ? { value: agencyTarget, label: "이번달 목표" } : undefined}
          highlight
        />
        <MetricCard
          label="활성 거래처 수"
          current={agencyCustomers.length}
          comparisons={[
            { label: COMPARE_LABEL.prevMonth, prev: custPrevMap.size },
          ]}
          unit="qty"
        />
        <MetricCard
          label="거래처당 평균 매출"
          current={agencyCustomers.length > 0 ? k.revenue / agencyCustomers.length : 0}
          comparisons={[
            {
              label: COMPARE_LABEL.prevMonth,
              prev: custPrevMap.size > 0 ? kPrevMo.revenue / custPrevMap.size : 0,
            },
          ]}
        />
        <MetricCard
          label="총 판매수량"
          current={k.qty}
          comparisons={[
            { label: COMPARE_LABEL.prevMonth, prev: kPrevMo.qty },
            { label: COMPARE_LABEL.prevYear, prev: kPrevYr.qty },
          ]}
          unit="qty"
        />
      </div>

      <ChangeBreakdown
        title="전월 대비 거래처 변화 요인"
        prevTotal={kPrevMo.revenue}
        curTotal={k.revenue}
        contribs={customerContribs}
        topN={5}
        prevLabel={COMPARE_LABEL.prevMonth}
        hint="대리점 거래처 단위 분해"
      />

      {/* 대리점별 목표 달성 현황 */}
      {agencyAch.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>대리점별 목표 달성 현황</CardTitle>
              {agencyAchTotal.monthTarget > 0 && (
                <Badge variant={agencyAchTotal.monthActual >= agencyAchTotal.monthTarget ? "positive" : agencyAchTotal.monthActual >= agencyAchTotal.monthTarget * 0.7 ? "warn" : "negative"}>
                  종합 {formatPctAbs(agencyAchTotal.monthActual / agencyAchTotal.monthTarget, 1)}
                </Badge>
              )}
            </div>
            <div className="text-[11px] text-muted-foreground">
              이번달 목표 {formatKRWLong(agencyAchTotal.monthTarget)} · 실적 {formatKRWLong(agencyAchTotal.monthActual)} · 누적 달성률 {agencyAchTotal.ytdTarget > 0 ? formatPctAbs(agencyAchTotal.ytdActual / agencyAchTotal.ytdTarget, 1) : "—"}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <BarChart
              categories={agencyAch.map((d) => d.name)}
              series={[
                { name: "목표", values: agencyAch.map((d) => d.monthTarget), color: "#cbd5e1" },
                { name: "실적", values: agencyAch.map((d) => d.monthActual), color: "#8b5cf6" },
              ]}
              height={Math.max(200, agencyAch.length * 38)}
              horizontal
              showValueLabels
              yLabel="실매출"
            />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] text-muted-foreground border-b">
                    <th className="py-2">대리점</th>
                    <th className="py-2 text-right">이번달 목표</th>
                    <th className="py-2 text-right">이번달 실적</th>
                    <th className="py-2 text-right">달성률</th>
                    <th className="py-2 text-right">차이</th>
                    <th className="py-2 text-right">누적 목표</th>
                    <th className="py-2 text-right">누적 실적</th>
                    <th className="py-2 text-right">누적 달성률</th>
                  </tr>
                </thead>
                <tbody>
                  {agencyAch.map((d) => {
                    const diff = d.monthActual - d.monthTarget;
                    const mCls = d.monthRate === null ? "" : d.monthRate >= 1 ? "text-emerald-700 font-semibold" : d.monthRate >= 0.7 ? "text-amber-600" : "text-rose-700 font-semibold";
                    const yCls = d.ytdRate === null ? "" : d.ytdRate >= 1 ? "text-emerald-700" : d.ytdRate >= 0.7 ? "text-amber-600" : "text-rose-700";
                    const diffCls = diff >= 0 ? "text-emerald-700" : "text-rose-700";
                    return (
                      <tr key={d.name} className="border-b last:border-0">
                        <td className="py-2 font-medium">
                          <Link href={`/accounts?customer=${encodeURIComponent(d.name)}&month=${ym}`} className="hover:underline">
                            {d.name}
                          </Link>
                        </td>
                        <td className="py-2 text-right tabular-nums">{formatKRWLong(d.monthTarget)}</td>
                        <td className="py-2 text-right tabular-nums">{formatKRWLong(d.monthActual)}</td>
                        <td className={`py-2 text-right tabular-nums ${mCls}`}>{d.monthRate !== null ? formatPctAbs(d.monthRate, 1) : "—"}</td>
                        <td className={`py-2 text-right tabular-nums ${diffCls}`}>{diff >= 0 ? "+" : ""}{formatKRWLong(Math.abs(diff))}</td>
                        <td className="py-2 text-right tabular-nums text-muted-foreground">{formatKRWLong(d.ytdTarget)}</td>
                        <td className="py-2 text-right tabular-nums">{formatKRWLong(d.ytdActual)}</td>
                        <td className={`py-2 text-right tabular-nums ${yCls}`}>{d.ytdRate !== null ? formatPctAbs(d.ytdRate, 1) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>거래처별 실적</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="px-4 pb-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-muted-foreground border-b">
                  <th className="py-2">거래처</th>
                  <th className="py-2 text-right">이번달 실매출</th>
                  <th className="py-2 text-right">전월</th>
                  <th className="py-2 text-right">변화</th>
                  <th className="py-2 text-right">수량</th>
                </tr>
              </thead>
              <tbody>
                {agencyCustomers.map((c) => {
                  const prevRev = custPrevMap.get(c.customer) ?? 0;
                  const ch = buildChange(c.revenue, prevRev, "전월");
                  const cls =
                    ch.direction === "up" || ch.direction === "new"
                      ? "text-emerald-700"
                      : ch.direction === "down" || ch.direction === "lost"
                        ? "text-rose-700"
                        : "text-muted-foreground";
                  return (
                    <tr key={c.customer} className="border-b last:border-0">
                      <td className="py-2 font-medium">
                        <Link
                          href={`/accounts?customer=${encodeURIComponent(c.customer)}&month=${ym}`}
                          className="hover:underline"
                        >
                          {c.customer}
                        </Link>
                      </td>
                      <td className="py-2 text-right tabular-nums">{formatKRWLong(c.revenue)}</td>
                      <td className="py-2 text-right tabular-nums text-muted-foreground">
                        {prevRev > 0 ? formatKRWLong(prevRev) : "—"}
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
          <CardTitle>최근 12개월 대리점 매출 추이</CardTitle>
        </CardHeader>
        <CardContent>
          <BarChart
            categories={monthly.map((m) =>
              formatYM(m.yearMonth).replace("년 ", "/").replace("월", ""),
            )}
            series={[
              { name: "대리점 실매출", values: monthly.map((m) => m.revenue), color: "#8b5cf6" },
            ]}
            height={280}
            yLabel="실매출"
          />
        </CardContent>
      </Card>

      {agencyBrands.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>브랜드별 매출</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart
              categories={agencyBrands.map((b) => b.brand)}
              series={[
                { name: "실매출", values: agencyBrands.map((b) => b.revenue), color: "#8b5cf6" },
              ]}
              height={240}
              horizontal
              yLabel="실매출"
            />
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>신규 거래처</CardTitle>
            <div className="text-[11px] text-muted-foreground">
              이번달 매출 발생, 직전 6개월 매출 없음
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="px-4 pb-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] text-muted-foreground border-b">
                    <th className="py-2">거래처</th>
                    <th className="py-2 text-right">매출</th>
                  </tr>
                </thead>
                <tbody>
                  {newLost.newOnes.slice(0, 10).map((c) => (
                    <tr key={c.customer} className="border-b last:border-0">
                      <td className="py-2">
                        <Link
                          href={`/accounts?customer=${encodeURIComponent(c.customer)}&month=${ym}`}
                          className="hover:underline"
                        >
                          {c.customer}
                        </Link>
                      </td>
                      <td className="py-2 text-right tabular-nums text-emerald-700">
                        {formatKRWLong(c.revenue)}
                      </td>
                    </tr>
                  ))}
                  {newLost.newOnes.length === 0 && (
                    <tr><td colSpan={2} className="py-4 text-center text-muted-foreground">없음</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>이탈 거래처</CardTitle>
            <div className="text-[11px] text-muted-foreground">
              직전 3개월 평균 매출 있으나 이번달 0원
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="px-4 pb-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] text-muted-foreground border-b">
                    <th className="py-2">거래처</th>
                    <th className="py-2 text-right">직전 3개월 평균</th>
                  </tr>
                </thead>
                <tbody>
                  {newLost.lost.slice(0, 10).map((c) => (
                    <tr key={c.customer} className="border-b last:border-0">
                      <td className="py-2">
                        <Link
                          href={`/accounts?customer=${encodeURIComponent(c.customer)}&month=${ym}`}
                          className="hover:underline"
                        >
                          {c.customer}
                        </Link>
                      </td>
                      <td className="py-2 text-right tabular-nums text-rose-700">
                        {formatKRWLong(c.prevAvg)}
                      </td>
                    </tr>
                  ))}
                  {newLost.lost.length === 0 && (
                    <tr><td colSpan={2} className="py-4 text-center text-muted-foreground">없음</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
