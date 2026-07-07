import { loadFactCube, loadRangeRows } from "@/lib/load";
import { resolveMonth } from "@/lib/months";
import { ymMinusMonths, monthlyRevenueOf, enumerateMonths } from "@/lib/aggregate";
import { prevMonth, prevYearSameMonth, nextMonthInYear } from "@/lib/compare";
import { computeB2BSummaryInsights } from "@/lib/tabInsights";
import { TabInsights } from "@/components/TabInsights";
import { YearToDateChart } from "@/components/YearToDateChart";
import { loadTargets } from "@/lib/targets";
import {
  ytdCategoryDetailSeries,
  ytdAchievementForCustomerKeys,
  ytdMonthlyTargets,
  ytdMonthlyPrevYear,
} from "@/lib/ytd";
import { MetricCard } from "@/components/MetricCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart } from "@/components/charts/BarChart";
import { COMPARE_LABEL } from "@/lib/labels";
import {
  formatKRWLong,
  formatKRWShort,
  formatInt,
  formatYM,
  formatPctAbs,
  buildChange,
} from "@/lib/format";
import { isLinker } from "@/config/mappings";
import { SalesRepLink } from "@/components/SalesRepLink";
import { loadDealerTargets, buildDealerAchievements } from "@/lib/dealer-targets";
import {
  loadBHPartnerMap,
  loadBHSales,
  loadBHSalesRange,
  isBHDataAvailable,
  type BHPartner,
  type BHPartnerSale,
} from "@/lib/baquerohouse-data";
import {
  repSummaryRows,
  directDealerRows,
  linkerRows,
  agencyByManagerRows,
  bhByRepRows,
  type PerfRow,
} from "@/lib/salesRepSummary";

type SearchParams = Promise<{ month?: string }>;

const SOURCE_COLORS = {
  직거래처: "#6366f1",
  대리점: "#f59e0b",
  링커: "#10b981",
  바크로하우스: "#e11d48",
} as const;

const monthLabel = (m: string) => formatYM(m).replace("년 ", "/").replace("월", "");

// 직원/링커 실적 표 (직거래처·링커 공용)
function changeCell(cur: number, prev: number) {
  const ch = buildChange(cur, prev, "전월");
  const cls =
    ch.direction === "up" || ch.direction === "new"
      ? "text-emerald-700"
      : ch.direction === "down" || ch.direction === "lost"
        ? "text-rose-700"
        : "text-muted-foreground";
  return { ch, cls };
}

