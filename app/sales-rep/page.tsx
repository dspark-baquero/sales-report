import { loadFactCube } from "@/lib/load";
import { resolveMonth } from "@/lib/months";
import { enumerateMonths } from "@/lib/aggregate";
import { prevMonth } from "@/lib/compare";
import {
  loadBHPartnerMap,
  loadBHSales,
  isBHDataAvailable,
  type BHPartner,
  type BHPartnerSale,
} from "@/lib/baquerohouse-data";
import { loadDealerTargets } from "@/lib/dealer-targets";
import { buildSalesRepProfile } from "@/lib/salesRepProfile";
import { repSummaryRows } from "@/lib/salesRepSummary";
import { computeSalesRepInsights } from "@/lib/tabInsights";
import { TabInsights } from "@/components/TabInsights";
import { MetricCard } from "@/components/MetricCard";
import { TargetGauge } from "@/components/TargetGauge";
import { SalesRepLink } from "@/components/SalesRepLink";
import { CustomerLink } from "@/components/CustomerLink";
import { YearToDateChart } from "@/components/YearToDateChart";
import { DonutChart } from "@/components/charts/DonutChart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { COMPARE_LABEL } from "@/lib/labels";
import {
  formatKRWLong,
  formatKRWShort,
  formatInt,
  formatYM,
  buildChange,
} from "@/lib/format";
import Link from "next/link";

type SearchParams = Promise<{ month?: string; rep?: string }>;

const monthLabel = (m: string) => formatYM(m).replace("년 ", "/").replace("월", "");

const SOURCE_COLORS = {
  직거래처: "#6366f1",
  대리점: "#f59e0b",
  링커: "#10b981",
  바크로하우스: "#e11d48",
} as const;

const TYPE_COLORS = ["#6366f1", "#f59e0b", "#10b981", "#e11d48", "#8b5cf6", "#0ea5e9", "#94a3b8"];

// 전월 대비 변화 셀 색상
function changeCls(direction: ReturnType<typeof buildChange>["direction"]): string {
  return direction === "up" || direction === "new"
    ? "text-emerald-700"
    : direction === "down" || direction === "lost"
      ? "text-rose-700"
      : "text-muted-foreground";
}

