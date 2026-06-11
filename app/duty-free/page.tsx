import { loadFactCube, loadMonthRows, loadRangeRows } from "@/lib/load";
import { resolveMonth } from "@/lib/months";
import {
  kpi,
  ymMinusMonths,
  enumerateMonths,
  monthlyRevenueOf,
  dailyRevenue,
  dailyCumulative,
  weeklyRevenue,
  topNProductsEnhanced,
} from "@/lib/aggregate";
import {
  isSellThroughAvailable,
  sellThroughMonths,
  loadSellThroughMonth,
  loadSellThroughRange,
  aggregateByStore,
  sellThroughTotal,
  sellThroughMonthlyTotals,
} from "@/lib/dutyfree-sellthrough";
import { computeDutyFreeInsights } from "@/lib/tabInsights";
import { TabInsights } from "@/components/TabInsights";
import { CustomerLink } from "@/components/CustomerLink";
import { YearToDateChart } from "@/components/YearToDateChart";
import {
  ytdCustomerSeries,
  ytdAchievementForCustomerKeys,
  ytdMonthlyTargets,
  ytdMonthlyPrevYear,
} from "@/lib/ytd";
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
import { TopProductsTable } from "@/components/TopProductsTable";
import {
  formatKRWLong,
  formatInt,
  formatYM,
  formatPctAbs,
  formatUSD,
  buildChange,
  buildAchievement,
} from "@/lib/format";

type SearchParams = Promise<{ month?: string }>;

