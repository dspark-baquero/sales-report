# 프로젝트 아키텍처

바크로 월별 매출 임원 보고서 대시보드의 기술 구조 문서.

---

## 1. 시스템 구성도

```
┌───────────────┐     ┌──────────────────────────────────────────────────┐
│  BigQuery     │     │  Google Cloud Run (asia-northeast3, 서울)        │
│  ┌──────────┐ │     │                                                  │
│  │매출통계  │─┼────→│  bigquery-provider.ts                            │
│  │(159k행)  │ │     │    ↓ SELECT * 1회                                │
│  ├──────────┤ │     │  parsers.ts (SalesRow 정규화)                    │
│  │targets   │─┼────→│    ↓                                             │
│  ├──────────┤ │     │  facts.ts (FactCube 인메모리 빌드)               │
│  │dealer_   │─┼────→│    ↓                                             │
│  │targets   │ │     │  Server Components (SSR)                         │
│  └──────────┘ │     │    ↓                                             │
└───────────────┘     │  HTML + ECharts 클라이언트 렌더                   │
                      └──────────────────────────────────────────────────┘
                                         ↑
                      ┌──────────────────┘
                      │ HTTPS
                      ↓
                ┌───────────┐
                │  브라우저   │  Auth.js + Google OAuth
                │  @baquero  │  (@baquero.co.kr 전용)
                └───────────┘
```

---

## 2. 기술 스택

| 영역 | 기술 | 버전 |
|------|------|------|
| 프레임워크 | Next.js (App Router) | 16 |
| UI | React | 19 |
| 차트 | Apache ECharts + echarts-for-react | - |
| 컴포넌트 | shadcn/ui (Radix) | - |
| 스타일 | Tailwind CSS | 4 |
| 테이블 | TanStack Table | - |
| 인증 | Auth.js (next-auth) | v5 |
| 데이터 | Google BigQuery | - |
| 배포 | Google Cloud Run + Docker | Node 24 alpine |
| 빌드 | Next.js standalone output | - |

---

## 3. 디렉토리 구조

