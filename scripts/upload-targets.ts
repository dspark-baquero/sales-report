// target.csv → BigQuery targets 테이블 업로드 (1회성 마이그레이션)
// 실행: npx tsx scripts/upload-targets.ts

import { BigQuery } from "@google-cloud/bigquery";
import { readFileSync } from "fs";
import { join } from "path";

const projectId = process.env.BQ_PROJECT_ID;
const dataset = process.env.BQ_DATASET ?? "sales";
const table = process.env.BQ_TARGET_TABLE ?? "targets";

const bq = new BigQuery(projectId ? { projectId } : undefined);

async function main() {
  const csvPath = join(process.cwd(), "target.csv");
  const text = readFileSync(csvPath, "utf8");
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter(Boolean);
  const headers = lines[0].split(",").map((h) => h.trim());

  const brandIdx = headers.indexOf("브랜드");
  const divIdx = headers.indexOf("구분");
  const custIdx = headers.indexOf("거래처");
  const monthIdx = headers.indexOf("월");
  const targetIdx = headers.indexOf("목표매출");

  const rows: Array<{
    brand: string;
    division: string;
    customer_key: string;
    month: string;
    target_amount: number | null;
  }> = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((c) => c.trim().replace(/^"|"$/g, ""));
    const brand = cols[brandIdx] ?? "";
    const division = cols[divIdx] ?? "";
    const customerKey = cols[custIdx] ?? "";
    const monthRaw = cols[monthIdx] ?? "";
    if (!brand || !division || !customerKey || !monthRaw) continue;

    const m = monthRaw.match(/^(\d{4})\s*\/\s*(\d{1,2})$/);
    if (!m) continue;
    const month = `${m[1]}-${String(Number(m[2])).padStart(2, "0")}`;

    const rawAmount = cols[targetIdx] ?? "";
    const cleaned = rawAmount.replace(/[₩,\s"]/g, "").trim();
    const amount = cleaned ? Number(cleaned) : null;

    rows.push({ brand, division, customer_key: customerKey, month, target_amount: amount && Number.isFinite(amount) ? amount : null });
  }

  console.log(`Parsed ${rows.length} rows from target.csv`);

  const tableRef = bq.dataset(dataset).table(table);

  // 테이블 생성 (없으면)
  const [exists] = await tableRef.exists();
  if (!exists) {
    await bq.dataset(dataset).createTable(table, {
      schema: {
        fields: [
          { name: "brand", type: "STRING" },
          { name: "division", type: "STRING" },
          { name: "customer_key", type: "STRING" },
          { name: "month", type: "STRING" },
          { name: "target_amount", type: "FLOAT64" },
        ],
      },
    });
    console.log(`Created table ${dataset}.${table}`);
  } else {
    // 기존 데이터 삭제 후 재업로드
    const delQuery = projectId
      ? `DELETE FROM \`${projectId}.${dataset}.${table}\` WHERE true`
      : `DELETE FROM \`${dataset}.${table}\` WHERE true`;
    await bq.query({ query: delQuery });
    console.log("Cleared existing rows");
  }

  // 배치 삽입
  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    await tableRef.insert(rows.slice(i, i + BATCH));
    console.log(`Inserted ${Math.min(i + BATCH, rows.length)} / ${rows.length}`);
  }

  console.log("Done!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
