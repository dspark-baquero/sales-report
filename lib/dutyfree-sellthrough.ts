// 지코(Zico) 면세점 실판매(sell-through) 데이터 로더.
// 구글시트 → BigQuery 외부 테이블(df_sellthrough) federation.
// lib/baquerohouse-data.ts 패턴 미러: drive.readonly 스코프, 월별 캐시, available graceful fallback.
//
// 출고(우리 회사 → 면세점) 매출과는 별개. 합산하지 않음.

import { BigQuery } from "@google-cloud/bigquery";

export type DutyFreeSellThrough = {
  yearMonth: string; // "2024-10"
  store: string;     // 신라서울점
  qty: number;
  usd: number;       // 달러 (보조)
  krw: number;       // 원화 (대표)
};

type Cached = {
  byMonth: Map<string, DutyFreeSellThrough[]>;
  months: string[]; // 오름차순
  available: boolean;
};

let cached: Cached | null = null;

function str(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object" && "value" in (v as Record<string, unknown>))
    return String((v as { value: unknown }).value);
  return String(v);
}

// 통화/수량 문자열 → 숫자. ₩ $ , 공백 제거.
function num(v: unknown): number {
  const s = str(v).replace(/[₩$,\s"]/g, "").trim();
  if (!s) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

// "2024년 10월" / "2024-10" / "2024/10" → "2024-10"
function parseYearMonth(v: unknown): string {
  const s = str(v).trim();
  const m1 = s.match(/(\d{4})\s*년\s*(\d{1,2})\s*월/);
  if (m1) return `${m1[1]}-${String(Number(m1[2])).padStart(2, "0")}`;
  const m2 = s.match(/^(\d{4})[-/](\d{1,2})/);
  if (m2) return `${m2[1]}-${String(Number(m2[2])).padStart(2, "0")}`;
  return "";
}

async function ensureLoaded(): Promise<Cached> {
  if (cached) return cached;

  const projectId = process.env.BQ_PROJECT_ID;
  const dataset = process.env.BQ_DATASET ?? "dashboard_1";
  const table = process.env.BQ_DF_SELLTHROUGH_TABLE ?? "df_sellthrough";

  try {
    const bq = new BigQuery({
      ...(projectId ? { projectId } : {}),
      scopes: [
        "https://www.googleapis.com/auth/bigquery",
        "https://www.googleapis.com/auth/drive.readonly",
      ],
    });
    const fqDataset = projectId ? `${projectId}.${dataset}` : dataset;

    const [rawRows] = await bq.query({
      query: `SELECT * FROM \`${fqDataset}.${table}\``,
      maxResults: 100_000,
    });

    const byMonth = new Map<string, DutyFreeSellThrough[]>();
    for (const r of rawRows as Record<string, unknown>[]) {
      const yearMonth = parseYearMonth(r.month);
      const store = str(r.store).trim();
      if (!yearMonth || !store) continue;
      const row: DutyFreeSellThrough = {
        yearMonth,
        store,
        qty: num(r.quantity),
        usd: num(r.sales_usd),
        krw: num(r.sales_krw),
      };
      const arr = byMonth.get(yearMonth);
      if (arr) arr.push(row);
      else byMonth.set(yearMonth, [row]);
    }

    const months = [...byMonth.keys()].sort();
    console.log(`[dutyfree-sellthrough] ${rawRows.length}행 로드 (${months.length}개월)`);
    cached = { byMonth, months, available: true };
  } catch (e) {
    console.warn(
      "[dutyfree-sellthrough] 실판매 데이터 조회 실패 (로컬 dev/미공유 시 정상):",
      (e as Error).message,
    );
    cached = { byMonth: new Map(), months: [], available: false };
  }
  return cached;
}

export async function isSellThroughAvailable(): Promise<boolean> {
  return (await ensureLoaded()).available;
}

export async function sellThroughMonths(): Promise<string[]> {
  return (await ensureLoaded()).months;
}

export async function loadSellThroughMonth(ym: string): Promise<DutyFreeSellThrough[]> {
  return (await ensureLoaded()).byMonth.get(ym) ?? [];
}

export async function loadSellThroughRange(
  fromYM: string,
  toYM: string,
): Promise<DutyFreeSellThrough[]> {
  const { byMonth } = await ensureLoaded();
  const out: DutyFreeSellThrough[] = [];
  for (const [ym, arr] of byMonth) {
    if (ym >= fromYM && ym <= toYM) out.push(...arr);
  }
  return out;
}

// ── 집계 헬퍼 ────────────────────────────────────────────
export type SellThroughTotal = { krw: number; usd: number; qty: number };

export function sellThroughTotal(rows: DutyFreeSellThrough[]): SellThroughTotal {
  return rows.reduce(
    (acc, r) => {
      acc.krw += r.krw;
      acc.usd += r.usd;
      acc.qty += r.qty;
      return acc;
    },
    { krw: 0, usd: 0, qty: 0 },
  );
}

// 지점별 합계 (원화 내림차순)
export function aggregateByStore(
  rows: DutyFreeSellThrough[],
): { store: string; krw: number; usd: number; qty: number }[] {
  const m = new Map<string, { krw: number; usd: number; qty: number }>();
  for (const r of rows) {
    const cur = m.get(r.store) ?? { krw: 0, usd: 0, qty: 0 };
    cur.krw += r.krw;
    cur.usd += r.usd;
    cur.qty += r.qty;
    m.set(r.store, cur);
  }
  return [...m.entries()]
    .map(([store, v]) => ({ store, ...v }))
    .sort((a, b) => b.krw - a.krw);
}

// 월별 합계 맵 (추이용)
export function sellThroughMonthlyTotals(
  rows: DutyFreeSellThrough[],
): Map<string, SellThroughTotal> {
  const m = new Map<string, SellThroughTotal>();
  for (const r of rows) {
    const cur = m.get(r.yearMonth) ?? { krw: 0, usd: 0, qty: 0 };
    cur.krw += r.krw;
    cur.usd += r.usd;
    cur.qty += r.qty;
    m.set(r.yearMonth, cur);
  }
  return m;
}
