// 제품(SKU) 심층 분석 — 큐브 기반.
// "이 제품이 어떻게 팔려왔나 / 어느 채널·거래처에서 많이 팔리나 / 신규·단종" 등에 답.
// 큐브에 제품×월 합계(byMonthProduct)는 있으나 제품×채널/제품×거래처 분해는 없으므로
// 분해는 호출 페이지가 넘겨준 소범위 raw rows(보통 6개월)를 productName 필터로 스캔.

import type { FactCube } from "./facts";
import { cubeProductSeries } from "./facts";
import type { SalesRow } from "./parsers";
import { ymMinusMonths } from "./aggregate";
import { quarterOf, prevQuarter, prevYearSameMonth } from "./compare";
import type { Category } from "@/config/mappings";

// 큐브 byMonthProduct(키=품목코드||제품명)를 제품명 기준으로 합산한 한 달치 맵.
type ProductMonthAgg = { revenue: number; qty: number; brand: string };

function aggMonthByName(cube: FactCube, ym: string): Map<string, ProductMonthAgg> {
  const out = new Map<string, ProductMonthAgg>();
  const pm = cube.byMonthProduct.get(ym);
  if (!pm) return out;
  for (const cell of pm.values()) {
    const name = cell.productName || cell.productCode;
    if (!name) continue;
    const v = out.get(name) ?? { revenue: 0, qty: 0, brand: cell.brand };
    v.revenue += cell.revenue;
    v.qty += cell.qty;
    if (!v.brand && cell.brand) v.brand = cell.brand;
    out.set(name, v);
  }
  return out;
}

// 한 제품의 한 달치 합계 (제품명 기준).
function productMonth(cube: FactCube, productName: string, ym: string): { revenue: number; qty: number } {
  let revenue = 0;
  let qty = 0;
  const pm = cube.byMonthProduct.get(ym);
  if (pm) {
    for (const cell of pm.values()) {
      if (cell.productName !== productName) continue;
      revenue += cell.revenue;
      qty += cell.qty;
    }
  }
  return { revenue, qty };
}

// ── 제품 시계열 ──────────────────────────────────────────
export type ProductTrendPoint = { yearMonth: string; revenue: number; qty: number };

export function productTrend(
  cube: FactCube,
  productName: string,
  fromYM: string,
  toYM: string,
): ProductTrendPoint[] {
  return cubeProductSeries(cube, productName, fromYM, toYM);
}

// ── 분기 비교 (이번 분기 진행 vs 전년 동분기 동기간) ────────
export type QuarterCompare = {
  current: number;
  prevYear: number;
  diff: number;
  pct: number | null;
  monthsCovered: number;
};

export function productQuarterCompare(cube: FactCube, productName: string, ym: string): QuarterCompare {
  const { qStart } = quarterOf(ym);
  const series = cubeProductSeries(cube, productName, qStart, ym);
  const current = series.reduce((s, p) => s + p.revenue, 0);

  const [qy, qm] = qStart.split("-").map(Number);
  const [, mNow] = ym.split("-").map(Number);
  const monthsCovered = mNow - qm + 1;
  const pyQStart = `${qy - 1}-${String(qm).padStart(2, "0")}`;
  const pyQEnd = `${qy - 1}-${String(qm + monthsCovered - 1).padStart(2, "0")}`;
  const prevSeries = cubeProductSeries(cube, productName, pyQStart, pyQEnd);
  const prevYear = prevSeries.reduce((s, p) => s + p.revenue, 0);

  const diff = current - prevYear;
  const pct = prevYear !== 0 ? diff / Math.abs(prevYear) : null;
  return { current, prevYear, diff, pct, monthsCovered };
}

// ── YTD 비교 ─────────────────────────────────────────────
export function productYtdCompare(
  cube: FactCube,
  productName: string,
  ym: string,
): { ytd: number; prevYtd: number; diff: number; pct: number | null } {
  const [y] = ym.split("-").map(Number);
  const series = cubeProductSeries(cube, productName, `${y}-01`, ym);
  const ytd = series.reduce((s, p) => s + p.revenue, 0);
  const prevYm = prevYearSameMonth(ym);
  const prevSeries = cubeProductSeries(cube, productName, `${y - 1}-01`, prevYm);
  const prevYtd = prevSeries.reduce((s, p) => s + p.revenue, 0);
  const diff = ytd - prevYtd;
  const pct = prevYtd !== 0 ? diff / Math.abs(prevYtd) : null;
  return { ytd, prevYtd, diff, pct };
}

