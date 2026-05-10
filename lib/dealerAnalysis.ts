// 딜러(B2B 영업사원) 심층 분석 — 큐브 기반.
// "이 딜러의 6개월 추이", "신규/이탈 거래처", "분기 누적 vs 전년 동분기" 등.

import type { FactCube } from "./facts";
import {
  cubeDealerSeries,
  cubeMonthDealerCells,
} from "./facts";
import { ymMinusMonths } from "./aggregate";
import { quarterOf, prevYearSameMonth } from "./compare";

// ── 6개월 추이 + 활성 거래처 수 ─────────────────────────
export type DealerTrendPoint = {
  yearMonth: string;
  revenue: number;
  activeCustomers: number;
};

export function dealerTrend(
  cube: FactCube,
  dealer: string,
  fromYM: string,
  toYM: string,
): DealerTrendPoint[] {
  return cubeDealerSeries(cube, dealer, fromYM, toYM);
}

// 모든 딜러 6개월 추이 (보드용)
export type DealerBoardRow = {
  dealer: string;
  curRevenue: number;
  curActiveCustomers: number;
  prevRevenue: number;
  diff: number;
  pct: number | null;
  series6m: { yearMonth: string; revenue: number }[];
};

export function dealerBoard(cube: FactCube, ym: string, months = 6): DealerBoardRow[] {
  const cur = cubeMonthDealerCells(cube, ym);
  const prevYM = ymMinusMonths(ym, 1);
  const prev = cubeMonthDealerCells(cube, prevYM);
  const fromYM = ymMinusMonths(ym, months - 1);

  const out: DealerBoardRow[] = [];
  for (const [dealer, curCell] of cur) {
    if (curCell.revenue <= 0) continue;
    const series = cubeDealerSeries(cube, dealer, fromYM, ym).map((p) => ({
      yearMonth: p.yearMonth,
      revenue: p.revenue,
    }));
    const prevCell = prev.get(dealer);
    const prevRev = prevCell?.revenue ?? 0;
    const diff = curCell.revenue - prevRev;
    const pct = prevRev !== 0 ? diff / Math.abs(prevRev) : null;
    const activeCustomers = cube.byMonthDealerCustomers.get(ym)?.get(dealer)?.size ?? 0;
    out.push({
      dealer,
      curRevenue: curCell.revenue,
      curActiveCustomers: activeCustomers,
      prevRevenue: prevRev,
      diff,
      pct,
      series6m: series,
    });
  }
  return out.sort((a, b) => b.curRevenue - a.curRevenue);
}

// ── 딜러별 신규/이탈 거래처 (3개월 윈도우) ───────────────
export type DealerChurnRow = {
  dealer: string;
  newCustomers: { customer: string; revenue: number }[];
  lostCustomers: { customer: string; prevRevenue: number; lastSeenMonth: string }[];
  netChange: number;
  currentActive: number;
};

export function dealerCustomerChurn(
  cube: FactCube,
  ym: string,
  lookbackMonths = 3,
): DealerChurnRow[] {
  const startYM = ymMinusMonths(ym, lookbackMonths);
  const prevYM = ymMinusMonths(ym, 1);

  // 딜러 → 직전 N개월 거래처 Map: customer → (lastSeenMonth, totalRev)
  const dealerPast = new Map<string, Map<string, { lastSeen: string; totalRev: number }>>();
  const dealerCur = new Map<string, Map<string, number>>();

  for (const m of cube.monthsAsc) {
    if (m < startYM || m > ym) continue;
    // dealer customers Set + dealer cell + customer cells가 별도라 raw 필요.
    // 큐브에는 (dealer, customer) 분해 없음. dealer의 customers Set만 있음.
    // active customers 변동 = Set 비교.
    const dCustMap = cube.byMonthDealerCustomers.get(m);
    if (!dCustMap) continue;
    for (const [d, custSet] of dCustMap) {
      if (m === ym) {
        if (!dealerCur.has(d)) dealerCur.set(d, new Map());
        const map = dealerCur.get(d)!;
        for (const c of custSet) {
          // 매출은 거래처 셀에서 (단, customer가 같은 dealer에 속한지 체크 안함 — 이번달 dealer Set이면 OK)
          const rev = cube.byMonthCustomer.get(m)?.get(c)?.revenue ?? 0;
          map.set(c, rev);
        }
      } else {
        if (!dealerPast.has(d)) dealerPast.set(d, new Map());
        const map = dealerPast.get(d)!;
        for (const c of custSet) {
          const rev = cube.byMonthCustomer.get(m)?.get(c)?.revenue ?? 0;
          const prev = map.get(c) ?? { lastSeen: m, totalRev: 0 };
          if (m > prev.lastSeen) prev.lastSeen = m;
          prev.totalRev += rev;
          map.set(c, prev);
        }
      }
    }
  }

  const out: DealerChurnRow[] = [];
  const allDealers = new Set([...dealerCur.keys(), ...dealerPast.keys()]);
  for (const d of allDealers) {
    const cur = dealerCur.get(d) ?? new Map();
    const past = dealerPast.get(d) ?? new Map();
    const newOnes: { customer: string; revenue: number }[] = [];
    const lost: { customer: string; prevRevenue: number; lastSeenMonth: string }[] = [];
    for (const [c, rev] of cur) {
      if (!past.has(c)) newOnes.push({ customer: c, revenue: rev });
    }
    for (const [c, info] of past) {
      if (!cur.has(c)) lost.push({ customer: c, prevRevenue: info.totalRev, lastSeenMonth: info.lastSeen });
    }
    if (newOnes.length === 0 && lost.length === 0) continue;
    out.push({
      dealer: d,
      newCustomers: newOnes.sort((a, b) => b.revenue - a.revenue),
      lostCustomers: lost.sort((a, b) => b.prevRevenue - a.prevRevenue),
      netChange: newOnes.length - lost.length,
      currentActive: cur.size,
    });
  }
  return out.sort((a, b) => b.currentActive - a.currentActive);
}

