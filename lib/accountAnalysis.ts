// 거래처 심층 분석 — 큐브 기반.
// "지난 분기 상위가 이번달 사라짐", "동면 거래처 복귀", "분기 절벽" 등 임원 시각의 질문에 답.

import type { FactCube } from "./facts";
import {
  cubeCustomerSeries,
  cubeMonthCustomerCells,
  cubeMonthCustomerCellsByCategory,
} from "./facts";
import { ymMinusMonths } from "./aggregate";
import { quarterOf, prevQuarter, prevYearSameMonth } from "./compare";
import type { Category } from "@/config/mappings";

// ── 한 거래처의 시계열 + 추가 통계 ──────────────────────────
export type CustomerTrendPoint = {
  yearMonth: string;
  revenue: number;
  qty: number;
  orders: number;
};

export function customerTrend(
  cube: FactCube,
  customer: string,
  fromYM: string,
  toYM: string,
): CustomerTrendPoint[] {
  return cubeCustomerSeries(cube, customer, fromYM, toYM);
}

// ── 분기 비교 (이번 분기 진행 vs 전년 동분기 동기간) ────────
export type QuarterCompare = {
  current: number;
  prevYear: number;
  diff: number;
  pct: number | null;
  monthsCovered: number;
};

export function customerQuarterCompare(
  cube: FactCube,
  customer: string,
  ym: string,
): QuarterCompare {
  const { qStart } = quarterOf(ym);
  const series = cubeCustomerSeries(cube, customer, qStart, ym);
  const current = series.reduce((s, p) => s + p.revenue, 0);

  // 전년 동분기 동기간
  const [qy, qm] = qStart.split("-").map(Number);
  const [, mNow] = ym.split("-").map(Number);
  const monthsCovered = mNow - qm + 1;
  const pyQStart = `${qy - 1}-${String(qm).padStart(2, "0")}`;
  const pyQEnd = `${qy - 1}-${String(qm + monthsCovered - 1).padStart(2, "0")}`;
  const prevSeries = cubeCustomerSeries(cube, customer, pyQStart, pyQEnd);
  const prevYear = prevSeries.reduce((s, p) => s + p.revenue, 0);

  const diff = current - prevYear;
  const pct = prevYear !== 0 ? diff / Math.abs(prevYear) : null;
  return { current, prevYear, diff, pct, monthsCovered };
}

// YTD 비교
export function customerYtdCompare(
  cube: FactCube,
  customer: string,
  ym: string,
): { ytd: number; prevYtd: number; diff: number; pct: number | null } {
  const [y] = ym.split("-").map(Number);
  const series = cubeCustomerSeries(cube, customer, `${y}-01`, ym);
  const ytd = series.reduce((s, p) => s + p.revenue, 0);
  const prevYm = prevYearSameMonth(ym);
  const prevSeries = cubeCustomerSeries(cube, customer, `${y - 1}-01`, prevYm);
  const prevYtd = prevSeries.reduce((s, p) => s + p.revenue, 0);
  const diff = ytd - prevYtd;
  const pct = prevYtd !== 0 ? diff / Math.abs(prevYtd) : null;
  return { ytd, prevYtd, diff, pct };
}

// ── 동면 → 복귀 감지 ────────────────────────────────────
// 지난 N개월 0원이었는데 이번달 매출 발생 (의미 있는 규모만).
export type SleepingReturnedRow = {
  customer: string;
  returnedRevenue: number;
  silentMonths: number;        // 연속 0원 월 수
  lastActiveMonth: string | null;
};

export function sleepingReturned(
  cube: FactCube,
  ym: string,
  options?: { silentMonths?: number; minRevenue?: number; lookback?: number },
): SleepingReturnedRow[] {
  const silentMonths = options?.silentMonths ?? 3;
  const minRevenue = options?.minRevenue ?? 1_000_000;
  const lookback = options?.lookback ?? 12;

  const curMap = cubeMonthCustomerCells(cube, ym);
  const out: SleepingReturnedRow[] = [];

  // 직전 lookback개월의 월 목록
  const startYM = ymMinusMonths(ym, lookback);
  const months = cube.monthsAsc.filter((m) => m >= startYM && m < ym);

  for (const [cust, cell] of curMap) {
    if (cell.revenue < minRevenue) continue;

    // 직전 silentMonths 개월 모두 0?
    const recentMonths = months.slice(-silentMonths);
    if (recentMonths.length < silentMonths) continue; // 데이터 부족
    let allSilent = true;
    for (const m of recentMonths) {
      const c = cube.byMonthCustomer.get(m)?.get(cust);
      if (c && c.revenue > 0) { allSilent = false; break; }
    }
    if (!allSilent) continue;

    // 마지막 활성 월 + 연속 0원 개월 수 산출
    let lastActive: string | null = null;
    let silent = 0;
    for (let i = months.length - 1; i >= 0; i--) {
      const m = months[i];
      const c = cube.byMonthCustomer.get(m)?.get(cust);
      if (c && c.revenue > 0) { lastActive = m; break; }
      silent++;
    }

    out.push({
      customer: cust,
      returnedRevenue: cell.revenue,
      silentMonths: silent,
      lastActiveMonth: lastActive,
    });
  }

  return out.sort((a, b) => b.returnedRevenue - a.returnedRevenue);
}

