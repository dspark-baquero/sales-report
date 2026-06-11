// 지코(Zico) 면세점 실판매 구글시트 → BigQuery 외부 테이블(df_sellthrough) 생성.
// 1회성. 시트를 BigQuery 서비스 계정과 공유(뷰어)한 뒤 실행:
//   node scripts/create-dutyfree-sellthrough-table.mjs
//
// 시트 컬럼: 월 / 면세점 / 판매수량 / 판매금액(달러) / 판매금액(원화)
// 한글·괄호 헤더라 autodetect가 불안정하므로 명시 schema + skipLeadingRows:1 (위치 매핑).

import { BigQuery } from "@google-cloud/bigquery";

const projectId = process.env.BQ_PROJECT_ID ?? "citric-lead-457515-v2";
const datasetId = process.env.BQ_DATASET ?? "dashboard_1";
const tableId = process.env.BQ_DF_SELLTHROUGH_TABLE ?? "df_sellthrough";
const sheetUrl =
  "https://docs.google.com/spreadsheets/d/1hzRcllbfHzO8d0UNvVcyqQGK0SkmYwIeC9QeBGzxzq0";

const bq = new BigQuery({
  projectId,
  scopes: [
    "https://www.googleapis.com/auth/bigquery",
    "https://www.googleapis.com/auth/drive.readonly",
  ],
});
const dataset = bq.dataset(datasetId);

async function main() {
  const table = dataset.table(tableId);
  const [exists] = await table.exists();
  if (exists) {
    await table.delete();
    console.log(`Deleted existing ${tableId}`);
  }

  await dataset.createTable(tableId, {
    externalDataConfiguration: {
      sourceFormat: "GOOGLE_SHEETS",
      sourceUris: [sheetUrl],
      autodetect: false,
      // range 미지정 → 첫 번째(유일) 탭 사용.
      googleSheetsOptions: { skipLeadingRows: 1 },
      schema: {
        fields: [
          { name: "month", type: "STRING" }, // "2024년 10월"
          { name: "store", type: "STRING" }, // 신라서울점
          { name: "quantity", type: "STRING" }, // 앱에서 숫자 파싱
          { name: "sales_usd", type: "STRING" }, // "$24,733"
          { name: "sales_krw", type: "STRING" }, // "₩33,205,960"
        ],
      },
    },
  });
  console.log(`Created external table: ${datasetId}.${tableId} -> ${sheetUrl}`);

  // 스키마 + 샘플 확인
  const [meta] = await dataset.table(tableId).getMetadata();
  console.log(`\n=== ${tableId} columns ===`);
  for (const f of meta.schema.fields) console.log(`  ${f.name} (${f.type})`);

  const [rows] = await bq.query(
    `SELECT * FROM \`${projectId}.${datasetId}.${tableId}\` LIMIT 5`,
  );
  console.log(`\nSample (${rows.length} rows):`);
  for (const r of rows) console.log(JSON.stringify(r));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
