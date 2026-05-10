// 탭 상단 자동 인사이트 — 휴리스틱 기반, LLM 없음.
// 각 탭에 컴퓨터 함수 1개. 결과는 InsightBullet[].
// 우선순위: critical > warn > positive > info, 동률은 |diff| 큰 순.

import type { FactCube } from "./facts";
import {
  cubeMonthCustomerCells,
  cubeMonthChannelCells,
  cubeMonthChannelGroupCells,
  cubeMonthBrandCells,
  cubeMonthCountryCells,
  cubeMonthDealerCells,
  cubeMonthB2bTypeCells,
  cubeMonthCategoryKpi,
  cubeMonthChannelGroupKpi,
  cubeMonthKpi,
  cubeBrandSeries,
  cubeMonthProductCells,
} from "./facts";
import { ymMinusMonths } from "./aggregate";
import { prevMonth, prevYearSameMonth } from "./compare";
import { formatKRWShort, formatPct, formatPctAbs } from "./format";
import {
  sleepingReturned,
  topMovers,
  newAccounts,
  lostKeyAccounts,
  quarterlyCliff,
} from "./accountAnalysis";
import { dealerCustomerChurn } from "./dealerAnalysis";

export type Severity = "critical" | "warn" | "info" | "positive";

export type InsightBullet = {
  severity: Severity;
  category: string;
  text: string;
  detail?: string;
  href?: string;
  /** 정렬 가중치 — |diff| 등. 수동 설정 가능. */
  weight?: number;
};

const SEVERITY_RANK: Record<Severity, number> = {
  critical: 4, warn: 3, positive: 2, info: 1,
};

export function rankBullets(bullets: InsightBullet[]): InsightBullet[] {
  return bullets.slice().sort((a, b) => {
    const sr = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
    if (sr !== 0) return sr;
    const wa = a.weight ?? 0;
    const wb = b.weight ?? 0;
    return wb - wa;
  });
}

// ── 공통 헬퍼 ───────────────────────────────────────────

// 변화 문구 생성: "쿠팡 +120% (전월 1.5억원 → 3.3억원)"
function changeText(label: string, cur: number, prev: number, opts?: { compareLabel?: string }): { text: string; pct: number; diff: number } {
  const diff = cur - prev;
  const pct = prev !== 0 ? diff / Math.abs(prev) : 0;
  const cmpLabel = opts?.compareLabel ?? "전월";
  const sign = diff > 0 ? "+" : "";
  if (prev === 0 && cur > 0) {
    return { text: `${label} 신규 발생 (${formatKRWShort(cur)})`, pct: 0, diff };
  }
  if (cur === 0 && prev > 0) {
    return { text: `${label} 이번달 매출 사라짐 (${cmpLabel} ${formatKRWShort(prev)})`, pct: 0, diff };
  }
  const pctTxt = formatPct(pct, pct >= 1 ? 0 : 1);
  return {
    text: `${label} ${pctTxt} (${cmpLabel} ${formatKRWShort(prev)} → ${formatKRWShort(cur)}, ${sign}${formatKRWShort(diff)})`,
    pct,
    diff,
  };
}

function pickSeverity(pct: number, isNew: boolean, isLost: boolean): Severity {
  if (isLost) return "critical";
  if (isNew) return "positive";
  if (pct >= 0.5) return "positive";
  if (pct >= 0.2) return "positive";
  if (pct <= -0.3) return "critical";
  if (pct <= -0.15) return "warn";
  return "info";
}

