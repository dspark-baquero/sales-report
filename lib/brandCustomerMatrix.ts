// 종합탭 "브랜드 × 거래처 매트릭스" 데이터 빌더.
// 5줄 핵심 변동 인사이트의 보완 — 임원이 한눈에 (브랜드, 거래처) 단위
// 전년 동기 YTD 대비 / 목표 달성률을 보고, 셀 클릭으로 세부 정보를 펼침.
//
// 색상 분류:
//   파랑   전년 YTD +, 목표 YTD ≥ 100%
//   초록   전년 YTD +, 목표 YTD < 100%
//   빨강   전년 YTD -, 목표 YTD < 100%
//   황색   전년 YTD -, 목표 YTD ≥ 100%   (작년이 워낙 좋았던 케이스)
//   회색   셀 매출 미미 / 데이터 부족
//
// 거래처 단위 target은 데이터에 없음 → 그 거래처가 속한
// (브랜드 × customerKey) 의 YTD 누적 목표로 차원 2 결정.
// 같은 customerKey 거래처들은 같은 차원 2 색상을 공유.

import type { FactCube } from "./facts";
import type { TargetRow } from "./targets";
import type { SalesRow } from "./load";
import { enumerateMonths } from "./aggregate";
import { prevYearSameMonth, prevMonth } from "./compare";
import { channelGroup } from "@/config/mappings";

export type CellColor = "blue" | "green" | "red" | "amber" | "gray";

export type MatrixCell = {
  brand: string;
  customer: string;
  customerKey: string | null;
  // 매출 5종
  monthCur: number;
  monthPrev: number;
  monthPrevYear: number;
  ytd: number;
  prevYtd: number;
  // 비교 메트릭
  ytdDiff: number;
  ytdPct: number | null;        // 전년 동기 YTD 대비
  ytdTarget: number;            // (브랜드 × customerKey) YTD 누적 목표 — 없으면 0
  achievementRate: number | null; // ytd / ytdTarget — target 없으면 null
  color: CellColor;
  colorReason: string;          // "전년 동기 대비 +20% / 면세점 목표 105% 달성 → 파랑"
};

export type BrandCustomerMatrixData = {
  brands: string[];
  customers: string[];
  cells: Map<string, MatrixCell>; // key = `${brand}|${customer}`
};

const MIN_CELL_REVENUE = 1_000_000;
const DEADZONE = 0.03;

// 거래처 → customerKey(브랜드 매트릭스의 차원 2) 추론.
// cube 의 customerToCategory / customerToChannel / customerToB2bType 인덱스 활용.
function inferCustomerKey(cube: FactCube, customer: string): string | null {
  const cat = cube.customerToCategory.get(customer);
  const ch = cube.customerToChannel.get(customer) ?? "";
  const b2b = cube.customerToB2bType.get(customer);

  if (ch === "바크로하우스" || ch === "바크로하우스 스마트스토어") return "바크로하우스";
  if (cat === "면세점") return "면세점";
  if (cat === "B2B") {
    if (b2b === "대리점") return "대리점";
    if (b2b && b2b.startsWith("병원")) return "병원";
    if (b2b && b2b.startsWith("피부관리실")) return "피부관리실";
    return null;
  }
  if (cat === "B2C") {
    const g = channelGroup(ch);
    if (g === "자사 공식몰") return "공식몰";
    if (g === "종합몰") return "종합몰";
    if (g === "소호몰") return "소호몰";
    return null;
  }
  return null;
}

function pickColor(opts: {
  ytdPct: number | null;
  achievementRate: number | null;
  cellYtd: number;
}): { color: CellColor; reason: string } {
  const { ytdPct, achievementRate, cellYtd } = opts;
  if (cellYtd < MIN_CELL_REVENUE) {
    return { color: "gray", reason: "YTD 매출 미미" };
  }

  // 차원 1: 전년 동기 YTD 대비 ±
  // prev=0 신규는 +로 간주, ytdPct=null
  const yPct = ytdPct;
  const isUp = yPct === null ? cellYtd > 0 : yPct > DEADZONE;
  const isDown = yPct !== null && yPct < -DEADZONE;
  const isFlat = !isUp && !isDown;

  // 차원 2: target 달성률
  const hasTarget = achievementRate !== null;
  const achieved = hasTarget && (achievementRate as number) >= 1;

  if (isFlat && !hasTarget) {
    return { color: "gray", reason: "변동 미미 / 목표 매칭 없음" };
  }

  if (isUp) {
    if (!hasTarget) return { color: "blue", reason: "전년 동기 대비 상승 (목표 매칭 없음)" };
    return achieved
      ? { color: "blue", reason: "전년 동기 대비 상승 + 채널 목표 달성" }
      : { color: "green", reason: "전년 동기 대비 상승, 채널 목표는 미달" };
  }
  if (isDown) {
    if (!hasTarget) return { color: "red", reason: "전년 동기 대비 하락 (목표 매칭 없음)" };
    return achieved
      ? { color: "amber", reason: "전년 동기 대비 하락하지만 채널 목표는 달성 — 작년 호조" }
      : { color: "red", reason: "전년 동기 대비 하락 + 채널 목표 미달" };
  }
  // flat + hasTarget
  return achieved
    ? { color: "blue", reason: "전년 동기와 비슷 + 채널 목표 달성" }
    : { color: "gray", reason: "변동 미미 + 채널 목표 미달" };
}

