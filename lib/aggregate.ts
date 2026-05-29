import type { SalesRow } from "./parsers";
import type { Category, ChannelGroup } from "@/config/mappings";
import { CHANNEL_KEYS, channelRowFilter, type ChannelKey } from "./brandCustomerMatrix";

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

export type TopProduct = {
  productName: string;
  brand: string;
  current: number;
  prev: number;
  diff: number;
  pct: number | null;
  qty: number;
  ytdRevenue: number;
  ytdQty: number;
};

export function topNProductsEnhanced(
  curRows: SalesRow[],
  prevRows: SalesRow[],
  ytdRows: SalesRow[],
  n = 20,
): TopProduct[] {
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
  const ytdMap = new Map<string, { revenue: number; qty: number }>();
  for (const r of revenueRows(ytdRows)) {
    if (!r.productName) continue;
    const cur = ytdMap.get(r.productName) ?? { revenue: 0, qty: 0 };
    cur.revenue += r.realRevenue;
    cur.qty += r.qty;
    ytdMap.set(r.productName, cur);
  }
  return [...curMap.entries()]
    .map(([productName, v]) => {
      const prev = prevMap.get(productName) ?? 0;
      const diff = v.revenue - prev;
      const pct = prev !== 0 ? diff / Math.abs(prev) : null;
      const ytd = ytdMap.get(productName) ?? { revenue: 0, qty: 0 };
      return { productName, brand: v.brand, current: v.revenue, prev, diff, pct, qty: v.qty, ytdRevenue: ytd.revenue, ytdQty: ytd.qty };
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
  totalCost: number;
  byBizType: { bizType: string; rows: number; qty: number; cost: number }[];
};

export function nonRevenueSummary(rows: SalesRow[]): NonRevenueSummary {
  const nr = nonRevenueRows(rows);
  let totalQty = 0;
  let totalCost = 0;
  const byTypeMap = new Map<string, { rows: number; qty: number; cost: number }>();
  for (const r of nr) {
    totalQty += r.qty;
    const c = r.cost !== null ? r.cost : 0;
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

// ── 비매출 세부 분해 (거래처/제품/브랜드/채널×사업형태) ─────

export type NonRevenueByCustomer = {
  customer: string;
  rows: number;
  qty: number;
  cost: number;
  bizTypeMix: { bizType: string; cost: number; share: number }[];
};

export function nonRevenueByCustomer(
  rows: SalesRow[],
  topN: number,
): NonRevenueByCustomer[] {
  const nr = nonRevenueRows(rows);
  type Acc = {
    rows: number;
    qty: number;
    cost: number;
    byBiz: Map<string, number>;
  };
  const map = new Map<string, Acc>();
  for (const r of nr) {
    const key = r.customer || "(미지정)";
    const c = r.cost !== null ? r.cost : 0;
    const cur = map.get(key) ?? { rows: 0, qty: 0, cost: 0, byBiz: new Map() };
    cur.rows += 1;
    cur.qty += r.qty;
    cur.cost += c;
    const bt = r.bizType || "(기타)";
    cur.byBiz.set(bt, (cur.byBiz.get(bt) ?? 0) + c);
    map.set(key, cur);
  }
  return [...map.entries()]
    .map(([customer, v]) => {
      const total = v.cost;
      const bizTypeMix = [...v.byBiz.entries()]
        .map(([bizType, cost]) => ({
          bizType,
          cost,
          share: total > 0 ? cost / total : 0,
        }))
        .sort((a, b) => b.cost - a.cost);
      return { customer, rows: v.rows, qty: v.qty, cost: v.cost, bizTypeMix };
    })
    .sort((a, b) => b.cost - a.cost)
    .slice(0, topN);
}

export type NonRevenueByProduct = {
  product: string;
  productCode: string;
  brand: string;
  rows: number;
  qty: number;
  cost: number;
  topBizType: string;
};

export function nonRevenueByProduct(
  rows: SalesRow[],
  topN: number,
): NonRevenueByProduct[] {
  const nr = nonRevenueRows(rows);
  type Acc = {
    product: string;
    productCode: string;
    brand: string;
    rows: number;
    qty: number;
    cost: number;
    byBiz: Map<string, number>;
  };
  const map = new Map<string, Acc>();
  for (const r of nr) {
    const key = r.productCode || r.productName || "(미지정)";
    const c = r.cost !== null ? r.cost : 0;
    const cur = map.get(key) ?? {
      product: r.productName,
      productCode: r.productCode,
      brand: r.brand,
      rows: 0,
      qty: 0,
      cost: 0,
      byBiz: new Map(),
    };
    cur.rows += 1;
    cur.qty += r.qty;
    cur.cost += c;
    const bt = r.bizType || "(기타)";
    cur.byBiz.set(bt, (cur.byBiz.get(bt) ?? 0) + r.qty);
    map.set(key, cur);
  }
  return [...map.entries()]
    .map(([, v]) => {
      let topBizType = "—";
      let topQty = 0;
      for (const [bt, q] of v.byBiz) {
        if (q > topQty) {
          topQty = q;
          topBizType = bt;
        }
      }
      return {
        product: v.product,
        productCode: v.productCode,
        brand: v.brand,
        rows: v.rows,
        qty: v.qty,
        cost: v.cost,
        topBizType,
      };
    })
    .sort((a, b) => b.qty - a.qty)
    .slice(0, topN);
}

export type NonRevenueByBrand = {
  brand: string;
  rows: number;
  qty: number;
  cost: number;
};

export function nonRevenueByBrand(rows: SalesRow[]): NonRevenueByBrand[] {
  const nr = nonRevenueRows(rows);
  const map = new Map<string, { rows: number; qty: number; cost: number }>();
  for (const r of nr) {
    const key = r.brand || "(미지정)";
    const c = r.cost !== null ? r.cost : 0;
    const cur = map.get(key) ?? { rows: 0, qty: 0, cost: 0 };
    cur.rows += 1;
    cur.qty += r.qty;
    cur.cost += c;
    map.set(key, cur);
  }
  return [...map.entries()]
    .map(([brand, v]) => ({ brand, ...v }))
    .sort((a, b) => b.cost - a.cost);
}

export type NonRevenueChannelBizMatrix = {
  channels: ChannelKey[];
  bizTypes: string[];
  cells: Map<string, { cost: number; qty: number; rows: number }>; // `${channel}|${bizType}`
  channelTotals: Map<ChannelKey, { cost: number; qty: number; rows: number }>;
  bizTypeTotals: Map<string, { cost: number; qty: number; rows: number }>;
};

export function nonRevenueChannelBizMatrix(
  rows: SalesRow[],
): NonRevenueChannelBizMatrix {
  const nr = nonRevenueRows(rows);
  const cells = new Map<string, { cost: number; qty: number; rows: number }>();
  const channelTotals = new Map<
    ChannelKey,
    { cost: number; qty: number; rows: number }
  >();
  const bizTypeTotals = new Map<
    string,
    { cost: number; qty: number; rows: number }
  >();
  const bizTypeSet = new Set<string>();

  // 각 row가 어떤 채널대분류에 속하는지 한 번에 판정. 사업형태가 채널 분류와 다르므로
  // channelRowFilter는 매출용이지만 row의 채널/카테고리/b2bType은 모든 row에 존재해 사용 가능.
  const filters = CHANNEL_KEYS.map((ch) => ({ ch, fn: channelRowFilter(ch) }));

  for (const r of nr) {
    const bt = r.bizType || "(기타)";
    bizTypeSet.add(bt);
    const c = r.cost !== null ? r.cost : 0;

    // bizType 합계
    const btT = bizTypeTotals.get(bt) ?? { cost: 0, qty: 0, rows: 0 };
    btT.cost += c;
    btT.qty += r.qty;
    btT.rows += 1;
    bizTypeTotals.set(bt, btT);

    // 채널 매칭 (한 row는 정확히 한 채널에 속함 — 매트릭스 정의상)
    let matched: ChannelKey | null = null;
    for (const f of filters) {
      if (f.fn(r)) {
        matched = f.ch;
        break;
      }
    }
    if (matched === null) continue; // 분류되지 않는 row는 매트릭스 제외

    const chT = channelTotals.get(matched) ?? { cost: 0, qty: 0, rows: 0 };
    chT.cost += c;
    chT.qty += r.qty;
    chT.rows += 1;
    channelTotals.set(matched, chT);

    const key = `${matched}|${bt}`;
    const cell = cells.get(key) ?? { cost: 0, qty: 0, rows: 0 };
    cell.cost += c;
    cell.qty += r.qty;
    cell.rows += 1;
    cells.set(key, cell);
  }

  // bizTypes 원가 내림차순 정렬
  const bizTypes = [...bizTypeSet].sort(
    (a, b) =>
      (bizTypeTotals.get(b)?.cost ?? 0) - (bizTypeTotals.get(a)?.cost ?? 0),
  );

  return {
    channels: [...CHANNEL_KEYS],
    bizTypes,
    cells,
    channelTotals,
    bizTypeTotals,
  };
}
