import { loadFactCube, loadMonthRows, loadRangeRows } from "@/lib/load";
import { resolveMonth } from "@/lib/months";
import { computeB2CInsights } from "@/lib/tabInsights";
import { TabInsights } from "@/components/TabInsights";
import { YearToDateChart } from "@/components/YearToDateChart";
import {
  ytdChannelGroupSeries,
  ytdAchievementForCustomerKeys,
  ytdMonthlyTargets,
  ytdMonthlyPrevYear,
  ytdMonthsWithOutlook,
  ytdAchievementWithExtra,
  outlookPrevYearMonths,
} from "@/lib/ytd";
import {
  kpi,
  ymMinusMonths,
  topNProductsEnhanced,
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
  officialMallChannels,
  sohoMallBrands,
  staffChannels,
} from "@/lib/dimensions";
import { attributeChange } from "@/lib/changeAttribution";
import {
  bhSelfRevenue,
  BH_SELF_CHANNEL,
  withSelfChannelContribution,
  withSelfBrandContributions,
} from "@/lib/bhSelfRevenue";
import { loadTargets, targetsForMonthWithProspective } from "@/lib/targets";
import { COMPARE_LABEL, BRAND_COLOR, CHANNEL_GROUP_COLOR } from "@/lib/labels";
import { MetricCard } from "@/components/MetricCard";
import { ChangeBreakdown } from "@/components/ChangeBreakdown";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart } from "@/components/charts/BarChart";
import { LineChart } from "@/components/charts/LineChart";
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

