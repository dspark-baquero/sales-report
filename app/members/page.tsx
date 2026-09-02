import Link from "next/link";
import { loadFactCube } from "@/lib/load";
import { resolveMonth } from "@/lib/months";
import { loadMembers, isMemberDataAvailable, type MemberStatus } from "@/lib/members-data";
import {
  joinMembers,
  memberKpi,
  gapBuckets,
  dormantCumulative,
  dormantByRep,
  reactivationTargets,
  churnedWithHistory,
  onboardingStalled,
  onboardingCohorts,
  pendingApprovalAging,
  coverageBreakdown,
  statusBreakdown,
  GAP_BUCKETS,
  type GapBucket,
  type MemberJoined,
} from "@/lib/memberAnalysis";
import { computeMembersInsights } from "@/lib/tabInsights";
import { TabInsights } from "@/components/TabInsights";
import { MetricCard } from "@/components/MetricCard";
import { MemberTable, type MemberTableRow } from "@/components/MemberTable";
import { SalesRepFilter } from "@/components/SalesRepFilter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart } from "@/components/charts/BarChart";
import { CustomerLink } from "@/components/CustomerLink";
import { SalesRepLink } from "@/components/SalesRepLink";
import {
  formatKRWLong,
  formatKRWShort,
  formatInt,
  formatCount,
  formatPctAbs,
  formatYM,
  formatYMShort,
} from "@/lib/format";

type SearchParams = Promise<{
  month?: string;
  months?: string;
  bucket?: string;
  rep?: string;
  status?: string;
}>;

// 목록에 넘길 최대 행 수 — DataTable은 client라 행이 그대로 직렬화된다.
// 엑셀 내려받기가 필터 조건 전체를 담아야 해서 상한을 넉넉히 둔다(활성 전체가 2,461개 수준).
const TABLE_LIMIT = 3000;

function toTableRows(rows: MemberJoined[], limit = TABLE_LIMIT): MemberTableRow[] {
  return rows.slice(0, limit).map((r) => ({
    client: r.client,
    tier: r.tier,
    status: r.status,
    salesRep: r.salesRep,
    prevDealer: r.prevDealer,
    gapBucket: r.gapBucket,
    silentMonths: r.silentMonths,
    lastActiveMonth: r.lastActiveMonth,
    last12mRevenue: r.last12mRevenue,
    lifetimeRevenue: r.lifetimeRevenue,
    region: r.region,
    bizTypeLeaf: r.bizTypeLeaf,
    grade: r.grade,
  }));
}