// ── Top 변동 제품 (전월 대비) ────────────────────────────
export type ProductMoverRow = {
  productName: string;
  brand: string;
  current: number;
  prev: number;
  diff: number;
  pct: number | null;
};

export function productMovers(
  cube: FactCube,
  curYM: string,
  prevYM: string,
  n = 10,
): { gainers: ProductMoverRow[]; decliners: ProductMoverRow[] } {
  const cur = aggMonthByName(cube, curYM);
  const prev = aggMonthByName(cube, prevYM);
  const all = new Set<string>([...cur.keys(), ...prev.keys()]);

  const rows: ProductMoverRow[] = [];
  for (const name of all) {
    const cv = cur.get(name)?.revenue ?? 0;
    const pv = prev.get(name)?.revenue ?? 0;
    if (cv === 0 && pv === 0) continue;
    const diff = cv - pv;
    const pct = pv !== 0 ? diff / Math.abs(pv) : null;
    rows.push({ productName: name, brand: cur.get(name)?.brand ?? prev.get(name)?.brand ?? "", current: cv, prev: pv, diff, pct });
  }
  const gainers = rows.filter((r) => r.diff > 0).sort((a, b) => b.diff - a.diff).slice(0, n);
  const decliners = rows.filter((r) => r.diff < 0).sort((a, b) => a.diff - b.diff).slice(0, n);
  return { gainers, decliners };
}

// ── 신규 제품 (직전 N개월 무거래 → 이번달 첫 매출) ─────────
export type NewProductRow = { productName: string; brand: string; currentRevenue: number };

export function newProducts(cube: FactCube, ym: string, lookbackMonths = 6): NewProductRow[] {
  const cur = aggMonthByName(cube, ym);
  const past = new Set<string>();
  const startYM = ymMinusMonths(ym, lookbackMonths);
  for (const m of cube.monthsAsc) {
    if (m < startYM || m >= ym) continue;
    for (const [name, v] of aggMonthByName(cube, m)) {
      if (v.revenue > 0) past.add(name);
    }
  }
  const out: NewProductRow[] = [];
  for (const [name, v] of cur) {
    if (v.revenue <= 0) continue;
    if (past.has(name)) continue;
    out.push({ productName: name, brand: v.brand, currentRevenue: v.revenue });
  }
  return out.sort((a, b) => b.currentRevenue - a.currentRevenue);
}

// ── 단종/이탈 제품 (지난 분기 상위인데 이번달 0) ────────────
export type LostProductRow = {
  productName: string;
  brand: string;
  baselineRevenue: number;
  baselineRank: number;
  lastSeenMonth: string | null;
};

export function lostProducts(cube: FactCube, ym: string, topN = 10): LostProductRow[] {
  const prevQ = prevQuarter(ym);
  const baseline = new Map<string, { revenue: number; brand: string }>();
  for (const m of cube.monthsAsc) {
    if (m < prevQ.qStart || m > prevQ.qEnd) continue;
    for (const [name, v] of aggMonthByName(cube, m)) {
      const b = baseline.get(name) ?? { revenue: 0, brand: v.brand };
      b.revenue += v.revenue;
      baseline.set(name, b);
    }
  }
  const ranked = [...baseline.entries()]
    .filter(([, v]) => v.revenue > 0)
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, topN);

  const cur = aggMonthByName(cube, ym);
  const out: LostProductRow[] = [];
  for (let i = 0; i < ranked.length; i++) {
    const [name, v] = ranked[i];
    if ((cur.get(name)?.revenue ?? 0) > 0) continue; // 살아있음
    let lastActive: string | null = null;
    for (let j = cube.monthsAsc.length - 1; j >= 0; j--) {
      const m = cube.monthsAsc[j];
      if (m >= ym) continue;
      if ((productMonth(cube, name, m).revenue ?? 0) > 0) { lastActive = m; break; }
    }
    out.push({ productName: name, brand: v.brand, baselineRevenue: v.revenue, baselineRank: i + 1, lastSeenMonth: lastActive });
  }
  return out;
}

