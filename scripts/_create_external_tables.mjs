// Google Sheets 탭 → BigQuery 외부 테이블 등록.
//
// 실행: node scripts/_create_external_tables.mjs [테이블명 ...]
//   인자 없이 실행하면 전부, 인자를 주면 해당 테이블만 다시 만든다.
//
// autodetect는 스키마를 잡으려고 시트를 실제로 읽기 때문에 Drive 권한이 필요하다.
// 스키마를 명시하면 테이블 정의만 등록하므로 Drive 권한 없이도 생성된다 —
// 로컬 ADC에 Drive 스코프가 없는 환경에서는 명시 스키마 쪽을 쓴다.
// (조회는 여전히 Drive 권한이 있는 실행 주체에서만 된다. Cloud Run 서비스 계정은 보유)

import { BigQuery } from "@google-cloud/bigquery";

const bq = new BigQuery({ projectId: "citric-lead-457515-v2" });
const dataset = bq.dataset("dashboard_1");
const sheetUrl =
  "https://docs.google.com/spreadsheets/d/19dGye9KCII6oFAwHZYFQrVffKmmMqk7YE8arjEaVoS8";

const strFields = (names) => ({ fields: names.map((name) => ({ name, type: "STRING" })) });

// 명시 스키마는 시트 헤더 이름이 아니라 "컬럼 순서"로 매핑된다. 순서가 곧 계약이므로
// 시트에서 컬럼을 추가·이동하면 여기도 같이 고쳐야 한다.
const TABLES = {
  bh_partners: { range: "파트너리스트" },
  bh_partner_sales: { range: "파트너매출" },
  // B2B몰 거래처(회원) 목록 — /members 탭
  members: {
    range: "회원리스트",
    schema: strFields([
      "member_id",
      "client", // 상호명 — 매출 데이터 거래처명과 조인하는 키
      "region1",
      "joined_at",
      "grade",
      "biz_type",
      "interest_brands",
      "status",
      "sales_rep",
      "ceo_name",
    ]),
  },
};

async function createOrReplace(tableId) {
  const def = TABLES[tableId];
  if (!def) throw new Error(`알 수 없는 테이블: ${tableId}`);

  const table = dataset.table(tableId);
  const [exists] = await table.exists();
  if (exists) {
    await table.delete();
    console.log(`기존 ${tableId} 삭제`);
  }

  const external = {
    sourceFormat: "GOOGLE_SHEETS",
    sourceUris: [sheetUrl],
    googleSheetsOptions: { skipLeadingRows: 1, range: def.range },
    ...(def.schema
      ? { autodetect: false, schema: def.schema }
      : { autodetect: true }),
  };

  await dataset.createTable(tableId, {
    ...(def.schema ? { schema: def.schema } : {}),
    externalDataConfiguration: external,
  });
  console.log(
    `생성 완료: ${tableId} → 시트 탭 "${def.range}"${def.schema ? " (명시 스키마)" : " (autodetect)"}`,
  );
}

const targets = process.argv.slice(2);
const ids = targets.length > 0 ? targets : Object.keys(TABLES);

for (const id of ids) await createOrReplace(id);

// 스키마 확인 — 조회에는 Drive 권한이 필요하므로 실패해도 생성 자체는 끝난 상태다.
for (const id of ids) {
  const [meta] = await dataset.table(id).getMetadata();
  const fields = meta.schema?.fields ?? [];
  console.log(`\n=== ${id} 컬럼 (${fields.length}) ===`);
  for (const f of fields) console.log(`  ${f.name} (${f.type})`);
  try {
    const [rows] = await bq.query(`SELECT * FROM dashboard_1.${id} LIMIT 3`);
    console.log(`샘플 ${rows.length}행:`);
    for (const r of rows) console.log(JSON.stringify(r));
  } catch (e) {
    console.log(`샘플 조회 생략 — ${e.message.split("\n")[0]}`);
  }
}
