import type { SalesRow } from "./load";
import type { Category, ChannelGroup } from "@/config/mappings";

// 매출 집계의 핵심 규칙: **비매출 출고 행은 제외**.
export function revenueRows(rows: SalesRow[]): SalesRow[] {
  return rows.filter((r) => !r.isNonRevenue);
}

export function nonRevenueRows(rows: SalesRow[]): SalesRow[] {
  return rows.filter((r) => r.isNonRevenue);
}

export function filterMonth(rows: SalesRow[], yearMonth: string): SalesRow[] {
  return rows.filter((r) => r.yearMonth === yearMonth);
}

export function filterRange(rows: SalesRow[], fromYM: string, toYM: string): SalesRow[] {
  return rows.filter((r) => r.yearMonth >= fromYM && r.yearMonth <= toYM);
}

// ── 핵심 KPI ─────────────────────────────────────────
export type Kpi = {
  revenue: number;
  orders: number;
  aov: number;
  qty: number;
  settlement: number;
  gp: number;
  gpMargin: number; // 0 ~ 1
  costMissingRate: number; // 0 ~ 1
};

export function kpi(rows: SalesRow[]): Kpi {
  const rev = revenueRows(rows);
  const revenue = sum(rev, (r) => r.realRevenue);
  const orderSet = new Set(rev.map((r) => r.orderNo));
  const orders = orderSet.size;
  const qty = sum(rev, (r) => r.qty);
  const settlement = sum(rev, (r) => r.settlement);

  let gpSum = 0;
  let gpRevenue = 0;
  let costMissing = 0;
  for (const r of rev) {
    if (r.gp === null) {
      costMissing++;
    } else {
      gpSum += r.gp;
      gpRevenue += r.realRevenue;
    }
  }

  return {
    revenue,
    orders,
    aov: orders ? revenue / orders : 0,
    qty,
    settlement,
    gp: gpSum,
    gpMargin: gpRevenue ? gpSum / gpRevenue : 0,
    costMissingRate: rev.length ? costMissing / rev.length : 0,
  };
}

function sum<T>(arr: T[], fn: (x: T) => number): number {
  let s = 0;
  for (const x of arr) s += fn(x) || 0;
  return s;
}

// ── 그룹별 합계 (실매출) ───────────────────────────────
export function groupRevenue<K extends string | number>(
  rows: SalesRow[],
  keyFn: (r: SalesRow) => K | null | undefined,
): Map<K, number> {
  const m = new Map<K, number>();
  for (const r of revenueRows(rows)) {
    const k = keyFn(r);
    if (k == null) continue;
    m.set(k, (m.get(k) ?? 0) + r.realRevenue);
  }
  return m;
}

export function groupBy<K extends string | number, V>(
  rows: V[],
  keyFn: (r: V) => K | null | undefined,
): Map<K, V[]> {
  const m = new Map<K, V[]>();
  for (const r of rows) {
    const k = keyFn(r);
    if (k == null) continue;
    const arr = m.get(k) ?? [];
    arr.push(r);
    m.set(k, arr);
  }
  return m;
}

// ── 4분류 매출 ─────────────────────────────────────────
export function categoryRevenue(rows: SalesRow[]): Record<Category, number> {
  const out: Record<Category, number> = { 수출: 0, B2B: 0, B2C: 0, 면세점: 0 };
  for (const r of revenueRows(rows)) {
    out[r.category] += r.realRevenue;
  }
  return out;
}

// ── 채널그룹별 매출 ─────────────────────────────────────
export function channelGroupRevenue(rows: SalesRow[]): Map<ChannelGroup, number> {
  const m = new Map<ChannelGroup, number>();
  for (const r of revenueRows(rows)) {
    m.set(r.channelGroup, (m.get(r.channelGroup) ?? 0) + r.realRevenue);
  }
  return m;
}

// ── 일별 매출 ─────────────────────────────────────────
export function dailyRevenue(rows: SalesRow[]): { day: number; revenue: number }[] {
  const m = new Map<number, number>();
  for (const r of revenueRows(rows)) {
    const d = r.date.getUTCDate();
    m.set(d, (m.get(d) ?? 0) + r.realRevenue);
  }
  return [...m.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([day, revenue]) => ({ day, revenue }));
}

