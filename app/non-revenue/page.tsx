import Link from "next/link";
import { loadFactCube, loadMonthRows } from "@/lib/load";
import { resolveMonth } from "@/lib/months";
import {
  ymMinusMonths,
  enumerateMonths,
  nonRevenueSummary,
  nonRevenueByCustomer,
  nonRevenueByProduct,
  nonRevenueByBrand,
  nonRevenueChannelBizMatrix,
} from "@/lib/aggregate";
import { prevMonth, prevYearSameMonth } from "@/lib/compare";
import { computeNonRevenueInsights } from "@/lib/tabInsights";
import { TabInsights } from "@/components/TabInsights";
import { MetricCard } from "@/components/MetricCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart } from "@/components/charts/BarChart";
import { DonutChart } from "@/components/charts/DonutChart";
import { COMPARE_LABEL } from "@/lib/labels";
import {
  formatKRWLong,
  formatKRWShort,
  formatInt,
  formatPct,
  formatPctAbs,
  formatYM,
  buildChange,
} from "@/lib/format";
import { customerHref } from "@/components/CustomerLink";

type SearchParams = Promise<{ month?: string }>;

// 사업형태별 고정 색상 — 임직원 출고는 차분한 톤, 증정은 amber 그라데이션
const BIZTYPE_COLORS: Record<string, string> = {
  "증정 (기타)": "#fbbf24",
  "증정 (마케팅)": "#f59e0b",
  "증정 (영업)": "#d97706",
  "임직원": "#60a5fa",
  "직원": "#22d3ee",
  "거래처 직원": "#38bdf8",
  "마케팅용": "#a78bfa",
  "테스트 (수입허가)": "#94a3b8",
  "파손제품": "#fb7185",
  "교육": "#34d399",
  "(기타)": "#cbd5e1",
};

function bizColor(bt: string): string {
  return BIZTYPE_COLORS[bt] ?? "#cbd5e1";
}