export default async function MembersPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const ym = await resolveMonth(sp.month);
  const available = await isMemberDataAvailable();

  if (!available) {
    return (
      <div className="space-y-6">
        <h2 className="text-xl font-semibold tracking-tight">{formatYM(ym)} 거래처 관리</h2>
        <Card>
          <CardHeader>
            <CardTitle>거래처 목록 데이터를 불러올 수 없습니다</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>
              거래처 회원 목록은 Google Sheets 기반 BigQuery 외부 테이블에서 읽습니다. 조회
              권한이 없으면 이 탭만 비활성화되고 다른 탭은 정상 동작합니다 (로컬 개발 환경에서는
              정상).
            </p>
            <p className="text-xs">
              로컬에서 확인하려면 Drive 읽기 권한을 포함해 다시 인증하세요:
              <code className="block mt-1 px-2 py-1 rounded bg-muted text-[11px]">
                gcloud auth application-default login
                --scopes=https://www.googleapis.com/auth/cloud-platform,https://www.googleapis.com/auth/drive.readonly
              </code>
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const [cube, members] = await Promise.all([loadFactCube(), loadMembers()]);
  const { rows, tierThresholds } = joinMembers(cube, members, ym);

  // 필터 — 기본은 활성·3개월 이상 무매출
  const months = sp.months && ["1", "3", "6", "12"].includes(sp.months) ? Number(sp.months) : 3;
  const bucket = GAP_BUCKETS.includes(sp.bucket as GapBucket)
    ? (sp.bucket as GapBucket)
    : undefined;
  const status = (sp.status as MemberStatus) || "활성";
  const rep = sp.rep && rows.some((r) => r.salesRep === sp.rep) ? sp.rep : undefined;

  // 담당자를 고르면 탭 전체가 그 담당자 범위로 좁혀진다(요약 카드·구간·온보딩·커버리지 포함).
  // 담당자별 비교 표/차트와 필터 목록만 전체(rows) 기준을 유지한다 — 좁힌 상태에서도
  // 다른 담당자로 바로 갈아탈 수 있어야 하고, 1명만 남으면 비교 자체가 의미를 잃는다.
  const scoped = rep ? rows.filter((r) => r.salesRep === rep) : rows;

  const k = memberKpi(scoped);
  const insights = computeMembersInsights(scoped, ym);
  const buckets = gapBuckets(scoped);
  const cumulative = dormantCumulative(scoped);
  const board = dormantByRep(rows);
  const targets = reactivationTargets(scoped, { months, bucket, status });
  const churned = churnedWithHistory(scoped);
  const stalled = onboardingStalled(scoped, ym);
  const cohorts = onboardingCohorts(scoped, ym, 24);
  const approvals = pendingApprovalAging(scoped, ym);
  const regions = coverageBreakdown(scoped, "region");
  const bizTypes = coverageBreakdown(scoped, "bizType");
  const statuses = statusBreakdown(scoped);

  const qs = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    p.set("month", ym);
    if (extra.months ?? String(months)) p.set("months", extra.months ?? String(months));
    const b = "bucket" in extra ? extra.bucket : bucket;
    if (b) p.set("bucket", b);
    const r = "rep" in extra ? extra.rep : rep;
    if (r) p.set("rep", r);
    const s = "status" in extra ? extra.status : status;
    if (s && s !== "활성") p.set("status", s);
    return `/members?${p.toString()}`;
  };

  const filterLabel = [
    bucket ? `무매출 ${bucket}` : `${months}개월 이상 무매출`,
    status !== "활성" ? `상태 ${status}` : null,
    rep ? `담당 ${rep}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">
            {formatYM(ym)} 거래처 관리{" "}
            {rep ? (
              <span className="text-xs text-muted-foreground font-normal ml-1">
                ({rep} 담당 {formatCount(scoped.length)}개 · B2B몰 회원 전체{" "}
                {formatCount(members.length)}개)
              </span>
            ) : (
              <span className="text-xs text-muted-foreground font-normal ml-1">
                (B2B몰 회원 {formatCount(members.length)}개 기준)
              </span>
            )}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            거래가 끊긴 거래처를 담당자별로 추려 재영업에 쓰는 탭입니다 · 수출 거래처 제외
            {rep && " · 담당자별 재영업 현황을 뺀 이 탭 전체가 선택한 담당자 기준입니다"}
          </p>
        </div>
        <SalesRepFilter
          options={board.map((r) => ({
            salesRep: r.salesRep,
            activeCount: r.activeCount,
            dormantCount: r.dormantCount,
          }))}
          current={rep ?? null}
        />
      </div>

      <TabInsights bullets={insights} />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="재영업 대상 (3개월 이상 무매출)"
          current={k.dormant3m}
          unit="raw"
          unitSuffix="개"
          hint={`활성 ${formatCount(k.activeCount)}개 중 ${formatPctAbs(k.activeCount ? k.dormant3m / k.activeCount : 0)}`}
          highlight
        />
        <MetricCard
          label="휴면 거래처 누적 매출"
          current={k.dormantLifetimeRevenue}
          hint="3개월 이상 무매출 거래처들이 과거에 올린 매출 합계"
        />
        <MetricCard
          label="이번달 거래 발생"
          current={k.tradedThisMonth}
          unit="raw"
          unitSuffix="개"
          hint={`매출 이력이 한 번도 없는 활성 거래처 ${formatCount(k.neverTraded)}개`}
        />
        <MetricCard
          label="이탈 회수 대상"
          current={k.churnedRecoverable}
          unit="raw"
          unitSuffix="개"
          hint="비활성이지만 과거 매출 보유 (재가입 완료 제외)"
        />
      </div>

      {/* 무매출 구간 */}
      <Card>
        <CardHeader>
          <CardTitle>무매출 기간별 거래처</CardTitle>
          <div className="text-[11px] text-muted-foreground">
            활성 거래처를 마지막 거래 이후 경과 기간으로 나눈 것 · 구간을 누르면 아래 목록이
            바뀝니다
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
            {buckets.map((b) => {
              const activeSel = bucket === b.bucket;
              const normal = b.bucket === "거래중" || b.bucket === "1~2개월";
              return (
                <Link
                  key={b.bucket}
                  href={qs({ bucket: activeSel ? undefined : b.bucket })}
                  className={`rounded-lg border p-3 transition-colors ${
                    activeSel ? "border-primary bg-muted" : "hover:bg-muted/50"
                  }`}
                >
                  <div className="text-[11px] text-muted-foreground">{b.bucket}</div>
                  <div className="text-lg font-semibold tabular-nums">{formatInt(b.count)}개</div>
                  <div className="text-[10px] text-muted-foreground">
                    {normal ? "정상 주기" : `누적 ${formatKRWShort(b.lifetimeRevenue)}`}
                  </div>
                </Link>
              );
            })}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-muted-foreground border-b">
                  <th className="py-2">누적 기준</th>
                  <th className="py-2 text-right">거래처 수</th>
                  <th className="py-2 text-right">과거 매출 보유</th>
                  <th className="py-2 text-right">거래 이력 없음</th>
                  <th className="py-2 text-right">과거 누적 매출</th>
                </tr>
              </thead>
              <tbody>
                {cumulative.map((c) => (
                  <tr key={c.months} className="border-b last:border-0">
                    <td className="py-2">
                      <Link
                        href={qs({ months: String(c.months), bucket: undefined })}
                        className={`hover:underline ${months === c.months && !bucket ? "font-semibold" : ""}`}
                      >
                        {c.label}
                      </Link>
                    </td>
                    <td className="py-2 text-right tabular-nums">{formatInt(c.count)}</td>
                    <td className="py-2 text-right tabular-nums">{formatInt(c.withHistory)}</td>
                    <td className="py-2 text-right tabular-nums text-muted-foreground">
                      {formatInt(c.neverTraded)}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {formatKRWLong(c.lifetimeRevenue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* 재영업 우선순위 목록 */}
      <Card>
        <CardHeader>
          <div className="flex items-baseline justify-between gap-2 flex-wrap">
            <CardTitle>재영업 우선순위 목록</CardTitle>
            {(bucket || rep || status !== "활성") && (
              <Link href={qs({ bucket: undefined, rep: undefined, status: "활성" })} className="text-[11px] text-muted-foreground hover:underline">
                필터 해제
              </Link>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {filterLabel} · 조건 충족 {formatCount(targets.length)}개
            {targets.length > TABLE_LIMIT && ` 중 누적 매출 상위 ${TABLE_LIMIT}개 표시`}
            {" · "}
            등급 S ≥ {formatKRWShort(tierThresholds.s)} · A ≥ {formatKRWShort(tierThresholds.a)} · B
            ≥ {formatKRWShort(tierThresholds.b)} (누적 매출 기준 상위 5%/20%/50%)
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="px-4 pb-4">
            <MemberTable
              rows={toTableRows(targets)}
              ym={ym}
              downloadName={`재영업목록_${ym}${rep ? `_${rep}` : ""}${bucket ? `_${bucket}` : `_${months}개월이상`}.csv`}
            />
          </div>
        </CardContent>
      </Card>

      {/* 담당자별 */}
      <Card>
        <CardHeader>
          <CardTitle>담당자별 재영업 현황</CardTitle>
          <div className="text-[11px] text-muted-foreground">
            담당자명을 누르면 탭 전체가 해당 담당자로 좁혀집니다 · 3개월 이상 무매출 기준 · 이
            표만 항상 전체 담당자를 보여줍니다(담당자 전환용)
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <BarChart
            categories={board.map((r) => r.salesRep)}
            series={[
              {
                name: "거래중",
                values: board.map((r) => r.buckets["거래중"] + r.buckets["1~2개월"]),
                color: "#10b981",
                stack: "rep",
              },
              {
                name: "3~5개월",
                values: board.map((r) => r.buckets["3~5개월"]),
                color: "#f59e0b",
                stack: "rep",
              },
              {
                name: "6~11개월",
                values: board.map((r) => r.buckets["6~11개월"]),
                color: "#f97316",
                stack: "rep",
              },
              {
                name: "12개월+",
                values: board.map((r) => r.buckets["12개월+"]),
                color: "#e11d48",
                stack: "rep",
              },
              {
                name: "거래 이력 없음",
                values: board.map((r) => r.buckets["이력없음"]),
                color: "#94a3b8",
                stack: "rep",
              },
            ]}
            height={Math.max(260, board.length * 34)}
            horizontal
            yLabel="거래처 수"
            valueFormat="count"
          />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-muted-foreground border-b">
                  <th className="py-2">담당자</th>
                  <th className="py-2 text-right">담당 활성</th>
                  <th className="py-2 text-right">무매출</th>
                  <th className="py-2 text-right">무매출 비율</th>
                  <th className="py-2 text-right">우선 연락(S·A)</th>
                  <th className="py-2 text-right">휴면 누적 매출</th>
                </tr>
              </thead>
              <tbody>
                {board.map((r) => (
                  <tr
                    key={r.salesRep}
                    className={`border-b last:border-0 ${rep === r.salesRep ? "bg-muted" : ""}`}
                  >
                    <td className="py-2 font-medium">
                      <Link
                        href={qs({ rep: rep === r.salesRep ? undefined : r.salesRep })}
                        className={`hover:underline ${rep === r.salesRep ? "font-semibold text-primary" : ""}`}
                      >
                        {r.salesRep}
                      </Link>
                    </td>
                    <td className="py-2 text-right tabular-nums">{formatInt(r.activeCount)}</td>
                    <td className="py-2 text-right tabular-nums">{formatInt(r.dormantCount)}</td>
                    <td
                      className={`py-2 text-right tabular-nums ${r.dormantRate >= 0.8 ? "text-rose-700" : r.dormantRate >= 0.6 ? "text-amber-600" : "text-muted-foreground"}`}
                    >
                      {formatPctAbs(r.dormantRate)}
                    </td>
                    <td className="py-2 text-right tabular-nums font-medium">
                      {formatInt(r.tierSA)}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {formatKRWLong(r.dormantLifetimeRevenue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* 온보딩 */}
      <Card>
        <CardHeader>
          <CardTitle>신규 가입 첫 주문 전환</CardTitle>
          <div className="text-[11px] text-muted-foreground">
            가입월 또는 그 다음 달 안에 첫 주문이 있으면 전환으로 봅니다 (매출 데이터가 월 단위라
            일 단위 계산은 하지 않습니다) · 최근 24개월 가입분
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <BarChart
            categories={cohorts.map((c) => formatYMShort(c.joinYM))}
            series={[
              {
                name: "전환",
                values: cohorts.map((c) => c.converted),
                color: "#10b981",
                stack: "cohort",
              },
              {
                name: "미전환",
                values: cohorts.map((c) => c.joined - c.converted),
                color: "#fca5a5",
                stack: "cohort",
              },
            ]}
            height={260}
            yLabel="가입 거래처 수"
            valueFormat="count"
            showStackTotals
          />
          <div className="text-[11px] text-muted-foreground">
            전환 실패 대기열 {formatCount(stalled.length)}개 — 가입 후 다음 달까지 첫 주문이 없는
            활성·승인전 거래처
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-muted-foreground border-b">
                  <th className="py-2">거래처</th>
                  <th className="py-2">담당자</th>
                  <th className="py-2">상태</th>
                  <th className="py-2">지역 · 사업형태</th>
                  <th className="py-2 text-right">가입일</th>
                </tr>
              </thead>
              <tbody>
                {stalled.slice(0, 15).map((r) => (
                  <tr key={`${r.memberId}-${r.client}`} className="border-b last:border-0">
                    <td className="py-2 font-medium">
                      <CustomerLink customer={r.client} ym={ym} />
                    </td>
                    <td className="py-2">
                      <SalesRepLink rep={r.salesRep} ym={ym} />
                    </td>
                    <td className="py-2">
                      <Badge variant={r.status === "활성" ? "positive" : "warn"}>{r.status}</Badge>
                    </td>
                    <td className="py-2 text-muted-foreground text-xs">
                      {r.region || "미입력"} · {r.bizTypeLeaf}
                    </td>
                    <td className="py-2 text-right tabular-nums text-muted-foreground">
                      {r.joinedAt ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* 이탈 회수 */}
      <Card>
        <CardHeader>
          <CardTitle>이탈 고객 회수 후보</CardTitle>
          <div className="text-[11px] text-muted-foreground">
            비활성 상태지만 과거 매출이 있던 거래처 {formatCount(churned.length)}개 · 같은 상호로
            활성 계정이 이미 있으면 &quot;재가입 완료&quot;로 표시
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="px-4 pb-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-muted-foreground border-b">
                  <th className="py-2">거래처</th>
                  <th className="py-2">담당자</th>
                  <th className="py-2">마지막 거래</th>
                  <th className="py-2 text-right">누적 매출</th>
                  <th className="py-2">비고</th>
                </tr>
              </thead>
              <tbody>
                {churned.slice(0, 20).map((r) => (
                  <tr key={`${r.memberId}-${r.client}`} className="border-b last:border-0">
                    <td className="py-2 font-medium">
                      <CustomerLink customer={r.client} ym={ym} />
                    </td>
                    <td className="py-2">
                      <SalesRepLink rep={r.salesRep} ym={ym} />
                    </td>
                    <td className="py-2 tabular-nums text-muted-foreground">
                      {r.lastActiveMonth ? formatYMShort(r.lastActiveMonth) : "—"}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {formatKRWLong(r.lifetimeRevenue)}
                    </td>
                    <td className="py-2">
                      {r.hasActiveDuplicate ? (
                        <Badge variant="muted">재가입 완료</Badge>
                      ) : (
                        <Badge variant="info">연락 대상</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* 승인전 적체 */}
      <Card>
        <CardHeader>
          <CardTitle>승인전 적체</CardTitle>
          <div className="text-[11px] text-muted-foreground">
            가입 신청 후 경과 기간별 · 과거 매출 이력이 있는 건은 재가입으로 추정되며 승인 처리만
            하면 거래가 재개됩니다
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="px-4 pb-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-muted-foreground border-b">
                  <th className="py-2">경과 기간</th>
                  <th className="py-2 text-right">건수</th>
                  <th className="py-2 text-right">과거 매출 보유</th>
                  <th className="py-2">해석</th>
                </tr>
              </thead>
              <tbody>
                {approvals
                  .filter((b) => b.rows.length > 0)
                  .map((b) => (
                    <tr key={b.bucket} className="border-b last:border-0">
                      <td className="py-2 font-medium">{b.bucket}</td>
                      <td className="py-2 text-right tabular-nums">{formatInt(b.rows.length)}</td>
                      <td className="py-2 text-right tabular-nums font-medium">
                        {formatInt(b.withHistory)}
                      </td>
                      <td className="py-2 text-xs text-muted-foreground">
                        {b.bucket === "30일 이내" || b.bucket === "30~90일"
                          ? "처리 대기 — 승인 여부 확인 필요"
                          : b.withHistory > 0
                            ? "장기 적체 — 매출 이력 보유 건은 승인 검토, 나머지는 반려 정리"
                            : "장기 적체 — 반려 정리 대상"}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* 커버리지 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>지역별 커버리지</CardTitle>
            <div className="text-[11px] text-muted-foreground">
              활성 거래처 대비 최근 12개월 거래 발생 비율 · 방문 동선 계획용
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="px-4 pb-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] text-muted-foreground border-b">
                    <th className="py-2">지역</th>
                    <th className="py-2 text-right">활성</th>
                    <th className="py-2 text-right">거래 발생</th>
                    <th className="py-2 text-right">비율</th>
                    <th className="py-2 text-right">12개월 매출</th>
                  </tr>
                </thead>
                <tbody>
                  {regions.slice(0, 10).map((r) => (
                    <tr key={r.key} className="border-b last:border-0">
                      <td className="py-2 font-medium">{r.key}</td>
                      <td className="py-2 text-right tabular-nums">{formatInt(r.total)}</td>
                      <td className="py-2 text-right tabular-nums">{formatInt(r.traded12m)}</td>
                      <td className="py-2 text-right tabular-nums">{formatPctAbs(r.rate)}</td>
                      <td className="py-2 text-right tabular-nums text-muted-foreground">
                        {formatKRWShort(r.revenue12m)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>사업형태별 커버리지</CardTitle>
            <div className="text-[11px] text-muted-foreground">
              회원 목록의 사업형태 기준 · 미기재는 &quot;미입력&quot;
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="px-4 pb-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] text-muted-foreground border-b">
                    <th className="py-2">사업형태</th>
                    <th className="py-2 text-right">활성</th>
                    <th className="py-2 text-right">거래 발생</th>
                    <th className="py-2 text-right">비율</th>
                    <th className="py-2 text-right">12개월 매출</th>
                  </tr>
                </thead>
                <tbody>
                  {bizTypes.slice(0, 10).map((r) => (
                    <tr key={r.key} className="border-b last:border-0">
                      <td className="py-2 font-medium text-xs">{r.key}</td>
                      <td className="py-2 text-right tabular-nums">{formatInt(r.total)}</td>
                      <td className="py-2 text-right tabular-nums">{formatInt(r.traded12m)}</td>
                      <td className="py-2 text-right tabular-nums">{formatPctAbs(r.rate)}</td>
                      <td className="py-2 text-right tabular-nums text-muted-foreground">
                        {formatKRWShort(r.revenue12m)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 상태 분포 */}
      <Card>
        <CardHeader>
          <CardTitle>회원 상태 분포</CardTitle>
          <div className="text-[11px] text-muted-foreground">
            삭제 · 거래중단 · 일시중지는 재영업 대상에서 제외됩니다. 상태를 누르면 해당 상태로
            목록을 볼 수 있습니다
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="px-4 pb-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-muted-foreground border-b">
                  <th className="py-2">상태</th>
                  <th className="py-2 text-right">거래처 수</th>
                  <th className="py-2 text-right">과거 매출 보유</th>
                  <th className="py-2 text-right">거래 이력 없음</th>
                  <th className="py-2 text-right">누적 매출</th>
                  <th className="py-2">재영업</th>
                </tr>
              </thead>
              <tbody>
                {statuses.map((s) => (
                  <tr key={s.status} className="border-b last:border-0">
                    <td className="py-2 font-medium">
                      <Link href={qs({ status: s.status, rep: undefined })} className="hover:underline">
                        {s.status}
                      </Link>
                    </td>
                    <td className="py-2 text-right tabular-nums">{formatInt(s.count)}</td>
                    <td className="py-2 text-right tabular-nums">{formatInt(s.withHistory)}</td>
                    <td className="py-2 text-right tabular-nums text-muted-foreground">
                      {formatInt(s.neverTraded)}
                    </td>
                    <td className="py-2 text-right tabular-nums text-muted-foreground">
                      {formatKRWLong(s.lifetimeRevenue)}
                    </td>
                    <td className="py-2">
                      {s.excluded ? (
                        <Badge variant="muted">제외</Badge>
                      ) : s.status === "활성" ? (
                        <Badge variant="positive">대상</Badge>
                      ) : (
                        <Badge variant="info">참고</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
