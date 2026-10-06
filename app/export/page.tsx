import { loadFactCube, loadMonthRows, loadRangeRows } from "@/lib/load";
import { resolveMonth } from "@/lib/months";
import { kpi, ymMinusMonths, monthlyRevenueOf, topNProductsEnhanced } from "@/lib/aggregate";
import { computeExportInsights } from "@/lib/tabInsights";
import { TabInsights } from "@/components/TabInsights";
import { CustomerLink } from "@/components/CustomerLink";
import { YearToDateChart } from "@/components/YearToDateChart";
import {
  ytdCountrySeries,
  buildYTDAchievement,
  ytdMonthlyTargets,
  ytdMonthlyPrevYear,
  outlookPrevYearMonths,
} from "@/lib/ytd";
import {
  prevMonth,
  prevYearSameMonth,
  quarterOf,
  prevQuarter,
  quarterProgress,
} from "@/lib/compare";
import {
  exportRows,
  exportShipmentRows,
  overseasMallRows,
  overseasMallSummary,
  overseasMallMonthlyTrend,
  overseasMallBrandRows,
  revenueByCountry,
  countryBrandMatrix,
  countryMonthlyTrend,
  exportCustomers,
} from "@/lib/dimensions";
import { attributeChange } from "@/lib/changeAttribution";
import { loadTargets, targetsForMonthWithProspective, OVERSEAS_MALL_TARGET_KEY } from "@/lib/targets";
import { OVERSEAS_DIRECT_MALLS } from "@/config/mappings";
import { COMPARE_LABEL } from "@/lib/labels";
import { MetricCard } from "@/components/MetricCard";
import { ChangeBreakdown } from "@/components/ChangeBreakdown";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart } from "@/components/charts/LineChart";
import { BarChart } from "@/components/charts/BarChart";
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

