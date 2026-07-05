import { BigQuery } from "@google-cloud/bigquery";
import { parseRow, type SalesRow } from "../parsers";
import { buildFactCube, type FactCube } from "../facts";

const BQ_COL_MAP: Record<string, string> = {
  channel: "채널",
  date: "날짜",
  order_number: "주문번호",
  product_name: "제품명",
  product_code: "품목코드",
  quantity: "판매수량",
  net_sales: "실 매출",
  order_amount: "주문금액",
  discount_amount: "할인금액",
  commission: "수수료",
  shipping_fee: "배송비",
  settlement: "정산금액",
  dealer: "딜러",
  client: "거래처",
  client_type: "거래처 사업형태",
  cost: "원가",
  brand: "브랜드",
};

type Cached = {
  cube: FactCube;
  byMonth: Map<string, SalesRow[]>;
};

let cached: Cached | null = null;

/** 인메모리 캐시를 비운다. 다음 load 호출 시 BigQuery에서 다시 조회한다. */
export function invalidateCache(): void {
  cached = null;
}

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
      const mappedKey = BQ_COL_MAP[key] ?? key;
      if (value != null && typeof value === "object" && "value" in value) {
        record[mappedKey] = String((value as { value: unknown }).value);
      } else {
        record[mappedKey] = value != null ? String(value) : "";
      }
    }
    const row = parseRow(record);
    if (row) rows.push(row);
  }

  // 빈 결과는 절대 캐시하지 않는다.
  // 데이터 업데이트(WRITE_TRUNCATE 등)로 테이블이 잠시 비는 순간에 인스턴스가
  // 조회하면 0행이 들어오는데, 이걸 캐시하면 이후 데이터가 복구돼도 인스턴스가
  // 영구히 빈 큐브를 반환("월 데이터 없음" 에러)한다. 캐시하지 않고 throw 하면
  // 다음 요청에서 다시 조회 → 데이터 복구 시 자동 회복(재배포 불필요).
  if (rows.length === 0) {
    console.error(
      `[bigquery-provider] 0 rows parsed from ${rawRows.length} raw rows. ` +
      `Sample keys: ${rawRows[0] ? Object.keys(rawRows[0]).join(", ") : "(empty)"} — ` +
      `캐시하지 않고 에러 반환(다음 요청에서 재조회).`,
    );
    throw new Error(
      `BigQuery에서 매출 행을 0개 로드했습니다 (raw ${rawRows.length}행). ` +
      `데이터 업데이트 중 테이블이 비었거나 스키마가 변경됐을 수 있습니다. ` +
      `잠시 후 재시도하면 자동 회복됩니다.`,
    );
  }

  console.log(`[bigquery-provider] ${rows.length} rows loaded from BigQuery`);

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

export const bigqueryProvider = {
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