// 차원 셀 Map → 변동 분석 (Top movers)
function topMoversFromCells(
  curMap: Map<string, { revenue: number }>,
  prevMap: Map<string, { revenue: number }>,
  opts: { minAbsDiff?: number; minPct?: number; maxBullets?: number; categoryLabel: string; compareLabel?: string },
): InsightBullet[] {
  const minAbsDiff = opts.minAbsDiff ?? 5_000_000;  // 500만원 이상 변동만
  const minPct = opts.minPct ?? 0.15;               // ±15% 이상
  const all = new Set<string>([...curMap.keys(), ...prevMap.keys()]);
  const rows: { entity: string; cur: number; prev: number; diff: number; pct: number; isNew: boolean; isLost: boolean }[] = [];
  for (const e of all) {
    const cv = curMap.get(e)?.revenue ?? 0;
    const pv = prevMap.get(e)?.revenue ?? 0;
    if (cv === 0 && pv === 0) continue;
    const diff = cv - pv;
    const pct = pv !== 0 ? diff / Math.abs(pv) : 0;
    const isNew = pv === 0 && cv > 0;
    const isLost = cv === 0 && pv > 0;
    if (!isNew && !isLost) {
      if (Math.abs(diff) < minAbsDiff && Math.abs(pct) < minPct) continue;
    } else {
      // 신규/이탈도 일정 규모 이상만
      if (Math.max(cv, pv) < minAbsDiff) continue;
    }
    rows.push({ entity: e, cur: cv, prev: pv, diff, pct, isNew, isLost });
  }
  rows.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

  const out: InsightBullet[] = [];
  for (const r of rows.slice(0, opts.maxBullets ?? 5)) {
    const ct = changeText(r.entity, r.cur, r.prev, { compareLabel: opts.compareLabel });
    out.push({
      severity: pickSeverity(r.pct, r.isNew, r.isLost),
      category: opts.categoryLabel,
      text: ct.text,
      weight: Math.abs(r.diff),
    });
  }
  return out;
}

// 전체 매출 종합 변동 (전월/전년)
function totalChangeBullet(curRev: number, prevRev: number, label: string, categoryLabel = "전체"): InsightBullet | null {
  if (prevRev === 0 && curRev === 0) return null;
  const diff = curRev - prevRev;
  const pct = prevRev !== 0 ? diff / Math.abs(prevRev) : 0;
  if (Math.abs(pct) < 0.03) return null; // ±3% 이내면 의미 없음
  const ct = changeText("전체 매출", curRev, prevRev, { compareLabel: label });
  return {
    severity: pickSeverity(pct, false, false),
    category: categoryLabel,
    text: ct.text,
    weight: Math.abs(diff),
  };
}

