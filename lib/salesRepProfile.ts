// 영업사원(내부 직원) 1명 상세 프로파일.
// B2B종합 탭(app/b2b-summary)과 동일한 기존 함수만 조합 — raw 전체 스캔 없음(CLAUDE.md §4).
//
// 데이터 출처 구분:
//  - dealerProfile: dealer raw 기준 → 직거래처 매출·거래처 동향·유형 믹스·12개월 추이.
//  - salesRepSummary 함수들: manager 귀속 기준 → 소스별 합산·대리점·링커·바크로하우스.

import type { FactCube } from "./facts";
import { isLinker } from "@/config/mappings";
import {
  repSummaryRows,
  agencyByManagerRows,
  linkerRows,
  bhByRepRows,
  type RepSummaryRow,
  type AgencyManagerRow,
  type LinkerRow,
  type BHRepRow,
} from "./salesRepSummary";
import { dealerProfile, type DealerProfile } from "./dealerAnalysis";
import {
  buildDealerAchievements,
  dealerTargetMap,
  type DealerTargetRow,
  type DealerAchievement,
} from "./dealer-targets";
import type { BHPartner, BHPartnerSale } from "./baquerohouse-data";
import type { YTDSeries, YTDAchievement } from "./ytd";

export type SalesRepProfile = {
  rep: string;
  summary: RepSummaryRow | null; // 4개 소스 통합 (b2b-summary 통합표와 동일)
  dealer: DealerProfile; // 직거래처 raw deep dive
  achievement: DealerAchievement | null; // 영업사원 목표 달성(월·누적)
  agency: AgencyManagerRow | null; // 담당 대리점
  linkers: LinkerRow[]; // 담당 링커
  bh: BHRepRow | null; // 바크로하우스 추천(직접관리분)
  // YTD(연초~ym) 직거래처 — 월별 실적/목표/전년 + 누적 달성도. YearToDateChart용.
  ytdSeries: YTDSeries[];
  ytdMonthlyTargets: number[];
  ytdPrevYear: number[];
  ytdAchievement: YTDAchievement;
};

export type SalesRepProfileDeps = {
  partnerMap: Map<string, BHPartner>;
  bhSalesCur: BHPartnerSale[];
  bhSalesPrev: BHPartnerSale[];
  dealerTargets: DealerTargetRow[];
  ytdMonths: string[];
  // 연내 다음 달(전망). 주어지면 YTD 차트에 목표·전년만 있는 전망 칸을 하나 더 붙인다.
  outlookMonth?: string | null;
};

export function buildSalesRepProfile(
  cube: FactCube,
  repName: string,
  ym: string,
  prevYM: string,
  deps: SalesRepProfileDeps,
): SalesRepProfile {
  const { partnerMap, bhSalesCur, bhSalesPrev, dealerTargets, ytdMonths, outlookMonth } = deps;

  const summary =
    repSummaryRows(cube, partnerMap, bhSalesCur, bhSalesPrev, ym, prevYM).find(
      (r) => r.manager === repName,
    ) ?? null;

  const dealer = dealerProfile(cube, repName, ym);

  const agency =
    agencyByManagerRows(cube, ym, prevYM).find((r) => r.manager === repName) ?? null;

  const linkers = linkerRows(cube, ym, prevYM).filter((r) => r.manager === repName);

  const bh =
    bhByRepRows(partnerMap, bhSalesCur, bhSalesPrev).find((r) => r.salesRep === repName) ?? null;

  // 영업사원 목표 달성 — b2b-summary와 동일 기준(직거래처 = byMonthDealer, 링커 제외).
  const monthActual = new Map<string, number>();
  for (const [d, cell] of cube.byMonthDealer.get(ym) ?? new Map()) {
    if (isLinker(d)) continue;
    monthActual.set(d, (cell as { revenue: number }).revenue);
  }
  const ytdActual = new Map<string, number>();
  for (const m of ytdMonths) {
    for (const [d, cell] of cube.byMonthDealer.get(m) ?? new Map()) {
      if (isLinker(d)) continue;
      ytdActual.set(d, (ytdActual.get(d) ?? 0) + (cell as { revenue: number }).revenue);
    }
  }
  const achievement =
    buildDealerAchievements(dealerTargets, monthActual, ytdActual, ym, ytdMonths, "영업사원").find(
      (a) => a.name === repName,
    ) ?? null;

  // ── YTD 직거래처: 월별 실적/목표/전년 + 누적 달성도 ──
  const ytdActualByMonth = ytdMonths.map(
    (m) => (cube.byMonthDealer.get(m)?.get(repName) as { revenue: number } | undefined)?.revenue ?? 0,
  );
  const ytdTargetByMonth = ytdMonths.map(
    (m) => dealerTargetMap(dealerTargets, m, "영업사원").get(repName) ?? 0,
  );
  const ytdPrevYear = ytdMonths.map((m) => {
    const py = `${Number(m.slice(0, 4)) - 1}-${m.slice(5, 7)}`;
    return (cube.byMonthDealer.get(py)?.get(repName) as { revenue: number } | undefined)?.revenue ?? 0;
  });
  const ytdActualSum = ytdActualByMonth.reduce((s, v) => s + v, 0);
  const ytdTargetSum = ytdTargetByMonth.reduce((s, v) => s + v, 0);
  const ytdAchievement: YTDAchievement = {
    ytdActual: ytdActualSum,
    ytdTarget: ytdTargetSum,
    rate: ytdTargetSum > 0 ? ytdActualSum / ytdTargetSum : null,
    diff: ytdActualSum - ytdTargetSum,
    monthsElapsed: ytdMonths.length,
  };
  const ytdSeries: YTDSeries[] = [
    { name: "직거래처 실적", values: ytdActualByMonth, color: "#6366f1" },
  ];

  // 전망 칸: 실매출(ytdSeries)은 그대로 두고 목표·전년 배열에만 다음 달 슬롯을 추가.
  // 누적 달성도(ytdAchievement)는 경과월 기준 유지.
  const ytdMonthlyTargetsOut = outlookMonth
    ? [...ytdTargetByMonth, dealerTargetMap(dealerTargets, outlookMonth, "영업사원").get(repName) ?? 0]
    : ytdTargetByMonth;
  const ytdPrevYearOut = outlookMonth
    ? [
        ...ytdPrevYear,
        (cube.byMonthDealer
          .get(`${Number(outlookMonth.slice(0, 4)) - 1}-${outlookMonth.slice(5, 7)}`)
          ?.get(repName) as { revenue: number } | undefined)?.revenue ?? 0,
      ]
    : ytdPrevYear;

  return {
    rep: repName,
    summary,
    dealer,
    achievement,
    agency,
    linkers,
    bh,
    ytdSeries,
    ytdMonthlyTargets: ytdMonthlyTargetsOut,
    ytdPrevYear: ytdPrevYearOut,
    ytdAchievement,
  };
}