export default async function DutyFreePage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const ym = await resolveMonth(sp.month);
  const [cube, targets] = await Promise.all([loadFactCube(), loadTargets()]);
  const insights = computeDutyFreeInsights(cube, ym);

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
  const prevYearFrom = ymMinusMonths(fromYM, 12);
  const prevYearTo = ymMinusMonths(ym, 12);
  const [trendRows, prevYearTrendRows] = await Promise.all([
    loadRangeRows(fromYM, ym),
    loadRangeRows(prevYearFrom, prevYearTo),
  ]);
  const monthly = monthlyRevenueOf(trendRows, fromYM, ym, (r) => r.category === "면세점");
  const monthlyPrevYear = monthlyRevenueOf(
    prevYearTrendRows,
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

  // Top 20 제품
  const ytdStart = `${ym.split("-")[0]}-01`;
  const ytdDf = dutyFreeRows(trendRows.filter((r) => r.yearMonth >= ytdStart));
  const topProducts = topNProductsEnhanced(dutyFreeRows(cur), dutyFreeRows(prevMo), ytdDf, 20);

  // 변화 요인 — 거래처 단위
  const customerContribs = attributeChange(
    dutyFreeRows(cur),
    dutyFreeRows(prevMo),
    (r) => r.customer || null,
  );

  // 전년 동기 + 월별 목표 (면세점)
  const prevYearStart = `${Number(ym.split("-")[0]) - 1}-01`;
  const prevYearEnd = prevYearSameMonth(ym);
  const prevYearRangeRows = await loadRangeRows(prevYearStart, prevYearEnd);
  const dutyMonthlyTargetsArr = ytdMonthlyTargets(targets, ym, {
    targetFilter: (t) => t.division === "국내" && t.customerKey === "면세점",
  });
  const dutyMonthlyPrevYearArr = ytdMonthlyPrevYear(prevYearRangeRows, ym, {
    rowFilter: (r) => r.category === "면세점",
  });

  // ── 지코(Zico) 실판매 기반 매출 (sell-through) — 출고와 별개 독립 섹션 ──
  const sellThrough = await (async () => {
    if (!(await isSellThroughAvailable())) return null;
    const months = await sellThroughMonths();
    if (months.length === 0) return null;
    const latest = months[months.length - 1];
    const hasSelected = months.includes(ym);
    const stMonth = hasSelected ? ym : latest; // 선택월 데이터 없으면 최신 실판매월로 폴백
    const trendFrom = ymMinusMonths(stMonth, 11);
    const [curRows, prevRows, prevYrRows, trendRows] = await Promise.all([
      loadSellThroughMonth(stMonth),
      loadSellThroughMonth(prevMonth(stMonth)),
      loadSellThroughMonth(prevYearSameMonth(stMonth)),
      loadSellThroughRange(trendFrom, stMonth),
    ]);
    const cur = sellThroughTotal(curRows);
    const prev = sellThroughTotal(prevRows);
    const prevYr = sellThroughTotal(prevYrRows);
    const stores = aggregateByStore(curRows);
    const prevStoreKrw = new Map(aggregateByStore(prevRows).map((s) => [s.store, s.krw]));
    const totalsByMonth = sellThroughMonthlyTotals(trendRows);
    const trendList = enumerateMonths(trendFrom, stMonth);
    const activeStores = stores.filter((s) => s.krw > 0).length;
    const prevActiveStores = aggregateByStore(prevRows).filter((s) => s.krw > 0).length;
    return {
      latest,
      hasSelected,
      stMonth,
      cur,
      prev,
      prevYr,
      stores,
      prevStoreKrw,
      totalsByMonth,
      trendList,
      activeStores,
      prevActiveStores,
    };
  })();

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{formatYM(ym)} 면세점</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {customers.length}개 거래처 · 이번달 출고 {formatInt(k.qty)}개
          </p>
        </div>
      </div>

      <TabInsights bullets={insights} />

      <YearToDateChart
        ym={ym}
        series={ytdCustomerSeries(cube, ym, 5, { category: "면세점" })}
        caption="거래처 Top 5 + 기타"
        achievement={ytdAchievementForCustomerKeys(
          trendRows,
          targets,
          ym,
          ["면세점"],
          (r) => r.category === "면세점",
        )}
        achievementLabel="면세점"
        monthlyTargets={dutyMonthlyTargetsArr}
        prevYearValues={dutyMonthlyPrevYearArr}
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
          unitSuffix="개"
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
        hint="어느 면세점 거래처가 이번달 증감을 만들었는지 — 항목 클릭 시 거래처 분석으로 이동"
        customerLinkMonth={ym}
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
                        <td className="py-2 font-medium"><CustomerLink customer={c.customer} ym={ym} /></td>
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
                          : ach.status === "shortfall"
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

      <TopProductsTable products={topProducts} title="이번달 상위 20 제품 (면세점)" ym={ym} />

      {sellThrough && (
        <section className="space-y-4">
          <div className="border-t pt-6">
            <h3 className="text-lg font-semibold tracking-tight">
              지코 실판매 기반 매출{" "}
              <span className="text-xs font-normal text-muted-foreground">(Sell-through)</span>
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              전체 면세점 기준은 우리 출고이며, 본 섹션은 지코(Zico)가 매월 전달하는 실제 판매 기반
              매출입니다 (별도 집계 · 출고와 합산하지 않음).
              {!sellThrough.hasSelected && (
                <span className="text-amber-600">
                  {" "}
                  · {formatYM(ym)} 실판매 데이터가 아직 없어 최신 {formatYM(sellThrough.stMonth)} 기준으로
                  표시합니다.
                </span>
              )}
            </p>
          </div>

          {/* KPI */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              label={`실판매 매출 (${formatYM(sellThrough.stMonth)})`}
              current={sellThrough.cur.krw}
              comparisons={[
                { label: COMPARE_LABEL.prevMonth, prev: sellThrough.prev.krw },
                { label: COMPARE_LABEL.prevYear, prev: sellThrough.prevYr.krw },
              ]}
              hint={`달러 ${formatUSD(sellThrough.cur.usd)}`}
              highlight
            />
            <MetricCard
              label="실판매 수량"
              current={sellThrough.cur.qty}
              unit="qty"
              comparisons={[
                { label: COMPARE_LABEL.prevMonth, prev: sellThrough.prev.qty },
                { label: COMPARE_LABEL.prevYear, prev: sellThrough.prevYr.qty },
              ]}
            />
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-xs text-muted-foreground font-medium">
                  실판매 매출 (달러)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                <div className="text-2xl font-bold tabular-nums leading-tight">
                  {formatUSD(sellThrough.cur.usd)}
                </div>
                {(() => {
                  const ch = buildChange(sellThrough.cur.usd, sellThrough.prev.usd, "전월", {
                    formatValue: formatUSD,
                    formatPrev: formatUSD,
                  });
                  const cls =
                    ch.direction === "up" || ch.direction === "new"
                      ? "text-emerald-700"
                      : ch.direction === "down" || ch.direction === "lost"
                        ? "text-rose-700"
                        : "text-muted-foreground";
                  return (
                    <div className="text-[11px] text-muted-foreground">
                      전월 {sellThrough.prev.usd > 0 ? formatUSD(sellThrough.prev.usd) : "—"}
                      <span className={`ml-1 font-medium ${cls}`}>
                        {ch.diffText} ({ch.pctText})
                      </span>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
            <MetricCard
              label="활성 면세점 지점"
              current={sellThrough.activeStores}
              unit="raw"
              unitSuffix="개"
              hint="실판매 발생 지점"
              comparisons={[
                { label: COMPARE_LABEL.prevMonth, prev: sellThrough.prevActiveStores },
              ]}
            />
          </div>

          {/* 월별 실판매 매출 추이 (원화) */}
          <Card>
            <CardHeader>
              <CardTitle>실판매 매출 12개월 추이 (원화)</CardTitle>
            </CardHeader>
            <CardContent>
              <LineChart
                categories={sellThrough.trendList.map((m) =>
                  formatYM(m).replace("년 ", "/").replace("월", ""),
                )}
                series={[
                  {
                    name: "실판매 매출(₩)",
                    values: sellThrough.trendList.map(
                      (m) => sellThrough.totalsByMonth.get(m)?.krw ?? 0,
                    ),
                    color: "#f59e0b",
                    area: true,
                    smooth: true,
                  },
                ]}
                height={280}
                yLabel="실판매 매출"
              />
            </CardContent>
          </Card>

          {/* 면세점 지점별 (이번달) */}
          <Card>
            <CardHeader>
              <CardTitle>면세점 지점별 실판매 ({formatYM(sellThrough.stMonth)})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="px-4 pb-4 overflow-x-auto">
                {sellThrough.stores.length === 0 ? (
                  <div className="text-sm text-muted-foreground py-4">실판매 데이터 없음</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[11px] text-muted-foreground border-b">
                        <th className="py-2">면세점 지점</th>
                        <th className="py-2 text-right">실판매 매출(₩)</th>
                        <th className="py-2 text-right">비중</th>
                        <th className="py-2 text-right">수량</th>
                        <th className="py-2 text-right">달러</th>
                        <th className="py-2 text-right">전월 대비</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sellThrough.stores.map((s) => {
                        const pm = sellThrough.prevStoreKrw.get(s.store) ?? 0;
                        const ch = buildChange(s.krw, pm, "전월");
                        const cls =
                          ch.direction === "up" || ch.direction === "new"
                            ? "text-emerald-700"
                            : ch.direction === "down" || ch.direction === "lost"
                              ? "text-rose-700"
                              : "text-muted-foreground";
                        return (
                          <tr key={s.store} className="border-b last:border-0">
                            <td className="py-2 font-medium">{s.store}</td>
                            <td className="py-2 text-right tabular-nums">{formatKRWLong(s.krw)}</td>
                            <td className="py-2 text-right tabular-nums">
                              {sellThrough.cur.krw > 0 ? formatPctAbs(s.krw / sellThrough.cur.krw) : "—"}
                            </td>
                            <td className="py-2 text-right tabular-nums">{formatInt(s.qty)}</td>
                            <td className="py-2 text-right tabular-nums text-muted-foreground">
                              {formatUSD(s.usd)}
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
                )}
              </div>
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  );
}
