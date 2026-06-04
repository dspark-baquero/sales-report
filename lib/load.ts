export type { SalesRow } from "./parsers";

import type { SalesRow } from "./parsers";
import type { FactCube } from "./facts";
import { bigqueryProvider } from "./providers/bigquery-provider";

export { invalidateCache } from "./providers/bigquery-provider";

export async function loadFactCube(): Promise<FactCube> {
  return bigqueryProvider.loadFactCube();
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
