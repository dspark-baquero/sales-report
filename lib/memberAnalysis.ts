// 거래처 목록(members) × 매출 큐브 결합 분석 — 재영업 대상 식별.
//
// 매출 데이터만으로는 "거래가 끊긴 거래처"가 보이지 않는다. 회원 목록과 조인해야
// 활성 상태인데 주문이 없는 거래처가 드러난다.
// 조인 키는 상호명(client) 그대로 — 정규화 없이 96% 일치(B2B몰 1,967곳 중 1,892곳).
// 괄호 안 지점명은 절대 지우지 않는다. "OO의원(강남)"과 "OO의원(분당)"은 다른 거래처이고,
// 병합하면 한쪽이 "매출 있음"으로 잘못 판정되어 재영업 대상에서 부당하게 빠진다.
//
// 큐브는 customerActivityStats로 단일 패스만 훑는다(CLAUDE.md §4).

import type { FactCube } from "./facts";
import { customerActivityStats } from "./accountAnalysis";
import { enumerateMonths } from "./aggregate";
import { UNASSIGNED_REP, type Category } from "@/config/mappings";
import type { Member, MemberStatus } from "./members-data";

// 재영업 대상 상태. 나머지(삭제/거래중단/일시중지)는 상태 분포에서만 집계(사용자 확정).
export const REACTIVATION_STATUS: MemberStatus = "활성";
export const EXCLUDED_STATUSES = new Set<MemberStatus>([
  "삭제",
  "거래중단",
  "기타 일시중지",
  "미결제 일시중지",
]);

// 무매출 기간 구간. 누적("3개월 이상")과 달리 서로 겹치지 않는다.
// 3~5개월 구간이 관계가 살아 있어 회수 확률이 가장 높은 코호트인데,
// 누적으로만 보면 1,846곳 안에 묻혀 보이지 않는다.
export const GAP_BUCKETS = [
  "거래중",
  "1~2개월",
  "3~5개월",
  "6~11개월",
  "12개월+",
  "이력없음",
] as const;
export type GapBucket = (typeof GAP_BUCKETS)[number];

// 마지막 거래로부터 멀어질수록 회수 확률이 낮다는 가정의 계수.
const RECOVERY_FACTOR: Record<GapBucket, number> = {
  거래중: 0,
  "1~2개월": 1,
  "3~5개월": 0.8,
  "6~11개월": 0.5,
  "12개월+": 0.25,
  이력없음: 0,
};

export type PriorityTier = "S" | "A" | "B" | "C" | "-";

export type MemberJoined = Member & {
  firstActiveMonth: string | null;
  lastActiveMonth: string | null; // null = 매출 이력 전무
  silentMonths: number | null; // 기준월 기준 무매출 개월. 0 = 이번달 거래 있음
  gapBucket: GapBucket;
  activeMonths: number;
  lifetimeRevenue: number;
  last12mRevenue: number;
  avgMonthlyWhenActive: number; // 매출이 있었던 달만 분모
  recoveryValue: number; // 3개월치 기대 회수액 × 회복계수
  tier: PriorityTier;
  prevDealer: string | null; // 매출 데이터상 최근 딜러가 현재 담당과 다를 때만
  b2bType: string | null;
  salesCategory: Category | null; // 매출 데이터상 대분류. 수출 거래처가 섞여 들어오는지 진단
  hasActiveDuplicate: boolean; // 같은 상호로 활성 계정이 따로 있음(재가입 완료)
};

export type MemberJoinResult = {
  rows: MemberJoined[];
  tierThresholds: { s: number; a: number; b: number }; // 범례에 실제 금액 표기용
};