```
sales-report/
├── app/                          # Next.js App Router 페이지
│   ├── layout.tsx                # 공통 레이아웃 (헤더, 탭, 인증)
│   ├── page.tsx                  # 종합 대시보드
│   ├── login/                    # Google 로그인
│   ├── api/auth/[...nextauth]/   # NextAuth API 라우트
│   ├── api/refresh/              # 캐시 무효화 엔드포인트 (토큰 보호, 관리자/자동화)
│   ├── targets/                  # 목표달성 탭
│   ├── export/                   # 해외영업 탭
│   ├── b2b-summary/              # B2B종합 탭 (영업사원별 통합, 화이트리스트)
│   ├── b2b/                      # B2B 탭
│   ├── agencies/                 # 대리점 탭
│   ├── baquerohouse/             # 바크로하우스 탭
│   ├── b2c/                      # B2C 탭
│   ├── duty-free/                # 면세점 탭
│   ├── brand/                    # 브랜드 분석 탭
│   ├── accounts/                 # 거래처 분석 탭
│   ├── insights/                 # 심층 분석 탭
│   ├── non-revenue/              # 비매출 출고 탭
│   ├── sales-rep/                # 영업사원 상세 (B2B종합에서 이름 클릭, 별도 메뉴 없음)
│   └── */loading.tsx             # 각 탭별 스켈레톤 로딩 UI
│
├── lib/                          # 비즈니스 로직
│   ├── providers/
│   │   └── bigquery-provider.ts  # BigQuery 쿼리 + 인메모리 캐시
│   ├── load.ts                   # 데이터 로드 API (async)
│   ├── parsers.ts                # 원본 데이터 → SalesRow 변환
│   ├── facts.ts                  # FactCube 빌드 (다차원 사전 집계)
│   ├── aggregate.ts              # KPI 계산 (매출, 수량, 마진 등)
│   ├── compare.ts                # 시계열 비교 (MoM/QoQ/YoY)
│   ├── format.ts                 # 한국식 숫자/날짜 표기
│   ├── dimensions.ts             # 차원별 집계 (국가, 딜러 등)
│   ├── targets.ts                # 목표 데이터 로드 + 매칭
│   ├── dealer-targets.ts         # 담당자별 목표
│   ├── tabInsights.ts            # 자동 인사이트 (휴리스틱)
│   ├── accountAnalysis.ts        # 거래처 심층 분석
│   ├── dealerAnalysis.ts         # 딜러(영업사원) 심층 분석
│   ├── salesRepSummary.ts        # 영업사원별 4개 소스 통합 집계 (B2B종합)
│   ├── salesRepProfile.ts        # 영업사원 1명 상세 프로파일 (sales-rep, 기존 함수 조합)
│   ├── baquerohouse-data.ts      # 바크로하우스 파트너/추천매출 (BigQuery 외부 테이블)
│   ├── changeAttribution.ts      # 변화 요인 분해
│   ├── ytd.ts                    # Year-to-Date 시리즈
│   ├── months.ts                 # 월 목록, 기준월 결정
│   ├── labels.ts                 # 색상/라벨 맵
│   ├── auth.ts                   # Auth.js + Google OAuth
│   └── cn.ts                     # clsx 유틸리티
│
├── components/                   # 재사용 UI 컴포넌트
│   ├── charts/                   # ECharts 래퍼
│   │   ├── ChartBase.tsx         # 차트 공통 wrapper
│   │   ├── LineChart.tsx         # 추이 라인
│   │   ├── BarChart.tsx          # 막대 (수평/수직)
│   │   ├── DonutChart.tsx        # 도넛 (구성비)
│   │   ├── WaterfallChart.tsx    # 워터폴 (변화 요인)
│   │   ├── HeatmapChart.tsx      # 히트맵
│   │   ├── Treemap.tsx           # 트리맵
│   │   └── GaugeChart.tsx        # 게이지 (진행률)
│   ├── ui/                       # shadcn/ui 기본 컴포넌트
│   ├── TabNav.tsx                # 13개 탭 네비게이션 (보고/분석 그룹 구분선·액센트)
│   ├── TabInsights.tsx           # 자동 인사이트 불릿 패널
│   ├── MetricCard.tsx            # KPI 비교 카드
│   ├── DataTable.tsx             # TanStack 정렬/검색 테이블
│   ├── MonthSelect.tsx           # 월 선택 드롭다운
│   ├── MonthSelectLoader.tsx     # MonthSelect 서버 컴포넌트 래퍼
│   ├── LoadingProgress.tsx       # 로딩 프로그레스 바
│   ├── Skeleton.tsx              # 스켈레톤 UI
│   ├── TopProductsTable.tsx      # 상위 제품 공유 테이블
│   ├── CustomerLink.tsx          # 거래처명 → 거래처 분석 링크
│   ├── SalesRepLink.tsx          # 영업사원명 → 영업사원 상세 링크
│   ├── PrintButton.tsx / RefreshButton.tsx  # 인쇄 / 관리자 데이터 새로고침
│   ├── YearToDateChart.tsx       # YTD 누적 스택 차트 (월별 목표·전년 오버레이 + 월별 달성률 라벨)
│   ├── TargetGauge.tsx           # 목표 달성률 게이지
│   └── AnnualProgressCard.tsx    # 연간 목표 진도
│
├── config/
│   ├── mappings.ts               # 채널/브랜드/비즈니스타입 + 링커(LINKERS) 매핑 (단일 소스)
│   └── access.ts                 # 탭 접근 화이트리스트 (B2B종합)
│
├── scripts/
│   ├── check-mappings.ts         # 데이터 품질 검사
│   └── upload-targets.ts         # 목표 BigQuery 업로드
│
├── insights/                     # 월별 사람 코멘트 (선택)
│   └── 2026-04.md
│
├── docs/
│   ├── plan.md                   # 기획안
│   ├── progress.md               # 버전 이력
│   └── architecture.md           # 이 문서
│
├── middleware.ts                 # 인증 미들웨어
├── next.config.ts                # standalone 출력 설정
├── Dockerfile                    # 3단계 빌드 (deps → build → runner)
└── target.csv                    # 목표 CSV (BigQuery에도 업로드됨)
```

---

## 4. 데이터 파이프라인

### 4.1 BigQuery 테이블

| 테이블 | 데이터셋 | 용도 |
|--------|----------|------|
| `매출통계` | `dashboard_1` | 매출 원본 (159k행, 2023-07~현재) |
| `targets` | `dashboard_1` | 채널/브랜드별 월간 목표 |
| `dealer_targets` | `dashboard_1` | 담당자별 월간 목표 |