export default async function B2BSummaryPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const ym = await resolveMonth(sp.month);
  const prevYM = prevMonth(ym);

  const [cube, dealerTargets, targets, bhAvailable] = await Promise.all([
    loadFactCube(),
    loadDealerTargets(),
    loadTargets(),
    isBHDataAvailable(),
  ]);

  const [partnerMap, bhSalesCur, bhSalesPrev] = bhAvailable
    ? await Promise.all([loadBHPartnerMap(), loadBHSales(ym), loadBHSales(prevYM)])
    : [new Map<string, BHPartner>(), [] as BHPartnerSale[], [] as BHPartnerSale[]];

  const insights = computeB2BSummaryInsights(cube, ym);

  const fromYM = ymMinusMonths(ym, 11);
  const yearStr = ym.split("-")[0];
  const annualStart = `${yearStr}-01`;
  const ytdMonths = enumerateMonths(annualStart, ym);
  const prevYearStart = `${Number(yearStr) - 1}-01`;
  const prevYearEnd = prevYearSameMonth(ym);

  const [rangeRows12, ytdRows, prevYearRangeRows, bhSalesTrend] = await Promise.all([
    loadRangeRows(fromYM, ym),
    loadRangeRows(annualStart, ym),
    loadRangeRows(prevYearStart, prevYearEnd),
    bhAvailable ? loadBHSalesRange(fromYM, ym) : Promise.resolve([] as BHPartnerSale[]),
  ]);

  // ── 올해 월별 매출 추이 (B2B + 대리점, 종합탭처럼 색상 구분 스택) ──
  // 종합탭과 동일한 ytdCategoryDetailSeries 를 재사용해 B2B(대리점 제외)/대리점을
  // 각각 다른 색으로 분리. 두 시리즈 스택 합 = B2B 카테고리 전체(직거래처+링커+대리점).
  const B2B_COMBO_KEYS = ["병원", "피부관리실", "직거래처", "대리점"];
  const b2bComboSeries = ytdCategoryDetailSeries(cube, ym).filter(
    (s) => s.name === "B2B" || s.name === "대리점",
  );
  const b2bComboAch = ytdAchievementForCustomerKeys(
    ytdRows,
    targets,
    ym,
    B2B_COMBO_KEYS,
    (r) => r.category === "B2B",
  );
  const outlookYm = nextMonthInYear(ym);
  const outlookPrevRows = outlookYm
    ? await loadRangeRows(prevYearSameMonth(outlookYm), prevYearSameMonth(outlookYm))
    : [];
  const b2bComboMonthlyTargets = ytdMonthlyTargets(targets, ym, {
    outlook: true,
    targetFilter: (t) => B2B_COMBO_KEYS.includes(t.customerKey),
  });
  const b2bComboPrevYear = ytdMonthlyPrevYear([...prevYearRangeRows, ...outlookPrevRows], ym, {
    outlook: true,
    rowFilter: (r) => r.category === "B2B",
  });

  // ── 통합 요약 ──
  const repRows = repSummaryRows(cube, partnerMap, bhSalesCur, bhSalesPrev, ym, prevYM);
  const directTotal = repRows.reduce((s, r) => s + r.direct, 0);
  const agencyTotal = repRows.reduce((s, r) => s + r.agency, 0);
  const linkerTotal = repRows.reduce((s, r) => s + r.linker, 0);
  const bhDirectTotal = repRows.reduce((s, r) => s + r.bhDirect, 0);
  const bhAgencyTotal = repRows.reduce((s, r) => s + r.bhAgency, 0);
  const bhTotal = bhDirectTotal + bhAgencyTotal;
  const grandTotal = repRows.reduce((s, r) => s + r.total, 0);
  const prevGrandTotal = repRows.reduce((s, r) => s + r.prevTotal, 0);

  // B2B 카테고리 전체(=월별 매출추이 차트 스택 합). 카드는 이 값을 표시해 차트와 정합.
  // repRows 재조립(전 채널 byMonthCustomer + 대표유형) 대신 category==="B2B" 단일 합 사용.
  const b2bCategoryTotal = cube.byMonthCategory.get(ym)?.get("B2B")?.revenue ?? 0;

  // ── 소스별 상세 ──
  const directRows = directDealerRows(cube, ym, prevYM);
  const linkRows = linkerRows(cube, ym, prevYM);
  const agencyRows = agencyByManagerRows(cube, ym, prevYM);
  const agencyFlat = agencyRows
    .flatMap((r) => r.agencies.map((a) => ({ ...a, manager: r.manager })))
    .sort((a, b) => b.revenue - a.revenue);
  const bhRows = bhByRepRows(partnerMap, bhSalesCur, bhSalesPrev);

  // ── 영업사원 목표 달성 (직거래처) ──
  const monthDealerActual = new Map<string, number>();
  for (const d of directRows) monthDealerActual.set(d.key, d.revenue);
  const ytdDealerActual = new Map<string, number>();
  for (const r of ytdRows) {
    if (r.isNonRevenue) continue;
    if (r.category !== "B2B" || r.b2bCustomerType === "대리점") continue;
    if (isLinker(r.dealer)) continue;
    const d = r.dealer || "미지정";
    ytdDealerActual.set(d, (ytdDealerActual.get(d) ?? 0) + r.realRevenue);
  }
  const dealerAch = buildDealerAchievements(
    dealerTargets, monthDealerActual, ytdDealerActual, ym, ytdMonths, "영업사원",
  );

  // ── 12개월 추이 (소스별) ──
  const directSeries = monthlyRevenueOf(rangeRows12, fromYM, ym, (r) =>
    r.category === "B2B" && r.b2bCustomerType !== "대리점" && !isLinker(r.dealer),
  );
  const agencySeries = monthlyRevenueOf(rangeRows12, fromYM, ym, (r) =>
    r.category === "B2B" && r.b2bCustomerType === "대리점",
  );
  const linkerSeries = monthlyRevenueOf(rangeRows12, fromYM, ym, (r) =>
    r.category === "B2B" && r.b2bCustomerType !== "대리점" && isLinker(r.dealer),
  );
  const trendMonths = directSeries.map((s) => s.yearMonth);
  const bhByMonth = new Map<string, number>();
  for (const s of bhSalesTrend) bhByMonth.set(s.yearMonth, (bhByMonth.get(s.yearMonth) ?? 0) + s.paymentAmount);
  const bhSeries = trendMonths.map((m) => bhByMonth.get(m) ?? 0);

  const hasLinker = linkRows.length > 0 || linkerTotal > 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">{formatYM(ym)} B2B종합 — 영업사원별 실적</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          직거래처 · 대리점 · 링커 · 바크로하우스를 영업사원별로 종합 · 영업사원 {repRows.length}명
        </p>
      </div>

      <TabInsights bullets={insights} />

      {/* ── 올해 월별 매출 추이 (B2B + 대리점 합산) ── */}
      <YearToDateChart
        ym={ym}
        series={b2bComboSeries}
        caption="B2B 월별 매출 (대리점 포함) — B2B / 대리점 색상 구분"
        achievement={b2bComboAch}
        achievementLabel="B2B (대리점 포함)"
        monthlyTargets={b2bComboMonthlyTargets}
        prevYearValues={b2bComboPrevYear}
      />

      {/* ── 통합 요약 KPI ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="통합 실매출 (4개 소스 합)"
          current={grandTotal}
          comparisons={[{ label: COMPARE_LABEL.prevMonth, prev: prevGrandTotal }]}
          highlight
        />
        <MetricCard
          label="B2B (직거래처+대리점+링커)"
          current={b2bCategoryTotal}
          comparisons={[]}
          hint="바크로하우스 제외 · 월별 매출추이와 동일 기준"
        />
        <MetricCard
          label="바크로하우스 추천"
          current={bhTotal}
          comparisons={[]}
        />
        <MetricCard
          label="활성 영업사원"
          current={repRows.length}
          unit="raw"
          unitSuffix="명"
          comparisons={[]}
        />
      </div>

      {/* ── 영업사원별 통합 실적 표 ── */}
      <Card>
        <CardHeader>
          <CardTitle>영업사원별 통합 실적</CardTitle>
          <div className="text-[11px] text-muted-foreground">
            각 영업사원의 직거래처 + 담당 대리점 + 담당 링커 + 바크로하우스 합산 (링커·대리점·바크로하우스는 담당 직원에게 귀속)
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="px-4 pb-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-muted-foreground border-b">
                  <th className="py-2">영업사원</th>
                  <th className="py-2 text-right">직거래처</th>
                  <th className="py-2 text-right">대리점</th>
                  <th className="py-2 text-right">링커</th>
                  <th className="py-2 text-right">바크로(직접)</th>
                  <th className="py-2 text-right">바크로(대리점/링커)</th>
                  <th className="py-2 text-right">합계</th>
                  <th className="py-2 text-right">전월</th>
                  <th className="py-2 text-right">전월 대비</th>
                </tr>
              </thead>
              <tbody>
                {repRows.map((r) => {
                  const { ch, cls } = changeCell(r.total, r.prevTotal);
                  const cell = (v: number) =>
                    v > 0 ? formatKRWShort(v) : <span className="text-neutral-300">·</span>;
                  return (
                    <tr key={r.manager} className="border-b last:border-0">
                      <td className="py-2 font-medium"><SalesRepLink rep={r.manager} ym={ym} /></td>
                      <td className="py-2 text-right tabular-nums">{cell(r.direct)}</td>
                      <td className="py-2 text-right tabular-nums">{cell(r.agency)}</td>
                      <td className="py-2 text-right tabular-nums">{cell(r.linker)}</td>
                      <td className="py-2 text-right tabular-nums">{cell(r.bhDirect)}</td>
                      <td className="py-2 text-right tabular-nums">{cell(r.bhAgency)}</td>
                      <td className="py-2 text-right tabular-nums font-semibold">{formatKRWLong(r.total)}</td>
                      <td className="py-2 text-right tabular-nums text-muted-foreground">
                        {r.prevTotal > 0 ? formatKRWLong(r.prevTotal) : "—"}
                      </td>
                      <td className={`py-2 text-right tabular-nums ${cls}`}>
                        <div>{ch.diffText}</div>
                        <div className="text-[10px]">{ch.pctText}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 font-semibold">
                  <td className="py-2">합계</td>
                  <td className="py-2 text-right tabular-nums">{formatKRWShort(directTotal)}</td>
                  <td className="py-2 text-right tabular-nums">{formatKRWShort(agencyTotal)}</td>
                  <td className="py-2 text-right tabular-nums">{formatKRWShort(linkerTotal)}</td>
                  <td className="py-2 text-right tabular-nums">{formatKRWShort(bhDirectTotal)}</td>
                  <td className="py-2 text-right tabular-nums">{formatKRWShort(bhAgencyTotal)}</td>
                  <td className="py-2 text-right tabular-nums">{formatKRWLong(grandTotal)}</td>
                  <td className="py-2 text-right tabular-nums text-muted-foreground">{formatKRWLong(prevGrandTotal)}</td>
                  <td className="py-2" />
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ── 소스별 12개월 추이 (스택) ── */}
      <Card>
        <CardHeader>
          <CardTitle>소스별 12개월 매출 추이</CardTitle>
          <div className="text-[11px] text-muted-foreground">직거래처 · 대리점 · 링커 · 바크로하우스 스택</div>
        </CardHeader>
        <CardContent>
          <BarChart
            categories={trendMonths.map(monthLabel)}
            series={[
              { name: "직거래처", values: directSeries.map((s) => s.revenue), stack: "src", color: SOURCE_COLORS.직거래처 },
              { name: "대리점", values: agencySeries.map((s) => s.revenue), stack: "src", color: SOURCE_COLORS.대리점 },
              { name: "링커", values: linkerSeries.map((s) => s.revenue), stack: "src", color: SOURCE_COLORS.링커 },
              ...(bhAvailable ? [{ name: "바크로하우스", values: bhSeries, stack: "src", color: SOURCE_COLORS.바크로하우스 }] : []),
            ]}
            height={280}
            yLabel="실매출"
            showStackTotals
          />
        </CardContent>
      </Card>

      {/* ══ 직거래처 ══ */}
      <SourceSection
        title="직거래처"
        color={SOURCE_COLORS.직거래처}
        total={directTotal}
        months={trendMonths}
        series={directSeries.map((s) => s.revenue)}
      >
        <PerfTable rows={directRows} keyLabel="영업사원" ym={ym} />
        {dealerAch.length > 0 && (
          <div className="overflow-x-auto">
            <div className="text-[11px] font-medium text-muted-foreground mb-1 mt-2">영업사원 목표 달성 (직거래처)</div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-muted-foreground border-b">
                  <th className="py-2">영업사원</th>
                  <th className="py-2 text-right">이번달 목표</th>
                  <th className="py-2 text-right">이번달 실적</th>
                  <th className="py-2 text-right">달성률</th>
                  <th className="py-2 text-right">누적 목표</th>
                  <th className="py-2 text-right">누적 실적</th>
                  <th className="py-2 text-right">누적 달성률</th>
                </tr>
              </thead>
              <tbody>
                {dealerAch.map((d) => {
                  const mCls = d.monthRate === null ? "" : d.monthRate >= 1 ? "text-emerald-700 font-semibold" : d.monthRate >= 0.7 ? "text-amber-600" : "text-rose-700 font-semibold";
                  const yCls = d.ytdRate === null ? "" : d.ytdRate >= 1 ? "text-emerald-700" : d.ytdRate >= 0.7 ? "text-amber-600" : "text-rose-700";
                  return (
                    <tr key={d.name} className="border-b last:border-0">
                      <td className="py-2 font-medium"><SalesRepLink rep={d.name} ym={ym} /></td>
                      <td className="py-2 text-right tabular-nums">{formatKRWLong(d.monthTarget)}</td>
                      <td className="py-2 text-right tabular-nums">{formatKRWLong(d.monthActual)}</td>
                      <td className={`py-2 text-right tabular-nums ${mCls}`}>{d.monthRate !== null ? formatPctAbs(d.monthRate, 1) : "—"}</td>
                      <td className="py-2 text-right tabular-nums text-muted-foreground">{formatKRWLong(d.ytdTarget)}</td>
                      <td className="py-2 text-right tabular-nums">{formatKRWLong(d.ytdActual)}</td>
                      <td className={`py-2 text-right tabular-nums ${yCls}`}>{d.ytdRate !== null ? formatPctAbs(d.ytdRate, 1) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SourceSection>

      {/* ══ 대리점 ══ */}
      <SourceSection
        title="대리점"
        color={SOURCE_COLORS.대리점}
        total={agencyTotal}
        months={trendMonths}
        series={agencySeries.map((s) => s.revenue)}
      >
        <div className="text-[11px] font-medium text-muted-foreground mb-1">담당 영업사원별</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] text-muted-foreground border-b">
                <th className="py-2">영업사원</th>
                <th className="py-2 text-right">담당 대리점</th>
                <th className="py-2 text-right">이번달</th>
                <th className="py-2 text-right">전월</th>
                <th className="py-2 text-right">전월 대비</th>
              </tr>
            </thead>
            <tbody>
              {agencyRows.map((r) => {
                const { ch, cls } = changeCell(r.revenue, r.prevRevenue);
                return (
                  <tr key={r.manager} className="border-b last:border-0">
                    <td className="py-2 font-medium"><SalesRepLink rep={r.manager} ym={ym} /></td>
                    <td className="py-2 text-right tabular-nums">{formatInt(r.agencies.length)}개</td>
                    <td className="py-2 text-right tabular-nums">{formatKRWLong(r.revenue)}</td>
                    <td className="py-2 text-right tabular-nums text-muted-foreground">{r.prevRevenue > 0 ? formatKRWLong(r.prevRevenue) : "—"}</td>
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
        {agencyFlat.length > 0 && (
          <div className="overflow-x-auto mt-2">
            <div className="text-[11px] font-medium text-muted-foreground mb-1">대리점별 상세</div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-muted-foreground border-b">
                  <th className="py-2">대리점</th>
                  <th className="py-2">담당 영업사원</th>
                  <th className="py-2 text-right">이번달</th>
                  <th className="py-2 text-right">전월</th>
                  <th className="py-2 text-right">전월 대비</th>
                </tr>
              </thead>
              <tbody>
                {agencyFlat.map((a) => {
                  const { ch, cls } = changeCell(a.revenue, a.prevRevenue);
                  return (
                    <tr key={a.customer} className="border-b last:border-0">
                      <td className="py-2 font-medium">{a.customer}</td>
                      <td className="py-2 text-muted-foreground"><SalesRepLink rep={a.manager} ym={ym} /></td>
                      <td className="py-2 text-right tabular-nums">{formatKRWLong(a.revenue)}</td>
                      <td className="py-2 text-right tabular-nums text-muted-foreground">{a.prevRevenue > 0 ? formatKRWLong(a.prevRevenue) : "—"}</td>
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
        )}
      </SourceSection>

      {/* ══ 링커 ══ */}
      {hasLinker && (
        <SourceSection
          title="링커"
          color={SOURCE_COLORS.링커}
          total={linkerTotal}
          months={trendMonths}
          series={linkerSeries.map((s) => s.revenue)}
        >
          <div className="text-[11px] text-muted-foreground mb-1">외부 영업사원/회사 — 담당 내부 직원이 관리</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-muted-foreground border-b">
                  <th className="py-2">링커</th>
                  <th className="py-2">담당 영업사원</th>
                  <th className="py-2 text-right">담당 거래처</th>
                  <th className="py-2 text-right">이번달</th>
                  <th className="py-2 text-right">전월</th>
                  <th className="py-2 text-right">전월 대비</th>
                </tr>
              </thead>
              <tbody>
                {linkRows.map((r) => {
                  const { ch, cls } = changeCell(r.revenue, r.prevRevenue);
                  return (
                    <tr key={r.key} className="border-b last:border-0">
                      <td className="py-2 font-medium">{r.key}</td>
                      <td className="py-2 text-muted-foreground"><SalesRepLink rep={r.manager} ym={ym} /></td>
                      <td className="py-2 text-right tabular-nums">{formatInt(r.customers)}개</td>
                      <td className="py-2 text-right tabular-nums">{formatKRWLong(r.revenue)}</td>
                      <td className="py-2 text-right tabular-nums text-muted-foreground">{r.prevRevenue > 0 ? formatKRWLong(r.prevRevenue) : "—"}</td>
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
        </SourceSection>
      )}

      {/* ══ 바크로하우스 ══ */}
      {bhAvailable && (
        <SourceSection
          title="바크로하우스"
          color={SOURCE_COLORS.바크로하우스}
          total={bhTotal}
          months={trendMonths}
          series={bhSeries}
        >
          <div className="text-[11px] text-muted-foreground mb-1">파트너 추천 매출 · 본사 파트너는 영업사원별, 링커 파트너는 링커별 집계</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-muted-foreground border-b">
                  <th className="py-2">영업사원/링커</th>
                  <th className="py-2 text-right">이번달</th>
                  <th className="py-2 text-right">전월</th>
                  <th className="py-2 text-right">전월 대비</th>
                  <th className="py-2 text-right">예상 커미션</th>
                  <th className="py-2 text-right">담당 파트너</th>
                </tr>
              </thead>
              <tbody>
                {bhRows.map((r) => {
                  const { ch, cls } = changeCell(r.revenue, r.prevRevenue);
                  return (
                    <tr key={r.salesRep} className="border-b last:border-0">
                      <td className="py-2 font-medium"><SalesRepLink rep={r.salesRep} ym={ym} /></td>
                      <td className="py-2 text-right tabular-nums">{formatKRWLong(r.revenue)}</td>
                      <td className="py-2 text-right tabular-nums text-muted-foreground">{r.prevRevenue > 0 ? formatKRWLong(r.prevRevenue) : "—"}</td>
                      <td className={`py-2 text-right tabular-nums ${cls}`}>
                        <div>{ch.diffText}</div>
                        <div className="text-[10px]">{ch.pctText}</div>
                      </td>
                      <td className="py-2 text-right tabular-nums">{formatKRWLong(r.commission)}</td>
                      <td className="py-2 text-right tabular-nums">{formatInt(r.partners)}개</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SourceSection>
      )}
    </div>
  );
}

// ── 소스 섹션 래퍼 (제목 + 개요 + 월별 추이 + children 표) ──
function SourceSection({
  title,
  color,
  total,
  months,
  series,
  children,
}: {
  title: string;
  color: string;
  total: number;
  months: string[];
  series: number[];
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
            {title}
          </CardTitle>
          <Badge variant="muted">이번달 {formatKRWShort(total)}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <BarChart
          categories={months.map(monthLabel)}
          series={[{ name: title, values: series, color }]}
          height={180}
          showLegend={false}
          yLabel="실매출"
        />
        {children}
      </CardContent>
    </Card>
  );
}

// 직원/링커 단위 실적 표 (직거래처용)
function PerfTable({ rows, keyLabel, ym }: { rows: PerfRow[]; keyLabel: string; ym: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] text-muted-foreground border-b">
            <th className="py-2">{keyLabel}</th>
            <th className="py-2 text-right">담당 거래처</th>
            <th className="py-2 text-right">이번달</th>
            <th className="py-2 text-right">전월</th>
            <th className="py-2 text-right">전월 대비</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const ch = buildChange(r.revenue, r.prevRevenue, "전월");
            const cls =
              ch.direction === "up" || ch.direction === "new"
                ? "text-emerald-700"
                : ch.direction === "down" || ch.direction === "lost"
                  ? "text-rose-700"
                  : "text-muted-foreground";
            return (
              <tr key={r.key} className="border-b last:border-0">
                <td className="py-2 font-medium"><SalesRepLink rep={r.key} ym={ym} /></td>
                <td className="py-2 text-right tabular-nums">{formatInt(r.customers)}개</td>
                <td className="py-2 text-right tabular-nums">{formatKRWLong(r.revenue)}</td>
                <td className="py-2 text-right tabular-nums text-muted-foreground">{r.prevRevenue > 0 ? formatKRWLong(r.prevRevenue) : "—"}</td>
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
  );
}