// ── 종합 탭 ────────────────────────────────────────────
export function computeOverviewInsights(cube: FactCube, ym: string): InsightBullet[] {
  const prevYM = prevMonth(ym);
  const prevYearYM = prevYearSameMonth(ym);

  const out: InsightBullet[] = [];
  const cur = cubeMonthKpi(cube, ym).revenue;
  const prev = cubeMonthKpi(cube, prevYM).revenue;
  const prevYear = cubeMonthKpi(cube, prevYearYM).revenue;
  const tb = totalChangeBullet(cur, prev, "전월");
  if (tb) out.push(tb);
  const yb = totalChangeBullet(cur, prevYear, "전년 동월");
  if (yb) out.push(yb);

  // 카테고리별 빅 무버 1~2
  const catMovers: { label: string; diff: number; pct: number }[] = [];
  for (const cat of ["수출", "B2B", "B2C", "면세점"] as const) {
    const c = cubeMonthCategoryKpi(cube, ym, cat).revenue;
    const p = cubeMonthCategoryKpi(cube, prevYM, cat).revenue;
    if (p === 0 && c === 0) continue;
    const diff = c - p;
    const pct = p !== 0 ? diff / Math.abs(p) : 0;
    catMovers.push({ label: cat, diff, pct });
  }
  catMovers.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  for (const m of catMovers.slice(0, 2)) {
    if (Math.abs(m.pct) < 0.05) continue;
    const c = cubeMonthCategoryKpi(cube, ym, m.label as never).revenue;
    const p = cubeMonthCategoryKpi(cube, prevYM, m.label as never).revenue;
    const ct = changeText(`${m.label}`, c, p);
    out.push({
      severity: pickSeverity(m.pct, false, false),
      category: "카테고리",
      text: ct.text,
      weight: Math.abs(m.diff),
    });
  }

  // 거래처 변동 핵심
  const movers = topMovers(cube, ym, prevYM, 3);
  if (movers.gainers.length > 0) {
    const g = movers.gainers[0];
    if (g.diff >= 10_000_000) {
      const ct = changeText(g.customer, g.current, g.prev);
      out.push({
        severity: "positive",
        category: "거래처 상승",
        text: ct.text,
        weight: Math.abs(g.diff),
        href: `/accounts?customer=${encodeURIComponent(g.customer)}&month=${ym}`,
      });
    }
  }
  if (movers.decliners.length > 0) {
    const d = movers.decliners[0];
    if (d.diff <= -10_000_000) {
      const ct = changeText(d.customer, d.current, d.prev);
      out.push({
        severity: pickSeverity(d.pct ?? -0.5, false, d.current === 0),
        category: "거래처 하락",
        text: ct.text,
        weight: Math.abs(d.diff),
        href: `/accounts?customer=${encodeURIComponent(d.customer)}&month=${ym}`,
      });
    }
  }

  // 동면 복귀
  const sleeping = sleepingReturned(cube, ym, { minRevenue: 5_000_000 });
  if (sleeping.length > 0) {
    const s = sleeping[0];
    out.push({
      severity: "positive",
      category: "동면 복귀",
      text: `${s.customer} ${s.silentMonths}개월 만에 복귀 (${formatKRWShort(s.returnedRevenue)})`,
      detail: sleeping.length > 1 ? `+${sleeping.length - 1}건 더` : undefined,
      weight: s.returnedRevenue,
      href: `/accounts?customer=${encodeURIComponent(s.customer)}&month=${ym}`,
    });
  }

  // 분기 절벽 1건
  const cliff = quarterlyCliff(cube, ym);
  if (cliff.length > 0) {
    const c = cliff[0];
    out.push({
      severity: "critical",
      category: "분기 절벽",
      text: `${c.customer} 지난 분기 ${formatKRWShort(c.prevQuarterRevenue)} → 이번 분기 ${formatKRWShort(c.curQuarterAccum)} (${formatPct(c.pct)})`,
      detail: cliff.length > 1 ? `+${cliff.length - 1}건 더` : undefined,
      weight: Math.abs(c.diff),
      href: `/accounts?customer=${encodeURIComponent(c.customer)}&month=${ym}`,
    });
  }

  // 상실된 핵심 거래처
  const lost = lostKeyAccounts(cube, ym, { lookback: "quarter", topN: 10 });
  if (lost.length > 0) {
    const l = lost[0];
    out.push({
      severity: "critical",
      category: "핵심 거래처 이탈",
      text: `지난 분기 ${l.baselineRank}위 ${l.customer} 이번달 매출 0 (분기 ${formatKRWShort(l.baselineRevenue)})`,
      detail: lost.length > 1 ? `+${lost.length - 1}곳 더` : undefined,
      weight: l.baselineRevenue,
      href: `/accounts?customer=${encodeURIComponent(l.customer)}&month=${ym}`,
    });
  }

  return rankBullets(out).slice(0, 7);
}

