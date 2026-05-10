// 매월 데이터 교체 후 매핑 누락/품질 이슈 점검
import { loadSalesRows } from "@/lib/load";
import { kpi, filterMonth, nonRevenueSummary } from "@/lib/aggregate";
import { KNOWN_CHANNELS, KNOWN_BRANDS } from "@/config/mappings";
import { formatKRW, formatKRWLong } from "@/lib/format";
import { loadTargets, findMatchRule } from "@/lib/targets";

const rows = loadSalesRows();

console.log(`\n총 행수: ${rows.length.toLocaleString()}`);

// 매핑 미등록
const unknownChannels = new Map<string, number>();
const unknownBrands = new Map<string, number>();
for (const r of rows) {
  if (!KNOWN_CHANNELS.has(r.channel)) {
    unknownChannels.set(r.channel, (unknownChannels.get(r.channel) ?? 0) + 1);
  }
  if (!KNOWN_BRANDS.has(r.brand)) {
    unknownBrands.set(r.brand, (unknownBrands.get(r.brand) ?? 0) + 1);
  }
}

console.log("\n[매핑 미등록 채널]");
if (unknownChannels.size === 0) {
  console.log("  (없음)");
} else {
  for (const [k, v] of unknownChannels) {
    console.log(`  ⚠️  ${k}: ${v}건 → config/mappings.ts CHANNEL_TO_GROUP에 추가 필요`);
  }
}

console.log("\n[매핑 미등록 브랜드]");
if (unknownBrands.size === 0) {
  console.log("  (없음)");
} else {
  for (const [k, v] of unknownBrands) {
    console.log(`  ⚠️  ${k}: ${v}건 → config/mappings.ts BRAND_TO_HOUSE에 추가 필요`);
  }
}

// 월별 행수
const months = new Map<string, number>();
for (const r of rows) {
  months.set(r.yearMonth, (months.get(r.yearMonth) ?? 0) + 1);
}
const sortedMonths = [...months.keys()].sort();
console.log(`\n데이터 기간: ${sortedMonths[0]} ~ ${sortedMonths[sortedMonths.length - 1]}`);
console.log(`최근 3개월:`);
for (const ym of sortedMonths.slice(-3)) {
  const k = kpi(filterMonth(rows, ym));
  console.log(`  ${ym}: ${months.get(ym)}건, 실매출 ${formatKRWLong(k.revenue)}`);
}

// 최신월 상세
const latestYM = sortedMonths[sortedMonths.length - 1];
const latestRows = filterMonth(rows, latestYM);
const k = kpi(latestRows);
const nr = nonRevenueSummary(latestRows);

console.log(`\n=== ${latestYM} 상세 ===`);
console.log(`  실매출: ${formatKRW(k.revenue)} (${formatKRWLong(k.revenue)})`);
console.log(`  주문건수: ${k.orders.toLocaleString()}`);
console.log(`  객단가: ${formatKRW(k.aov)}`);
console.log(`  수량: ${k.qty.toLocaleString()}`);
console.log(`  원가 누락 비율: ${(k.costMissingRate * 100).toFixed(1)}%`);
console.log(
  `  비매출 출고: ${nr.totalRows.toLocaleString()}행, 수량 ${nr.totalQty.toLocaleString()}, 원가합 ${formatKRW(nr.totalCost)}`,
);

// target.csv 매핑 점검
console.log(`\n=== target.csv 매핑 점검 ===`);
const targets = loadTargets();
console.log(`  target 행 수: ${targets.length.toLocaleString()}`);
const tKeys = new Set<string>();
for (const t of targets) {
  tKeys.add(`${t.division}|${t.customerKey}`);
}
console.log(`  유니크 (구분 × 거래처) 조합: ${tKeys.size}`);
const prospective: string[] = [];
const matched: string[] = [];
for (const k of tKeys) {
  const [div, key] = k.split("|");
  const rule = findMatchRule(key, div as "국내" | "해외");
  if (rule.prospective) {
    prospective.push(`${div}/${key} → ${rule.description}`);
  } else {
    matched.push(`${div}/${key}`);
  }
}
console.log(`\n  매칭됨 (${matched.length}건):`);
for (const m of matched) console.log(`    ✓ ${m}`);
if (prospective.length > 0) {
  console.log(`\n  신규 추진 (${prospective.length}건, 매칭 sales 없음):`);
  for (const p of prospective) console.log(`    ◇ ${p}`);
}
