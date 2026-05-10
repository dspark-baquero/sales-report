// 월별 차원별 사전 집계 큐브.
// CSV 로드 시 한 번 빌드해 모듈 캐시. 모든 탭이 공유.
//
// 핵심: 페이지가 raw rows에서 매번 kpi/group을 다시 돌리는 대신,
// 미리 cellize된 차원별 합계 셀을 룩업+합산. 159k 행 스캔 → 수십 셀 합산.

import type { SalesRow } from "./load";
import type {
  Category,
  ChannelGroup,
  BrandHouse,
} from "@/config/mappings";
import type { Kpi } from "./aggregate";

// ── 셀 타입 ──────────────────────────────────────────────
export type FactCell = {
  revenue: number;
  qty: number;
  orders: Set<string>;       // distinct 주문번호
  discount: number;
  fee: number;
  shippingFee: number;
  settlement: number;
  orderAmount: number;
  gpSum: number;             // null cost 행 제외
  gpRevenueBase: number;     // gp 계산에 들어간 실매출 합 (gpMargin 분모)
  costMissingCount: number;
  rowCount: number;
};

export type ProductFactCell = FactCell & {
  productName: string;
  brand: string;
  productCode: string;
};

export type NonRevCell = {
  qty: number;
  cost: number;
  rowCount: number;
};

export type DailyCell = {
  revenue: number;
  qty: number;
};

function newCell(): FactCell {
  return {
    revenue: 0, qty: 0, orders: new Set<string>(),
    discount: 0, fee: 0, shippingFee: 0, settlement: 0, orderAmount: 0,
    gpSum: 0, gpRevenueBase: 0, costMissingCount: 0, rowCount: 0,
  };
}

function addRow(cell: FactCell, r: SalesRow): void {
  cell.revenue += r.realRevenue;
  cell.qty += r.qty;
  if (r.orderNo) cell.orders.add(r.orderNo);
  cell.discount += r.discount;
  cell.fee += r.fee;
  cell.shippingFee += r.shippingFee;
  cell.settlement += r.settlement;
  cell.orderAmount += r.orderAmount;
  if (r.gp === null) {
    cell.costMissingCount++;
  } else {
    cell.gpSum += r.gp;
    cell.gpRevenueBase += r.realRevenue;
  }
  cell.rowCount++;
}

// 셀 합산 — 새 셀 반환 (orders Set은 union)
export function mergeCells(cells: Iterable<FactCell>): FactCell {
  const out = newCell();
  for (const c of cells) {
    out.revenue += c.revenue;
    out.qty += c.qty;
    for (const o of c.orders) out.orders.add(o);
    out.discount += c.discount;
    out.fee += c.fee;
    out.shippingFee += c.shippingFee;
    out.settlement += c.settlement;
    out.orderAmount += c.orderAmount;
    out.gpSum += c.gpSum;
    out.gpRevenueBase += c.gpRevenueBase;
    out.costMissingCount += c.costMissingCount;
    out.rowCount += c.rowCount;
  }
  return out;
}

// FactCell → Kpi (aggregate.ts:Kpi 와 동일 시그니처)
export function cellToKpi(c: FactCell): Kpi {
  return {
    revenue: c.revenue,
    orders: c.orders.size,
    aov: c.orders.size ? c.revenue / c.orders.size : 0,
    qty: c.qty,
    settlement: c.settlement,
    gp: c.gpSum,
    gpMargin: c.gpRevenueBase ? c.gpSum / c.gpRevenueBase : 0,
    costMissingRate: c.rowCount ? c.costMissingCount / c.rowCount : 0,
  };
}