// YTD 누적 매출 상위 N 거래처 추출
function pickTopCustomers(cube: FactCube, ym: string, topN: number): string[] {
  const [y] = ym.split("-").map(Number);
  const months = enumerateMonths(`${y}-01`, ym);
  const totals = new Map<string, number>();
  for (const m of months) {
    const cells = cube.byMonthCustomer.get(m);
    if (!cells) continue;
    for (const [cust, cell] of cells) {
      if (cell.revenue <= 0) continue;
      totals.set(cust, (totals.get(cust) ?? 0) + cell.revenue);
    }
  }
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([c]) => c);
}

export function buildBrandCustomerMatrix(
  cube: FactCube,
  targets: TargetRow[],
  ytdRows: SalesRow[],        // 올해 1월~ym 매출 rows
  prevYearYtdRows: SalesRow[], // 작년 1월~작년 ym 매출 rows
  monthRowsCur: SalesRow[],    // 이번달
  monthRowsPrev: SalesRow[],   // 전월
  monthRowsPrevYear: SalesRow[], // 전년 동월
  ym: string,
  brands: string[],
  topN: number,
): BrandCustomerMatrixData {
  const customers = pickTopCustomers(cube, ym, topN);
  const customerSet = new Set(customers);
  const brandSet = new Set(brands);

  // 거래처별 customerKey 매핑 (한 번만)
  const customerKeyMap = new Map<string, string | null>();
  for (const c of customers) customerKeyMap.set(c, inferCustomerKey(cube, c));

  // (브랜드 × customerKey) YTD 누적 목표 사전 합산
  const [y] = ym.split("-").map(Number);
  const ytdMonthSet = new Set(enumerateMonths(`${y}-01`, ym));
  const brandKeyTarget = new Map<string, number>(); // `${brand}|${customerKey}`
  for (const t of targets) {
    if (!ytdMonthSet.has(t.yearMonth)) continue;
    const key = `${t.brand}|${t.customerKey}`;
    brandKeyTarget.set(key, (brandKeyTarget.get(key) ?? 0) + t.target);
  }

  // (브랜드 × 거래처) 매출 누적 — 4가지 rows
  const accumulate = (rows: SalesRow[]): Map<string, number> => {
    const out = new Map<string, number>();
    for (const r of rows) {
      if (r.isNonRevenue) continue;
      if (!brandSet.has(r.brand)) continue;
      if (!customerSet.has(r.customer)) continue;
      const key = `${r.brand}|${r.customer}`;
      out.set(key, (out.get(key) ?? 0) + r.realRevenue);
    }
    return out;
  };

  const curMonthMap = accumulate(monthRowsCur);
  const prevMonthMap = accumulate(monthRowsPrev);
  const prevYearMonthMap = accumulate(monthRowsPrevYear);
  const ytdMap = accumulate(ytdRows);
  const prevYtdMap = accumulate(prevYearYtdRows);

  const cells = new Map<string, MatrixCell>();
  for (const brand of brands) {
    for (const customer of customers) {
      const key = `${brand}|${customer}`;
      const ytd = ytdMap.get(key) ?? 0;
      const prevYtd = prevYtdMap.get(key) ?? 0;
      const ytdDiff = ytd - prevYtd;
      const ytdPct = prevYtd !== 0 ? ytdDiff / Math.abs(prevYtd) : null;
      const customerKey = customerKeyMap.get(customer) ?? null;
      const ytdTarget = customerKey ? brandKeyTarget.get(`${brand}|${customerKey}`) ?? 0 : 0;
      const achievementRate = ytdTarget > 0 ? ytd / ytdTarget : null;

      const { color, reason } = pickColor({ ytdPct, achievementRate, cellYtd: ytd });

      cells.set(key, {
        brand,
        customer,
        customerKey,
        monthCur: curMonthMap.get(key) ?? 0,
        monthPrev: prevMonthMap.get(key) ?? 0,
        monthPrevYear: prevYearMonthMap.get(key) ?? 0,
        ytd,
        prevYtd,
        ytdDiff,
        ytdPct,
        ytdTarget,
        achievementRate,
        color,
        colorReason: reason,
      });
    }
  }

  return { brands, customers, cells };
}