// ── B2C 탭 ────────────────────────────────────────────
export function computeB2CInsights(cube: FactCube, ym: string): InsightBullet[] {
  const prevYM = prevMonth(ym);
  const out: InsightBullet[] = [];

  const curRev = cubeMonthCategoryKpi(cube, ym, "B2C").revenue;
  const prevRev = cubeMonthCategoryKpi(cube, prevYM, "B2C").revenue;
  const tb = totalChangeBullet(curRev, prevRev, "전월", "B2C 전체");
  if (tb) out.push(tb);

  // 채널그룹 빅 무버 (자사 공식몰 / 종합몰 / 소호몰)
  const groupCur = cubeMonthChannelGroupCells(cube, ym);
  const groupPrev = cubeMonthChannelGroupCells(cube, prevYM);
  for (const g of ["자사 공식몰", "종합몰", "소호몰"] as const) {
    const c = groupCur.get(g)?.revenue ?? 0;
    const p = groupPrev.get(g)?.revenue ?? 0;
    if (c === 0 && p === 0) continue;
    const diff = c - p;
    const pct = p !== 0 ? diff / Math.abs(p) : 0;
    if (Math.abs(diff) < 5_000_000 && Math.abs(pct) < 0.1) continue;
    const ct = changeText(g, c, p);
    out.push({
      severity: pickSeverity(pct, false, false),
      category: "채널그룹",
      text: ct.text,
      weight: Math.abs(diff),
    });
  }

  // 채널 빅 무버 — B2B몰/수출/면세점 채널 제외 (B2C 채널만)
  const EXCLUDE_CHANNELS = new Set(["B2B몰", "수출", "면세점"]);
  const filteredCur = new Map<string, { revenue: number }>();
  const filteredPrev = new Map<string, { revenue: number }>();
  for (const [ch, cell] of cubeMonthChannelCells(cube, ym)) {
    if (EXCLUDE_CHANNELS.has(ch)) continue;
    filteredCur.set(ch, { revenue: cell.revenue });
  }
  for (const [ch, cell] of cubeMonthChannelCells(cube, prevYM)) {
    if (EXCLUDE_CHANNELS.has(ch)) continue;
    filteredPrev.set(ch, { revenue: cell.revenue });
  }
  out.push(...topMoversFromCells(filteredCur, filteredPrev, {
    categoryLabel: "채널",
    minAbsDiff: 3_000_000,
    minPct: 0.2,
    maxBullets: 4,
  }));

  // 브랜드 빅 무버 (B2C 슬라이스에서)
  // byMonthBrand는 카테고리 무관 — B2C 브랜드 성능을 전체 브랜드 매출로 근사
  const brandCur = cubeMonthBrandCells(cube, ym);
  const brandPrev = cubeMonthBrandCells(cube, prevYM);
  out.push(...topMoversFromCells(brandCur, brandPrev, {
    categoryLabel: "브랜드",
    minAbsDiff: 5_000_000,
    minPct: 0.15,
    maxBullets: 2,
  }));

  return rankBullets(out).slice(0, 6);
}

// ── B2B 탭 ────────────────────────────────────────────
export function computeB2BInsights(cube: FactCube, ym: string): InsightBullet[] {
  const prevYM = prevMonth(ym);
  const out: InsightBullet[] = [];

  const curRev = cubeMonthCategoryKpi(cube, ym, "B2B").revenue;
  const prevRev = cubeMonthCategoryKpi(cube, prevYM, "B2B").revenue;
  const tb = totalChangeBullet(curRev, prevRev, "전월", "B2B 전체");
  if (tb) out.push(tb);

  // 딜러 빅 무버
  const dealerCur = cubeMonthDealerCells(cube, ym);
  const dealerPrev = cubeMonthDealerCells(cube, prevYM);
  out.push(...topMoversFromCells(dealerCur, dealerPrev, {
    categoryLabel: "영업사원",
    minAbsDiff: 3_000_000,
    minPct: 0.15,
    maxBullets: 3,
  }));

  // 거래처유형 빅 무버
  const typeCur = cubeMonthB2bTypeCells(cube, ym);
  const typePrev = cubeMonthB2bTypeCells(cube, prevYM);
  out.push(...topMoversFromCells(typeCur, typePrev, {
    categoryLabel: "거래처 유형",
    minAbsDiff: 3_000_000,
    minPct: 0.1,
    maxBullets: 2,
  }));

  // B2B 거래처 churn 요약
  const churn = dealerCustomerChurn(cube, ym, 3);
  const totalNew = churn.reduce((s, r) => s + r.newCustomers.length, 0);
  const totalLost = churn.reduce((s, r) => s + r.lostCustomers.length, 0);
  if (totalNew > 0) {
    out.push({
      severity: "info",
      category: "거래처 변동",
      text: `이번달 신규 B2B 거래처 ${totalNew}곳 진입`,
      weight: totalNew,
    });
  }
  if (totalLost > 0) {
    out.push({
      severity: totalLost > totalNew ? "warn" : "info",
      category: "거래처 변동",
      text: `직전 3개월 거래 ${totalLost}곳이 이번달 매출 0`,
      weight: totalLost,
    });
  }

  // 신규 B2B 거래처 큰 건
  const newOnes = newAccounts(cube, ym, 6).filter((n) => n.category === "B2B");
  if (newOnes.length > 0 && newOnes[0].currentRevenue >= 3_000_000) {
    const n = newOnes[0];
    out.push({
      severity: "positive",
      category: "신규 거래처",
      text: `${n.customer} 첫 매출 ${formatKRWShort(n.currentRevenue)}${n.brand ? ` (${n.brand})` : ""}`,
      weight: n.currentRevenue,
      href: `/accounts?customer=${encodeURIComponent(n.customer)}&month=${ym}`,
    });
  }

  return rankBullets(out).slice(0, 6);
}

