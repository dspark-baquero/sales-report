import Link from "next/link";
import { loadFactCube, loadScopedCube, loadMonthRows, loadRangeRows, type ReportScope } from "@/lib/load";
import { resolveMonth } from "@/lib/months";
import {
  kpi,
  ymMinusMonths,
  topNCustomersWithPrev,
  nonRevenueSummary,
  categoryRevenue,
  enumerateMonths,
} from "@/lib/aggregate";
import { computeOverviewInsights } from "@/lib/tabInsights";
import { TabInsights } from "@/components/TabInsights";
import { ScopeTabs } from "@/components/ScopeTabs";
import { CustomerLink } from "@/components/CustomerLink";
import { BrandMatrix } from "@/components/BrandCustomerMatrix";
import {
  buildBrandChannelMatrix,
  buildBrandCustomerMatrixForChannel,
  buildBaqueroHousePartnerMatrix,
  CHANNEL_KEYS,
  type BrandCustomerMatrixData,
  type ChannelKey,
} from "@/lib/brandCustomerMatrix";
import {
  loadBHSalesRange,
  isBHDataAvailable,
} from "@/lib/baquerohouse-data";
import { BRAND_TO_HOUSE } from "@/config/mappings";
import { YearToDateChart } from "@/components/YearToDateChart";
import {
  ytdCategoryDetailSeries,
  ytdAchievementOverall,
  ytdMonthlyTargets,
  ytdMonthlyPrevYear,
  outlookPrevYearMonths,
} from "@/lib/ytd";
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
import { COMPARE_LABEL } from "@/lib/labels";
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

type SearchParams = Promise<{ month?: string; scope?: string }>;

const DETAIL_CHANNELS = [
  { key: "B2B", color: "#8b5cf6" },
  { key: "대리점", color: "#a78bfa" },
  { key: "B2C", color: "#10b981" },
  { key: "바크로하우스", color: "#6ee7b7" },
  { key: "면세점", color: "#f59e0b" },
  { key: "수출", color: "#0ea5e9" },
] as const;