### 4.2 원본 컬럼 (17개, 영어)

`channel, date, order_number, product_name, product_code, quantity, net_sales, order_amount, discount_amount, commission, shipping_fee, settlement, dealer, client, client_type, cost, brand`

`bigquery-provider.ts`의 `BQ_COL_MAP`에서 한국어로 매핑 후 `parsers.ts`의 `parseRow()`로 정규화.

### 4.3 파생 컬럼 (parseRow에서 생성)

| 컬럼 | 로직 |
|------|------|
| `yearMonth` | 날짜에서 `YYYY-MM` 추출 |
| `category` | 채널 매핑 → `수출` / `B2B` / `면세점` / `B2C` |
| `channelGroup` | 채널 매핑 → `자사 공식몰` / `종합몰` / `소호몰` / `임직원/패밀리` 등 |
| `brandHouse` | 브랜드 매핑 → `자체` / `수입` / `기타` |
| `isNonRevenue` | 실매출 0 또는 비매출 사업형태 |
| `country` | 수출 행: 사업형태에서 국가 추출 |
| `b2bCustomerType` | B2B 행: `병원` / `피부관리실` / `대리점` / `기타` |
| `gp` | `실매출 - 원가` (원가 없으면 null) |

### 4.4 데이터 정제 규칙

| 케이스 | 처리 |
|--------|------|
| 날짜 포맷 혼재 (`2023-12-21`, `2026. 4. 9`) | 정규식 → ISO 변환 |
| 숫자 콤마/공백 | 콤마 제거 후 Number |
| 원가 `#N/A` | null 처리 (GP 계산에서 제외) |
| 실매출 0 행 | 매출 집계 제외, 비매출 출고로 별도 노출 |
| 빈 딜러 | `"미지정"`으로 통일 |

### 4.5 FactCube (인메모리 사전 집계)

컨테이너 시작 시 BigQuery에서 전체 데이터를 1회 쿼리하여 `FactCube`를 빌드하고, 모듈 레벨에서 캐시. 모든 탭이 이 캐시를 공유.

**FactCell 구조**: `revenue, qty, orders(Set), discount, fee, shippingFee, settlement, orderAmount, gpSum, gpRevenueBase, costMissingCount, rowCount`

**1D 인덱스** (월 → 차원값 → FactCell):
- `byMonth`, `byMonthCategory`, `byMonthChannelGroup`, `byMonthChannel`
- `byMonthBrand`, `byMonthBrandHouse`, `byMonthCustomer`, `byMonthDealer`
- `byMonthCountry`, `byMonthB2bType`, `byMonthProduct`, `byMonthDay`
- `byMonthNonRevBizType` (비매출 출고)

**2D 인덱스**:
- `byMonthDealerType` (영업사원 × 거래처유형)
- `byMonthBrandChannelGroup` (브랜드 × 채널그룹)
- `byMonthCountryBrand` (국가 × 브랜드)

**메타 데이터**:
- `monthsAsc` (정렬된 월 목록)
- `customers`, `dealers`, `brands`, `channels`, `countries` (Set)
- `customerToCategory`, `customerToBrand`, `customerToDealer`(전체기간 매출 최대), `customerToLatestDealer`(최신 날짜 — 담당자 이관 반영), `customerToChannel`, `customerToB2bType` (대표값 매핑)

---

## 5. 탭 구성 (13개)

탭은 두 그룹으로 구분 — **보고 그룹**(종합~면세점, 채널·실적 보고)과 **분석 그룹**(브랜드/거래처/심층 분석·비매출 출고). TabNav에서 구분선 + 인디고 액센트로 시각 분리.