// ── 수출 탭 ────────────────────────────────────────────
export function computeExportInsights(cube: FactCube, ym: string): InsightBullet[] {
  const prevYM = prevMonth(ym);
  const prevYearYM = prevYearSameMonth(ym);
  const out: InsightBullet[] = [];

  const curRev = cubeMonthCategoryKpi(cube, ym, "수출").revenue;
  const prevRev = cubeMonthCategoryKpi(cube, prevYM, "수출").revenue;
  const prevYearRev = cubeMonthCategoryKpi(cube, prevYearYM, "수출").revenue;
  const tb = totalChangeBullet(curRev, prevRev, "전월", "수출 전체");
  if (tb) out.push(tb);
  const yb = totalChangeBullet(curRev, prevYearRev, "전년 동월", "수출 전체");
  if (yb) out.push(yb);

  // 국가 빅 무버
  const countryCur = cubeMonthCountryCells(cube, ym);
  const countryPrev = cubeMonthCountryCells(cube, prevYM);
  out.push(...topMoversFromCells(countryCur, countryPrev, {
    categoryLabel: "국가",
    minAbsDiff: 3_000_000,
    minPct: 0.2,
    maxBullets: 4,
  }));

  // 신규 국가 / 사라진 국가
  const allCountries = new Set([...countryCur.keys(), ...countryPrev.keys()]);
  for (const c of allCountries) {
    const cv = countryCur.get(c)?.revenue ?? 0;
    const pv = countryPrev.get(c)?.revenue ?? 0;
    if (cv > 5_000_000 && pv === 0) {
      out.push({
        severity: "positive",
        category: "신규 국가",
        text: `${c} 신규 수출 ${formatKRWShort(cv)}`,
        weight: cv,
      });
    }
    if (pv > 5_000_000 && cv === 0) {
      out.push({
        severity: "warn",
        category: "수출 중단",
        text: `${c} 이번달 수출 매출 사라짐 (전월 ${formatKRWShort(pv)})`,
        weight: pv,
      });
    }
  }

  return rankBullets(out).slice(0, 6);
}

