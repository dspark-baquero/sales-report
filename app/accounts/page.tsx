import { loadFactCube, loadSalesRows } from "@/lib/load";
import { resolveMonth } from "@/lib/months";
import { ymMinusMonths, filterMonth } from "@/lib/aggregate";
import { prevMonth, prevYearSameMonth, quarterOf, prevQuarter, quarterProgress } from "@/lib/compare";
import {
  customerProfile,
  listCustomersRanked,
  customerTrend,
} from "@/lib/accountAnalysis";
import { computeAccountsInsights } from "@/lib/tabInsights";
import { TabInsights } from "@/components/TabInsights";
import { CustomerSelect } from "@/components/CustomerSelect";
import { YearToDateChart } from "@/components/YearToDateChart";
import { ytdCustomerSeries, ytdBrandForCustomerSeries } from "@/lib/ytd";
import { MetricCard } from "@/components/MetricCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LineChart } from "@/components/charts/LineChart";
import { DonutChart } from "@/components/charts/DonutChart";
import { BarChart } from "@/components/charts/BarChart";
import { COMPARE_LABEL, BRAND_COLOR, CHANNEL_GROUP_COLOR, CATEGORY_COLOR } from "@/lib/labels";
import {
  formatKRW,
  formatKRWLong,
  formatKRWShort,
  formatInt,
  formatYM,
  formatPct,
  formatPctAbs,
} from "@/lib/format";
import type { SalesRow } from "@/lib/load";
import type { FactCube } from "@/lib/facts";

type SearchParams = Promise<{ month?: string; customer?: string; compare?: string }>;

