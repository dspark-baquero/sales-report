import { loadSalesRows, loadFactCube } from "@/lib/load";
import { resolveMonth } from "@/lib/months";
import { computeChangesInsights } from "@/lib/tabInsights";
import { TabInsights } from "@/components/TabInsights";
import { YearToDateChart } from "@/components/YearToDateChart";
import { ytdByDim, type YTDDim } from "@/lib/ytd";
import {
  filterMonth,
  filterRange,
  ymMinusMonths,
  enumerateMonths,
} from "@/lib/aggregate";
import {
  prevMonth,
  prevYearSameMonth,
} from "@/lib/compare";
import {
  attributeChange,
  newAndLostEntities,
  topGainers,
  topDecliners,
} from "@/lib/changeAttribution";
import { COMPARE_LABEL } from "@/lib/labels";
import { ChangeBreakdown } from "@/components/ChangeBreakdown";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart } from "@/components/charts/BarChart";
import { DimSelect } from "./DimSelect";
import {
  formatKRWLong,
  formatInt,
  formatYM,
  formatPct,
  formatPctAbs,
  buildChange,
} from "@/lib/format";
import type { SalesRow } from "@/lib/load";

type SearchParams = Promise<{ month?: string; dim?: string }>;

const KEY_FN: Record<string, (r: SalesRow) => string | null> = {
  customer: (r) => r.customer || null,
  channel: (r) => r.channel || null,
  channelGroup: (r) => r.channelGroup || null,
  category: (r) => r.category || null,
  brand: (r) => r.brand || null,
  product: (r) => r.productName || null,
  country: (r) => (r.category === "수출" ? r.country : null),
  dealer: (r) => (r.category === "B2B" ? r.dealer || null : null),
};

const DIM_LABEL: Record<string, string> = {
  customer: "거래처",
  channel: "채널",
  channelGroup: "채널그룹",
  category: "카테고리",
  brand: "브랜드",
  product: "제품",
  country: "국가",
  dealer: "영업사원",
};

