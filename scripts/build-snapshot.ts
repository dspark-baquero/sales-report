// 콜드 스타트 가속용 데이터 스냅샷 생성기.
//
// BigQuery를 1회 조회해 원본 매핑 레코드를 data/snapshot.ndjson.gz 로 저장한다.
// 이 파일을 커밋 → 배포하면 이미지에 구워져, 콜드 스타트에서 BigQuery 네트워크
// 조회 없이 로컬 파일만 읽는다(런타임은 스냅샷의 원본 레코드에 parseRow를 적용하므로
// 파싱 로직은 항상 최신). 데이터가 바뀌면 다시 실행해 커밋·배포하면 된다.
//
// 실행: npm run snapshot   (gcloud ADC 인증 + .env(.local)의 BQ_* 필요)

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";

// 의존성 없이 .env(.local) 를 로드 (이미 설정된 env 는 덮어쓰지 않음).
function loadEnvFile(file: string): void {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2];
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

async function main(): Promise<void> {
  // .env.local 우선(로컬 실제값), 그 다음 .env
  loadEnvFile(path.join(process.cwd(), ".env.local"));
  loadEnvFile(path.join(process.cwd(), ".env"));

  const { queryLiveRecords } = await import("../lib/providers/bigquery-provider");

  const proj = process.env.BQ_PROJECT_ID || "(default ADC project)";
  const ds = process.env.BQ_DATASET ?? "sales";
  const tbl = process.env.BQ_TABLE ?? "sales";
  console.log(`BigQuery 조회 중… ${proj}.${ds}.${tbl}`);

  const records = await queryLiveRecords();
  if (records.length === 0) {
    console.error("조회 결과 0행 — 스냅샷을 생성하지 않습니다 (테이블 비었거나 스키마 변경?).");
    process.exit(1);
  }

  const ndjson = records.map((r) => JSON.stringify(r)).join("\n");
  const gz = gzipSync(Buffer.from(ndjson, "utf8"), { level: 9 });

  const outDir = path.join(process.cwd(), "data");
  mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "snapshot.ndjson.gz");
  writeFileSync(outPath, gz);

  const mb = (gz.length / 1024 / 1024).toFixed(1);
  console.log(`스냅샷 생성 완료: ${records.length.toLocaleString()}행 → ${outPath} (${mb} MB gz)`);
  console.log("이 파일을 커밋 후 배포하면 콜드 스타트가 빨라집니다.");
}

main().catch((e) => {
  console.error("스냅샷 생성 실패:", e);
  process.exit(1);
});
