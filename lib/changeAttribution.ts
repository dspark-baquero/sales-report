// "왜 늘었나/줄었나" — 이번달 vs 비교월의 임의 그룹키별 분해.
// 거래처/브랜드/채널/제품 등에 공통 사용.

import type { SalesRow } from "./load";
import { revenueRows } from "./aggregate";

export type ChangeType = "신규" | "이탈" | "증가" | "감소" | "유지";

export type ChangeContribution = {
  entity: string;          // 그룹키 값 (예: 거래처명)
  current: number;
  prev: number;
  diff: number;            // current - prev
  pct: number | null;      // prev=0 → null
  type: ChangeType;
  meta?: Record<string, string | number>;  // 부가 정보 (브랜드, 채널 등)
};

export type Aggregator = (rows: SalesRow[]) => number;

const REVENUE_AGG: Aggregator = (rows) => rows.reduce((s, r) => s + r.realRevenue, 0);

export function attributeChange(
  curRows: SalesRow[],
  prevRows: SalesRow[],
  groupBy: (r: SalesRow) => string | null,
  options?: {
    aggregator?: Aggregator;
    flatThreshold?: number;     // ±2% 이내면 "유지"
    enrichMeta?: (entity: string, sample: SalesRow) => Record<string, string | number>;
  },
): ChangeContribution[] {
  const agg = options?.aggregator ?? REVENUE_AGG;
  const flat = options?.flatThreshold ?? 0.02;
  const groupCur = new Map<string, SalesRow[]>();
  const groupPrev = new Map<string, SalesRow[]>();
  for (const r of revenueRows(curRows)) {
    const k = groupBy(r);
    if (!k) continue;
    const arr = groupCur.get(k) ?? [];
    arr.push(r);
    groupCur.set(k, arr);
  }
  for (const r of revenueRows(prevRows)) {
    const k = groupBy(r);
    if (!k) continue;
    const arr = groupPrev.get(k) ?? [];
    arr.push(r);
    groupPrev.set(k, arr);
  }
  const allKeys = new Set<string>([...groupCur.keys(), ...groupPrev.keys()]);
  const out: ChangeContribution[] = [];
  for (const key of allKeys) {
    const curArr = groupCur.get(key) ?? [];
    const prevArr = groupPrev.get(key) ?? [];
    const current = agg(curArr);
    const prev = agg(prevArr);
    if (current === 0 && prev === 0) continue;
    const diff = current - prev;
    const pct = prev !== 0 ? diff / Math.abs(prev) : null;
    let type: ChangeType;
    if (prev === 0 && current > 0) type = "신규";
    else if (current === 0 && prev > 0) type = "이탈";
    else if (pct !== null && Math.abs(pct) < flat) type = "유지";
    else if (diff > 0) type = "증가";
    else type = "감소";
    const meta = options?.enrichMeta
      ? options.enrichMeta(key, curArr[0] ?? prevArr[0])
      : undefined;
    out.push({ entity: key, current, prev, diff, pct, type, meta });
  }
  return out;
}

export function topGainers(c: ChangeContribution[], n = 5): ChangeContribution[] {
  return [...c].filter((x) => x.diff > 0).sort((a, b) => b.diff - a.diff).slice(0, n);
}

export function topDecliners(c: ChangeContribution[], n = 5): ChangeContribution[] {
  return [...c].filter((x) => x.diff < 0).sort((a, b) => a.diff - b.diff).slice(0, n);
}

export type WaterfallStep = {
  name: string;
  value: number;     // 이 단계의 기여값 (시작/끝은 절대값, 중간은 ±)
  type: "start" | "gain" | "loss" | "end" | "other";
};

// 워터폴: 전월 합 → +상위 N → -하위 N → 기타 → 이번달 합
export function buildWaterfall(
  prevTotal: number,
  curTotal: number,
  contribs: ChangeContribution[],
  topN = 5,
): WaterfallStep[] {
  const gainers = topGainers(contribs, topN);
  const decliners = topDecliners(contribs, topN);
  const others = contribs.filter(
    (c) => !gainers.includes(c) && !decliners.includes(c),
  );
  const otherDiff = others.reduce((s, c) => s + c.diff, 0);
  const steps: WaterfallStep[] = [];
  steps.push({ name: "전월 합계", value: prevTotal, type: "start" });
  for (const g of gainers) {
    steps.push({ name: g.entity, value: g.diff, type: "gain" });
  }
  for (const d of decliners) {
    steps.push({ name: d.entity, value: d.diff, type: "loss" });
  }
  if (Math.abs(otherDiff) > 0) {
    steps.push({ name: `기타 (${others.length}건)`, value: otherDiff, type: "other" });
  }
  steps.push({ name: "이번달 합계", value: curTotal, type: "end" });
  return steps;
}

// 신규/이탈 거래처 (지정 윈도우)
export function newAndLostEntities(
  curRows: SalesRow[],
  pastWindowRows: SalesRow[],
  groupBy: (r: SalesRow) => string | null,
): { newOnes: { entity: string; current: number }[]; lost: { entity: string; pastTotal: number }[] } {
  const cur = new Map<string, number>();
  const past = new Map<string, number>();
  for (const r of revenueRows(curRows)) {
    const k = groupBy(r);
    if (!k) continue;
    cur.set(k, (cur.get(k) ?? 0) + r.realRevenue);
  }
  for (const r of revenueRows(pastWindowRows)) {
    const k = groupBy(r);
    if (!k) continue;
    past.set(k, (past.get(k) ?? 0) + r.realRevenue);
  }
  const newOnes = [...cur.entries()]
    .filter(([k, v]) => v > 0 && (past.get(k) ?? 0) === 0)
    .map(([entity, current]) => ({ entity, current }))
    .sort((a, b) => b.current - a.current);
  const lost = [...past.entries()]
    .filter(([k, v]) => v > 0 && (cur.get(k) ?? 0) === 0)
    .map(([entity, pastTotal]) => ({ entity, pastTotal }))
    .sort((a, b) => b.pastTotal - a.pastTotal);
  return { newOnes, lost };
}
