import { BigQuery } from "@google-cloud/bigquery";
import type { SalesRow } from "./parsers";
import { BRAND_OFFICIAL_CHANNELS } from "@/config/mappings";

export type Division = "국내" | "해외";

export type TargetRow = {
  brand: string;
  division: Division;
  customerKey: string;
  yearMonth: string;
  target: number;
};

function parseAmount(s: string | undefined | null): number {
  if (!s) return 0;
  const cleaned = String(s).replace(/[₩,\s"]/g, "").trim();
  if (!cleaned) return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function toYearMonth(s: string): string | null {
  const m1 = s.trim().match(/^(\d{4})\s*\/\s*(\d{1,2})$/);
  if (m1) return `${m1[1]}-${String(Number(m1[2])).padStart(2, "0")}`;
  const m2 = s.trim().match(/^(\d{4})-(\d{1,2})$/);
  if (m2) return `${m2[1]}-${String(Number(m2[2])).padStart(2, "0")}`;
  return null;
}

let targetCache: TargetRow[] | null = null;

export async function loadTargets(): Promise<TargetRow[]> {
  if (targetCache) return targetCache;

  const projectId = process.env.BQ_PROJECT_ID;
  const dataset = process.env.BQ_DATASET ?? "sales";
  const table = process.env.BQ_TARGET_TABLE ?? "targets";

  const bq = new BigQuery(projectId ? { projectId } : undefined);
  const query = projectId
    ? `SELECT * FROM \`${projectId}.${dataset}.${table}\``
    : `SELECT * FROM \`${dataset}.${table}\``;

  const [rawRows] = await bq.query({ query });

  const rows: TargetRow[] = [];
  for (const raw of rawRows) {
    const brand = String(raw.brand ?? "").trim();
    const division = String(raw.division ?? "").trim();
    const customerKey = String(raw.customer_key ?? "").trim();
    const monthRaw = String(
      raw.month != null && typeof raw.month === "object" && "value" in raw.month
        ? raw.month.value
        : raw.month ?? "",
    ).trim();
    const targetRaw = raw.target_amount;

    if (!brand || !division || !customerKey || !monthRaw) continue;
    const yearMonth = toYearMonth(monthRaw);
    if (!yearMonth) continue;

    const target =
      typeof targetRaw === "number"
        ? targetRaw
        : parseAmount(String(targetRaw ?? ""));

    rows.push({ brand, division: division as Division, customerKey, yearMonth, target });
  }

  console.log(`[targets] ${rows.length} target rows loaded from BigQuery`);
  targetCache = rows;
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
    match: (brand) => (r) =>
      r.brand === brand &&
      r.category === "B2B" &&
      r.b2bCustomerType !== "대리점",
    prospective: false,
    description: "B2B 직거래처 (병원+피부관리실 통합, 대리점 제외)",
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
  if (customerKey === "일본(돈키호테)") {
    return {
      customerKey,
      division: "해외",
      match: (brand) => (r) =>
        r.brand === brand &&
        r.category === "수출" &&
        r.country === "일본" &&
        (r.customer?.includes("돈키호테") || r.customer?.includes("ドンキ") || r.customer?.includes("Don Quijote")),
      prospective: false,
      description: "일본 돈키호테 전용 (매출 발생 시 거래처명으로 매칭)",
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

// ── 기간별 집계 (목표달성 탭 고도화) ──────────────────
export type PeriodAggRow = {
  division: Division;
  customerKey: string;
  target: number;
  actual: number;
  rate: number | null;
  prospective: boolean;
};

export type PeriodAggBrand = {
  brand: string;
  target: number;
  actual: number;
  rate: number | null;
};

export type PeriodAgg = {
  label: string;
  periodDesc: string;
  totalTarget: number;
  totalActual: number;
  totalRate: number | null;
  byChannel: PeriodAggRow[];
  byBrand: PeriodAggBrand[];
};

export function buildPeriodAgg(
  label: string,
  periodDesc: string,
  targets: TargetRow[],
  monthSlices: Map<string, SalesRow[]>,
  months: string[],
): PeriodAgg {
  const chanMap = new Map<string, { division: Division; customerKey: string; target: number; actual: number; prospective: boolean }>();
  const brandMap = new Map<string, { target: number; actual: number }>();

  for (const ym of months) {
    const rows = monthSlices.get(ym);
    if (!rows) continue;
    const ta = buildTargetActuals(targets, rows, ym);
    for (const t of ta) {
      const ck = `${t.division}|${t.customerKey}`;
      const cur = chanMap.get(ck) ?? { division: t.division, customerKey: t.customerKey, target: 0, actual: 0, prospective: t.prospective };
      cur.target += t.target;
      cur.actual += t.actual;
      chanMap.set(ck, cur);

      if (!t.prospective) {
        const bc = brandMap.get(t.brand) ?? { target: 0, actual: 0 };
        bc.target += t.target;
        bc.actual += t.actual;
        brandMap.set(t.brand, bc);
      }
    }
  }

  const byChannel: PeriodAggRow[] = [...chanMap.values()]
    .map((c) => ({
      ...c,
      rate: c.target > 0 ? c.actual / c.target : null,
    }))
    .filter((c) => c.target > 0 || c.actual > 0 || c.prospective)
    .sort((a, b) => b.target - a.target);

  const byBrand: PeriodAggBrand[] = [...brandMap.entries()]
    .map(([brand, v]) => ({
      brand,
      ...v,
      rate: v.target > 0 ? v.actual / v.target : null,
    }))
    .filter((b) => b.target > 0 || b.actual > 0)
    .sort((a, b) => b.target - a.target);

  const totalTarget = byChannel.reduce((s, c) => s + c.target, 0);
  const totalActual = byChannel.reduce((s, c) => s + (c.prospective ? 0 : c.actual), 0);

  return {
    label,
    periodDesc,
    totalTarget,
    totalActual,
    totalRate: totalTarget > 0 ? totalActual / totalTarget : null,
    byChannel,
    byBrand,
  };
}
