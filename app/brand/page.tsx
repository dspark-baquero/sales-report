import { loadFactCube, loadMonthRows, loadRangeRows } from "@/lib/load";
import { resolveMonth } from "@/lib/months";
import { computeBrandInsights } from "@/lib/tabInsights";
import { TabInsights } from "@/components/TabInsights";
import { CustomerLink } from "@/components/CustomerLink";
import {
  ymMinusMonths,
  monthlyByCategory,
  topNProductsEnhanced,
  enumerateMonths,
  revenueRows,
} from "@/lib/aggregate";
import {
  prevMonth,
  prevYearSameMonth,
  quarterOf,
  prevQuarter,
  quarterProgress,
} from "@/lib/compare";
import { attributeChange } from "@/lib/changeAttribution";
import { loadTargets, targetsForMonthWithProspective } from "@/lib/targets";
import { COMPARE_LABEL, CATEGORY_COLOR, BRAND_COLOR } from "@/lib/labels";
import { MetricCard } from "@/components/MetricCard";
import { ChangeBreakdown } from "@/components/ChangeBreakdown";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BrandSelect } from "@/components/BrandSelect";
import { YearToDateChart } from "@/components/YearToDateChart";
import {
  ytdCategoryForBrandSeries,
  ytdAchievementForBrand,
  ytdMonthlyTargets,
  ytdMonthlyPrevYear,
  outlookPrevYearMonths,
} from "@/lib/ytd";
import { BarChart } from "@/components/charts/BarChart";
import { DonutChart } from "@/components/charts/DonutChart";
import { Treemap } from "@/components/charts/Treemap";
import { TopProductsTable } from "@/components/TopProductsTable";
import {
  formatKRWLong,
  formatKRWShort,
  formatInt,
  formatYM,
  formatPctAbs,
  buildChange,
} from "@/lib/format";
import { BRAND_TO_HOUSE } from "@/config/mappings";
import type { SalesRow } from "@/lib/load";

type SearchParams = Promise<{ month?: string; brand?: string }>;

