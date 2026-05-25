/**
 * BigQuery → Cloudflare KV 동기화 스크립트.
 * 월 1회 실행: BigQuery에서 매출 데이터를 읽어 FactCube + 월별 raw rows로 KV에 업로드.
 *
 * 환경 변수:
 *   GOOGLE_APPLICATION_CREDENTIALS — BigQuery 서비스 계정 키 파일 경로
 *   BQ_PROJECT_ID                 — BigQuery 프로젝트 ID
 *   BQ_DATASET                    — BigQuery 데이터셋 (기본: sales)
 *   BQ_TABLE                      — BigQuery 테이블 (기본: sales)
 *   CLOUDFLARE_ACCOUNT_ID         — Cloudflare 계정 ID
 *   CLOUDFLARE_KV_NAMESPACE_ID    — KV 네임스페이스 ID
 *   CLOUDFLARE_API_TOKEN          — Cloudflare API 토큰 (KV 쓰기 권한)
 */

import { BigQuery } from "@google-cloud/bigquery";
import fs from "fs";
import path from "path";
import Papa from "papaparse";
import { parseRow, type SalesRow } from "../lib/parsers";
import { buildFactCube } from "../lib/facts";
import {
  serializeFactCube,
  serializeRows,
  type KVMeta,
} from "../lib/serialization";

// ── 설정 ──────────────────────────────────────────

const BQ_PROJECT = process.env.BQ_PROJECT_ID;
const BQ_DATASET = process.env.BQ_DATASET ?? "sales";
const BQ_TABLE = process.env.BQ_TABLE ?? "sales";
const CF_ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID;
const CF_NAMESPACE = process.env.CLOUDFLARE_KV_NAMESPACE_ID;
const CF_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

// ── BigQuery 컬럼 → CSV 컬럼명 매핑 ────────────────
// BigQuery 테이블은 sales.csv와 동일한 한국어 컬럼명을 사용한다고 가정.
// 만약 영문 컬럼명이면 여기서 매핑 조정.
const COLUMN_MAP: Record<string, string> = {
  채널: "채널",
  날짜: "날짜",
  주문번호: "주문번호",
  제품명: "제품명",
  품목코드: "품목코드",
  판매수량: "판매수량",
  "실 매출": "실 매출",
  주문금액: "주문금액",
  할인금액: "할인금액",
  수수료: "수수료",
  배송비: "배송비",
  정산금액: "정산금액",
  딜러: "딜러",
  거래처: "거래처",
  "거래처 사업형태": "거래처 사업형태",
  원가: "원가",
  브랜드: "브랜드",
};

// ── BigQuery 쿼리 ─────────────────────────────────

async function fetchFromBigQuery(): Promise<SalesRow[]> {
  if (!BQ_PROJECT) throw new Error("BQ_PROJECT_ID 환경 변수 필요");

  const bq = new BigQuery({ projectId: BQ_PROJECT });
  const query = `SELECT * FROM \`${BQ_PROJECT}.${BQ_DATASET}.${BQ_TABLE}\``;

  console.log(`BigQuery 쿼리 실행: ${BQ_DATASET}.${BQ_TABLE}`);
  const [rawRows] = await bq.query({ query, maxResults: 500_000 });
  console.log(`BigQuery 결과: ${rawRows.length}행`);

  const rows: SalesRow[] = [];
  for (const raw of rawRows) {
    const record: Record<string, string> = {};
    for (const [bqCol, csvCol] of Object.entries(COLUMN_MAP)) {
      record[csvCol] = raw[bqCol] != null ? String(raw[bqCol]) : "";
    }
    const row = parseRow(record);
    if (row) rows.push(row);
  }

  console.log(`파싱 완료: ${rows.length}행 (수출 제외)`);
  return rows;
}

// ── Cloudflare KV 업로드 ──────────────────────────

async function kvPut(key: string, value: string): Promise<void> {
  if (!CF_ACCOUNT || !CF_NAMESPACE || !CF_TOKEN) {
    throw new Error("CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_KV_NAMESPACE_ID, CLOUDFLARE_API_TOKEN 필요");
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/storage/kv/namespaces/${CF_NAMESPACE}/values/${encodeURIComponent(key)}`;
  const resp = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${CF_TOKEN}`,
      "Content-Type": "application/octet-stream",
    },
    body: value,
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`KV PUT 실패 [${key}]: ${resp.status} ${body}`);
  }
}

// ── target.csv 동기화 ────────────────────────────

async function syncTargets(): Promise<void> {
  const csvPath = path.join(process.cwd(), "target.csv");
  if (!fs.existsSync(csvPath)) {
    console.log("target.csv 없음 — 건너뜀");
    return;
  }
  const text = fs.readFileSync(csvPath, "utf8");
  await kvPut("sales:targets", text);
  console.log("target.csv → KV 업로드 완료");
}

// ── 메인 ──────────────────────────────────────────

async function main() {
  console.log("=== BigQuery → Cloudflare KV 동기화 시작 ===\n");

  // 1. BigQuery에서 데이터 로드
  const rows = await fetchFromBigQuery();

  // 2. FactCube 빌드
  console.log("FactCube 빌드 중...");
  const cube = buildFactCube(rows);
  console.log(`FactCube 완료: ${cube.monthsAsc.length}개월, ${cube.customers.size}개 거래처`);

  // 3. 직렬화
  console.log("직렬화 중...");
  const serializedCube = JSON.stringify(serializeFactCube(cube));
  console.log(`큐브 크기: ${(serializedCube.length / 1024 / 1024).toFixed(1)}MB`);

  // 4. 월별 raw rows 분할
  const byMonth = new Map<string, SalesRow[]>();
  for (const r of rows) {
    const arr = byMonth.get(r.yearMonth);
    if (arr) arr.push(r);
    else byMonth.set(r.yearMonth, [r]);
  }

  // 5. KV 업로드
  console.log("\nKV 업로드 시작...");

  // 5a. 큐브
  await kvPut("sales:cube", serializedCube);
  console.log("  sales:cube ✓");

  // 5b. 월별 raw rows
  for (const [ym, monthRows] of byMonth) {
    const key = `sales:raw:${ym}`;
    const json = serializeRows(monthRows);
    await kvPut(key, json);
    console.log(`  ${key} (${monthRows.length}행, ${(json.length / 1024).toFixed(0)}KB) ✓`);
  }

  // 5c. target.csv
  await syncTargets();

  // 5d. 메타데이터
  const meta: KVMeta = {
    lastSync: new Date().toISOString(),
    months: cube.monthsAsc,
    rowCount: rows.length,
  };
  await kvPut("sales:meta", JSON.stringify(meta));
  console.log("  sales:meta ✓");

  // 6. 검증 요약
  console.log("\n=== 동기화 완료 ===");
  console.log(`총 행: ${rows.length}`);
  console.log(`월 수: ${cube.monthsAsc.length} (${cube.monthsAsc[0]} ~ ${cube.monthsAsc.at(-1)})`);
  console.log(`거래처: ${cube.customers.size}, 딜러: ${cube.dealers.size}, 브랜드: ${cube.brands.size}`);

  // 월별 매출 검증
  console.log("\n월별 매출 (최근 3개월):");
  for (const ym of cube.monthsAsc.slice(-3)) {
    const cell = cube.byMonth.get(ym);
    if (cell) {
      console.log(`  ${ym}: ${(cell.revenue / 100_000_000).toFixed(2)}억원 (${cell.rowCount}행)`);
    }
  }
}

main().catch((err) => {
  console.error("동기화 실패:", err);
  process.exit(1);
});