export default async function SalesRepPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const ym = await resolveMonth(sp.month);
  const prevYM = prevMonth(ym);
  const rep = sp.rep?.trim() || null;

  const [cube, dealerTargets, bhAvailable] = await Promise.all([
    loadFactCube(),
    loadDealerTargets(),
    isBHDataAvailable(),
  ]);
  const [partnerMap, bhSalesCur, bhSalesPrev] = bhAvailable
    ? await Promise.all([loadBHPartnerMap(), loadBHSales(ym), loadBHSales(prevYM)])
    : [new Map<string, BHPartner>(), [] as BHPartnerSale[], [] as BHPartnerSale[]];

  const annualStart = `${ym.split("-")[0]}-01`;
  const ytdMonths = enumerateMonths(annualStart, ym);

  // rep 미선택 또는 데이터 전무 → 안내 + 상위 영업사원 목록
  const profile = rep
    ? buildSalesRepProfile(cube, rep, ym, prevYM, {
        partnerMap,
        bhSalesCur,
        bhSalesPrev,
        dealerTargets,
        ytdMonths,
      })
    : null;
  const hasData =
    !!profile &&
    ((profile.summary?.total ?? 0) > 0 || profile.dealer.trend12m.some((t) => t.revenue > 0));

  if (!profile || !hasData) {
    const repRows = repSummaryRows(cube, partnerMap, bhSalesCur, bhSalesPrev, ym, prevYM);
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{formatYM(ym)} 영업사원 상세</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {rep
              ? `'${rep}' 영업사원의 이번달 실적 데이터가 없습니다. 아래에서 선택하세요.`
              : "B2B종합에서 영업사원 이름을 클릭하거나, 아래에서 선택하세요."}
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>이번달 상위 영업사원</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {repRows.slice(0, 20).map((r) => (
                <SalesRepLink
                  key={r.manager}
                  rep={r.manager}
                  ym={ym}
                  className="text-sm px-3 py-1.5 rounded-md border hover:bg-muted/50 transition"
                >
                  {r.manager} · {formatKRWShort(r.total)}
                </SalesRepLink>
              ))}
            </div>
          </CardContent>
        </Card>
        <Link href="/b2b-summary" className="text-sm text-muted-foreground hover:underline">
          ← B2B종합으로 돌아가기
        </Link>
      </div>
    );
  }

  const { summary, dealer, achievement, agency, linkers, bh } = profile;
  const bhTotal = (summary?.bhDirect ?? 0) + (summary?.bhAgency ?? 0);
  const [year, mon] = ym.split("-");

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">
            {formatYM(ym)} · {rep} <span className="text-sm text-muted-foreground font-normal">영업사원 상세</span>
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            직거래처 · 대리점 · 링커 · 바크로하우스를 소스별로 상세 표시
          </p>
        </div>
        <Link href="/b2b-summary" className="text-xs text-muted-foreground hover:underline whitespace-nowrap mt-1">
          ← B2B종합
        </Link>
      </div>

      <TabInsights bullets={computeSalesRepInsights(profile)} />

      {/* 요약 KPI */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="통합 실매출 (4개 소스 합)"
          current={summary?.total ?? 0}
          comparisons={[{ label: COMPARE_LABEL.prevMonth, prev: summary?.prevTotal ?? 0 }]}
          highlight
        />
        <MetricCard
          label="직거래처"
          current={dealer.curRevenue}
          comparisons={[
            { label: COMPARE_LABEL.prevMonth, prev: dealer.prevRevenue },
            { label: COMPARE_LABEL.prevYear, prev: dealer.prevYearRevenue },
          ]}
        />
        <MetricCard
          label="담당 거래처"
          current={dealer.curActiveCustomers}
          unit="raw"
          unitSuffix="곳"
          comparisons={[]}
          hint="직거래처 기준"
        />
        {achievement && achievement.monthTarget > 0 ? (
          <MetricCard
            label="이번달 목표 달성 (직거래처)"
            current={achievement.monthActual}
            comparisons={[]}
            target={{ value: achievement.monthTarget, label: "이번달 목표" }}
          />
        ) : (
          <MetricCard label="이번달 목표" current={0} unit="raw" unitSuffix="" comparisons={[]} hint="목표 미설정 · 신규 추진" />
        )}
      </div>

      {/* 올해 월별 실적·목표·달성률 (YTD, 다른 탭 공통 차트) */}
      <YearToDateChart
        ym={ym}
        series={profile.ytdSeries}
        title={`${year}년 영업사원 월별 실적 (직거래처)`}
        caption="막대=월 실적 · 다이아=월 목표 · 월 라벨 아래=그 달 달성률 · 점선=전년 동월"
        monthlyTargets={profile.ytdMonthlyTargets}
        prevYearValues={profile.ytdPrevYear}
        achievement={profile.ytdAchievement}
        achievementLabel="직거래처 연 누적"
      />

      {/* 목표 달성 (월·누적) */}
      {achievement && (achievement.monthTarget > 0 || achievement.ytdTarget > 0) ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TargetGauge
            title="이번달 목표 달성"
            actual={achievement.monthActual}
            target={achievement.monthTarget}
            hint={`${formatYM(ym)} 직거래처`}
          />
          <TargetGauge
            title="연 누적 목표 달성"
            actual={achievement.ytdActual}
            target={achievement.ytdTarget}
            hint={`${year}년 1~${Number(mon)}월 누적`}
          />
        </div>
      ) : (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground text-center">
            이 영업사원은 목표가 설정되지 않았습니다 (신규 추진 또는 목표 미등록).
          </CardContent>
        </Card>
      )}

      {/* 거래처유형 믹스 */}
      {dealer.customerTypeMix.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>거래처유형 믹스 (직거래처)</CardTitle>
            <div className="text-[11px] text-muted-foreground">병원 · 피부관리실 등 유형별 매출 비중</div>
          </CardHeader>
          <CardContent>
            <DonutChart
              items={dealer.customerTypeMix.map((t, i) => ({
                name: t.type,
                value: t.revenue,
                color: TYPE_COLORS[i % TYPE_COLORS.length],
              }))}
              height={260}
              showCenter={{ label: "직거래처 합계", value: formatKRWShort(dealer.curRevenue) }}
            />
          </CardContent>
        </Card>
      )}

      {/* ══ 직거래처 ══ */}
      <SourceSection title="직거래처" color={SOURCE_COLORS.직거래처} total={dealer.curRevenue}>
        {dealer.topCustomers.length > 0 ? (
          <div className="overflow-x-auto">
            <div className="text-[11px] font-medium text-muted-foreground mb-1">담당 거래처 (이번달 상위)</div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-muted-foreground border-b">
                  <th className="py-2">거래처</th>
                  <th className="py-2 text-right">이번달</th>
                  <th className="py-2 text-right">전월</th>
                  <th className="py-2 text-right">전월 대비</th>
                </tr>
              </thead>
              <tbody>
                {dealer.topCustomers.map((c) => {
                  const ch = buildChange(c.current, c.prev, "전월");
                  return (
                    <tr key={c.customer} className="border-b last:border-0">
                      <td className="py-2 font-medium">
                        <CustomerLink customer={c.customer} ym={ym} />
                      </td>
                      <td className="py-2 text-right tabular-nums">{formatKRWLong(c.current)}</td>
                      <td className="py-2 text-right tabular-nums text-muted-foreground">
                        {c.prev > 0 ? formatKRWLong(c.prev) : "—"}
                      </td>
                      <td className={`py-2 text-right tabular-nums ${changeCls(ch.direction)}`}>
                        <div>{ch.diffText}</div>
                        <div className="text-[10px]">{ch.pctText}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">이번달 직거래처 매출이 없습니다.</div>
        )}

        {(dealer.newCustomers.length > 0 || dealer.lostCustomers.length > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
            <div>
              <div className="text-[11px] font-medium text-emerald-700 mb-1">신규 거래처 (최근 3개월)</div>
              {dealer.newCustomers.length > 0 ? (
                <ul className="space-y-1 text-sm">
                  {dealer.newCustomers.slice(0, 8).map((n) => (
                    <li key={n.customer} className="flex justify-between gap-2">
                      <CustomerLink customer={n.customer} ym={ym} />
                      <span className="tabular-nums text-muted-foreground">{formatKRWShort(n.revenue)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-xs text-muted-foreground">없음</div>
              )}
            </div>
            <div>
              <div className="text-[11px] font-medium text-rose-700 mb-1">이탈 거래처 (이번달 매출 0)</div>
              {dealer.lostCustomers.length > 0 ? (
                <ul className="space-y-1 text-sm">
                  {dealer.lostCustomers.slice(0, 8).map((l) => (
                    <li key={l.customer} className="flex justify-between gap-2">
                      <CustomerLink customer={l.customer} ym={ym} />
                      <span className="tabular-nums text-muted-foreground">
                        {formatKRWShort(l.prevRevenue)} · ~{monthLabel(l.lastSeenMonth)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-xs text-muted-foreground">없음</div>
              )}
            </div>
          </div>
        )}
      </SourceSection>

      {/* ══ 바크로하우스 ══ */}
      {bhAvailable && bhTotal > 0 && (
        <SourceSection title="바크로하우스" color={SOURCE_COLORS.바크로하우스} total={bhTotal}>
          <div className="text-[11px] text-muted-foreground mb-2">파트너 추천 매출 (본인 직접 관리분)</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <KV label="직접 관리" value={formatKRWLong(summary?.bhDirect ?? 0)} />
            <KV label="대리점/링커 경유" value={formatKRWLong(summary?.bhAgency ?? 0)} />
            {bh && <KV label="예상 커미션" value={formatKRWLong(bh.commission)} />}
            {bh && <KV label="담당 파트너" value={`${formatInt(bh.partners)}개`} />}
          </div>
        </SourceSection>
      )}

      {/* ══ 대리점 ══ */}
      {agency && agency.agencies.length > 0 && (
        <SourceSection title="대리점" color={SOURCE_COLORS.대리점} total={agency.revenue}>
          <div className="text-[11px] font-medium text-muted-foreground mb-1">담당 대리점별</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-muted-foreground border-b">
                  <th className="py-2">대리점</th>
                  <th className="py-2 text-right">이번달</th>
                  <th className="py-2 text-right">전월</th>
                  <th className="py-2 text-right">전월 대비</th>
                </tr>
              </thead>
              <tbody>
                {agency.agencies.map((a) => {
                  const ch = buildChange(a.revenue, a.prevRevenue, "전월");
                  return (
                    <tr key={a.customer} className="border-b last:border-0">
                      <td className="py-2 font-medium">
                        <CustomerLink customer={a.customer} ym={ym} />
                      </td>
                      <td className="py-2 text-right tabular-nums">{formatKRWLong(a.revenue)}</td>
                      <td className="py-2 text-right tabular-nums text-muted-foreground">
                        {a.prevRevenue > 0 ? formatKRWLong(a.prevRevenue) : "—"}
                      </td>
                      <td className={`py-2 text-right tabular-nums ${changeCls(ch.direction)}`}>
                        <div>{ch.diffText}</div>
                        <div className="text-[10px]">{ch.pctText}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SourceSection>
      )}

      {/* ══ 링커 ══ */}
      {linkers.length > 0 && (
        <SourceSection
          title="링커"
          color={SOURCE_COLORS.링커}
          total={linkers.reduce((s, l) => s + l.revenue, 0)}
        >
          <div className="text-[11px] text-muted-foreground mb-1">담당 외부 영업사원/회사</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-muted-foreground border-b">
                  <th className="py-2">링커</th>
                  <th className="py-2 text-right">담당 거래처</th>
                  <th className="py-2 text-right">이번달</th>
                  <th className="py-2 text-right">전월</th>
                  <th className="py-2 text-right">전월 대비</th>
                </tr>
              </thead>
              <tbody>
                {linkers.map((l) => {
                  const ch = buildChange(l.revenue, l.prevRevenue, "전월");
                  return (
                    <tr key={l.key} className="border-b last:border-0">
                      <td className="py-2 font-medium">{l.key}</td>
                      <td className="py-2 text-right tabular-nums">{formatInt(l.customers)}개</td>
                      <td className="py-2 text-right tabular-nums">{formatKRWLong(l.revenue)}</td>
                      <td className="py-2 text-right tabular-nums text-muted-foreground">
                        {l.prevRevenue > 0 ? formatKRWLong(l.prevRevenue) : "—"}
                      </td>
                      <td className={`py-2 text-right tabular-nums ${changeCls(ch.direction)}`}>
                        <div>{ch.diffText}</div>
                        <div className="text-[10px]">{ch.pctText}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SourceSection>
      )}
    </div>
  );
}

// ── 소스 섹션 래퍼 ──
function SourceSection({
  title,
  color,
  total,
  children,
}: {
  title: string;
  color: string;
  total: number;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
            {title}
          </CardTitle>
          <Badge variant="muted">이번달 {formatKRWShort(total)}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="font-semibold tabular-nums">{value}</div>
    </div>
  );
}
