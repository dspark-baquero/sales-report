import type { FactCube } from "./facts";
import type { SalesRow } from "./parsers";

export interface DataProvider {
  loadFactCube(): Promise<FactCube>;
  loadMonthRows(ym: string): Promise<SalesRow[]>;
  loadRangeRows(fromYM: string, toYM: string): Promise<SalesRow[]>;
  availableMonths(): Promise<string[]>;
}