// ── 분기 절벽 감지 ──────────────────────────────────────
// 지난 분기 상위 N 거래처 중 이번 분기 누적이 -X% 이상 하락한 거래처.
export type QuarterCliffRow = {
  customer: string;
  prevQuarterRevenue: number;
  curQuarterAccum: number;
  diff: number;
  pct: number;
  prevRank: number;
};

export function quarterlyCliff(
  cube: FactCube,
  ym: string,
  options?: { topN?: number; dropThreshold?: number },
): QuarterCliffRow[] {
  const topN = options?.topN ?? 30;
  const dropThreshold = options?.dropThreshold ?? -0.4;

  const { qStart } = quarterOf(ym);
  const prevQ = prevQuarter(ym);

  // 지난 분기 상위 N
  const prevQMap = new Map<string, number>();
  for (const m of cube.monthsAsc) {
    if (m < prevQ.qStart || m > prevQ.qEnd) continue;
    const month = cube.byMonthCustomer.get(m);
    if (!month) continue;
    for (const [c, cell] of month) {
      prevQMap.set(c, (prevQMap.get(c) ?? 0) + cell.revenue);
    }
  }
  const ranked = [...prevQMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN);

  // 이번 분기 진행분 누적
  const out: QuarterCliffRow[] = [];
  for (let i = 0; i < ranked.length; i++) {
    const [cust, prevRev] = ranked[i];
    if (prevRev <= 0) continue;
    let curAccum = 0;
    for (const m of cube.monthsAsc) {
      if (m < qStart || m > ym) continue;
      curAccum += cube.byMonthCustomer.get(m)?.get(cust)?.revenue ?? 0;
    }
    // 진행률 보정: 이번 분기 N개월 진행 vs 지난 분기 3개월 합
    const progress = monthsBetween(qStart, ym) + 1;
    const prevProrate = (prevRev * progress) / 3;
    const diff = curAccum - prevProrate;
    const pct = prevProrate > 0 ? diff / prevProrate : 0;
    if (pct <= dropThreshold) {
      out.push({
        customer: cust,
        prevQuarterRevenue: prevRev,
        curQuarterAccum: curAccum,
        diff,
        pct,
        prevRank: i + 1,
      });
    }
  }
  return out.sort((a, b) => a.pct - b.pct);
}

function monthsBetween(fromYM: string, toYM: string): number {
  const [fy, fm] = fromYM.split("-").map(Number);
  const [ty, tm] = toYM.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

// ── 상실된 핵심 거래처 ────────────────────────────────────
// 지난 분기 또는 작년 동월 상위 N 거래처인데 이번달 0원.
export type LostKeyAccountRow = {
  customer: string;
  baselineRevenue: number;
  baselineRank: number;
  baselineLabel: string;       // "지난 분기" / "작년 동월"
  lastSeenMonth: string | null;
};

export function lostKeyAccounts(
  cube: FactCube,
  ym: string,
  options?: { lookback?: "quarter" | "year"; topN?: number },
): LostKeyAccountRow[] {
  const lookback = options?.lookback ?? "quarter";
  const topN = options?.topN ?? 10;

  const baseline = new Map<string, number>();
  let baselineLabel = "";
  if (lookback === "quarter") {
    const prevQ = prevQuarter(ym);
    for (const m of cube.monthsAsc) {
      if (m < prevQ.qStart || m > prevQ.qEnd) continue;
      for (const [c, cell] of cube.byMonthCustomer.get(m) ?? new Map()) {
        baseline.set(c, (baseline.get(c) ?? 0) + (cell as { revenue: number }).revenue);
      }
    }
    baselineLabel = "지난 분기";
  } else {
    const py = prevYearSameMonth(ym);
    for (const [c, cell] of cube.byMonthCustomer.get(py) ?? new Map()) {
      baseline.set(c, (cell as { revenue: number }).revenue);
    }
    baselineLabel = "작년 동월";
  }

  const ranked = [...baseline.entries()]
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN);

  const curMap = cubeMonthCustomerCells(cube, ym);

  const out: LostKeyAccountRow[] = [];
  for (let i = 0; i < ranked.length; i++) {
    const [cust, rev] = ranked[i];
    const cur = curMap.get(cust);
    if (cur && cur.revenue > 0) continue; // 살아있음
    // 마지막 활성 월
    let lastActive: string | null = null;
    for (let j = cube.monthsAsc.length - 1; j >= 0; j--) {
      const m = cube.monthsAsc[j];
      if (m >= ym) continue;
      const c = cube.byMonthCustomer.get(m)?.get(cust);
      if (c && c.revenue > 0) { lastActive = m; break; }
    }
    out.push({
      customer: cust,
      baselineRevenue: rev,
      baselineRank: i + 1,
      baselineLabel,
      lastSeenMonth: lastActive,
    });
  }
  return out;
}

