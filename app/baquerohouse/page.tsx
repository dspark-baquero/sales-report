import { loadFactCube, loadMonthRows, loadRangeRows } from "@/lib/load";
import { resolveMonth } from "@/lib/months";
import { kpi, ymMinusMonths, monthlyRevenueOf } from "@/lib/aggregate";
import { computeBaqueroHouseInsights } from "@/lib/tabInsights";
import { TabInsights } from "@/components/TabInsights";
import { YearToDateChart } from "@/components/YearToDateChart";
import { type YTDSeries, ytdMonths, buildYTDAchievement } from "@/lib/ytd";
import {
  prevMonth,
  prevYearSameMonth,
  quarterOf,
  prevQuarter,
  quarterProgress,
} from "@/lib/compare";
import { baqueroHouseRows } from "@/lib/dimensions";
import { attributeChange } from "@/lib/changeAttribution";
import { loadTargets, targetsForMonthWithProspective } from "@/lib/targets";
import { COMPARE_LABEL } from "@/lib/labels";
import { MetricCard } from "@/components/MetricCard";
import { ChangeBreakdown } from "@/components/ChangeBreakdown";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart } from "@/components/charts/BarChart";
import { revenueRows } from "@/lib/aggregate";
import Link from "next/link";
import {
  formatKRWLong,
  formatKRWShort,
  formatInt,
  formatYM,
  formatPctAbs,
  buildChange,
  buildAchievement,
} from "@/lib/format";
import {
  loadBHPartnerMap,
  loadBHSales,
  isBHDataAvailable,
  type BHPartnerSale,
} from "@/lib/baquerohouse-data";

type SearchParams = Promise<{ month?: string }>;

