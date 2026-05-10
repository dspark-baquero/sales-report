# CLAUDE.md — 바크로 매출 보고서 프로젝트 가이드 (v3)

이 문서는 이 저장소에서 작업하는 Claude(또는 다른 작업자)가 따라야 할 **프로젝트 기본 정책**과 **매월 운영 워크플로우**를 정의합니다. 자세한 화면/지표 기획은 `plan.md`를 참고하세요.

---

## 1. 프로젝트 개요

- **목적**: 화장품 회사 바크로(baquero)의 **월별 매출 임원 보고서**. 매달 1회 보고.
- **결과물**: 로컬 실행 Next.js 웹 대시보드 (`npm run dev` → http://localhost:3000)
- **입력 데이터**: 루트의 `sales.csv` (월별 매출 raw) + `target.csv` (월별 목표). 매달 덮어씀.
- **배포 없음**: 로컬에서만 실행. 임원 회람은 브라우저 PDF 인쇄 또는 `npm run snapshot`으로 단일 HTML 추출.
- **기술 스택**: Next.js 15 App Router · React 19 · Apache ECharts (echarts-for-react) · shadcn/ui (Radix) · TanStack Table · Tailwind 3 · Server Components 집계 · PapaParse · Marked.

### v3 핵심 변화 (vs v2)
- **거래처/딜러 심층 분석** — 신규 `/accounts` 탭 + 거래처 비교 모드 + 동면 복귀 / 분기 절벽 / 상실된 핵심 거래처 자동 감지. B2B 탭에 영업사원 6개월 sparkline + 신규/이탈 거래처.
- **탭별 자동 인사이트** — 모든 탭 상단에 휴리스틱 기반 한국어 불릿 (예: "네이버 스마트스토어 +150%", "베트남 신규 수출"). LLM 없음.
- **`/insights` 탭 재포지셔닝** — "심층 분석" 으로 개명. 분기 절벽/동면 복귀/핵심 이탈/신규 진입 표 + 기존 SKU/요일/HHI/할인율 + 사람 코멘트(있을 때만 하단).
- **구조적 성능 — 팩트 큐브** — `lib/facts.ts` 가 CSV 로드 시 모든 차원 사전 집계. 신규 분석은 raw rows 재집계 0회.
- **모든 라우트 `loading.tsx`** — 탭 전환 즉시 스켈레톤 노출.

---

## 2. 비즈니스 도메인 (작업 시 반드시 이해하고 시작)

### 2.1 채널 대분류 (4개)

- **수출**: 채널 = `수출`. 해외영업팀 소관. 국가별로 본다.
- **B2B**: 채널 = `B2B몰`. 국내영업팀 소관. 관리용 화장품(전문가용)이 대부분.
  - 거래처 유형: 병원 / 피부관리실 / 대리점 / 프랜차이즈 등
  - 영업사원(딜러)별 실적이 핵심
- **면세점**: 채널 = `면세점`. **B2C 안의 한 종류지만 중요도가 높아 대분류로 독립**.
- **B2C**: 위 셋을 제외한 모든 채널. 일반 소비자 대상.

### 2.2 브랜드

- **자체 브랜드**: 레노덤, 레노덤 프로페셔널, 헤이우
- **수입 브랜드**: 네오스트라타, 엑스비앙스, 크리스티나
- **기타**: 도구류·리플렛 등 (매출 0이 대부분)

### 2.3 B2C 채널 그룹

| 그룹 | 채널 |
|---|---|
| 자사 공식몰 | 레노덤 공식몰/스마트스토어, 엑스비앙스 공식몰/스마트스토어, 헤이우 공식몰, 바크로하우스(+스마트스토어) |
| 종합몰 | W컨셉, SSG, 쿠팡, 쿠팡 로켓, 쿠팡 그로스, 큐텐, 화해 |
| 소호몰 | 소호몰 (사입 후 재판매하는 파트너) |
| 임직원/패밀리 | 바크로패밀리, 헤메코랩 |

### 2.4 브랜드 ↔ 자사 공식몰 매핑

- 레노덤 → `레노덤 공식몰` + `레노덤 스마트스토어`
- 엑스비앙스 → `엑스비앙스 공식몰` + `엑스비앙스 스마트스토어`
- 헤이우 → `헤이우 공식몰` (스마트스토어 없음)
- 바크로하우스 → `바크로하우스` + `바크로하우스 스마트스토어` (다브랜드 자사몰)

### 2.5 수출 국가 추출

`거래처 사업형태` 컬럼의 `해외 (XXX)` / `수출 (XXX)` 패턴에서 괄호 안 추출. 미매칭(`해외 (기타)` 등)은 **"기타"**.

---

## 3. 데이터 정책

### 3.1 sales.csv 컬럼 (17개, 순서 고정)

`채널, 날짜, 주문번호, 제품명, 품목코드, 판매수량, 실 매출, 주문금액, 할인금액, 수수료, 배송비, 정산금액, 딜러, 거래처, 거래처 사업형태, 원가, 브랜드`

### 3.2 정제 규칙 (`lib/load.ts`에서 일괄 처리)

| 케이스 | 처리 |
|---|---|
| 날짜 포맷 혼재 (`2023-12-21`, `2026. 4. 9`) | ISO 변환 |
| 숫자 콤마/공백 (`11,400`) | 콤마 제거 후 Number |
| 원가 `#N/A` | NaN 처리. 마진 KPI에서 제외하고 데이터 품질 배지로 비율 노출 |
| 실매출 0 행 | **매출 집계에서 제외**, 별도 "비매출 출고" 카드로 분리 |
| 빈 딜러 | "미지정"으로 통일 |

### 3.3 비매출 출고 (집계에서 빼되 별도 가시화)

다음 거래처 사업형태는 **비매출**로 분류해 매출 집계에서 빼고, "비매출 출고" 섹션에서 수량·원가만 보여줌:

증정 (기타) / 증정 (마케팅) / 증정 (영업) / 임직원 / 직원 / 거래처 직원 / 마케팅용 / 테스트 (수입허가) / 파손제품 / 교육

---

## 4. 사용자 확정 정책

매번 작업 시작 전 반드시 확인:

1. **B2B 영업사원 0원**: **숨김**. 이번달 매출 0인 영업사원은 실적 보드에서 제외.
2. **비매출 출고**: 매출에서 제외하되 별도 카드/탭으로 노출.
3. **수입 브랜드**: 데이터 그대로 노출. 환율·원가 변동 캡션 같은 거 추가하지 말 것.
4. **인사이트는 자동이 기본**: 각 탭 상단에 휴리스틱 자동 인사이트가 항상 노출. 사람 코멘트는 **선택** — `insights/YYYY-MM.md` 파일이 있을 때만 `/insights` 페이지 하단에 마크다운으로 렌더. 자동 인사이트는 LLM 사용 금지, `lib/tabInsights.ts` 의 결정적 휴리스틱.
5. **모든 라벨은 한국어**: MoM/QoQ/YoY/HHI/AOV/SKU 같은 영어 약자 사용 금지. 코드/주석은 영어 가능, 화면 텍스트는 모두 한국어.
6. **비교 표시 규약**: 변화율(`+10%`)만 단독 노출 금지. 반드시 이번달 절대값 + 비교 절대값 + 차이금액 + 변화율을 같이 표시.
   - 예: `1억 1,000만원 / 전월 1억 / +1,000만원 (+10.0%)`
7. **숫자 표기**:
   - 전체: 항상 3자리 콤마 (`156,234,000원`)
   - 풀어쓰기: `1억 5,623만원` 형식 (만원 단위 절삭, 0이면 생략 → `1억원`)
   - `formatM`처럼 영문 단위(M/B) 절대 사용 금지 → `formatKRW` / `formatKRWLong` / `formatKRWShort` 만 사용.
8. **target.csv 통합**: 이번달 (브랜드 × 구분 × 거래처) 단위 목표 vs 실적 매트릭스. 달성률은 핵심지표 카드에 표시.
   - 매칭 sales 데이터가 없는 키 (올리브영/링커/바크로하우스 대리점/직거래처)는 "신규 추진 채널"로 별도 표시. 0% 달성이 아니라 "추진 중"으로.
9. **거래처/딜러 분석 깊이**: 단순 Top-N으로 끝내지 말 것. 동면 복귀 / 분기 절벽 / 상실된 핵심 거래처 / 신규 진입 같은 임원 시각의 질문에 답하도록 `lib/accountAnalysis.ts`, `lib/dealerAnalysis.ts` 의 헬퍼를 활용. 거래처명은 어디서든 클릭 시 `/accounts?customer=XXX&month=YYYY-MM` 으로 이동.

---

## 5. 화면 구조 (탭 10개, v3)

자세한 사양은 `plan.md` §5를 참조.

1. **종합** — 자동 인사이트 + 4핵심지표 + 변화 요인 워터폴 + 일별 누적 + 12개월 카테고리 스택 + 상위 10 거래처/제품 + **거래처 변동 하이라이트** (Top 무버/동면 복귀/분기 절벽/상실된 핵심) + 비매출 출고
2. **목표 달성** — 자동 인사이트 + 이번달·분기 게이지 / 미달 워닝 / 초과 달성 / 신규 추진 / 매트릭스 표
3. **수출** — 자동 인사이트 + 국가별 (목표 달성률 포함) + 12개월 + 국가×브랜드 + 변화 요인
4. **B2B** — 자동 인사이트 + 영업사원 보드 + **딜러 심층 (6개월 sparkline + 분기 비교 + 신규/이탈 거래처)** + 거래처 유형별 + 매트릭스 + 신규/이탈 + 변화 요인
5. **B2C** — 자동 인사이트 + 채널그룹별 + 자사 공식몰 12개월 + 종합몰 표 + 브랜드 분해 + 변화 요인
6. **면세점** — 자동 인사이트 + 12개월 (전년 점선) + 거래처별 + 브랜드 + 일별/주차별 + 변화 요인
7. **브랜드 분석** — 자동 인사이트 + 브랜드 1개 선택 → 24개월 추이 + 트리맵 + 신규/단종 SKU + 변화 요인
8. **거래처 분석** *(v3 신규)* — 자동 인사이트 + 거래처 1곳(또는 2곳 비교) 선택 → 24개월 추이 + 분기/연간 비교 + 브랜드/채널 분해 + Top 10 제품 + 신규/이탈 SKU
9. **변동 분석** — 자동 인사이트 + 차원 토글(거래처/채널/브랜드/제품/국가) + 신규/이탈 거래처 + 신제품 효과 + 이상치
10. **심층 분석** *(구 인사이트, v3 재포지셔닝)* — 분기 절벽/동면 복귀/상실된 핵심/신규 진입 표 + 신제품·이탈 SKU + 요일 패턴 + 거래처 집중도 + 브랜드×채널그룹 히트맵 + 할인/수수료율 + 데이터 품질 + (선택) 사람 코멘트

매 탭 상단에 자동 인사이트 → 비교 카드 순. 비교는 절대값 + 차이금액 + 변화율을 모두 표시.

---

## 6. 매월 보고 워크플로우

매달 1회, 다음 4단계로 보고서를 갱신합니다.

### Step 1. 데이터 교체

```bash
# 신규 매출 raw 데이터로 sales.csv 덮어쓰기
# (영업관리 시스템에서 export → 컬럼 17개 순서 일치 확인)
```

### Step 2. 자동 검증

```bash
npm run check
```

확인 항목:
- 매핑 미등록 채널 (예: 새로 생긴 종합몰)
- 매핑 미등록 브랜드
- 매핑 미등록 사업형태 (수출 신규 국가 등)
- 데이터 품질: 원가 #N/A 비율, 실매출 0 행 비율

미등록 항목이 있으면 `config/mappings.ts`에 추가하고 다시 실행.

### Step 3. (선택) 사람 코멘트 작성

자동 인사이트로 충분하지 않은 맥락(특이 발주, 영업 액션포인트, 다음달 전망 등)이 있을 때만:

```bash
# insights/2026-05.md 같은 파일을 만들고 마크다운으로 작성
```

파일이 없으면 `/insights` 페이지에 자동 분석만 노출.

### Step 4. 보고서 출력

```bash
npm run dev
# 브라우저에서 http://localhost:3000?month=2026-05
# 인쇄 → PDF 저장
```

또는 단일 HTML 스냅샷:

```bash
npm run snapshot -- 2026-05
```

---

## 7. 코드 작업 시 지켜야 할 규칙

### 7.1 매핑은 한 곳에

채널·브랜드·사업형태·국가 매핑은 모두 `config/mappings.ts` 한 파일에. 코드 다른 곳에 하드코딩 금지.

### 7.2 새로운 분류가 생기면

코드를 수정하기 전에 **사용자에게 분류를 확인**할 것. 임의로 "기타"에 넣고 끝내지 말 것 (특히 새 종합몰·새 수출국).

### 7.3 한국어 컬럼명 처리

CSV 컬럼명은 한국어. UTF-8 BOM이 있을 수 있음. PapaParse + `header: true` + 컬럼명 trim 필수.

### 7.4 숫자 단위

`formatKRWLong`(풀어쓰기, 예: `1억 5,623만원`) 또는 `formatKRW`(정확값, 예: `156,234,000원`)만 사용. `formatKRWShort`는 차트 축 라벨/배지 등 좁은 공간 전용. 영문 단위(M/B) 절대 금지.

### 7.5 비교 카드 시각 규약

- 양수 = 녹색 ▲, 음수 = 빨강 ▼, ±2% 이내 = 회색 ●
- 모든 비교 카드는 **이번달 절대값 + 비교 라벨(전월/전분기 동기간/전년 동월) + 비교 절대값 + 차이금액 + 변화율** 표시.
- 비교 데이터 없음 → "신규" 또는 "—".

### 7.6 차트 라이브러리

- **Apache ECharts** (echarts-for-react). `components/charts/ChartBase.tsx`가 ssr:false dynamic import + 한국어 폰트/툴팁 기본값을 제공. 모든 차트는 이 wrapper 통과.
- 사전 정의 wrapper: `BarChart`, `LineChart`, `HeatmapChart`, `WaterfallChart`, `GaugeChart`, `Treemap`, `DonutChart`. 새 차트 만들 때는 이 패턴 따라 추가.
- shadcn/ui (Radix 기반) UI primitives는 `components/ui/`에. 카드/배지/탭/셀렉트/표 등 공통.

### 7.7 데이터 로드 + 팩트 큐브

- `sales.csv`는 한 번 읽고 메모리 캐시 (`lib/load.ts`, mtime 기반 무효화).
- 동시에 `lib/facts.ts:buildFactCube()` 가 모든 차원의 월별 사전 집계 셀(`Map<ym, Map<dim, FactCell>>`) 을 빌드. 모듈 캐시.
- **새 분석/인사이트 함수는 큐브 직접 사용** — `loadFactCube()` → `cubeMonthCustomerCells(ym)`, `cubeBrandSeries(brand, fromYM, toYM)` 등. raw rows 재집계 금지.
- 큐브 인덱스: byMonth / byMonthCategory / byMonthChannelGroup / byMonthChannel / byMonthBrand / byMonthBrandHouse / byMonthCustomer / byMonthDealer / byMonthCountry / byMonthB2bType + 2D (DealerType / BrandChannelGroup / CountryBrand) + 제품 / 일별 / 비매출 + 메타 (customers/dealers/brands set, customer→category/brand/dealer 대표값).
- 큐브에 인덱스가 없는 분해(예: 거래처×제품)는 `filterMonth(rows, ym).filter(r => r.customer === X)` 한 달치 raw 한 번 스캔으로 처리. 전체 raw 스캔은 절대 금지.

### 7.8 자동 인사이트 (TabInsights)

- 모든 페이지 상단에 `<TabInsights bullets={computeXxxInsights(cube, ym, ...)} />` 한 줄로 삽입.
- 컴퓨터 함수는 `lib/tabInsights.ts` 의 `computeOverviewInsights` / `computeB2CInsights` / `computeB2BInsights` / `computeExportInsights` / `computeDutyFreeInsights` / `computeBrandInsights` / `computeChangesInsights` / `computeTargetsInsights` / `computeAccountsInsights`.
- 휴리스틱: 전체 ±5%, 차원별 ±15~20% 또는 ±5% 매출 변동, 신규/이탈, 목표 ±20%, 빅 무버 등. 임계치 미만은 노이즈로 버림.
- 각 불릿은 `severity` (critical/warn/positive/info) + `category` 칩 + 본문 + (선택) `href` (거래처명 클릭 시 `/accounts` 이동). 한 탭 5~7개 한도.

### 7.9 거래처/딜러 분석 헬퍼

- `lib/accountAnalysis.ts` — `customerTrend`, `customerQuarterCompare`, `customerYtdCompare`, `sleepingReturned`, `quarterlyCliff`, `lostKeyAccounts`, `topMovers`, `newAccounts`, `customerProfile`, `listCustomersRanked`.
- `lib/dealerAnalysis.ts` — `dealerTrend`, `dealerBoard`, `dealerCustomerChurn`, `dealerQuarterCompare`, `dealerProfile`.
- 새 거래처/딜러 분석은 이 두 파일에 추가. 페이지에서 직접 raw rows를 풀어 분석 로직을 작성하지 말 것.

### 7.10 라우트 전환 UX

- 모든 `app/*/` 라우트에 `loading.tsx` 가 있어야 함 (`<PageSkeleton />`). 새 라우트 추가 시 함께 생성.

---

## 8. 디렉토리 구조 (요약)

```
sales-report/
├── sales.csv                  # 매월 교체
├── target.csv                 # 매월 (또는 분기) 목표 갱신
├── plan.md                    # 상세 기획안
├── CLAUDE.md                  # 본 문서
├── insights/YYYY-MM.md        # (선택) 사람이 작성하는 월별 코멘트
├── config/mappings.ts         # 모든 분류 매핑 (단일 소스)
├── lib/                       # 데이터 파이프라인
│   ├── load.ts                # sales.csv 파서 + 캐시 + 큐브 빌드 트리거
│   ├── facts.ts               # 월별 차원별 사전 집계 큐브 (v3)
│   ├── targets.ts             # target.csv 파서 + 매칭 규칙
│   ├── changeAttribution.ts   # 변화 요인 분석 (워터폴)
│   ├── format.ts              # 한국식 숫자 포맷
│   ├── labels.ts              # 한국어 라벨 상수
│   ├── aggregate.ts           # KPI/그룹 집계
│   ├── compare.ts             # 전월/전분기/전년 헬퍼
│   ├── dimensions.ts          # 탭별 차원 집계
│   ├── insights.ts            # 심층 분석 페이지의 자동 통계 (구 v2 인사이트)
│   ├── accountAnalysis.ts     # 거래처 심층 분석 (v3)
│   ├── dealerAnalysis.ts      # 딜러 심층 분석 (v3)
│   ├── tabInsights.ts         # 탭 상단 자동 인사이트 휴리스틱 (v3)
│   └── months.ts              # 월 목록 / 기이번달
├── app/                       # 페이지 (10탭)
│   ├── page.tsx (종합) / targets / export / b2b / b2c
│   ├── duty-free / brand / accounts (v3) / changes / insights
│   └── */loading.tsx          # 라우트별 스켈레톤 (v3)
├── components/
│   ├── ui/                    # shadcn primitives (card, badge, tabs, ...)
│   ├── charts/                # ECharts wrapper들
│   ├── MetricCard / TargetGauge / ChangeBreakdown / DataTable
│   ├── MonthSelect / BrandSelect / TabNav / PrintButton
│   ├── TabInsights (v3)       # 탭 상단 자동 인사이트 카드
│   ├── AccountHighlights (v3) # 거래처 변동 하이라이트 묶음 (종합/B2B용)
│   ├── CustomerSelect (v3)    # 거래처 검색형 셀렉터
│   └── Skeleton (v3)          # PageSkeleton/ChartSkeleton/TableSkeleton
└── scripts/                   # check-mappings (target 매칭 점검 포함)
```

---

## 9. 자주 하는 실수 체크리스트

- [ ] 매출 집계 시 비매출 출고 제외했나?
- [ ] B2B 영업사원 0원 사원 숨겼나?
- [ ] 면세점을 B2C에 다시 합치지 않았나?
- [ ] 원가 #N/A를 0으로 처리하지 않았나? (NaN으로 처리하고 GP 계산에서 제외)
- [ ] YoY 비교 시 전년 동월이 데이터에 있는지 확인했나? (없으면 "신규")
- [ ] 새 채널을 임의로 "기타"에 넣지 않았나?
- [ ] 화면 단위가 백만원으로 일관되어 있나? (`formatKRWLong`/`formatKRW`/`formatKRWShort` 만 사용)
- [ ] 새 분석 함수가 raw rows 전체 스캔을 하고 있지 않나? (큐브 사용)
- [ ] 새 페이지 추가 시 `loading.tsx` 만들었나?
- [ ] 새 탭에 `<TabInsights bullets={...} />` 상단 삽입했나?
- [ ] 거래처명을 표시할 때 `/accounts?customer=XXX&month=YYYY-MM` 링크 걸었나?

---

## 10. 참고

- 기획 상세: `plan.md`
- 데이터 기간: 2023-07 ~ 현재 (매월 갱신)
- 첫 보고 기준월: **2026-04**
- v3 변경 커밋: `4a20046` (거래처/딜러 심층 + 탭 자동 인사이트 + 팩트 큐브)