export default async function ExportPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const ym = await resolveMonth(sp.month);
  const [cube, targets] = await Promise.all([loadFactCube(), loadTargets()]);
  const insights = computeExportInsights(cube, ym);

  const { qStart } = quarterOf(ym);
  const prevQ = prevQuarter(ym);
  const qProg = quarterProgress(ym);

  const [cur, prevMo, prevYr, curQ, prevQRows] = await Promise.all([
    loadMonthRows(ym),
    loadMonthRows(prevMonth(ym)),
    loadMonthRows(prevYearSameMonth(ym)),
    loadRangeRows(qStart, ym),
    loadRangeRows(prevQ.qStart, ymMinusMonths(prevQ.qEnd, 3 - qProg)),
  ]);

  // 해외영업 = 수출 출고 + 해외 직영몰(해외영업팀 직접 운영 쇼핑몰)
  const k = kpi(exportRows(cur));
  const kPrevMo = kpi(exportRows(prevMo));
  const kPrevYr = kpi(exportRows(prevYr));
  const kCurQ = kpi(exportRows(curQ));
  const kPrevQ = kpi(exportRows(prevQRows));
  const kShip = kpi(exportShipmentRows(cur));
  const kShipPrevMo = kpi(exportShipmentRows(prevMo));
  const kShipPrevYr = kpi(exportShipmentRows(prevYr));
  const kMall = kpi(overseasMallRows(cur));
  const kMallPrevMo = kpi(overseasMallRows(prevMo));
  const kMallPrevYr = kpi(overseasMallRows(prevYr));

  // 해외영업 목표 합산 (해외 division) — 수출 국가 목표 + 해외 직영몰 목표
  const ta = targetsForMonthWithProspective(targets, ym);
  const exportTarget = ta
    .filter((t) => t.division === "해외")
    .reduce((s, t) => s + t.target, 0);
  const mallTarget = ta
    .filter((t) => t.division === "해외" && t.customerKey === OVERSEAS_MALL_TARGET_KEY)
    .reduce((s, t) => s + t.target, 0);
  const shipTarget = exportTarget - mallTarget;

  // 12개월 추이
  const fromYM = ymMinusMonths(ym, 11);
  const trendRows = await loadRangeRows(fromYM, ym);
  const monthly = monthlyRevenueOf(trendRows, fromYM, ym, (r) => r.category === "수출");

  // 국가별 (중국·베트남은 매출 0이어도 항상 표시)
  const PINNED_COUNTRIES = ["중국", "베트남"];
  const countriesRaw = revenueByCountry(cur);
  const existingCountries = new Set(countriesRaw.map((c) => c.country));
  const countries = [
    ...countriesRaw,
    ...PINNED_COUNTRIES
      .filter((c) => !existingCountries.has(c))
      .map((c) => ({ country: c, revenue: 0, qty: 0 })),
  ];
  const countriesPrev = new Map(revenueByCountry(prevMo).map((c) => [c.country, c.revenue]));

  // 국가별 12개월 추이 (pinned 국가 항상 포함)
  const countryTrendRaw = countryMonthlyTrend(trendRows, fromYM, ym);
  const trendCountries = new Set(countryTrendRaw.map((c) => c.country));
  const countryTrend = [
    ...countryTrendRaw,
    ...PINNED_COUNTRIES
      .filter((c) => !trendCountries.has(c))
      .map((c) => ({ country: c, months: countryTrendRaw[0]?.months ?? [], values: countryTrendRaw[0]?.months.map(() => 0) ?? [] })),
  ];

  // 국가 × 브랜드 매트릭스
  const matrix = countryBrandMatrix(cur);

  // 거래처별
  const customers = exportCustomers(cur);
  const customersPrev = new Map(exportCustomers(prevMo).map((c) => [c.customer, c.revenue]));

  // 해외 직영몰 — 12개월 안에 이관 후 매출이 있을 때만 섹션 표시
  const mallTrend = overseasMallMonthlyTrend(trendRows, fromYM, ym);
  const showMall = mallTrend.after.some((v) => v > 0);
  const malls = overseasMallSummary(cur, prevMo, prevYr);
  const mallBrands = overseasMallBrandRows(cur, prevMo);

  // Top 20 제품
  const ytdStart = `${ym.split("-")[0]}-01`;
  const ytdExp = exportRows(trendRows.filter((r) => r.yearMonth >= ytdStart));
  const topProducts = topNProductsEnhanced(exportRows(cur), exportRows(prevMo), ytdExp, 20);
  const mallTopProducts = topNProductsEnhanced(overseasMallRows(cur), overseasMallRows(prevMo), overseasMallRows(ytdExp), 10);

  // 변화 요인 — 국가 단위 (해외 직영몰은 국가가 아닌 "해외 직영몰" 한 덩어리로)
  const countryContribs = attributeChange(
    exportRows(cur),
    exportRows(prevMo),
    (r) => (r.channelGroup === "해외 직영몰" ? "해외 직영몰" : r.country || null),
  );

  // YTD 달성
  const ytdAch = buildYTDAchievement(trendRows, targets, ym, {
    rowFilter: (r) => r.category === "수출",
    targetFilter: (t) => t.division === "해외",
  });

  // 전년 동기 + 월별 목표 (수출)
  const prevYearStart = `${Number(ym.split("-")[0]) - 1}-01`;
  const prevYearEnd = prevYearSameMonth(ym);
  const prevYearRangeRows = await loadRangeRows(prevYearStart, prevYearEnd);
  const outlookPrevRows = (
    await Promise.all(outlookPrevYearMonths(ym).map((m) => loadMonthRows(m)))
  ).flat();
  const exportMonthlyTargetsArr = ytdMonthlyTargets(targets, ym, {
    outlook: true,
    targetFilter: (t) => t.division === "해외",
  });
  const exportMonthlyPrevYearArr = ytdMonthlyPrevYear([...prevYearRangeRows, ...outlookPrevRows], ym, {
    outlook: true,
    rowFilter: (r) => r.category === "수출",
  });

  // 목표 vs 실적 (국가별) — 해외 직영몰 키는 국가표에서 제외
  const countryTargets = new Map<string, number>();
  for (const t of ta) {
    if (t.division !== "해외" || t.customerKey === OVERSEAS_MALL_TARGET_KEY) continue;
    countryTargets.set(t.customerKey, (countryTargets.get(t.customerKey) ?? 0) + t.target);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">{formatYM(ym)} 해외영업</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          수출 {countries.length}개 국가{malls.length > 0 ? ` · 해외 직영몰 ${malls.length}곳` : ""} · 이번달 {formatInt(k.qty)}개
        </p>
      </div>

      <TabInsights bullets={insights} />

      <YearToDateChart
        ym={ym}
        series={ytdCountrySeries(cube, ym, 5)}
        caption={showMall ? "수출 국가별 Top 5 + 기타 + 해외 직영몰" : "수출 국가별 Top 5 + 기타"}
        achievement={ytdAch}
        achievementLabel="해외영업 전체"
        monthlyTargets={exportMonthlyTargetsArr}
        prevYearValues={exportMonthlyPrevYearArr}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="해외영업 실매출"
          hint={showMall ? "수출 + 해외 직영몰" : undefined}
          current={k.revenue}
          comparisons={[
            { label: COMPARE_LABEL.prevMonth, prev: kPrevMo.revenue },
            {
              label: COMPARE_LABEL.curQuarter,
              current: kCurQ.revenue,
              prev: kPrevQ.revenue,
              note: `${qProg}/3개월 진행`,
            },
            { label: COMPARE_LABEL.prevYear, prev: kPrevYr.revenue },
          ]}
          target={exportTarget > 0 ? { value: exportTarget, label: "이번달 목표" } : undefined}
          highlight
        />
        {showMall && (
          <MetricCard
            label="수출 실매출"
            hint={`${countries.length}개 국가`}
            current={kShip.revenue}
            comparisons={[
              { label: COMPARE_LABEL.prevMonth, prev: kShipPrevMo.revenue },
              { label: COMPARE_LABEL.prevYear, prev: kShipPrevYr.revenue },
            ]}
            target={shipTarget > 0 ? { value: shipTarget, label: "수출 목표" } : undefined}
          />
        )}
        {showMall && (
          <MetricCard
            label="해외 직영몰 실매출"
            hint={malls.map((m) => m.channel).join(" · ")}
            current={kMall.revenue}
            comparisons={[
              { label: COMPARE_LABEL.prevMonth, prev: kMallPrevMo.revenue },
              { label: COMPARE_LABEL.prevYear, prev: kMallPrevYr.revenue },
            ]}
            target={mallTarget > 0 ? { value: mallTarget, label: "해외 직영몰 목표" } : undefined}
          />
        )}
        <MetricCard
          label="해외영업 수량"
          current={k.qty}
          comparisons={[
            { label: COMPARE_LABEL.prevMonth, prev: kPrevMo.qty },
            { label: COMPARE_LABEL.prevYear, prev: kPrevYr.qty },
          ]}
          unit="qty"
        />
        {!showMall && (
        <MetricCard
          label={countries[0] ? `최대 국가: ${countries[0].country}` : "최대 국가"}
          current={countries[0]?.revenue ?? 0}
          comparisons={[
            {
              label: COMPARE_LABEL.prevMonth,
              prev: countries[0] ? (countriesPrev.get(countries[0].country) ?? 0) : 0,
            },
          ]}
        />
        )}
        {!showMall && (
        <MetricCard
          label="활성 국가 수"
          current={countries.length}
          comparisons={[
            {
              label: COMPARE_LABEL.prevMonth,
              prev: revenueByCountry(prevMo).length,
            },
          ]}
          unit="qty"
        />
        )}
      </div>

      <ChangeBreakdown
        title={showMall ? "전월 대비 국가·해외 직영몰별 변화 요인" : "전월 대비 국가별 변화 요인"}
        prevTotal={kPrevMo.revenue}
        curTotal={k.revenue}
        contribs={countryContribs}
        topN={5}
        prevLabel={COMPARE_LABEL.prevMonth}
        hint="국가 단위 분해 — 어느 국가가 증가/감소를 만들었는지"
      />

      {showMall && (
        <section className="space-y-4">
          <div>
            <h3 className="text-base font-semibold tracking-tight">해외 직영몰 (해외영업팀 직접 운영)</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {OVERSEAS_DIRECT_MALLS.map(
                (m) => `${m.channel}: ${formatYM(prevMonth(m.from))}까지 국내 B2C 종합몰, ${formatYM(m.from)}부터 해외영업`,
              ).join(" · ")}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {malls.map((m) => (
              <MetricCard
                key={m.channel}
                label={m.channel}
                hint={`주문 ${formatInt(m.orders)}건 · ${formatInt(m.qty)}개`}
                current={m.revenue}
                comparisons={[
                  { label: COMPARE_LABEL.prevMonth, prev: m.prev },
                  { label: COMPARE_LABEL.prevYear, prev: m.prevYear },
                ]}
                target={
                  malls.length === 1 && mallTarget > 0
                    ? { value: mallTarget, label: "해외 직영몰 목표" }
                    : undefined
                }
              />
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>해외 직영몰 12개월 추이 (이관 전후)</CardTitle>
            </CardHeader>
            <CardContent>
              <BarChart
                categories={mallTrend.months.map((m) => formatYM(m).replace("년 ", "/").replace("월", ""))}
                series={[
                  { name: "이관 전 (국내 B2C)", values: mallTrend.before, stack: "몰", color: "#cbd5e1" },
                  { name: "해외 직영몰", values: mallTrend.after, stack: "몰", color: "#0ea5e9" },
                ]}
                height={280}
                showLegend
                yLabel="실매출"
              />
            </CardContent>
          </Card>

          {mallBrands.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>해외 직영몰 몰 × 브랜드 실적</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="px-4 pb-4 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[11px] text-muted-foreground border-b">
                        <th className="py-2">몰</th>
                        <th className="py-2">브랜드</th>
                        <th className="py-2 text-right">이번달 실매출</th>
                        <th className="py-2 text-right">전월</th>
                        <th className="py-2 text-right">변화</th>
                        <th className="py-2 text-right">수량</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mallBrands.map((b) => {
                        const ch = buildChange(b.revenue, b.prev, "전월");
                        const cls =
                          ch.direction === "up" || ch.direction === "new"
                            ? "text-emerald-700"
                            : ch.direction === "down" || ch.direction === "lost"
                              ? "text-rose-700"
                              : "text-muted-foreground";
                        return (
                          <tr key={`${b.channel}|${b.brand}`} className="border-b last:border-0">
                            <td className="py-2 font-medium">{b.channel}</td>
                            <td className="py-2">{b.brand}</td>
                            <td className="py-2 text-right tabular-nums">{formatKRWLong(b.revenue)}</td>
                            <td className="py-2 text-right tabular-nums text-muted-foreground">
                              {b.prev > 0 ? formatKRWLong(b.prev) : "—"}
                            </td>
                            <td className={`py-2 text-right tabular-nums ${cls}`}>
                              <div>{ch.diffText}</div>
                              <div className="text-[10px]">{ch.pctText}</div>
                            </td>
                            <td className="py-2 text-right tabular-nums">{formatInt(b.qty)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          <TopProductsTable products={mallTopProducts} title="이번달 해외 직영몰 상위 10 제품" ym={ym} />
        </section>
      )}

      <Card>
        <CardHeader>
          <CardTitle>수출 국가별 매출</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="px-4 pb-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-muted-foreground border-b">
                  <th className="py-2">국가</th>
                  <th className="py-2 text-right">이번달 실매출</th>
                  <th className="py-2 text-right">전월</th>
                  <th className="py-2 text-right">변화</th>
                  <th className="py-2 text-right">수량</th>
                  {countryTargets.size > 0 && <th className="py-2 text-right">목표</th>}
                  {countryTargets.size > 0 && <th className="py-2 text-right">달성률</th>}
                </tr>
              </thead>
              <tbody>
                {countries.map((c) => {
                  const ch = buildChange(c.revenue, countriesPrev.get(c.country) ?? 0, "전월");
                  const cls =
                    ch.direction === "up" || ch.direction === "new"
                      ? "text-emerald-700"
                      : ch.direction === "down" || ch.direction === "lost"
                        ? "text-rose-700"
                        : "text-muted-foreground";
                  const tgt = countryTargets.get(c.country) ?? 0;
                  const ach = tgt > 0 ? buildAchievement(c.revenue, tgt) : null;
                  return (
                    <tr key={c.country} className="border-b last:border-0">
                      <td className="py-2 font-medium">{c.country}</td>
                      <td className="py-2 text-right tabular-nums">{formatKRWLong(c.revenue)}</td>
                      <td className="py-2 text-right tabular-nums text-muted-foreground">
                        {(countriesPrev.get(c.country) ?? 0) > 0
                          ? formatKRWLong(countriesPrev.get(c.country)!)
                          : "—"}
                      </td>
                      <td className={`py-2 text-right tabular-nums ${cls}`}>
                        <div>{ch.diffText}</div>
                        <div className="text-[10px]">{ch.pctText}</div>
                      </td>
                      <td className="py-2 text-right tabular-nums">{formatInt(c.qty)}</td>
                      {countryTargets.size > 0 && (
                        <td className="py-2 text-right tabular-nums text-muted-foreground">
                          {tgt > 0 ? formatKRWLong(tgt) : "—"}
                        </td>
                      )}
                      {countryTargets.size > 0 && (
                        <td className="py-2 text-right tabular-nums">
                          {ach && ach.rate != null ? (
                            <span className={ach.rate >= 1 ? "text-emerald-700" : ach.rate >= 0.7 ? "text-amber-600" : "text-rose-700"}>
                              {formatPctAbs(ach.rate)}
                            </span>
                          ) : "—"}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {countryTrend.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>수출 국가별 12개월 추이</CardTitle>
          </CardHeader>
          <CardContent>
            <LineChart
              categories={countryTrend[0].months.map((m) =>
                formatYM(m).replace("년 ", "/").replace("월", ""),
              )}
              series={countryTrend.slice(0, 5).map((c) => ({
                name: c.country,
                values: c.values,
              }))}
              height={320}
              showLegend
              yLabel="실매출"
            />
          </CardContent>
        </Card>
      )}

      {matrix.countries.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>국가 × 브랜드 매트릭스</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="px-4 pb-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] text-muted-foreground border-b">
                    <th className="py-2">국가</th>
                    {matrix.brands.map((b) => (
                      <th key={b} className="py-2 text-right">{b}</th>
                    ))}
                    <th className="py-2 text-right font-semibold">합계</th>
                  </tr>
                </thead>
                <tbody>
                  {matrix.countries.map((c, ci) => (
                    <tr key={c} className="border-b last:border-0">
                      <td className="py-2 font-medium">{c}</td>
                      {matrix.brands.map((b, bi) => (
                        <td key={b} className="py-2 text-right tabular-nums">
                          {matrix.values[ci][bi] > 0 ? formatKRWShort(matrix.values[ci][bi]) : "—"}
                        </td>
                      ))}
                      <td className="py-2 text-right tabular-nums font-semibold">
                        {formatKRWShort(matrix.values[ci].reduce((s, v) => s + v, 0))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>수출 거래처별 실적</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="px-4 pb-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-muted-foreground border-b">
                  <th className="py-2">거래처</th>
                  <th className="py-2">국가</th>
                  <th className="py-2 text-right">이번달 실매출</th>
                  <th className="py-2 text-right">전월</th>
                  <th className="py-2 text-right">변화</th>
                  <th className="py-2 text-right">수량</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => {
                  const prevRev = customersPrev.get(c.customer) ?? 0;
                  const ch = buildChange(c.revenue, prevRev, "전월");
                  const cls =
                    ch.direction === "up" || ch.direction === "new"
                      ? "text-emerald-700"
                      : ch.direction === "down" || ch.direction === "lost"
                        ? "text-rose-700"
                        : "text-muted-foreground";
                  return (
                    <tr key={c.customer} className="border-b last:border-0">
                      <td className="py-2 font-medium"><CustomerLink customer={c.customer} ym={ym} /></td>
                      <td className="py-2 text-muted-foreground">{c.country}</td>
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

      <TopProductsTable products={topProducts} title="이번달 상위 20 제품 (해외영업)" ym={ym} />
    </div>
  );
}
