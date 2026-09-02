# CLAUDE.md — 바크로 매출 보고서

화장품 회사 바크로(baquero)의 **월별 매출 임원 보고서** 대시보드.

- **기술 스택**: Next.js 16 App Router · React 19 · ECharts · shadcn/ui · Tailwind 4 · Auth.js v5 · BigQuery · Cloud Run
- **문서**: 기획 상세 → `docs/plan.md` · 개발 진행사항 → `docs/progress.md`

---

## 1. 비즈니스 도메인

### 채널 대분류 (3개, 국내만 — 수출 제외)

- **B2B**: 채널 = `B2B몰`. 영업사원(딜러)별 실적 관리. 거래처 유형: 병원 / 피부관리실 / 대리점 / 프랜차이즈
- **면세점**: 채널 = `면세점`. B2C지만 중요도 높아 대분류로 독립
- **B2C**: 위 둘과 수출을 제외한 모든 채널

### 브랜드

- **자체**: 레노덤, 레노덤 프로페셔널, 헤이우
- **수입**: 네오스트라타, 엑스비앙스, 엑스비앙스 프로페셔널, 크리스티나

### B2C 채널 그룹

| 그룹 | 채널 |
|---|---|
| 자사 공식몰 | 레노덤 공식몰/스마트스토어, 엑스비앙스 공식몰/스마트스토어, 헤이우 공식몰, 바크로하우스(+스마트스토어) |
| 종합몰 | W컨셉, SSG, 쿠팡, 쿠팡 로켓, 쿠팡 그로스, 큐텐, 화해, 에이블리, 지그재그 |
| 소호몰 | 소호몰 (사입 후 재판매) |
| 백화점 | 백화점 (오프라인 입점, 2026-08~) |
| 임직원/패밀리 | 바크로패밀리, 헤메코랩 |

---

## 2. 데이터 정책

### 매출 데이터 (BigQuery `sales` 테이블, 영어 컬럼)

`channel, date, order_number, product_name, product_code, quantity, net_sales, order_amount, discount_amount, commission, shipping_fee, settlement, dealer, client, client_type, cost, brand`

`bigquery-provider.ts`의 `BQ_COL_MAP`에서 한국어로 매핑 → `parsers.ts`에서 `SalesRow`로 변환.

### 거래처 회원 목록 (BigQuery `members` 외부 테이블 — Google Sheets)

`member_id, client, status, sales_rep, grade, biz_type, region1, joined_at, interest_brands, ceo_name`

`lib/members-data.ts`가 로드. 매출에 안 잡히는 "가입만 하고 주문 없음 / 거래 끊김"을 채우는 소스로 `/members` 탭에서만 쓴다. 조인 키는 `client`(상호명) — 정규화 없이 그대로 매칭(B2B몰 96% 일치). 괄호 안 지점명은 지우지 말 것(`OO의원(강남)` ≠ `OO의원(분당)`).

- 상태: 활성 / 비활성 / 승인전 / 삭제 / 거래중단 / 기타 일시중지 / 미결제 일시중지
- 실거래처가 아닌 계정(행사·이벤트용 등)은 `config/mappings.ts`의 `NON_ACCOUNT_MEMBERS`에 상호명을 추가하면 `/members` 전 집계에서 빠진다. 매출 데이터는 건드리지 않는다
- 영업담당 정규화는 `config/mappings.ts`의 `normalizeMemberSalesRep` — 빈칸·`비활성 거래처`·`관리자2`는 "미지정", 링커는 담당 직원으로 귀속
- Drive 스코프가 없는 환경(로컬 dev)에서는 `available: false`로 떨어지고 탭이 안내 카드만 렌더한다. 원본 `member.csv`는 PII(이메일·휴대폰·사업자번호) 때문에 커밋 금지(`.gitignore`)

### 정제 규칙 (`lib/parsers.ts`)

| 케이스 | 처리 |
|---|---|
| 날짜 포맷 혼재 | ISO 변환 |
| 숫자 콤마/공백 | 콤마 제거 후 Number |
| 원가 `#N/A` | NaN 처리 (GP 계산에서 제외) |
| 실매출 0 행 | 매출 집계에서 제외, "비매출 출고" 별도 노출 |
| 빈 딜러 | "미지정"으로 통일 |

### 비매출 출고 사업형태

증정 (기타/마케팅/영업) / 임직원 / 직원 / 거래처 직원 / 마케팅용 / 테스트 (수입허가) / 파손제품 / 교육