export default async function BaqueroHousePage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const ym = await resolveMonth(sp.month);
  const prevYM = prevMonth(ym);

  const [cube, targets, bhAvailable] = await Promise.all([
    loadFactCube(),
    loadTargets(),
    isBHDataAvailable(),
  ]);

  const [partnerMap, bhSalesCur, bhSalesPrev] = bhAvailable
    ? await Promise.all([loadBHPartnerMap(), loadBHSales(ym), loadBHSales(prevYM)])
    : [new Map(), [] as BHPartnerSale[], [] as BHPartnerSale[]];

  const insights = computeBaqueroHouseInsights(cube, ym, bhAvailable ? bhSalesCur : undefined);

  const { qStart } = quarterOf(ym);
  const prevQ = prevQuarter(ym);
  const qProg = quarterProgress(ym);

  const [cur, prevMo, prevYr, curQ, prevQRows] = await Promise.all([
    loadMonthRows(ym),
    loadMonthRows(prevYM),
    loadMonthRows(prevYearSameMonth(ym)),
    loadRangeRows(qStart, ym),
    loadRangeRows(prevQ.qStart, prevQ.qEnd),
  ]);

  const bhCur = baqueroHouseRows(cur);
  const bhPrevMo = baqueroHouseRows(prevMo);
  const bhPrevYr = baqueroHouseRows(prevYr);

  const k = kpi(bhCur);
  const kPrevMo = kpi(bhPrevMo);
  const kPrevYr = kpi(bhPrevYr);
  const kCurQ = kpi(baqueroHouseRows(curQ));
  const kPrevQ = kpi(baqueroHouseRows(prevQRows));

  // 바크로하우스 목표
  const ta = targetsForMonthWithProspective(targets, ym);
  const bhTarget = ta
    .filter((t) => t.division === "국내" && t.customerKey === "바크로하우스")
    .reduce((s, t) => s + t.target, 0);

  // 12개월 추이
  const fromYM = ymMinusMonths(ym, 11);
  const trendRows = await loadRangeRows(fromYM, ym);
  const monthly = monthlyRevenueOf(trendRows, fromYM, ym, (r) => r.channel === "바크로하우스");

  // 파트너 샵(거래처)별 실적 + 담당 영업사원
  const shopMap = new Map<string, { revenue: number; qty: number; dealer: string }>();
  for (const r of revenueRows(bhCur)) {
    const c = shopMap.get(r.customer) ?? { revenue: 0, qty: 0, dealer: r.dealer };
    c.revenue += r.realRevenue;
    c.qty += r.qty;
    if (r.dealer && r.dealer !== "미지정") c.dealer = r.dealer;
    shopMap.set(r.customer, c);
  }
  const shops = [...shopMap.entries()]
    .map(([customer, v]) => ({ customer, ...v }))
    .sort((a, b) => b.revenue - a.revenue);

  const shopPrevMap = new Map<string, number>();
  for (const r of revenueRows(bhPrevMo)) {
    shopPrevMap.set(r.customer, (shopPrevMap.get(r.customer) ?? 0) + r.realRevenue);
  }

  // 영업사원별 집계
  const dealerMap = new Map<string, { revenue: number; shops: Set<string> }>();
  for (const r of revenueRows(bhCur)) {
    const d = dealerMap.get(r.dealer) ?? { revenue: 0, shops: new Set() };
    d.revenue += r.realRevenue;
    d.shops.add(r.customer);
    dealerMap.set(r.dealer, d);
  }
  const dealers = [...dealerMap.entries()]
    .map(([dealer, v]) => ({ dealer, revenue: v.revenue, shops: v.shops.size }))
    .filter((d) => d.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue);

  const dealerPrevMap = new Map<string, number>();
  for (const r of revenueRows(bhPrevMo)) {
    dealerPrevMap.set(r.dealer, (dealerPrevMap.get(r.dealer) ?? 0) + r.realRevenue);
  }

  // 브랜드 분해
  const brandMap = new Map<string, number>();
  for (const r of revenueRows(bhCur)) {
    brandMap.set(r.brand, (brandMap.get(r.brand) ?? 0) + r.realRevenue);
  }
  const brands = [...brandMap.entries()]
    .map(([brand, revenue]) => ({ brand, revenue }))
    .sort((a, b) => b.revenue - a.revenue);

  // 변화 요인 — 파트너 샵 단위
  const shopContribs = attributeChange(bhCur, bhPrevMo, (r) => r.customer || null);

  // YTD 시리즈
  const months = ytdMonths(ym);
  const ytdSeries: YTDSeries[] = [{
    name: "바크로하우스",
    color: "#e11d48",
    values: months.map((m) => cube.byMonthChannel.get(m)?.get("바크로하우스")?.revenue ?? 0),
  }];

  // YTD 달성
  const ytdAch = buildYTDAchievement(trendRows, targets, ym, {
    rowFilter: (r) => r.channel === "바크로하우스",
    targetFilter: (t) => t.division === "국내" && t.customerKey === "바크로하우스",
  });

  // ── 파트너 추천 매출 집계 ──
  const partnerRefRevenue = bhSalesCur.reduce((s, r) => s + r.paymentAmount, 0);
  const partnerRefRevenuePrev = bhSalesPrev.reduce((s, r) => s + r.paymentAmount, 0);
  const totalCommission = bhSalesCur.reduce((s, r) => s + r.estimatedCommission, 0);
  const paidCount = bhSalesCur.filter((r) => r.commissionPaid).length;
  const totalSaleCount = bhSalesCur.length;

  // 파트너별 추천 실적
  const refByPartner = new Map<string, { revenue: number; commission: number; qty: number; paid: number; total: number }>();
  for (const s of bhSalesCur) {
    if (!s.partnerName) continue;
    const c = refByPartner.get(s.partnerName) ?? { revenue: 0, commission: 0, qty: 0, paid: 0, total: 0 };
    c.revenue += s.paymentAmount;
    c.commission += s.estimatedCommission;
    c.qty += s.quantity;
    c.total++;
    if (s.commissionPaid) c.paid++;
    refByPartner.set(s.partnerName, c);
  }
  const partnerRefList = [...refByPartner.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.revenue - a.revenue);

  // 등급별 분석
  const gradeMap = new Map<string, { count: number; revenue: number }>();
  for (const pr of partnerRefList) {
    const partner = partnerMap.get(pr.name);
    const grade = partner?.grade || "미분류";
    const g = gradeMap.get(grade) ?? { count: 0, revenue: 0 };
    g.count++;
    g.revenue += pr.revenue;
    gradeMap.set(grade, g);
  }
  const gradeList = [...gradeMap.entries()]
    .map(([grade, v]) => ({ grade, ...v }))
    .sort((a, b) => b.revenue - a.revenue);

  // 대리점 경유 현황
  const agencyMap = new Map<string, { partners: Set<string>; commission: number }>();
  for (const s of bhSalesCur) {
    if (!s.agency) continue;
    const a = agencyMap.get(s.agency) ?? { partners: new Set(), commission: 0 };
    if (s.partnerName) a.partners.add(s.partnerName);
    a.commission += s.agencyCommission;
    agencyMap.set(s.agency, a);
  }
  const agencyList = [...agencyMap.entries()]
    .map(([agency, v]) => ({ agency, partners: v.partners.size, commission: v.commission }))
    .sort((a, b) => b.commission - a.commission);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">{formatYM(ym)} 바크로하우스</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          {shops.length}곳 파트너 샵 · 이번달 {formatInt(k.qty)}개 출고
          {bhAvailable && partnerRefList.length > 0 && (
            <> · 파트너 추천 {partnerRefList.length}곳</>
          )}
        </p>
      </div>

      <TabInsights bullets={insights} />

      <YearToDateChart
        ym={ym}
        series={ytdSeries}
        caption="바크로하우스 월별 매출"
        achievement={ytdAch}
        achievementLabel="바크로하우스"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="바크로하우스 실매출"
          current={k.revenue}
          comparisons={[
            { label: COMPARE_LABEL.prevMonth, prev: kPrevMo.revenue },
            { label: COMPARE_LABEL.curQuarter, prev: kPrevQ.revenue, note: `${qProg}/3개월` },
            { label: COMPARE_LABEL.prevYear, prev: kPrevYr.revenue },
          ]}
          target={bhTarget > 0 ? { value: bhTarget, label: "이번달 목표" } : undefined}
          highlight
        />
        <MetricCard
          label="활성 파트너 샵"
          current={shops.length}
          comparisons={[{ label: COMPARE_LABEL.prevMonth, prev: shopPrevMap.size }]}
          unit="qty"
          unitSuffix="곳"
        />
        <MetricCard
          label="샵당 평균 매출"
          current={shops.length > 0 ? k.revenue / shops.length : 0}
          comparisons={[{
            label: COMPARE_LABEL.prevMonth,
            prev: shopPrevMap.size > 0 ? kPrevMo.revenue / shopPrevMap.size : 0,
          }]}
        />
        <MetricCard
          label="총 판매수량"
          current={k.qty}
          comparisons={[
            { label: COMPARE_LABEL.prevMonth, prev: kPrevMo.qty },
            { label: COMPARE_LABEL.prevYear, prev: kPrevYr.qty },
          ]}
          unit="qty"
        />
      </div>

      {bhAvailable && partnerRefRevenue > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>파트너 추천 매출 현황</CardTitle>
            <div className="text-[11px] text-muted-foreground">
              파트너 추천 링크를 통한 매출 (전체 바크로하우스 매출의 일부)
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-[11px] text-muted-foreground">파트너 추천 매출</div>
                <div className="text-lg font-semibold tabular-nums">{formatKRWLong(partnerRefRevenue)}</div>
                {partnerRefRevenuePrev > 0 && (
                  <div className="text-[11px] text-muted-foreground">
                    전월 {formatKRWShort(partnerRefRevenuePrev)}
                  </div>
                )}
              </div>
              <div>
                <div className="text-[11px] text-muted-foreground">추천 매출 비율</div>
                <div className="text-lg font-semibold tabular-nums">
                  {k.revenue > 0 ? formatPctAbs(partnerRefRevenue / k.revenue) : "—"}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  전체 매출 대비
                </div>
              </div>
              <div>
                <div className="text-[11px] text-muted-foreground">예상 커미션 총액</div>
                <div className="text-lg font-semibold tabular-nums">{formatKRWLong(totalCommission)}</div>
                <div className="text-[11px] text-muted-foreground">
                  {totalSaleCount}건 주문
                </div>
              </div>
              <div>
                <div className="text-[11px] text-muted-foreground">커미션 지급률</div>
                <div className="text-lg font-semibold tabular-nums">
                  {totalSaleCount > 0 ? formatPctAbs(paidCount / totalSaleCount) : "—"}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {paidCount}건 지급 / {totalSaleCount - paidCount}건 미지급
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <ChangeBreakdown
        title="전월 대비 파트너 샵 변화 요인"
        prevTotal={kPrevMo.revenue}
        curTotal={k.revenue}
        contribs={shopContribs}
        topN={5}
        prevLabel={COMPARE_LABEL.prevMonth}
        hint="파트너 샵(거래처) 단위 분해"
      />

      <Card>
        <CardHeader>
          <CardTitle>파트너 샵별 실적</CardTitle>
          <div className="text-[11px] text-muted-foreground">
            거래처 · 담당 영업사원 · 이번달/전월 실매출 비교
            {bhAvailable && " · 등급(파트너 리스트 매칭)"}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="px-4 pb-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-muted-foreground border-b">
                  <th className="py-2">파트너 샵</th>
                  {bhAvailable && <th className="py-2">등급</th>}
                  <th className="py-2">담당자</th>
                  <th className="py-2 text-right">이번달</th>
                  <th className="py-2 text-right">전월</th>
                  <th className="py-2 text-right">변화</th>
                  <th className="py-2 text-right">수량</th>
                </tr>
              </thead>
              <tbody>
                {shops.map((s) => {
                  const prevRev = shopPrevMap.get(s.customer) ?? 0;
                  const ch = buildChange(s.revenue, prevRev, "전월");
                  const cls =
                    ch.direction === "up" || ch.direction === "new"
                      ? "text-emerald-700"
                      : ch.direction === "down" || ch.direction === "lost"
                        ? "text-rose-700"
                        : "text-muted-foreground";
                  const partner = partnerMap.get(s.customer);
                  return (
                    <tr key={s.customer} className="border-b last:border-0">
                      <td className="py-2 font-medium">
                        <Link
                          href={`/accounts?customer=${encodeURIComponent(s.customer)}&month=${ym}`}
                          className="hover:underline"
                        >
                          {s.customer}
                        </Link>
                      </td>
                      {bhAvailable && (
                        <td className="py-2">
                          {partner ? (
                            <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded bg-muted">
                              {partner.grade || "—"}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-[10px]">—</span>
                          )}
                        </td>
                      )}
                      <td className="py-2 text-muted-foreground">{s.dealer}</td>
                      <td className="py-2 text-right tabular-nums">{formatKRWLong(s.revenue)}</td>
                      <td className="py-2 text-right tabular-nums text-muted-foreground">
                        {prevRev > 0 ? formatKRWLong(prevRev) : "—"}
                      </td>
                      <td className={`py-2 text-right tabular-nums ${cls}`}>
                        <div>{ch.diffText}</div>
                        <div className="text-[10px]">{ch.pctText}</div>
                      </td>
                      <td className="py-2 text-right tabular-nums">{formatInt(s.qty)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {bhAvailable && partnerRefList.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>파트너별 추천 실적</CardTitle>
            <div className="text-[11px] text-muted-foreground">
              파트너 추천 링크 경유 매출 · 예상 커미션 · 지급 상태
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="px-4 pb-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] text-muted-foreground border-b">
                    <th className="py-2">파트너</th>
                    <th className="py-2">등급</th>
                    <th className="py-2 text-right">커미션 비율</th>
                    <th className="py-2 text-right">추천 매출</th>
                    <th className="py-2 text-right">예상 커미션</th>
                    <th className="py-2 text-right">주문 건수</th>
                    <th className="py-2 text-right">지급 상태</th>
                  </tr>
                </thead>
                <tbody>
                  {partnerRefList.map((pr) => {
                    const partner = partnerMap.get(pr.name);
                    return (
                      <tr key={pr.name} className="border-b last:border-0">
                        <td className="py-2 font-medium">{pr.name}</td>
                        <td className="py-2">
                          {partner?.grade ? (
                            <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded bg-muted">
                              {partner.grade}
                            </span>
                          ) : "—"}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {partner?.commissionRate ? `${partner.commissionRate}%` : "—"}
                        </td>
                        <td className="py-2 text-right tabular-nums">{formatKRWLong(pr.revenue)}</td>
                        <td className="py-2 text-right tabular-nums">{formatKRWLong(pr.commission)}</td>
                        <td className="py-2 text-right tabular-nums">{formatInt(pr.total)}건</td>
                        <td className="py-2 text-right">
                          {pr.paid === pr.total ? (
                            <span className="text-emerald-700 text-[11px]">전액 지급</span>
                          ) : pr.paid === 0 ? (
                            <span className="text-rose-700 text-[11px]">미지급</span>
                          ) : (
                            <span className="text-amber-700 text-[11px]">
                              {pr.paid}/{pr.total}건 지급
                            </span>
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
      )}

      {bhAvailable && gradeList.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>등급별 분석</CardTitle>
            <div className="text-[11px] text-muted-foreground">
              파트너 등급별 추천 매출 분포
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <BarChart
                categories={gradeList.map((g) => g.grade)}
                series={[{ name: "추천 매출", values: gradeList.map((g) => g.revenue), color: "#e11d48" }]}
                height={200}
                horizontal
                yLabel="추천 매출"
              />
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] text-muted-foreground border-b">
                      <th className="py-2">등급</th>
                      <th className="py-2 text-right">파트너 수</th>
                      <th className="py-2 text-right">추천 매출</th>
                      <th className="py-2 text-right">평균 매출</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gradeList.map((g) => (
                      <tr key={g.grade} className="border-b last:border-0">
                        <td className="py-2 font-medium">{g.grade}</td>
                        <td className="py-2 text-right tabular-nums">{g.count}곳</td>
                        <td className="py-2 text-right tabular-nums">{formatKRWLong(g.revenue)}</td>
                        <td className="py-2 text-right tabular-nums">
                          {g.count > 0 ? formatKRWLong(g.revenue / g.count) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {bhAvailable && agencyList.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>대리점 경유 현황</CardTitle>
            <div className="text-[11px] text-muted-foreground">
              대리점을 통해 연결된 파트너의 매출 및 대리점 커미션
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="px-4 pb-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] text-muted-foreground border-b">
                    <th className="py-2">대리점</th>
                    <th className="py-2 text-right">연결 파트너</th>
                    <th className="py-2 text-right">대리점 커미션</th>
                  </tr>
                </thead>
                <tbody>
                  {agencyList.map((a) => (
                    <tr key={a.agency} className="border-b last:border-0">
                      <td className="py-2 font-medium">{a.agency}</td>
                      <td className="py-2 text-right tabular-nums">{a.partners}곳</td>
                      <td className="py-2 text-right tabular-nums">{formatKRWLong(a.commission)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {dealers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>영업사원별 실적</CardTitle>
            <div className="text-[11px] text-muted-foreground">
              파트너 샵 담당 영업사원 기준 집계
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="px-4 pb-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] text-muted-foreground border-b">
                    <th className="py-2">영업사원</th>
                    <th className="py-2 text-right">이번달</th>
                    <th className="py-2 text-right">전월</th>
                    <th className="py-2 text-right">변화</th>
                    <th className="py-2 text-right">담당 샵</th>
                  </tr>
                </thead>
                <tbody>
                  {dealers.map((d) => {
                    const prevRev = dealerPrevMap.get(d.dealer) ?? 0;
                    const ch = buildChange(d.revenue, prevRev, "전월");
                    const cls =
                      ch.direction === "up" || ch.direction === "new"
                        ? "text-emerald-700"
                        : ch.direction === "down" || ch.direction === "lost"
                          ? "text-rose-700"
                          : "text-muted-foreground";
                    return (
                      <tr key={d.dealer} className="border-b last:border-0">
                        <td className="py-2 font-medium">{d.dealer}</td>
                        <td className="py-2 text-right tabular-nums">{formatKRWLong(d.revenue)}</td>
                        <td className="py-2 text-right tabular-nums text-muted-foreground">
                          {prevRev > 0 ? formatKRWLong(prevRev) : "—"}
                        </td>
                        <td className={`py-2 text-right tabular-nums ${cls}`}>
                          <div>{ch.diffText}</div>
                          <div className="text-[10px]">{ch.pctText}</div>
                        </td>
                        <td className="py-2 text-right tabular-nums">{formatInt(d.shops)}곳</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>최근 12개월 매출 추이</CardTitle>
        </CardHeader>
        <CardContent>
          <BarChart
            categories={monthly.map((m) =>
              formatYM(m.yearMonth).replace("년 ", "/").replace("월", ""),
            )}
            series={[
              { name: "바크로하우스", values: monthly.map((m) => m.revenue), color: "#e11d48" },
            ]}
            height={280}
            yLabel="실매출"
          />
        </CardContent>
      </Card>

      {brands.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>브랜드별 매출</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart
              categories={brands.map((b) => b.brand)}
              series={[
                { name: "실매출", values: brands.map((b) => b.revenue), color: "#e11d48" },
              ]}
              height={240}
              horizontal
              yLabel="실매출"
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