// ── 큐브 구조 ────────────────────────────────────────────
export type FactCube = {
  // 매출 행 1D 인덱스
  byMonth: Map<string, FactCell>;
  byMonthCategory: Map<string, Map<Category, FactCell>>;
  byMonthChannelGroup: Map<string, Map<ChannelGroup, FactCell>>;
  byMonthChannel: Map<string, Map<string, FactCell>>;
  byMonthBrand: Map<string, Map<string, FactCell>>;
  byMonthBrandHouse: Map<string, Map<BrandHouse, FactCell>>;
  byMonthCustomer: Map<string, Map<string, FactCell>>;
  byMonthDealer: Map<string, Map<string, FactCell>>;            // B2B만
  byMonthCountry: Map<string, Map<string, FactCell>>;           // 수출만
  byMonthB2bType: Map<string, Map<string, FactCell>>;           // B2B만
  // 2D 인덱스
  byMonthDealerType: Map<string, Map<string, Map<string, FactCell>>>;
  byMonthBrandChannelGroup: Map<string, Map<string, Map<ChannelGroup, FactCell>>>; // B2C
  byMonthCountryBrand: Map<string, Map<string, Map<string, FactCell>>>;            // 수출
  // 딜러별 활성 거래처 Set (active customer count 용)
  byMonthDealerCustomers: Map<string, Map<string, Set<string>>>;
  // 제품
  byMonthProduct: Map<string, Map<string, ProductFactCell>>;
  // 비매출
  byMonthNonRevBizType: Map<string, Map<string, NonRevCell>>;
  // 일별
  byMonthDay: Map<string, Map<number, DailyCell>>;
  // 메타
  monthsAsc: string[];                          // 데이터에 존재하는 월 (오름차순)
  customers: Set<string>;
  dealers: Set<string>;
  brands: Set<string>;
  channels: Set<string>;
  countries: Set<string>;
  customerToCategory: Map<string, Category>;    // 거래처 → 대표 카테고리 (전체 기간 매출 최대)
  customerToBrand: Map<string, string>;         // 거래처 → 대표 브랜드 (전체 기간 매출 최대)
  customerToDealer: Map<string, string>;        // B2B 거래처 → 담당 딜러 (전체 기간 매출 최대)
};

function get2D<K1, K2, V>(m: Map<K1, Map<K2, V>>, k1: K1, k2: K2): V | undefined {
  return m.get(k1)?.get(k2);
}

function ensure<K, V>(m: Map<K, V>, k: K, mk: () => V): V {
  let v = m.get(k);
  if (!v) { v = mk(); m.set(k, v); }
  return v;
}