export default async function HomePage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const ym = await resolveMonth(sp.month);
  const { qStart, qNumber } = quarterOf(ym);
  const prevQ = prevQuarter(ym);
  const qProg = quarterProgress(ym);

  // 스코프 필터: 전체 / 국내(수출 제외) / 해외(수출만). 해외 = category "수출".
  const scope: ReportScope =
    sp.scope === "국내" || sp.scope === "해외" ? sp.scope : "전체";
  const rowInScope = (r: { category: string }) =>
    scope === "전체" ? true : scope === "해외" ? r.category === "수출" : r.category !== "수출";
  const targetInScope = (t: { division: string }) =>
    scope === "전체" ? true : scope === "해외" ? t.division === "해외" : t.division === "국내";
  const scopeRows = <T extends { category: string }>(rows: T[]): T[] =>
    scope === "전체" ? rows : rows.filter(rowInScope);

  const [cube, targetsAll, curRaw, prevMoRaw, prevYrRaw, curQ, prevQRows] = await Promise.all([
    scope === "전체" ? loadFactCube() : loadScopedCube(scope),
    loadTargets(),
    loadMonthRows(ym),
    loadMonthRows(prevMonth(ym)),
    loadMonthRows(prevYearSameMonth(ym)),
    loadRangeRows(qStart, ym),
    loadRangeRows(prevQ.qStart, prevQ.qEnd),
  ]);
  const cur = scopeRows(curRaw);
  const prevMo = scopeRows(prevMoRaw);
  const prevYr = scopeRows(prevYrRaw);
  const targets = scope === "전체" ? targetsAll : targetsAll.filter(targetInScope);
  const insights = computeOverviewInsights(cube, ym);

  // 스코프별 표시 채널. 해외 = 수출만, 국내 = 수출 제외, 전체 = 6채널.
  const visibleChannels: string[] =
    scope === "해외"
      ? ["수출"]
      : scope === "국내"
        ? ["B2B", "대리점", "B2C", "바크로하우스", "면세점"]
        : ["B2B", "대리점", "B2C", "바크로하우스", "면세점", "수출"];
  const showCh = (k: string) => visibleChannels.includes(k);
  // 브랜드 매트릭스 채널대분류(수출=해외영업). 스코프별로 컬럼 제한.
  const matrixChannels: ChannelKey[] =
    scope === "해외"
      ? ["해외영업"]
      : scope === "국내"
        ? ["B2B", "대리점", "바크로하우스", "B2C", "면세점"]
        : CHANNEL_KEYS;

  const k = kpi(cur);
  const kPrevMo = kpi(prevMo);

  const catCur = categoryRevenue(cur);
  const catPrevMo = categoryRevenue(prevMo);
  const catPrevYr = categoryRevenue(prevYr);

  const totalTarget = targets
    .filter((t) => t.yearMonth === ym)
    .reduce((s, t) => s + t.target, 0);

  // 채널별 매출
  const agencyFilter = (r: { category: string; b2bCustomerType: string | null }) =>
    r.category === "B2B" && r.b2bCustomerType === "대리점";
  // 바크로하우스 메인몰만 별도 집계. 스마트스토어는 B2C(자사 공식몰)에 포함.
  const bhFilter = (r: { channel: string }) => r.channel === "바크로하우스";

  const agencyCur = cur.filter((r) => !r.isNonRevenue && agencyFilter(r)).reduce((s, r) => s + r.realRevenue, 0);
  const agencyPrevMo = prevMo.filter((r) => !r.isNonRevenue && agencyFilter(r)).reduce((s, r) => s + r.realRevenue, 0);
  const agencyPrevYr = prevYr.filter((r) => !r.isNonRevenue && agencyFilter(r)).reduce((s, r) => s + r.realRevenue, 0);

  const bhCur = cur.filter((r) => !r.isNonRevenue && bhFilter(r)).reduce((s, r) => s + r.realRevenue, 0);
  const bhPrevMo = prevMo.filter((r) => !r.isNonRevenue && bhFilter(r)).reduce((s, r) => s + r.realRevenue, 0);
  const bhPrevYr = prevYr.filter((r) => !r.isNonRevenue && bhFilter(r)).reduce((s, r) => s + r.realRevenue, 0);

  // 채널별 목표 (prospective 제외)
  const { targetsForMonthWithProspective } = await import("@/lib/targets");
  const ta = targetsForMonthWithProspective(targets, ym);
  const b2bKeys = new Set(["병원", "피부관리실", "직거래처"]);
  const b2cKeys = new Set(["공식몰", "종합몰", "소호몰"]);
  const b2bTarget = ta.filter((t) => b2bKeys.has(t.customerKey) && !t.prospective).reduce((s, t) => s + t.target, 0);
  const b2cTarget = ta.filter((t) => b2cKeys.has(t.customerKey) && !t.prospective).reduce((s, t) => s + t.target, 0);
  const dutyTarget = ta.filter((t) => t.customerKey === "면세점" && !t.prospective).reduce((s, t) => s + t.target, 0);
  const exportTarget = ta.filter((t) => t.division === "해외" && !t.prospective).reduce((s, t) => s + t.target, 0);
  const agencyTarget = ta.filter((t) => t.customerKey === "대리점" && !t.prospective).reduce((s, t) => s + t.target, 0);
  const bhTarget = ta.filter((t) => t.customerKey === "바크로하우스" && !t.prospective).reduce((s, t) => s + t.target, 0);

  // YTD 달성률
  const [yearStr] = ym.split("-");
  const ytdStart = `${yearStr}-01`;
  const ytdRangeRows = scopeRows(await loadRangeRows(ytdStart, ym));

  // 전년 동기 (1년 전 1월 ~ 1년 전 ym월)
  const prevYearStart = `${Number(yearStr) - 1}-01`;
  const prevYearEnd = prevYearSameMonth(ym);
  const prevYearRangeRows = scopeRows(await loadRangeRows(prevYearStart, prevYearEnd));

  // 월별 목표 (전체 국내) + 전년 동기 (전체). 다음 달(전망) 슬롯 포함.
  // prevYearRangeRows 는 브랜드 매트릭스에서도 재사용되므로 원본은 경과월까지로 유지하고,
  // 전망 슬롯용 작년 다음 달만 오버레이 계산에서 합친다.
  const outlookPrevRows = scopeRows(
    (await Promise.all(outlookPrevYearMonths(ym).map((m) => loadMonthRows(m)))).flat(),
  );
  const ytdMonthlyTargetsOverall = ytdMonthlyTargets(targets, ym, { outlook: true });
  const ytdMonthlyPrevYearOverall = ytdMonthlyPrevYear(
    [...prevYearRangeRows, ...outlookPrevRows],
    ym,
    { outlook: true },
  );

  // 브랜드 매트릭스 (2뎁스)
  const matrixBrands = Object.keys(BRAND_TO_HOUSE).filter((b) => b !== "기타");
  const depth1Matrix = buildBrandChannelMatrix(
    targets,
    ytdRangeRows,
    prevYearRangeRows,
    cur,
    prevMo,
    prevYr,
    ym,
    matrixBrands,
    matrixChannels,
  );
  const depth2ByChannel = Object.fromEntries(
    matrixChannels.map((ch) => [
      ch,
      buildBrandCustomerMatrixForChannel(
        cube,
        ytdRangeRows,
        prevYearRangeRows,
        cur,
        prevMo,
        prevYr,
        ym,
        matrixBrands,
        ch,
        10,
      ),
    ]),
  ) as Partial<Record<ChannelKey, BrandCustomerMatrixData>>;

  // 바크로하우스 채널만 메인 sales 거래처 대신 파트너 추천 매출(BHPartnerSale) 기준으로 교체.
  // 파트너 데이터가 사용 가능하지 않으면 빈 매트릭스로 fallback ("데이터 없음" 메시지).
  const bhAvailable = matrixChannels.includes("바크로하우스") && (await isBHDataAvailable());
  if (matrixChannels.includes("바크로하우스") && bhAvailable) {
    const [bhYtdSales, bhPrevYearYtdSales, bhCurSales, bhPrevSales, bhPrevYearSales] =
      await Promise.all([
        loadBHSalesRange(ytdStart, ym),
        loadBHSalesRange(prevYearStart, prevYearEnd),
        loadBHSalesRange(ym, ym),
        loadBHSalesRange(prevMonth(ym), prevMonth(ym)),
        loadBHSalesRange(prevYearSameMonth(ym), prevYearSameMonth(ym)),
      ]);
    depth2ByChannel["바크로하우스"] = buildBaqueroHousePartnerMatrix(
      bhYtdSales,
      bhPrevYearYtdSales,
      bhCurSales,
      bhPrevSales,
      bhPrevYearSales,
      matrixBrands,
      10,
    );
  } else if (matrixChannels.includes("바크로하우스")) {
    depth2ByChannel["바크로하우스"] = buildBaqueroHousePartnerMatrix(
      [], [], [], [], [],
      matrixBrands,
      10,
    );
  }

  // 12개월 카테고리 스택 (6채널 분리)
  const fromYM = ymMinusMonths(ym, 11);
  const rangeRows12 = await loadRangeRows(fromYM, ym);
  const stackMonths = enumerateMonths(fromYM, ym);

  const monthlyDetail = stackMonths.map((m) => {
    const b2bTotal = cube.byMonthCategory.get(m)?.get("B2B")?.revenue ?? 0;
    const agency = cube.byMonthB2bType.get(m)?.get("대리점")?.revenue ?? 0;
    const b2cTotal = cube.byMonthCategory.get(m)?.get("B2C")?.revenue ?? 0;
    const chMap = cube.byMonthChannel.get(m);
    const bh = chMap?.get("바크로하우스")?.revenue ?? 0;
    return {
      ym: m,
      B2B: b2bTotal - agency,
      대리점: agency,
      B2C: b2cTotal - bh,
      바크로하우스: bh,
      면세점: cube.byMonthCategory.get(m)?.get("면세점")?.revenue ?? 0,
      수출: cube.byMonthCategory.get(m)?.get("수출")?.revenue ?? 0,
    };
  });

  const topCustomers = topNCustomersWithPrev(cur, prevMo, 20);

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
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{formatYM(ym)} 종합 매출 보고서</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            이번달 실매출 {formatKRWLong(k.revenue)} · {qNumber}분기 진행률 {qProg}/3개월
          </p>
        </div>
        <ScopeTabs />
      </div>

      <TabInsights bullets={insights.slice(0, 5)} />

      {/* 1-2. 브랜드 매트릭스 (1뎁스 채널 + 2뎁스 거래처) */}
      <BrandMatrix depth1={depth1Matrix} depth2ByChannel={depth2ByChannel} ym={ym} />

      {/* 2. YTD 월별 매출 추이 (6채널 분리) */}
      <YearToDateChart
        ym={ym}
        series={ytdCategoryDetailSeries(cube, ym)}
        caption={`채널별 (${visibleChannels.join(" / ")})`}
        achievement={ytdAchievementOverall(ytdRangeRows, targets, ym)}
        achievementLabel={scope}
        monthlyTargets={ytdMonthlyTargetsOverall}
        prevYearValues={ytdMonthlyPrevYearOverall}
      />

      {/* 3. 채널별 KPI 카드 (목표 달성률 포함) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {showCh("B2B") && (
          <MetricCard
            label="B2B"
            current={catCur["B2B"] - agencyCur}
            comparisons={[
              { label: COMPARE_LABEL.prevMonth, prev: catPrevMo["B2B"] - agencyPrevMo },
              { label: COMPARE_LABEL.prevYear, prev: catPrevYr["B2B"] - agencyPrevYr },
            ]}
            target={b2bTarget > 0 ? { value: b2bTarget, label: "B2B 목표" } : undefined}
          />
        )}
        {showCh("대리점") && (
          <MetricCard
            label="대리점"
            current={agencyCur}
            comparisons={[
              { label: COMPARE_LABEL.prevMonth, prev: agencyPrevMo },
              { label: COMPARE_LABEL.prevYear, prev: agencyPrevYr },
            ]}
            target={agencyTarget > 0 ? { value: agencyTarget, label: "대리점 목표" } : undefined}
          />
        )}
        {showCh("B2C") && (
          <MetricCard
            label="B2C"
            current={catCur["B2C"] - bhCur}
            comparisons={[
              { label: COMPARE_LABEL.prevMonth, prev: catPrevMo["B2C"] - bhPrevMo },
              { label: COMPARE_LABEL.prevYear, prev: catPrevYr["B2C"] - bhPrevYr },
            ]}
            target={b2cTarget > 0 ? { value: b2cTarget, label: "B2C 목표" } : undefined}
          />
        )}
        {showCh("바크로하우스") && (
          <MetricCard
            label="바크로하우스"
            current={bhCur}
            comparisons={[
              { label: COMPARE_LABEL.prevMonth, prev: bhPrevMo },
              { label: COMPARE_LABEL.prevYear, prev: bhPrevYr },
            ]}
            target={bhTarget > 0 ? { value: bhTarget, label: "바크로하우스 목표" } : undefined}
          />
        )}
        {showCh("면세점") && (
          <MetricCard
            label="면세점"
            current={catCur["면세점"]}
            comparisons={[
              { label: COMPARE_LABEL.prevMonth, prev: catPrevMo["면세점"] },
              { label: COMPARE_LABEL.prevYear, prev: catPrevYr["면세점"] },
            ]}
            target={dutyTarget > 0 ? { value: dutyTarget, label: "면세점 목표" } : undefined}
          />
        )}
        {showCh("수출") && (
          <MetricCard
            label="수출"
            current={catCur["수출"]}
            comparisons={[
              { label: COMPARE_LABEL.prevMonth, prev: catPrevMo["수출"] },
              { label: COMPARE_LABEL.prevYear, prev: catPrevYr["수출"] },
            ]}
            target={exportTarget > 0 ? { value: exportTarget, label: "수출 목표" } : undefined}
          />
        )}
      </div>

      {/* 4. 12개월 채널별 매출 추이 (6채널 분리) */}
      <Card>
        <CardHeader>
          <CardTitle>최근 12개월 채널별 매출 추이</CardTitle>
        </CardHeader>
        <CardContent>
          <BarChart
            categories={stackMonths.map((m) => formatYM(m).replace("년 ", "/").replace("월", ""))}
            series={DETAIL_CHANNELS.filter((ch) => showCh(ch.key)).map((ch) => ({
              name: ch.key,
              values: monthlyDetail.map((d) => d[ch.key]),
              stack: "월합계",
              color: ch.color,
            }))}
            height={320}
            showLegend
            yLabel="실매출"
          />
        </CardContent>
      </Card>

      {/* 5. Top 20 거래처 */}
      <Card>
        <CardHeader>
          <CardTitle>이번달 상위 20 거래처 (전월 비교)</CardTitle>
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

      {/* 6. 거래처 변동 요약 */}
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
                  최대: <CustomerLink customer={sleeping[0].customer} ym={ym} />
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

      {/* 7. 비매출 출고 1줄 요약 — 상세 탭 링크 */}
      <Link
        href={`/non-revenue?month=${ym}`}
        className="block text-xs text-muted-foreground px-1 hover:text-foreground transition-colors"
      >
        비매출 출고: 이번달 {formatInt(nrCur.totalRows)}건 · {formatInt(nrCur.totalQty)}개 · 원가 합계{" "}
        {formatKRWLong(nrCur.totalCost)} (전월 {formatInt(nrPrev.totalRows)}건 ·{" "}
        {formatKRWLong(nrPrev.totalCost)}){" "}
        <span className="text-primary">상세 →</span>
      </Link>
    </div>
  );
}