export default async function BrandPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const ym = await resolveMonth(sp.month);
  const [cube, targets] = await Promise.all([loadFactCube(), loadTargets()]);

  const brands = Object.keys(BRAND_TO_HOUSE).filter((b) => b !== "기타");
  const brand = sp.brand && brands.includes(sp.brand) ? sp.brand : brands[0];
  const house = BRAND_TO_HOUSE[brand] ?? "기타";
  const insights = computeBrandInsights(cube, ym, brand);

  const isBrand = (r: SalesRow) => r.brand === brand;

  const { qStart } = quarterOf(ym);
  const prevQ = prevQuarter(ym);
  const qProg = quarterProgress(ym);

  const [curAll, prevMoAll, prevYrAll, curQAll, prevQRowsAll] = await Promise.all([
    loadMonthRows(ym),
    loadMonthRows(prevMonth(ym)),
    loadMonthRows(prevYearSameMonth(ym)),
    loadRangeRows(qStart, ym),
    loadRangeRows(prevQ.qStart, ymMinusMonths(prevQ.qEnd, 3 - qProg)),
  ]);
  const cur = curAll.filter(isBrand);
  const prevMo = prevMoAll.filter(isBrand);
  const prevYr = prevYrAll.filter(isBrand);
  const curQ = curQAll.filter(isBrand);
  const prevQRows = prevQRowsAll.filter(isBrand);

  const sumRev = (rows: SalesRow[]) =>
    rows.filter((r) => !r.isNonRevenue).reduce((s, r) => s + r.realRevenue, 0);
  const sumQty = (rows: SalesRow[]) =>
    rows.filter((r) => !r.isNonRevenue).reduce((s, r) => s + r.qty, 0);

  const curRev = sumRev(cur);
  const prevMoRev = sumRev(prevMo);
  const prevYrRev = sumRev(prevYr);
  const curQRev = sumRev(curQ);
  const prevQRev = sumRev(prevQRows);
  const curQty = sumQty(cur);
  const prevMoQty = sumQty(prevMo);

  // 24개월 추이 (카테고리별 스택)
  const fromYM = ymMinusMonths(ym, 23);
  const monthsList = enumerateMonths(fromYM, ym);
  const rangeRows = await loadRangeRows(fromYM, ym);
  const stack = monthlyByCategory(rangeRows.filter(isBrand), fromYM, ym);
  const categories: ("수출" | "B2B" | "B2C" | "면세점")[] = ["수출", "B2B", "B2C", "면세점"];

  // 카테고리 분포 (이번달 + 전월)
  const catDistribution = (() => {
    const out: Record<string, number> = { 수출: 0, B2B: 0, B2C: 0, 면세점: 0 };
    for (const r of cur) {
      if (r.isNonRevenue) continue;
      out[r.category] = (out[r.category] ?? 0) + r.realRevenue;
    }
    return out;
  })();
  const catDistPrev = (() => {
    const out: Record<string, number> = { 수출: 0, B2B: 0, B2C: 0, 면세점: 0 };
    for (const r of prevMo) {
      if (r.isNonRevenue) continue;
      out[r.category] = (out[r.category] ?? 0) + r.realRevenue;
    }
    return out;
  })();

  // 채널/거래처 트리맵
  const segments = (() => {
    const m = new Map<string, number>();
    for (const r of cur) {
      if (r.isNonRevenue) continue;
      let key = "";
      if (r.category === "B2B") key = `B2B/${r.b2bCustomerType ?? "기타"}`;
      else if (r.category === "면세점") key = `면세점/${r.customer || "기타"}`;
      else key = `B2C/${r.channel || "기타"}`;
      m.set(key, (m.get(key) ?? 0) + r.realRevenue);
    }
    return [...m.entries()]
      .map(([k, v]) => ({ name: k, value: v }))
      .sort((a, b) => b.value - a.value);
  })();

  // 채널별 상세 (이번달 vs 전월)
  const channelDetail = (() => {
    const curMap = new Map<string, { revenue: number; qty: number }>();
    for (const r of revenueRows(cur)) {
      const key = r.category === "B2B"
        ? `B2B · ${r.b2bCustomerType ?? "기타"}`
        : r.category === "면세점"
          ? `면세점 · ${r.customer || "기타"}`
          : r.category === "수출"
            ? `수출 · ${r.country || "기타"}`
            : `B2C · ${r.channel || "기타"}`;
      const c = curMap.get(key) ?? { revenue: 0, qty: 0 };
      c.revenue += r.realRevenue;
      c.qty += r.qty;
      curMap.set(key, c);
    }
    const prevMap = new Map<string, number>();
    for (const r of revenueRows(prevMo)) {
      const key = r.category === "B2B"
        ? `B2B · ${r.b2bCustomerType ?? "기타"}`
        : r.category === "면세점"
          ? `면세점 · ${r.customer || "기타"}`
          : r.category === "수출"
            ? `수출 · ${r.country || "기타"}`
            : `B2C · ${r.channel || "기타"}`;
      prevMap.set(key, (prevMap.get(key) ?? 0) + r.realRevenue);
    }
    return [...curMap.entries()]
      .map(([channel, v]) => ({ channel, ...v, prev: prevMap.get(channel) ?? 0 }))
      .sort((a, b) => b.revenue - a.revenue);
  })();

  // SKU 분석 (YTD 포함)
  const ytdStart = `${ym.split("-")[0]}-01`;
  const ytdBrand = rangeRows.filter((r) => isBrand(r) && r.yearMonth >= ytdStart);
  const topSkus = topNProductsEnhanced(cur, prevMo, ytdBrand, 20);

  // 신규 SKU (이번달 첫 출고)
  const past6FromYM = ymMinusMonths(ym, 6);
  const past6Range = await loadRangeRows(past6FromYM, prevMonth(ym));
  const past6FromExclusive = past6Range.filter(isBrand);
  const past6Skus = new Set(past6FromExclusive.map((r) => r.productName));
  const newSkus = (() => {
    const m = new Map<string, { qty: number; revenue: number }>();
    for (const r of cur) {
      if (r.isNonRevenue) continue;
      if (!r.productName || past6Skus.has(r.productName)) continue;
      const cur = m.get(r.productName) ?? { qty: 0, revenue: 0 };
      cur.qty += r.qty;
      cur.revenue += r.realRevenue;
      m.set(r.productName, cur);
    }
    return [...m.entries()]
      .map(([productName, v]) => ({ productName, ...v }))
      .sort((a, b) => b.revenue - a.revenue);
  })();

  // 단종 위험 SKU (직전 6개월 평균 대비 -70%+)
  const past6 = past6Range.filter(isBrand);
  const past6Map = new Map<string, number>();
  for (const r of past6) {
    if (r.isNonRevenue || !r.productName) continue;
    past6Map.set(r.productName, (past6Map.get(r.productName) ?? 0) + r.realRevenue);
  }
  const curSkuMap = new Map<string, number>();
  for (const r of cur) {
    if (r.isNonRevenue || !r.productName) continue;
    curSkuMap.set(r.productName, (curSkuMap.get(r.productName) ?? 0) + r.realRevenue);
  }
  const declining = (() => {
    const out: { productName: string; prevAvg: number; current: number; pct: number }[] = [];
    for (const [name, total] of past6Map) {
      const avg = total / 6;
      if (avg < 100_000) continue; // 미미한 SKU 제외
      const cur = curSkuMap.get(name) ?? 0;
      if (avg === 0) continue;
      const pct = (cur - avg) / avg;
      if (pct <= -0.7) {
        out.push({ productName: name, prevAvg: avg, current: cur, pct });
      }
    }
    return out.sort((a, b) => a.pct - b.pct).slice(0, 20);
  })();

  // 변화 요인 — 채널/거래처 단위
  const channelContribs = attributeChange(cur, prevMo, (r) => {
    if (r.category === "B2B") return `B2B/${r.b2bCustomerType ?? "기타"}`;
    if (r.category === "면세점") return `면세점/${r.customer ?? "기타"}`;
    return `B2C/${r.channel ?? "기타"}`;
  });
  const skuContribs = attributeChange(cur, prevMo, (r) => r.productName || null);

  // 이번달 목표 합계 (해당 브랜드). 페이지가 actual을 별도로 산출하므로 가벼운 변형 사용.
  const ta = targetsForMonthWithProspective(targets, ym);
  const brandTarget = ta
    .filter((t) => t.brand === brand && !t.prospective)
    .reduce((s, t) => s + t.target, 0);

  // 전년 동기 + 월별 목표 (브랜드 단일)
  const prevYearStart = `${Number(ym.split("-")[0]) - 1}-01`;
  const prevYearEnd = prevYearSameMonth(ym);
  const prevYearRangeRows = await loadRangeRows(prevYearStart, prevYearEnd);
  const outlookPrevRows = (
    await Promise.all(outlookPrevYearMonths(ym).map((m) => loadMonthRows(m)))
  ).flat();
  const brandMonthlyTargetsArr = ytdMonthlyTargets(targets, ym, {
    outlook: true,
    targetFilter: (t) => t.brand === brand,
  });
  const brandMonthlyPrevYearArr = ytdMonthlyPrevYear([...prevYearRangeRows, ...outlookPrevRows], ym, {
    outlook: true,
    rowFilter: (r) => r.brand === brand,
  });

  // 카테고리별 목표
  const catTargets = new Map<string, number>();
  for (const t of ta) {
    if (t.brand !== brand || t.prospective) continue;
    if (t.division === "해외") {
      catTargets.set("수출", (catTargets.get("수출") ?? 0) + t.target);
    } else if (t.customerKey === "면세점") {
      catTargets.set("면세점", (catTargets.get("면세점") ?? 0) + t.target);
    } else if (["병원", "피부관리실", "대리점", "직거래처"].includes(t.customerKey)) {
      catTargets.set("B2B", (catTargets.get("B2B") ?? 0) + t.target);
    } else {
      catTargets.set("B2C", (catTargets.get("B2C") ?? 0) + t.target);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">
            {formatYM(ym)} 브랜드 심층 분석 — {brand}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            <Badge variant={house === "자체" ? "info" : "warn"}>{house} 브랜드</Badge> · 24개월
            추이 · 채널 분포 · SKU 분석
          </p>
        </div>
        <BrandSelect brands={brands} current={brand} />
      </div>

      <TabInsights bullets={insights} />

      <YearToDateChart
        ym={ym}
        series={ytdCategoryForBrandSeries(rangeRows, ym, brand)}
        caption={`${brand} 의 대분류 (B2B / B2C / 면세점) 흐름`}
        achievement={ytdAchievementForBrand(rangeRows, targets, ym, brand)}
        achievementLabel={brand}
        monthlyTargets={brandMonthlyTargetsArr}
        prevYearValues={brandMonthlyPrevYearArr}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="브랜드 실매출"
          current={curRev}
          comparisons={[
            { label: COMPARE_LABEL.prevMonth, prev: prevMoRev },
            { label: COMPARE_LABEL.curQuarter, current: curQRev, prev: prevQRev, note: `${qProg}/3개월` },
            { label: COMPARE_LABEL.prevYear, prev: prevYrRev },
          ]}
          target={{ value: brandTarget, label: "브랜드 이번달 목표 합계" }}
          highlight
        />
        <MetricCard
          label="총 판매수량"
          current={curQty}
          unit="qty"
          comparisons={[{ label: COMPARE_LABEL.prevMonth, prev: prevMoQty }]}
        />
        <MetricCard
          label="활성 SKU 수"
          current={curSkuMap.size}
          unit="raw"
          hint="이번달 매출 발생 제품"
        />
        <MetricCard
          label="신규 SKU"
          current={newSkus.length}
          unit="raw"
          hint="직전 6개월 무매출 → 이번달 첫 출고"
        />
      </div>

      {/* 24개월 추이 */}
      <Card>
        <CardHeader>
          <CardTitle>24개월 카테고리별 매출 추이</CardTitle>
        </CardHeader>
        <CardContent>
          <BarChart
            categories={monthsList.map((m) => formatYM(m).replace("년 ", "/").replace("월", ""))}
            series={categories.map((c) => ({
              name: c,
              values: stack.map((s) => s.values[c]),
              stack: "월합계",
              color: CATEGORY_COLOR[c],
            }))}
            height={320}
            yLabel="실매출"
          />
        </CardContent>
      </Card>

      {/* 카테고리 분포 + 목표 달성률 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>이번달 카테고리 분포</CardTitle>
          </CardHeader>
          <CardContent>
            <DonutChart
              items={categories
                .filter((c) => catDistribution[c] > 0)
                .map((c) => ({
                  name: c,
                  value: catDistribution[c],
                  color: CATEGORY_COLOR[c],
                }))}
              height={300}
              showCenter={{
                label: "이번달 합계",
                value: formatKRWShort(curRev),
              }}
            />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>카테고리별 매출 · 목표 · 전월 비교</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="px-4 pb-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] text-muted-foreground border-b">
                    <th className="py-2">카테고리</th>
                    <th className="py-2 text-right">이번달</th>
                    <th className="py-2 text-right">전월</th>
                    <th className="py-2 text-right">변화</th>
                    <th className="py-2 text-right">목표</th>
                    <th className="py-2 text-right">달성률</th>
                  </tr>
                </thead>
                <tbody>
                  {categories
                    .filter((c) => catDistribution[c] > 0 || catDistPrev[c] > 0 || (catTargets.get(c) ?? 0) > 0)
                    .map((c) => {
                      const rev = catDistribution[c];
                      const prev = catDistPrev[c];
                      const tgt = catTargets.get(c) ?? 0;
                      const ch = buildChange(rev, prev, "전월");
                      const cls =
                        ch.direction === "up" || ch.direction === "new"
                          ? "text-emerald-700"
                          : ch.direction === "down" || ch.direction === "lost"
                            ? "text-rose-700"
                            : "text-muted-foreground";
                      const rate = tgt > 0 ? rev / tgt : null;
                      const achCls = rate === null
                        ? "text-muted-foreground"
                        : rate < 0.7
                          ? "text-rose-700"
                          : rate < 1
                            ? "text-amber-600"
                            : "text-emerald-700";
                      return (
                        <tr key={c} className="border-b last:border-0">
                          <td className="py-2 font-medium">
                            <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ backgroundColor: CATEGORY_COLOR[c] ?? "#9ca3af" }} />
                            {c}
                          </td>
                          <td className="py-2 text-right tabular-nums">{formatKRWLong(rev)}</td>
                          <td className="py-2 text-right tabular-nums text-muted-foreground">
                            {prev > 0 ? formatKRWLong(prev) : "—"}
                          </td>
                          <td className={`py-2 text-right tabular-nums ${cls}`}>
                            <div>{ch.diffText}</div>
                            <div className="text-[10px]">{ch.pctText}</div>
                          </td>
                          <td className="py-2 text-right tabular-nums">
                            {tgt > 0 ? formatKRWLong(tgt) : "—"}
                          </td>
                          <td className={`py-2 text-right tabular-nums font-medium ${achCls}`}>
                            {rate !== null ? formatPctAbs(rate, 1) : "—"}
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

      {/* 채널/거래처 트리맵 + 상세 테이블 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>채널/거래처 분포 (트리맵)</CardTitle>
            <div className="text-[11px] text-muted-foreground">면세점 거래처 노드 클릭 시 거래처 분석으로 이동</div>
          </CardHeader>
          <CardContent>
            <Treemap
              data={segments.slice(0, 30)}
              height={340}
              customerLinkMonth={ym}
              customerNamePrefix="면세점/"
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>채널별 매출 상세 (이번달)</CardTitle>
            <div className="text-[11px] text-muted-foreground">카테고리 · 채널/거래처유형/국가 단위</div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="px-4 pb-4 overflow-x-auto max-h-[400px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card">
                  <tr className="text-left text-[11px] text-muted-foreground border-b">
                    <th className="py-2">채널</th>
                    <th className="py-2 text-right">이번달</th>
                    <th className="py-2 text-right">수량</th>
                    <th className="py-2 text-right">전월</th>
                    <th className="py-2 text-right">변화</th>
                  </tr>
                </thead>
                <tbody>
                  {channelDetail.slice(0, 25).map((d) => {
                    const ch = buildChange(d.revenue, d.prev, "전월");
                    const cls =
                      ch.direction === "up" || ch.direction === "new"
                        ? "text-emerald-700"
                        : ch.direction === "down" || ch.direction === "lost"
                          ? "text-rose-700"
                          : "text-muted-foreground";
                    const dutyPrefix = "면세점 · ";
                    const isDutyCustomer = d.channel.startsWith(dutyPrefix);
                    return (
                      <tr key={d.channel} className="border-b last:border-0">
                        <td className="py-1.5 text-xs">
                          {isDutyCustomer ? (
                            <CustomerLink customer={d.channel.slice(dutyPrefix.length)} ym={ym}>
                              {d.channel}
                            </CustomerLink>
                          ) : (
                            d.channel
                          )}
                        </td>
                        <td className="py-1.5 text-right tabular-nums">{formatKRWLong(d.revenue)}</td>
                        <td className="py-1.5 text-right tabular-nums text-muted-foreground">{formatInt(d.qty)}</td>
                        <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                          {d.prev > 0 ? formatKRWLong(d.prev) : "—"}
                        </td>
                        <td className={`py-1.5 text-right tabular-nums text-xs ${cls}`}>
                          {ch.pctText}
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

      {/* 채널 변화 요인 */}
      <ChangeBreakdown
        title="전월 대비 채널/거래처 변화 요인"
        prevTotal={prevMoRev}
        curTotal={curRev}
        contribs={channelContribs}
        topN={5}
        prevLabel={COMPARE_LABEL.prevMonth}
        hint={`${brand} 브랜드의 채널/거래처 단위 분해`}
      />

      {/* SKU 변화 요인 */}
      <ChangeBreakdown
        title="전월 대비 SKU 변화 요인"
        prevTotal={prevMoRev}
        curTotal={curRev}
        contribs={skuContribs}
        topN={5}
        prevLabel={COMPARE_LABEL.prevMonth}
        hint="개별 제품(SKU) 단위 분해"
      />

      <TopProductsTable products={topSkus} title={`이번달 상위 20 제품 — ${brand}`} ym={ym} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>신규 SKU (직전 6개월 무매출 → 이번달)</CardTitle>
              <Badge variant="info">{newSkus.length}개</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="px-4 pb-4 overflow-x-auto">
              {newSkus.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4">해당 없음</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] text-muted-foreground border-b">
                      <th className="py-2">제품</th>
                      <th className="py-2 text-right">수량</th>
                      <th className="py-2 text-right">실매출</th>
                    </tr>
                  </thead>
                  <tbody>
                    {newSkus.slice(0, 15).map((p) => (
                      <tr key={p.productName} className="border-b last:border-0">
                        <td className="py-2 max-w-[260px] truncate">{p.productName}</td>
                        <td className="py-2 text-right tabular-nums">{formatInt(p.qty)}</td>
                        <td className="py-2 text-right tabular-nums">{formatKRWLong(p.revenue)}</td>
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
              <CardTitle>단종 위험 SKU (-70% 이상 하락)</CardTitle>
              <Badge variant="negative">{declining.length}개</Badge>
            </div>
            <div className="text-[11px] text-muted-foreground">직전 6개월 평균 대비 이번달 매출 비교</div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="px-4 pb-4 overflow-x-auto">
              {declining.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4">해당 없음</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] text-muted-foreground border-b">
                      <th className="py-2">제품</th>
                      <th className="py-2 text-right">직전 평균</th>
                      <th className="py-2 text-right">이번달</th>
                      <th className="py-2 text-right">변화</th>
                    </tr>
                  </thead>
                  <tbody>
                    {declining.map((p) => (
                      <tr key={p.productName} className="border-b last:border-0">
                        <td className="py-2 max-w-[240px] truncate">{p.productName}</td>
                        <td className="py-2 text-right tabular-nums text-muted-foreground">
                          {formatKRWLong(p.prevAvg)}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {p.current > 0 ? formatKRWLong(p.current) : "0원"}
                        </td>
                        <td className="py-2 text-right tabular-nums text-rose-700">
                          {formatPctAbs(p.pct, 0)}
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
    </div>
  );
}
