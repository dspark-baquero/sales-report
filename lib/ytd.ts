// 올해 월별 매출 추이 (Year-to-Date) 시리즈 빌더.
// ym 의 연도를 추출해 "{YYYY}-01" ~ ym 인클루시브 범위로 차원별 스택 시리즈를 만든다.
// 모든 표준 차원은 facts.ts 큐브 인덱스를 직접 룩업. raw rows 전체 스캔 금지.

import type { FactCube, FactCell } from "./facts";
import type { Category, ChannelGroup } from "@/config/mappings";
import type { SalesRow } from "./load";
import { filterMonth, enumerateMonths } from "./aggregate";
import { CATEGORY_COLOR, CHANNEL_GROUP_COLOR, BRAND_COLOR } from "./labels";

export type YTDSeries = { name: string; values: number[]; color?: string };

// ym → ["{YYYY}-01", …, ym]. ym=2026-04 → 4개 / ym=2026-01 → 1개.
export function ytdMonths(ym: string): string[] {
  const year = ym.slice(0, 4);
  return enumerateMonths(`${year}-01`, ym);
}

// 한국식 월 라벨. ["2026-01","2026-02",…] → ["1월","2월",…]
export function ytdMonthLabels(ym: string): string[] {
  return ytdMonths(ym).map((m) => `${Number(m.slice(5, 7))}월`);
}

// ── 표준 차원 시리즈 ─────────────────────────────────────

const CATEGORY_ORDER: Category[] = ["수출", "B2B", "B2C", "면세점"];

export function ytdCategorySeries(cube: FactCube, ym: string): YTDSeries[] {
  const months = ytdMonths(ym);
  return CATEGORY_ORDER.map((cat) => ({
    name: cat,
    color: CATEGORY_COLOR[cat],
    values: months.map((m) => cube.byMonthCategory.get(m)?.get(cat)?.revenue ?? 0),
  })).filter((s) => s.values.some((v) => v > 0));
}

const CHANNEL_GROUP_ORDER: ChannelGroup[] = [
  "자사 공식몰",
  "종합몰",
  "소호몰",
  "임직원/패밀리",
  "기타",
];

export function ytdChannelGroupSeries(cube: FactCube, ym: string): YTDSeries[] {
  const months = ytdMonths(ym);
  return CHANNEL_GROUP_ORDER.map((g) => ({
    name: g,
    color: CHANNEL_GROUP_COLOR[g],
    values: months.map((m) => {
      const cell = cube.byMonthBrandChannelGroup.get(m);
      if (!cell) return 0;
      let sum = 0;
      for (const gm of cell.values()) sum += gm.get(g)?.revenue ?? 0;
      return sum;
    }),
  })).filter((s) => s.values.some((v) => v > 0));
}

// 공통: 키별 누적합 상위 N + 기타 합산
function topNStackSeries(
  months: string[],
  monthlyCells: Map<string, FactCell>[],     // months.length === monthlyCells.length
  topN: number,
  colorMap?: Record<string, string>,
): YTDSeries[] {
  // 키별 누적합 계산
  const totals = new Map<string, number>();
  for (const cells of monthlyCells) {
    for (const [k, c] of cells) {
      if (c.revenue <= 0) continue;
      totals.set(k, (totals.get(k) ?? 0) + c.revenue);
    }
  }
  if (totals.size === 0) return [];
  const sortedKeys = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  const topKeys = sortedKeys.slice(0, topN);
  const restKeys = new Set(sortedKeys.slice(topN));

  const series: YTDSeries[] = topKeys.map((k) => ({
    name: k,
    color: colorMap?.[k],
    values: months.map((_, i) => monthlyCells[i].get(k)?.revenue ?? 0),
  }));

  if (restKeys.size > 0) {
    const restValues = months.map((_, i) => {
      let sum = 0;
      for (const k of restKeys) sum += monthlyCells[i].get(k)?.revenue ?? 0;
      return sum;
    });
    if (restValues.some((v) => v > 0)) {
      series.push({ name: "기타", values: restValues, color: "#9ca3af" });
    }
  }
  return series.filter((s) => s.values.some((v) => v > 0));
}

export function ytdCountrySeries(cube: FactCube, ym: string, topN = 5): YTDSeries[] {
  const months = ytdMonths(ym);
  const cells = months.map((m) => cube.byMonthCountry.get(m) ?? new Map());
  return topNStackSeries(months, cells, topN);
}

export function ytdDealerSeries(cube: FactCube, ym: string, topN = 5): YTDSeries[] {
  const months = ytdMonths(ym);
  const cells = months.map((m) => cube.byMonthDealer.get(m) ?? new Map());
  return topNStackSeries(months, cells, topN);
}

