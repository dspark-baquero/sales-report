export type { SalesRow } from "./parsers";

import type { SalesRow } from "./parsers";
import type { FactCube } from "./facts";
import { bigqueryProvider } from "./providers/bigquery-provider";

export { invalidateCache } from "./providers/bigquery-provider";

export async function loadFactCube(): Promise<FactCube> {
  return bigqueryProvider.loadFactCube();
}

// 종합 리포트 스코프 필터. 국내 = 수출 제외, 해외 = 수출만.
export type ReportScope = "전체" | "국내" | "해외";

export async function loadScopedCube(scope: "국내" | "해외"): Promise<FactCube> {
  return bigqueryProvider.loadScopedCube(scope);
}

export async function loadMonthRows(ym: string): Promise<SalesRow[]> {
  return bigqueryProvider.loadMonthRows(ym);
}

export async function loadRangeRows(fromYM: string, toYM: string): Promise<SalesRow[]> {
  return bigqueryProvider.loadRangeRows(fromYM, toYM);
}

export async function availableMonths(): Promise<string[]> {
  return bigqueryProvider.availableMonths();
}
