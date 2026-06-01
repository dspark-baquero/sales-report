// 영업사원(내부 직원)별 통합 실적 + 소스별(직거래처/대리점/링커/바크로하우스) 분해.
//
// 데이터 소스 4개를 영업사원 기준으로 묶는다:
//  - 직거래처: B2B 비대리점 매출 중 dealer가 직원인 것 (cube.byMonthDealer)
//  - 링커:    B2B 비대리점 매출 중 dealer가 링커인 것 → 담당 직원에 귀속
//  - 대리점:   B2B 대리점 매출 (cube.byMonthDealerType[*]["대리점"]) → 담당 직원
//  - 바크로하우스: 파트너 추천 매출 → 담당 직원(또는 링커→담당 직원)
//
// 큐브 우선. raw 전체 스캔 금지 (CLAUDE.md §4).

import type { FactCube } from "./facts";
import { isLinker, linkerManager } from "@/config/mappings";
import type { BHPartner, BHPartnerSale } from "./baquerohouse-data";

const AGENCY_TYPE = "대리점";

// dealer(딜러) 문자열 → 귀속 내부 영업직원.
// 링커면 담당 직원, 아니면 dealer 자신이 곧 직원.
function managerOfDealer(dealer: string): string {
  if (isLinker(dealer)) return linkerManager(dealer) ?? "미지정";
  return dealer || "미지정";
}

// 바크로하우스 파트너 → 귀속 내부 영업직원.
function managerOfPartner(partner: BHPartner | undefined): string {
  if (!partner) return "미지정";
  if (isLinker(partner.agencyLinker)) return linkerManager(partner.agencyLinker) ?? "미지정";
  return partner.salesRep || "미지정";
}

// ── 통합 요약 ────────────────────────────────────────────
export type RepSummaryRow = {
  manager: string;
  direct: number; // 직거래처
  agency: number; // 대리점(담당)
  linker: number; // 링커(담당)
  baquerohouse: number; // 바크로하우스(담당)
  total: number;
  prevTotal: number;
  diff: number;
  pct: number | null;
};

type Buckets = { direct: number; agency: number; linker: number; baquerohouse: number };

function emptyBuckets(): Buckets {
  return { direct: 0, agency: 0, linker: 0, baquerohouse: 0 };
}

// 한 달치 영업사원별 4소스 합계 Map.
function managerTotals(
  cube: FactCube,
  ym: string,
  partnerMap: Map<string, BHPartner>,
  bhSales: BHPartnerSale[],
): Map<string, Buckets> {
  const m = new Map<string, Buckets>();
  const ensure = (k: string) => {
    let b = m.get(k);
    if (!b) { b = emptyBuckets(); m.set(k, b); }
    return b;
  };

  // 직거래처 + 링커 (byMonthDealer = 대리점 제외)
  const dealerCells = cube.byMonthDealer.get(ym);
  if (dealerCells) {
    for (const [dealer, cell] of dealerCells) {
      if (isLinker(dealer)) {
        ensure(managerOfDealer(dealer)).linker += cell.revenue;
      } else {
        ensure(dealer || "미지정").direct += cell.revenue;
      }
    }
  }

  // 대리점 (byMonthDealerType[*]["대리점"])
  const dealerTypeCells = cube.byMonthDealerType.get(ym);
  if (dealerTypeCells) {
    for (const [dealer, typeMap] of dealerTypeCells) {
      const agCell = typeMap.get(AGENCY_TYPE);
      if (agCell && agCell.revenue !== 0) {
        ensure(managerOfDealer(dealer)).agency += agCell.revenue;
      }
    }
  }

  // 바크로하우스 (파트너 추천 매출)
  for (const s of bhSales) {
    if (!s.partnerName) continue;
    ensure(managerOfPartner(partnerMap.get(s.partnerName))).baquerohouse += s.paymentAmount;
  }

  return m;
}

export function repSummaryRows(
  cube: FactCube,
  partnerMap: Map<string, BHPartner>,
  bhSalesCur: BHPartnerSale[],
  bhSalesPrev: BHPartnerSale[],
  ym: string,
  prevYM: string,
): RepSummaryRow[] {
  const cur = managerTotals(cube, ym, partnerMap, bhSalesCur);
  const prev = managerTotals(cube, prevYM, partnerMap, bhSalesPrev);

  const sumBuckets = (b: Buckets) => b.direct + b.agency + b.linker + b.baquerohouse;
  const prevTotalMap = new Map<string, number>();
  for (const [mgr, b] of prev) prevTotalMap.set(mgr, sumBuckets(b));

  const rows: RepSummaryRow[] = [];
  for (const [manager, b] of cur) {
    const total = sumBuckets(b);
    const prevTotal = prevTotalMap.get(manager) ?? 0;
    const diff = total - prevTotal;
    if (total === 0 && prevTotal === 0) continue;
    rows.push({
      manager,
      direct: b.direct,
      agency: b.agency,
      linker: b.linker,
      baquerohouse: b.baquerohouse,
      total,
      prevTotal,
      diff,
      pct: prevTotal !== 0 ? diff / Math.abs(prevTotal) : null,
    });
  }
  return rows.filter((r) => r.total > 0).sort((a, b) => b.total - a.total);
}

// ── 소스별 상세 ──────────────────────────────────────────

// 공통: 직원/링커 단위 실적 행
export type PerfRow = {
  key: string; // 직원명 또는 링커명
  revenue: number;
  prevRevenue: number;
  customers: number; // 활성 거래처 수
};

function dealerCustomerCount(cube: FactCube, ym: string, dealer: string): number {
  return cube.byMonthDealerCustomers.get(ym)?.get(dealer)?.size ?? 0;
}

