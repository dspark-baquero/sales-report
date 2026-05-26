# 개발 진행사항

## 현재 상태

- **배포**: Google Cloud Run (asia-northeast3) — `git push` → Cloud Run 소스 기반 자동 배포
- **데이터**: Google BigQuery (`sales` 테이블, 159,287행, 2023-07 ~ 현재)
- **목표**: `target.csv` (CSV, 컨테이너 이미지에 포함 — BigQuery 이전 예정)
- **인증**: Auth.js v5 + Google OAuth (`@baquero.co.kr` 전용)
- **첫 보고 기준월**: 2026-04
- **URL**: https://baquero-sales-report-44352754132.asia-northeast3.run.app

---

## 버전 이력

### v4.1 (2026-05)
Cloudflare Workers → **Google Cloud Run** 전환.
- Workers 무료 CPU 10ms 제한으로 Next.js SSR 불가 → Cloud Run 전환
- Cloudflare KV + sync 스크립트 전부 제거
- BigQuery 직접 쿼리 → FactCube 인메모리 빌드 → 모듈 캐시
- Docker (`output: "standalone"`) + Dockerfile
- `sales.csv` 삭제 — BigQuery가 유일한 데이터 소스

### v4.0 (2026-05)
CSV → BigQuery 데이터 소스 전환.
- Google Workspace 인증 추가 (Auth.js v5 + Google OAuth)
- 비동기 DataProvider 패턴 (`lib/providers/`)
- `lib/parsers.ts` 분리 (순수 파싱 함수)
- Cloudflare Workers 배포 시도 (CPU 제한으로 v4.1에서 Cloud Run으로 재전환)

### v3.0 (2026-05)
거래처/딜러 심층 분석 + 구조 개선. 커밋 `4a20046`.
- `/accounts` 탭 신규 — 동면 복귀 / 분기 절벽 / 상실된 핵심 거래처
- 모든 탭 상단에 자동 인사이트 (`lib/tabInsights.ts`, 휴리스틱 기반)
- 팩트 큐브 (`lib/facts.ts`) — 모든 차원 사전 집계
- 모든 라우트 `loading.tsx` 스켈레톤

### v2.0
- 9개 탭 체계 확립
- `target.csv` 통합 (목표 vs 실적)
- 한국어 라벨 전환
- 변화 요인 워터폴 차트

### v1.0
- 6개 탭 초기 빌드

---

## 최근 수정 (2026-05-26)

| 커밋 | 내용 |
|---|---|
| `9ee9f0e` | `sales.csv` 삭제 + `.gitignore` 추가 |
| `6542abd` | BigQuery 영어 컬럼명 → 한국어 매핑 (`BQ_COL_MAP`) |
| `224444a` | BigQuery DATE 객체 `.value` 변환 + `resolveMonth` 빈 배열 방어 |
| `35fc88c` | Auth.js `trustHost: true` — Cloud Run UntrustedHost 에러 수정 |
| `4d4a048` | GitHub Actions 워크플로우 삭제 — Cloud Run 소스 기반 직접 연동 |
| `6848ab6` | Cloudflare Workers → Google Cloud Run 전환 |

---

## 인프라 참고

### Cloud Run
- 서비스명: `baquero-sales-report`
- 리전: `asia-northeast3` (서울)
- 메모리: 2GiB (159k행 인메모리 로드에 필요)
- 배포: `git push` → Cloud Run 소스 기반 자동 빌드/배포
- 비용: 무료 등급 범위 내 (월 1회 보고용 대시보드)

### BigQuery
- 프로젝트: `citric-lead-457515-v2`
- 데이터셋: `sales`
- 테이블: `sales` (영어 컬럼명 — `bigquery-provider.ts`에서 한국어로 매핑)
- 컬럼: `channel, date, order_number, product_name, product_code, quantity, net_sales, order_amount, discount_amount, commission, shipping_fee, settlement, dealer, client, client_type, cost, brand`
- 비용: 무료 등급 범위 내 (쿼리 ~32MB/회, 월 1TB 무료)

### 환경변수 (Cloud Run)
- `AUTH_SECRET` — Auth.js 토큰 서명
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — Google OAuth
- `BQ_PROJECT_ID` — BigQuery 프로젝트 ID
- `BQ_DATASET` / `BQ_TABLE` — BigQuery 데이터셋/테이블명

---

## TODO

- [ ] `target.csv` → BigQuery `targets` 테이블 이전 (배포 없이 목표 즉시 반영)
- [ ] `docs/plan.md` 내 데이터 흐름도 업데이트 (v4.0 Cloudflare KV 흐름 → v4.1 BigQuery 직접 쿼리)
