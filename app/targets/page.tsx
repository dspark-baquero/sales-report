import { loadSalesRows } from "@/lib/load";
import { resolveMonth } from "@/lib/months";
import { filterMonth, filterRange, enumerateMonths } from "@/lib/aggregate";
import { quarterOf } from "@/lib/compare";
import { loadTargets, buildTargetActuals, isProspectiveKey } from "@/lib/targets";
import { TargetGauge } from "@/components/TargetGauge";
import { AnnualProgressCard } from "@/components/AnnualProgressCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart } from "@/components/charts/BarChart";
import {
  formatKRWLong,
  formatPctAbs,
  formatYM,
  buildAchievement,
} from "@/lib/format";
import { TargetsTable } from "./TargetsTable";

type SearchParams = Promise<{ month?: string }>;

export default async function TargetsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const ym = resolveMonth(sp.month);
  const all = loadSalesRows();
  const targets = loadTargets();

  const cur = filterMonth(all, ym);
  const { qStart } = quarterOf(ym);
  const curQ = filterRange(all, qStart, ym);

  // 이번달 매트릭스
  const monthRows = buildTargetActuals(targets, cur, ym);

  // 이번분기 누적 — 분기 시작월~이번달의 모든 target/actual 누적
  const quarterMonths: string[] = [];
  {
    const [y, m] = ym.split("-").map(Number);
    const [qy, qm] = qStart.split("-").map(Number);
    let cy = qy, cm = qm;
    while (cy < y || (cy === y && cm <= m)) {
      quarterMonths.push(`${cy}-${String(cm).padStart(2, "0")}`);
      cm++;
      if (cm > 12) { cm = 1; cy++; }
    }
  }

  // 분기 누적 (브랜드 × 거래처): 모든 분기 월 합산
  const qMatrix = new Map<string, { brand: string; division: "국내" | "해외"; customerKey: string; target: number; actual: number; prospective: boolean }>();
  for (const qym of quarterMonths) {
    const monthSliceRows = filterMonth(all, qym);
    const ta = buildTargetActuals(targets, monthSliceRows, qym);
    for (const t of ta) {
      const key = `${t.brand}|${t.division}|${t.customerKey}`;
      const cur = qMatrix.get(key) ?? {
        brand: t.brand,
        division: t.division,
        customerKey: t.customerKey,
        target: 0,
        actual: 0,
        prospective: t.prospective,
      };
      cur.target += t.target;
      cur.actual += t.actual;
      qMatrix.set(key, cur);
    }
  }

  // 이번달 종합
  const monthTargetTotal = monthRows.reduce((s, t) => s + t.target, 0);
  const monthActualTotal = monthRows.reduce((s, t) => s + t.actual, 0);
  const quarterTargetTotal = [...qMatrix.values()].reduce((s, t) => s + t.target, 0);
  const quarterActualTotal = [...qMatrix.values()].reduce((s, t) => s + t.actual, 0);

  // ── 연간 / 연 누적(YTD) ─────────────────────────────────
  const [yearStr, monthStr] = ym.split("-");
  const monthNum = Number(monthStr);
  const annualStart = `${yearStr}-01`;
  const annualEnd = `${yearStr}-12`;
  const ytdMonths = enumerateMonths(annualStart, ym);     // 1월~이번달
  const ytdMonthSet = new Set(ytdMonths);
  const annualMonthSet = new Set(enumerateMonths(annualStart, annualEnd));

  // YTD 실적 (1월~이번달, 비매출 제외)
  const ytdActual = filterRange(all, annualStart, ym)
    .filter((r) => !r.isNonRevenue)
    .reduce((s, r) => s + r.realRevenue, 0);

  // 연 목표 / YTD 목표 (신규 추진 제외 — 매칭되는 sales가 없는 키는 페이스 평가에서 빠짐)
  const annualTarget = targets
    .filter(
      (t) =>
        annualMonthSet.has(t.yearMonth) && !isProspectiveKey(t.division, t.customerKey),
    )
    .reduce((s, t) => s + t.target, 0);
  const ytdTarget = targets
    .filter(
      (t) =>
        ytdMonthSet.has(t.yearMonth) && !isProspectiveKey(t.division, t.customerKey),
    )
    .reduce((s, t) => s + t.target, 0);

  // 국내/해외 분리
  const domestic = monthRows.filter((t) => t.division === "국내" && !t.prospective);
  const overseas = monthRows.filter((t) => t.division === "해외" && !t.prospective);
  const prospective = monthRows.filter((t) => t.prospective && t.target > 0);

  const domTarget = domestic.reduce((s, t) => s + t.target, 0);
  const domActual = domestic.reduce((s, t) => s + t.actual, 0);
  const ovrTarget = overseas.reduce((s, t) => s + t.target, 0);
  const ovrActual = overseas.reduce((s, t) => s + t.actual, 0);

  // 미달 / 초과 항목
  const withTargetActive = monthRows.filter((t) => t.target > 0 && !t.prospective);
  const underperform = withTargetActive
    .filter((t) => t.rate !== null && t.rate < 0.7)
    .sort((a, b) => (a.rate ?? 0) - (b.rate ?? 0));
  const overperform = withTargetActive
    .filter((t) => t.rate !== null && t.rate >= 1.1)
    .sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0));

  // 브랜드 단위 집계 (게이지 그리드)
  const brandAgg = new Map<string, { target: number; actual: number }>();
  for (const t of monthRows) {
    if (t.prospective) continue;
    const cur = brandAgg.get(t.brand) ?? { target: 0, actual: 0 };
    cur.target += t.target;
    cur.actual += t.actual;
    brandAgg.set(t.brand, cur);
  }
  const brandGauges = [...brandAgg.entries()]
    .filter(([, v]) => v.target > 0 || v.actual > 0)
    .sort((a, b) => b[1].target - a[1].target);

  // 거래처 키 단위 집계
  const keyAgg = new Map<string, { division: "국내" | "해외"; target: number; actual: number; prospective: boolean }>();
  for (const t of monthRows) {
    const k = `${t.division}|${t.customerKey}`;
    const cur = keyAgg.get(k) ?? { division: t.division, target: 0, actual: 0, prospective: t.prospective };
    cur.target += t.target;
    cur.actual += t.actual;
    keyAgg.set(k, cur);
  }
  const keyRows = [...keyAgg.entries()]
    .map(([k, v]) => ({
      key: k.split("|")[1],
      ...v,
      rate: v.target > 0 ? v.actual / v.target : null,
    }))
    .filter((x) => x.target > 0 || x.actual > 0 || x.prospective)
    .sort((a, b) => b.target - a.target);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">{formatYM(ym)} 목표 달성 보고</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          target.csv 기반 (브랜드 × 구분 × 거래처 × 월) 목표 대비 이번달/분기 누적 달성률
        </p>
      </div>

      {/* 핵심 진척도 — 연간/연누적/이번분기/이번달 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <AnnualProgressCard
          title={`${yearStr}년 연 목표 진도`}
          ytdActual={ytdActual}
          annualTarget={annualTarget}
          monthsElapsed={monthNum}
          hint={`연 목표 ${formatKRWLong(annualTarget)} 중 ${monthNum}/12개월 진행`}
        />
        <TargetGauge
          title={`연 누적 (YTD) 달성률`}
          actual={ytdActual}
          target={ytdTarget}
          hint={`${yearStr}년 1~${monthNum}월 누적 (시점 기준 페이스 평가)`}
        />
        <TargetGauge
          title="이번분기 누적"
          actual={quarterActualTotal}
          target={quarterTargetTotal}
          hint={`${quarterMonths[0]}~${ym}, ${quarterMonths.length}개월 누적`}
        />
        <TargetGauge
          title="이번달 종합"
          actual={monthActualTotal}
          target={monthTargetTotal}
          hint="이번달 (브랜드 × 거래처) 합계"
        />
      </div>

      {/* 이번달 국내/해외 분리 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TargetGauge title="이번달 국내" actual={domActual} target={domTarget} />
        <TargetGauge title="이번달 해외 (수출)" actual={ovrActual} target={ovrTarget} />
      </div>

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

      {/* 거래처 키별 막대 (목표 vs 실적) */}
      <Card>
        <CardHeader>
          <CardTitle>거래처별 목표 vs 실적</CardTitle>
          <div className="text-[11px] text-muted-foreground">
            이번달 (브랜드 합계) — 막대: 목표(연한) / 실적(진한)
          </div>
        </CardHeader>
        <CardContent>
          <BarChart
            categories={keyRows.map((r) => r.key)}
            series={[
              {
                name: "목표",
                values: keyRows.map((r) => r.target),
                color: "#cbd5e1",
              },
              {
                name: "실적",
                values: keyRows.map((r) => r.actual),
                color: "#0f172a",
              },
            ]}
            height={Math.max(280, keyRows.length * 32)}
            horizontal
            yLabel="실매출"
            showValueLabels
          />
        </CardContent>
      </Card>

      {/* 브랜드별 게이지 그리드 */}
      <Card>
        <CardHeader>
          <CardTitle>브랜드별 이번달 달성률</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {brandGauges.map(([brand, v]) => (
              <TargetGauge
                key={brand}
                title={brand}
                actual={v.actual}
                target={v.target}
                hint={`목표 ${formatKRWLong(v.target)}`}
              />
            ))}
          </div>
        </CardContent>
      </Card>

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
