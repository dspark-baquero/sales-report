# 개발 진행사항

## 현재 상태

- **배포**: Google Cloud Run (asia-northeast3) — `git push` → Cloud Run 소스 기반 자동 배포
- **데이터**: Google BigQuery (`sales` 테이블, 159,287행, 2023-07 ~ 현재)
- **목표**: BigQuery (`targets` 테이블, dataset `dashboard_1`)
- **인증**: Auth.js v5 + Google OAuth (`@baquero.co.kr` 전용)
- **첫 보고 기준월**: 2026-04
- **URL**: https://baquero-sales-report-koo6cv5uba-du.a.run.app
- **탭 수**: 12개 (종합/목표달성/해외영업/B2B/대리점/바크로하우스/B2C/면세점/브랜드분석/거래처분석/심층분석/비매출출고)
- **접근 제한**: B2B 탭은 화이트리스트(`config/access.ts`) 9명만 열람 가능, 그 외 탭은 `@baquero.co.kr` 전체 공개

---

## 버전 이력

### v5.6 (2026-05-29)
매트릭스 2뎁스 재설계 + 비매출 출고 탭 신설 + B2B 접근 제한 + UX 보정.
- **종합탭 매트릭스를 2뎁스 좌우 카드로 재설계** — 좌측 1뎁스(브랜드 × 6채널대분류 — 해외영업/B2B/대리점/바크로하우스/B2C/면세점) + 우측 2뎁스(선택 채널의 거래처 Top10). 1뎁스 셀 클릭이 우측 채널을 드릴다운하고 좌측 디테일 패널을 동시 표시. 1뎁스에만 채널 YTD 목표/달성률 노출 — 거래처 단위로 채널 목표를 공유 표시하던 이전 버전의 의미 혼동 해소
- **바크로하우스 채널 분류 수정** — "바크로하우스 스마트스토어"를 1뎁스에서 B2C로 재분류(이전엔 바크로하우스 채널대분류에 묶여 있음). 바크로하우스 2뎁스는 메인 sales 거래처 대신 `bh_partner_sales`(파트너 추천 매출) 기준 파트너 Top10으로 교체
- **비매출 출고 상세 탭(`/non-revenue`) 신설** — 자동 인사이트(휴리스틱 4종) + KPI 4종(건수/수량/원가/원가비율) + 사업형태별 도넛+표 + 12개월 사업형태별 스택 추이 + 거래처 Top20 + 채널×사업형태 매트릭스 + 브랜드 가로 막대 + 제품 Top20. 종합탭 하단 1줄 요약 → 상세 탭 링크로 전환
- **B2B 탭 접근 제한** — `config/access.ts`에 이메일 화이트리스트(9명). 비인가자는 탭 옆에 자물쇠 아이콘 표시 + 클릭 시 "열람 권한이 없습니다" 카드. 다른 탭은 모두 공개 유지
- **콜드 스타트 로딩바 동작 수정** — `LoadingProgress`가 JS hydration 의존 → CSS keyframe(0→85% 25초 ease-out)으로 전환. HTML 도착 즉시 시각적 진행 시작, hydration 늦어져도 0%에 멈춰있다가 점프하던 문제 해결
- **매트릭스 sticky 버그 2종 수정** — 스크롤 시 sticky 브랜드 셀이 페이지 헤더를 가리던 z-index 충돌(z-10 → z-[1]), 가로 스크롤 시 카드 좌측 padding으로 셀이 겹쳐 보이던 문제(padding을 sticky 셀로 이동)

### v5.5 (2026-05-28)
임원 분석 강화 — 거래처 클릭 일관성 + YTD 차트 비교선 + 인사이트 노이즈 보정 + 브랜드×거래처 매트릭스.
- 종합탭에 **브랜드 × 거래처 매트릭스** 신규 카드 추가 — 행=브랜드 6개 / 열=YTD 상위 15 거래처 격자, 색상 4분면(파랑/초록/빨강/황색 — 전년 동기 ± × 채널 목표 ±) + 회색, 셀 클릭 시 매출 5종 + 채널 목표 달성률 + 색상 사유가 인라인 expand 패널로 펼쳐짐 (기존 핵심 변동 카드는 유지)
- 모든 카드·표·차트에서 거래처명 클릭 → 거래처 분석 탭으로 이동 일관 처리 (`CustomerLink`/`customerHref` 공통 컴포넌트, 워터폴/막대/도넛/트리맵 차트에 클릭 라우팅)
- YTD 월별 매출 추이 차트에 **월별 목표**(amber 다이아몬드 실선)와 **전년 동기 매출**(slate 원형 점선) 라인 오버레이 추가 — 9개 탭 일괄 적용
- 거래처·카테고리 핵심 변동 인사이트에 **YTD 누적 컨텍스트** 추가 + 월 변동과 YTD 방향이 반대일 때 severity 자동 격하 (단발성 노이즈를 info로) — 예: "면세점 월 -36% / YTD 누적 +61%" 같은 케이스를 critical 대신 info로 표시
- 종합탭 상위 거래처 5개 → 10개로 확장
- 차트 컴포넌트 머지 동작 버그 수정 — 브랜드/거래처 콤보박스 변경 시 툴팁이 옛 데이터를 표시하던 문제 (`notMerge=true` 기본값)

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

## 최근 수정 (2026-05-29)

| 커밋 | 내용 |
|---|---|
| `d571f3e` | 콜드 스타트 시 로딩바가 0%에 멈춰있던 문제 — CSS keyframe 기반으로 전환 |
| `6a79a86` | B2B 탭 이메일 화이트리스트 접근 제한 + 자물쇠 아이콘 |
| `26bb8e3` | 매트릭스 가로 스크롤 시 sticky 브랜드 셀 좌측 여백으로 셀 겹침 수정 |
| `4333c5a` | 비매출 출고 상세 분석 탭(`/non-revenue`) 신설 |
| `c493b65` | 바크로하우스 스마트스토어 B2C 재분류 + 바크로하우스 2뎁스를 파트너 매출 기준으로 교체 |
| `80ab28d` | 매트릭스 sticky 브랜드 셀이 페이지 헤더를 가리던 z-index 충돌 수정 |
| `54314be` | 종합탭 브랜드 매트릭스를 2뎁스 좌우 카드로 재설계 |

## 최근 수정 (2026-05-28)

| 커밋 | 내용 |
|---|---|
| `7d9c747` | 종합탭에 브랜드 × 거래처 매트릭스 신규 카드 추가 |
| `13609fd` | 카테고리 핵심 변동 인사이트에도 YTD 컨텍스트 + severity 격하 적용 |
| `959ec83` | 거래처 핵심 변동 인사이트에 YTD 누적 컨텍스트 + severity 자동 격하 |
| `c8e7db0` | YTD 월별 매출 추이 차트에 월별 목표·전년 동기 라인 오버레이 추가 |
| `d49fa6a` | 브랜드·거래처 변경 시 차트 툴팁이 옛 데이터로 표시되던 버그 수정 |
| `feb656f` | 종합탭 상위 거래처를 5개 → 10개로 확장 |
| `df9c98e` | 모든 카드·표·차트에서 거래처명 클릭 → 거래처 분석으로 이동 |

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