// ── Top 변동 거래처 (전월 대비) ──────────────────────────
export type MoverRow = {
  customer: string;
  current: number;
  prev: number;
  diff: number;
  pct: number | null;
};

export function topMovers(
  cube: FactCube,
  curYM: string,
  prevYM: string,
  n = 10,
): { gainers: MoverRow[]; decliners: MoverRow[] } {
  const cur = cubeMonthCustomerCells(cube, curYM);
  const prev = cubeMonthCustomerCells(cube, prevYM);
  const all = new Set<string>([...cur.keys(), ...prev.keys()]);

  const rows: MoverRow[] = [];
  for (const c of all) {
    const cv = cur.get(c)?.revenue ?? 0;
    const pv = prev.get(c)?.revenue ?? 0;
    if (cv === 0 && pv === 0) continue;
    const diff = cv - pv;
    const pct = pv !== 0 ? diff / Math.abs(pv) : null;
    rows.push({ customer: c, current: cv, prev: pv, diff, pct });
  }
  const gainers = rows.filter((r) => r.diff > 0).sort((a, b) => b.diff - a.diff).slice(0, n);
  const decliners = rows.filter((r) => r.diff < 0).sort((a, b) => a.diff - b.diff).slice(0, n);
  return { gainers, decliners };
}

// ── 신규 거래처 (직전 N개월 무거래 → 이번달 첫 매출) ─────────
export type NewAccountRow = {
  customer: string;
  currentRevenue: number;
  category: Category | null;
  brand: string | null;
};

export function newAccounts(
  cube: FactCube,
  ym: string,
  lookbackMonths = 6,
): NewAccountRow[] {
  const cur = cubeMonthCustomerCells(cube, ym);
  const past = new Set<string>();
  const startYM = ymMinusMonths(ym, lookbackMonths);
  for (const m of cube.monthsAsc) {
    if (m < startYM || m >= ym) continue;
    for (const [c, cell] of cube.byMonthCustomer.get(m) ?? new Map()) {
      if ((cell as { revenue: number }).revenue > 0) past.add(c);
    }
  }
  const out: NewAccountRow[] = [];
  for (const [c, cell] of cur) {
    if (cell.revenue <= 0) continue;
    if (past.has(c)) continue;
    out.push({
      customer: c,
      currentRevenue: cell.revenue,
      category: cube.customerToCategory.get(c) ?? null,
      brand: cube.customerToBrand.get(c) ?? null,
    });
  }
  return out.sort((a, b) => b.currentRevenue - a.currentRevenue);
}

// ── 거래처 1명 deep dive 패키지 ─────────────────────────
export type CustomerProfile = {
  customer: string;
  category: Category | null;
  primaryBrand: string | null;
  primaryDealer: string | null;
  trend24m: CustomerTrendPoint[];
  trend12m: CustomerTrendPoint[];
  curMonth: { revenue: number; qty: number; orders: number };
  prevMonth: { revenue: number; qty: number; orders: number };
  prevYear: { revenue: number; qty: number; orders: number };
  quarter: QuarterCompare;
  ytd: { ytd: number; prevYtd: number; diff: number; pct: number | null };
  brandBreakdown: { brand: string; revenue: number; pct: number }[];
  channelBreakdown: { channel: string; revenue: number; pct: number }[];
  topProducts: { productName: string; brand: string; revenue: number; qty: number; prev: number }[];
  newSkus: { productName: string; brand: string; revenue: number }[];
  droppedSkus: { productName: string; brand: string; prevRevenue: number }[];
  sharePctOfTotal: number;     // 회사 전체 매출 대비
  flags: { sleeping: boolean; quarterCliff: boolean };
};