// ── 제품 검색 (ProductSelect 용) — 전체 기간 매출 큰 순 ─────
export function listProductsRanked(cube: FactCube): { productName: string; brand: string; totalRevenue: number }[] {
  const m = new Map<string, { revenue: number; brand: string }>();
  for (const [, pm] of cube.byMonthProduct) {
    for (const cell of pm.values()) {
      const name = cell.productName || cell.productCode;
      if (!name) continue;
      const v = m.get(name) ?? { revenue: 0, brand: cell.brand };
      v.revenue += cell.revenue;
      if (!v.brand && cell.brand) v.brand = cell.brand;
      m.set(name, v);
    }
  }
  return [...m.entries()]
    .map(([productName, v]) => ({ productName, brand: v.brand, totalRevenue: v.revenue }))
    .filter((p) => p.totalRevenue > 0)
    .sort((a, b) => b.totalRevenue - a.totalRevenue);
}

// 이번달 매출 상위 제품 (큐브만, EmptyState 랭킹용)
export function topProductsOfMonth(
  cube: FactCube,
  ym: string,
  n = 20,
): { productName: string; brand: string; revenue: number; qty: number }[] {
  return [...aggMonthByName(cube, ym).entries()]
    .map(([productName, v]) => ({ productName, brand: v.brand, revenue: v.revenue, qty: v.qty }))
    .filter((p) => p.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, n);
}

// ── 제품 1개 deep dive 패키지 ────────────────────────────
export type ProductProfile = {
  productName: string;
  brand: string;
  primaryCategory: Category | null;
  trend24m: ProductTrendPoint[];
  curMonth: { revenue: number; qty: number };
  prevMonth: { revenue: number; qty: number };
  prevYear: { revenue: number; qty: number };
  quarter: QuarterCompare;
  ytd: { ytd: number; prevYtd: number; diff: number; pct: number | null };
  channelBreakdown: { channel: string; revenue: number; qty: number; pct: number }[];
  customerBreakdown: { customer: string; category: Category | null; revenue: number; pct: number }[];
  categoryMix: { category: Category; revenue: number; pct: number }[];
  newCustomers: { customer: string; revenue: number }[];
  lostCustomers: { customer: string; prevRevenue: number }[];
  sharePctOfTotal: number;
  flags: { isNew: boolean };
};

const NO_CLIENT = "(직판/온라인)";

