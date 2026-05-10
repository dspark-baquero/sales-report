import { loadSalesRows } from "./load";

// 데이터에 존재하는 월 목록 (오름차순)
export function availableMonths(): string[] {
  const rows = loadSalesRows();
  const set = new Set<string>();
  for (const r of rows) set.add(r.yearMonth);
  return [...set].sort();
}

// 기본 기준월: 데이터의 최신 월
export function defaultMonth(): string {
  const months = availableMonths();
  return months[months.length - 1];
}

// URL ?month= 파싱 (잘못된 값이면 default)
export function resolveMonth(input: string | undefined | null): string {
  const months = availableMonths();
  if (input && months.includes(input)) return input;
  return defaultMonth();
}