export function buildFactCube(rows: SalesRow[]): FactCube {
  const cube: FactCube = {
    byMonth: new Map(),
    byMonthCategory: new Map(),
    byMonthChannelGroup: new Map(),
    byMonthChannel: new Map(),
    byMonthBrand: new Map(),
    byMonthBrandHouse: new Map(),
    byMonthCustomer: new Map(),
    byMonthDealer: new Map(),
    byMonthCountry: new Map(),
    byMonthB2bType: new Map(),
    byMonthDealerType: new Map(),
    byMonthBrandChannelGroup: new Map(),
    byMonthCountryBrand: new Map(),
    byMonthDealerCustomers: new Map(),
    byMonthProduct: new Map(),
    byMonthNonRevBizType: new Map(),
    byMonthDay: new Map(),
    monthsAsc: [],
    customers: new Set(),
    dealers: new Set(),
    brands: new Set(),
    channels: new Set(),
    countries: new Set(),
    customerToCategory: new Map(),
    customerToBrand: new Map(),
    customerToDealer: new Map(),
  };

  const monthSet = new Set<string>();
  // 거래처 → 카테고리/브랜드/딜러 매출 누적 (대표값 추출용)
  const custCatSum = new Map<string, Map<Category, number>>();
  const custBrandSum = new Map<string, Map<string, number>>();
  const custDealerSum = new Map<string, Map<string, number>>();

  for (const r of rows) {
    const ym = r.yearMonth;
    monthSet.add(ym);

    if (r.isNonRevenue) {
      const types = ensure(cube.byMonthNonRevBizType, ym, () => new Map<string, NonRevCell>());
      const k = r.bizType || "(기타)";
      const cell = ensure(types, k, () => ({ qty: 0, cost: 0, rowCount: 0 }));
      cell.qty += r.qty;
      if (r.cost !== null) cell.cost += r.cost;
      cell.rowCount++;
      continue;
    }

    if (r.brand) cube.brands.add(r.brand);
    if (r.channel) cube.channels.add(r.channel);
    if (r.customer) cube.customers.add(r.customer);
    if (r.dealer) cube.dealers.add(r.dealer);
    if (r.country) cube.countries.add(r.country);

    addRow(ensure(cube.byMonth, ym, newCell), r);
    addRow(ensure(ensure(cube.byMonthCategory, ym, () => new Map()), r.category, newCell), r);
    addRow(ensure(ensure(cube.byMonthChannelGroup, ym, () => new Map()), r.channelGroup, newCell), r);
    if (r.channel) addRow(ensure(ensure(cube.byMonthChannel, ym, () => new Map()), r.channel, newCell), r);
    if (r.brand) addRow(ensure(ensure(cube.byMonthBrand, ym, () => new Map()), r.brand, newCell), r);
    addRow(ensure(ensure(cube.byMonthBrandHouse, ym, () => new Map()), r.brandHouse, newCell), r);
    if (r.customer) addRow(ensure(ensure(cube.byMonthCustomer, ym, () => new Map()), r.customer, newCell), r);

    if (r.category === "B2B" && r.dealer) {
      addRow(ensure(ensure(cube.byMonthDealer, ym, () => new Map()), r.dealer, newCell), r);
      // 딜러 → 활성 거래처 Set
      const dCustMap = ensure(cube.byMonthDealerCustomers, ym, () => new Map<string, Set<string>>());
      const set = ensure(dCustMap, r.dealer, () => new Set<string>());
      if (r.customer) set.add(r.customer);
    }
    if (r.category === "수출") {
      const c = r.country ?? "기타";
      addRow(ensure(ensure(cube.byMonthCountry, ym, () => new Map()), c, newCell), r);
      const cMap = ensure(cube.byMonthCountryBrand, ym, () => new Map<string, Map<string, FactCell>>());
      const bMap = ensure(cMap, c, () => new Map<string, FactCell>());
      addRow(ensure(bMap, r.brand || "기타", newCell), r);
    }
    if (r.category === "B2B") {
      const t = r.b2bCustomerType ?? "기타";
      addRow(ensure(ensure(cube.byMonthB2bType, ym, () => new Map()), t, newCell), r);
      const dMap = ensure(cube.byMonthDealerType, ym, () => new Map<string, Map<string, FactCell>>());
      const tMap = ensure(dMap, r.dealer, () => new Map<string, FactCell>());
      addRow(ensure(tMap, t, newCell), r);
    }
    if (r.category === "B2C" && r.brand) {
      const bMap = ensure(cube.byMonthBrandChannelGroup, ym, () => new Map<string, Map<ChannelGroup, FactCell>>());
      const gMap = ensure(bMap, r.brand, () => new Map<ChannelGroup, FactCell>());
      addRow(ensure(gMap, r.channelGroup, newCell), r);
    }

    if (r.productName || r.productCode) {
      const pMap = ensure(cube.byMonthProduct, ym, () => new Map<string, ProductFactCell>());
      const key = r.productCode || r.productName;
      let pcell = pMap.get(key);
      if (!pcell) {
        pcell = {
          ...newCell(),
          productName: r.productName,
          brand: r.brand,
          productCode: r.productCode,
        } as ProductFactCell;
        pMap.set(key, pcell);
      }
      addRow(pcell, r);
    }

    const dMap2 = ensure(cube.byMonthDay, ym, () => new Map<number, DailyCell>());
    const day = r.date.getUTCDate();
    const dcell = ensure(dMap2, day, () => ({ revenue: 0, qty: 0 }));
    dcell.revenue += r.realRevenue;
    dcell.qty += r.qty;

    // 거래처 → 대표 카테고리/브랜드/딜러 누적
    if (r.customer) {
      const cm = ensure(custCatSum, r.customer, () => new Map<Category, number>());
      cm.set(r.category, (cm.get(r.category) ?? 0) + r.realRevenue);
      if (r.brand) {
        const bm = ensure(custBrandSum, r.customer, () => new Map<string, number>());
        bm.set(r.brand, (bm.get(r.brand) ?? 0) + r.realRevenue);
      }
      if (r.category === "B2B" && r.dealer && r.dealer !== "미지정") {
        const dm = ensure(custDealerSum, r.customer, () => new Map<string, number>());
        dm.set(r.dealer, (dm.get(r.dealer) ?? 0) + r.realRevenue);
      }
    }
  }

  cube.monthsAsc = [...monthSet].sort();

  // 대표값 결정 (매출 최대)
  for (const [c, m] of custCatSum) {
    let best: Category = "B2C", bestV = -1;
    for (const [k, v] of m) if (v > bestV) { best = k; bestV = v; }
    cube.customerToCategory.set(c, best);
  }
  for (const [c, m] of custBrandSum) {
    let best = "", bestV = -1;
    for (const [k, v] of m) if (v > bestV) { best = k; bestV = v; }
    if (best) cube.customerToBrand.set(c, best);
  }
  for (const [c, m] of custDealerSum) {
    let best = "", bestV = -1;
    for (const [k, v] of m) if (v > bestV) { best = k; bestV = v; }
    if (best) cube.customerToDealer.set(c, best);
  }

  return cube;
}

// ── 큐브 위 헬퍼 ─────────────────────────────────────────

export function cubeMonthKpi(cube: FactCube, ym: string): Kpi {
  const cell = cube.byMonth.get(ym);
  return cellToKpi(cell ?? newCell());
}

