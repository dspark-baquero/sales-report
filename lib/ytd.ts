// 올해 월별 매출 추이 (Year-to-Date) 시리즈 빌더.
// ym 의 연도를 추출해 "{YYYY}-01" ~ ym 인클루시브 범위로 차원별 스택 시리즈를 만든다.
// 모든 표준 차원은 facts.ts 큐브 인덱스를 직접 룩업. raw rows 전체 스캔 금지.

import type { FactCube, FactCell } from "./facts";
import type { Category, ChannelGroup } from "@/config/mappings";
import type { SalesRow } from "./load";
import { filterMonth, filterRange, enumerateMonths } from "./aggregate";
import { nextMonthsInYear, prevYearSameMonth } from "./compare";
import { CATEGORY_COLOR, CHANNEL_GROUP_COLOR, BRAND_COLOR } from "./labels";
import type { TargetRow } from "./targets";
import { isProspectiveKey } from "./targets";

export type YTDSeries = { name: string; values: number[]; color?: string };

// ym → ["{YYYY}-01", …, ym]. ym=2026-04 → 4개 / ym=2026-01 → 1개.
export function ytdMonths(ym: string): string[] {
  const year = ym.slice(0, 4);
  return enumerateMonths(`${year}-01`, ym);
}

// 월별 추이 차트에 붙일 전망(미래) 슬롯 개월 수. 연내 남은 달이 부족하면 그만큼만.
export const OUTLOOK_MONTHS = 2;

// ytdMonths + 연내 다음 N개월(전망). 연말이라 남은 달이 부족하면 남은 만큼만 붙는다.
// 전망 월들은 실매출이 아직 없고 목표·전년 오버레이만 그리는 "전망" 칸 용도.
export function ytdMonthsWithOutlook(ym: string): string[] {
  return [...ytdMonths(ym), ...nextMonthsInYear(ym, OUTLOOK_MONTHS)];
}

// 전망 슬롯의 전년 값 계산에 필요한 "작년 동월" ym 리스트.
// nextMonthsInYear(ym, OUTLOOK_MONTHS) 각각의 작년 동월을 반환한다.
// 페이지에서 이 월들의 매출을 로드해 ytdMonthlyPrevYear 의 prevYearRows 에 합쳐야
// 전망 슬롯의 전년 라인이 채워진다.
export function outlookPrevYearMonths(ym: string): string[] {
  return nextMonthsInYear(ym, OUTLOOK_MONTHS).map(prevYearSameMonth);
}

// 한국식 월 라벨. ["2026-01","2026-02",…] → ["1월","2월",…]
export function ytdMonthLabels(ym: string): string[] {
  return ytdMonths(ym).map((m) => `${Number(m.slice(5, 7))}월`);
}

// ── 표준 차원 시리즈 ─────────────────────────────────────

const CATEGORY_ORDER: Category[] = ["B2B", "B2C", "면세점", "수출"];

export function ytdCategorySeries(cube: FactCube, ym: string): YTDSeries[] {
  const months = ytdMonths(ym);
  return CATEGORY_ORDER.map((cat) => ({
    name: cat,
    color: CATEGORY_COLOR[cat],
    values: months.map((m) => cube.byMonthCategory.get(m)?.get(cat)?.revenue ?? 0),
  })).filter((s) => s.values.some((v) => v > 0));
}

// B2B→B2B(대리점 제외)+대리점, B2C→B2C(바크로하우스 제외)+바크로하우스 분리 버전
export function ytdCategoryDetailSeries(cube: FactCube, ym: string): YTDSeries[] {
  const months = ytdMonths(ym);

  const agencyValues = months.map((m) =>
    cube.byMonthB2bType.get(m)?.get("대리점")?.revenue ?? 0,
  );
  // 바크로하우스 메인몰만 별도 라인으로 분리. 스마트스토어는 B2C(자사 공식몰)에 포함.
  const bhValues = months.map((m) =>
    cube.byMonthChannel.get(m)?.get("바크로하우스")?.revenue ?? 0,
  );

  const series: YTDSeries[] = [
    {
      name: "B2B",
      color: CATEGORY_COLOR["B2B"],
      values: months.map((m, i) => {
        const total = cube.byMonthCategory.get(m)?.get("B2B")?.revenue ?? 0;
        return total - agencyValues[i];
      }),
    },
    { name: "대리점", color: "#a78bfa", values: agencyValues },
    {
      name: "B2C",
      color: CATEGORY_COLOR["B2C"],
      values: months.map((m, i) => {
        const total = cube.byMonthCategory.get(m)?.get("B2C")?.revenue ?? 0;
        return total - bhValues[i];
      }),
    },
    { name: "바크로하우스", color: "#6ee7b7", values: bhValues },
    {
      name: "면세점",
      color: CATEGORY_COLOR["면세점"],
      values: months.map((m) => cube.byMonthCategory.get(m)?.get("면세점")?.revenue ?? 0),
    },
    {
      name: "수출",
      color: CATEGORY_COLOR["수출"],
      values: months.map((m) => cube.byMonthCategory.get(m)?.get("수출")?.revenue ?? 0),
    },
  ];

  return series.filter((s) => s.values.some((v) => v > 0));
}

const CHANNEL_GROUP_ORDER: ChannelGroup[] = [
  "자사 공식몰",
  "종합몰",
  "소호몰",
  "백화점",
  "임직원/패밀리",
  "기타",
];

