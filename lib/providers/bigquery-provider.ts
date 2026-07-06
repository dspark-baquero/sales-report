import { BigQuery } from "@google-cloud/bigquery";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
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

// 콜드 스타트 가속용 스냅샷. 빌드 시 `npm run snapshot`으로 생성해 이미지에 구워넣는다.
// parseRow 이전의 "원본 매핑 레코드"(한글키 → 문자열)를 담으므로, 스냅샷은 데이터만
// 고정하고 파싱 로직은 런타임(배포 시점) 최신 코드가 적용된다. 파일이 없으면 라이브 조회.
export const SNAPSHOT_PATH = path.join(process.cwd(), "data", "snapshot.ndjson.gz");

// 매핑 레코드 = parseRow가 받는 { 한글컬럼명: 문자열 } 형태.
type RawRecord = Record<string, string>;

type Cached = {
  cube: FactCube;
  byMonth: Map<string, SalesRow[]>;
};

let cached: Cached | null = null;
// 새로고침(invalidateCache) 직후에는 스냅샷을 건너뛰고 라이브로 최신 데이터를 조회한다.
let forceLive = false;

/** 인메모리 캐시를 비운다. 다음 load 호출 시 BigQuery에서 라이브로 다시 조회한다(스냅샷 건너뜀). */
export function invalidateCache(): void {
  cached = null;
  forceLive = true;
}

/** BigQuery에서 원본 매핑 레코드를 조회한다. (라이브 경로 + 스냅샷 생성 스크립트 공용) */
export async function queryLiveRecords(): Promise<RawRecord[]> {
  const projectId = process.env.BQ_PROJECT_ID;
  const dataset = process.env.BQ_DATASET ?? "sales";
  const table = process.env.BQ_TABLE ?? "sales";

  const bq = new BigQuery(projectId ? { projectId } : undefined);
  const query = projectId
    ? `SELECT * FROM \`${projectId}.${dataset}.${table}\``
    : `SELECT * FROM \`${dataset}.${table}\``;

  const [rawRows] = await bq.query({ query, maxResults: 500_000 });

  const records: RawRecord[] = [];
  for (const raw of rawRows) {
    const record: RawRecord = {};
    for (const [key, value] of Object.entries(raw)) {
      const mappedKey = BQ_COL_MAP[key] ?? key;
      if (value != null && typeof value === "object" && "value" in value) {
        record[mappedKey] = String((value as { value: unknown }).value);
      } else {
        record[mappedKey] = value != null ? String(value) : "";
      }
    }
    records.push(record);
  }
  return records;
}

/** 이미지에 구워진 스냅샷을 읽는다. 없거나 손상 시 null → 라이브로 폴백. */
function readSnapshotRecords(): RawRecord[] | null {
  try {
    if (!existsSync(SNAPSHOT_PATH)) return null;
    const text = gunzipSync(readFileSync(SNAPSHOT_PATH)).toString("utf8");
    const records: RawRecord[] = [];
    for (const line of text.split("\n")) {
      const t = line.trim();
      if (t) records.push(JSON.parse(t) as RawRecord);
    }
    return records;
  } catch (e) {
    console.error(
      `[bigquery-provider] 스냅샷 읽기 실패: ${(e as Error).message} — 라이브 조회로 폴백`,
    );
    return null;
  }
}

function recordsToRows(records: RawRecord[]): SalesRow[] {
  const rows: SalesRow[] = [];
  for (const record of records) {
    const row = parseRow(record);
    if (row) rows.push(row);
  }
  return rows;
}

async function ensureLoaded(): Promise<Cached> {
  if (cached) return cached;

  let rows: SalesRow[] = [];
  let source = "";

  // 1) 콜드 스타트: 스냅샷 우선(BigQuery 네트워크 조회 생략). 새로고침 직후엔 건너뜀.
  if (!forceLive) {
    const snap = readSnapshotRecords();
    if (snap) {
      rows = recordsToRows(snap);
      source = "snapshot";
    }
  }

  // 2) 스냅샷이 없거나(미배포) 비어 있으면(스키마 변경 등) 라이브 조회로 폴백.
  if (rows.length === 0) {
    const live = await queryLiveRecords();
    rows = recordsToRows(live);
    source = "bigquery(live)";
  }
  forceLive = false;

  // 빈 결과는 절대 캐시하지 않는다. (데이터 업데이트로 테이블이 잠시 비는 순간 오염 방지)
  // 캐시하지 않고 throw → 다음 요청에서 재조회 → 데이터 복구 시 자동 회복(재배포 불필요).
  if (rows.length === 0) {
    console.error(
      `[bigquery-provider] 0 rows loaded (source=${source}) — 캐시하지 않고 에러 반환(다음 요청에서 재조회).`,
    );
    throw new Error(
      `BigQuery/스냅샷에서 매출 행을 0개 로드했습니다. ` +
      `데이터 업데이트 중 테이블이 비었거나 스키마가 변경됐을 수 있습니다. ` +
      `잠시 후 재시도하면 자동 회복됩니다.`,
    );
  }

  console.log(`[bigquery-provider] ${rows.length} rows loaded (source=${source})`);

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