export function cubeMonthCategoryKpi(cube: FactCube, ym: string, cat: Category): Kpi {
  const cell = get2D(cube.byMonthCategory, ym, cat);
  return cellToKpi(cell ?? newCell());
}

export function cubeMonthChannelGroupKpi(cube: FactCube, ym: string, g: ChannelGroup): Kpi {
  const cell = get2D(cube.byMonthChannelGroup, ym, g);
  return cellToKpi(cell ?? newCell());
}

export function cubeMonthCategoryRevenue(cube: FactCube, ym: string): Record<Category, number> {
  const out: Record<Category, number> = { 수출: 0, B2B: 0, B2C: 0, 면세점: 0 };
  const m = cube.byMonthCategory.get(ym);
  if (!m) return out;
  for (const [cat, cell] of m) out[cat] = cell.revenue;
  return out;
}

// 범위 KPI (분기 누적 등). opts로 카테고리/채널그룹 슬라이스 가능.
export function cubeRangeKpi(
  cube: FactCube,
  fromYM: string,
  toYM: string,
  opts?: { category?: Category; channelGroup?: ChannelGroup; brand?: string },
): Kpi {
  const cells: FactCell[] = [];
  for (const ym of cube.monthsAsc) {
    if (ym < fromYM || ym > toYM) continue;
    if (opts?.category) {
      const c = get2D(cube.byMonthCategory, ym, opts.category);
      if (c) cells.push(c);
    } else if (opts?.channelGroup) {
      const c = get2D(cube.byMonthChannelGroup, ym, opts.channelGroup);
      if (c) cells.push(c);
    } else if (opts?.brand) {
      const c = get2D(cube.byMonthBrand, ym, opts.brand);
      if (c) cells.push(c);
    } else {
      const c = cube.byMonth.get(ym);
      if (c) cells.push(c);
    }
  }
  return cellToKpi(mergeCells(cells));
}

export const cubeMonthCustomerCells = (cube: FactCube, ym: string): Map<string, FactCell> =>
  cube.byMonthCustomer.get(ym) ?? new Map();

export const cubeMonthDealerCells = (cube: FactCube, ym: string): Map<string, FactCell> =>
  cube.byMonthDealer.get(ym) ?? new Map();

export const cubeMonthChannelCells = (cube: FactCube, ym: string): Map<string, FactCell> =>
  cube.byMonthChannel.get(ym) ?? new Map();

export const cubeMonthBrandCells = (cube: FactCube, ym: string): Map<string, FactCell> =>
  cube.byMonthBrand.get(ym) ?? new Map();

export const cubeMonthCountryCells = (cube: FactCube, ym: string): Map<string, FactCell> =>
  cube.byMonthCountry.get(ym) ?? new Map();

export const cubeMonthChannelGroupCells = (cube: FactCube, ym: string): Map<ChannelGroup, FactCell> =>
  cube.byMonthChannelGroup.get(ym) ?? new Map();

export const cubeMonthProductCells = (cube: FactCube, ym: string): Map<string, ProductFactCell> =>
  cube.byMonthProduct.get(ym) ?? new Map();

export const cubeMonthB2bTypeCells = (cube: FactCube, ym: string): Map<string, FactCell> =>
  cube.byMonthB2bType.get(ym) ?? new Map();

// 거래처의 N개월 시계열
export function cubeCustomerSeries(
  cube: FactCube,
  customer: string,
  fromYM: string,
  toYM: string,
): { yearMonth: string; revenue: number; qty: number; orders: number }[] {
  const out: { yearMonth: string; revenue: number; qty: number; orders: number }[] = [];
  for (const ym of cube.monthsAsc) {
    if (ym < fromYM || ym > toYM) continue;
    const cell = get2D(cube.byMonthCustomer, ym, customer);
    out.push({
      yearMonth: ym,
      revenue: cell?.revenue ?? 0,
      qty: cell?.qty ?? 0,
      orders: cell?.orders.size ?? 0,
    });
  }
  return out;
}

// 딜러의 N개월 시계열 + 활성 거래처 수
export function cubeDealerSeries(
  cube: FactCube,
  dealer: string,
  fromYM: string,
  toYM: string,
): { yearMonth: string; revenue: number; activeCustomers: number }[] {
  const out: { yearMonth: string; revenue: number; activeCustomers: number }[] = [];
  for (const ym of cube.monthsAsc) {
    if (ym < fromYM || ym > toYM) continue;
    const cell = get2D(cube.byMonthDealer, ym, dealer);
    const custSet = cube.byMonthDealerCustomers.get(ym)?.get(dealer);
    out.push({
      yearMonth: ym,
      revenue: cell?.revenue ?? 0,
      activeCustomers: custSet?.size ?? 0,
    });
  }
  return out;
}