// ── 면세점 탭 ──────────────────────────────────────────
export function computeDutyFreeInsights(cube: FactCube, ym: string): InsightBullet[] {
  const prevYM = prevMonth(ym);
  const prevYearYM = prevYearSameMonth(ym);
  const out: InsightBullet[] = [];

  const curRev = cubeMonthCategoryKpi(cube, ym, "면세점").revenue;
  const prevRev = cubeMonthCategoryKpi(cube, prevYM, "면세점").revenue;
  const prevYearRev = cubeMonthCategoryKpi(cube, prevYearYM, "면세점").revenue;
  const tb = totalChangeBullet(curRev, prevRev, "전월", "면세점 전체");
  if (tb) out.push(tb);
  const yb = totalChangeBullet(curRev, prevYearRev, "전년 동월", "면세점 전체");
  if (yb) out.push(yb);

  // 면세점 거래처 (롯데/신라/신세계 등) — customer 셀 중 면세점 카테고리만
  const allCustCur = cubeMonthCustomerCells(cube, ym);
  const allCustPrev = cubeMonthCustomerCells(cube, prevYM);
  const dfCustCur = new Map<string, { revenue: number }>();
  const dfCustPrev = new Map<string, { revenue: number }>();
  for (const [c, cell] of allCustCur) {
    if (cube.customerToCategory.get(c) === "면세점") dfCustCur.set(c, { revenue: cell.revenue });
  }
  for (const [c, cell] of allCustPrev) {
    if (cube.customerToCategory.get(c) === "면세점") dfCustPrev.set(c, { revenue: cell.revenue });
  }
  out.push(...topMoversFromCells(dfCustCur, dfCustPrev, {
    categoryLabel: "면세점 거래처",
    minAbsDiff: 5_000_000,
    minPct: 0.15,
    maxBullets: 4,
  }));

  return rankBullets(out).slice(0, 5);
}

// ── 브랜드 탭 ──────────────────────────────────────────
export function computeBrandInsights(cube: FactCube, ym: string, brand: string): InsightBullet[] {
  const prevYM = prevMonth(ym);
  const prevYearYM = prevYearSameMonth(ym);
  const out: InsightBullet[] = [];

  const cur = cube.byMonthBrand.get(ym)?.get(brand)?.revenue ?? 0;
  const prev = cube.byMonthBrand.get(prevYM)?.get(brand)?.revenue ?? 0;
  const prevYear = cube.byMonthBrand.get(prevYearYM)?.get(brand)?.revenue ?? 0;
  const tb = totalChangeBullet(cur, prev, "전월", `${brand} 전체`);
  if (tb) out.push(tb);
  const yb = totalChangeBullet(cur, prevYear, "전년 동월", `${brand} 전체`);
  if (yb) out.push(yb);

  // 24m 추이에서 최고/최저 월
  const start24 = ymMinusMonths(ym, 23);
  const series = cubeBrandSeries(cube, brand, start24, ym);
  const positives = series.filter((p) => p.revenue > 0);
  if (positives.length >= 2) {
    const top = positives.slice().sort((a, b) => b.revenue - a.revenue)[0];
    const bot = positives.slice().sort((a, b) => a.revenue - b.revenue)[0];
    if (top.yearMonth === ym) {
      out.push({
        severity: "positive",
        category: "신기록",
        text: `${brand} 24개월 최고 매출 갱신 (${formatKRWShort(top.revenue)})`,
        weight: top.revenue,
      });
    }
    if (bot.yearMonth === ym && positives.length > 6) {
      out.push({
        severity: "warn",
        category: "최저",
        text: `${brand} 24개월 중 최저 매출 (${formatKRWShort(bot.revenue)})`,
        weight: bot.revenue,
      });
    }
  }

  // 신/이탈 SKU 신호 — 이번달 + 전월 제품 셀 비교
  const curProd = cubeMonthProductCells(cube, ym);
  const prevProd = cubeMonthProductCells(cube, prevYM);
  let newSkuCount = 0;
  for (const [k, cell] of curProd) {
    if (cell.brand !== brand) continue;
    const p = prevProd.get(k);
    if (!p && cell.revenue >= 1_000_000) newSkuCount++;
  }
  if (newSkuCount > 0) {
    out.push({
      severity: "info",
      category: "신제품",
      text: `${brand} 신규 매출 SKU ${newSkuCount}개 (1백만원 이상)`,
      weight: newSkuCount * 1_000_000,
    });
  }

  return rankBullets(out).slice(0, 5);
}

