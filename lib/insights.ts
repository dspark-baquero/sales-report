// Tab 6 인사이트 자동 통계
import type { SalesRow } from "./load";
import { revenueRows, filterMonth, filterRange, enumerateMonths } from "./aggregate";
import { ymMinusMonths } from "./aggregate";
import type { ChannelGroup } from "@/config/mappings";

// 신제품: 본월에 첫 매출 발생 SKU (이전 13개월 무매출 → 본월 ≥1)
export function newProducts(rows: SalesRow[], ym: string) {
  const cur = revenueRows(filterMonth(rows, ym));
  const past13Start = ymMinusMonths(ym, 13);
  const prevYM = ymMinusMonths(ym, 1);
  const past = revenueRows(filterRange(rows, past13Start, prevYM));

  const pastSet = new Set(past.map((r) => r.productCode || r.productName));
  const curMap = new Map<string, { name: string; brand: string; qty: number; revenue: number }>();
  for (const r of cur) {
    const key = r.productCode || r.productName;
    if (!key) continue;
    if (pastSet.has(key)) continue;
    const cur2 = curMap.get(key) ?? { name: r.productName, brand: r.brand, qty: 0, revenue: 0 };
    cur2.qty += r.qty;
    cur2.revenue += r.realRevenue;
    curMap.set(key, cur2);
  }
  return [...curMap.values()]
    .filter((p) => p.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);
}

// 이탈 위험 SKU: 직전 3개월 평균 대비 본월 -50% 이상
export function decliningProducts(rows: SalesRow[], ym: string) {
  const cur = revenueRows(filterMonth(rows, ym));
  const prevYM = ymMinusMonths(ym, 1);
  const past3Start = ymMinusMonths(ym, 3);
  const past = revenueRows(filterRange(rows, past3Start, prevYM));

  const curMap = new Map<string, { name: string; brand: string; revenue: number }>();
  for (const r of cur) {
    const key = r.productCode || r.productName;
    if (!key) continue;
    const v = curMap.get(key) ?? { name: r.productName, brand: r.brand, revenue: 0 };
    v.revenue += r.realRevenue;
    curMap.set(key, v);
  }
  const pastMap = new Map<string, { name: string; brand: string; revenue: number }>();
  for (const r of past) {
    const key = r.productCode || r.productName;
    if (!key) continue;
    const v = pastMap.get(key) ?? { name: r.productName, brand: r.brand, revenue: 0 };
    v.revenue += r.realRevenue;
    pastMap.set(key, v);
  }
  const out: { name: string; brand: string; prevAvg: number; current: number; pct: number }[] = [];
  for (const [k, p] of pastMap) {
    const avg = p.revenue / 3;
    if (avg < 100_000) continue; // 너무 작은 건 노이즈로 필터
    const c = curMap.get(k)?.revenue ?? 0;
    const change = (c - avg) / avg;
    if (change <= -0.5) {
      out.push({ name: p.name, brand: p.brand, prevAvg: avg, current: c, pct: change });
    }
  }
  return out.sort((a, b) => a.pct - b.pct).slice(0, 10);
}

// 요일별 매출 패턴 (월~일)
export function weekdayPattern(rows: SalesRow[], ym: string) {
  const r = revenueRows(filterMonth(rows, ym));
  const buckets = [0, 0, 0, 0, 0, 0, 0]; // 일=0 ... 토=6
  for (const x of r) {
    const w = x.date.getUTCDay();
    buckets[w] += x.realRevenue;
  }
  // 표시 순서: 월~일
  const order = [1, 2, 3, 4, 5, 6, 0];
  const labels = ["월", "화", "수", "목", "금", "토", "일"];
  return order.map((i, idx) => ({ day: labels[idx], revenue: buckets[i] }));
}