export function customerProfile(cube: FactCube, customer: string, ym: string): CustomerProfile {
  const [y, m] = ym.split("-").map(Number);
  const fmt = (yy: number, mm: number) => `${yy}-${String(mm).padStart(2, "0")}`;
  const start24 = (() => {
    let yy = y, mm = m - 23;
    while (mm < 1) { mm += 12; yy--; }
    return fmt(yy, mm);
  })();
  const start12 = (() => {
    let yy = y, mm = m - 11;
    while (mm < 1) { mm += 12; yy--; }
    return fmt(yy, mm);
  })();
  const prevMo = (() => {
    let yy = y, mm = m - 1;
    if (mm < 1) { mm = 12; yy--; }
    return fmt(yy, mm);
  })();
  const prevYr = `${y - 1}-${String(m).padStart(2, "0")}`;

  const trend24m = cubeCustomerSeries(cube, customer, start24, ym);
  const trend12m = cubeCustomerSeries(cube, customer, start12, ym);

  const cur = cube.byMonthCustomer.get(ym)?.get(customer);
  const pm = cube.byMonthCustomer.get(prevMo)?.get(customer);
  const py = cube.byMonthCustomer.get(prevYr)?.get(customer);

  const curMonth = {
    revenue: cur?.revenue ?? 0,
    qty: cur?.qty ?? 0,
    orders: cur?.orders.size ?? 0,
  };
  const prevMonthV = {
    revenue: pm?.revenue ?? 0,
    qty: pm?.qty ?? 0,
    orders: pm?.orders.size ?? 0,
  };
  const prevYearV = {
    revenue: py?.revenue ?? 0,
    qty: py?.qty ?? 0,
    orders: py?.orders.size ?? 0,
  };

  const quarter = customerQuarterCompare(cube, customer, ym);
  const ytd = customerYtdCompare(cube, customer, ym);

  // 브랜드/채널 분해 — 이번달 raw rows 필요. 큐브엔 customer×brand 분해 안 두므로 byMonth.get(ym)에서 추출.
  // 이건 한 달치 rows 스캔이지만 customer 매칭만이라 빠름.
  const monthRows = cube.byMonthCustomer.get(ym)?.get(customer);
  // monthRows는 한 cell. 분해를 위해 raw rows에서 customer 필터 필요.
  // 큐브에 추가 인덱스 두기 vs 매번 raw 한 번 스캔.
  // 현재는 분해를 별도 헬퍼로 — month_rows가 필요. 호출자에게 위임 안 하고 raw를 큐브 외부에서 한 번 더 가져와야 함.
  // 단순화: 거래처 분해는 빈 배열로 두고, 페이지 단에서 raw rows + customer filter로 채운다.
  // (deep dive 페이지가 raw rows를 한 번만 customer filter 하면 충분.)

  const brandBreakdown: { brand: string; revenue: number; pct: number }[] = [];
  const channelBreakdown: { channel: string; revenue: number; pct: number }[] = [];
  const topProducts: { productName: string; brand: string; revenue: number; qty: number; prev: number }[] = [];
  const newSkus: { productName: string; brand: string; revenue: number }[] = [];
  const droppedSkus: { productName: string; brand: string; prevRevenue: number }[] = [];

  const total = cube.byMonth.get(ym)?.revenue ?? 0;
  const sharePctOfTotal = total > 0 ? (curMonth.revenue / total) * 100 : 0;

  // flags
  const sleeping = sleepingReturned(cube, ym, { minRevenue: 1 }).some((r) => r.customer === customer);
  const cliffRows = quarterlyCliff(cube, ym, { topN: 50 });
  const quarterCliff = cliffRows.some((r) => r.customer === customer);

  return {
    customer,
    category: cube.customerToCategory.get(customer) ?? null,
    primaryBrand: cube.customerToBrand.get(customer) ?? null,
    primaryDealer: cube.customerToDealer.get(customer) ?? null,
    trend24m,
    trend12m,
    curMonth,
    prevMonth: prevMonthV,
    prevYear: prevYearV,
    quarter,
    ytd,
    brandBreakdown,
    channelBreakdown,
    topProducts,
    newSkus,
    droppedSkus,
    sharePctOfTotal,
    flags: { sleeping, quarterCliff },
  };
}

// ── 거래처 검색 (CustomerSelect 용) ──────────────────────
// 전체 기간 매출 큰 순으로 정렬된 거래처 목록.
export function listCustomersRanked(cube: FactCube): { customer: string; totalRevenue: number; category: Category | null }[] {
  const m = new Map<string, number>();
  for (const [, customerMap] of cube.byMonthCustomer) {
    for (const [c, cell] of customerMap) {
      m.set(c, (m.get(c) ?? 0) + cell.revenue);
    }
  }
  return [...m.entries()]
    .map(([customer, totalRevenue]) => ({
      customer,
      totalRevenue,
      category: cube.customerToCategory.get(customer) ?? null,
    }))
    .sort((a, b) => b.totalRevenue - a.totalRevenue);
}

// 카테고리별 상위 거래처 (cubeMonthCustomerCellsByCategory 활용)
export function categoryTopCustomers(
  cube: FactCube,
  ym: string,
  cat: Category,
  n = 10,
): { customer: string; revenue: number }[] {
  const cells = cubeMonthCustomerCellsByCategory(cube, ym, cat);
  return [...cells.entries()]
    .map(([customer, cell]) => ({ customer, revenue: cell.revenue }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, n);
}