| 경로 | 탭명 | 대상 사용자 | 핵심 콘텐츠 |
|------|------|------------|------------|
| `/` | 종합 | 전사 임원 | KPI 4종 + 워터폴 + 거래처 변동 + 비매출 출고 |
| `/targets` | 목표달성 | 임원 | 월/분기/반기/연간 목표 vs 실적 매트릭스 |
| `/export` | 해외영업 | 해외팀 | 국가별 매출 + 국가×브랜드 히트맵 + 12m 추이 |
| `/b2b-summary` | B2B종합 | 영업총괄(화이트리스트) | 영업사원별 직거래처+대리점+링커+바크로하우스 통합 실적 |
| `/b2b` | B2B | 국내영업 | 거래처유형 분해 + 거래처 변동 + 신규/이탈 (거래처 중심) |
| `/agencies` | 대리점 | 대리점관리 | 대리점별 실적 + 브랜드 분해 |
| `/baquerohouse` | 바크로하우스 | 자체채널 | 파트너(거래처)별 추천/일반 매출 + 12m 추이 |
| `/b2c` | B2C | B2C관리 | 채널그룹 분해 + 브랜드 워터폴 + Top 20 제품 |
| `/duty-free` | 면세점 | 면세팀 | 거래처별 매출 + 일별/주차 라인 |
| `/brand` | 브랜드 분석 | 브랜드PM | 24m 추이 + 채널/거래처 분해 + SKU Top 15 |
| `/accounts` | 거래처 분석 | 임원/영업 | 거래처 Deep Dive(담당딜러 강조) + 비교 모드 |
| `/insights` | 심층 분석 | 분석팀 | 데이터 품질 + 거래처 집중도 + 히트맵 + 할인율/수수료 + 신제품/이탈 SKU + 이상치 |
| `/non-revenue` | 비매출 출고 | 운영 | 증정/임직원/마케팅 등 매출 0 출고 (사업형태·거래처·제품 분해) |

> ※ `/sales-rep`(영업사원 상세)은 탭 메뉴에 없는 숨김 페이지 — B2B종합에서 영업사원 이름 클릭으로만 진입(B2B종합과 동일 권한).

### 각 탭 공통 패턴

1. `<TabInsights>` — 상단 자동 인사이트 불릿 (5~7개)
2. KPI 카드 (2~4개) — 현재값 + MoM/QoQ/YoY 비교
3. 차트/테이블 — 차원별 분해
4. Top N 제품 테이블 (해당 탭)

---

## 6. 핵심 라이브러리 모듈

### load.ts — 데이터 로드 API

```
loadFactCube()      → FactCube (캐시된 인메모리 큐브)
loadMonthRows(ym)   → SalesRow[] (한 달치 원본 행)
loadRangeRows(from, to) → SalesRow[] (기간 범위)
loadTargets()       → TargetRow[]
loadDealerTargets() → DealerTargetRow[]
invalidateCache()   → 인메모리 캐시 비움 (관리자 새로고침 버튼 / /api/refresh)
```

### aggregate.ts — KPI 계산

```
kpi(rows)                    → { revenue, orders, aov, qty, settlement, gp, gpMargin }
groupRevenue(rows, keyFn)    → Map<K, number>
topNProductsEnhanced(rows)   → 제품별 매출/수량/YTD
```

### tabInsights.ts — 자동 인사이트

각 탭별 `computeXxxInsights(cube, ym)` 함수가 휴리스틱 규칙으로 한국어 불릿을 생성.

| 임계치 | 값 |
|--------|-----|
| 매출 변화 | ±3% 이상 |
| 차원별 빅 무버 | 절대 차액 ≥500만원 + ±15% |
| 신규/이탈 (대규모) | ≥500만원 |
| 동면 복귀 | ≥300만원 |
| 목표 미달 | <80% |

심각도 우선순위: `critical` > `warn` > `positive` > `info`

### accountAnalysis.ts — 거래처 심층 분석

```
sleepingReturned(cube, ym)   → 직전 3개월 0원 → 이번달 매출 복귀
quarterlyCliff(cube, ym)     → 전분기 상위 30 중 -40% 이상 하락
lostKeyAccounts(cube, ym)    → 전분기 상위 10 → 이번달 0원
topMovers(cube, ym)          → 절대 차액 ≥500만원 상승/하락
```

### dealerAnalysis.ts — 딜러 심층 분석

```
dealerBoard(cube, ym)        → 영업사원별 6m 실적 보드
dealerCustomerChurn(cube, ym) → 영업사원별 신규/이탈 거래처
```

### salesRepSummary.ts — 영업사원별 통합 집계 (B2B종합)

```
repSummaryRows(cube, partnerMap, bhCur, bhPrev, ym, prevYM)
  → 직원별 { direct, agency, linker, bhDirect, bhAgency, total, prevTotal } (링커·대리점·BH는 담당 직원 귀속)
directDealerRows / agencyByManagerRows / linkerRows / bhByRepRows  → 소스별 상세
```

대리점 담당자는 `customerToLatestDealer`(최신 날짜 딜러)로 결정 — 담당자 이관 반영.