// 직거래처: dealer가 직원(링커 제외)인 비대리점 매출
export function directDealerRows(cube: FactCube, ym: string, prevYM: string): PerfRow[] {
  const cur = cube.byMonthDealer.get(ym) ?? new Map();
  const prev = cube.byMonthDealer.get(prevYM) ?? new Map();
  const rows: PerfRow[] = [];
  for (const [dealer, cell] of cur) {
    if (isLinker(dealer)) continue;
    rows.push({
      key: dealer || "미지정",
      revenue: cell.revenue,
      prevRevenue: prev.get(dealer)?.revenue ?? 0,
      customers: dealerCustomerCount(cube, ym, dealer),
    });
  }
  return rows.filter((r) => r.revenue > 0).sort((a, b) => b.revenue - a.revenue);
}

// 링커별: dealer가 링커인 비대리점 매출 (담당 직원 함께)
export type LinkerRow = PerfRow & { manager: string };

export function linkerRows(cube: FactCube, ym: string, prevYM: string): LinkerRow[] {
  const cur = cube.byMonthDealer.get(ym) ?? new Map();
  const prev = cube.byMonthDealer.get(prevYM) ?? new Map();
  const rows: LinkerRow[] = [];
  for (const [dealer, cell] of cur) {
    if (!isLinker(dealer)) continue;
    rows.push({
      key: dealer,
      manager: linkerManager(dealer) ?? "미지정",
      revenue: cell.revenue,
      prevRevenue: prev.get(dealer)?.revenue ?? 0,
      customers: dealerCustomerCount(cube, ym, dealer),
    });
  }
  return rows.filter((r) => r.revenue > 0).sort((a, b) => b.revenue - a.revenue);
}

// 대리점: 담당 직원별 집계 + 담당 대리점 목록.
// 대리점(거래처) → 담당 dealer는 cube.customerToDealer, 유형은 customerToB2bType 사용.
export type AgencyManagerRow = {
  manager: string;
  revenue: number;
  prevRevenue: number;
  agencies: { customer: string; revenue: number; prevRevenue: number }[];
};

export function agencyByManagerRows(cube: FactCube, ym: string, prevYM: string): AgencyManagerRow[] {
  const curCust = cube.byMonthCustomer.get(ym);
  const prevCust = cube.byMonthCustomer.get(prevYM);
  const m = new Map<string, { revenue: number; prevRevenue: number; agencies: Map<string, { revenue: number; prevRevenue: number }> }>();

  for (const [customer, type] of cube.customerToB2bType) {
    if (type !== AGENCY_TYPE) continue;
    const dealer = cube.customerToDealer.get(customer) ?? "미지정";
    const manager = managerOfDealer(dealer);
    const rev = curCust?.get(customer)?.revenue ?? 0;
    const prevRev = prevCust?.get(customer)?.revenue ?? 0;
    if (rev === 0 && prevRev === 0) continue;
    let b = m.get(manager);
    if (!b) { b = { revenue: 0, prevRevenue: 0, agencies: new Map() }; m.set(manager, b); }
    b.revenue += rev;
    b.prevRevenue += prevRev;
    const a = b.agencies.get(customer) ?? { revenue: 0, prevRevenue: 0 };
    a.revenue += rev;
    a.prevRevenue += prevRev;
    b.agencies.set(customer, a);
  }

  return [...m.entries()]
    .map(([manager, v]) => ({
      manager,
      revenue: v.revenue,
      prevRevenue: v.prevRevenue,
      agencies: [...v.agencies.entries()]
        .map(([customer, a]) => ({ customer, ...a }))
        .filter((a) => a.revenue > 0 || a.prevRevenue > 0)
        .sort((a, b) => b.revenue - a.revenue),
    }))
    .filter((r) => r.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue);
}

// 바크로하우스: 영업사원/링커별 추천 실적 (기존 baquerohouse 탭의 repKey 로직 이관).
// 본사 파트너는 salesRep, 대리점/링커 파트너는 agencyLinker(링커명) 기준.
export function bhRepKey(partner: BHPartner | undefined): string {
  if (!partner) return "미지정";
  if (partner.agencyLinker && partner.agencyLinker !== "본사") return partner.agencyLinker;
  return partner.salesRep || "미지정";
}

export type BHRepRow = {
  salesRep: string;
  revenue: number;
  prevRevenue: number;
  commission: number;
  partners: number;
};

export function bhByRepRows(
  partnerMap: Map<string, BHPartner>,
  bhSalesCur: BHPartnerSale[],
  bhSalesPrev: BHPartnerSale[],
): BHRepRow[] {
  const curMap = new Map<string, { revenue: number; commission: number; partners: Set<string> }>();
  for (const s of bhSalesCur) {
    if (!s.partnerName) continue;
    const key = bhRepKey(partnerMap.get(s.partnerName));
    const c = curMap.get(key) ?? { revenue: 0, commission: 0, partners: new Set<string>() };
    c.revenue += s.paymentAmount;
    c.commission += s.estimatedCommission;
    c.partners.add(s.partnerName);
    curMap.set(key, c);
  }
  const prevMap = new Map<string, number>();
  for (const s of bhSalesPrev) {
    if (!s.partnerName) continue;
    const key = bhRepKey(partnerMap.get(s.partnerName));
    prevMap.set(key, (prevMap.get(key) ?? 0) + s.paymentAmount);
  }
  return [...curMap.entries()]
    .map(([salesRep, v]) => ({
      salesRep,
      revenue: v.revenue,
      prevRevenue: prevMap.get(salesRep) ?? 0,
      commission: v.commission,
      partners: v.partners.size,
    }))
    .filter((r) => r.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue);
}