// Top10 거래처 집중도 (매출 비중)
export function customerConcentration(rows: SalesRow[], ym: string) {
  const r = revenueRows(filterMonth(rows, ym));
  const total = r.reduce((s, x) => s + x.realRevenue, 0);
  const m = new Map<string, number>();
  for (const x of r) {
    m.set(x.customer, (m.get(x.customer) ?? 0) + x.realRevenue);
  }
  const sorted = [...m.values()].sort((a, b) => b - a);
  const top10 = sorted.slice(0, 10).reduce((s, v) => s + v, 0);
  // HHI = sum of squared market shares (× 10000 to normalize)
  const hhi = total > 0
    ? sorted.reduce((s, v) => s + Math.pow(v / total, 2), 0) * 10000
    : 0;
  return {
    total,
    top10,
    top10Pct: total > 0 ? top10 / total : 0,
    hhi,
    customerCount: sorted.length,
  };
}

// 브랜드 × 채널그룹 히트맵
export function brandChannelGroupHeatmap(rows: SalesRow[], ym: string) {
  const r = revenueRows(filterMonth(rows, ym));
  const brands = new Set<string>();
  const groups = new Set<ChannelGroup>();
  const m = new Map<string, Map<string, number>>();
  for (const x of r) {
    brands.add(x.brand);
    groups.add(x.channelGroup);
    if (!m.has(x.brand)) m.set(x.brand, new Map());
    m.get(x.brand)!.set(x.channelGroup, (m.get(x.brand)!.get(x.channelGroup) ?? 0) + x.realRevenue);
  }
  const brandList = [...brands].sort((a, b) => {
    const sa = [...(m.get(a)?.values() ?? [])].reduce((s, v) => s + v, 0);
    const sb = [...(m.get(b)?.values() ?? [])].reduce((s, v) => s + v, 0);
    return sb - sa;
  });
  const groupList = ["수출", "B2B", "면세점", "자사 공식몰", "종합몰", "소호몰", "임직원/패밀리", "기타"]
    .filter((g) => groups.has(g as ChannelGroup));
  const values = brandList.map((b) =>
    groupList.map((g) => m.get(b)?.get(g) ?? 0),
  );
  return { brands: brandList, groups: groupList, values };
}

// 채널그룹별 할인율/수수료율
export function discountFeeByChannelGroup(rows: SalesRow[], ym: string) {
  const r = revenueRows(filterMonth(rows, ym));
  const m = new Map<string, { orderAmount: number; discount: number; fee: number; settlement: number; revenue: number }>();
  for (const x of r) {
    const cur = m.get(x.channelGroup) ?? { orderAmount: 0, discount: 0, fee: 0, settlement: 0, revenue: 0 };
    cur.orderAmount += x.orderAmount;
    cur.discount += x.discount;
    cur.fee += x.fee;
    cur.settlement += x.settlement;
    cur.revenue += x.realRevenue;
    m.set(x.channelGroup, cur);
  }
  return [...m.entries()]
    .map(([group, v]) => ({
      group,
      ...v,
      discountRate: v.orderAmount > 0 ? v.discount / v.orderAmount : 0,
      feeRate: v.orderAmount > 0 ? v.fee / v.orderAmount : 0,
      gpMarginExclusive: 0, // 자리표시
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

// 본월 베스트/워스트 채널그룹 (전월 대비 매출 변화액)
export function bestWorstChannelGroups(rows: SalesRow[], ym: string) {
  const cur = revenueRows(filterMonth(rows, ym));
  const prevYM = ymMinusMonths(ym, 1);
  const prev = revenueRows(filterMonth(rows, prevYM));
  const c = new Map<string, number>();
  const p = new Map<string, number>();
  for (const x of cur) c.set(x.channelGroup, (c.get(x.channelGroup) ?? 0) + x.realRevenue);
  for (const x of prev) p.set(x.channelGroup, (p.get(x.channelGroup) ?? 0) + x.realRevenue);
  const groups = new Set([...c.keys(), ...p.keys()]);
  const out = [...groups].map((g) => {
    const cv = c.get(g) ?? 0;
    const pv = p.get(g) ?? 0;
    return { group: g, current: cv, prev: pv, diff: cv - pv, pct: pv > 0 ? (cv - pv) / pv : null };
  });
  const sorted = out.sort((a, b) => b.diff - a.diff);
  return {
    best: sorted.slice(0, 3),
    worst: sorted.slice().reverse().slice(0, 3),
  };
}
