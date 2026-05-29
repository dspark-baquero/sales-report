// 종합탭 "브랜드 매트릭스" 2뎁스 데이터 빌더.
//
// 1뎁스: (브랜드 × 6채널대분류) — 채널 YTD 목표 + 달성률 + 4분면 색상.
//        해외영업 / B2B / 대리점 / 바크로하우스 / B2C / 면세점.
// 2뎁스: (브랜드 × 선택채널 거래처 Top N) — 채널 목표 미노출.
//        전년 동기 YTD 대비 ± 단일 차원 3색.
//
// 1뎁스에서 셀 클릭 시 채널이 전환되어 우측 2뎁스가 그 채널의 거래처로 드릴다운.

import type { FactCube } from "./facts";
import type { TargetRow } from "./targets";
import type { SalesRow } from "./parsers";
import { enumerateMonths } from "./aggregate";

// ── 채널 정의 ────────────────────────────────────────────

export type ChannelKey = "해외영업" | "B2B" | "대리점" | "바크로하우스" | "B2C" | "면세점";
export const CHANNEL_KEYS: ChannelKey[] = [
  "해외영업",
  "B2B",
  "대리점",
  "바크로하우스",
  "B2C",
  "면세점",
];

const BAQUEROHOUSE_CHANNELS = new Set(["바크로하우스", "바크로하우스 스마트스토어"]);

// 매출 row → 어느 채널대분류에 속하는가
export function channelRowFilter(ch: ChannelKey): (r: SalesRow) => boolean {
  switch (ch) {
    case "해외영업":
      return (r) => r.category === "수출";
    case "B2B":
      return (r) => r.category === "B2B" && r.b2bCustomerType !== "대리점";
    case "대리점":
      return (r) => r.category === "B2B" && r.b2bCustomerType === "대리점";
    case "바크로하우스":
      return (r) => BAQUEROHOUSE_CHANNELS.has(r.channel);
    case "B2C":
      return (r) => r.category === "B2C" && !BAQUEROHOUSE_CHANNELS.has(r.channel);
    case "면세점":
      return (r) => r.category === "면세점";
  }
}

// targets row → 어느 채널대분류 목표에 속하는가
const B2B_TARGET_KEYS = new Set(["병원", "피부관리실", "직거래처"]);
const B2C_TARGET_KEYS = new Set(["공식몰", "종합몰", "소호몰"]);

export function channelTargetFilter(ch: ChannelKey): (t: TargetRow) => boolean {
  switch (ch) {
    case "해외영업":
      return (t) => t.division === "해외";
    case "B2B":
      return (t) => t.division === "국내" && B2B_TARGET_KEYS.has(t.customerKey);
    case "대리점":
      return (t) => t.division === "국내" && t.customerKey === "대리점";
    case "바크로하우스":
      return (t) => t.division === "국내" && t.customerKey === "바크로하우스";
    case "B2C":
      return (t) => t.division === "국내" && B2C_TARGET_KEYS.has(t.customerKey);
    case "면세점":
      return (t) => t.division === "국내" && t.customerKey === "면세점";
  }
}

// ── 색상 분류 ────────────────────────────────────────────

export type CellColor = "blue" | "green" | "red" | "amber" | "gray";

const MIN_CELL_REVENUE = 1_000_000;
const DEADZONE = 0.03;

// 4분면 (1뎁스): 전년 ± × 목표 ±
export function pickColor4Way(opts: {
  ytdPct: number | null;
  achievementRate: number | null;
  cellYtd: number;
}): { color: CellColor; reason: string } {
  const { ytdPct, achievementRate, cellYtd } = opts;
  if (cellYtd < MIN_CELL_REVENUE) {
    return { color: "gray", reason: "YTD 매출 미미" };
  }

  const yPct = ytdPct;
  const isUp = yPct === null ? cellYtd > 0 : yPct > DEADZONE;
  const isDown = yPct !== null && yPct < -DEADZONE;
  const isFlat = !isUp && !isDown;

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
  return achieved
    ? { color: "blue", reason: "전년 동기와 비슷 + 채널 목표 달성" }
    : { color: "gray", reason: "변동 미미 + 채널 목표 미달" };
}

