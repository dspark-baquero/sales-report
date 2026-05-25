import { BigQuery } from "@google-cloud/bigquery";
import { parseRow, type SalesRow } from "../parsers";
import { buildFactCube, type FactCube } from "../facts";
import type { DataProvider } from "../data-provider";

type Cached = {
  cube: FactCube;
  byMonth: Map<string, SalesRow[]>;
};

let cached: Cached | null = null;

async function ensureLoaded(): Promise<Cached> {
  if (cached) return cached;

  const projectId = process.env.BQ_PROJECT_ID;
  const dataset = process.env.BQ_DATASET ?? "sales";
  const table = process.env.BQ_TABLE ?? "sales";

  const bq = new BigQuery(projectId ? { projectId } : undefined);
  const query = projectId
    ? `SELECT * FROM \`${projectId}.${dataset}.${table}\``
    : `SELECT * FROM \`${dataset}.${table}\``;

  const [rawRows] = await bq.query({ query, maxResults: 500_000 });

  const rows: SalesRow[] = [];
  for (const raw of rawRows) {
    const record: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw)) {
      record[key] = value != null ? String(value) : "";
    }
    const row = parseRow(record);
    if (row) rows.push(row);
  }

  const byMonth = new Map<string, SalesRow[]>();
  for (const r of rows) {
    const arr = byMonth.get(r.yearMonth);
    if (arr) arr.push(r);
    else byMonth.set(r.yearMonth, [r]);
  }

  const cube = buildFactCube(rows);
  cached = { cube, byMonth };
  return cached;
}

export const bigqueryProvider: DataProvider = {
  async loadFactCube(): Promise<FactCube> {
    return (await ensureLoaded()).cube;
  },

  async loadMonthRows(ym: string): Promise<SalesRow[]> {
    return (await ensureLoaded()).byMonth.get(ym) ?? [];
  },

  async loadRangeRows(fromYM: string, toYM: string): Promise<SalesRow[]> {
    const { byMonth } = await ensureLoaded();
    const out: SalesRow[] = [];
    for (const [ym, arr] of byMonth) {
      if (ym >= fromYM && ym <= toYM) out.push(...arr);
    }
    return out;
  },

  async availableMonths(): Promise<string[]> {
    return (await ensureLoaded()).cube.monthsAsc;
  },
};
