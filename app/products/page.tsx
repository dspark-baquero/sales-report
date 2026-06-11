import { loadFactCube, loadRangeRows } from "@/lib/load";
import { resolveMonth } from "@/lib/months";
import { ymMinusMonths } from "@/lib/aggregate";
import { quarterProgress } from "@/lib/compare";
import {
  productProfile,
  listProductsRanked,
  topProductsOfMonth,
  productMovers,
  newProducts,
  lostProducts,
} from "@/lib/productAnalysis";
import { computeProductsInsights } from "@/lib/tabInsights";
import { TabInsights } from "@/components/TabInsights";
import { ProductSelect } from "@/components/ProductSelect";
import { ProductLink } from "@/components/ProductLink";
import { CustomerLink } from "@/components/CustomerLink";
import { YearToDateChart } from "@/components/YearToDateChart";
import { ytdByDim } from "@/lib/ytd";
import { MetricCard } from "@/components/MetricCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Package } from "lucide-react";
import { LineChart } from "@/components/charts/LineChart";
import { DonutChart } from "@/components/charts/DonutChart";
import { BarChart } from "@/components/charts/BarChart";
import { COMPARE_LABEL, CHANNEL_GROUP_COLOR } from "@/lib/labels";
import {
  formatKRWLong,
  formatKRWShort,
  formatInt,
  formatYM,
  formatPctAbs,
} from "@/lib/format";
import type { FactCube } from "@/lib/facts";
import type { SalesRow } from "@/lib/parsers";

type SearchParams = Promise<{ month?: string; product?: string }>;

