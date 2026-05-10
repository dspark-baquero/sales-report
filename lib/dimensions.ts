// 차원별 집계 — 수출 국가, B2B 영업사원/거래처유형, B2C 브랜드/채널 등
import type { SalesRow } from "./load";
import { revenueRows, filterRange, enumerateMonths } from "./aggregate";
import { BRAND_OFFICIAL_CHANNELS } from "@/config/mappings";

// ── 수출 ───────────────────────────────────────────────
export function exportRows(rows: SalesRow[]): SalesRow[] {
  return rows.filter((r) => r.category === "수출");
}

export function revenueByCountry(rows: SalesRow[]): { country: string; revenue: number; qty: number }[] {
  const m = new Map<string, { revenue: number; qty: number }>();
  for (const r of revenueRows(exportRows(rows))) {
    const k = r.country ?? "기타";
    const cur = m.get(k) ?? { revenue: 0, qty: 0 };
    cur.revenue += r.realRevenue;
    cur.qty += r.qty;
    m.set(k, cur);
  }
  return [...m.entries()]
    .map(([country, v]) => ({ country, ...v }))
    .sort((a, b) => b.revenue - a.revenue);
}

// 국가 × 브랜드 매트릭스
export function countryBrandMatrix(rows: SalesRow[]): {
  countries: string[];
  brands: string[];
  values: number[][]; // [country][brand]
} {
  const cMap = new Map<string, Map<string, number>>();
  const brandSet = new Set<string>();
  for (const r of revenueRows(exportRows(rows))) {
    const c = r.country ?? "기타";
    brandSet.add(r.brand);
    if (!cMap.has(c)) cMap.set(c, new Map());
    const bm = cMap.get(c)!;
    bm.set(r.brand, (bm.get(r.brand) ?? 0) + r.realRevenue);
  }
  const countries = [...cMap.keys()].sort((a, b) => {
    const sumA = [...cMap.get(a)!.values()].reduce((s, v) => s + v, 0);
    const sumB = [...cMap.get(b)!.values()].reduce((s, v) => s + v, 0);
    return sumB - sumA;
  });
  const brands = [...brandSet].sort();
  const values = countries.map((c) =>
    brands.map((b) => cMap.get(c)!.get(b) ?? 0),
  );
  return { countries, brands, values };
}

// 국가별 12개월 추이
export function countryMonthlyTrend(
  rows: SalesRow[],
  fromYM: string,
  toYM: string,
): { country: string; months: string[]; values: number[] }[] {
  const exp = revenueRows(exportRows(filterRange(rows, fromYM, toYM)));
  const cMap = new Map<string, Map<string, number>>();
  for (const r of exp) {
    const c = r.country ?? "기타";
    if (!cMap.has(c)) cMap.set(c, new Map());
    const m = cMap.get(c)!;
    m.set(r.yearMonth, (m.get(r.yearMonth) ?? 0) + r.realRevenue);
  }
  const months = enumerateMonths(fromYM, toYM);
  const result = [...cMap.entries()]
    .map(([country, m]) => ({
      country,
      months,
      values: months.map((ym) => m.get(ym) ?? 0),
      total: [...m.values()].reduce((s, v) => s + v, 0),
    }))
    .sort((a, b) => b.total - a.total);
  return result.map(({ country, months, values }) => ({ country, months, values }));
}

// 수출 거래처별
export function exportCustomers(rows: SalesRow[]): {
  customer: string;
  country: string;
  revenue: number;
  qty: number;
}[] {
  const m = new Map<string, { country: string; revenue: number; qty: number }>();
  for (const r of revenueRows(exportRows(rows))) {
    const cur = m.get(r.customer) ?? { country: r.country ?? "기타", revenue: 0, qty: 0 };
    cur.revenue += r.realRevenue;
    cur.qty += r.qty;
    m.set(r.customer, cur);
  }
  return [...m.entries()]
    .map(([customer, v]) => ({ customer, ...v }))
    .sort((a, b) => b.revenue - a.revenue);
}

// ── B2B ────────────────────────────────────────────────
export function b2bRows(rows: SalesRow[]): SalesRow[] {
  return rows.filter((r) => r.category === "B2B");
}

// 거래처유형별
export function revenueByCustomerType(rows: SalesRow[]) {
  const m = new Map<string, { revenue: number; orders: Set<string> }>();
  for (const r of revenueRows(b2bRows(rows))) {
    const k = r.b2bCustomerType ?? "기타";
    const cur = m.get(k) ?? { revenue: 0, orders: new Set() };
    cur.revenue += r.realRevenue;
    cur.orders.add(r.orderNo);
    m.set(k, cur);
  }
  return [...m.entries()]
    .map(([type, v]) => ({ type, revenue: v.revenue, orders: v.orders.size }))
    .sort((a, b) => b.revenue - a.revenue);
}

