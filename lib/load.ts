export type { SalesRow } from "./parsers";

import type { SalesRow } from "./parsers";
import type { FactCube } from "./facts";
import { getProvider } from "./providers";

export async function loadFactCube(): Promise<FactCube> {
  const p = await getProvider();
  return p.loadFactCube();
}

export async function loadMonthRows(ym: string): Promise<SalesRow[]> {
  const p = await getProvider();
  return p.loadMonthRows(ym);
}

export async function loadRangeRows(fromYM: string, toYM: string): Promise<SalesRow[]> {
  const p = await getProvider();
  return p.loadRangeRows(fromYM, toYM);
}

export async function availableMonths(): Promise<string[]> {
  const p = await getProvider();
  return p.availableMonths();
}