### salesRepProfile.ts — 영업사원 1명 상세 (sales-rep)

```
buildSalesRepProfile(cube, rep, ym, prevYM, deps)
  → { summary, dealer(직거래처 deep dive), achievement(월·누적 목표),
      agency, linkers, bh, ytd(월별 실적·목표·전년·누적 달성도) }
```

기존 함수(`repSummaryRows`/`dealerProfile`/`agencyByManagerRows`/`linkerRows`/`bhByRepRows`/`buildDealerAchievements`)만 조합 — raw 스캔 없음. `dealerProfile`은 dealer raw 기준(직거래처·거래처 동향·유형 믹스), salesRepSummary 함수들은 manager 귀속 기준(소스별 합산). B2B종합에서 영업사원 이름 클릭 → `/sales-rep?rep=&month=`(`SalesRepLink`).

---

## 7. KPI 정의

| 지표 | 정의 |
|------|------|
| 실매출 | `net_sales` 합계 (비매출 출고 제외) |
| 주문건수 | unique `order_number` 수 |
| AOV (객단가) | 실매출 / 주문건수 |
| 판매수량 | `quantity` 합계 |
| 정산매출 | `settlement` 합계 |
| GP (매출총이익) | 실매출 - 원가 (원가 null 행 제외) |
| GP율 | GP / GP 계산 가능 행의 실매출 |
| MoM | (당월 - 전월) / 전월 |
| QoQ | (당분기 누적 - 전분기 누적) / 전분기 누적 |
| YoY | (당월 - 전년 동월) / 전년 동월 |

---

## 8. 분류 매핑 요약

모든 매핑은 `config/mappings.ts` 단일 파일에서 관리. 하드코딩 금지.

### 대분류 (4개)

| 대분류 | 채널 |
|--------|------|
| 수출 | `수출` |
| B2B | `B2B몰` |
| 면세점 | `면세점` |
| B2C | 나머지 전부 |

### 브랜드 하우스 (3개)

| 하우스 | 브랜드 |
|--------|--------|
| 자체 | 레노덤, 레노덤 프로페셔널, 헤이우 |
| 수입 | 네오스트라타, 엑스비앙스, 크리스티나 |
| 기타 | 기타 |

### B2C 채널 그룹

| 그룹 | 채널 |
|------|------|
| 자사 공식몰 | 레노덤/엑스비앙스/헤이우 공식몰·스마트스토어, 바크로하우스 |
| 종합몰 | W컨셉, SSG, 쿠팡, 쿠팡 로켓, 쿠팡 그로스, 큐텐, 화해, 에이블리 |
| 소호몰 | 소호몰 |
| 임직원/패밀리 | 바크로패밀리, 헤메코랩 |

### 영업사원 / 링커

영업사원은 (1) **내부 직원**, (2) **링커**(외부 영업사원/회사, 예: Harinbeauty)로 구분. 링커는 매출 `dealer` 필드 및 바크로하우스 `agencyLinker` 필드에 직원과 동일 레벨로 섞여 등장하므로, 링커 명단과 담당 내부 직원 매핑을 `config/mappings.ts`의 `LINKERS`(`isLinker`/`linkerManager`)에서 단일 관리. B2B종합 탭에서 링커·대리점·바크로하우스 매출은 담당 내부 직원에게 귀속.

---

## 9. 인증

- **Auth.js v5** + Google OAuth
- `@baquero.co.kr` 이메일 도메인만 허용
- JWT 세션 (DB 불필요)
- `trustHost: true` (Cloud Run 동적 호스트 허용)
- `middleware.ts`에서 미인증 시 `/login`으로 리다이렉트
- **탭 접근 제한**: `config/access.ts` 화이트리스트 — B2B종합(`/b2b-summary`) 탭은 지정 이메일(9명)만, 그 외 탭은 도메인 전체 공개. 비인가 시 자물쇠 아이콘 + 권한 카드
- **접속 로깅**: `events.signIn`에서 로그인 시 이메일·시각을 구조화 JSON으로 stdout 기록 → Cloud Logging(`jsonPayload.event="login"`). JWT 세션이라 실제 로그인 시점에만 발생
- **관리자 기능**: `config/access.ts`의 `isAdmin`(`ADMIN_EMAILS`) 사용자는 헤더 버튼으로 BigQuery 인메모리 캐시를 무효화(데이터 새로고침). 토큰 보호 엔드포인트 `/api/refresh`(env `REFRESH_TOKEN`)는 미들웨어 예외로 두어 스크립트/자동화에서 호출 가능

