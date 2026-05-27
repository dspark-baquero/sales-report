import { loadFactCube, loadMonthRows, loadRangeRows } from "@/lib/load";
import { resolveMonth } from "@/lib/months";
import { ymMinusMonths } from "@/lib/aggregate";
import { prevMonth } from "@/lib/compare";
import {
  newProducts,
  decliningProducts,
  weekdayComparison,
  customerConcentration,
  brandChannelGroupHeatmap,
  discountFeeByChannelGroup,
} from "@/lib/insights";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart } from "@/components/charts/BarChart";
import { HeatmapChart } from "@/components/charts/HeatmapChart";
import {
  formatKRWLong,
  formatInt,
  formatYM,
  formatPctAbs,
} from "@/lib/format";
import type { SalesRow } from "@/lib/load";

type SearchParams = Promise<{ month?: string }>;

export default async function InsightsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const ym = await resolveMonth(sp.month);
  const prevYM = prevMonth(ym);

  const [cube, curRows, prevMoRows, rangeRows] = await Promise.all([
    loadFactCube(),
    loadMonthRows(ym),
    loadMonthRows(prevYM),
    loadRangeRows(ymMinusMonths(ym, 13), ym),
  ]);

  const revRows = curRows.filter((r) => !r.isNonRevenue);
  const curTotal = revRows.reduce((s, r) => s + r.realRevenue, 0);

  // 데이터 품질
  const nonRevenue = curRows.filter((r) => r.isNonRevenue).length;
  const costMissing = revRows.filter((r) => r.cost === null).length;

  // 기존 insights 함수
  const conc = customerConcentration(rangeRows, ym);
  const heat = brandChannelGroupHeatmap(rangeRows, ym);
  const df = discountFeeByChannelGroup(rangeRows, ym);
  const np = newProducts(rangeRows, ym);
  const dec = decliningProducts(rangeRows, ym);
  const weekday = weekdayComparison(rangeRows, ym);

  // 신제품 합산 매출 비중
  const newProductTotal = np.reduce((s, p) => s + p.revenue, 0);

  // 할인율 전월 비교 데이터
  const prevDiscountMap = (() => {
    const m = new Map<string, { discount: number; orderAmount: number }>();
    for (const r of prevMoRows) {
      if (r.isNonRevenue) continue;
      const cur = m.get(r.channelGroup) ?? { discount: 0, orderAmount: 0 };
      cur.discount += r.discount;
      cur.orderAmount += r.orderAmount;
      m.set(r.channelGroup, cur);
    }
    return new Map(
      [...m.entries()].map(([g, v]) => [
        g,
        v.orderAmount > 0 ? v.discount / v.orderAmount : 0,
      ]),
    );
  })();

  // 이상치 거래
  const bigDeals = curRows
    .filter((r) => !r.isNonRevenue && r.realRevenue >= 100_000_000)
    .sort((a, b) => b.realRevenue - a.realRevenue)
    .slice(0, 20);

  const heatmapData = heat.values.flatMap((row, bi) =>
    row.map((v, gi) => ({ x: gi, y: bi, value: v })),
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">{formatYM(ym)} 심층 분석</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          데이터 품질 · 거래처 집중도 · 채널 수익성 · 제품 포트폴리오 · 이상치 — 다른 탭에서 다루지 않는 전사 구조 분석
        </p>
      </div>

      {/* 1. 데이터 품질 */}
      <Card>
        <CardHeader>
          <CardTitle>데이터 품질 점검</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-[11px] text-muted-foreground">매출 행 수</div>
              <div className="text-lg font-semibold tabular-nums">{formatInt(revRows.length)}건</div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">비매출 행</div>
              <div className="text-lg font-semibold tabular-nums">{formatInt(nonRevenue)}건</div>
              <div className="text-[10px] text-muted-foreground">집계 제외</div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">원가 누락 행</div>
              <div className="text-lg font-semibold tabular-nums">{formatInt(costMissing)}건</div>
              <div className="text-[10px] text-muted-foreground">
                {revRows.length > 0
                  ? `(${formatPctAbs(costMissing / revRows.length, 1)})`
                  : ""}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">활성 거래처 수</div>
              <div className="text-lg font-semibold tabular-nums">{formatInt(conc.customerCount)}개</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 2. 거래처 집중도 */}
      <Card>
        <CardHeader>
          <CardTitle>거래처 집중도</CardTitle>
          <div className="text-[11px] text-muted-foreground">
            상위 거래처 의존도 + 허핀달-허쉬만 집중지수
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-6 text-sm">
            <div>
              <div className="text-[11px] text-muted-foreground">상위 10 거래처 비중</div>
              <div className="text-2xl font-semibold tabular-nums">
                {formatPctAbs(conc.top10Pct)}
              </div>
              <div className="text-[10px] text-muted-foreground">
                {formatKRWLong(conc.top10)} / {formatKRWLong(conc.total)}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">집중지수 (HHI)</div>
              <div className="text-2xl font-semibold tabular-nums">{conc.hhi.toFixed(0)}</div>
              <div className="text-[10px] text-muted-foreground">
                {conc.hhi < 1500 ? "낮음 (분산 거래)" : conc.hhi < 2500 ? "중간" : "높음 (집중 거래)"}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">활성 거래처 수</div>
              <div className="text-2xl font-semibold tabular-nums">
                {formatInt(conc.customerCount)}개
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 3. 브랜드 × 채널그룹 히트맵 */}
      {heat.brands.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>브랜드 × 채널그룹 히트맵 (이번달 실매출)</CardTitle>
          </CardHeader>
          <CardContent>
            <HeatmapChart
              xCategories={heat.groups}
              yCategories={heat.brands}
              data={heatmapData}
              height={Math.max(280, heat.brands.length * 40)}
            />
          </CardContent>
        </Card>
      )}

      {/* 4. 채널그룹별 할인율/수수료율 + 전월 변화 */}
      <Card>
        <CardHeader>
          <CardTitle>채널그룹별 할인율 / 수수료율</CardTitle>
          <div className="text-[11px] text-muted-foreground">전월 대비 할인율 변화 포함</div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="px-4 pb-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-muted-foreground border-b">
                  <th className="py-2">채널그룹</th>
                  <th className="py-2 text-right">실매출</th>
                  <th className="py-2 text-right">할인율</th>
                  <th className="py-2 text-right">전월 할인율</th>
                  <th className="py-2 text-right">차이</th>
                  <th className="py-2 text-right">수수료율</th>
                  <th className="py-2 text-right">정산매출</th>
                </tr>
              </thead>
              <tbody>
                {df.map((g) => {
                  const prevDisc = prevDiscountMap.get(g.group) ?? 0;
                  const discDiff = g.discountRate - prevDisc;
                  const cls =
                    discDiff > 0.005
                      ? "text-rose-700"
                      : discDiff < -0.005
                        ? "text-emerald-700"
                        : "text-muted-foreground";
                  return (
                    <tr key={g.group} className="border-b last:border-0">
                      <td className="py-2 font-medium">{g.group}</td>
                      <td className="py-2 text-right tabular-nums">{formatKRWLong(g.revenue)}</td>
                      <td className="py-2 text-right tabular-nums">
                        {formatPctAbs(g.discountRate, 1)}
                      </td>
                      <td className="py-2 text-right tabular-nums text-muted-foreground">
                        {formatPctAbs(prevDisc, 1)}
                      </td>
                      <td className={`py-2 text-right tabular-nums ${cls}`}>
                        {discDiff > 0 ? "+" : ""}
                        {(discDiff * 100).toFixed(2)}%p
                      </td>
                      <td className="py-2 text-right tabular-nums">{formatPctAbs(g.feeRate, 1)}</td>
                      <td className="py-2 text-right tabular-nums">{formatKRWLong(g.settlement)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* 5. 신제품 효과 + 6. 이탈 위험 SKU */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>신제품 효과 (직전 13개월 무매출 → 이번달)</CardTitle>
              <Badge variant="info">{np.length}개 SKU</Badge>
            </div>
            <div className="text-[11px] text-muted-foreground">
              신제품 합산 매출: <span className="font-semibold">{formatKRWLong(newProductTotal)}</span>
              {curTotal > 0 && (
                <> (전체의 {formatPctAbs(newProductTotal / curTotal, 1)})</>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="px-4 pb-4 overflow-x-auto">
              {np.length === 0 ? (
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
                    {np.map((p) => (
                      <tr key={p.name} className="border-b last:border-0">
                        <td className="py-2 max-w-[280px] truncate">
                          <span className="text-muted-foreground text-xs mr-1">[{p.brand}]</span>
                          {p.name}
                        </td>
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
              <CardTitle>이탈 위험 SKU (직전 3개월 평균 대비 -50% 이상)</CardTitle>
              <Badge variant="negative">{dec.length}개</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="px-4 pb-4 overflow-x-auto">
              {dec.length === 0 ? (
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
                    {dec.map((p) => (
                      <tr key={p.name} className="border-b last:border-0">
                        <td className="py-2 max-w-[240px] truncate">
                          <span className="text-muted-foreground text-xs mr-1">[{p.brand}]</span>
                          {p.name}
                        </td>
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

      {/* 7. 요일별 매출 패턴 */}
      <Card>
        <CardHeader>
          <CardTitle>요일별 매출 패턴 (이번달 vs 직전 3개월 평균)</CardTitle>
        </CardHeader>
        <CardContent>
          <BarChart
            categories={weekday.map((w) => `${w.day}요일`)}
            series={[
              { name: "이번달", values: weekday.map((w) => w.current), color: "#0f172a" },
              { name: "직전 3개월 평균", values: weekday.map((w) => w.pastAvg), color: "#cbd5e1" },
            ]}
            height={240}
            yLabel="실매출"
          />
        </CardContent>
      </Card>

      {/* 8. 이상치 거래 */}
      {bigDeals.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>이상치 거래 (단일 1억원 이상)</CardTitle>
            <div className="text-[11px] text-muted-foreground">
              {bigDeals.length}건 — 임원 보고 시 별도 확인 권장
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="px-4 pb-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] text-muted-foreground border-b">
                    <th className="py-2">날짜</th>
                    <th className="py-2">거래처</th>
                    <th className="py-2">제품</th>
                    <th className="py-2">브랜드</th>
                    <th className="py-2 text-right">실매출</th>
                  </tr>
                </thead>
                <tbody>
                  {bigDeals.map((r, i) => (
                    <tr key={`${r.orderNo}-${i}`} className="border-b last:border-0">
                      <td className="py-2 text-muted-foreground tabular-nums">
                        {r.date.toISOString().slice(0, 10)}
                      </td>
                      <td className="py-2">{r.customer}</td>
                      <td className="py-2 max-w-[260px] truncate">{r.productName}</td>
                      <td className="py-2 text-muted-foreground">{r.brand}</td>
                      <td className="py-2 text-right tabular-nums">{formatKRWLong(r.realRevenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