// ── 월별 매출 (다중 월) ─────────────────────────────────
export function monthlyRevenue(
  rows: SalesRow[],
  fromYM: string,
  toYM: string,
): { yearMonth: string; revenue: number }[] {
  const filtered = revenueRows(filterRange(rows, fromYM, toYM));
  const m = new Map<string, number>();
  for (const r of filtered) {
    m.set(r.yearMonth, (m.get(r.yearMonth) ?? 0) + r.realRevenue);
  }
  // 빈 월도 0으로 채워서 순서대로
  const out: { yearMonth: string; revenue: number }[] = [];
  const months = enumerateMonths(fromYM, toYM);
  for (const ym of months) {
    out.push({ yearMonth: ym, revenue: m.get(ym) ?? 0 });
  }
  return out;
}

export function enumerateMonths(fromYM: string, toYM: string): string[] {
  const [fy, fm] = fromYM.split("-").map(Number);
  const [ty, tm] = toYM.split("-").map(Number);
  const out: string[] = [];
  let y = fy, m = fm;
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

// ── 월별 × 카테고리 (스택바용) ───────────────────────────
export function monthlyByCategory(
  rows: SalesRow[],
  fromYM: string,
  toYM: string,
): { yearMonth: string; values: Record<Category, number> }[] {
  const filtered = revenueRows(filterRange(rows, fromYM, toYM));
  const m = new Map<string, Record<Category, number>>();
  for (const r of filtered) {
    if (!m.has(r.yearMonth)) {
      m.set(r.yearMonth, { 수출: 0, B2B: 0, B2C: 0, 면세점: 0 });
    }
    m.get(r.yearMonth)![r.category] += r.realRevenue;
  }
  const months = enumerateMonths(fromYM, toYM);
  return months.map((ym) => ({
    yearMonth: ym,
    values: m.get(ym) ?? { 수출: 0, B2B: 0, B2C: 0, 면세점: 0 },
  }));
}

// ── Top N ─────────────────────────────────────────────
export function topNCustomers(rows: SalesRow[], n = 10) {
  const m = groupRevenue(rows, (r) => r.customer);
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([customer, revenue]) => ({ customer, revenue }));
}

export function topNProducts(rows: SalesRow[], n = 10) {
  const m = new Map<string, { revenue: number; qty: number; brand: string }>();
  for (const r of revenueRows(rows)) {
    const key = r.productName;
    if (!key) continue;
    const cur = m.get(key) ?? { revenue: 0, qty: 0, brand: r.brand };
    cur.revenue += r.realRevenue;
    cur.qty += r.qty;
    m.set(key, cur);
  }
  return [...m.entries()]
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, n)
    .map(([productName, v]) => ({ productName, ...v }));
}

// ── 월별 매출 (특정 부분집합) ─────────────────────────
export function monthlyRevenueOf(
  rows: SalesRow[],
  fromYM: string,
  toYM: string,
  predicate: (r: SalesRow) => boolean,
): { yearMonth: string; revenue: number }[] {
  const filtered = revenueRows(filterRange(rows, fromYM, toYM)).filter(predicate);
  const m = new Map<string, number>();
  for (const r of filtered) {
    m.set(r.yearMonth, (m.get(r.yearMonth) ?? 0) + r.realRevenue);
  }
  return enumerateMonths(fromYM, toYM).map((ym) => ({
    yearMonth: ym,
    revenue: m.get(ym) ?? 0,
  }));
}

// ── 12개월 윈도우 시작월 헬퍼 ──────────────────────────
export function ymMinusMonths(yearMonth: string, n: number): string {
  const [y, m] = yearMonth.split("-").map(Number);
  let py = y, pm = m - n;
  while (pm < 1) { pm += 12; py--; }
  return `${py}-${String(pm).padStart(2, "0")}`;
}

// ── 일별 누적 (월간 진행 곡선) ─────────────────────────
export function dailyCumulative(rows: SalesRow[]): { day: number; revenue: number; cumulative: number }[] {
  const daily = dailyRevenue(rows);
  let acc = 0;
  return daily.map((d) => {
    acc += d.revenue;
    return { day: d.day, revenue: d.revenue, cumulative: acc };
  });
}

