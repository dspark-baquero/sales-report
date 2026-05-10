import { loadSalesRows, loadFactCube } from "@/lib/load";
import { resolveMonth } from "@/lib/months";
import { computeB2CInsights } from "@/lib/tabInsights";
import { TabInsights } from "@/components/TabInsights";
import {
  kpi,
  filterMonth,
  filterRange,
  ymMinusMonths,
  topNProductsWithPrev,
} from "@/lib/aggregate";
import {
  prevMonth,
  prevYearSameMonth,
  quarterOf,
  prevQuarter,
  quarterProgress,
} from "@/lib/compare";
import {
  b2cRows,
  b2cBrandRevenue,
  brandChannelGroupBreakdown,
  brandOfficialTrend,
  generalMallChannels,
} from "@/lib/dimensions";
import { attributeChange } from "@/lib/changeAttribution";
import { loadTargets, targetsForMonthWithProspective } from "@/lib/targets";
import { COMPARE_LABEL, BRAND_COLOR, CHANNEL_GROUP_COLOR } from "@/lib/labels";
import { MetricCard } from "@/components/MetricCard";
import { ChangeBreakdown } from "@/components/ChangeBreakdown";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart } from "@/components/charts/BarChart";
import { LineChart } from "@/components/charts/LineChart";
import {
  formatKRWLong,
  formatInt,
  formatYM,
  formatPctAbs,
  buildChange,
  buildAchievement,
} from "@/lib/format";

type SearchParams = Promise<{ month?: string }>;