// 브랜드의 N개월 시계열
export function cubeBrandSeries(
  cube: FactCube,
  brand: string,
  fromYM: string,
  toYM: string,
): { yearMonth: string; revenue: number; qty: number }[] {
  const out: { yearMonth: string; revenue: number; qty: number }[] = [];
  for (const ym of cube.monthsAsc) {
    if (ym < fromYM || ym > toYM) continue;
    const cell = get2D(cube.byMonthBrand, ym, brand);
    out.push({ yearMonth: ym, revenue: cell?.revenue ?? 0, qty: cell?.qty ?? 0 });
  }
  return out;
}

// 국가의 N개월 시계열
export function cubeCountrySeries(
  cube: FactCube,
  country: string,
  fromYM: string,
  toYM: string,
): { yearMonth: string; revenue: number }[] {
  const out: { yearMonth: string; revenue: number }[] = [];
  for (const ym of cube.monthsAsc) {
    if (ym < fromYM || ym > toYM) continue;
    const cell = get2D(cube.byMonthCountry, ym, country);
    out.push({ yearMonth: ym, revenue: cell?.revenue ?? 0 });
  }
  return out;
}

// 채널의 N개월 시계열
export function cubeChannelSeries(
  cube: FactCube,
  channel: string,
  fromYM: string,
  toYM: string,
): { yearMonth: string; revenue: number }[] {
  const out: { yearMonth: string; revenue: number }[] = [];
  for (const ym of cube.monthsAsc) {
    if (ym < fromYM || ym > toYM) continue;
    const cell = get2D(cube.byMonthChannel, ym, channel);
    out.push({ yearMonth: ym, revenue: cell?.revenue ?? 0 });
  }
  return out;
}

// 거래처가 한 달에 가지는 카테고리 (대표값 — 매출 최대)
export function cubeCustomerCategory(cube: FactCube, customer: string): Category | null {
  return cube.customerToCategory.get(customer) ?? null;
}

// 거래처의 대표 브랜드
export function cubeCustomerBrand(cube: FactCube, customer: string): string | null {
  return cube.customerToBrand.get(customer) ?? null;
}

// 거래처의 담당 딜러 (B2B만)
export function cubeCustomerDealer(cube: FactCube, customer: string): string | null {
  return cube.customerToDealer.get(customer) ?? null;
}

// 카테고리 슬라이스 + 거래처 셀 Map
// 거래처는 보통 한 카테고리에만 속하므로 customerToCategory 로 필터.
export function cubeMonthCustomerCellsByCategory(
  cube: FactCube,
  ym: string,
  cat: Category,
): Map<string, FactCell> {
  const all = cube.byMonthCustomer.get(ym);
  if (!all) return new Map();
  const out = new Map<string, FactCell>();
  for (const [cust, cell] of all) {
    if (cube.customerToCategory.get(cust) === cat) {
      out.set(cust, cell);
    }
  }
  return out;
}

// 일별 누적 매출 (한 달)
export function cubeMonthDaily(cube: FactCube, ym: string): { day: number; revenue: number; qty: number }[] {
  const m = cube.byMonthDay.get(ym);
  if (!m) return [];
  return [...m.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([day, c]) => ({ day, revenue: c.revenue, qty: c.qty }));
}

// 비매출 출고 요약 (한 달)
export function cubeMonthNonRev(cube: FactCube, ym: string): { totalRows: number; totalQty: number; totalCost: number; byBizType: { bizType: string; rows: number; qty: number; cost: number }[] } {
  const m = cube.byMonthNonRevBizType.get(ym);
  if (!m) return { totalRows: 0, totalQty: 0, totalCost: 0, byBizType: [] };
  let totalRows = 0, totalQty = 0, totalCost = 0;
  const byBizType: { bizType: string; rows: number; qty: number; cost: number }[] = [];
  for (const [bizType, c] of m) {
    totalRows += c.rowCount;
    totalQty += c.qty;
    totalCost += c.cost;
    byBizType.push({ bizType, rows: c.rowCount, qty: c.qty, cost: c.cost });
  }
  byBizType.sort((a, b) => b.cost - a.cost);
  return { totalRows, totalQty, totalCost, byBizType };
}
