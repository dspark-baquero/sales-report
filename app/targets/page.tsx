import { loadFactCube, loadMonthRows, loadRangeRows } from "@/lib/load";
import { resolveMonth } from "@/lib/months";
import { enumerateMonths } from "@/lib/aggregate";
import { quarterOf, halfYearOf } from "@/lib/compare";
import { loadTargets, buildTargetActuals, buildPeriodAgg, isProspectiveKey } from "@/lib/targets";
import { computeTargetsInsights } from "@/lib/tabInsights";
import { TabInsights } from "@/components/TabInsights";
import { YearToDateChart } from "@/components/YearToDateChart";
import { ytdCategoryDetailSeries, ytdAchievementOverall } from "@/lib/ytd";
import { TargetGauge } from "@/components/TargetGauge";
import { AnnualProgressSection } from "@/components/AnnualProgressSection";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  formatKRWLong,
  formatPctAbs,
  formatYM,
  buildAchievement,
} from "@/lib/format";
import { AchievementMatrix } from "./AchievementMatrix";
import { AchievementDashboard } from "./AchievementDashboard";
import { TargetsTable } from "./TargetsTable";

type SearchParams = Promise<{ month?: string }>;

export default async function TargetsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const ym = await resolveMonth(sp.month);
  const { qStart, qNumber } = quarterOf(ym);
  const { hStart, hNumber } = halfYearOf(ym);

  const [yearStr, monthStr] = ym.split("-");
  const monthNum = Number(monthStr);
  const annualStart = `${yearStr}-01`;
  const annualEnd = `${yearStr}-12`;

  const [cube, targets] = await Promise.all([
    loadFactCube(),
    loadTargets(),
  ]);

  // ── 모든 YTD 월을 한번에 로드 (1월~이번달) → 기간별 서브셋으로 재사용 ──
  const ytdMonths = enumerateMonths(annualStart, ym);
  const ytdSlices = await Promise.all(ytdMonths.map((m) => loadMonthRows(m)));
  const monthSlices = new Map<string, Awaited<ReturnType<typeof loadMonthRows>>>();
  for (let i = 0; i < ytdMonths.length; i++) {
    monthSlices.set(ytdMonths[i], ytdSlices[i]);
  }

  // 기간 산출
  const quarterMonths = enumerateMonths(qStart, ym);
  const halfYearMonths = enumerateMonths(hStart, ym);

  // ── 4개 기간 PeriodAgg 생성 ──
  const periodMonth = buildPeriodAgg(
    "이번달",
    formatYM(ym),
    targets, monthSlices, [ym],
  );
  const periodQuarter = buildPeriodAgg(
    "이번분기",
    quarterMonths.length > 1 ? `${formatYM(quarterMonths[0])}~${formatYM(ym)}` : formatYM(ym),
    targets, monthSlices, quarterMonths,
  );
  const periodHalf = buildPeriodAgg(
    hNumber === 1 ? "상반기" : "하반기",
    halfYearMonths.length > 1 ? `${formatYM(halfYearMonths[0])}~${formatYM(ym)}` : formatYM(ym),
    targets, monthSlices, halfYearMonths,
  );
  const periodAnnual = buildPeriodAgg(
    "연간 누적",
    ytdMonths.length > 1 ? `${formatYM(ytdMonths[0])}~${formatYM(ym)}` : formatYM(ym),
    targets, monthSlices, ytdMonths,
  );

  const periods = [periodMonth, periodQuarter, periodHalf, periodAnnual];

  // ── 이번달 매트릭스 (미달/초과/신규 추진 등 기존 카드용) ──
  const cur = monthSlices.get(ym) ?? [];
  const monthRows = buildTargetActuals(targets, cur, ym);
  const insights = computeTargetsInsights(monthRows, ym, periods);

  // 연간 목표/YTD 실적 (AnnualProgressCard용)
  const ytdMonthSet = new Set(ytdMonths);
  const annualMonthSet = new Set(enumerateMonths(annualStart, annualEnd));
  const ytdRangeRows = await loadRangeRows(annualStart, ym);
  const ytdActual = ytdRangeRows
    .filter((r) => !r.isNonRevenue)
    .reduce((s, r) => s + r.realRevenue, 0);
  const annualTarget = targets
    .filter((t) => annualMonthSet.has(t.yearMonth) && !isProspectiveKey(t.division, t.customerKey))
    .reduce((s, t) => s + t.target, 0);
  const ytdTarget = targets
    .filter((t) => ytdMonthSet.has(t.yearMonth) && !isProspectiveKey(t.division, t.customerKey))
    .reduce((s, t) => s + t.target, 0);

  // ── 채널별 연 목표 진도 (종합탭 채널 카드와 동일 의미) ──
  // 목표: 연간(1~12월) customerKey 합계 / 실적: YTD 카테고리 기반 실매출
  const annualTargetRows = targets.filter(
    (t) => annualMonthSet.has(t.yearMonth) && !isProspectiveKey(t.division, t.customerKey),
  );
  const sumAnnualTarget = (pred: (t: (typeof annualTargetRows)[number]) => boolean) =>
    annualTargetRows.filter(pred).reduce((s, t) => s + t.target, 0);
  const b2bTargetKeys = new Set(["병원", "피부관리실", "직거래처"]);
  const b2cTargetKeys = new Set(["공식몰", "종합몰", "소호몰"]);

  const ytdRev = ytdRangeRows.filter((r) => !r.isNonRevenue);
  const sumRev = (pred: (r: (typeof ytdRev)[number]) => boolean) =>
    ytdRev.filter(pred).reduce((s, r) => s + r.realRevenue, 0);
  const agencyActual = sumRev((r) => r.category === "B2B" && r.b2bCustomerType === "대리점");
  const bhActual = sumRev((r) => r.channel === "바크로하우스");

  const channelProgress = [
    {
      title: "B2B",
      ytdActual: sumRev((r) => r.category === "B2B") - agencyActual,
      annualTarget: sumAnnualTarget((t) => t.division === "국내" && b2bTargetKeys.has(t.customerKey)),
    },
    {
      title: "대리점",
      ytdActual: agencyActual,
      annualTarget: sumAnnualTarget((t) => t.customerKey === "대리점"),
    },
    {
      title: "B2C",
      ytdActual: sumRev((r) => r.category === "B2C") - bhActual,
      annualTarget: sumAnnualTarget((t) => b2cTargetKeys.has(t.customerKey)),
    },
    {
      title: "바크로하우스",
      ytdActual: bhActual,
      annualTarget: sumAnnualTarget((t) => t.customerKey === "바크로하우스"),
    },
    {
      title: "면세점",
      ytdActual: sumRev((r) => r.category === "면세점"),
      annualTarget: sumAnnualTarget((t) => t.customerKey === "면세점"),
    },
    {
      title: "수출",
      ytdActual: sumRev((r) => r.category === "수출"),
      annualTarget: sumAnnualTarget((t) => t.division === "해외"),
    },
  ];

  const prospective = monthRows.filter((t) => t.prospective && t.target > 0);
  const withTargetActive = monthRows.filter((t) => t.target > 0 && !t.prospective);
  const underperform = withTargetActive
    .filter((t) => t.rate !== null && t.rate < 0.7)
    .sort((a, b) => (a.rate ?? 0) - (b.rate ?? 0));
  const overperform = withTargetActive
    .filter((t) => t.rate !== null && t.rate >= 1.1)
    .sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">{formatYM(ym)} 목표 달성 보고</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          목표 대비 채널별·기간별 달성률 — 이번달 / {qNumber}분기 / {hNumber === 1 ? "상" : "하"}반기 / 연간 누적
        </p>
      </div>

      <TabInsights bullets={insights} />

      {/* 핵심 진척도 — 연간/연누적/이번분기/이번달 (연 목표 카드는 채널별 펼침 지원) */}
      <AnnualProgressSection
        overall={{
          title: `${yearStr}년 연 목표 진도`,
          ytdActual,
          annualTarget,
          hint: `연 목표 ${formatKRWLong(annualTarget)} 중 ${monthNum}/12개월 진행`,
        }}
        channels={channelProgress}
        monthsElapsed={monthNum}
        gauges={
          <>
            <TargetGauge
              title="연 누적 달성률"
              actual={ytdActual}
              target={ytdTarget}
              hint={`${yearStr}년 1~${monthNum}월 누적`}
            />
            <TargetGauge
              title={`${qNumber}분기 누적`}
              actual={periodQuarter.totalActual}
              target={periodQuarter.totalTarget}
              hint={periodQuarter.periodDesc}
            />
            <TargetGauge
              title="이번달 종합"
              actual={periodMonth.totalActual}
              target={periodMonth.totalTarget}
              hint={formatYM(ym)}
            />
          </>
        }
      />

      <YearToDateChart
        ym={ym}
        series={ytdCategoryDetailSeries(cube, ym)}
        caption="대분류별 매출 흐름 — 목표 진척도 카드와 함께 보세요"
        achievement={ytdAchievementOverall(ytdRangeRows, targets, ym)}
        achievementLabel="전체 국내"
      />

      {/* 기간별 상세 탭 (게이지/차트) */}
      <AchievementDashboard periods={periods} />

      {/* 기간별 × 채널별 달성률 매트릭스 */}
      <AchievementMatrix periods={periods} />

      {/* 미달 워닝 */}
      {underperform.length > 0 && (
        <Card className="border-rose-200 bg-rose-50/30">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-rose-900">달성률 70% 미만 항목 ({underperform.length}건)</CardTitle>
              <Badge variant="negative">즉시 점검 필요</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="px-4 pb-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] text-muted-foreground border-b">
                    <th className="py-2">브랜드</th>
                    <th className="py-2">구분</th>
                    <th className="py-2">거래처</th>
                    <th className="py-2 text-right">목표</th>
                    <th className="py-2 text-right">실적</th>
                    <th className="py-2 text-right">달성률</th>
                    <th className="py-2 text-right">부족액</th>
                  </tr>
                </thead>
                <tbody>
                  {underperform.map((t) => {
                    const ach = buildAchievement(t.actual, t.target);
                    return (
                      <tr key={`${t.brand}-${t.customerKey}`} className="border-b last:border-0">
                        <td className="py-2 font-medium">{t.brand}</td>
                        <td className="py-2 text-muted-foreground">{t.division}</td>
                        <td className="py-2">{t.customerKey}</td>
                        <td className="py-2 text-right tabular-nums">{formatKRWLong(t.target)}</td>
                        <td className="py-2 text-right tabular-nums">{formatKRWLong(t.actual)}</td>
                        <td className="py-2 text-right tabular-nums text-rose-700 font-semibold">
                          {formatPctAbs(t.rate, 1)}
                        </td>
                        <td className="py-2 text-right tabular-nums text-rose-700">{ach.diffText}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 초과 달성 */}
      {overperform.length > 0 && (
        <Card className="border-emerald-200 bg-emerald-50/30">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-emerald-900">110% 초과 달성 항목 ({overperform.length}건)</CardTitle>
              <Badge variant="positive">초과 달성</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="px-4 pb-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] text-muted-foreground border-b">
                    <th className="py-2">브랜드</th>
                    <th className="py-2">구분</th>
                    <th className="py-2">거래처</th>
                    <th className="py-2 text-right">목표</th>
                    <th className="py-2 text-right">실적</th>
                    <th className="py-2 text-right">달성률</th>
                    <th className="py-2 text-right">초과액</th>
                  </tr>
                </thead>
                <tbody>
                  {overperform.map((t) => {
                    const ach = buildAchievement(t.actual, t.target);
                    return (
                      <tr key={`${t.brand}-${t.customerKey}`} className="border-b last:border-0">
                        <td className="py-2 font-medium">{t.brand}</td>
                        <td className="py-2 text-muted-foreground">{t.division}</td>
                        <td className="py-2">{t.customerKey}</td>
                        <td className="py-2 text-right tabular-nums">{formatKRWLong(t.target)}</td>
                        <td className="py-2 text-right tabular-nums">{formatKRWLong(t.actual)}</td>
                        <td className="py-2 text-right tabular-nums text-emerald-700 font-semibold">
                          {formatPctAbs(t.rate, 1)}
                        </td>
                        <td className="py-2 text-right tabular-nums text-emerald-700">{ach.diffText}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 신규 추진 채널 */}
      {prospective.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>신규 추진 채널 ({prospective.length}건)</CardTitle>
              <Badge variant="info">목표만 등록 · 실 매출 매칭 없음</Badge>
            </div>
            <div className="text-[11px] text-muted-foreground">
              올리브영 / 링커 / 바크로하우스 대리점 / 직거래처 등 — 매칭되는 sales 채널이 없는 신규 추진 항목.
              실 매출이 발생하면 매핑 규칙에 추가 필요.
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="px-4 pb-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] text-muted-foreground border-b">
                    <th className="py-2">브랜드</th>
                    <th className="py-2">거래처</th>
                    <th className="py-2 text-right">이번달 목표</th>
                  </tr>
                </thead>
                <tbody>
                  {prospective.map((t) => (
                    <tr key={`${t.brand}-${t.customerKey}`} className="border-b last:border-0">
                      <td className="py-2 font-medium">{t.brand}</td>
                      <td className="py-2">{t.customerKey}</td>
                      <td className="py-2 text-right tabular-nums">{formatKRWLong(t.target)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 전체 매트릭스 표 (정렬 가능) */}
      <Card>
        <CardHeader>
          <CardTitle>이번달 전체 (브랜드 × 거래처) 목표/실적 표</CardTitle>
          <div className="text-[11px] text-muted-foreground">
            정렬·검색 가능 ({monthRows.length}건). 신규 추진 항목은 목표만 표시.
          </div>
        </CardHeader>
        <CardContent>
          <TargetsTable rows={monthRows} />
        </CardContent>
      </Card>
    </div>
  );
}