// 거래처 한 명의 deep dive 카드 묶음 — 단일/비교 모드 공용
function CustomerPanel({
  cube,
  customer,
  ym,
  rows,
}: {
  cube: FactCube;
  customer: string;
  ym: string;
  rows: SalesRow[];
}) {
  const profile = customerProfile(cube, customer, ym);
  const qProg = quarterProgress(ym);

  // 브랜드/채널 분해 — raw rows에서 customer 필터 (한 달치만)
  const monthRows = rows.filter((r) => r.customer === customer && !r.isNonRevenue);
  const brandMap = new Map<string, number>();
  const channelMap = new Map<string, number>();
  for (const r of monthRows) {
    brandMap.set(r.brand, (brandMap.get(r.brand) ?? 0) + r.realRevenue);
    channelMap.set(r.channel, (channelMap.get(r.channel) ?? 0) + r.realRevenue);
  }
  const total = profile.curMonth.revenue;
  const brandBreakdown = [...brandMap.entries()]
    .map(([brand, revenue]) => ({ brand, revenue, pct: total > 0 ? revenue / total : 0 }))
    .sort((a, b) => b.revenue - a.revenue);
  const channelBreakdown = [...channelMap.entries()]
    .map(([channel, revenue]) => ({ channel, revenue, pct: total > 0 ? revenue / total : 0 }))
    .sort((a, b) => b.revenue - a.revenue);

  // Top 제품 — 이번달 + 전월 비교
  const prevYM = prevMonth(ym);
  const prevRows = filterMonth(rows, prevYM).filter((r) => r.customer === customer && !r.isNonRevenue);
  const prodCur = new Map<string, { name: string; brand: string; revenue: number; qty: number }>();
  for (const r of monthRows) {
    if (!r.productName) continue;
    const key = r.productCode || r.productName;
    const v = prodCur.get(key) ?? { name: r.productName, brand: r.brand, revenue: 0, qty: 0 };
    v.revenue += r.realRevenue;
    v.qty += r.qty;
    prodCur.set(key, v);
  }
  const prodPrev = new Map<string, number>();
  for (const r of prevRows) {
    if (!r.productName) continue;
    const key = r.productCode || r.productName;
    prodPrev.set(key, (prodPrev.get(key) ?? 0) + r.realRevenue);
  }
  const topProducts = [...prodCur.entries()]
    .map(([k, v]) => ({ key: k, ...v, prev: prodPrev.get(k) ?? 0 }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  // 신규 SKU (이 거래처가 직전 6개월 무거래 제품 → 이번달)
  const past6Start = ymMinusMonths(ym, 6);
  const past6Set = new Set<string>();
  for (const m of cube.monthsAsc) {
    if (m < past6Start || m >= ym) continue;
    // 큐브에 customer×product 분해 없음. raw rows로 필터.
  }
  // 6개월간 이 거래처 raw rows 빠르게 추출
  const past6Rows = rows.filter((r) => {
    if (r.isNonRevenue) return false;
    if (r.customer !== customer) return false;
    return r.yearMonth >= past6Start && r.yearMonth < ym;
  });
  for (const r of past6Rows) {
    if (!r.productName) continue;
    past6Set.add(r.productCode || r.productName);
  }
  const newSkus: { name: string; brand: string; revenue: number }[] = [];
  for (const [k, v] of prodCur) {
    if (!past6Set.has(k)) newSkus.push({ name: v.name, brand: v.brand, revenue: v.revenue });
  }
  newSkus.sort((a, b) => b.revenue - a.revenue);

  // 단종/이탈 SKU — 직전 6개월 매출 있었는데 이번달 0
  const past6Map = new Map<string, { name: string; brand: string; total: number }>();
  for (const r of past6Rows) {
    if (!r.productName) continue;
    const key = r.productCode || r.productName;
    const v = past6Map.get(key) ?? { name: r.productName, brand: r.brand, total: 0 };
    v.total += r.realRevenue;
    past6Map.set(key, v);
  }
  const droppedSkus: { name: string; brand: string; prevAvg: number }[] = [];
  for (const [k, v] of past6Map) {
    if (v.total < 100_000) continue;
    if (!prodCur.has(k)) droppedSkus.push({ name: v.name, brand: v.brand, prevAvg: v.total / 6 });
  }
  droppedSkus.sort((a, b) => b.prevAvg - a.prevAvg);

  // 24개월 추이
  const monthsLabels = profile.trend24m.map((p) => p.yearMonth.slice(2).replace("-", "/"));

  return (
    <div className="space-y-4">
      {/* 헤더 카드 — 거래처명 + 메타 + 플래그 */}
      <Card className="border-primary/20">
        <CardContent className="py-3 px-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <h3 className="text-base font-semibold">{customer}</h3>
              <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                {profile.category && <Badge variant="info">{profile.category}</Badge>}
                {profile.primaryBrand && <span>대표 브랜드: {profile.primaryBrand}</span>}
                {profile.primaryDealer && <span>· 담당 딜러: {profile.primaryDealer}</span>}
                <span>· 회사 매출 비중: {formatPctAbs(profile.sharePctOfTotal / 100, 2)}</span>
              </div>
            </div>
            <div className="flex gap-1.5">
              {profile.flags.sleeping && <Badge variant="info">동면 복귀</Badge>}
              {profile.flags.quarterCliff && <Badge variant="negative">분기 절벽</Badge>}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPI 카드 4개 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="이번달 실매출"
          current={profile.curMonth.revenue}
          comparisons={[
            { label: COMPARE_LABEL.prevMonth, prev: profile.prevMonth.revenue },
            { label: COMPARE_LABEL.prevYear, prev: profile.prevYear.revenue },
          ]}
          highlight
        />
        <MetricCard
          label="이번분기 누적"
          current={profile.quarter.current}
          comparisons={[
            { label: COMPARE_LABEL.prevYearQuarter, prev: profile.quarter.prevYear, note: `${qProg}/3개월 진행분 비교` },
          ]}
        />
        <MetricCard
          label="연간 누적 (YTD)"
          current={profile.ytd.ytd}
          comparisons={[{ label: "전년 동기간", prev: profile.ytd.prevYtd }]}
        />
        <MetricCard
          label="이번달 주문건수"
          current={profile.curMonth.orders}
          unit="raw"
          unitSuffix="건"
          comparisons={[{ label: COMPARE_LABEL.prevMonth, prev: profile.prevMonth.orders }]}
        />
      </div>

      {/* 24개월 추이 */}
      <Card>
        <CardHeader>
          <CardTitle>24개월 매출 추이</CardTitle>
        </CardHeader>
        <CardContent>
          <LineChart
            categories={monthsLabels}
            series={[
              {
                name: "실매출",
                values: profile.trend24m.map((p) => p.revenue),
                color: "#0f172a",
                area: true,
                smooth: true,
              },
            ]}
            height={280}
            yLabel="실매출"
          />
        </CardContent>
      </Card>

      {/* 브랜드 / 채널 분해 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>이번달 브랜드 분포</CardTitle>
          </CardHeader>
          <CardContent>
            {brandBreakdown.length === 0 ? (
              <div className="text-sm text-muted-foreground py-6">매출 없음</div>
            ) : (
              <DonutChart
                items={brandBreakdown.map((b) => ({
                  name: b.brand,
                  value: b.revenue,
                  color: BRAND_COLOR[b.brand] ?? "#9ca3af",
                }))}
                height={260}
                showCenter={{ label: "이번달 합계", value: formatKRWShort(total) }}
              />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>이번달 채널 분포</CardTitle>
          </CardHeader>
          <CardContent>
            {channelBreakdown.length === 0 ? (
              <div className="text-sm text-muted-foreground py-6">매출 없음</div>
            ) : (
              <BarChart
                categories={channelBreakdown.map((c) => c.channel)}
                series={[
                  {
                    name: "실매출",
                    values: channelBreakdown.map((c) => c.revenue),
                    color: "#0f172a",
                  },
                ]}
                height={Math.max(220, channelBreakdown.length * 30)}
                horizontal
                showValueLabels
                yLabel="실매출"
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top 10 제품 */}
      <Card>
        <CardHeader>
          <CardTitle>이번달 Top 10 제품 (전월 비교)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="px-4 pb-4 overflow-x-auto">
            {topProducts.length === 0 ? (
              <div className="text-sm text-muted-foreground py-4">매출 없음</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] text-muted-foreground border-b">
                    <th className="py-2">#</th>
                    <th className="py-2">제품</th>
                    <th className="py-2 text-right">수량</th>
                    <th className="py-2 text-right">이번달</th>
                    <th className="py-2 text-right">전월</th>
                  </tr>
                </thead>
                <tbody>
                  {topProducts.map((p, i) => (
                    <tr key={p.key} className="border-b last:border-0">
                      <td className="py-2 text-muted-foreground">{i + 1}</td>
                      <td className="py-2 max-w-[260px] truncate">
                        <span className="text-muted-foreground text-xs mr-1">[{p.brand}]</span>
                        {p.name}
                      </td>
                      <td className="py-2 text-right tabular-nums">{formatInt(p.qty)}</td>
                      <td className="py-2 text-right tabular-nums">{formatKRWLong(p.revenue)}</td>
                      <td className="py-2 text-right tabular-nums text-muted-foreground">
                        {p.prev > 0 ? formatKRWLong(p.prev) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 신규 SKU / 단종 SKU */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>신규 SKU (직전 6개월 미거래 → 이번달)</CardTitle>
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
                      <th className="py-2 text-right">매출</th>
                    </tr>
                  </thead>
                  <tbody>
                    {newSkus.slice(0, 10).map((s) => (
                      <tr key={s.name} className="border-b last:border-0">
                        <td className="py-2 max-w-[240px] truncate">
                          <span className="text-muted-foreground text-xs mr-1">[{s.brand}]</span>
                          {s.name}
                        </td>
                        <td className="py-2 text-right tabular-nums">{formatKRWLong(s.revenue)}</td>
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
              <CardTitle>이탈 SKU (직전 6개월 거래 → 이번달 0)</CardTitle>
              <Badge variant="negative">{droppedSkus.length}개</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="px-4 pb-4 overflow-x-auto">
              {droppedSkus.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4">해당 없음</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] text-muted-foreground border-b">
                      <th className="py-2">제품</th>
                      <th className="py-2 text-right">직전 평균</th>
                    </tr>
                  </thead>
                  <tbody>
                    {droppedSkus.slice(0, 10).map((s) => (
                      <tr key={s.name} className="border-b last:border-0">
                        <td className="py-2 max-w-[240px] truncate">
                          <span className="text-muted-foreground text-xs mr-1">[{s.brand}]</span>
                          {s.name}
                        </td>
                        <td className="py-2 text-right tabular-nums text-muted-foreground">
                          {formatKRWLong(s.prevAvg)}
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

// 거래처 미선택 시 — 변동 하이라이트 + 안내
function EmptyState({ cube, ym }: { cube: FactCube; ym: string }) {
  const ranked = listCustomersRanked(cube).slice(0, 10);
  return (
    <Card>
      <CardHeader>
        <CardTitle>거래처를 선택하세요</CardTitle>
        <div className="text-[11px] text-muted-foreground">
          상단 셀렉터에서 거래처를 검색·선택하면 24개월 추이 / 분기 비교 / 브랜드·채널 분해 / 신규·이탈 SKU 가 표시됩니다.
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="px-4 pb-4">
          <div className="text-xs text-muted-foreground mb-2">전체 기간 매출 상위 10 거래처:</div>
          <table className="w-full text-sm">
            <tbody>
              {ranked.map((r, i) => (
                <tr key={r.customer} className="border-b last:border-0">
                  <td className="py-1.5 text-muted-foreground w-8">{i + 1}</td>
                  <td className="py-1.5">
                    <a
                      href={`/accounts?customer=${encodeURIComponent(r.customer)}&month=${ym}`}
                      className="text-foreground hover:underline"
                    >
                      {r.customer}
                    </a>
                  </td>
                  <td className="py-1.5">
                    {r.category && <Badge variant="info">{r.category}</Badge>}
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                    {formatKRWLong(r.totalRevenue)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

export default async function AccountsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const ym = resolveMonth(sp.month);
  const cube = loadFactCube();
  const all = loadSalesRows();

  const ranked = listCustomersRanked(cube);
  const options = ranked.map((r) => ({
    customer: r.customer,
    totalRevenue: r.totalRevenue,
    category: r.category as string | null,
  }));

  const customer = sp.customer && cube.customers.has(sp.customer) ? sp.customer : null;
  const compare = sp.compare && cube.customers.has(sp.compare) && sp.compare !== customer ? sp.compare : null;

  const insights = computeAccountsInsights(cube, ym, customer);

  const monthRows = filterMonth(all, ym);

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{formatYM(ym)} 거래처 분석</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            거래처 1곳 또는 2곳을 비교 — 24개월 추이 / 분기·연간 비교 / 브랜드·채널 분해 / 신규·이탈 SKU
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <CustomerSelect options={options} current={customer} paramKey="customer" label="거래처 선택" />
          {customer && (
            <CustomerSelect options={options} current={compare} paramKey="compare" label="+ 비교 거래처" />
          )}
        </div>
      </div>

      <TabInsights bullets={insights} />

      {customer ? (
        <YearToDateChart
          ym={ym}
          series={ytdBrandForCustomerSeries(all, ym, customer)}
          caption={`${customer} 의 브랜드 Top 5 + 기타`}
        />
      ) : (
        <YearToDateChart
          ym={ym}
          series={ytdCustomerSeries(cube, ym, 5)}
          caption="거래처 Top 5 + 기타 — 거래처를 선택하면 그 거래처의 브랜드 분해로 전환"
        />
      )}

      {!customer ? (
        <EmptyState cube={cube} ym={ym} />
      ) : compare ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <CustomerPanel cube={cube} customer={customer} ym={ym} rows={monthRows} />
          <CustomerPanel cube={cube} customer={compare} ym={ym} rows={monthRows} />
        </div>
      ) : (
        <CustomerPanel cube={cube} customer={customer} ym={ym} rows={monthRows} />
      )}
    </div>
  );
}