export function productProfile(
  cube: FactCube,
  productName: string,
  ym: string,
  rangeRows: SalesRow[], // 직전 6개월 ~ ym 범위 (productName 필터 전)
): ProductProfile {
  const [y, m] = ym.split("-").map(Number);
  const fmt = (yy: number, mm: number) => `${yy}-${String(mm).padStart(2, "0")}`;
  const start24 = (() => {
    let yy = y, mm = m - 23;
    while (mm < 1) { mm += 12; yy--; }
    return fmt(yy, mm);
  })();
  const prevMo = (() => {
    let yy = y, mm = m - 1;
    if (mm < 1) { mm = 12; yy--; }
    return fmt(yy, mm);
  })();
  const prevYr = `${y - 1}-${String(m).padStart(2, "0")}`;

  const trend24m = cubeProductSeries(cube, productName, start24, ym);
  const curMonth = productMonth(cube, productName, ym);
  const prevMonthV = productMonth(cube, productName, prevMo);
  const prevYearV = productMonth(cube, productName, prevYr);
  const quarter = productQuarterCompare(cube, productName, ym);
  const ytd = productYtdCompare(cube, productName, ym);

  // 이번달 분해 — rangeRows에서 productName + 당월 + 매출행만.
  const curRows = rangeRows.filter((r) => r.productName === productName && r.yearMonth === ym && !r.isNonRevenue);
  const total = curMonth.revenue;

  const channelMap = new Map<string, { revenue: number; qty: number }>();
  const customerMap = new Map<string, number>();
  const categoryMap = new Map<Category, number>();
  let brand = "";
  for (const r of curRows) {
    if (!brand && r.brand) brand = r.brand;
    const ch = channelMap.get(r.channel) ?? { revenue: 0, qty: 0 };
    ch.revenue += r.realRevenue;
    ch.qty += r.qty;
    channelMap.set(r.channel, ch);
    const custKey = r.customer || NO_CLIENT;
    customerMap.set(custKey, (customerMap.get(custKey) ?? 0) + r.realRevenue);
    categoryMap.set(r.category, (categoryMap.get(r.category) ?? 0) + r.realRevenue);
  }
  if (!brand) {
    // 당월 매출 없으면 큐브 셀에서 브랜드 추출
    for (const cell of cube.byMonthProduct.get(ym)?.values() ?? []) {
      if (cell.productName === productName && cell.brand) { brand = cell.brand; break; }
    }
  }

  const channelBreakdown = [...channelMap.entries()]
    .map(([channel, v]) => ({ channel, revenue: v.revenue, qty: v.qty, pct: total > 0 ? v.revenue / total : 0 }))
    .sort((a, b) => b.revenue - a.revenue);
  const customerBreakdown = [...customerMap.entries()]
    .map(([customer, revenue]) => ({
      customer,
      category: customer === NO_CLIENT ? null : cube.customerToCategory.get(customer) ?? null,
      revenue,
      pct: total > 0 ? revenue / total : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);
  const categoryMix = [...categoryMap.entries()]
    .map(([category, revenue]) => ({ category, revenue, pct: total > 0 ? revenue / total : 0 }))
    .sort((a, b) => b.revenue - a.revenue);
  const primaryCategory = categoryMix[0]?.category ?? null;

  // 신규/이탈 거래처 — 직전 6개월 이 제품 거래 거래처 기준.
  const past6Start = ymMinusMonths(ym, 6);
  const pastRows = rangeRows.filter(
    (r) => r.productName === productName && !r.isNonRevenue && r.yearMonth >= past6Start && r.yearMonth < ym,
  );
  const pastCustMap = new Map<string, number>();
  for (const r of pastRows) {
    const k = r.customer || NO_CLIENT;
    pastCustMap.set(k, (pastCustMap.get(k) ?? 0) + r.realRevenue);
  }
  const curCustSet = new Set(customerMap.keys());
  const newCustomers: { customer: string; revenue: number }[] = [];
  for (const [cust, revenue] of customerMap) {
    if (cust === NO_CLIENT) continue;
    if (!pastCustMap.has(cust)) newCustomers.push({ customer: cust, revenue });
  }
  newCustomers.sort((a, b) => b.revenue - a.revenue);
  const lostCustomers: { customer: string; prevRevenue: number }[] = [];
  for (const [cust, prevRevenue] of pastCustMap) {
    if (cust === NO_CLIENT) continue;
    if (prevRevenue < 100_000) continue;
    if (!curCustSet.has(cust)) lostCustomers.push({ customer: cust, prevRevenue });
  }
  lostCustomers.sort((a, b) => b.prevRevenue - a.prevRevenue);

  const companyTotal = cube.byMonth.get(ym)?.revenue ?? 0;
  const sharePctOfTotal = companyTotal > 0 ? (curMonth.revenue / companyTotal) * 100 : 0;

  // 신규 플래그 — 직전 6개월 무거래였는데 이번달 매출.
  let pastRevenue = 0;
  for (const m2 of cube.monthsAsc) {
    if (m2 < past6Start || m2 >= ym) continue;
    pastRevenue += productMonth(cube, productName, m2).revenue;
  }
  const isNew = pastRevenue === 0 && curMonth.revenue > 0;

  return {
    productName,
    brand,
    primaryCategory,
    trend24m,
    curMonth,
    prevMonth: prevMonthV,
    prevYear: prevYearV,
    quarter,
    ytd,
    channelBreakdown,
    customerBreakdown,
    categoryMix,
    newCustomers,
    lostCustomers,
    sharePctOfTotal,
    flags: { isNew },
  };
}