// ── 주차별 매출 (1주차 = 1~7일, 5주차 = 29일+) ────────────
export function weeklyRevenue(rows: SalesRow[]): { week: number; revenue: number; qty: number }[] {
  const m = new Map<number, { revenue: number; qty: number }>();
  for (const r of revenueRows(rows)) {
    const day = r.date.getUTCDate();
    const week = Math.min(5, Math.ceil(day / 7));
    const cur = m.get(week) ?? { revenue: 0, qty: 0 };
    cur.revenue += r.realRevenue;
    cur.qty += r.qty;
    m.set(week, cur);
  }
  return [...m.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([week, v]) => ({ week, ...v }));
}

// ── Top N + 전월 비교 ────────────────────────────────
// 본월 상위 N + 동일 키의 전월 매출 묶음 (변화 분류용)
export function topNCustomersWithPrev(
  curRows: SalesRow[],
  prevRows: SalesRow[],
  n = 10,
): { customer: string; current: number; prev: number; diff: number; pct: number | null }[] {
  const curMap = groupRevenue(curRows, (r) => r.customer);
  const prevMap = groupRevenue(prevRows, (r) => r.customer);
  return [...curMap.entries()]
    .map(([customer, current]) => {
      const prev = prevMap.get(customer) ?? 0;
      const diff = current - prev;
      const pct = prev !== 0 ? diff / Math.abs(prev) : null;
      return { customer, current, prev, diff, pct };
    })
    .sort((a, b) => b.current - a.current)
    .slice(0, n);
}

export function topNProductsWithPrev(
  curRows: SalesRow[],
  prevRows: SalesRow[],
  n = 10,
): { productName: string; brand: string; current: number; prev: number; diff: number; pct: number | null; qty: number }[] {
  const curMap = new Map<string, { revenue: number; qty: number; brand: string }>();
  for (const r of revenueRows(curRows)) {
    if (!r.productName) continue;
    const cur = curMap.get(r.productName) ?? { revenue: 0, qty: 0, brand: r.brand };
    cur.revenue += r.realRevenue;
    cur.qty += r.qty;
    curMap.set(r.productName, cur);
  }
  const prevMap = new Map<string, number>();
  for (const r of revenueRows(prevRows)) {
    if (!r.productName) continue;
    prevMap.set(r.productName, (prevMap.get(r.productName) ?? 0) + r.realRevenue);
  }
  return [...curMap.entries()]
    .map(([productName, v]) => {
      const prev = prevMap.get(productName) ?? 0;
      const diff = v.revenue - prev;
      const pct = prev !== 0 ? diff / Math.abs(prev) : null;
      return { productName, brand: v.brand, current: v.revenue, prev, diff, pct, qty: v.qty };
    })
    .sort((a, b) => b.current - a.current)
    .slice(0, n);
}

// ── 임의 그룹키 매출 합계 ───────────────────────────
export function revenueBySegment<K extends string>(
  rows: SalesRow[],
  keyFn: (r: SalesRow) => K | null,
): { key: K; revenue: number }[] {
  const m = new Map<K, number>();
  for (const r of revenueRows(rows)) {
    const k = keyFn(r);
    if (!k) continue;
    m.set(k, (m.get(k) ?? 0) + r.realRevenue);
  }
  return [...m.entries()]
    .map(([key, revenue]) => ({ key, revenue }))
    .sort((a, b) => b.revenue - a.revenue);
}

// ── 비매출 출고 요약 ─────────────────────────────────────
export type NonRevenueSummary = {
  totalRows: number;
  totalQty: number;
  totalCost: number; // 원가*수량 합 (cost 있는 행만)
  byBizType: { bizType: string; rows: number; qty: number; cost: number }[];
};

export function nonRevenueSummary(rows: SalesRow[]): NonRevenueSummary {
  const nr = nonRevenueRows(rows);
  let totalQty = 0;
  let totalCost = 0;
  const byTypeMap = new Map<string, { rows: number; qty: number; cost: number }>();
  for (const r of nr) {
    totalQty += r.qty;
    const c = r.cost !== null ? r.cost : 0; // 원가는 행당 합계
    totalCost += c;
    const key = r.bizType || "(기타)";
    const cur = byTypeMap.get(key) ?? { rows: 0, qty: 0, cost: 0 };
    cur.rows += 1;
    cur.qty += r.qty;
    cur.cost += c;
    byTypeMap.set(key, cur);
  }
  return {
    totalRows: nr.length,
    totalQty,
    totalCost,
    byBizType: [...byTypeMap.entries()]
      .map(([bizType, v]) => ({ bizType, ...v }))
      .sort((a, b) => b.cost - a.cost),
  };
}
