// 바크로하우스 "자체매출" — 몰 매출 중 파트너(영업사원/링커) 추천으로 잡히지 않은 몫.
//
// 바크로하우스 몰 매출은 sales 테이블에 채널 `바크로하우스`로 들어오고, 그중 파트너
// 추천 링크를 경유한 몫만 bh_partner_sales 에 별도로 적재된다. 추천분은 영업사원 실적
// (/sales-rep, /baquerohouse)으로 따로 관리하므로, B2C 탭에는 나머지 자체매출만
// "바크로하우스(자체매출)" 채널로 자사 공식몰 그룹에 합산한다.
//
// 파트너 데이터는 Drive 기반 외부 테이블이라 권한이 없는 환경(로컬 dev)에서는 조회가
// 실패한다. 그때는 available=false + 값 0 으로 기존 동작(바크로하우스 전액 제외)을
// 유지한다 — 추천 매출을 모르는 상태에서 전액을 자체매출로 잡아 B2C를 부풀리지 않는다.

import type { SalesRow } from "./parsers";
import { isBHDataAvailable, loadBHSalesRange } from "./baquerohouse-data";
import type { ChangeContribution } from "./changeAttribution";

export const BH_SELF_CHANNEL = "바크로하우스(자체매출)";

export type BHSelfRevenue = {
  available: boolean;
  revenue: number;
  settlement: number; // 자체매출 비율로 안분
  qty: number; // 자체매출 비율로 안분
  byMonth: Map<string, number>;
  byBrand: Map<string, number>;
};

function empty(available: boolean): BHSelfRevenue {
  return {
    available,
    revenue: 0,
    settlement: 0,
    qty: 0,
    byMonth: new Map(),
    byBrand: new Map(),
  };
}

// fromYM~toYM 구간의 바크로하우스 자체매출.
// rows 는 이미 로드된 해당 구간 매출 행(구간 밖 행이 섞여 있어도 무시한다).
export async function bhSelfRevenue(
  rows: SalesRow[],
  fromYM: string,
  toYM: string,
): Promise<BHSelfRevenue> {
  const available = await isBHDataAvailable();
  if (!available) return empty(false);

  // 파트너 추천 매출 (결제금액 기준)
  const refByMonth = new Map<string, number>();
  const refByBrand = new Map<string, number>();
  for (const s of await loadBHSalesRange(fromYM, toYM)) {
    refByMonth.set(s.yearMonth, (refByMonth.get(s.yearMonth) ?? 0) + s.paymentAmount);
    if (s.brand) refByBrand.set(s.brand, (refByBrand.get(s.brand) ?? 0) + s.paymentAmount);
  }

  // 바크로하우스 채널 실매출
  const chByMonth = new Map<string, number>();
  const chByBrand = new Map<string, number>();
  let chRevenue = 0;
  let chSettlement = 0;
  let chQty = 0;
  for (const r of rows) {
    if (r.channel !== "바크로하우스" || r.isNonRevenue) continue;
    if (r.yearMonth < fromYM || r.yearMonth > toYM) continue;
    chByMonth.set(r.yearMonth, (chByMonth.get(r.yearMonth) ?? 0) + r.realRevenue);
    if (r.brand) chByBrand.set(r.brand, (chByBrand.get(r.brand) ?? 0) + r.realRevenue);
    chRevenue += r.realRevenue;
    chSettlement += r.settlement;
    chQty += r.qty;
  }
  if (chRevenue <= 0) return empty(true);

  // 월 단위로 차감 (추천 결제금액이 실매출을 넘는 달은 0으로 바닥 처리)
  const byMonth = new Map<string, number>();
  let revenue = 0;
  for (const [m, v] of chByMonth) {
    const self = Math.max(0, v - (refByMonth.get(m) ?? 0));
    byMonth.set(m, self);
    revenue += self;
  }

  const byBrand = new Map<string, number>();
  for (const [b, v] of chByBrand) {
    const self = Math.max(0, v - (refByBrand.get(b) ?? 0));
    if (self > 0) byBrand.set(b, self);
  }

  // 정산/수량은 자체매출 비율로 안분 (추천분과 행 단위로 나뉘어 있지 않음)
  const ratio = revenue / chRevenue;
  return {
    available: true,
    revenue,
    settlement: chSettlement * ratio,
    qty: Math.round(chQty * ratio),
    byMonth,
    byBrand,
  };
}

// ── 변화 요인 보정 ────────────────────────────────────────
// 자체매출은 행 단위로 분리할 수 없어 attributeChange 결과에 사후 반영한다.
// 판정 기준(신규/이탈/유지/증가/감소)은 attributeChange 와 동일하게 맞춘다.

function contribution(entity: string, current: number, prev: number): ChangeContribution {
  const diff = current - prev;
  const pct = prev !== 0 ? diff / Math.abs(prev) : null;
  let type: ChangeContribution["type"];
  if (prev === 0 && current > 0) type = "신규";
  else if (current === 0 && prev > 0) type = "이탈";
  else if (pct !== null && Math.abs(pct) < 0.02) type = "유지";
  else if (diff > 0) type = "증가";
  else type = "감소";
  return { entity, current, prev, diff, pct, type };
}

// 채널 단위 — "바크로하우스(자체매출)" 한 항목으로 덧붙인다.
export function withSelfChannelContribution(
  contribs: ChangeContribution[],
  current: number,
  prev: number,
): ChangeContribution[] {
  if (current <= 0 && prev <= 0) return contribs;
  return [...contribs, contribution(BH_SELF_CHANNEL, current, prev)];
}

// 브랜드 단위 — 각 브랜드 기여도에 자체매출을 합산한다.
export function withSelfBrandContributions(
  contribs: ChangeContribution[],
  curByBrand: Map<string, number>,
  prevByBrand: Map<string, number>,
): ChangeContribution[] {
  if (curByBrand.size === 0 && prevByBrand.size === 0) return contribs;
  const m = new Map(contribs.map((c) => [c.entity, c]));
  for (const brand of new Set([...curByBrand.keys(), ...prevByBrand.keys()])) {
    const base = m.get(brand);
    const current = (base?.current ?? 0) + (curByBrand.get(brand) ?? 0);
    const prev = (base?.prev ?? 0) + (prevByBrand.get(brand) ?? 0);
    m.set(brand, { ...contribution(brand, current, prev), meta: base?.meta });
  }
  return [...m.values()];
}
