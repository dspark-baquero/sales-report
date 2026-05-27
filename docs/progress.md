# 개발 진행사항

## 현재 상태

- **배포**: Google Cloud Run (asia-northeast3) — `git push` → Cloud Run 소스 기반 자동 배포
- **데이터**: Google BigQuery (`sales` 테이블, 159,287행, 2023-07 ~ 현재)
- **목표**: BigQuery (`targets` 테이블, dataset `dashboard_1`)
- **인증**: Auth.js v5 + Google OAuth (`@baquero.co.kr` 전용)
- **첫 보고 기준월**: 2026-04
- **URL**: https://baquero-sales-report-koo6cv5uba-du.a.run.app
- **탭 수**: 10개 (종합/목표달성/해외영업/B2B/대리점/바크로하우스/B2C/면세점/브랜드분석/거래처분석/심층분석)

---

## 버전 이력

### v5.4 (2026-05-27)
종합 탭 임원 보고용 심플화 + 탭 통합.
- 종합 탭: YTD/워터폴/일별누적/도넛/제품테이블 제거, 전체+6채널(B2B/대리점/B2C/바크로하우스/면세점/수출) KPI 카드에 채널별 목표 달성률 추가, Top 10→5 거래처 축소, AccountHighlights를 변동 요약 카드 1개로 압축, 비매출 출고 1줄 요약
- 변동 분석 탭(/changes) 삭제 → 심층 분석 탭(/insights)에 고유 콘텐츠 통합 (10탭으로 축소)
- 심층 분석 탭: 다른 탭과 중복되는 거래처 4종 카드/YTD/채널그룹 상승하락 제거, 할인율 테이블에 전월 변화 열 병합, 신제품 비중% 추가, 이상치 거래(1억+) 이관
- 사람 코멘트 기능 및 `marked` 패키지 제거
- 목표달성 탭 월별 매출 추이 스택 차트에 대리점·바크로하우스 분리 표시

### v5.3 (2026-05-27)
초기 로딩 UX 개선.
- 레이아웃에서 BigQuery 데이터 로딩을 Suspense로 분리 → 콜드 스타트 시 빈 화면 대신 헤더+스켈레톤 즉시 표시
- `LoadingProgress` 프로그레스 바 컴포넌트 추가 (단계별 상태 메시지 + %)
- `MonthSelectLoader` 서버 컴포넌트 분리

### v5.2 (2026-05-27)
전 탭 제품 분석 + 브랜드 탭 고도화.
- 6개 채널탭(B2C/B2B/대리점/면세점/해외영업/바크로하우스)에 상위 20 제품 테이블 추가 (이번달·전월비교·올해 누적)
- `TopProductsTable` 공유 컴포넌트 + `topNProductsEnhanced()` 함수 (YTD 포함)
- 브랜드 분석 탭: 수출 카테고리 반영, 카테고리별 목표 달성률 테이블, 채널 상세 테이블 추가

### v5.1 (2026-05-27)
B2C·대리점 탭 고도화 + FactCube 버그 수정.
- 목표달성 탭 기간별(월/분기/반기/연간) 매트릭스 + 상세 대시보드
- B2B·대리점 탭에 영업사원/대리점별 월간 목표 달성 현황 (`dealer_targets` BigQuery 테이블)
- B2C 탭: 자사 공식몰 채널별·소호몰 브랜드별·임직원패밀리 테이블 및 12개월 스택 차트
- 대리점 탭: 모든 차트를 대리점별 스택으로 변환 + 도넛 차트 + 브랜드×대리점 매트릭스
- FactCube B2B 딜러 차원에서 대리점 매출 제외 (b2bCustomerType !== "대리점")
- B2C 탭에서 바크로하우스 완전 제외 (별도 탭 분리, 스마트스토어는 유지)
- B2C 목표 합계에 기타 채널 추가, 종합몰 수수료율 컬럼 제거

### v5.0 (2026-05)
탭 구조 개편 (9 → 11탭).
- 해외영업(`/export`) 탭 신설 — 국가별 매출, 12개월 추이, 국가×브랜드 매트릭스, 목표 달성
- 대리점(`/agencies`) 탭 신설 — 거래처별 실적, 브랜드 분해, 신규/이탈 거래처
- B2B 탭에서 대리점 거래처 완전 분리 (영업사원 실적 포함)
- 종합 탭에 수출 카테고리 추가 (B2B/B2C/면세점/수출 4대 카테고리)
- 목표 데이터 해외(수출) division 활성화
- FactCube에 `customerToB2bType` 인덱스 추가

### v4.1 (2026-05)
Cloudflare Workers → **Google Cloud Run** 전환.
- Workers 무료 CPU 10ms 제한으로 Next.js SSR 불가 → Cloud Run 전환
- Cloudflare KV + sync 스크립트 전부 제거
- BigQuery 직접 쿼리 → FactCube 인메모리 빌드 → 모듈 캐시
- Docker (`output: "standalone"`) + Dockerfile
- `sales.csv` 삭제 — BigQuery가 유일한 데이터 소스
- `target.csv` → BigQuery `targets` 테이블 이전 완료 + CSV 삭제

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
- 9개 탭 체계 확립 (v5.0에서 11개로 확장)
- `target.csv` 통합 (목표 vs 실적)
- 한국어 라벨 전환
- 변화 요인 워터폴 차트

### v1.0
- 6개 탭 초기 빌드

---

## 최근 수정 (2026-05-27)

| 커밋 | 내용 |
|---|---|
| `0d747b7` | 목표달성 탭 월별 매출 추이에 대리점·바크로하우스 분리 표시 |
| `d622015` | 종합 탭 임원 보고용 심플화 — 6채널 KPI + 스크롤 절반 축소 |
| `6bb7dad` | 변동 분석 + 심층 분석 탭 통합 — 중복 제거 + 고유 분석만 유지 |
| `c56d2ba` | 초기 로딩 UX 개선 — 프로그레스 바 + 레이아웃 논블로킹 |
| `2228b70` | 브랜드 분석 탭 고도화 — 수출 포함, 카테고리 목표 달성, 채널 상세, YTD 제품 |

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
- 데이터셋: `dashboard_1`
- 매출 테이블: `매출통계` (영어 컬럼명 — `bigquery-provider.ts`에서 한국어로 매핑)
- 목표 테이블: `targets` (brand, division, customer_key, month, target_amount)
- 담당자 목표 테이블: `dealer_targets` (name, type, month, target)
- 매출 컬럼: `channel, date, order_number, product_name, product_code, quantity, net_sales, order_amount, discount_amount, commission, shipping_fee, settlement, dealer, client, client_type, cost, brand`
- 비용: 무료 등급 범위 내 (쿼리 ~32MB/회, 월 1TB 무료)

### 환경변수 (Cloud Run)
- `AUTH_SECRET` — Auth.js 토큰 서명
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — Google OAuth
- `BQ_PROJECT_ID` — BigQuery 프로젝트 ID
- `BQ_DATASET` / `BQ_TABLE` — BigQuery 데이터셋/테이블명

---

## TODO

- [x] `target.csv` → BigQuery `targets` 테이블 이전 (배포 없이 목표 즉시 반영)
- [ ] `docs/plan.md` 내 데이터 흐름도 업데이트 (v4.0 Cloudflare KV 흐름 → v4.1 BigQuery 직접 쿼리)