export default async function B2CPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const ym = await resolveMonth(sp.month);
  const [cube, targets] = await Promise.all([loadFactCube(), loadTargets()]);
  const insights = computeB2CInsights(cube, ym);

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

  const k = kpi(b2cRows(cur));
  const kPrevMo = kpi(b2cRows(prevMo));
  const kPrevYr = kpi(b2cRows(prevYr));
  const kCurQ = kpi(b2cRows(curQ));
  const kPrevQ = kpi(b2cRows(prevQRows));

  // 바크로하우스 자체매출 — 파트너 추천으로 잡히지 않은 몫만 B2C(자사 공식몰)에 합산.
  // 추천분은 영업사원 실적(/sales-rep, /baquerohouse)으로 따로 관리하므로 여기서 제외된다.
  const [bhSelfCur, bhSelfPrevMo, bhSelfPrevYr, bhSelfCurQ, bhSelfPrevQ] = await Promise.all([
    bhSelfRevenue(cur, ym, ym),
    bhSelfRevenue(prevMo, prevMonth(ym), prevMonth(ym)),
    bhSelfRevenue(prevYr, prevYearSameMonth(ym), prevYearSameMonth(ym)),
    bhSelfRevenue(curQ, qStart, ym),
    bhSelfRevenue(prevQRows, prevQ.qStart, ymMinusMonths(prevQ.qEnd, 3 - qProg)),
  ]);
  const b2cRevenue = k.revenue + bhSelfCur.revenue;
  const b2cRevenuePrevMo = kPrevMo.revenue + bhSelfPrevMo.revenue;
  const b2cRevenuePrevYr = kPrevYr.revenue + bhSelfPrevYr.revenue;
  const b2cRevenueCurQ = kCurQ.revenue + bhSelfCurQ.revenue;
  const b2cRevenuePrevQ = kPrevQ.revenue + bhSelfPrevQ.revenue;

  // B2C 목표 합계 (공식몰+종합몰+소호몰+기타+올리브영(추진)+링커(추진)) — 바크로하우스는 별도 탭
  const ta = targetsForMonthWithProspective(targets, ym);
  const b2cKeys = ["공식몰", "종합몰", "소호몰", "기타", "올리브영", "링커"];
  const b2cTarget = ta
    .filter((t) => t.division === "국내" && b2cKeys.includes(t.customerKey))
    .reduce((s, t) => s + t.target, 0);

  // 채널 그룹별 합계 — 바크로하우스 메인몰은 자체매출만 자사 공식몰에 합산
  const groupTotalsOf = (rows: typeof cur, bhSelf: number): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const r of rows) {
      if (r.category !== "B2C") continue;
      if (r.isNonRevenue) continue;
      if (r.channel === "바크로하우스") continue;
      out[r.channelGroup] = (out[r.channelGroup] ?? 0) + r.realRevenue;
    }
    if (bhSelf > 0) out["자사 공식몰"] = (out["자사 공식몰"] ?? 0) + bhSelf;
    return out;
  };
  const groupTotals = groupTotalsOf(cur, bhSelfCur.revenue);
  const groupTotalsPrev = groupTotalsOf(prevMo, bhSelfPrevMo.revenue);

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
  const brandRev = b2cBrandRevenue(cur, false, bhSelfCur.byBrand);
  const brandRevPrev = new Map(
    b2cBrandRevenue(prevMo, false, bhSelfPrevMo.byBrand).map((b) => [b.brand, b.revenue]),
  );

  // 브랜드 × 채널그룹
  const breakdown = brandChannelGroupBreakdown(cur, bhSelfCur.byBrand);

  // 자사 공식몰 12개월 추이
  const fromYM = ymMinusMonths(ym, 11);
  const rangeRows = await loadRangeRows(fromYM, ym);
  // 바크로하우스 자체매출 — 12개월 추이용 + YTD(연초~이번달) 스택/달성률 보정용
  const [bhSelfRange, bhSelfYtd] = await Promise.all([
    bhSelfRevenue(rangeRows, fromYM, ym),
    bhSelfRevenue(rangeRows, `${ym.slice(0, 4)}-01`, ym),
  ]);
  const officialTrends = brandOfficialTrend(rangeRows, fromYM, ym);
  const trendMonths = officialTrends[0]?.months ?? [];

  // 자사 공식몰 채널별
  const offMall = officialMallChannels(cur, bhSelfCur);
  const offMallPrev = new Map(
    officialMallChannels(prevMo, bhSelfPrevMo).map((g) => [g.channel, g]),
  );

  // 공식몰 채널별 12개월 추이
  const officialChannelNames = [...new Set(
    rangeRows
      .filter((r) => r.channelGroup === "자사 공식몰" && !r.isNonRevenue && r.channel !== "바크로하우스")
      .map((r) => r.channel),
  )];

  // 종합몰
  const genMall = generalMallChannels(cur);
  const genMallPrev = new Map(generalMallChannels(prevMo).map((g) => [g.channel, g]));

  // 소호몰 브랜드별
  const soho = sohoMallBrands(cur);
  const sohoPrev = new Map(sohoMallBrands(prevMo).map((s) => [s.brand, s.revenue]));

  // 소호몰 12개월 브랜드별 추이
  const sohoBrands = [...new Set(
    rangeRows
      .filter((r) => r.channelGroup === "소호몰" && !r.isNonRevenue)
      .map((r) => r.brand),
  )];

  // 임직원/패밀리
  const staff = staffChannels(cur);
  const staffPrev = new Map(staffChannels(prevMo).map((s) => [s.channel, s.revenue]));

  const groupKeys = ["자사 공식몰", "종합몰", "소호몰", "백화점", "임직원/패밀리", "기타"];

  // Top 제품
  const ytdStart = `${ym.split("-")[0]}-01`;
  const ytdB2c = b2cRows(rangeRows.filter((r) => r.yearMonth >= ytdStart));
  const topProducts = topNProductsEnhanced(b2cRows(cur), b2cRows(prevMo), ytdB2c, 20);

  // 변화 요인 — 채널 단위 (바크로하우스 자체매출은 별도 항목으로 덧붙임)
  const channelContribs = withSelfChannelContribution(
    attributeChange(b2cRows(cur), b2cRows(prevMo), (r) => r.channel || null),
    bhSelfCur.revenue,
    bhSelfPrevMo.revenue,
  );
  // 변화 요인 — 브랜드 단위 (자체매출을 각 브랜드에 합산)
  const brandContribs = withSelfBrandContributions(
    attributeChange(b2cRows(cur), b2cRows(prevMo), (r) => r.brand || null),
    bhSelfCur.byBrand,
    bhSelfPrevMo.byBrand,
  );

  // 전년 동기 + 월별 목표 (B2C — 바크로하우스 제외)
  const prevYearStart = `${Number(ym.split("-")[0]) - 1}-01`;
  const prevYearEnd = prevYearSameMonth(ym);
  const prevYearRangeRows = await loadRangeRows(prevYearStart, prevYearEnd);
  const outlookPrevRows = (
    await Promise.all(outlookPrevYearMonths(ym).map((m) => loadMonthRows(m)))
  ).flat();
  const b2cKeySet = new Set(b2cKeys);
  const b2cMonthlyTargetsArr = ytdMonthlyTargets(targets, ym, {
    outlook: true,
    targetFilter: (t) => t.division === "국내" && b2cKeySet.has(t.customerKey),
  });
  const prevYearAll = [...prevYearRangeRows, ...outlookPrevRows];
  // 전년 라인도 올해와 같은 기준(바크로하우스 자체매출 포함)으로 맞춘다.
  const bhSelfPrevYearRange = await bhSelfRevenue(
    prevYearAll,
    prevYearStart,
    `${Number(ym.slice(0, 4)) - 1}-12`,
  );
  const b2cMonthlyPrevYearArr = ytdMonthlyPrevYear(prevYearAll, ym, {
    outlook: true,
    rowFilter: (r) => r.category === "B2C" && r.channel !== "바크로하우스",
  }).map((v, i) => {
    const m = ytdMonthsWithOutlook(ym)[i];
    if (!m) return v;
    const [y, mm] = m.split("-");
    return v + (bhSelfPrevYearRange.byMonth.get(`${Number(y) - 1}-${mm}`) ?? 0);
  });

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">
            {formatYM(ym)} B2C{" "}
            <span className="text-xs text-muted-foreground font-normal ml-1">
              {bhSelfCur.available ? "(면세점 제외 · 바크로하우스 자체매출 포함)" : "(면세점 제외)"}
            </span>
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {brandRev.length}개 브랜드 · {Object.keys(groupTotals).length}개 채널그룹
          </p>
        </div>
      </div>

      <TabInsights bullets={insights} />

      <YearToDateChart
        ym={ym}
        series={ytdChannelGroupSeries(cube, ym, bhSelfYtd.byMonth)}
        caption="채널그룹별 (자사 공식몰 / 종합몰 / 소호몰 / 백화점 / 임직원·패밀리 / 기타)"
        achievement={ytdAchievementWithExtra(
          ytdAchievementForCustomerKeys(
            rangeRows,
            targets,
            ym,
            ["공식몰", "종합몰", "소호몰", "기타"],
            (r) => r.category === "B2C" && r.channel !== "바크로하우스",
          ),
          bhSelfYtd.revenue,
        )}
        achievementLabel="B2C (공식몰·종합몰·소호몰·기타)"
        monthlyTargets={b2cMonthlyTargetsArr}
        prevYearValues={b2cMonthlyPrevYearArr}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="B2C 실매출"
          current={b2cRevenue}
          comparisons={[
            { label: COMPARE_LABEL.prevMonth, prev: b2cRevenuePrevMo },
            { label: COMPARE_LABEL.curQuarter, current: b2cRevenueCurQ, prev: b2cRevenuePrevQ, note: `${qProg}/3개월` },
            { label: COMPARE_LABEL.prevYear, prev: b2cRevenuePrevYr },
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
        prevTotal={b2cRevenuePrevMo}
        curTotal={b2cRevenue}
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
                          : ach.status === "shortfall"
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
        prevTotal={b2cRevenuePrevMo}
        curTotal={b2cRevenue}
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

      {/* 자사 공식몰 채널별 */}
      <Card>
        <CardHeader>
          <CardTitle>자사 공식몰 채널별 (이번달)</CardTitle>
          <div className="text-[11px] text-muted-foreground">
            브랜드별 공식몰/스마트스토어 개별 실적
            {bhSelfCur.available && " · 바크로하우스(자체매출) = 몰 매출 − 파트너 추천 매출"}
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
                  <th className="py-2 text-right">전월 매출</th>
                  <th className="py-2 text-right">변화</th>
                </tr>
              </thead>
              <tbody>
                {offMall.map((g) => {
                  const pm = offMallPrev.get(g.channel)?.revenue ?? 0;
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

      {/* 공식몰 채널별 12개월 스택 */}
      {officialChannelNames.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>자사 공식몰 채널별 12개월 추이</CardTitle>
            <div className="text-[11px] text-muted-foreground">채널별 매출 비중 변화</div>
          </CardHeader>
          <CardContent>
            <BarChart
              categories={trendMonths.map((m) => formatYM(m).replace("년 ", "/").replace("월", ""))}
              series={[
                ...officialChannelNames.map((ch, i) => ({
                  name: ch,
                  values: trendMonths.map((m) => {
                    let sum = 0;
                    for (const r of rangeRows) {
                      if (r.channel === ch && r.yearMonth === m && !r.isNonRevenue) sum += r.realRevenue;
                    }
                    return sum;
                  }),
                  stack: "official",
                  color: ["#8b5cf6", "#6366f1", "#a855f7", "#c084fc", "#818cf8", "#e879f9", "#d946ef"][i % 7],
                })),
                ...(bhSelfRange.revenue > 0
                  ? [{
                      name: BH_SELF_CHANNEL,
                      values: trendMonths.map((m) => bhSelfRange.byMonth.get(m) ?? 0),
                      stack: "official",
                      color: "#f0abfc",
                    }]
                  : []),
              ]}
              height={320}
              yLabel="실매출"
              showStackTotals
            />
          </CardContent>
        </Card>
      )}

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

      {/* 소호몰 브랜드별 */}
      {soho.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>소호몰 브랜드별 (이번달)</CardTitle>
            <div className="text-[11px] text-muted-foreground">소호몰 (사입 후 재판매) 브랜드 구성</div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="px-4 pb-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] text-muted-foreground border-b">
                    <th className="py-2">브랜드</th>
                    <th className="py-2 text-right">이번달 실매출</th>
                    <th className="py-2 text-right">수량</th>
                    <th className="py-2 text-right">전월</th>
                    <th className="py-2 text-right">변화</th>
                  </tr>
                </thead>
                <tbody>
                  {soho.map((s) => {
                    const pm = sohoPrev.get(s.brand) ?? 0;
                    const ch = buildChange(s.revenue, pm, "전월");
                    const cls =
                      ch.direction === "up" || ch.direction === "new"
                        ? "text-emerald-700"
                        : ch.direction === "down" || ch.direction === "lost"
                          ? "text-rose-700"
                          : "text-muted-foreground";
                    return (
                      <tr key={s.brand} className="border-b last:border-0">
                        <td className="py-2 font-medium">{s.brand}</td>
                        <td className="py-2 text-right tabular-nums">{formatKRWLong(s.revenue)}</td>
                        <td className="py-2 text-right tabular-nums">{formatInt(s.qty)}</td>
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
      )}

      {/* 소호몰 12개월 브랜드별 추이 */}
      {sohoBrands.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>소호몰 12개월 브랜드별 추이</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart
              categories={trendMonths.map((m) => formatYM(m).replace("년 ", "/").replace("월", ""))}
              series={sohoBrands.map((brand) => ({
                name: brand,
                values: trendMonths.map((m) => {
                  let sum = 0;
                  for (const r of rangeRows) {
                    if (r.channelGroup === "소호몰" && r.brand === brand && r.yearMonth === m && !r.isNonRevenue) sum += r.realRevenue;
                  }
                  return sum;
                }),
                stack: "soho",
                color: BRAND_COLOR[brand] ?? "#9ca3af",
              }))}
              height={280}
              yLabel="실매출"
              showStackTotals
            />
          </CardContent>
        </Card>
      )}

      {/* 임직원/패밀리 */}
      {staff.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>임직원/패밀리 채널별 (이번달)</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="px-4 pb-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] text-muted-foreground border-b">
                    <th className="py-2">채널</th>
                    <th className="py-2 text-right">이번달 실매출</th>
                    <th className="py-2 text-right">수량</th>
                    <th className="py-2 text-right">전월</th>
                    <th className="py-2 text-right">변화</th>
                  </tr>
                </thead>
                <tbody>
                  {staff.map((s) => {
                    const pm = staffPrev.get(s.channel) ?? 0;
                    const ch = buildChange(s.revenue, pm, "전월");
                    const cls =
                      ch.direction === "up" || ch.direction === "new"
                        ? "text-emerald-700"
                        : ch.direction === "down" || ch.direction === "lost"
                          ? "text-rose-700"
                          : "text-muted-foreground";
                    return (
                      <tr key={s.channel} className="border-b last:border-0">
                        <td className="py-2 font-medium">{s.channel}</td>
                        <td className="py-2 text-right tabular-nums">{formatKRWLong(s.revenue)}</td>
                        <td className="py-2 text-right tabular-nums">{formatInt(s.qty)}</td>
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
      )}

      <TopProductsTable products={topProducts} title="이번달 상위 20 제품 (B2C 전체)" ym={ym} />
    </div>
  );
}
