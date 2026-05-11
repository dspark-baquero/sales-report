import { loadSalesRows, loadFactCube } from "@/lib/load";
import { resolveMonth } from "@/lib/months";
import {
  kpi,
  filterMonth,
  filterRange,
  ymMinusMonths,
  monthlyByCategory,
  dailyCumulative,
  topNCustomersWithPrev,
  topNProductsWithPrev,
  nonRevenueSummary,
  categoryRevenue,
} from "@/lib/aggregate";
import { computeOverviewInsights } from "@/lib/tabInsights";
import { TabInsights } from "@/components/TabInsights";
import { YearToDateChart } from "@/components/YearToDateChart";
import { ytdCategorySeries } from "@/lib/ytd";
import { AccountHighlights } from "@/components/AccountHighlights";
import {
  prevMonth,
  prevYearSameMonth,
  quarterOf,
  prevQuarter,
  quarterProgress,
} from "@/lib/compare";
import { attributeChange } from "@/lib/changeAttribution";
import { loadTargets } from "@/lib/targets";
import { COMPARE_LABEL, CATEGORY_COLOR } from "@/lib/labels";
import { MetricCard } from "@/components/MetricCard";
import { ChangeBreakdown } from "@/components/ChangeBreakdown";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LineChart } from "@/components/charts/LineChart";
import { BarChart } from "@/components/charts/BarChart";
import { DonutChart } from "@/components/charts/DonutChart";
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
  const ym = resolveMonth(sp.month);
  const all = loadSalesRows();
  const cube = loadFactCube();
  const targets = loadTargets();
  const insights = computeOverviewInsights(cube, ym);

  const cur = filterMonth(all, ym);
  const prevMo = filterMonth(all, prevMonth(ym));
  const prevYr = filterMonth(all, prevYearSameMonth(ym));
  const { qStart, qNumber } = quarterOf(ym);
  const prevQ = prevQuarter(ym);
  const curQ = filterRange(all, qStart, ym);
  const prevQRows = filterRange(all, prevQ.qStart, prevQ.qEnd);
  const qProg = quarterProgress(ym);

  const k = kpi(cur);
  const kPrevMo = kpi(prevMo);
  const kPrevYr = kpi(prevYr);
  const kCurQ = kpi(curQ);
  const kPrevQ = kpi(prevQRows);

  const catCur = categoryRevenue(cur);
  const catPrevMo = categoryRevenue(prevMo);
  const catPrevYr = categoryRevenue(prevYr);

  // 이번달 종합 목표 — 합계만 필요하므로 타겟 매칭 안 돌리고 단순 합산
  const totalTarget = targets
    .filter((t) => t.yearMonth === ym)
    .reduce((s, t) => s + t.target, 0);

  // 12개월 카테고리 스택
  const fromYM = ymMinusMonths(ym, 11);
  const stack = monthlyByCategory(all, fromYM, ym);
  const months = stack.map((s) => s.yearMonth);
  const categories: ("B2B" | "B2C" | "면세점")[] = ["B2B", "B2C", "면세점"];

  // 일별 누적
  const cumCur = dailyCumulative(cur);
  const cumPrev = dailyCumulative(prevMo);
  const cumYr = dailyCumulative(prevYr);
  const allDays = Array.from({ length: 31 }, (_, i) => i + 1);
  const buildDayLine = (cum: { day: number; cumulative: number }[]) => {
    const map = new Map(cum.map((d) => [d.day, d.cumulative]));
    let last = 0;
    return allDays.map((d) => {
      if (map.has(d)) last = map.get(d)!;
      return last;
    });
  };

  const topCustomers = topNCustomersWithPrev(cur, prevMo, 10);
  const topProducts = topNProductsWithPrev(cur, prevMo, 10);

  // 카테고리 변화 contributions
  const catContribs = categories.map((c) => {
    const current = catCur[c];
    const prev = catPrevMo[c];
    const diff = current - prev;
    const pct = prev !== 0 ? diff / Math.abs(prev) : null;
    const type =
      prev === 0 && current > 0
        ? ("신규" as const)
        : current === 0 && prev > 0
          ? ("이탈" as const)
          : current > prev
            ? ("증가" as const)
            : current < prev
              ? ("감소" as const)
              : ("유지" as const);
    return { entity: c, current, prev, diff, pct, type };
  });

  // 거래처 단위 변화
  const customerContribs = attributeChange(cur, prevMo, (r) => r.customer || null);

  // 비매출 출고
  const nrCur = nonRevenueSummary(cur);
  const nrPrev = nonRevenueSummary(prevMo);

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{formatYM(ym)} 종합 매출 보고서</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            이번달 실매출 {formatKRWLong(k.revenue)} · {qNumber}분기 진행률 {qProg}/3개월
          </p>
        </div>
        <Badge variant="outline" className="font-normal">
          비매출 출고 {nrCur.totalRows.toLocaleString("ko-KR")}건 별도 집계
        </Badge>
      </div>

      <TabInsights bullets={insights} />

      <YearToDateChart
        ym={ym}
        series={ytdCategorySeries(cube, ym)}
        caption="대분류별 (B2B / B2C / 면세점) 스택"
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
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
        <MetricCard
          label="B2B 실매출"
          current={catCur["B2B"]}
          comparisons={[
            { label: COMPARE_LABEL.prevMonth, prev: catPrevMo["B2B"] },
            { label: COMPARE_LABEL.prevYear, prev: catPrevYr["B2B"] },
          ]}
        />
        <MetricCard
          label="B2C 실매출"
          current={catCur["B2C"]}
          comparisons={[
            { label: COMPARE_LABEL.prevMonth, prev: catPrevMo["B2C"] },
            { label: COMPARE_LABEL.prevYear, prev: catPrevYr["B2C"] },
          ]}
        />
        <MetricCard
          label="면세점 실매출"
          current={catCur["면세점"]}
          comparisons={[
            { label: COMPARE_LABEL.prevMonth, prev: catPrevMo["면세점"] },
            { label: COMPARE_LABEL.prevYear, prev: catPrevYr["면세점"] },
          ]}
        />
      </div>

      <ChangeBreakdown
        title="전월 대비 카테고리 변화 요인"
        prevTotal={kPrevMo.revenue}
        curTotal={k.revenue}
        contribs={catContribs}
        topN={4}
        prevLabel={COMPARE_LABEL.prevMonth}
        hint="카테고리(B2B/B2C/면세점) 단위 분해"
      />

      <ChangeBreakdown
        title="전월 대비 거래처 변화 요인 (상위/하위 5)"
        prevTotal={kPrevMo.revenue}
        curTotal={k.revenue}
        contribs={customerContribs}
        topN={5}
        prevLabel={COMPARE_LABEL.prevMonth}
        hint="개별 거래처 단위 분해 — 어느 거래처가 증가/감소를 만들었는지"
      />

      <Card>
        <CardHeader>
          <CardTitle>이번달 일별 매출 누적</CardTitle>
          <div className="text-[11px] text-muted-foreground">
            이번달(굵은 선) · 전월 동일 일자(얇은 선) · 전년 동월(점선) — 일자별 누적치 비교
          </div>
        </CardHeader>
        <CardContent>
          <LineChart
            categories={allDays.map((d) => `${d}일`)}
            series={[
              { name: "이번달 누적", values: buildDayLine(cumCur), color: "#0f172a" },
              { name: COMPARE_LABEL.prevMonth, values: buildDayLine(cumPrev), color: "#94a3b8" },
              {
                name: COMPARE_LABEL.prevYear,
                values: buildDayLine(cumYr),
                color: "#94a3b8",
                dashed: true,
              },
            ]}
            height={300}
            yLabel="누적 실매출"
          />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
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

        <Card>
          <CardHeader>
            <CardTitle>이번달 카테고리 분포</CardTitle>
          </CardHeader>
          <CardContent>
            <DonutChart
              items={categories.map((c) => ({
                name: c,
                value: catCur[c],
                color: CATEGORY_COLOR[c],
              }))}
              height={300}
              showCenter={{
                label: "이번달 합계",
                value: formatKRWShort(k.revenue),
              }}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>이번달 상위 10 거래처 (전월 비교)</CardTitle>
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
                          {c.customer}
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

        <Card>
          <CardHeader>
            <CardTitle>이번달 상위 10 제품 (전월 비교)</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="px-4 pb-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] text-muted-foreground border-b">
                    <th className="py-2">제품</th>
                    <th className="py-2 text-right">수량</th>
                    <th className="py-2 text-right">이번달</th>
                    <th className="py-2 text-right">전월</th>
                    <th className="py-2 text-right">변화</th>
                  </tr>
                </thead>
                <tbody>
                  {topProducts.map((p, i) => {
                    const ch = buildChange(p.current, p.prev, "전월");
                    const cls =
                      ch.direction === "up" || ch.direction === "new"
                        ? "text-emerald-700"
                        : ch.direction === "down" || ch.direction === "lost"
                          ? "text-rose-700"
                          : "text-muted-foreground";
                    return (
                      <tr key={p.productName} className="border-b last:border-0">
                        <td className="py-2 max-w-[260px] truncate">
                          <span className="text-muted-foreground text-xs mr-1">{i + 1}</span>
                          <span className="text-muted-foreground text-xs mr-1">[{p.brand}]</span>
                          {p.productName}
                        </td>
                        <td className="py-2 text-right tabular-nums">{formatInt(p.qty)}</td>
                        <td className="py-2 text-right tabular-nums">{formatKRWLong(p.current)}</td>
                        <td className="py-2 text-right tabular-nums text-muted-foreground">
                          {p.prev > 0 ? formatKRWLong(p.prev) : "—"}
                        </td>
                        <td className={`py-2 text-right tabular-nums ${cls}`}>
                          <div>{ch.diffText}</div>
                          <div className="text-[10px]">{ch.pctText}</div>
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

      <AccountHighlights cube={cube} ym={ym} />

      <Card>
        <CardHeader>
          <CardTitle>비매출 출고 (증정·임직원·테스트 등)</CardTitle>
          <div className="text-[11px] text-muted-foreground">
            이번달 {formatInt(nrCur.totalRows)}건 · {formatInt(nrCur.totalQty)}개 · 원가 합계{" "}
            {formatKRWLong(nrCur.totalCost)} (전월 {formatInt(nrPrev.totalRows)}건 ·{" "}
            {formatKRWLong(nrPrev.totalCost)})
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="px-4 pb-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-muted-foreground border-b">
                  <th className="py-2">사업형태</th>
                  <th className="py-2 text-right">건수</th>
                  <th className="py-2 text-right">수량</th>
                  <th className="py-2 text-right">원가 합계</th>
                </tr>
              </thead>
              <tbody>
                {nrCur.byBizType.map((b) => (
                  <tr key={b.bizType} className="border-b last:border-0">
                    <td className="py-2">{b.bizType}</td>
                    <td className="py-2 text-right tabular-nums">{formatInt(b.rows)}</td>
                    <td className="py-2 text-right tabular-nums">{formatInt(b.qty)}</td>
                    <td className="py-2 text-right tabular-nums">{formatKRWLong(b.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