---

## 10. 배포

### 인프라

| 항목 | 값 |
|------|-----|
| 서비스명 | `baquero-sales-report` |
| 리전 | `asia-northeast3` (서울) |
| 메모리 | 2GiB |
| 컨테이너 포트 | 3000 |
| GCP 프로젝트 | `citric-lead-457515-v2` |
| URL | `https://baquero-sales-report-koo6cv5uba-du.a.run.app` |

### 배포 흐름

```
git push (main) → Cloud Run 소스 기반 자동 빌드 → Docker 이미지 → 배포
```

### Dockerfile (3단계 빌드)

1. **deps**: `npm ci` (의존성 설치)
2. **builder**: `npm run build` (Next.js standalone 빌드)
3. **runner**: Node 24 alpine + standalone 출력 복사 → `node server.js`

### 환경변수

| 변수 | 소스 | 용도 |
|------|------|------|
| `BQ_PROJECT_ID` | 직접 설정 | BigQuery 프로젝트 |
| `BQ_DATASET` | 직접 설정 | BigQuery 데이터셋 |
| `BQ_TABLE` | 직접 설정 | BigQuery 매출 테이블 |
| `AUTH_URL` | 직접 설정 | Auth.js 콜백 URL |
| `AUTH_SECRET` | Secret Manager | JWT 서명 키 |
| `GOOGLE_CLIENT_ID` | Secret Manager | OAuth 클라이언트 ID |
| `GOOGLE_CLIENT_SECRET` | Secret Manager | OAuth 클라이언트 시크릿 |

---

## 11. 성능 특성

### 콜드 스타트 (인스턴스 0 → 1)

1. 컨테이너 기동: ~1초
2. BigQuery 쿼리 (159k행): ~2초
3. 데이터 정제 (parseRow): ~0.5초
4. FactCube 빌드: ~0.5초
5. 페이지 SSR: ~0.5초
6. **총 ~5초**

### 웜 스타트 (캐시된 인스턴스)

- FactCube 캐시 히트 → 페이지 SSR만 → **~0.5초**

### 최적화 포인트

- `layout.tsx`의 `MonthSelectLoader`를 Suspense로 분리 → 레이아웃 논블로킹
- `LoadingProgress` 컴포넌트로 로딩 중 프로그레스 바 표시
- 각 탭 `loading.tsx`에서 `PageSkeleton` 즉시 표시

---

## 12. 매월 운영 워크플로우

1. BigQuery `매출통계` 테이블에 당월 데이터 업로드
2. (선택) `targets` 테이블 또는 `target.csv` 갱신
3. (선택) `insights/YYYY-MM.md` 사람 코멘트 작성
4. `npm run check` — 데이터 정합성 검사 (미등록 채널/브랜드 확인)
5. `git push` → Cloud Run 자동 배포
6. `?month=YYYY-MM` 접속하여 확인

> 코드 변경 없이 **데이터만 갱신**한 경우 재배포 불필요 — 관리자 새로고침 버튼 또는 `/api/refresh` 호출로 인메모리 캐시만 비우면 즉시 반영(인스턴스가 여러 개면 인스턴스별 캐시이므로 최대 인스턴스 1 권장 또는 재배포로 전체 교체).

---

## 13. 코드 규약

- **매핑**: `config/mappings.ts` 한 곳에서 관리. 하드코딩 금지
- **새 분류**: 코드 수정 전 사용자에게 확인. 임의 "기타" 분류 금지
- **차트**: `components/charts/ChartBase.tsx` wrapper 통과
- **분석 함수**: FactCube 인덱스 직접 사용. raw rows 전체 스캔 금지
- **거래처/딜러 분석**: 전용 모듈(`accountAnalysis.ts`, `dealerAnalysis.ts`)에서 작성
- **인사이트**: `tabInsights.ts`의 휴리스틱 함수. LLM 사용 금지
- **비교 카드**: 양수=녹색▲, 음수=빨강▼, ±2% 이내=회색●
- **숫자 표기**: `formatKRWLong`/`formatKRW`/`formatKRWShort`만 사용. 영문 단위 금지
- **새 페이지**: `loading.tsx` + `<TabInsights>` 필수
