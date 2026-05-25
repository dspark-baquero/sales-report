import fs from "fs";
import path from "path";
import Papa from "papaparse";
import { parseRow, type SalesRow } from "../parsers";
import { buildFactCube, type FactCube } from "../facts";
import type { DataProvider } from "../data-provider";

type Cached = {
  rows: SalesRow[];
  byMonth: Map<string, SalesRow[]>;
  cube: FactCube;
  mtime: number;
};

let cached: Cached | null = null;

function ensureLoaded(): Cached {
  const csvPath = path.join(process.cwd(), "sales.csv");
  const stat = fs.statSync(csvPath);
  const mtime = stat.mtimeMs;

  if (cached && cached.mtime === mtime) return cached;

  const text = fs.readFileSync(csvPath, "utf8");
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  const rows: SalesRow[] = [];
  for (const r of parsed.data) {
    const row = parseRow(r);
    if (row) rows.push(row);
  }

  const byMonth = new Map<string, SalesRow[]>();
  for (const r of rows) {
    const arr = byMonth.get(r.yearMonth);
    if (arr) arr.push(r);
    else byMonth.set(r.yearMonth, [r]);
  }

  const cube = buildFactCube(rows);
  cached = { rows, byMonth, cube, mtime };
  return cached;
}

export const csvProvider: DataProvider = {
  async loadFactCube(): Promise<FactCube> {
    return ensureLoaded().cube;
  },

  async loadMonthRows(ym: string): Promise<SalesRow[]> {
    return ensureLoaded().byMonth.get(ym) ?? [];
  },

  async loadRangeRows(fromYM: string, toYM: string): Promise<SalesRow[]> {
    const { byMonth } = ensureLoaded();
    const out: SalesRow[] = [];
    for (const [ym, arr] of byMonth) {
      if (ym >= fromYM && ym <= toYM) out.push(...arr);
    }
    return out;
  },

  async availableMonths(): Promise<string[]> {
    return ensureLoaded().cube.monthsAsc;
  },
};
