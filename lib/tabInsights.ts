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
import { ymMinusMonths, enumerateMonths } from "./aggregate";
import { prevMonth, prevYearSameMonth } from "./compare";
import type { Category } from "@/config/mappings";
import { formatKRWShort, formatPct, formatPctAbs } from "./format";
import {
  sleepingReturned,
  topMovers,
  newAccounts,
  lostKeyAccounts,
  quarterlyCliff,
  customerYtdCompare,
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

// 카테고리(B2B/B2C/면세점/수출) YTD 누적 vs 전년 동기 누적 비교.
// 월별 등락은 노이즈가 많으므로 YTD 누적 흐름으로 보조 해석.
function categoryYtdCompare(
  cube: FactCube,
  ym: string,
  cat: Category,
): { ytd: number; prevYtd: number; diff: number; pct: number | null } {
  const [y] = ym.split("-").map(Number);
  const months = enumerateMonths(`${y}-01`, ym);
  let ytd = 0;
  for (const m of months) ytd += cube.byMonthCategory.get(m)?.get(cat)?.revenue ?? 0;
  const prevYm = prevYearSameMonth(ym);
  const prevMonths = enumerateMonths(`${y - 1}-01`, prevYm);
  let prevYtd = 0;
  for (const m of prevMonths) prevYtd += cube.byMonthCategory.get(m)?.get(cat)?.revenue ?? 0;
  const diff = ytd - prevYtd;
  const pct = prevYtd !== 0 ? diff / Math.abs(prevYtd) : null;
  return { ytd, prevYtd, diff, pct };
}

// 거래처 인사이트의 detail 라인에 YTD 누적 컨텍스트 1줄 추가.
// 월 변동만 보면 노이즈로 오인할 수 있어 YTD 누적 vs 전년 동기 비교를 함께 노출.
function buildYtdContextDetail(
  yc: { ytd: number; prevYtd: number; diff: number; pct: number | null },
  oppositeDirection: boolean,
  oppositeNote: string,
): string {
  const head = yc.prevYtd > 0
    ? `YTD 누적 ${formatKRWShort(yc.ytd)} · 전년 동기 ${formatKRWShort(yc.prevYtd)} (${formatPct(yc.pct ?? 0)})`
    : `YTD 누적 ${formatKRWShort(yc.ytd)} (전년 동기 매출 없음)`;
  return oppositeDirection ? `${head} — ${oppositeNote}` : head;
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
    const yc = categoryYtdCompare(cube, ym, m.label as Category);
    // 월 변동과 YTD 누적이 반대 방향이면 단발성 노이즈일 가능성 → info로 격하
    const monthlyDown = m.diff < 0;
    const ytdUp = yc.diff > 0 && yc.prevYtd > 0;
    const ytdDown = yc.diff < 0 && yc.prevYtd > 0;
    const oppositeYtd = (monthlyDown && ytdUp) || (!monthlyDown && ytdDown);
    out.push({
      severity: oppositeYtd ? "info" : pickSeverity(m.pct, false, false),
      category: "카테고리",
      text: ct.text,
      detail: buildYtdContextDetail(
        yc,
        oppositeYtd,
        monthlyDown ? "월 하락이지만 YTD 누적은 상승 — 우려 낮음" : "월 상승이지만 YTD 누적은 하락 — 단발성 가능",
      ),
      weight: Math.abs(m.diff),
    });
  }

  // 거래처 변동 핵심 — 월 변동 + YTD 누적 컨텍스트
  // 월 변동과 YTD 방향이 반대면 단발성 가능성 → severity 격하(info).
  const movers = topMovers(cube, ym, prevYM, 3);
  if (movers.gainers.length > 0) {
    const g = movers.gainers[0];
    if (g.diff >= 10_000_000) {
      const ct = changeText(g.customer, g.current, g.prev);
      const yc = customerYtdCompare(cube, g.customer, ym);
      // 월별은 상승이지만 YTD 누적은 -면 일회성 spike → info
      const oppositeYtd = yc.diff < 0 && yc.prevYtd > 0;
      out.push({
        severity: oppositeYtd ? "info" : "positive",
        category: "거래처 상승",
        text: ct.text,
        detail: buildYtdContextDetail(yc, oppositeYtd, "월 상승이지만 YTD 누적은 하락 — 단발성 가능"),
        weight: Math.abs(g.diff),
        href: `/accounts?customer=${encodeURIComponent(g.customer)}&month=${ym}`,
      });
    }
  }
  if (movers.decliners.length > 0) {
    const d = movers.decliners[0];
    if (d.diff <= -10_000_000) {
      const ct = changeText(d.customer, d.current, d.prev);
      const yc = customerYtdCompare(cube, d.customer, ym);
      // 월별은 하락이지만 YTD 누적은 +면 노이즈 가능성 → info로 격하
      const oppositeYtd = yc.diff > 0 && yc.prevYtd > 0;
      const baseSeverity = pickSeverity(d.pct ?? -0.5, false, d.current === 0);
      out.push({
        severity: oppositeYtd ? "info" : baseSeverity,
        category: "거래처 하락",
        text: ct.text,
        detail: buildYtdContextDetail(yc, oppositeYtd, "월 하락이지만 YTD 누적은 상승 — 우려 낮음"),
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
      detail: lost.length > 1 ? `+${lost.length - 1}개 더` : undefined,
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
      text: `이번달 신규 B2B 거래처 ${totalNew}개 진입`,
      weight: totalNew,
    });
  }
  if (totalLost > 0) {
    out.push({
      severity: totalLost > totalNew ? "warn" : "info",
      category: "거래처 변동",
      text: `직전 3개월 거래 ${totalLost}개가 이번달 매출 0`,
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

// ── 바크로하우스 탭 ──────────────────────────────────────
type BHPartnerData = {
  salesCur: { partnerName: string; paymentAmount: number; brand: string }[];
  salesPrev: { partnerName: string; paymentAmount: number; brand: string }[];
  partnerMap: Map<string, { salesRep: string; agencyLinker: string | null }>;
};

function groupByKey(
  sales: { partnerName: string; paymentAmount: number }[],
  keyFn: (name: string) => string,
): Map<string, { revenue: number }> {
  const m = new Map<string, { revenue: number }>();
  for (const s of sales) {
    if (!s.partnerName) continue;
    const k = keyFn(s.partnerName);
    const c = m.get(k) ?? { revenue: 0 };
    c.revenue += s.paymentAmount;
    m.set(k, c);
  }
  return m;
}

export function computeBaqueroHouseInsights(
  cube: FactCube,
  ym: string,
  partnerData?: BHPartnerData,
): InsightBullet[] {
  const prevYM = prevMonth(ym);
  const prevYearYM = prevYearSameMonth(ym);
  const out: InsightBullet[] = [];

  // 1. 전체 매출 전월 대비
  const curCells = cubeMonthChannelCells(cube, ym);
  const prevCells = cubeMonthChannelCells(cube, prevYM);
  const curRev = curCells.get("바크로하우스")?.revenue ?? 0;
  const prevRev = prevCells.get("바크로하우스")?.revenue ?? 0;
  const tb = totalChangeBullet(curRev, prevRev, "전월", "바크로하우스");
  if (tb) out.push(tb);

  // 2. 전년 동월 대비
  const prevYearCells = cubeMonthChannelCells(cube, prevYearYM);
  const prevYearRev = prevYearCells.get("바크로하우스")?.revenue ?? 0;
  if (prevYearRev > 0) {
    const yb = totalChangeBullet(curRev, prevYearRev, "전년 동월", "바크로하우스");
    if (yb) out.push(yb);
  }

  if (partnerData && partnerData.salesCur.length > 0) {
    const { salesCur, salesPrev, partnerMap } = partnerData;

    // 3. 파트너 추천 매출 비율
    const refRevenue = salesCur.reduce((s, r) => s + r.paymentAmount, 0);
    if (curRev > 0) {
      out.push({
        severity: "info",
        category: "파트너 추천",
        text: `파트너 추천 매출 비율 ${formatPctAbs(refRevenue / curRev)} (${formatKRWShort(refRevenue)})`,
      });
    }

    // 4. 파트너 빅 무버
    const partnerCur = groupByKey(salesCur, (n) => n);
    const partnerPrev = groupByKey(salesPrev, (n) => n);
    out.push(...topMoversFromCells(partnerCur, partnerPrev, {
      categoryLabel: "파트너",
      minAbsDiff: 100_000,
      minPct: 0.2,
      maxBullets: 3,
    }));

    // 5. 신규/이탈 파트너
    const newPartners = [...partnerCur.keys()].filter((p) => !partnerPrev.has(p));
    const lostPartners = [...partnerPrev.keys()].filter((p) => !partnerCur.has(p));
    if (newPartners.length > 0) {
      const topNew = newPartners
        .map((p) => ({ name: p, rev: partnerCur.get(p)!.revenue }))
        .sort((a, b) => b.rev - a.rev);
      out.push({
        severity: "positive",
        category: "신규 파트너",
        text: `신규 파트너 ${newPartners.length}개 (${topNew[0].name} ${formatKRWShort(topNew[0].rev)}${newPartners.length > 1 ? ` 외 ${newPartners.length - 1}개` : ""})`,
        weight: topNew[0].rev,
      });
    }
    if (lostPartners.length > 0) {
      const topLost = lostPartners
        .map((p) => ({ name: p, rev: partnerPrev.get(p)!.revenue }))
        .sort((a, b) => b.rev - a.rev);
      out.push({
        severity: lostPartners.length >= 3 ? "critical" : "warn",
        category: "이탈 파트너",
        text: `이탈 파트너 ${lostPartners.length}개 (${topLost[0].name} 전월 ${formatKRWShort(topLost[0].rev)}${lostPartners.length > 1 ? ` 외 ${lostPartners.length - 1}개` : ""})`,
        weight: topLost[0].rev,
      });
    }

    // 6. 브랜드별 추천 매출 변화
    const brandCurMap = new Map<string, { revenue: number }>();
    const brandPrevMap = new Map<string, { revenue: number }>();
    for (const s of salesCur) {
      if (!s.brand) continue;
      const c = brandCurMap.get(s.brand) ?? { revenue: 0 };
      c.revenue += s.paymentAmount;
      brandCurMap.set(s.brand, c);
    }
    for (const s of salesPrev) {
      if (!s.brand) continue;
      const c = brandPrevMap.get(s.brand) ?? { revenue: 0 };
      c.revenue += s.paymentAmount;
      brandPrevMap.set(s.brand, c);
    }
    out.push(...topMoversFromCells(brandCurMap, brandPrevMap, {
      categoryLabel: "브랜드 추천",
      minAbsDiff: 50_000,
      minPct: 0.2,
      maxBullets: 2,
    }));

    // 7. 영업사원/대리점별 변화
    function repKey(name: string): string {
      const p = partnerMap.get(name);
      if (!p) return "미지정";
      if (p.agencyLinker && p.agencyLinker !== "본사") return p.agencyLinker;
      return p.salesRep || "미지정";
    }
    const repCur = groupByKey(salesCur, repKey);
    const repPrev = groupByKey(salesPrev, repKey);
    out.push(...topMoversFromCells(repCur, repPrev, {
      categoryLabel: "담당자",
      minAbsDiff: 100_000,
      minPct: 0.2,
      maxBullets: 2,
    }));
  }

  return rankBullets(out).slice(0, 10);
}

// ── 대리점 탭 ──────────────────────────────────────────
export function computeAgencyInsights(cube: FactCube, ym: string): InsightBullet[] {
  const prevYM = prevMonth(ym);
  const out: InsightBullet[] = [];

  const curCells = cubeMonthB2bTypeCells(cube, ym);
  const prevCells = cubeMonthB2bTypeCells(cube, prevYM);
  const curRev = curCells.get("대리점")?.revenue ?? 0;
  const prevRev = prevCells.get("대리점")?.revenue ?? 0;
  const tb = totalChangeBullet(curRev, prevRev, "전월", "대리점 전체");
  if (tb) out.push(tb);

  const allCustCur = cubeMonthCustomerCells(cube, ym);
  const allCustPrev = cubeMonthCustomerCells(cube, prevYM);
  const agCustCur = new Map<string, { revenue: number }>();
  const agCustPrev = new Map<string, { revenue: number }>();
  for (const [c, cell] of allCustCur) {
    if (cube.customerToB2bType?.get(c) === "대리점") agCustCur.set(c, { revenue: cell.revenue });
  }
  for (const [c, cell] of allCustPrev) {
    if (cube.customerToB2bType?.get(c) === "대리점") agCustPrev.set(c, { revenue: cell.revenue });
  }
  out.push(...topMoversFromCells(agCustCur, agCustPrev, {
    categoryLabel: "대리점 거래처",
    minAbsDiff: 1_000_000,
    minPct: 0.15,
    maxBullets: 4,
  }));

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

// ── 목표 달성 탭 ──────────────────────────────────────
// targets 데이터를 받아서 휴리스틱.
import type { TargetRowWithActual, PeriodAgg } from "./targets";
export function computeTargetsInsights(targetsActuals: TargetRowWithActual[], ym: string, periods?: PeriodAgg[]): InsightBullet[] {
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
    const prospTotal = prosp.reduce((s, t) => s + t.target, 0);
    out.push({
      severity: "info",
      category: "신규 추진",
      text: `신규 추진 채널 ${prosp.length}건 (목표 합계 ${formatKRWShort(prospTotal)}) — 매칭 sales 데이터 없음`,
      weight: prospTotal,
    });
  }

  // 기간별 인사이트 (periods 전달 시)
  if (periods && periods.length >= 4) {
    const [, pQ, pH, pA] = periods;

    if (pQ.totalRate !== null) {
      out.push({
        severity: pQ.totalRate >= 1 ? "positive" : pQ.totalRate >= 0.85 ? "info" : pQ.totalRate >= 0.7 ? "warn" : "critical",
        category: "분기 달성",
        text: `${pQ.label} 종합 달성률 ${formatPctAbs(pQ.totalRate, 1)} (실적 ${formatKRWShort(pQ.totalActual)} / 목표 ${formatKRWShort(pQ.totalTarget)})`,
        weight: Math.abs(pQ.totalActual - pQ.totalTarget),
      });
    }

    if (pH.totalRate !== null) {
      out.push({
        severity: pH.totalRate >= 1 ? "positive" : pH.totalRate >= 0.85 ? "info" : pH.totalRate >= 0.7 ? "warn" : "critical",
        category: "반기 달성",
        text: `${pH.label} 누적 달성률 ${formatPctAbs(pH.totalRate, 1)} (실적 ${formatKRWShort(pH.totalActual)} / 목표 ${formatKRWShort(pH.totalTarget)})`,
        weight: Math.abs(pH.totalActual - pH.totalTarget),
      });
    }

    // 전 기간 70% 미만 채널 감지
    const allChannelKeys = new Set(periods.flatMap((p) => p.byChannel.filter((c) => !c.prospective && c.target > 0).map((c) => `${c.division}|${c.customerKey}`)));
    const persistentUnder: string[] = [];
    for (const ck of allChannelKeys) {
      const allUnder = periods.every((p) => {
        const ch = p.byChannel.find((c) => `${c.division}|${c.customerKey}` === ck);
        return ch && ch.target > 0 && ch.rate !== null && ch.rate < 0.7;
      });
      if (allUnder) persistentUnder.push(ck.split("|")[1]);
    }
    if (persistentUnder.length > 0) {
      out.push({
        severity: "critical",
        category: "지속 미달",
        text: `${persistentUnder.slice(0, 3).join(", ")}${persistentUnder.length > 3 ? ` 외 ${persistentUnder.length - 3}건` : ""} — 월/분기/반기/연간 모두 70% 미만`,
        weight: 999_999_999,
      });
    }
  }

  return rankBullets(out).slice(0, 8);
}

// ── 거래처 분석 탭 ─────────────────────────────────────
export function computeAccountsInsights(cube: FactCube, ym: string, customer: string | null): InsightBullet[] {
  if (!customer) {
    // 거래처 미선택 — 종합적인 거래처 변동 요약
    const out: InsightBullet[] = [];
    const movers = topMovers(cube, ym, prevMonth(ym), 3);
    if (movers.gainers[0]) {
      const g = movers.gainers[0];
      const yc = customerYtdCompare(cube, g.customer, ym);
      const oppositeYtd = yc.diff < 0 && yc.prevYtd > 0;
      out.push({
        severity: oppositeYtd ? "info" : "positive",
        category: "최대 상승",
        text: `${g.customer} ${formatKRWShort(g.diff)} 증가`,
        detail: buildYtdContextDetail(yc, oppositeYtd, "월 상승이지만 YTD 누적은 하락 — 단발성 가능"),
        weight: Math.abs(g.diff),
      });
    }
    if (movers.decliners[0]) {
      const d = movers.decliners[0];
      const yc = customerYtdCompare(cube, d.customer, ym);
      const oppositeYtd = yc.diff > 0 && yc.prevYtd > 0;
      out.push({
        severity: oppositeYtd ? "info" : "warn",
        category: "최대 하락",
        text: `${d.customer} ${formatKRWShort(d.diff)} 감소`,
        detail: buildYtdContextDetail(yc, oppositeYtd, "월 하락이지만 YTD 누적은 상승 — 우려 낮음"),
        weight: Math.abs(d.diff),
      });
    }
    const lost = lostKeyAccounts(cube, ym, { lookback: "quarter", topN: 5 });
    if (lost.length > 0) {
      out.push({
        severity: "critical",
        category: "핵심 이탈",
        text: `지난 분기 상위 거래처 중 ${lost.length}개가 이번달 매출 0`,
        weight: lost.reduce((s, l) => s + l.baselineRevenue, 0),
      });
    }
    const newOnes = newAccounts(cube, ym, 6);
    if (newOnes.length > 0) {
      out.push({
        severity: "info",
        category: "신규 진입",
        text: `이번달 신규 거래처 ${newOnes.length}개 진입 (Top: ${newOnes[0].customer} ${formatKRWShort(newOnes[0].currentRevenue)})`,
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

// ── 비매출 출고 탭 인사이트 ──────────────────────────────
// 휴리스틱:
//   1. 총 비매출 원가 전월 대비 ±30% 이상 변동
//   2. 사업형태별 전월 대비 2배 이상 폭증 (이번달 cost >= 1M)
//   3. 이번달 신규 등장 사업형태 / 평소 있다가 사라진 사업형태 (직전 3개월 기준)
export function computeNonRevenueInsights(
  cube: FactCube,
  ym: string,
): InsightBullet[] {
  const out: InsightBullet[] = [];
  const prevYM = prevMonth(ym);

  const curMap = cube.byMonthNonRevBizType.get(ym) ?? new Map();
  const prevMap = cube.byMonthNonRevBizType.get(prevYM) ?? new Map();

  const sumCost = (m: Map<string, { cost: number }>) =>
    [...m.values()].reduce((s, c) => s + c.cost, 0);
  const curTotal = sumCost(curMap);
  const prevTotal = sumCost(prevMap);

  // 1. 총 비매출 원가 전월 대비
  if (prevTotal > 0 || curTotal > 0) {
    const diff = curTotal - prevTotal;
    const pct = prevTotal !== 0 ? diff / Math.abs(prevTotal) : null;
    if (pct !== null && Math.abs(pct) >= 0.3) {
      out.push({
        severity: pct > 0 ? "warn" : "info",
        category: "비매출 총원가",
        text: `이번달 ${formatKRWShort(curTotal)} (전월 ${formatKRWShort(prevTotal)}, ${formatPct(pct, 0)})`,
        detail: `차이 ${diff >= 0 ? "+" : ""}${formatKRWShort(diff)}`,
        weight: Math.abs(diff),
      });
    }
  }

  // 2. 사업형태별 전월 대비 2배 이상 폭증
  const allBiz = new Set([...curMap.keys(), ...prevMap.keys()]);
  for (const bt of allBiz) {
    const cur = (curMap.get(bt) as { cost: number } | undefined)?.cost ?? 0;
    const prev = (prevMap.get(bt) as { cost: number } | undefined)?.cost ?? 0;
    if (cur < 1_000_000) continue;
    if (prev > 0 && cur / prev >= 2) {
      const diff = cur - prev;
      out.push({
        severity: "warn",
        category: "사업형태 폭증",
        text: `${bt} 전월 대비 ${formatPct(diff / prev, 0)} (${formatKRWShort(prev)} → ${formatKRWShort(cur)})`,
        detail: `차이 +${formatKRWShort(diff)}`,
        weight: diff,
      });
    }
  }

  // 3. 신규 / 단절 사업형태 — 직전 3개월 (전월, 2개월 전, 3개월 전) 기준
  const prev2YM = prevMonth(prevYM);
  const prev3YM = prevMonth(prev2YM);
  const prev2Map = cube.byMonthNonRevBizType.get(prev2YM) ?? new Map();
  const prev3Map = cube.byMonthNonRevBizType.get(prev3YM) ?? new Map();
  const recent3 = [prevMap, prev2Map, prev3Map];

  for (const bt of allBiz) {
    const cur = (curMap.get(bt) as { cost: number } | undefined)?.cost ?? 0;
    const hadBefore = recent3.some(
      (m) => ((m.get(bt) as { cost: number } | undefined)?.cost ?? 0) > 0,
    );
    if (!hadBefore && cur >= 1_000_000) {
      out.push({
        severity: "info",
        category: "신규 사업형태",
        text: `${bt} 이번달 처음 등장 (${formatKRWShort(cur)})`,
        weight: cur,
      });
    }
    const recentAvg =
      recent3.reduce(
        (s, m) => s + ((m.get(bt) as { cost: number } | undefined)?.cost ?? 0),
        0,
      ) / 3;
    if (cur === 0 && recentAvg >= 1_000_000) {
      out.push({
        severity: "info",
        category: "사업형태 중단",
        text: `${bt} 이번달 0 (직전 3개월 평균 ${formatKRWShort(recentAvg)})`,
        weight: recentAvg,
      });
    }
  }

  return rankBullets(out).slice(0, 5);
}