// 영업사원별 (B2B 본월). 0원 사원은 호출자가 필터링.
export function revenueByDealer(rows: SalesRow[]): { dealer: string; revenue: number; customers: number }[] {
  const m = new Map<string, { revenue: number; customers: Set<string> }>();
  for (const r of revenueRows(b2bRows(rows))) {
    const cur = m.get(r.dealer) ?? { revenue: 0, customers: new Set() };
    cur.revenue += r.realRevenue;
    cur.customers.add(r.customer);
    m.set(r.dealer, cur);
  }
  return [...m.entries()]
    .map(([dealer, v]) => ({ dealer, revenue: v.revenue, customers: v.customers.size }))
    .sort((a, b) => b.revenue - a.revenue);
}

// 영업사원 × 거래처유형 매트릭스
export function dealerCustomerTypeMatrix(rows: SalesRow[]): {
  dealers: string[];
  types: string[];
  values: number[][];
} {
  const dMap = new Map<string, Map<string, number>>();
  const typeSet = new Set<string>();
  for (const r of revenueRows(b2bRows(rows))) {
    const t = r.b2bCustomerType ?? "기타";
    typeSet.add(t);
    if (!dMap.has(r.dealer)) dMap.set(r.dealer, new Map());
    const tm = dMap.get(r.dealer)!;
    tm.set(t, (tm.get(t) ?? 0) + r.realRevenue);
  }
  const dealers = [...dMap.keys()]
    .map((d) => ({ d, total: [...dMap.get(d)!.values()].reduce((s, v) => s + v, 0) }))
    .filter((x) => x.total > 0) // 0원 사원 제외 (사용자 정책)
    .sort((a, b) => b.total - a.total)
    .map((x) => x.d);
  const types = ["병원", "병원(프랜차이즈)", "병원(대리점)", "피부관리실", "피부관리실(프랜차이즈)", "피부관리실(대리점)", "대리점", "기타"]
    .filter((t) => typeSet.has(t));
  const values = dealers.map((d) =>
    types.map((t) => dMap.get(d)!.get(t) ?? 0),
  );
  return { dealers, types, values };
}

// B2B 신규/이탈 거래처
// 신규: 본월에 매출 발생, 직전 6개월(본월 제외) 매출 0
// 이탈: 직전 3개월 평균 매출 X, 본월 매출 0
export function b2bNewLost(
  rows: SalesRow[],
  ym: string,
): { newOnes: { customer: string; revenue: number }[]; lost: { customer: string; prevAvg: number }[] } {
  const all = revenueRows(b2bRows(rows));
  const [y, m] = ym.split("-").map(Number);
  const monthOf = (r: SalesRow) => r.yearMonth;

  // window 정의
  const past6Start = (() => {
    let py = y, pm = m - 6;
    while (pm < 1) { pm += 12; py--; }
    return `${py}-${String(pm).padStart(2, "0")}`;
  })();
  const past3Start = (() => {
    let py = y, pm = m - 3;
    while (pm < 1) { pm += 12; py--; }
    return `${py}-${String(pm).padStart(2, "0")}`;
  })();
  const prevMonthYM = (() => {
    let py = y, pm = m - 1;
    while (pm < 1) { pm += 12; py--; }
    return `${py}-${String(pm).padStart(2, "0")}`;
  })();

  const curRev = new Map<string, number>();
  const past6Rev = new Map<string, number>();
  const past3Rev = new Map<string, number>();

  for (const r of all) {
    const ymR = monthOf(r);
    if (ymR === ym) {
      curRev.set(r.customer, (curRev.get(r.customer) ?? 0) + r.realRevenue);
    }
    if (ymR >= past6Start && ymR <= prevMonthYM) {
      past6Rev.set(r.customer, (past6Rev.get(r.customer) ?? 0) + r.realRevenue);
    }
    if (ymR >= past3Start && ymR <= prevMonthYM) {
      past3Rev.set(r.customer, (past3Rev.get(r.customer) ?? 0) + r.realRevenue);
    }
  }

  const newOnes = [...curRev.entries()]
    .filter(([c, rev]) => rev > 0 && (past6Rev.get(c) ?? 0) === 0)
    .map(([customer, revenue]) => ({ customer, revenue }))
    .sort((a, b) => b.revenue - a.revenue);

  const lost = [...past3Rev.entries()]
    .filter(([c, rev]) => rev > 0 && (curRev.get(c) ?? 0) === 0)
    .map(([customer, prev]) => ({ customer, prevAvg: prev / 3 }))
    .sort((a, b) => b.prevAvg - a.prevAvg);

  return { newOnes, lost };
}

// B2B 브랜드 비중
export function b2bBrandRevenue(rows: SalesRow[]) {
  const m = new Map<string, number>();
  for (const r of revenueRows(b2bRows(rows))) {
    m.set(r.brand, (m.get(r.brand) ?? 0) + r.realRevenue);
  }
  return [...m.entries()]
    .map(([brand, revenue]) => ({ brand, revenue }))
    .sort((a, b) => b.revenue - a.revenue);
}