// ── 딜러 분기 누적 vs 전년 동분기 동기간 ──────────────────
export type DealerQuarterCompareRow = {
  dealer: string;
  currentQAccum: number;
  prevYearQAccum: number;
  diff: number;
  pct: number | null;
  qProgress: number;
};

export function dealerQuarterCompare(cube: FactCube, ym: string): DealerQuarterCompareRow[] {
  const { qStart } = quarterOf(ym);
  const [, m] = ym.split("-").map(Number);
  const [, qm] = qStart.split("-").map(Number);
  const qProgress = m - qm + 1;

  const pyQStart = (() => {
    const [yy, mm] = qStart.split("-").map(Number);
    return `${yy - 1}-${String(mm).padStart(2, "0")}`;
  })();
  const pyEnd = prevYearSameMonth(ym);

  const cur = new Map<string, number>();
  const prev = new Map<string, number>();
  for (const mm of cube.monthsAsc) {
    if (mm >= qStart && mm <= ym) {
      for (const [d, cell] of cube.byMonthDealer.get(mm) ?? new Map()) {
        cur.set(d, (cur.get(d) ?? 0) + (cell as { revenue: number }).revenue);
      }
    }
    if (mm >= pyQStart && mm <= pyEnd) {
      for (const [d, cell] of cube.byMonthDealer.get(mm) ?? new Map()) {
        prev.set(d, (prev.get(d) ?? 0) + (cell as { revenue: number }).revenue);
      }
    }
  }
  const allDealers = new Set([...cur.keys(), ...prev.keys()]);
  const out: DealerQuarterCompareRow[] = [];
  for (const d of allDealers) {
    const c = cur.get(d) ?? 0;
    const p = prev.get(d) ?? 0;
    if (c === 0 && p === 0) continue;
    const diff = c - p;
    const pct = p !== 0 ? diff / Math.abs(p) : null;
    out.push({ dealer: d, currentQAccum: c, prevYearQAccum: p, diff, pct, qProgress });
  }
  return out.sort((a, b) => b.currentQAccum - a.currentQAccum);
}

// ── 딜러 1명 deep dive ──────────────────────────────────
export type DealerProfile = {
  dealer: string;
  trend12m: DealerTrendPoint[];
  curRevenue: number;
  prevRevenue: number;
  prevYearRevenue: number;
  curActiveCustomers: number;
  topCustomers: { customer: string; current: number; prev: number; diff: number; pct: number | null }[];
  newCustomers: { customer: string; revenue: number }[];
  lostCustomers: { customer: string; prevRevenue: number; lastSeenMonth: string }[];
  customerTypeMix: { type: string; revenue: number; pct: number }[];
};

export function dealerProfile(cube: FactCube, dealer: string, ym: string): DealerProfile {
  const start12 = ymMinusMonths(ym, 11);
  const trend12m = cubeDealerSeries(cube, dealer, start12, ym);
  const cur = cube.byMonthDealer.get(ym)?.get(dealer);
  const pm = cube.byMonthDealer.get(ymMinusMonths(ym, 1))?.get(dealer);
  const py = cube.byMonthDealer.get(prevYearSameMonth(ym))?.get(dealer);

  const curCustSet = cube.byMonthDealerCustomers.get(ym)?.get(dealer) ?? new Set();
  const prevCustSet = cube.byMonthDealerCustomers.get(ymMinusMonths(ym, 1))?.get(dealer) ?? new Set();
  const topCustomers: DealerProfile["topCustomers"] = [];
  for (const c of curCustSet) {
    const cv = cube.byMonthCustomer.get(ym)?.get(c)?.revenue ?? 0;
    const pv = cube.byMonthCustomer.get(ymMinusMonths(ym, 1))?.get(c)?.revenue ?? 0;
    if (cv === 0 && pv === 0) continue;
    const diff = cv - pv;
    const pct = pv !== 0 ? diff / Math.abs(pv) : null;
    topCustomers.push({ customer: c, current: cv, prev: pv, diff, pct });
  }
  topCustomers.sort((a, b) => b.current - a.current);

  // 거래처 churn (3개월 윈도우)
  const churn = dealerCustomerChurn(cube, ym, 3).find((r) => r.dealer === dealer);

  // customerTypeMix — dealer × type 매트릭스에서
  const typeMap = cube.byMonthDealerType.get(ym)?.get(dealer) ?? new Map();
  let total = 0;
  for (const cell of typeMap.values()) total += (cell as { revenue: number }).revenue;
  const customerTypeMix: { type: string; revenue: number; pct: number }[] = [];
  for (const [type, cell] of typeMap) {
    const rev = (cell as { revenue: number }).revenue;
    customerTypeMix.push({ type, revenue: rev, pct: total > 0 ? rev / total : 0 });
  }
  customerTypeMix.sort((a, b) => b.revenue - a.revenue);

  return {
    dealer,
    trend12m,
    curRevenue: cur?.revenue ?? 0,
    prevRevenue: pm?.revenue ?? 0,
    prevYearRevenue: py?.revenue ?? 0,
    curActiveCustomers: curCustSet.size,
    topCustomers: topCustomers.slice(0, 10),
    newCustomers: churn?.newCustomers ?? [],
    lostCustomers: churn?.lostCustomers ?? [],
    customerTypeMix,
  };
}
