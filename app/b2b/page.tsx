import { loadSalesRows, loadFactCube } from "@/lib/load";
import { resolveMonth } from "@/lib/months";
import {
  kpi,
  filterMonth,
  filterRange,
  ymMinusMonths,
  monthlyRevenueOf,
} from "@/lib/aggregate";
import { computeB2BInsights } from "@/lib/tabInsights";
import { TabInsights } from "@/components/TabInsights";
import { dealerBoard, dealerCustomerChurn, dealerQuarterCompare } from "@/lib/dealerAnalysis";
import Link from "next/link";
import {
  prevMonth,
  prevYearSameMonth,
  quarterOf,
  prevQuarter,
  quarterProgress,
} from "@/lib/compare";
import {
  b2bRows,
  revenueByCustomerType,
  revenueByDealer,
  dealerCustomerTypeMatrix,
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
import { LineChart } from "@/components/charts/LineChart";
import { BarChart } from "@/components/charts/BarChart";
import { DonutChart } from "@/components/charts/DonutChart";
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
  if (type === "대리점") return "대리점";
  return null;
}

export default async function B2BPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const ym = resolveMonth(sp.month);
  const all = loadSalesRows();
  const cube = loadFactCube();
  const targets = loadTargets();
  const insights = computeB2BInsights(cube, ym);
  const dealerBoardRows = dealerBoard(cube, ym, 6);
  const dealerChurnRows = dealerCustomerChurn(cube, ym, 3);
  const dealerQRows = dealerQuarterCompare(cube, ym);

  const cur = filterMonth(all, ym);
  const prevMo = filterMonth(all, prevMonth(ym));
  const prevYr = filterMonth(all, prevYearSameMonth(ym));
  const { qStart } = quarterOf(ym);
  const prevQ = prevQuarter(ym);
  const curQ = filterRange(all, qStart, ym);
  const prevQRows = filterRange(all, prevQ.qStart, prevQ.qEnd);
  const qProg = quarterProgress(ym);

  const k = kpi(b2bRows(cur));
  const kPrevMo = kpi(b2bRows(prevMo));
  const kPrevYr = kpi(b2bRows(prevYr));
  const kCurQ = kpi(b2bRows(curQ));
  const kPrevQ = kpi(b2bRows(prevQRows));

  // B2B 전체 목표 (병원+피부관리실+대리점, 모든 브랜드)
  const ta = targetsForMonthWithProspective(targets, ym);
  const b2bTarget = ta
    .filter((t) => ["병원", "피부관리실", "대리점"].includes(t.customerKey) && !t.prospective)
    .reduce((s, t) => s + t.target, 0);

  // 거래처 유형별
  const byType = revenueByCustomerType(cur);
  const byTypePrevMo = new Map(revenueByCustomerType(prevMo).map((t) => [t.type, t.revenue]));

  // 유형별 목표 (target.csv는 그룹 기준 — "병원" 합계로 매칭)
  const typeTargetByGroup = new Map<string, number>();
  for (const t of ta) {
    if (t.prospective) continue;
    if (["병원", "피부관리실", "대리점"].includes(t.customerKey)) {
      typeTargetByGroup.set(
        t.customerKey,
        (typeTargetByGroup.get(t.customerKey) ?? 0) + t.target,
      );
    }
  }

  // 영업사원 (0원 제외)
  const byDealerCur = revenueByDealer(cur).filter((d) => d.revenue > 0);
  const dealerPrevMo = new Map(revenueByDealer(prevMo).map((d) => [d.dealer, d.revenue]));
  const dealerPrevYr = new Map(revenueByDealer(prevYr).map((d) => [d.dealer, d.revenue]));
  const dealerCurQ = new Map(revenueByDealer(curQ).map((d) => [d.dealer, d.revenue]));

  const activeCustomers = new Set(
    cur
      .filter((r) => r.category === "B2B" && !r.isNonRevenue && r.realRevenue > 0)
      .map((r) => r.customer),
  ).size;
  const activeCustomersPrev = new Set(
    prevMo
      .filter((r) => r.category === "B2B" && !r.isNonRevenue && r.realRevenue > 0)
      .map((r) => r.customer),
  ).size;

  // 거래처유형 12개월 추이
  const fromYM = ymMinusMonths(ym, 11);
  const typeKeys = byType.map((t) => t.type);
  const typeMonthlySeries = typeKeys.map((t) => ({
    type: t,
    series: monthlyRevenueOf(
      all,
      fromYM,
      ym,
      (r) => r.category === "B2B" && r.b2bCustomerType === t,
    ),
  }));
  const trendMonths = typeMonthlySeries[0]?.series.map((s) => s.yearMonth) ?? [];

  // 영업사원 × 거래처유형
  const matrix = dealerCustomerTypeMatrix(cur);

  // 신규/이탈
  const { newOnes, lost } = b2bNewLost(all, ym);

  // B2B 브랜드
  const brandRev = b2bBrandRevenue(cur);
  const brandTotal = brandRev.reduce((s, b) => s + b.revenue, 0);

  // 변화 요인 — 영업사원 단위
  const dealerContribs = attributeChange(
    b2bRows(cur),
    b2bRows(prevMo),
    (r) => r.dealer || null,
  );
  // 변화 요인 — 거래처 단위
  const customerContribs = attributeChange(
    b2bRows(cur),
    b2bRows(prevMo),
    (r) => r.customer || null,
  );

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{formatYM(ym)} B2B (전문가용)</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            영업사원 {byDealerCur.length}명 · 활성 거래처 {formatInt(activeCustomers)}곳
          </p>
        </div>
      </div>

      <TabInsights bullets={insights} />

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
          unitSuffix="곳"
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

      {/* 영업사원 변화 워터폴 */}
      <ChangeBreakdown
        title="전월 대비 영업사원 변화 요인"
        prevTotal={kPrevMo.revenue}
        curTotal={k.revenue}
        contribs={dealerContribs}
        topN={5}
        prevLabel={COMPARE_LABEL.prevMonth}
        hint="어느 영업사원이 이번달 B2B 증감을 만들었는지"
      />

      {/* 영업사원 보드 */}
      <Card>
        <CardHeader>
          <CardTitle>영업사원별 실적 (이번달 0원 제외)</CardTitle>
          <div className="text-[11px] text-muted-foreground">{byDealerCur.length}명 · 분기 누적/전월/전년 동월 비교</div>
        </CardHeader>
        <CardContent className="space-y-3">
          <BarChart
            categories={byDealerCur.map((d) => d.dealer)}
            series={[
              {
                name: "이번달 실매출",
                values: byDealerCur.map((d) => d.revenue),
                color: "#6366f1",
              },
            ]}
            height={Math.max(220, byDealerCur.length * 38)}
            horizontal
            showLegend={false}
            showValueLabels
            yLabel="실매출"
          />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-muted-foreground border-b">
                  <th className="py-2">영업사원</th>
                  <th className="py-2 text-right">담당 거래처</th>
                  <th className="py-2 text-right">이번달 실매출</th>
                  <th className="py-2 text-right">전월</th>
                  <th className="py-2 text-right">전월 대비</th>
                  <th className="py-2 text-right">분기 누적</th>
                  <th className="py-2 text-right">전년 동월</th>
                  <th className="py-2 text-right">전년 대비</th>
                </tr>
              </thead>
              <tbody>
                {byDealerCur.map((d) => {
                  const pm = dealerPrevMo.get(d.dealer) ?? 0;
                  const yy = dealerPrevYr.get(d.dealer) ?? 0;
                  const q = dealerCurQ.get(d.dealer) ?? 0;
                  const chMo = buildChange(d.revenue, pm, "전월");
                  const chYr = buildChange(d.revenue, yy, "전년");
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
                  return (
                    <tr key={d.dealer} className="border-b last:border-0">
                      <td className="py-2 font-medium">{d.dealer}</td>
                      <td className="py-2 text-right tabular-nums">{formatInt(d.customers)}곳</td>
                      <td className="py-2 text-right tabular-nums">{formatKRWLong(d.revenue)}</td>
                      <td className="py-2 text-right tabular-nums text-muted-foreground">
                        {pm > 0 ? formatKRWLong(pm) : "—"}
                      </td>
                      <td className={`py-2 text-right tabular-nums ${moCls}`}>
                        <div>{chMo.diffText}</div>
                        <div className="text-[10px]">{chMo.pctText}</div>
                      </td>
                      <td className="py-2 text-right tabular-nums">{formatKRWLong(q)}</td>
                      <td className="py-2 text-right tabular-nums text-muted-foreground">
                        {yy > 0 ? formatKRWLong(yy) : "—"}
                      </td>
                      <td className={`py-2 text-right tabular-nums ${yrCls}`}>{chYr.pctText}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* 영업사원 6개월 추이 + 분기 비교 + 거래처 churn */}
      <Card>
        <CardHeader>
          <CardTitle>영업사원 심층 — 6개월 추이 + 분기 누적 + 거래처 회전</CardTitle>
          <div className="text-[11px] text-muted-foreground">
            각 영업사원의 최근 6개월 막대 / 활성 거래처 수 / 이번 분기 누적 vs 전년 동분기 동기간 / 신규·이탈 거래처
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="px-4 pb-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-muted-foreground border-b">
                  <th className="py-2">영업사원</th>
                  <th className="py-2">6개월 추이</th>
                  <th className="py-2 text-right">활성 거래처</th>
                  <th className="py-2 text-right">분기 누적</th>
                  <th className="py-2 text-right">전년 동분기</th>
                  <th className="py-2 text-right">분기 변화</th>
                  <th className="py-2 text-right">신규/이탈</th>
                </tr>
              </thead>
              <tbody>
                {dealerBoardRows.map((d) => {
                  const max = Math.max(...d.series6m.map((s) => s.revenue), 1);
                  const qRow = dealerQRows.find((q) => q.dealer === d.dealer);
                  const churn = dealerChurnRows.find((c) => c.dealer === d.dealer);
                  const qDiffCls =
                    qRow && qRow.diff > 0
                      ? "text-emerald-700"
                      : qRow && qRow.diff < 0
                        ? "text-rose-700"
                        : "text-muted-foreground";
                  return (
                    <tr key={d.dealer} className="border-b last:border-0 align-top">
                      <td className="py-2 font-medium">{d.dealer}</td>
                      <td className="py-2">
                        <div className="flex items-end gap-0.5 h-7">
                          {d.series6m.map((s) => (
                            <div
                              key={s.yearMonth}
                              className={s.yearMonth === ym ? "bg-indigo-600 w-2" : "bg-indigo-200 w-2"}
                              style={{ height: `${Math.max(2, (s.revenue / max) * 100)}%` }}
                              title={`${s.yearMonth}: ${formatKRWShort(s.revenue)}`}
                            />
                          ))}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-1">
                          {d.series6m[0]?.yearMonth.slice(2)} ~ {d.series6m[d.series6m.length - 1]?.yearMonth.slice(2)}
                        </div>
                      </td>
                      <td className="py-2 text-right tabular-nums">{formatInt(d.curActiveCustomers)}곳</td>
                      <td className="py-2 text-right tabular-nums">
                        {qRow ? formatKRWShort(qRow.currentQAccum) : "—"}
                      </td>
                      <td className="py-2 text-right tabular-nums text-muted-foreground">
                        {qRow && qRow.prevYearQAccum > 0 ? formatKRWShort(qRow.prevYearQAccum) : "—"}
                      </td>
                      <td className={`py-2 text-right tabular-nums ${qDiffCls}`}>
                        {qRow && qRow.pct !== null ? formatPctAbs(qRow.pct, 0).replace("%", "") + (qRow.pct > 0 ? "%↑" : "%↓") : "—"}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {churn ? (
                          <div className="text-xs">
                            <span className="text-emerald-700">+{churn.newCustomers.length}</span>
                            <span className="text-muted-foreground"> / </span>
                            <span className="text-rose-700">-{churn.lostCustomers.length}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* 딜러별 신규/이탈 거래처 상세 */}
      {dealerChurnRows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>영업사원별 신규·이탈 거래처 (3개월 윈도우)</CardTitle>
            <div className="text-[11px] text-muted-foreground">
              각 영업사원이 이번달 새로 잡은 거래처 / 이번달 사라진 거래처. 거래처명 클릭 시 거래처 분석 탭으로 이동.
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {dealerChurnRows
                .filter((d) => d.newCustomers.length > 0 || d.lostCustomers.length > 0)
                .slice(0, 8)
                .map((d) => (
                  <div key={d.dealer} className="rounded border p-3">
                    <div className="flex items-baseline justify-between mb-2">
                      <h4 className="font-medium text-sm">{d.dealer}</h4>
                      <div className="text-[11px] text-muted-foreground">
                        활성 {d.currentActive}곳 · 순증감 {d.netChange > 0 ? "+" : ""}
                        {d.netChange}곳
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <div className="text-[11px] text-emerald-700 mb-1">
                          신규 ({d.newCustomers.length}곳)
                        </div>
                        {d.newCustomers.length === 0 ? (
                          <div className="text-xs text-muted-foreground">—</div>
                        ) : (
                          <ul className="text-xs space-y-0.5">
                            {d.newCustomers.slice(0, 5).map((c) => (
                              <li key={c.customer} className="flex justify-between gap-2">
                                <Link
                                  href={`/accounts?customer=${encodeURIComponent(c.customer)}&month=${ym}`}
                                  className="truncate hover:underline"
                                >
                                  {c.customer}
                                </Link>
                                <span className="tabular-nums shrink-0">{formatKRWShort(c.revenue)}</span>
                              </li>
                            ))}
                            {d.newCustomers.length > 5 && (
                              <li className="text-[10px] text-muted-foreground">+{d.newCustomers.length - 5}곳 더</li>
                            )}
                          </ul>
                        )}
                      </div>
                      <div>
                        <div className="text-[11px] text-rose-700 mb-1">
                          이탈 ({d.lostCustomers.length}곳)
                        </div>
                        {d.lostCustomers.length === 0 ? (
                          <div className="text-xs text-muted-foreground">—</div>
                        ) : (
                          <ul className="text-xs space-y-0.5">
                            {d.lostCustomers.slice(0, 5).map((c) => (
                              <li key={c.customer} className="flex justify-between gap-2">
                                <Link
                                  href={`/accounts?customer=${encodeURIComponent(c.customer)}&month=${ym}`}
                                  className="truncate hover:underline"
                                >
                                  {c.customer}
                                </Link>
                                <span className="tabular-nums shrink-0 text-muted-foreground">
                                  최근 {c.lastSeenMonth}
                                </span>
                              </li>
                            ))}
                            {d.lostCustomers.length > 5 && (
                              <li className="text-[10px] text-muted-foreground">+{d.lostCustomers.length - 5}곳 더</li>
                            )}
                          </ul>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

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
                        : ach.status === "ontrack"
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

      {/* 영업사원 × 거래처유형 매트릭스 */}
      {matrix.dealers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>영업사원 × 거래처 유형 매트릭스 (이번달 실매출)</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="px-4 pb-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] text-muted-foreground border-b">
                    <th className="py-2">영업사원</th>
                    {matrix.types.map((t) => (
                      <th key={t} className="py-2 text-right">{t}</th>
                    ))}
                    <th className="py-2 text-right">합계</th>
                  </tr>
                </thead>
                <tbody>
                  {matrix.dealers.map((d, i) => {
                    const row = matrix.values[i];
                    const total = row.reduce((s, v) => s + v, 0);
                    return (
                      <tr key={d} className="border-b last:border-0">
                        <td className="py-2 font-medium">{d}</td>
                        {row.map((v, j) => (
                          <td key={j} className="py-2 text-right tabular-nums">
                            {v > 0 ? formatKRWShort(v) : <span className="text-neutral-300">·</span>}
                          </td>
                        ))}
                        <td className="py-2 text-right tabular-nums font-semibold">
                          {formatKRWShort(total)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 거래처 변화 요인 */}
      <ChangeBreakdown
        title="전월 대비 거래처 변화 요인"
        prevTotal={kPrevMo.revenue}
        curTotal={k.revenue}
        contribs={customerContribs}
        topN={5}
        prevLabel={COMPARE_LABEL.prevMonth}
        hint="어느 거래처가 B2B 증감을 만들었는지"
      />

      {/* 신규/이탈 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>신규 거래처 (직전 6개월 무매출 → 이번달)</CardTitle>
              <Badge variant="info">{newOnes.length}곳</Badge>
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
                        <td className="py-2">{c.customer}</td>
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
              <Badge variant="negative">{lost.length}곳</Badge>
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
                        <td className="py-2">{c.customer}</td>
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
    </div>
  );
}