// ── B2C ────────────────────────────────────────────────
export function b2cRows(rows: SalesRow[], includeDutyFree = false): SalesRow[] {
  return rows.filter((r) => r.category === "B2C" || (includeDutyFree && r.category === "면세점"));
}

export function b2cBrandRevenue(rows: SalesRow[], includeDutyFree = false) {
  const m = new Map<string, { revenue: number; house: string }>();
  for (const r of revenueRows(b2cRows(rows, includeDutyFree))) {
    const cur = m.get(r.brand) ?? { revenue: 0, house: r.brandHouse };
    cur.revenue += r.realRevenue;
    m.set(r.brand, cur);
  }
  return [...m.entries()]
    .map(([brand, v]) => ({ brand, ...v }))
    .sort((a, b) => b.revenue - a.revenue);
}

// 브랜드 × 채널그룹 분해
export function brandChannelGroupBreakdown(rows: SalesRow[]) {
  const groups = ["자사 공식몰", "종합몰", "소호몰", "임직원/패밀리", "기타"] as const;
  const m = new Map<string, Record<string, number>>();
  for (const r of revenueRows(b2cRows(rows))) {
    if (!m.has(r.brand)) {
      m.set(r.brand, Object.fromEntries(groups.map((g) => [g, 0])));
    }
    m.get(r.brand)![r.channelGroup] = (m.get(r.brand)![r.channelGroup] ?? 0) + r.realRevenue;
  }
  return [...m.entries()]
    .map(([brand, vals]) => ({ brand, ...vals, total: groups.reduce((s, g) => s + (vals[g] ?? 0), 0) }))
    .sort((a, b) => (b.total ?? 0) - (a.total ?? 0));
}

// 브랜드별 공식몰 12개월 추이 (자체몰만)
export function brandOfficialTrend(
  rows: SalesRow[],
  fromYM: string,
  toYM: string,
): { brand: string; months: string[]; values: number[] }[] {
  const inRange = revenueRows(filterRange(rows, fromYM, toYM));
  const months = enumerateMonths(fromYM, toYM);
  const result: { brand: string; months: string[]; values: number[] }[] = [];
  for (const [brand, channels] of Object.entries(BRAND_OFFICIAL_CHANNELS)) {
    const set = new Set(channels);
    const m = new Map<string, number>();
    for (const r of inRange) {
      if (!set.has(r.channel)) continue;
      m.set(r.yearMonth, (m.get(r.yearMonth) ?? 0) + r.realRevenue);
    }
    result.push({
      brand,
      months,
      values: months.map((ym) => m.get(ym) ?? 0),
    });
  }
  return result;
}

// 종합몰 채널별 표
export function generalMallChannels(rows: SalesRow[]) {
  const m = new Map<string, { revenue: number; qty: number; orderAmount: number; settlement: number; fee: number }>();
  for (const r of revenueRows(rows.filter((x) => x.channelGroup === "종합몰"))) {
    const cur = m.get(r.channel) ?? { revenue: 0, qty: 0, orderAmount: 0, settlement: 0, fee: 0 };
    cur.revenue += r.realRevenue;
    cur.qty += r.qty;
    cur.orderAmount += r.orderAmount;
    cur.settlement += r.settlement;
    cur.fee += r.fee;
    m.set(r.channel, cur);
  }
  return [...m.entries()]
    .map(([channel, v]) => ({
      channel,
      ...v,
      feeRate: v.orderAmount > 0 ? v.fee / v.orderAmount : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

// ── 면세점 ──────────────────────────────────────────────
export function dutyFreeRows(rows: SalesRow[]): SalesRow[] {
  return rows.filter((r) => r.category === "면세점");
}

export function dutyFreeCustomers(rows: SalesRow[]) {
  const m = new Map<string, { revenue: number; qty: number }>();
  for (const r of revenueRows(dutyFreeRows(rows))) {
    const cur = m.get(r.customer) ?? { revenue: 0, qty: 0 };
    cur.revenue += r.realRevenue;
    cur.qty += r.qty;
    m.set(r.customer, cur);
  }
  return [...m.entries()]
    .map(([customer, v]) => ({ customer, ...v }))
    .sort((a, b) => b.revenue - a.revenue);
}

export function dutyFreeBrandRevenue(rows: SalesRow[]) {
  const m = new Map<string, number>();
  for (const r of revenueRows(dutyFreeRows(rows))) {
    m.set(r.brand, (m.get(r.brand) ?? 0) + r.realRevenue);
  }
  return [...m.entries()]
    .map(([brand, revenue]) => ({ brand, revenue }))
    .sort((a, b) => b.revenue - a.revenue);
}