// ── 변동 분석 탭 ────────────────────────────────────────
export function computeChangesInsights(cube: FactCube, ym: string): InsightBullet[] {
  const prevYM = prevMonth(ym);
  const out: InsightBullet[] = [];

  // 종합 탭과 유사하지만 더 분해 차원에 집중
  const curRev = cubeMonthKpi(cube, ym).revenue;
  const prevRev = cubeMonthKpi(cube, prevYM).revenue;
  const tb = totalChangeBullet(curRev, prevRev, "전월");
  if (tb) out.push(tb);

  // 가장 큰 거래처 빅 무버
  const movers = topMovers(cube, ym, prevYM, 5);
  for (const g of movers.gainers.slice(0, 2)) {
    if (g.diff < 5_000_000) continue;
    const ct = changeText(g.customer, g.current, g.prev);
    out.push({
      severity: "positive",
      category: "거래처 상승",
      text: ct.text,
      weight: Math.abs(g.diff),
      href: `/accounts?customer=${encodeURIComponent(g.customer)}&month=${ym}`,
    });
  }
  for (const d of movers.decliners.slice(0, 2)) {
    if (d.diff > -5_000_000) continue;
    const ct = changeText(d.customer, d.current, d.prev);
    out.push({
      severity: pickSeverity(d.pct ?? -0.5, false, d.current === 0),
      category: "거래처 하락",
      text: ct.text,
      weight: Math.abs(d.diff),
      href: `/accounts?customer=${encodeURIComponent(d.customer)}&month=${ym}`,
    });
  }

  return rankBullets(out).slice(0, 6);
}

// ── 목표 달성 탭 ──────────────────────────────────────
// targets 데이터를 받아서 휴리스틱.
import type { TargetRowWithActual } from "./targets";
export function computeTargetsInsights(targetsActuals: TargetRowWithActual[], ym: string): InsightBullet[] {
  const out: InsightBullet[] = [];
  const curMonth = targetsActuals.filter((t) => t.yearMonth === ym && !t.prospective);
  const total = curMonth.reduce((s, t) => s + t.target, 0);
  const actual = curMonth.reduce((s, t) => s + t.actual, 0);

  const totalRate = total > 0 ? actual / total : null;
  if (totalRate !== null) {
    out.push({
      severity: totalRate >= 1 ? "positive" : totalRate >= 0.85 ? "info" : totalRate >= 0.7 ? "warn" : "critical",
      category: "전체 목표",
      text: `이번달 목표 달성률 ${formatPctAbs(totalRate, 1)} (실적 ${formatKRWShort(actual)} / 목표 ${formatKRWShort(total)})`,
      weight: Math.abs(actual - total),
    });
  }

  // Top 미달
  const under = curMonth
    .filter((t) => t.target > 0 && t.actual < t.target * 0.7)
    .sort((a, b) => (a.target - a.actual) - (b.target - b.actual))
    .slice(0, 3);
  for (const t of under) {
    const rate = t.target > 0 ? t.actual / t.target : 0;
    out.push({
      severity: rate < 0.4 ? "critical" : "warn",
      category: "미달",
      text: `${t.brand} ${t.customerKey} 달성률 ${formatPctAbs(rate, 0)} (실적 ${formatKRWShort(t.actual)} / 목표 ${formatKRWShort(t.target)})`,
      weight: t.target - t.actual,
    });
  }

  // Top 초과
  const over = curMonth
    .filter((t) => t.target > 0 && t.actual >= t.target * 1.2)
    .sort((a, b) => (b.actual - b.target) - (a.actual - a.target))
    .slice(0, 2);
  for (const t of over) {
    const rate = t.target > 0 ? t.actual / t.target : 0;
    out.push({
      severity: "positive",
      category: "초과 달성",
      text: `${t.brand} ${t.customerKey} 달성률 ${formatPctAbs(rate, 0)} (목표 대비 +${formatKRWShort(t.actual - t.target)})`,
      weight: t.actual - t.target,
    });
  }

  // 신규 추진 채널 진척
  const prosp = targetsActuals.filter((t) => t.yearMonth === ym && t.prospective);
  if (prosp.length > 0) {
    const total = prosp.reduce((s, t) => s + t.target, 0);
    out.push({
      severity: "info",
      category: "신규 추진",
      text: `신규 추진 채널 ${prosp.length}건 (목표 합계 ${formatKRWShort(total)}) — 매칭 sales 데이터 없음`,
      weight: total,
    });
  }

  return rankBullets(out).slice(0, 6);
}