export default async function B2CPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const ym = resolveMonth(sp.month);
  const all = loadSalesRows();
  const cube = loadFactCube();
  const targets = loadTargets();
  const insights = computeB2CInsights(cube, ym);

  const cur = filterMonth(all, ym);
  const prevMo = filterMonth(all, prevMonth(ym));
  const prevYr = filterMonth(all, prevYearSameMonth(ym));
  const { qStart } = quarterOf(ym);
  const prevQ = prevQuarter(ym);
  const curQ = filterRange(all, qStart, ym);
  const prevQRows = filterRange(all, prevQ.qStart, prevQ.qEnd);
  const qProg = quarterProgress(ym);

  const k = kpi(b2cRows(cur));
  const kPrevMo = kpi(b2cRows(prevMo));
  const kPrevYr = kpi(b2cRows(prevYr));
  const kCurQ = kpi(b2cRows(curQ));
  const kPrevQ = kpi(b2cRows(prevQRows));

  // B2C 목표 합계 (공식몰+종합몰+소호몰+바크로하우스+올리브영(추진)+링커(추진))
  const ta = targetsForMonthWithProspective(targets, ym);
  const b2cKeys = ["공식몰", "종합몰", "소호몰", "바크로하우스", "올리브영", "링커"];
  const b2cTarget = ta
    .filter((t) => t.division === "국내" && b2cKeys.includes(t.customerKey))
    .reduce((s, t) => s + t.target, 0);

  // 채널 그룹별 합계
  const groupTotals = (() => {
    const out: Record<string, number> = {};
    for (const r of cur) {
      if (r.category !== "B2C") continue;
      if (r.isNonRevenue) continue;
      out[r.channelGroup] = (out[r.channelGroup] ?? 0) + r.realRevenue;
    }
    return out;
  })();
  const groupTotalsPrev = (() => {
    const out: Record<string, number> = {};
    for (const r of prevMo) {
      if (r.category !== "B2C") continue;
      if (r.isNonRevenue) continue;
      out[r.channelGroup] = (out[r.channelGroup] ?? 0) + r.realRevenue;
    }
    return out;
  })();

  // 채널그룹 → target key
  const groupToKey: Record<string, string> = {
    "자사 공식몰": "공식몰",
    종합몰: "종합몰",
    소호몰: "소호몰",
  };
  const groupTargets = new Map<string, number>();
  for (const t of ta) {
    if (t.prospective || t.division !== "국내") continue;
    if (t.customerKey === "공식몰" || t.customerKey === "종합몰" || t.customerKey === "소호몰") {
      groupTargets.set(t.customerKey, (groupTargets.get(t.customerKey) ?? 0) + t.target);
    }
  }

  // 브랜드별
  const brandRev = b2cBrandRevenue(cur);
  const brandRevPrev = new Map(b2cBrandRevenue(prevMo).map((b) => [b.brand, b.revenue]));

  // 브랜드 × 채널그룹
  const breakdown = brandChannelGroupBreakdown(cur);

  // 자사 공식몰 12개월 추이
  const fromYM = ymMinusMonths(ym, 11);
  const officialTrends = brandOfficialTrend(all, fromYM, ym);
  const trendMonths = officialTrends[0]?.months ?? [];

  // 종합몰
  const genMall = generalMallChannels(cur);
  const genMallPrev = new Map(generalMallChannels(prevMo).map((g) => [g.channel, g]));

  const groupKeys = ["자사 공식몰", "종합몰", "소호몰", "임직원/패밀리", "기타"];

  // Top 제품
  const topProducts = topNProductsWithPrev(b2cRows(cur), b2cRows(prevMo), 20);

  // 변화 요인 — 채널 단위
  const channelContribs = attributeChange(b2cRows(cur), b2cRows(prevMo), (r) => r.channel || null);
  // 변화 요인 — 브랜드 단위
  const brandContribs = attributeChange(b2cRows(cur), b2cRows(prevMo), (r) => r.brand || null);

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">
            {formatYM(ym)} B2C <span className="text-xs text-muted-foreground font-normal ml-1">(면세점 제외)</span>
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {brandRev.length}개 브랜드 · {Object.keys(groupTotals).length}개 채널그룹
          </p>
        </div>
      </div>

      <TabInsights bullets={insights} />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="B2C 실매출"
          current={k.revenue}
          comparisons={[
            { label: COMPARE_LABEL.prevMonth, prev: kPrevMo.revenue },
            { label: COMPARE_LABEL.curQuarter, prev: kPrevQ.revenue, note: `${qProg}/3개월` },
            { label: COMPARE_LABEL.prevYear, prev: kPrevYr.revenue },
          ]}
          target={{ value: b2cTarget, label: "B2C 목표 합계" }}
          highlight
        />
        <MetricCard
          label="자사 공식몰"
          current={groupTotals["자사 공식몰"] ?? 0}
          comparisons={[
            { label: COMPARE_LABEL.prevMonth, prev: groupTotalsPrev["자사 공식몰"] ?? 0 },
          ]}
          target={{ value: groupTargets.get("공식몰") ?? 0 }}
        />
        <MetricCard
          label="종합몰"
          current={groupTotals["종합몰"] ?? 0}
          comparisons={[{ label: COMPARE_LABEL.prevMonth, prev: groupTotalsPrev["종합몰"] ?? 0 }]}
          target={{ value: groupTargets.get("종합몰") ?? 0 }}
        />
        <MetricCard
          label="소호몰"
          current={groupTotals["소호몰"] ?? 0}
          comparisons={[{ label: COMPARE_LABEL.prevMonth, prev: groupTotalsPrev["소호몰"] ?? 0 }]}
          target={{ value: groupTargets.get("소호몰") ?? 0 }}
        />
      </div>

      {/* 채널그룹 변화 요인 */}
      <ChangeBreakdown
        title="전월 대비 채널 변화 요인"
        prevTotal={kPrevMo.revenue}
        curTotal={k.revenue}
        contribs={channelContribs}
        topN={5}
        prevLabel={COMPARE_LABEL.prevMonth}
        hint="개별 채널(쿠팡/W컨셉/공식몰/스마트스토어 등) 단위 분해"
      />

      {/* 채널그룹 표 (목표 + 비교) */}
      <Card>
        <CardHeader>
          <CardTitle>채널그룹별 목표 vs 실적</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="px-4 pb-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-muted-foreground border-b">
                  <th className="py-2">채널그룹</th>
                  <th className="py-2 text-right">이번달 실매출</th>
                  <th className="py-2 text-right">전월</th>
                  <th className="py-2 text-right">전월 대비</th>
                  <th className="py-2 text-right">이번달 목표</th>
                  <th className="py-2 text-right">달성률</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(groupTotals)
                  .sort((a, b) => b[1] - a[1])
                  .map(([g, v]) => {
                    const pm = groupTotalsPrev[g] ?? 0;
                    const tk = groupToKey[g];
                    const target = tk ? groupTargets.get(tk) ?? 0 : 0;
                    const ch = buildChange(v, pm, "전월");
                    const ach = buildAchievement(v, target);
                    const cls =
                      ch.direction === "up" || ch.direction === "new"
                        ? "text-emerald-700"
                        : ch.direction === "down" || ch.direction === "lost"
                          ? "text-rose-700"
                          : "text-muted-foreground";
                    const achCls =
                      ach.status === "no-target"
                        ? "text-muted-foreground"
                        : ach.status === "underperform"
                          ? "text-rose-700"
                          : ach.status === "ontrack"
                            ? "text-amber-600"
                            : "text-emerald-700";
                    return (
                      <tr key={g} className="border-b last:border-0">
                        <td className="py-2 font-medium">
                          <span
                            className="inline-block w-2 h-2 rounded-full mr-2"
                            style={{ backgroundColor: CHANNEL_GROUP_COLOR[g] ?? "#9ca3af" }}
                          />
                          {g}
                        </td>
                        <td className="py-2 text-right tabular-nums">{formatKRWLong(v)}</td>
                        <td className="py-2 text-right tabular-nums text-muted-foreground">
                          {pm > 0 ? formatKRWLong(pm) : "—"}
                        </td>
                        <td className={`py-2 text-right tabular-nums ${cls}`}>
                          <div>{ch.diffText}</div>
                          <div className="text-[10px]">{ch.pctText}</div>
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {target > 0 ? formatKRWLong(target) : "—"}
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

      {/* 브랜드 변화 요인 */}
      <ChangeBreakdown
        title="전월 대비 브랜드 변화 요인"
        prevTotal={kPrevMo.revenue}
        curTotal={k.revenue}
        contribs={brandContribs}
        topN={6}
        prevLabel={COMPARE_LABEL.prevMonth}
        hint="브랜드 단위 분해 — 어느 브랜드가 B2C 증감을 만들었는지"
      />

      {/* 브랜드별 매출 (가로 바) */}
      <Card>
        <CardHeader>
          <CardTitle>브랜드별 매출 (자체/수입)</CardTitle>
        </CardHeader>
        <CardContent>
          <BarChart
            categories={brandRev.map((b) => b.brand)}
            series={[
              {
                name: "이번달",
                values: brandRev.map((b) => b.revenue),
                color: "#0f172a",
              },
              {
                name: "전월",
                values: brandRev.map((b) => brandRevPrev.get(b.brand) ?? 0),
                color: "#cbd5e1",
              },
            ]}
            height={Math.max(280, brandRev.length * 38)}
            horizontal
            yLabel="실매출"
            showValueLabels
          />
        </CardContent>
      </Card>

      {/* 브랜드 × 채널그룹 스택 */}
      <Card>
        <CardHeader>
          <CardTitle>브랜드별 채널그룹 분해 (이번달)</CardTitle>
        </CardHeader>
        <CardContent>
          <BarChart
            categories={breakdown.map((b) => b.brand)}
            series={groupKeys.map((g) => ({
              name: g,
              values: breakdown.map((b) => (b as any)[g] ?? 0),
              stack: "그룹",
              color: CHANNEL_GROUP_COLOR[g] ?? "#9ca3af",
            }))}
            height={320}
            yLabel="실매출"
          />
        </CardContent>
      </Card>

      {/* 자사 공식몰 12개월 추이 */}
      <Card>
        <CardHeader>
          <CardTitle>브랜드별 자사 공식몰 12개월 추이</CardTitle>
        </CardHeader>
        <CardContent>
          <LineChart
            categories={trendMonths.map((m) => formatYM(m).replace("년 ", "/").replace("월", ""))}
            series={officialTrends.map((t) => ({
              name: t.brand,
              values: t.values,
              color: BRAND_COLOR[t.brand] ?? "#9ca3af",
            }))}
            height={320}
            yLabel="실매출"
          />
        </CardContent>
      </Card>

      {/* 종합몰 채널별 표 */}
      <Card>
        <CardHeader>
          <CardTitle>종합몰 채널별 (이번달)</CardTitle>
          <div className="text-[11px] text-muted-foreground">
            매출/정산매출/수수료율/할인율/전월 비교 — 수수료 인상 추세 감지에 활용
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="px-4 pb-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-muted-foreground border-b">
                  <th className="py-2">채널</th>
                  <th className="py-2 text-right">이번달 실매출</th>
                  <th className="py-2 text-right">정산매출</th>
                  <th className="py-2 text-right">수량</th>
                  <th className="py-2 text-right">수수료율</th>
                  <th className="py-2 text-right">전월 매출</th>
                  <th className="py-2 text-right">변화</th>
                </tr>
              </thead>
              <tbody>
                {genMall.map((g) => {
                  const pm = genMallPrev.get(g.channel)?.revenue ?? 0;
                  const ch = buildChange(g.revenue, pm, "전월");
                  const cls =
                    ch.direction === "up" || ch.direction === "new"
                      ? "text-emerald-700"
                      : ch.direction === "down" || ch.direction === "lost"
                        ? "text-rose-700"
                        : "text-muted-foreground";
                  return (
                    <tr key={g.channel} className="border-b last:border-0">
                      <td className="py-2 font-medium">{g.channel}</td>
                      <td className="py-2 text-right tabular-nums">{formatKRWLong(g.revenue)}</td>
                      <td className="py-2 text-right tabular-nums">{formatKRWLong(g.settlement)}</td>
                      <td className="py-2 text-right tabular-nums">{formatInt(g.qty)}</td>
                      <td className="py-2 text-right tabular-nums">{formatPctAbs(g.feeRate, 1)}</td>
                      <td className="py-2 text-right tabular-nums text-muted-foreground">
                        {pm > 0 ? formatKRWLong(pm) : "—"}
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
          </div>
        </CardContent>
      </Card>

      {/* Top 20 제품 */}
      <Card>
        <CardHeader>
          <CardTitle>이번달 상위 20 제품 (B2C 전체, 전월 비교)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="px-4 pb-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-muted-foreground border-b">
                  <th className="py-2">#</th>
                  <th className="py-2">제품</th>
                  <th className="py-2 text-right">수량</th>
                  <th className="py-2 text-right">이번달</th>
                  <th className="py-2 text-right">전월</th>
                  <th className="py-2 text-right">변화</th>
                </tr>
              </thead>
              <tbody>
                {topProducts.map((p, i) => {
                  const ch = buildChange(p.current, p.prev, "전월");
                  const cls =
                    ch.direction === "up" || ch.direction === "new"
                      ? "text-emerald-700"
                      : ch.direction === "down" || ch.direction === "lost"
                        ? "text-rose-700"
                        : "text-muted-foreground";
                  return (
                    <tr key={p.productName} className="border-b last:border-0">
                      <td className="py-2 text-muted-foreground">{i + 1}</td>
                      <td className="py-2 max-w-[400px] truncate">
                        <span className="text-muted-foreground text-xs mr-1">[{p.brand}]</span>
                        {p.productName}
                      </td>
                      <td className="py-2 text-right tabular-nums">{formatInt(p.qty)}</td>
                      <td className="py-2 text-right tabular-nums">{formatKRWLong(p.current)}</td>
                      <td className="py-2 text-right tabular-nums text-muted-foreground">
                        {p.prev > 0 ? formatKRWLong(p.prev) : "—"}
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
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