export function ytdBrandSeries(cube: FactCube, ym: string, topN = 6): YTDSeries[] {
  const months = ytdMonths(ym);
  const cells = months.map((m) => cube.byMonthBrand.get(m) ?? new Map());
  return topNStackSeries(months, cells, topN, BRAND_COLOR);
}

// 거래처 전체 또는 특정 카테고리 필터.
export function ytdCustomerSeries(
  cube: FactCube,
  ym: string,
  topN = 5,
  filter?: { category?: Category },
): YTDSeries[] {
  const months = ytdMonths(ym);
  const cells = months.map((m) => {
    const src = cube.byMonthCustomer.get(m) ?? new Map();
    if (!filter?.category) return src;
    const out = new Map<string, FactCell>();
    for (const [cust, cell] of src) {
      const cat = cube.customerToCategory.get(cust);
      if (cat === filter.category) out.set(cust, cell);
    }
    return out;
  });
  return topNStackSeries(months, cells, topN);
}

// 변동 분석 탭용: 차원 키별 토글.
export type YTDDim = "category" | "channelGroup" | "country" | "dealer" | "brand" | "customer" | "channel" | "product";

export function ytdByDim(cube: FactCube, ym: string, dim: YTDDim, topN = 5): YTDSeries[] {
  switch (dim) {
    case "category": return ytdCategorySeries(cube, ym);
    case "channelGroup": return ytdChannelGroupSeries(cube, ym);
    case "country": return ytdCountrySeries(cube, ym, topN);
    case "dealer": return ytdDealerSeries(cube, ym, topN);
    case "brand": return ytdBrandSeries(cube, ym, topN);
    case "customer": return ytdCustomerSeries(cube, ym, topN);
    case "channel": {
      const months = ytdMonths(ym);
      const cells = months.map((m) => cube.byMonthChannel.get(m) ?? new Map());
      return topNStackSeries(months, cells, topN);
    }
    case "product": {
      const months = ytdMonths(ym);
      const cells: Map<string, FactCell>[] = months.map((m) => {
        const pm = cube.byMonthProduct.get(m);
        if (!pm) return new Map();
        const out = new Map<string, FactCell>();
        for (const [k, pc] of pm) out.set(pc.productName || k, pc);
        return out;
      });
      return topNStackSeries(months, cells, topN);
    }
  }
}

// ── 단일 엔티티 필터 (큐브 인덱스 없음 → 한 달치 raw 한 번 스캔) ─────────

// 브랜드 한 곳 → 카테고리(수출/B2B/B2C/면세점) 분해
export function ytdCategoryForBrandSeries(
  rows: SalesRow[],
  ym: string,
  brand: string,
): YTDSeries[] {
  const months = ytdMonths(ym);
  const sums: Record<Category, number[]> = {
    수출: months.map(() => 0),
    B2B: months.map(() => 0),
    B2C: months.map(() => 0),
    면세점: months.map(() => 0),
  };
  months.forEach((m, i) => {
    for (const r of filterMonth(rows, m)) {
      if (r.isNonRevenue) continue;
      if (r.brand !== brand) continue;
      sums[r.category][i] += r.realRevenue;
    }
  });
  return CATEGORY_ORDER.map((cat) => ({
    name: cat,
    color: CATEGORY_COLOR[cat],
    values: sums[cat],
  })).filter((s) => s.values.some((v) => v > 0));
}

// 거래처 한 곳 → 브랜드 Top N + 기타 분해
export function ytdBrandForCustomerSeries(
  rows: SalesRow[],
  ym: string,
  customer: string,
  topN = 5,
): YTDSeries[] {
  const months = ytdMonths(ym);
  const monthlyCells: Map<string, FactCell>[] = months.map(() => new Map());
  months.forEach((m, i) => {
    for (const r of filterMonth(rows, m)) {
      if (r.isNonRevenue) continue;
      if (r.customer !== customer) continue;
      const key = r.brand || "기타";
      const cell = monthlyCells[i].get(key);
      if (cell) {
        cell.revenue += r.realRevenue;
      } else {
        monthlyCells[i].set(key, {
          revenue: r.realRevenue,
          qty: 0,
          orders: new Set(),
          discount: 0, fee: 0, shippingFee: 0, settlement: 0, orderAmount: 0,
          gpSum: 0, gpRevenueBase: 0, costMissingCount: 0, rowCount: 0,
        });
      }
    }
  });
  return topNStackSeries(months, monthlyCells, topN, BRAND_COLOR);
}