// ── 거래처 분석 탭 ─────────────────────────────────────
export function computeAccountsInsights(cube: FactCube, ym: string, customer: string | null): InsightBullet[] {
  if (!customer) {
    // 거래처 미선택 — 종합적인 거래처 변동 요약
    const out: InsightBullet[] = [];
    const movers = topMovers(cube, ym, prevMonth(ym), 3);
    if (movers.gainers[0]) {
      const g = movers.gainers[0];
      out.push({
        severity: "positive",
        category: "최대 상승",
        text: `${g.customer} ${formatKRWShort(g.diff)} 증가`,
        weight: Math.abs(g.diff),
      });
    }
    if (movers.decliners[0]) {
      const d = movers.decliners[0];
      out.push({
        severity: "warn",
        category: "최대 하락",
        text: `${d.customer} ${formatKRWShort(d.diff)} 감소`,
        weight: Math.abs(d.diff),
      });
    }
    const lost = lostKeyAccounts(cube, ym, { lookback: "quarter", topN: 5 });
    if (lost.length > 0) {
      out.push({
        severity: "critical",
        category: "핵심 이탈",
        text: `지난 분기 상위 거래처 중 ${lost.length}곳이 이번달 매출 0`,
        weight: lost.reduce((s, l) => s + l.baselineRevenue, 0),
      });
    }
    const newOnes = newAccounts(cube, ym, 6);
    if (newOnes.length > 0) {
      out.push({
        severity: "info",
        category: "신규 진입",
        text: `이번달 신규 거래처 ${newOnes.length}곳 진입 (Top: ${newOnes[0].customer} ${formatKRWShort(newOnes[0].currentRevenue)})`,
        weight: newOnes[0].currentRevenue,
      });
    }
    return rankBullets(out).slice(0, 5);
  }

  // 특정 거래처 선택
  const out: InsightBullet[] = [];
  const cur = cube.byMonthCustomer.get(ym)?.get(customer)?.revenue ?? 0;
  const prev = cube.byMonthCustomer.get(prevMonth(ym))?.get(customer)?.revenue ?? 0;
  const prevYear = cube.byMonthCustomer.get(prevYearSameMonth(ym))?.get(customer)?.revenue ?? 0;
  const tb = totalChangeBullet(cur, prev, "전월", customer);
  if (tb) out.push(tb);
  const yb = totalChangeBullet(cur, prevYear, "전년 동월", customer);
  if (yb) out.push(yb);

  // 분기 절벽 / 동면 복귀 표시
  const sleep = sleepingReturned(cube, ym, { minRevenue: 1, silentMonths: 2, lookback: 12 }).find((s) => s.customer === customer);
  if (sleep) {
    out.push({
      severity: "positive",
      category: "동면 복귀",
      text: `${sleep.silentMonths}개월 만에 매출 복귀 (마지막 활성: ${sleep.lastActiveMonth ?? "—"})`,
      weight: sleep.returnedRevenue,
    });
  }
  const cliff = quarterlyCliff(cube, ym).find((c) => c.customer === customer);
  if (cliff) {
    out.push({
      severity: "critical",
      category: "분기 절벽",
      text: `지난 분기 ${formatKRWShort(cliff.prevQuarterRevenue)} → 이번 분기 ${formatKRWShort(cliff.curQuarterAccum)} (${formatPct(cliff.pct)})`,
      weight: Math.abs(cliff.diff),
    });
  }

  return rankBullets(out).slice(0, 5);
}
