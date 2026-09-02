import { BigQuery } from "@google-cloud/bigquery";

const bq = new BigQuery({ projectId: "citric-lead-457515-v2" });
const dataset = bq.dataset("dashboard_1");
const sheetUrl = "https://docs.google.com/spreadsheets/d/19dGye9KCII6oFAwHZYFQrVffKmmMqk7YE8arjEaVoS8";

async function createOrReplace(tableId, sheetRange) {
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
      autodetect: true,
      googleSheetsOptions: {
        skipLeadingRows: 1,
        range: sheetRange,
      },
    },
  });
  console.log(`Created external table: ${tableId} -> sheet "${sheetRange}"`);
}

await createOrReplace("bh_partners", "파트너리스트");
await createOrReplace("bh_partner_sales", "파트너매출");
// B2B몰 거래처(회원) 목록 — /members 탭. 시트 1행은 영문 snake_case 헤더여야 한다
// (member_id, client, status, sales_rep, grade, biz_type, region1, joined_at, …).
// 전화번호·사업자번호·가입일시 컬럼은 시트에서 '일반 텍스트' 서식으로 둘 것 — 선행 0 보존.
await createOrReplace("members", "회원리스트");

// 스키마 확인
for (const id of ["bh_partners", "bh_partner_sales", "members"]) {
  const [meta] = await dataset.table(id).getMetadata();
  console.log(`\n=== ${id} columns ===`);
  for (const f of meta.schema.fields) {
    console.log(`  ${f.name} (${f.type})`);
  }
  const [rows] = await bq.query(`SELECT * FROM dashboard_1.${id} LIMIT 3`);
  console.log(`Sample (${rows.length} rows):`);
  for (const r of rows) console.log(JSON.stringify(r));
}