> **예외**: `임직원`은 **B2B몰 채널 + 실매출>0**일 때만 매출로 집계(정책 #2 참조). 다른 채널의 임직원은 비매출 유지.

---

## 3. 사용자 확정 정책

1. **B2B 영업사원 0원**: 숨김
2. **비매출 출고**: 매출 제외, 별도 카드로 노출. **단, B2B몰 채널의 사업형태 `임직원` 실판매(실매출>0)는 매출로 집계**(2026-07 확정). 그 외 채널의 임직원 및 나머지 비매출 사업형태(증정/직원/마케팅용 등)는 제외. → `lib/parsers.ts` `isNonRev`
3. **수입 브랜드**: 데이터 그대로 노출 (특수 캡션 추가 금지)
4. **인사이트**: 자동 휴리스틱 기본 (LLM 금지). 사람 코멘트는 `insights/YYYY-MM.md` 있을 때만 표시
5. **모든 라벨 한국어**: MoM/QoQ/YoY/AOV 등 영어 약자 화면 노출 금지
6. **비교 표시**: 이번달 절대값 + 비교 절대값 + 차이금액 + 변화율 모두 표시 (변화율 단독 노출 금지)
7. **숫자 표기**: `formatKRWLong` (1억 5,623만원) / `formatKRW` (156,234,000원) / `formatKRWShort` (좁은 공간 전용). 영문 단위(M/B) 금지
8. **목표 달성**: 매칭 데이터 없는 키는 "신규 추진 채널"로 표시 (0% 달성 아님)
9. **거래처 분석**: 단순 Top-N 금지. 동면 복귀 / 분기 절벽 / 상실된 핵심 / 신규 진입 포함. 거래처명 클릭 → `/accounts?customer=XXX&month=YYYY-MM`
10. **바크로하우스 자체매출**: 바크로하우스 몰 매출 중 파트너 추천(`bh_partner_sales`)으로 잡히지 않은 몫은 B2C 자사 공식몰에 `바크로하우스(자체매출)`로 합산(2026-09 확정). 추천분은 영업사원 실적(`/sales-rep`, `/baquerohouse`)으로만 계상. 목표는 `바크로하우스` 키를 그대로 두고 B2C 목표에 더하지 않는다(실적만 포함). → `lib/bhSelfRevenue.ts`
11. **재영업 대상**: `/members` 탭의 재영업 목록은 상태 `활성` + 수출 거래처 제외. `삭제`/`거래중단`/`일시중지`는 상태 분포에서만 집계(2026-09 확정). 우선순위와 등급 S/A/B/C는 과거 누적 매출 기준이며, 등급 임계값은 고정 금액이 아닌 런타임 분위수(상위 5/20/50%). 추정 지표는 화면에 노출하지 않는다. → `lib/memberAnalysis.ts`

---

## 4. 코드 규약

- **매핑**: `config/mappings.ts` 한 곳에. 하드코딩 금지
- **새 분류**: 코드 수정 전 사용자에게 확인. 임의 "기타" 분류 금지
- **차트**: `components/charts/ChartBase.tsx` wrapper 통과. 사전 정의 wrapper 패턴 따라 추가
- **데이터 로드**: 모든 load 함수는 async. BigQuery → FactCube 인메모리 캐시
- **분석 함수**: 큐브 직접 사용 (`await loadFactCube()`). raw rows 전체 스캔 금지. 큐브에 없는 분해는 `loadMonthRows(ym)` 한 달치만 스캔
- **거래처/딜러 분석**: `lib/accountAnalysis.ts`, `lib/dealerAnalysis.ts`에 추가. 회원 목록 결합 분석은 `lib/memberAnalysis.ts`. 페이지에서 직접 분석 로직 작성 금지
- **인사이트**: 모든 탭 상단 `<TabInsights bullets={computeXxxInsights(...)} />`. 함수는 `lib/tabInsights.ts`
- **비교 카드**: 양수=녹색▲, 음수=빨강▼, ±2%이내=회색●
- **라우트**: 새 라우트 추가 시 `loading.tsx` 함께 생성

---

## 5. 체크리스트

- [ ] 매출 집계 시 비매출 출고 제외?
- [ ] B2B 영업사원 0원 숨김?
- [ ] 면세점을 B2C에 합치지 않았는지?
- [ ] 원가 #N/A를 0이 아닌 NaN으로 처리?
- [ ] 새 채널을 임의로 "기타"에 넣지 않았는지?
- [ ] `formatKRWLong`/`formatKRW`/`formatKRWShort`만 사용?
- [ ] 새 분석 함수가 큐브 사용? (raw 전체 스캔 금지)
- [ ] 새 페이지에 `loading.tsx` + `<TabInsights>` 포함?
- [ ] 거래처명에 `/accounts` 링크?
- [ ] 데이터 로드 함수에 `await` 빠뜨리지 않았는지?
