import Link from "next/link";
import { loadFactCube, loadMonthRows, loadRangeRows } from "@/lib/load";
import { resolveMonth } from "@/lib/months";
import {
  kpi,
  ymMinusMonths,
  monthlyByCategory,
  topNCustomersWithPrev,
  nonRevenueSummary,
  categoryRevenue,
} from "@/lib/aggregate";
import { computeOverviewInsights } from "@/lib/tabInsights";
import { TabInsights } from "@/components/TabInsights";
import {
  topMovers,
  sleepingReturned,
  quarterlyCliff,
  lostKeyAccounts,
} from "@/lib/accountAnalysis";
import {
  prevMonth,
  prevYearSameMonth,
  quarterOf,
  prevQuarter,
  quarterProgress,
} from "@/lib/compare";
import { loadTargets } from "@/lib/targets";
import { COMPARE_LABEL, CATEGORY_COLOR } from "@/lib/labels";
import { MetricCard } from "@/components/MetricCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart } from "@/components/charts/BarChart";
import {
  formatKRWLong,
  formatKRWShort,
  formatInt,
  formatYM,
  buildChange,
} from "@/lib/format";

type SearchParams = Promise<{ month?: string }>;

export default async function HomePage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const ym = await resolveMonth(sp.month);
  const { qStart, qNumber } = quarterOf(ym);
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
  const insights = computeOverviewInsights(cube, ym);

  const k = kpi(cur);
  const kPrevMo = kpi(prevMo);
  const kPrevYr = kpi(prevYr);
  const kCurQ = kpi(curQ);
  const kPrevQ = kpi(prevQRows);

  const catCur = categoryRevenue(cur);
  const catPrevMo = categoryRevenue(prevMo);
  const catPrevYr = categoryRevenue(prevYr);

  const totalTarget = targets
    .filter((t) => t.yearMonth === ym)
    .reduce((s, t) => s + t.target, 0);

  // 채널별 매출
  const agencyFilter = (r: { category: string; b2bCustomerType: string | null }) =>
    r.category === "B2B" && r.b2bCustomerType === "대리점";
  const bhFilter = (r: { channel: string }) =>
    r.channel === "바크로하우스" || r.channel === "바크로하우스 스마트스토어";

  const agencyCur = cur.filter((r) => !r.isNonRevenue && agencyFilter(r)).reduce((s, r) => s + r.realRevenue, 0);
  const agencyPrevMo = prevMo.filter((r) => !r.isNonRevenue && agencyFilter(r)).reduce((s, r) => s + r.realRevenue, 0);
  const agencyPrevYr = prevYr.filter((r) => !r.isNonRevenue && agencyFilter(r)).reduce((s, r) => s + r.realRevenue, 0);

  const bhCur = cur.filter((r) => !r.isNonRevenue && bhFilter(r)).reduce((s, r) => s + r.realRevenue, 0);
  const bhPrevMo = prevMo.filter((r) => !r.isNonRevenue && bhFilter(r)).reduce((s, r) => s + r.realRevenue, 0);
  const bhPrevYr = prevYr.filter((r) => !r.isNonRevenue && bhFilter(r)).reduce((s, r) => s + r.realRevenue, 0);

  // 채널별 목표
  const ymTargets = targets.filter((t) => t.yearMonth === ym);
  const b2bKeys = new Set(["병원", "피부관리실"]);
  const b2cKeys = new Set(["공식몰", "종합몰", "소호몰"]);
  const b2bTarget = ymTargets.filter((t) => t.division === "국내" && b2bKeys.has(t.customerKey)).reduce((s, t) => s + t.target, 0);
  const b2cTarget = ymTargets.filter((t) => t.division === "국내" && b2cKeys.has(t.customerKey)).reduce((s, t) => s + t.target, 0);
  const dutyTarget = ymTargets.filter((t) => t.division === "국내" && t.customerKey === "면세점").reduce((s, t) => s + t.target, 0);
  const exportTarget = ymTargets.filter((t) => t.division === "해외").reduce((s, t) => s + t.target, 0);
  const agencyTarget = ymTargets.filter((t) => t.division === "국내" && t.customerKey === "대리점").reduce((s, t) => s + t.target, 0);
  const bhTarget = ymTargets.filter((t) => t.division === "국내" && t.customerKey === "바크로하우스").reduce((s, t) => s + t.target, 0);

  // 12개월 카테고리 스택
  const fromYM = ymMinusMonths(ym, 11);
  const rangeRows12 = await loadRangeRows(fromYM, ym);
  const stack = monthlyByCategory(rangeRows12, fromYM, ym);
  const months = stack.map((s) => s.yearMonth);
  const categories: ("B2B" | "B2C" | "면세점" | "수출")[] = ["B2B", "B2C", "면세점", "수출"];

  const topCustomers = topNCustomersWithPrev(cur, prevMo, 5);

  // 거래처 변동 요약
  const movers = topMovers(cube, ym, prevMonth(ym), 5);
  const sleeping = sleepingReturned(cube, ym, { minRevenue: 3_000_000 });
  const cliff = quarterlyCliff(cube, ym);
  const lost = lostKeyAccounts(cube, ym, { lookback: "quarter", topN: 10 });

  // 비매출 출고
  const nrCur = nonRevenueSummary(cur);
  const nrPrev = nonRevenueSummary(prevMo);

  const topGainer = movers.gainers[0];
  const topDecliner = movers.decliners[0];

  return (
    <div className="space-y-6">
      {/* 1. 헤더 */}
      <div>
        <h2 className="text-xl font-semibold tracking-tight">{formatYM(ym)} 종합 매출 보고서</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          이번달 실매출 {formatKRWLong(k.revenue)} · {qNumber}분기 진행률 {qProg}/3개월
        </p>
      </div>

      <TabInsights bullets={insights.slice(0, 5)} />

      {/* 2. KPI 카드 — 전체 + 채널별 (목표 달성률 포함) */}
      <MetricCard
        label="전체 실매출"
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
        target={{ value: totalTarget, label: "이번달 목표 합계" }}
        highlight
      />
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <MetricCard
          label="B2B"
          current={catCur["B2B"]}
          comparisons={[
            { label: COMPARE_LABEL.prevMonth, prev: catPrevMo["B2B"] },
          ]}
          target={b2bTarget > 0 ? { value: b2bTarget, label: "B2B 목표" } : undefined}
        />
        <MetricCard
          label="대리점"
          current={agencyCur}
          comparisons={[
            { label: COMPARE_LABEL.prevMonth, prev: agencyPrevMo },
          ]}
          target={agencyTarget > 0 ? { value: agencyTarget, label: "대리점 목표" } : undefined}
        />
        <MetricCard
          label="B2C"
          current={catCur["B2C"]}
          comparisons={[
            { label: COMPARE_LABEL.prevMonth, prev: catPrevMo["B2C"] },
          ]}
          target={b2cTarget > 0 ? { value: b2cTarget, label: "B2C 목표" } : undefined}
        />
        <MetricCard
          label="바크로하우스"
          current={bhCur}
          comparisons={[
            { label: COMPARE_LABEL.prevMonth, prev: bhPrevMo },
          ]}
          target={bhTarget > 0 ? { value: bhTarget, label: "바크로하우스 목표" } : undefined}
        />
        <MetricCard
          label="면세점"
          current={catCur["면세점"]}
          comparisons={[
            { label: COMPARE_LABEL.prevMonth, prev: catPrevMo["면세점"] },
          ]}
          target={dutyTarget > 0 ? { value: dutyTarget, label: "면세점 목표" } : undefined}
        />
        <MetricCard
          label="수출"
          current={catCur["수출"]}
          comparisons={[
            { label: COMPARE_LABEL.prevMonth, prev: catPrevMo["수출"] },
          ]}
          target={exportTarget > 0 ? { value: exportTarget, label: "수출 목표" } : undefined}
        />
      </div>

      {/* 3. 12개월 카테고리 스택바 */}
      <Card>
        <CardHeader>
          <CardTitle>최근 12개월 카테고리별 매출 추이</CardTitle>
        </CardHeader>
        <CardContent>
          <BarChart
            categories={months.map((m) => formatYM(m).replace("년 ", "/").replace("월", ""))}
            series={categories.map((c) => ({
              name: c,
              values: stack.map((s) => s.values[c]),
              stack: "월합계",
              color: CATEGORY_COLOR[c],
            }))}
            height={320}
            showLegend
            yLabel="실매출"
          />
        </CardContent>
      </Card>

      {/* 4. Top 5 거래처 */}
      <Card>
        <CardHeader>
          <CardTitle>이번달 상위 5 거래처 (전월 비교)</CardTitle>
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

      {/* 5. 거래처 변동 요약 */}
      <Card>
        <CardHeader>
          <CardTitle>거래처 변동 요약</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-[11px] text-muted-foreground">최대 상승</div>
              {topGainer ? (
                <>
                  <Link
                    href={`/accounts?customer=${encodeURIComponent(topGainer.customer)}&month=${ym}`}
                    className="font-medium hover:underline"
                  >
                    {topGainer.customer}
                  </Link>
                  <div className="text-emerald-700 tabular-nums text-xs">
                    +{formatKRWShort(topGainer.diff)}
                  </div>
                </>
              ) : (
                <div className="text-muted-foreground">—</div>
              )}
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">최대 하락</div>
              {topDecliner ? (
                <>
                  <Link
                    href={`/accounts?customer=${encodeURIComponent(topDecliner.customer)}&month=${ym}`}
                    className="font-medium hover:underline"
                  >
                    {topDecliner.customer}
                  </Link>
                  <div className="text-rose-700 tabular-nums text-xs">
                    {formatKRWShort(topDecliner.diff)}
                  </div>
                </>
              ) : (
                <div className="text-muted-foreground">—</div>
              )}
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">동면 복귀</div>
              <div className="text-lg font-semibold tabular-nums">{sleeping.length}건</div>
              {sleeping.length > 0 && (
                <div className="text-[10px] text-muted-foreground">
                  최대: {sleeping[0].customer}
                </div>
              )}
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">경보</div>
              <div className="flex gap-3">
                {cliff.length > 0 && (
                  <Badge variant="negative" className="text-xs">분기 절벽 {cliff.length}건</Badge>
                )}
                {lost.length > 0 && (
                  <Badge variant="negative" className="text-xs">핵심 이탈 {lost.length}건</Badge>
                )}
                {cliff.length === 0 && lost.length === 0 && (
                  <span className="text-muted-foreground">없음</span>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 6. 비매출 출고 1줄 요약 */}
      <div className="text-xs text-muted-foreground px-1">
        비매출 출고: 이번달 {formatInt(nrCur.totalRows)}건 · {formatInt(nrCur.totalQty)}개 · 원가 합계{" "}
        {formatKRWLong(nrCur.totalCost)} (전월 {formatInt(nrPrev.totalRows)}건 ·{" "}
        {formatKRWLong(nrPrev.totalCost)})
      </div>
    </div>
  );
}