// 단일 차원 3색 (2뎁스): 전년 ± 만
export function pickColor3Way(opts: {
  ytdPct: number | null;
  cellYtd: number;
}): { color: CellColor; reason: string } {
  const { ytdPct, cellYtd } = opts;
  if (cellYtd < MIN_CELL_REVENUE) {
    return { color: "gray", reason: "YTD 매출 미미" };
  }
  if (ytdPct === null) {
    return { color: "blue", reason: "신규 매출 (전년 동기 0)" };
  }
  if (ytdPct > DEADZONE) {
    return { color: "blue", reason: "전년 동기 대비 상승" };
  }
  if (ytdPct < -DEADZONE) {
    return { color: "red", reason: "전년 동기 대비 하락" };
  }
  return { color: "gray", reason: "전년 동기와 비슷 (±3%)" };
}

// ── 1뎁스: 브랜드 × 채널대분류 ────────────────────────────

export type ChannelMatrixCell = {
  brand: string;
  channel: ChannelKey;
  monthCur: number;
  monthPrev: number;
  monthPrevYear: number;
  ytd: number;
  prevYtd: number;
  ytdDiff: number;
  ytdPct: number | null;
  ytdTarget: number;
  achievementRate: number | null;
  color: CellColor;
  colorReason: string;
};

export type BrandChannelMatrixData = {
  brands: string[];
  channels: ChannelKey[];
  cells: Map<string, ChannelMatrixCell>; // key = `${brand}|${channel}`
};

function accumulateBrandChannel(
  rows: SalesRow[],
  brandSet: Set<string>,
  ch: ChannelKey,
): Map<string, number> {
  const filter = channelRowFilter(ch);
  const out = new Map<string, number>();
  for (const r of rows) {
    if (r.isNonRevenue) continue;
    if (!brandSet.has(r.brand)) continue;
    if (!filter(r)) continue;
    out.set(r.brand, (out.get(r.brand) ?? 0) + r.realRevenue);
  }
  return out;
}

