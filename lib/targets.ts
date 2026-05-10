// target.csv 파서 + 빠른 lookup 인덱스.
// 컬럼: 브랜드, 구분(국내/해외), 거래처, 월(YYYY/M), 목표매출(₩X,XXX,XXX 또는 빈 값)

import fs from "fs";
import path from "path";
import Papa from "papaparse";
import type { SalesRow } from "./load";
import { BRAND_OFFICIAL_CHANNELS } from "@/config/mappings";

export type Division = "국내" | "해외";

export type TargetRow = {
  brand: string;
  division: Division;
  customerKey: string;       // "공식몰" / "올리브영" / "면세점" / "병원" / "베트남" / "동남아" 등
  yearMonth: string;         // "2026-04"
  target: number;            // 0 if blank
};

let cached: { rows: TargetRow[]; mtime: number } | null = null;

function parseAmount(s: string | undefined | null): number {
  if (!s) return 0;
  const cleaned = String(s).replace(/[₩,\s"]/g, "").trim();
  if (!cleaned) return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function parseMonth(s: string): string | null {
  // "2026/4" or "2026/04" → "2026-04"
  const m = s.trim().match(/^(\d{4})\s*\/\s*(\d{1,2})$/);
  if (!m) return null;
  return `${m[1]}-${String(Number(m[2])).padStart(2, "0")}`;
}

export function loadTargets(): TargetRow[] {
  const csvPath = path.join(process.cwd(), "target.csv");
  if (!fs.existsSync(csvPath)) return [];
  const stat = fs.statSync(csvPath);
  const mtime = stat.mtimeMs;
  if (cached && cached.mtime === mtime) return cached.rows;

  const text = fs.readFileSync(csvPath, "utf8");
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  const rows: TargetRow[] = [];
  for (const r of parsed.data) {
    const brand = (r["브랜드"] || "").trim();
    const division = (r["구분"] || "").trim() as Division;
    const customerKey = (r["거래처"] || "").trim();
    const monthRaw = (r["월"] || "").trim();
    if (!brand || !division || !customerKey || !monthRaw) continue;
    const yearMonth = parseMonth(monthRaw);
    if (!yearMonth) continue;
    rows.push({
      brand,
      division: division === "해외" ? "해외" : "국내",
      customerKey,
      yearMonth,
      target: parseAmount(r["목표매출"]),
    });
  }

  cached = { rows, mtime };
  return rows;
}

// ── 인덱스 / 조회 ───────────────────────────────────
export type TargetKey = `${string}|${Division}|${string}|${string}`;

export function tkey(brand: string, division: Division, customerKey: string, ym: string): TargetKey {
  return `${brand}|${division}|${customerKey}|${ym}` as TargetKey;
}

export function targetMap(rows: TargetRow[]): Map<TargetKey, number> {
  const m = new Map<TargetKey, number>();
  for (const r of rows) {
    m.set(tkey(r.brand, r.division, r.customerKey, r.yearMonth), r.target);
  }
  return m;
}

export function lookupTarget(
  rows: TargetRow[] | Map<TargetKey, number>,
  brand: string,
  division: Division,
  customerKey: string,
  ym: string,
): number {
  if (rows instanceof Map) return rows.get(tkey(brand, division, customerKey, ym)) ?? 0;
  return targetMap(rows).get(tkey(brand, division, customerKey, ym)) ?? 0;
}

// ── 매칭 규칙: target 거래처 키 → sales row predicate ──
// 신규 추진(prospective)이면 sales 매칭 없음.
export type MatchRule = {
  customerKey: string;
  division: Division;
  match: (brand: string) => (r: SalesRow) => boolean;
  prospective: boolean;       // sales 데이터에 매칭 채널이 없는 신규 추진
  description: string;
};

const officialChannelsForBrand = (brand: string): Set<string> =>
  new Set(BRAND_OFFICIAL_CHANNELS[brand] ?? []);

export const TARGET_MATCH_RULES: MatchRule[] = [
  // ── 국내 ─────────────────────────────────
  {
    customerKey: "공식몰",
    division: "국내",
    match: (brand) => {
      const set = officialChannelsForBrand(brand);
      return (r) => r.brand === brand && set.has(r.channel);
    },
    prospective: false,
    description: "브랜드별 자사 공식몰 (스마트스토어 포함)",
  },
  {
    customerKey: "면세점",
    division: "국내",
    match: (brand) => (r) => r.brand === brand && r.category === "면세점",
    prospective: false,
    description: "면세점 채널",
  },
  {
    customerKey: "병원",
    division: "국내",
    match: (brand) => (r) =>
      r.brand === brand &&
      r.category === "B2B" &&
      (r.b2bCustomerType === "병원" ||
        r.b2bCustomerType === "병원(프랜차이즈)" ||
        r.b2bCustomerType === "병원(대리점)"),
    prospective: false,
    description: "B2B 병원 (프랜차이즈/대리점 포함)",
  },
  {
    customerKey: "피부관리실",
    division: "국내",
    match: (brand) => (r) =>
      r.brand === brand &&
      r.category === "B2B" &&
      (r.b2bCustomerType === "피부관리실" ||
        r.b2bCustomerType === "피부관리실(프랜차이즈)" ||
        r.b2bCustomerType === "피부관리실(대리점)"),
    prospective: false,
    description: "B2B 피부관리실 (프랜차이즈/대리점 포함)",
  },
  {
    customerKey: "대리점",
    division: "국내",
    match: (brand) => (r) =>
      r.brand === brand && r.category === "B2B" && r.b2bCustomerType === "대리점",
    prospective: false,
    description: "B2B 대리점",
  },
  {
    customerKey: "종합몰",
    division: "국내",
    match: (brand) => (r) => r.brand === brand && r.channelGroup === "종합몰",
    prospective: false,
    description: "B2C 종합몰 (W컨셉/SSG/쿠팡 등)",
  },
  {
    customerKey: "소호몰",
    division: "국내",
    match: (brand) => (r) => r.brand === brand && r.channelGroup === "소호몰",
    prospective: false,
    description: "B2C 소호몰",
  },
  {
    customerKey: "바크로하우스",
    division: "국내",
    match: (brand) => (r) =>
      r.brand === brand &&
      (r.channel === "바크로하우스" || r.channel === "바크로하우스 스마트스토어"),
    prospective: false,
    description: "바크로하우스 자사몰 (다브랜드 자사몰)",
  },

  // ── 신규 추진 채널 (sales 매칭 없음) ───────
  {
    customerKey: "올리브영",
    division: "국내",
    match: () => () => false,
    prospective: true,
    description: "올리브영 — 신규 추진 채널 (실 매출 0)",
  },
  {
    customerKey: "링커",
    division: "국내",
    match: () => () => false,
    prospective: true,
    description: "링커 — 신규 추진 채널 (실 매출 0)",
  },
  {
    customerKey: "바크로하우스 대리점",
    division: "국내",
    match: () => () => false,
    prospective: true,
    description: "바크로하우스 대리점 — 신규 추진 채널 (실 매출 0)",
  },
  {
    customerKey: "직거래처",
    division: "국내",
    match: () => () => false,
    prospective: true,
    description: "직거래처 — 신규 추진 채널 (실 매출 0)",
  },
  {
    customerKey: "기타",
    division: "국내",
    match: (brand) => (r) =>
      r.brand === brand &&
      r.category !== "수출" &&
      r.channelGroup !== "자사 공식몰" &&
      r.channelGroup !== "종합몰" &&
      r.channelGroup !== "소호몰" &&
      r.channelGroup !== "면세점" &&
      r.channelGroup !== "B2B",
    prospective: false,
    description: "기타 (분류되지 않은 임직원/패밀리 등)",
  },
];

// 해외(수출) 매칭 — customerKey가 국가명. 동남아는 묶음(단, 베트남은 별도 키로 분리되어 제외).
const SOUTHEAST_ASIA_EXCL_VN = new Set([
  "태국",
  "말레이시아",
  "인도네시아",
  "싱가포르",
  "필리핀",
  "캄보디아",
  "라오스",
  "미얀마",
  "브루나이",
]);

export function exportMatchRule(customerKey: string): MatchRule {
  if (customerKey === "동남아") {
    return {
      customerKey,
      division: "해외",
      match: (brand) => (r) =>
        r.brand === brand &&
        r.category === "수출" &&
        SOUTHEAST_ASIA_EXCL_VN.has(r.country ?? ""),
      prospective: false,
      description: "동남아시아 (베트남 제외 — 태국·말레이시아·인도네시아 등)",
    };
  }
  if (customerKey === "기타") {
    return {
      customerKey,
      division: "해외",
      match: (brand) => (r) =>
        r.brand === brand &&
        r.category === "수출" &&
        (r.country === "기타" || !r.country),
      prospective: false,
      description: "기타 국가",
    };
  }
  return {
    customerKey,
    division: "해외",
    match: (brand) => (r) =>
      r.brand === brand && r.category === "수출" && r.country === customerKey,
    prospective: false,
    description: `수출 ${customerKey}`,
  };
}

export function findMatchRule(customerKey: string, division: Division): MatchRule {
  if (division === "해외") return exportMatchRule(customerKey);
  const found = TARGET_MATCH_RULES.find((r) => r.customerKey === customerKey);
  if (found) return found;
  // 미매핑 키는 prospective로 폴백
  return {
    customerKey,
    division: "국내",
    match: () => () => false,
    prospective: true,
    description: `미매핑 키 (${customerKey}) — 매칭 sales 없음`,
  };
}

// 한 target 행에 매칭되는 sales rows의 실매출 합산
export function actualForTarget(t: TargetRow, rows: SalesRow[]): number {
  const rule = findMatchRule(t.customerKey, t.division);
  if (rule.prospective) return 0;
  const pred = rule.match(t.brand);
  let sum = 0;
  for (const r of rows) {
    if (r.isNonRevenue) continue;
    if (r.yearMonth !== t.yearMonth) continue;
    if (pred(r)) sum += r.realRevenue;
  }
  return sum;
}

// 다중 target 한꺼번에 (월 기준) 빠르게 계산.
// 이번달 sales rows를 한 번 순회하면서 누적.
export function actualByTargetForMonth(
  targets: TargetRow[],
  monthRows: SalesRow[],
  ym: string,
): Map<TargetKey, number> {
  const out = new Map<TargetKey, number>();
  // 키별 predicate 캐시
  const ruleCache = new Map<string, ReturnType<MatchRule["match"]>>();
  const monthTargets = targets.filter((t) => t.yearMonth === ym);
  for (const t of monthTargets) {
    const key = tkey(t.brand, t.division, t.customerKey, t.yearMonth);
    out.set(key, 0);
    const ruleKey = `${t.brand}|${t.division}|${t.customerKey}`;
    if (!ruleCache.has(ruleKey)) {
      const rule = findMatchRule(t.customerKey, t.division);
      ruleCache.set(ruleKey, rule.prospective ? () => false : rule.match(t.brand));
    }
  }
  // 행 순회. 각 row가 속하는 모든 (brand, division, customerKey) 조합 — 단, target 시각으로는
  // 1 row → 보통 1 키. 단순화: target 마다 row 통과 (target 수가 작으면 OK).
  // target 수 대략 200개 (브랜드 7 × 거래처 ~14 × 월 1+ ≈ 100+).
  for (const t of monthTargets) {
    const ruleKey = `${t.brand}|${t.division}|${t.customerKey}`;
    const pred = ruleCache.get(ruleKey)!;
    let s = 0;
    for (const r of monthRows) {
      if (r.isNonRevenue) continue;
      if (pred(r)) s += r.realRevenue;
    }
    out.set(tkey(t.brand, t.division, t.customerKey, t.yearMonth), s);
  }
  return out;
}

// ── 가벼운 헬퍼 (목표 합계만 필요한 페이지용) ──────────
export function targetsForMonth(targets: TargetRow[], ym: string): TargetRow[] {
  return targets.filter((t) => t.yearMonth === ym);
}

export function isProspectiveKey(division: Division, customerKey: string): boolean {
  return findMatchRule(customerKey, division).prospective;
}

export type TargetRowWithProspective = TargetRow & { prospective: boolean };

export function targetsForMonthWithProspective(
  targets: TargetRow[],
  ym: string,
): TargetRowWithProspective[] {
  return targets
    .filter((t) => t.yearMonth === ym)
    .map((t) => ({ ...t, prospective: findMatchRule(t.customerKey, t.division).prospective }));
}

// ── 풀 매트릭스 (이번달 모든 target × 실적). 비용 높음 — 목표달성 탭에만 사용 권장 ──
export type TargetRowWithActual = TargetRow & {
  actual: number;
  rate: number | null;
  prospective: boolean;
};

export function buildTargetActuals(
  targets: TargetRow[],
  monthRows: SalesRow[],
  ym: string,
): TargetRowWithActual[] {
  const actualMap = actualByTargetForMonth(targets, monthRows, ym);
  const monthTargets = targets.filter((t) => t.yearMonth === ym);
  return monthTargets.map((t) => {
    const actual = actualMap.get(tkey(t.brand, t.division, t.customerKey, t.yearMonth)) ?? 0;
    const rule = findMatchRule(t.customerKey, t.division);
    const rate = t.target > 0 ? actual / t.target : null;
    return { ...t, actual, rate, prospective: rule.prospective };
  });
}