// 채널 분포 색상 — 채널그룹 팔레트를 순환 사용.
const CHANNEL_PALETTE = ["#0f172a", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#0ea5e9", "#9ca3af"];

// 제품 1개 deep dive
function ProductPanel({
  cube,
  productName,
  ym,
  rangeRows,
}: {
  cube: FactCube;
  productName: string;
  ym: string;
  rangeRows: SalesRow[];
}) {
  const profile = productProfile(cube, productName, ym, rangeRows);
  const qProg = quarterProgress(ym);
  const monthsLabels = profile.trend24m.map((p) => p.yearMonth.slice(2).replace("-", "/"));
  const topCustomers = profile.customerBreakdown.slice(0, 12);

  return (
    <div className="space-y-4">
      {/* 헤더 카드 */}
      <Card className="border-primary/20">
        <CardContent className="py-3 px-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <Package className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-base font-semibold">{productName}</h3>
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                {profile.brand && <Badge variant="info">{profile.brand}</Badge>}
                {profile.primaryCategory && <span>주력 대분류: {profile.primaryCategory}</span>}
                <span>· 회사 매출 비중: {formatPctAbs(profile.sharePctOfTotal / 100, 2)}</span>
              </div>
            </div>
            <div className="flex gap-1.5">
              {profile.flags.isNew && <Badge variant="info">신규 진입</Badge>}
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
          label="이번달 판매수량"
          current={profile.curMonth.qty}
          unit="qty"
          unitSuffix="개"
          comparisons={[
            { label: COMPARE_LABEL.prevMonth, prev: profile.prevMonth.qty },
            { label: COMPARE_LABEL.prevYear, prev: profile.prevYear.qty },
          ]}
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

      {/* 채널 분포 / 거래처 분포 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>이번달 채널 분포</CardTitle>
          </CardHeader>
          <CardContent>
            {profile.channelBreakdown.length === 0 ? (
              <div className="text-sm text-muted-foreground py-6">매출 없음</div>
            ) : (
              <DonutChart
                items={profile.channelBreakdown.map((c, i) => ({
                  name: c.channel,
                  value: c.revenue,
                  color: CHANNEL_GROUP_COLOR[c.channel] ?? CHANNEL_PALETTE[i % CHANNEL_PALETTE.length],
                }))}
                height={260}
                showCenter={{ label: "이번달 합계", value: formatKRWShort(profile.curMonth.revenue) }}
              />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>이번달 거래처 분포 (Top 12)</CardTitle>
          </CardHeader>
          <CardContent>
            {topCustomers.length === 0 ? (
              <div className="text-sm text-muted-foreground py-6">매출 없음</div>
            ) : (
              <BarChart
                categories={topCustomers.map((c) => c.customer)}
                series={[
                  {
                    name: "실매출",
                    values: topCustomers.map((c) => c.revenue),
                    color: "#0f172a",
                  },
                ]}
                height={Math.max(220, topCustomers.length * 28)}
                horizontal
                showValueLabels
                yLabel="실매출"
                customerLinkMonth={ym}
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* 신규 거래처 / 이탈 거래처 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>신규 거래처 (직전 6개월 미거래 → 이번달)</CardTitle>
              <Badge variant="info">{profile.newCustomers.length}개</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="px-4 pb-4 overflow-x-auto">
              {profile.newCustomers.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4">해당 없음</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] text-muted-foreground border-b">
                      <th className="py-2">거래처</th>
                      <th className="py-2 text-right">매출</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profile.newCustomers.slice(0, 10).map((c) => (
                      <tr key={c.customer} className="border-b last:border-0">
                        <td className="py-2 max-w-[240px] truncate">
                          <CustomerLink customer={c.customer} ym={ym} />
                        </td>
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
              <CardTitle>이탈 거래처 (직전 6개월 거래 → 이번달 0)</CardTitle>
              <Badge variant="negative">{profile.lostCustomers.length}개</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="px-4 pb-4 overflow-x-auto">
              {profile.lostCustomers.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4">해당 없음</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] text-muted-foreground border-b">
                      <th className="py-2">거래처</th>
                      <th className="py-2 text-right">직전 6개월 합</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profile.lostCustomers.slice(0, 10).map((c) => (
                      <tr key={c.customer} className="border-b last:border-0">
                        <td className="py-2 max-w-[240px] truncate">
                          <CustomerLink customer={c.customer} ym={ym} />
                        </td>
                        <td className="py-2 text-right tabular-nums text-muted-foreground">
                          {formatKRWLong(c.prevRevenue)}
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

// 제품 미선택 — 랭킹 + 변동 하이라이트
function ProductEmptyState({ cube, ym }: { cube: FactCube; ym: string }) {
  const ranked = topProductsOfMonth(cube, ym, 15);
  const movers = productMovers(cube, ym, ymMinusMonths(ym, 1), 5);
  const fresh = newProducts(cube, ym, 6).slice(0, 5);
  const lost = lostProducts(cube, ym, 5);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>제품을 선택하세요</CardTitle>
          <div className="text-[11px] text-muted-foreground">
            상단 셀렉터에서 제품을 검색·선택하면 24개월 추이 / 분기·연간 비교 / 채널·거래처 분포 / 신규·이탈 거래처가 표시됩니다.
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="px-4 pb-4">
            <div className="text-xs text-muted-foreground mb-2">{formatYM(ym)} 매출 상위 15 제품:</div>
            {ranked.length === 0 ? (
              <div className="text-sm text-muted-foreground py-4">이번달 매출 데이터가 없습니다.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] text-muted-foreground border-b">
                    <th className="py-2 w-8">#</th>
                    <th className="py-2">제품</th>
                    <th className="py-2 text-right">수량</th>
                    <th className="py-2 text-right">매출</th>
                  </tr>
                </thead>
                <tbody>
                  {ranked.map((p, i) => (
                    <tr key={p.productName} className="border-b last:border-0">
                      <td className="py-1.5 text-muted-foreground">{i + 1}</td>
                      <td className="py-1.5 max-w-[360px] truncate">
                        <span className="text-muted-foreground text-xs mr-1">[{p.brand}]</span>
                        <ProductLink productName={p.productName} ym={ym} className="text-foreground hover:underline" />
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-muted-foreground">{formatInt(p.qty)}</td>
                      <td className="py-1.5 text-right tabular-nums">{formatKRWLong(p.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>전월 대비 급등 제품</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="px-4 pb-4">
              {movers.gainers.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4">해당 없음</div>
              ) : (
                <table className="w-full text-sm">
                  <tbody>
                    {movers.gainers.map((g) => (
                      <tr key={g.productName} className="border-b last:border-0">
                        <td className="py-1.5 max-w-[280px] truncate">
                          <span className="text-muted-foreground text-xs mr-1">[{g.brand}]</span>
                          <ProductLink productName={g.productName} ym={ym} />
                        </td>
                        <td className="py-1.5 text-right tabular-nums text-emerald-700">
                          +{formatKRWLong(g.diff)}
                        </td>
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
            <CardTitle>전월 대비 급락 제품</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="px-4 pb-4">
              {movers.decliners.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4">해당 없음</div>
              ) : (
                <table className="w-full text-sm">
                  <tbody>
                    {movers.decliners.map((d) => (
                      <tr key={d.productName} className="border-b last:border-0">
                        <td className="py-1.5 max-w-[280px] truncate">
                          <span className="text-muted-foreground text-xs mr-1">[{d.brand}]</span>
                          <ProductLink productName={d.productName} ym={ym} />
                        </td>
                        <td className="py-1.5 text-right tabular-nums text-rose-700">
                          {formatKRWLong(d.diff)}
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>신규 진입 제품 (직전 6개월 무거래)</CardTitle>
              <Badge variant="info">{fresh.length}개</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="px-4 pb-4">
              {fresh.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4">해당 없음</div>
              ) : (
                <table className="w-full text-sm">
                  <tbody>
                    {fresh.map((p) => (
                      <tr key={p.productName} className="border-b last:border-0">
                        <td className="py-1.5 max-w-[280px] truncate">
                          <span className="text-muted-foreground text-xs mr-1">[{p.brand}]</span>
                          <ProductLink productName={p.productName} ym={ym} />
                        </td>
                        <td className="py-1.5 text-right tabular-nums">{formatKRWLong(p.currentRevenue)}</td>
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
              <CardTitle>단종/이탈 제품 (지난 분기 상위 → 이번달 0)</CardTitle>
              <Badge variant="negative">{lost.length}개</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="px-4 pb-4">
              {lost.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4">해당 없음</div>
              ) : (
                <table className="w-full text-sm">
                  <tbody>
                    {lost.map((p) => (
                      <tr key={p.productName} className="border-b last:border-0">
                        <td className="py-1.5 max-w-[280px] truncate">
                          <span className="text-muted-foreground text-xs mr-1">[{p.brand}]</span>
                          <ProductLink productName={p.productName} ym={ym} />
                        </td>
                        <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                          {formatKRWLong(p.baselineRevenue)}
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

export default async function ProductsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const [ym, cube] = await Promise.all([resolveMonth(sp.month), loadFactCube()]);

  const ranked = listProductsRanked(cube);
  const options = ranked.map((r) => ({
    productName: r.productName,
    brand: r.brand,
    totalRevenue: r.totalRevenue,
  }));
  const productSet = new Set(ranked.map((r) => r.productName));
  const product = sp.product && productSet.has(sp.product) ? sp.product : null;

  const insights = computeProductsInsights(cube, ym, product);

  // deep dive 분해용 — 직전 6개월 ~ ym
  const rangeRows = product ? await loadRangeRows(ymMinusMonths(ym, 6), ym) : [];

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{formatYM(ym)} 제품 분석</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            제품 1개 deep dive — 24개월 추이 / 분기·연간 비교 / 채널·거래처 분포 / 신규·이탈 거래처
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ProductSelect options={options} current={product} paramKey="product" label="제품 선택" />
        </div>
      </div>

      <TabInsights bullets={insights} />

      {!product && (
        <YearToDateChart
          ym={ym}
          series={ytdByDim(cube, ym, "product", 5)}
          caption="제품 Top 5 + 기타 — 제품을 선택하면 24개월 추이 / 채널·거래처 분해로 전환"
        />
      )}

      {product ? (
        <ProductPanel cube={cube} productName={product} ym={ym} rangeRows={rangeRows} />
      ) : (
        <ProductEmptyState cube={cube} ym={ym} />
      )}
    </div>
  );
}