function monthDiff(fromYM: string, toYM: string): number {
  const [fy, fm] = fromYM.split("-").map(Number);
  const [ty, tm] = toYM.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

function bucketOf(silentMonths: number | null): GapBucket {
  if (silentMonths === null) return "이력없음";
  if (silentMonths === 0) return "거래중";
  if (silentMonths <= 2) return "1~2개월";
  if (silentMonths <= 5) return "3~5개월";
  if (silentMonths <= 11) return "6~11개월";
  return "12개월+";
}

// 상위 5% / 20% / 50% 분위수. 고정 금액을 박으면 데이터가 바뀔 때 어긋나므로
// 런타임 분위수로 두고 범례에 실제 금액을 표기한다.
function quantiles(values: number[]): { s: number; a: number; b: number } {
  const sorted = values.filter((v) => v > 0).sort((x, y) => y - x);
  if (sorted.length === 0) return { s: 0, a: 0, b: 0 };
  const at = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
  return { s: at(0.05), a: at(0.2), b: at(0.5) };
}

export function joinMembers(
  cube: FactCube,
  members: Member[],
  ym: string,
): MemberJoinResult {
  const stats = customerActivityStats(cube, ym);

  // 같은 상호로 활성 계정이 따로 있는지 — 비활성 목록에서 "재가입 완료"를 걸러낸다.
  const activeNames = new Set(
    members.filter((m) => m.status === REACTIVATION_STATUS).map((m) => m.client),
  );

  const base = members.map((m) => {
    const st = stats.get(m.client);
    const last = st?.lastActiveMonth ?? null;
    const silentMonths = last ? monthDiff(last, ym) : null;
    const activeMonths = st?.activeMonths ?? 0;
    const lifetimeRevenue = st?.totalRevenue ?? 0;
    const avgMonthlyWhenActive = activeMonths > 0 ? lifetimeRevenue / activeMonths : 0;
    const gapBucket = bucketOf(silentMonths);
    const dealer = cube.customerToLatestDealer.get(m.client) ?? null;
    return {
      ...m,
      firstActiveMonth: st?.firstActiveMonth ?? null,
      lastActiveMonth: last,
      silentMonths,
      gapBucket,
      activeMonths,
      lifetimeRevenue,
      last12mRevenue: st?.last12mRevenue ?? 0,
      avgMonthlyWhenActive,
      recoveryValue: avgMonthlyWhenActive * 3 * RECOVERY_FACTOR[gapBucket],
      tier: "-" as PriorityTier,
      prevDealer: dealer && dealer !== m.salesRep ? dealer : null,
      b2bType: cube.customerToB2bType.get(m.client) ?? null,
      salesCategory: cube.customerToCategory.get(m.client) ?? null,
      hasActiveDuplicate: m.status !== REACTIVATION_STATUS && activeNames.has(m.client),
    };
  });

  // 등급은 재영업 대상(활성·국내·회수 기대값 > 0) 안에서의 상대 순위로 매긴다.
  const th = quantiles(
    base
      .filter((r) => r.status === REACTIVATION_STATUS && r.salesCategory !== "수출")
      .map((r) => r.recoveryValue),
  );
  for (const r of base) {
    if (r.recoveryValue <= 0) continue;
    r.tier =
      r.recoveryValue >= th.s ? "S" : r.recoveryValue >= th.a ? "A" : r.recoveryValue >= th.b ? "B" : "C";
  }

  return { rows: base, tierThresholds: th };
}

// ── 무매출 구간 ──────────────────────────────────────────
export type GapBucketRow = {
  bucket: GapBucket;
  count: number;
  lifetimeRevenue: number;
  recoveryValue: number;
};

export function gapBuckets(
  rows: MemberJoined[],
  status: MemberStatus = REACTIVATION_STATUS,
): GapBucketRow[] {
  const target = rows.filter((r) => r.status === status);
  return GAP_BUCKETS.map((bucket) => {
    const g = target.filter((r) => r.gapBucket === bucket);
    return {
      bucket,
      count: g.length,
      lifetimeRevenue: g.reduce((s, r) => s + r.lifetimeRevenue, 0),
      recoveryValue: g.reduce((s, r) => s + r.recoveryValue, 0),
    };
  });
}

// 사용자 요청 원문 기준 — 최근 1/3/6/12개월 무매출(누적).
export const CUMULATIVE_PERIODS = [1, 3, 6, 12] as const;

export type CumulativeRow = {
  months: number;
  label: string;
  count: number;
  withHistory: number;
  neverTraded: number;
  lifetimeRevenue: number;
  recoveryValue: number;
};

export function dormantCumulative(
  rows: MemberJoined[],
  status: MemberStatus = REACTIVATION_STATUS,
): CumulativeRow[] {
  const target = rows.filter((r) => r.status === status);
  return CUMULATIVE_PERIODS.map((months) => {
    const g = target.filter((r) => r.silentMonths === null || r.silentMonths >= months);
    return {
      months,
      label: `${months}개월 이상 무매출`,
      count: g.length,
      withHistory: g.filter((r) => r.lastActiveMonth !== null).length,
      neverTraded: g.filter((r) => r.lastActiveMonth === null).length,
      lifetimeRevenue: g.reduce((s, r) => s + r.lifetimeRevenue, 0),
      recoveryValue: g.reduce((s, r) => s + r.recoveryValue, 0),
    };
  });
}

// 재영업 우선순위 목록 — 회수 기대값 큰 순.
// 활성·3개월 무매출 1,102곳 중 상위 50곳이 누적의 절반을 차지한다. 정렬이 곧 실행 순서다.
export function reactivationTargets(
  rows: MemberJoined[],
  opts?: {
    months?: number; // 기본 3개월 이상 무매출
    bucket?: GapBucket;
    status?: MemberStatus;
    salesRep?: string;
  },
): MemberJoined[] {
  const months = opts?.months ?? 3;
  const status = opts?.status ?? REACTIVATION_STATUS;
  return rows
    .filter((r) => r.status === status)
    // 회원 목록은 B2B몰 가입 거래처다. 수출 거래처가 상호명으로 조인되는 경우가 있는데
    // 해외 영업 대상이라 재영업 목록에 섞이면 안 된다(매출 이력이 없어 분류 불명인 곳은 유지).
    .filter((r) => r.salesCategory !== "수출")
    .filter((r) => !opts?.salesRep || r.salesRep === opts.salesRep)
    .filter((r) =>
      opts?.bucket
        ? r.gapBucket === opts.bucket
        : r.silentMonths === null || r.silentMonths >= months,
    )
    .sort((a, b) => b.recoveryValue - a.recoveryValue || b.lifetimeRevenue - a.lifetimeRevenue);
}

// ── 담당자별 재영업 보드 ─────────────────────────────────
export type RepDormantRow = {
  salesRep: string;
  activeCount: number;
  dormantCount: number;
  dormantRate: number;
  recoveryValue: number;
  tierSA: number; // S+A 등급 건수 — 실제로 먼저 연락할 대상 수
  tradedRecently: number;
  buckets: Record<GapBucket, number>;
};

export function dormantByRep(rows: MemberJoined[], months = 3): RepDormantRow[] {
  const m = new Map<string, RepDormantRow>();
  for (const r of rows) {
    if (r.status !== REACTIVATION_STATUS) continue;
    let cur = m.get(r.salesRep);
    if (!cur) {
      cur = {
        salesRep: r.salesRep,
        activeCount: 0,
        dormantCount: 0,
        dormantRate: 0,
        recoveryValue: 0,
        tierSA: 0,
        tradedRecently: 0,
        buckets: Object.fromEntries(GAP_BUCKETS.map((b) => [b, 0])) as Record<GapBucket, number>,
      };
      m.set(r.salesRep, cur);
    }
    cur.activeCount += 1;
    cur.buckets[r.gapBucket] += 1;
    const dormant = r.silentMonths === null || r.silentMonths >= months;
    if (dormant) {
      cur.dormantCount += 1;
      cur.recoveryValue += r.recoveryValue;
      if (r.tier === "S" || r.tier === "A") cur.tierSA += 1;
    } else {
      cur.tradedRecently += 1;
    }
  }
  return [...m.values()]
    .map((r) => ({ ...r, dormantRate: r.activeCount > 0 ? r.dormantCount / r.activeCount : 0 }))
    .sort((a, b) => {
      if (a.salesRep === UNASSIGNED_REP) return 1; // 미지정은 항상 맨 아래
      if (b.salesRep === UNASSIGNED_REP) return -1;
      return b.dormantCount - a.dormantCount;
    });
}

// ── 온보딩 전환 ──────────────────────────────────────────
// 큐브는 월 단위라 "가입 후 30일"을 정확히 계산할 수 없다(가입 8/25, 첫 주문 9/2).
// "가입월 또는 익월 안에 첫 주문"으로 정의하고 화면 라벨도 그대로 쓴다.
// 실측상 첫 주문까지 중앙값 1일 / 30일 내 84%라 월 단위 근사로도 신호는 살아난다.
export function isOnboardingConverted(r: MemberJoined): boolean {
  if (!r.joinedAt || !r.firstActiveMonth) return false;
  const joinYM = r.joinedAt.slice(0, 7);
  return monthDiff(joinYM, r.firstActiveMonth) <= 1;
}

// 전환 실패 대기열 — 가입 익월이 지나도록 첫 주문이 없는 활성/승인전 거래처.
export function onboardingStalled(rows: MemberJoined[], ym: string): MemberJoined[] {
  return rows
    .filter((r) => r.status === REACTIVATION_STATUS || r.status === "승인전")
    .filter((r) => r.lastActiveMonth === null && !!r.joinedAt)
    .filter((r) => monthDiff(r.joinedAt!.slice(0, 7), ym) >= 2)
    .sort((a, b) => (b.joinedAt ?? "").localeCompare(a.joinedAt ?? ""));
}

export type OnboardingCohort = {
  joinYM: string;
  joined: number;
  converted: number;
  conversionRate: number;
};

// 최근 N개월 가입 코호트만. 2020년 2,121곳은 초기 일괄 이관이라 넣으면 추이가 왜곡된다.
export function onboardingCohorts(
  rows: MemberJoined[],
  ym: string,
  months = 24,
): OnboardingCohort[] {
  const [y, m] = ym.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1 - (months - 1), 1));
  const fromYM = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`;
  const list = enumerateMonths(fromYM, ym);
  const idx = new Map(list.map((mm, i) => [mm, i]));
  const out: OnboardingCohort[] = list.map((joinYM) => ({
    joinYM,
    joined: 0,
    converted: 0,
    conversionRate: 0,
  }));
  for (const r of rows) {
    if (!r.joinedAt) continue;
    const i = idx.get(r.joinedAt.slice(0, 7));
    if (i === undefined) continue;
    out[i].joined += 1;
    if (isOnboardingConverted(r)) out[i].converted += 1;
  }
  return out.map((c) => ({
    ...c,
    conversionRate: c.joined > 0 ? c.converted / c.joined : 0,
  }));
}

// ── 이탈 고객 회수 ───────────────────────────────────────
// 비활성이지만 과거 매출 이력이 있는 거래처. 단 같은 상호로 활성 계정이 이미 있으면
// 재가입이 끝난 것이므로 연락 대상이 아니다(사용자가 말한 "재가입하는 경우").
export function churnedWithHistory(rows: MemberJoined[]): MemberJoined[] {
  return rows
    .filter((r) => r.status === "비활성" && r.lastActiveMonth !== null)
    .sort((a, b) => {
      if (a.hasActiveDuplicate !== b.hasActiveDuplicate) return a.hasActiveDuplicate ? 1 : -1;
      return b.lifetimeRevenue - a.lifetimeRevenue;
    });
}

// ── 승인전 적체 ──────────────────────────────────────────
// 1년 초과가 74%(143/192) — 사실상 반려된 건이다. 실제 처리 대기는 상위 두 구간.
// 매출 이력이 있는 47곳은 재가입 추정이라 승인만 하면 즉시 거래 가능.
export const APPROVAL_BUCKETS = [
  "30일 이내",
  "30~90일",
  "90일~1년",
  "1년 초과",
  "가입일 불명",
] as const;
export type ApprovalBucket = (typeof APPROVAL_BUCKETS)[number];

export function pendingApprovalAging(
  rows: MemberJoined[],
  ym: string,
): { bucket: ApprovalBucket; rows: MemberJoined[]; withHistory: number }[] {
  const asOf = new Date(`${ym}-01T00:00:00Z`);
  asOf.setUTCMonth(asOf.getUTCMonth() + 1); // 기준월 말일 다음날
  const groups = new Map<ApprovalBucket, MemberJoined[]>(
    APPROVAL_BUCKETS.map((b) => [b, [] as MemberJoined[]]),
  );
  for (const r of rows) {
    if (r.status !== "승인전") continue;
    let bucket: ApprovalBucket = "가입일 불명";
    if (r.joinedAt) {
      const days = Math.floor(
        (asOf.getTime() - new Date(`${r.joinedAt}T00:00:00Z`).getTime()) / 86_400_000,
      );
      bucket =
        days <= 30 ? "30일 이내" : days <= 90 ? "30~90일" : days <= 365 ? "90일~1년" : "1년 초과";
    }
    groups.get(bucket)!.push(r);
  }
  return APPROVAL_BUCKETS.map((bucket) => {
    const list = groups
      .get(bucket)!
      .sort((a, b) => (a.joinedAt ?? "").localeCompare(b.joinedAt ?? ""));
    return {
      bucket,
      rows: list,
      withHistory: list.filter((r) => r.lastActiveMonth !== null).length,
    };
  });
}

// ── 커버리지 ─────────────────────────────────────────────
// 활성 거래처 대비 최근 12개월 거래 발생률. 재영업은 전화·방문이라 지역 밀도가 동선에 쓰인다.
export type CoverageRow = {
  key: string;
  total: number;
  traded12m: number;
  rate: number;
  revenue12m: number;
};

export function coverageBreakdown(
  rows: MemberJoined[],
  by: "region" | "bizType" | "grade",
): CoverageRow[] {
  const m = new Map<string, CoverageRow>();
  for (const r of rows) {
    if (r.status !== REACTIVATION_STATUS) continue;
    // 빈값은 "미입력" — 임의로 "기타"에 넣지 않는다(CLAUDE.md §4)
    const key = (by === "region" ? r.region : by === "bizType" ? r.bizType : r.grade) || "미입력";
    const cur = m.get(key) ?? { key, total: 0, traded12m: 0, rate: 0, revenue12m: 0 };
    cur.total += 1;
    if (r.last12mRevenue > 0) {
      cur.traded12m += 1;
      cur.revenue12m += r.last12mRevenue;
    }
    m.set(key, cur);
  }
  return [...m.values()]
    .map((r) => ({ ...r, rate: r.total > 0 ? r.traded12m / r.total : 0 }))
    .sort((a, b) => b.total - a.total);
}

// ── 상태 분포 ────────────────────────────────────────────
export type StatusRow = {
  status: MemberStatus;
  count: number;
  withHistory: number;
  neverTraded: number;
  lifetimeRevenue: number;
  excluded: boolean; // 재영업 대상에서 제외되는 상태
};

export function statusBreakdown(rows: MemberJoined[]): StatusRow[] {
  const m = new Map<MemberStatus, StatusRow>();
  for (const r of rows) {
    const cur = m.get(r.status) ?? {
      status: r.status,
      count: 0,
      withHistory: 0,
      neverTraded: 0,
      lifetimeRevenue: 0,
      excluded: EXCLUDED_STATUSES.has(r.status),
    };
    cur.count += 1;
    if (r.lastActiveMonth !== null) cur.withHistory += 1;
    else cur.neverTraded += 1;
    cur.lifetimeRevenue += r.lifetimeRevenue;
    m.set(r.status, cur);
  }
  return [...m.values()].sort((a, b) => b.count - a.count);
}

// ── 요약 지표 ────────────────────────────────────────────
export type MemberKpi = {
  activeCount: number;
  tradedThisMonth: number;
  dormant3m: number;
  recoveryValue: number;
  neverTraded: number;
  churnedRecoverable: number;
};

export function memberKpi(rows: MemberJoined[], months = 3): MemberKpi {
  const active = rows.filter((r) => r.status === REACTIVATION_STATUS);
  const dormant = active.filter((r) => r.silentMonths === null || r.silentMonths >= months);
  return {
    activeCount: active.length,
    tradedThisMonth: active.filter((r) => r.silentMonths === 0).length,
    dormant3m: dormant.length,
    recoveryValue: dormant.reduce((s, r) => s + r.recoveryValue, 0),
    neverTraded: active.filter((r) => r.lastActiveMonth === null).length,
    churnedRecoverable: rows.filter(
      (r) => r.status === "비활성" && r.lastActiveMonth !== null && !r.hasActiveDuplicate,
    ).length,
  };
}