export function buildBrandChannelMatrix(
  targets: TargetRow[],
  ytdRows: SalesRow[],
  prevYearYtdRows: SalesRow[],
  monthRowsCur: SalesRow[],
  monthRowsPrev: SalesRow[],
  monthRowsPrevYear: SalesRow[],
  ym: string,
  brands: string[],
): BrandChannelMatrixData {
  const brandSet = new Set(brands);
  const [y] = ym.split("-").map(Number);
  const ytdMonthSet = new Set(enumerateMonths(`${y}-01`, ym));

  // (브랜드 × 채널) YTD 목표 사전 합산
  const brandChannelTarget = new Map<string, number>();
  for (const ch of CHANNEL_KEYS) {
    const tFilter = channelTargetFilter(ch);
    for (const t of targets) {
      if (!ytdMonthSet.has(t.yearMonth)) continue;
      if (!brandSet.has(t.brand)) continue;
      if (!tFilter(t)) continue;
      const key = `${t.brand}|${ch}`;
      brandChannelTarget.set(key, (brandChannelTarget.get(key) ?? 0) + t.target);
    }
  }

  const cells = new Map<string, ChannelMatrixCell>();
  for (const ch of CHANNEL_KEYS) {
    const curMap = accumulateBrandChannel(monthRowsCur, brandSet, ch);
    const prevMap = accumulateBrandChannel(monthRowsPrev, brandSet, ch);
    const prevYearMap = accumulateBrandChannel(monthRowsPrevYear, brandSet, ch);
    const ytdMap = accumulateBrandChannel(ytdRows, brandSet, ch);
    const prevYtdMap = accumulateBrandChannel(prevYearYtdRows, brandSet, ch);

    for (const brand of brands) {
      const ytd = ytdMap.get(brand) ?? 0;
      const prevYtd = prevYtdMap.get(brand) ?? 0;
      const ytdDiff = ytd - prevYtd;
      const ytdPct = prevYtd !== 0 ? ytdDiff / Math.abs(prevYtd) : null;
      const ytdTarget = brandChannelTarget.get(`${brand}|${ch}`) ?? 0;
      const achievementRate = ytdTarget > 0 ? ytd / ytdTarget : null;
      const { color, reason } = pickColor4Way({ ytdPct, achievementRate, cellYtd: ytd });

      cells.set(`${brand}|${ch}`, {
        brand,
        channel: ch,
        monthCur: curMap.get(brand) ?? 0,
        monthPrev: prevMap.get(brand) ?? 0,
        monthPrevYear: prevYearMap.get(brand) ?? 0,
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

  return { brands, channels: CHANNEL_KEYS, cells };
}

// ── 2뎁스: 브랜드 × 선택채널 거래처 Top N ────────────────

export type CustomerMatrixCell = {
  brand: string;
  customer: string;
  monthCur: number;
  monthPrev: number;
  monthPrevYear: number;
  ytd: number;
  prevYtd: number;
  ytdDiff: number;
  ytdPct: number | null;
  color: CellColor;
  colorReason: string;
};

export type BrandCustomerMatrixData = {
  channel: ChannelKey;
  brands: string[];
  customers: string[];
  cells: Map<string, CustomerMatrixCell>; // key = `${brand}|${customer}`
};

function accumulateBrandCustomer(
  rows: SalesRow[],
  brandSet: Set<string>,
  customerSet: Set<string>,
  rowFilter: (r: SalesRow) => boolean,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) {
    if (r.isNonRevenue) continue;
    if (!brandSet.has(r.brand)) continue;
    if (!customerSet.has(r.customer)) continue;
    if (!rowFilter(r)) continue;
    const key = `${r.brand}|${r.customer}`;
    out.set(key, (out.get(key) ?? 0) + r.realRevenue);
  }
  return out;
}

// 선택 채널 내 YTD 누적 매출 상위 N 거래처 추출
function pickTopCustomersForChannel(
  ytdRows: SalesRow[],
  ch: ChannelKey,
  topN: number,
): string[] {
  const filter = channelRowFilter(ch);
  const totals = new Map<string, number>();
  for (const r of ytdRows) {
    if (r.isNonRevenue) continue;
    if (!filter(r)) continue;
    if (r.realRevenue <= 0) continue;
    totals.set(r.customer, (totals.get(r.customer) ?? 0) + r.realRevenue);
  }
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([c]) => c);
}

export function buildBrandCustomerMatrixForChannel(
  _cube: FactCube,
  ytdRows: SalesRow[],
  prevYearYtdRows: SalesRow[],
  monthRowsCur: SalesRow[],
  monthRowsPrev: SalesRow[],
  monthRowsPrevYear: SalesRow[],
  _ym: string,
  brands: string[],
  channel: ChannelKey,
  topN: number,
): BrandCustomerMatrixData {
  const brandSet = new Set(brands);
  const customers = pickTopCustomersForChannel(ytdRows, channel, topN);
  const customerSet = new Set(customers);
  const rowFilter = channelRowFilter(channel);

  const curMap = accumulateBrandCustomer(monthRowsCur, brandSet, customerSet, rowFilter);
  const prevMap = accumulateBrandCustomer(monthRowsPrev, brandSet, customerSet, rowFilter);
  const prevYearMap = accumulateBrandCustomer(monthRowsPrevYear, brandSet, customerSet, rowFilter);
  const ytdMap = accumulateBrandCustomer(ytdRows, brandSet, customerSet, rowFilter);
  const prevYtdMap = accumulateBrandCustomer(prevYearYtdRows, brandSet, customerSet, rowFilter);

  const cells = new Map<string, CustomerMatrixCell>();
  for (const brand of brands) {
    for (const customer of customers) {
      const key = `${brand}|${customer}`;
      const ytd = ytdMap.get(key) ?? 0;
      const prevYtd = prevYtdMap.get(key) ?? 0;
      const ytdDiff = ytd - prevYtd;
      const ytdPct = prevYtd !== 0 ? ytdDiff / Math.abs(prevYtd) : null;
      const { color, reason } = pickColor3Way({ ytdPct, cellYtd: ytd });

      cells.set(key, {
        brand,
        customer,
        monthCur: curMap.get(key) ?? 0,
        monthPrev: prevMap.get(key) ?? 0,
        monthPrevYear: prevYearMap.get(key) ?? 0,
        ytd,
        prevYtd,
        ytdDiff,
        ytdPct,
        color,
        colorReason: reason,
      });
    }
  }

  return { channel, brands, customers, cells };
}