export function ytdChannelGroupSeries(cube: FactCube, ym: string): YTDSeries[] {
  const months = ytdMonths(ym);

  // 바크로하우스 메인몰만 자사 공식몰에서 차감. 스마트스토어는 B2C에 포함.
  const bhValues = months.map((m) =>
    cube.byMonthChannel.get(m)?.get("바크로하우스")?.revenue ?? 0,
  );

  return CHANNEL_GROUP_ORDER.map((g) => ({
    name: g,
    color: CHANNEL_GROUP_COLOR[g],
    values: months.map((m, i) => {
      const cell = cube.byMonthBrandChannelGroup.get(m);
      if (!cell) return 0;
      let sum = 0;
      for (const gm of cell.values()) sum += gm.get(g)?.revenue ?? 0;
      if (g === "자사 공식몰") sum -= bhValues[i];
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

// ── YTD 달성도 (목표 vs 실적) ─────────────────────────────

export type YTDAchievement = {
  ytdActual: number;
  ytdTarget: number;
  rate: number | null;    // null when ytdTarget === 0
  diff: number;           // actual - target
  monthsElapsed: number;  // 1~12
};

export function buildYTDAchievement(
  rows: SalesRow[],
  targets: TargetRow[],
  ym: string,
  opts?: {
    rowFilter?: (r: SalesRow) => boolean;
    targetFilter?: (t: TargetRow) => boolean;
  },
): YTDAchievement {
  const year = ym.slice(0, 4);
  const monthSet = new Set(enumerateMonths(`${year}-01`, ym));

  let ytdTarget = 0;
  for (const t of targets) {
    if (!monthSet.has(t.yearMonth)) continue;
    if (isProspectiveKey(t.division, t.customerKey)) continue;
    if (opts?.targetFilter && !opts.targetFilter(t)) continue;
    ytdTarget += t.target;
  }

  let ytdActual = 0;
  for (const r of filterRange(rows, `${year}-01`, ym)) {
    if (r.isNonRevenue) continue;
    if (opts?.rowFilter && !opts.rowFilter(r)) continue;
    ytdActual += r.realRevenue;
  }

  return {
    ytdActual,
    ytdTarget,
    rate: ytdTarget > 0 ? ytdActual / ytdTarget : null,
    diff: ytdActual - ytdTarget,
    monthsElapsed: Number(ym.slice(5, 7)),
  };
}

// 전체 국내 (필터 없음)
export function ytdAchievementOverall(
  rows: SalesRow[],
  targets: TargetRow[],
  ym: string,
): YTDAchievement {
  return buildYTDAchievement(rows, targets, ym);
}

// 브랜드 1개 — target 의 brand 필드와 row 의 brand 필드 일치
export function ytdAchievementForBrand(
  rows: SalesRow[],
  targets: TargetRow[],
  ym: string,
  brand: string,
): YTDAchievement {
  return buildYTDAchievement(rows, targets, ym, {
    rowFilter: (r) => r.brand === brand,
    targetFilter: (t) => t.brand === brand,
  });
}

// target 의 customerKey ∈ keys + row 가 rowMatch (대분류 등) 통과
export function ytdAchievementForCustomerKeys(
  rows: SalesRow[],
  targets: TargetRow[],
  ym: string,
  customerKeys: string[],
  rowMatch: (r: SalesRow) => boolean,
): YTDAchievement {
  const keySet = new Set(customerKeys);
  return buildYTDAchievement(rows, targets, ym, {
    rowFilter: rowMatch,
    targetFilter: (t) => keySet.has(t.customerKey),
  });
}

// ── 월별 비교 오버레이 데이터 ─────────────────────────────
// YTD 스택 차트 위에 그릴 "월별 목표"와 "전년 동기 매출" 두 라인 데이터.
// ytdMonths(ym)와 1:1 정렬된 number[] 반환.

// 각 월의 목표 합계 배열. prospective 키 자동 제외.
// opts.outlook=true 면 연내 다음 달(전망) 슬롯을 하나 더 붙인다(목표는 미래 월도 존재).
export function ytdMonthlyTargets(
  targets: TargetRow[],
  ym: string,
  opts?: { targetFilter?: (t: TargetRow) => boolean; outlook?: boolean },
): number[] {
  const months = opts?.outlook ? ytdMonthsWithOutlook(ym) : ytdMonths(ym);
  const monthIdx = new Map(months.map((m, i) => [m, i]));
  const out = months.map(() => 0);
  for (const t of targets) {
    const i = monthIdx.get(t.yearMonth);
    if (i === undefined) continue;
    if (isProspectiveKey(t.division, t.customerKey)) continue;
    if (opts?.targetFilter && !opts.targetFilter(t)) continue;
    out[i] += t.target;
  }
  return out;
}

// 각 월의 전년 동기 매출 배열. prevYearRows = 작년 1월~작년 (ym월) 매출.
// 작년 r.yearMonth("2025-03")를 +1년 시프트해 olympics 슬롯("2026-03")에 합산.
// opts.outlook=true 면 전망 슬롯을 하나 더 붙인다. 이때 prevYearRows 에 작년 (ym+1)월도
// 포함돼 있어야 전망 슬롯의 전년 값이 채워진다(없으면 0).
export function ytdMonthlyPrevYear(
  prevYearRows: SalesRow[],
  ym: string,
  opts?: { rowFilter?: (r: SalesRow) => boolean; outlook?: boolean },
): number[] {
  const months = opts?.outlook ? ytdMonthsWithOutlook(ym) : ytdMonths(ym);
  const monthIdx = new Map(months.map((m, i) => [m, i]));
  const out = months.map(() => 0);
  for (const r of prevYearRows) {
    if (r.isNonRevenue) continue;
    if (opts?.rowFilter && !opts.rowFilter(r)) continue;
    const [y, m] = r.yearMonth.split("-");
    const shifted = `${Number(y) + 1}-${m}`;
    const i = monthIdx.get(shifted);
    if (i === undefined) continue;
    out[i] += r.realRevenue;
  }
  return out;
}