export default async function ChangesPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const ym = resolveMonth(sp.month);
  const dim = sp.dim && KEY_FN[sp.dim] ? sp.dim : "customer";
  const all = loadSalesRows();
  const cube = loadFactCube();
  const insights = computeChangesInsights(cube, ym);

  const cur = filterMonth(all, ym);
  const prevMo = filterMonth(all, prevMonth(ym));
  const prevYr = filterMonth(all, prevYearSameMonth(ym));

  const curTotal = cur.filter((r) => !r.isNonRevenue).reduce((s, r) => s + r.realRevenue, 0);
  const prevTotal = prevMo.filter((r) => !r.isNonRevenue).reduce((s, r) => s + r.realRevenue, 0);
  const prevYrTotal = prevYr.filter((r) => !r.isNonRevenue).reduce((s, r) => s + r.realRevenue, 0);

  // 변화 요인 (선택 차원)
  const contribsMo = attributeChange(cur, prevMo, KEY_FN[dim]);
  const contribsYr = attributeChange(cur, prevYr, KEY_FN[dim]);

  // 신규/이탈 거래처 (3개월 윈도우)
  const past3 = filterRange(all, ymMinusMonths(ym, 3), prevMonth(ym));
  const { newOnes: newCustomers, lost: lostCustomers } = newAndLostEntities(
    cur,
    past3,
    (r) => r.customer || null,
  );

  // 신제품 효과 (직전 13개월 무매출 → 이번달)
  const past13 = filterRange(all, ymMinusMonths(ym, 13), prevMonth(ym));
  const { newOnes: newProducts } = newAndLostEntities(
    cur,
    past13,
    (r) => r.productName || null,
  );
  const newProductImpact = newProducts.reduce((s, p) => s + p.current, 0);

  // 이탈 SKU (직전 3개월 평균 대비 -50%+)
  const past3Map = new Map<string, number>();
  for (const r of past3) {
    if (r.isNonRevenue || !r.productName) continue;
    past3Map.set(r.productName, (past3Map.get(r.productName) ?? 0) + r.realRevenue);
  }
  const curSkuMap = new Map<string, number>();
  for (const r of cur) {
    if (r.isNonRevenue || !r.productName) continue;
    curSkuMap.set(r.productName, (curSkuMap.get(r.productName) ?? 0) + r.realRevenue);
  }
  const decliningSkus = (() => {
    const out: { productName: string; prevAvg: number; current: number; pct: number }[] = [];
    for (const [name, total] of past3Map) {
      const avg = total / 3;
      if (avg < 100_000) continue;
      const cur = curSkuMap.get(name) ?? 0;
      const pct = avg > 0 ? (cur - avg) / avg : 0;
      if (pct <= -0.5) {
        out.push({ productName: name, prevAvg: avg, current: cur, pct });
      }
    }
    return out.sort((a, b) => a.pct - b.pct).slice(0, 20);
  })();

  // 가격/할인 변화: 채널그룹별 평균 할인율 변화
  const discountByGroup = (rows: SalesRow[]) => {
    const m = new Map<string, { discount: number; orderAmount: number }>();
    for (const r of rows) {
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
  };
  const discCur = discountByGroup(cur);
  const discPrev = discountByGroup(prevMo);
  const discChange = [...discCur.entries()].map(([g, cur]) => ({
    group: g,
    cur,
    prev: discPrev.get(g) ?? 0,
    diff: cur - (discPrev.get(g) ?? 0),
  })).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

  // 이상치 거래 (단일 거래 1억 이상)
  const bigDeals = cur
    .filter((r) => !r.isNonRevenue && r.realRevenue >= 100_000_000)
    .sort((a, b) => b.realRevenue - a.realRevenue)
    .slice(0, 20);

  // 요일별 (이번 달 vs 직전 3개월 평균)
  const weekdayCur = (rows: SalesRow[]) => {
    const m = new Array(7).fill(0);
    let count = 0;
    for (const r of rows) {
      if (r.isNonRevenue) continue;
      const d = new Date(r.date);
      m[d.getUTCDay()] += r.realRevenue;
    }
    count = new Set(rows.map((r) => r.yearMonth)).size || 1;
    return m.map((v) => v / count);
  };
  const weekdayThis = weekdayCur(cur);
  const weekdayPast = weekdayCur(past3);
  const dayLabels = ["일", "월", "화", "수", "목", "금", "토"];

  // 변화 요인 합계 (신규/이탈 분류)
  const newCount = contribsMo.filter((c) => c.type === "신규").length;
  const lostCount = contribsMo.filter((c) => c.type === "이탈").length;

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{formatYM(ym)} 변동 분석</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            이번달 {formatKRWLong(curTotal)} · 전월 {formatKRWLong(prevTotal)} (
            {formatPct((curTotal - prevTotal) / Math.max(1, Math.abs(prevTotal)))}) · 전년 동월{" "}
            {formatKRWLong(prevYrTotal)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">분해 차원</span>
          <DimSelect current={dim} />
        </div>
      </div>

      <TabInsights bullets={insights} />

      <YearToDateChart
        ym={ym}
        series={ytdByDim(cube, ym, dim as YTDDim, 5)}
        caption={`${DIM_LABEL[dim]} Top 5 + 기타`}
      />

      {/* 이번달 vs 전월 워터폴 */}
      <ChangeBreakdown
        title={`전월 대비 ${DIM_LABEL[dim]} 변화 요인`}
        prevTotal={prevTotal}
        curTotal={curTotal}
        contribs={contribsMo}
        topN={5}
        prevLabel={COMPARE_LABEL.prevMonth}
        hint={`상단 셀렉터로 차원 변경 가능 (현재: ${DIM_LABEL[dim]})`}
      />

      {/* 이번달 vs 전년 동월 워터폴 */}
      <ChangeBreakdown
        title={`전년 동월 대비 ${DIM_LABEL[dim]} 변화 요인`}
        prevTotal={prevYrTotal}
        curTotal={curTotal}
        contribs={contribsYr}
        topN={5}
        prevLabel={COMPARE_LABEL.prevYear}
        hint="장기적 성장/침체 분석"
      />

      {/* 신규/이탈 거래처 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>신규 거래처 (직전 3개월 무거래)</CardTitle>
              <Badge variant="info">{newCustomers.length}곳</Badge>
            </div>
            <div className="text-[11px] text-muted-foreground">
              이번달 매출 발생 + 직전 3개월 매출 0
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="px-4 pb-4 overflow-x-auto">
              {newCustomers.length === 0 ? (
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
                    {newCustomers.slice(0, 20).map((c) => (
                      <tr key={c.entity} className="border-b last:border-0">
                        <td className="py-2">{c.entity}</td>
                        <td className="py-2 text-right tabular-nums">{formatKRWLong(c.current)}</td>
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
              <CardTitle>이탈 거래처 (직전 3개월 거래 → 이번달 0)</CardTitle>
              <Badge variant="negative">{lostCustomers.length}곳</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="px-4 pb-4 overflow-x-auto">
              {lostCustomers.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4">해당 없음</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] text-muted-foreground border-b">
                      <th className="py-2">거래처</th>
                      <th className="py-2 text-right">3개월 합계</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lostCustomers.slice(0, 20).map((c) => (
                      <tr key={c.entity} className="border-b last:border-0">
                        <td className="py-2">{c.entity}</td>
                        <td className="py-2 text-right tabular-nums">{formatKRWLong(c.pastTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 신제품 효과 + 이탈 SKU */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>신제품 효과 (직전 13개월 무매출 → 이번달)</CardTitle>
              <Badge variant="info">{newProducts.length}개 SKU</Badge>
            </div>
            <div className="text-[11px] text-muted-foreground">
              신제품 합산 매출: <span className="font-semibold">{formatKRWLong(newProductImpact)}</span> (전체의{" "}
              {curTotal > 0 ? formatPctAbs(newProductImpact / curTotal, 1) : "—"})
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="px-4 pb-4 overflow-x-auto">
              {newProducts.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4">해당 없음</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] text-muted-foreground border-b">
                      <th className="py-2">제품</th>
                      <th className="py-2 text-right">이번달 매출</th>
                    </tr>
                  </thead>
                  <tbody>
                    {newProducts.slice(0, 15).map((p) => (
                      <tr key={p.entity} className="border-b last:border-0">
                        <td className="py-2 max-w-[280px] truncate">{p.entity}</td>
                        <td className="py-2 text-right tabular-nums">{formatKRWLong(p.current)}</td>
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
              <CardTitle>이탈 SKU (직전 3개월 평균 대비 -50% 이상)</CardTitle>
              <Badge variant="negative">{decliningSkus.length}개</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="px-4 pb-4 overflow-x-auto">
              {decliningSkus.length === 0 ? (
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
                    {decliningSkus.map((p) => (
                      <tr key={p.productName} className="border-b last:border-0">
                        <td className="py-2 max-w-[200px] truncate">{p.productName}</td>
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

      {/* 할인율 변화 */}
      <Card>
        <CardHeader>
          <CardTitle>채널그룹별 할인율 변화</CardTitle>
          <div className="text-[11px] text-muted-foreground">전월 대비 평균 할인율 — 인상/인하 추세</div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="px-4 pb-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-muted-foreground border-b">
                  <th className="py-2">채널그룹</th>
                  <th className="py-2 text-right">전월 할인율</th>
                  <th className="py-2 text-right">이번달 할인율</th>
                  <th className="py-2 text-right">차이</th>
                </tr>
              </thead>
              <tbody>
                {discChange.map((d) => {
                  const cls =
                    d.diff > 0.005
                      ? "text-rose-700"
                      : d.diff < -0.005
                        ? "text-emerald-700"
                        : "text-muted-foreground";
                  return (
                    <tr key={d.group} className="border-b last:border-0">
                      <td className="py-2 font-medium">{d.group}</td>
                      <td className="py-2 text-right tabular-nums text-muted-foreground">
                        {formatPctAbs(d.prev, 1)}
                      </td>
                      <td className="py-2 text-right tabular-nums">{formatPctAbs(d.cur, 1)}</td>
                      <td className={`py-2 text-right tabular-nums ${cls}`}>
                        {d.diff > 0 ? "+" : ""}
                        {(d.diff * 100).toFixed(2)}%p
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* 요일별 패턴 비교 */}
      <Card>
        <CardHeader>
          <CardTitle>요일별 매출 패턴 (이번달 vs 직전 3개월 평균)</CardTitle>
        </CardHeader>
        <CardContent>
          <BarChart
            categories={dayLabels.map((d) => `${d}요일`)}
            series={[
              { name: "이번달", values: weekdayThis, color: "#0f172a" },
              { name: "직전 3개월 평균", values: weekdayPast, color: "#cbd5e1" },
            ]}
            height={240}
            yLabel="실매출"
          />
        </CardContent>
      </Card>

      {/* 이상치 거래 */}
      {bigDeals.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>이상치 거래 (단일 1억원 이상)</CardTitle>
            <div className="text-[11px] text-muted-foreground">{bigDeals.length}건 — 임원 보고 시 별도 확인 권장</div>
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