export default async function NonRevenuePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const ym = await resolveMonth(sp.month);
  const prevYM = prevMonth(ym);
  const prevYrYM = prevYearSameMonth(ym);

  const [cube, cur, prevMo, prevYr] = await Promise.all([
    loadFactCube(),
    loadMonthRows(ym),
    loadMonthRows(prevYM),
    loadMonthRows(prevYrYM),
  ]);

  // ── KPI ──
  const sumCur = nonRevenueSummary(cur);
  const sumPrev = nonRevenueSummary(prevMo);
  const sumPrevYr = nonRevenueSummary(prevYr);

  // 매출+비매출 총원가로 비매출 비율 계산 (cost null은 0)
  const totalCost = (rs: typeof cur) =>
    rs.reduce((s, r) => s + (r.cost !== null ? r.cost : 0), 0);
  const revCostCur = totalCost(cur) - sumCur.totalCost;
  const revCostPrev = totalCost(prevMo) - sumPrev.totalCost;
  const nrRatioCur =
    revCostCur + sumCur.totalCost > 0
      ? sumCur.totalCost / (revCostCur + sumCur.totalCost)
      : 0;
  const nrRatioPrev =
    revCostPrev + sumPrev.totalCost > 0
      ? sumPrev.totalCost / (revCostPrev + sumPrev.totalCost)
      : 0;

  // ── 인사이트 ──
  const insights = computeNonRevenueInsights(cube, ym);

  // ── 사업형태별 (전월 비교 포함) ──
  const prevBizMap = new Map(sumPrev.byBizType.map((b) => [b.bizType, b]));
  const bizRows = sumCur.byBizType.map((b) => {
    const p = prevBizMap.get(b.bizType);
    const prevCost = p?.cost ?? 0;
    const ch = buildChange(b.cost, prevCost, "전월");
    return { ...b, prevCost, change: ch };
  });

  // ── 12개월 사업형태별 스택 추이 ──
  const fromYM = ymMinusMonths(ym, 11);
  const months = enumerateMonths(fromYM, ym);
  const seenBiz = new Set<string>();
  for (const m of months) {
    const map = cube.byMonthNonRevBizType.get(m);
    if (!map) continue;
    for (const bt of map.keys()) seenBiz.add(bt);
  }
  // 색상 매핑이 있는 항목 먼저, 그 외는 그 다음
  const bizOrdered = [...seenBiz].sort((a, b) => {
    const ha = a in BIZTYPE_COLORS ? 0 : 1;
    const hb = b in BIZTYPE_COLORS ? 0 : 1;
    if (ha !== hb) return ha - hb;
    return a.localeCompare(b);
  });
  const trendSeries = bizOrdered.map((bt) => ({
    name: bt,
    color: bizColor(bt),
    stack: "월합계",
    values: months.map(
      (m) => cube.byMonthNonRevBizType.get(m)?.get(bt)?.cost ?? 0,
    ),
  }));

  // ── 거래처 Top 20 ──
  const topCustomers = nonRevenueByCustomer(cur, 20);

  // ── 채널대분류 × 사업형태 매트릭스 ──
  const matrix = nonRevenueChannelBizMatrix(cur);

  // ── 브랜드 ──
  const byBrand = nonRevenueByBrand(cur);

  // ── 제품 Top 20 ──
  const topProducts = nonRevenueByProduct(cur, 20);

  // 도넛 데이터
  const donutItems = sumCur.byBizType
    .filter((b) => b.cost > 0)
    .map((b) => ({
      name: b.bizType,
      value: b.cost,
      color: bizColor(b.bizType),
    }));

  // KPI subtitle
  const totalDiff = sumCur.totalCost - sumPrev.totalCost;
  const totalPct =
    sumPrev.totalCost > 0 ? totalDiff / sumPrev.totalCost : null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">
          {formatYM(ym)} 비매출 출고
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          이번달 {formatInt(sumCur.totalRows)}건 · {formatInt(sumCur.totalQty)}개 ·
          원가 {formatKRWLong(sumCur.totalCost)}
          {totalPct !== null && (
            <>
              {" "}(전월 대비 {totalDiff >= 0 ? "+" : ""}
              {formatKRWShort(totalDiff)}, {formatPct(totalPct, 0)})
            </>
          )}
        </p>
      </div>

      <TabInsights bullets={insights} title="비매출 출고 핵심 변동" />

      {/* KPI 카드 4개 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          label="비매출 건수"
          current={sumCur.totalRows}
          unit="raw"
          unitSuffix="건"
          comparisons={[
            { label: COMPARE_LABEL.prevMonth, prev: sumPrev.totalRows },
            { label: COMPARE_LABEL.prevYear, prev: sumPrevYr.totalRows },
          ]}
        />
        <MetricCard
          label="비매출 수량"
          current={sumCur.totalQty}
          unit="qty"
          comparisons={[
            { label: COMPARE_LABEL.prevMonth, prev: sumPrev.totalQty },
            { label: COMPARE_LABEL.prevYear, prev: sumPrevYr.totalQty },
          ]}
        />
        <MetricCard
          label="비매출 원가"
          current={sumCur.totalCost}
          comparisons={[
            { label: COMPARE_LABEL.prevMonth, prev: sumPrev.totalCost },
            { label: COMPARE_LABEL.prevYear, prev: sumPrevYr.totalCost },
          ]}
          highlight
        />
        <Card className="avoid-break">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-muted-foreground font-medium">
              비매출 원가 비율
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            <div>
              <div className="text-2xl font-bold tabular-nums leading-tight">
                {formatPctAbs(nrRatioCur, 1)}
              </div>
              <div className="text-[11px] text-muted-foreground">
                비매출 / (매출+비매출) 원가
              </div>
            </div>
            <div className="text-[11px] text-muted-foreground">
              전월{" "}
              <span className="tabular-nums text-foreground">
                {formatPctAbs(nrRatioPrev, 1)}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 사업형태별 분포 + 테이블 */}
      <Card>
        <CardHeader>
          <CardTitle>사업형태별 분포</CardTitle>
          <div className="text-[11px] text-muted-foreground">
            원가 기준 비중 + 전월 비교
          </div>
        </CardHeader>
        <CardContent>
          {donutItems.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              이번달 비매출 출고 없음
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <DonutChart
                items={donutItems}
                height={260}
                showCenter={{
                  label: "비매출 원가",
                  value: formatKRWShort(sumCur.totalCost),
                }}
              />
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] text-muted-foreground border-b">
                      <th className="py-2">사업형태</th>
                      <th className="py-2 text-right">행</th>
                      <th className="py-2 text-right">수량</th>
                      <th className="py-2 text-right">원가</th>
                      <th className="py-2 text-right">전월 변화</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bizRows.map((b) => {
                      const cls =
                        b.change.direction === "up"
                          ? "text-emerald-700"
                          : b.change.direction === "down"
                            ? "text-rose-700"
                            : "text-muted-foreground";
                      return (
                        <tr
                          key={b.bizType}
                          className="border-b last:border-0"
                        >
                          <td className="py-2 font-medium flex items-center gap-1.5">
                            <span
                              className="inline-block w-2.5 h-2.5 rounded-sm"
                              style={{ backgroundColor: bizColor(b.bizType) }}
                            />
                            {b.bizType}
                          </td>
                          <td className="py-2 text-right tabular-nums">
                            {formatInt(b.rows)}
                          </td>
                          <td className="py-2 text-right tabular-nums">
                            {formatInt(b.qty)}
                          </td>
                          <td className="py-2 text-right tabular-nums">
                            {formatKRWLong(b.cost)}
                          </td>
                          <td
                            className={`py-2 text-right tabular-nums ${cls}`}
                          >
                            <div>{b.change.diffText}</div>
                            <div className="text-[10px]">
                              {b.change.pctText}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 12개월 추이 */}
      {trendSeries.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>최근 12개월 사업형태별 원가 추이</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart
              categories={months.map((m) =>
                formatYM(m).replace("년 ", "/").replace("월", ""),
              )}
              series={trendSeries}
              height={320}
              showLegend
              yLabel="비매출 원가"
              showStackTotals
            />
          </CardContent>
        </Card>
      )}

      {/* 거래처 Top 20 */}
      <Card>
        <CardHeader>
          <CardTitle>비매출 거래처 Top 20</CardTitle>
          <div className="text-[11px] text-muted-foreground">
            원가 내림차순 · 거래처명 클릭 시 거래처 분석으로 이동
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="px-4 pb-4 overflow-x-auto">
            {topCustomers.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                이번달 비매출 출고 없음
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] text-muted-foreground border-b">
                    <th className="py-2">거래처</th>
                    <th className="py-2">주요 사업형태 (원가 비중)</th>
                    <th className="py-2 text-right">행</th>
                    <th className="py-2 text-right">수량</th>
                    <th className="py-2 text-right">원가</th>
                  </tr>
                </thead>
                <tbody>
                  {topCustomers.map((c, i) => (
                    <tr key={c.customer} className="border-b last:border-0">
                      <td className="py-2 font-medium">
                        <span className="text-muted-foreground mr-1">
                          {i + 1}
                        </span>
                        <Link
                          href={customerHref(c.customer, ym)}
                          className="hover:underline"
                        >
                          {c.customer}
                        </Link>
                      </td>
                      <td className="py-2 text-[11px] text-muted-foreground">
                        {c.bizTypeMix
                          .slice(0, 3)
                          .map(
                            (m) =>
                              `${m.bizType} ${formatPctAbs(m.share, 0)}`,
                          )
                          .join(" · ")}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {formatInt(c.rows)}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {formatInt(c.qty)}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {formatKRWLong(c.cost)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 채널대분류 × 사업형태 매트릭스 */}
      {matrix.bizTypes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>채널 × 사업형태 매트릭스</CardTitle>
            <div className="text-[11px] text-muted-foreground">
              원가 기준 — 어떤 채널에서 어떤 사업형태가 가장 많이 발생하나
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="px-4 pb-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] text-muted-foreground border-b">
                    <th className="py-2 pr-2">채널</th>
                    {matrix.bizTypes.map((bt) => (
                      <th key={bt} className="py-2 px-1 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <span
                            className="inline-block w-2 h-2 rounded-sm"
                            style={{ backgroundColor: bizColor(bt) }}
                          />
                          <span className="whitespace-nowrap">{bt}</span>
                        </div>
                      </th>
                    ))}
                    <th className="py-2 pl-2 text-right">합계</th>
                  </tr>
                </thead>
                <tbody>
                  {matrix.channels.map((ch) => {
                    const chT = matrix.channelTotals.get(ch);
                    if (!chT || chT.cost === 0) return null;
                    return (
                      <tr key={ch} className="border-b last:border-0">
                        <td className="py-2 pr-2 font-medium">{ch}</td>
                        {matrix.bizTypes.map((bt) => {
                          const cell = matrix.cells.get(`${ch}|${bt}`);
                          return (
                            <td
                              key={bt}
                              className="py-2 px-1 text-right tabular-nums text-muted-foreground"
                            >
                              {cell && cell.cost > 0
                                ? formatKRWShort(cell.cost)
                                : "—"}
                            </td>
                          );
                        })}
                        <td className="py-2 pl-2 text-right tabular-nums font-semibold">
                          {formatKRWLong(chT.cost)}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="border-t-2 bg-muted/30">
                    <td className="py-2 pr-2 font-medium">합계</td>
                    {matrix.bizTypes.map((bt) => {
                      const btT = matrix.bizTypeTotals.get(bt);
                      return (
                        <td
                          key={bt}
                          className="py-2 px-1 text-right tabular-nums font-semibold"
                        >
                          {btT && btT.cost > 0
                            ? formatKRWShort(btT.cost)
                            : "—"}
                        </td>
                      );
                    })}
                    <td className="py-2 pl-2 text-right tabular-nums font-bold">
                      {formatKRWLong(sumCur.totalCost)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 브랜드별 */}
      {byBrand.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>브랜드별 비매출 원가</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart
              categories={byBrand.map((b) => b.brand)}
              series={[
                {
                  name: "비매출 원가",
                  values: byBrand.map((b) => b.cost),
                  color: "#94a3b8",
                },
              ]}
              horizontal
              height={Math.max(200, byBrand.length * 32 + 60)}
              showLegend={false}
              yLabel="원가"
            />
          </CardContent>
        </Card>
      )}

      {/* 제품 Top 20 */}
      <Card>
        <CardHeader>
          <CardTitle>비매출 제품 Top 20</CardTitle>
          <div className="text-[11px] text-muted-foreground">
            수량 내림차순 · 어떤 제품이 증정/임직원에 가장 많이 쓰이나
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="px-4 pb-4 overflow-x-auto">
            {topProducts.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                이번달 비매출 출고 없음
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] text-muted-foreground border-b">
                    <th className="py-2">제품명</th>
                    <th className="py-2">브랜드</th>
                    <th className="py-2">주요 사업형태</th>
                    <th className="py-2 text-right">행</th>
                    <th className="py-2 text-right">수량</th>
                    <th className="py-2 text-right">원가</th>
                  </tr>
                </thead>
                <tbody>
                  {topProducts.map((p, i) => (
                    <tr key={p.productCode || p.product + i} className="border-b last:border-0">
                      <td className="py-2 font-medium">
                        <span className="text-muted-foreground mr-1">
                          {i + 1}
                        </span>
                        {p.product}
                      </td>
                      <td className="py-2 text-muted-foreground">{p.brand}</td>
                      <td className="py-2 text-[11px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <span
                            className="inline-block w-2 h-2 rounded-sm"
                            style={{ backgroundColor: bizColor(p.topBizType) }}
                          />
                          {p.topBizType}
                        </span>
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {formatInt(p.rows)}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {formatInt(p.qty)}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {formatKRWLong(p.cost)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
