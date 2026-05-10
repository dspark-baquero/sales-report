// 모든 화면 라벨을 한국어로 통일. 영어 약자(MoM/QoQ/YoY/HHI/AOV/SKU/MoM 등) 사용 금지.

export const COMPARE_LABEL = {
  prevMonth: "전월",
  prevQuarter: "전분기 동기간",
  prevYear: "전년 동월",
  prevYearQuarter: "전년 동분기",
  curQuarter: "본분기 누적",
} as const;

export const METRIC_LABEL = {
  revenue: "실매출",
  settlement: "정산매출",
  qty: "판매수량",
  orderCount: "주문건수",
  aov: "객단가",
  gp: "매출총이익",
  gpMargin: "매출총이익률",
  discount: "할인율",
  fee: "수수료율",
  hhi: "거래처 집중지수",
  achievement: "목표 달성률",
  target: "목표",
  actual: "실적",
} as const;

export const CATEGORY_LABEL = {
  수출: "수출",
  B2B: "B2B (전문가용)",
  B2C: "B2C",
  면세점: "면세점",
} as const;

export const TAB_LABEL = {
  home: "종합",
  targets: "목표 달성",
  export: "수출",
  b2b: "B2B",
  b2c: "B2C",
  duty: "면세점",
  brand: "브랜드 분석",
  changes: "변동 분석",
  insights: "인사이트",
} as const;

// 변화 분류 라벨 (ChangeContribution.type)
export const CHANGE_TYPE_LABEL = {
  신규: "신규",
  이탈: "이탈",
  증가: "증가",
  감소: "감소",
  유지: "유지",
} as const;

// 달성률 상태 → 한국어
export const ACHIEVEMENT_STATUS_LABEL = {
  "no-target": "목표 미설정",
  underperform: "심각 미달",
  ontrack: "정상 진행",
  near: "근접 달성",
  overperform: "초과 달성",
} as const;

// HSL 토큰 매핑 (시각 규약)
export const STATUS_COLOR = {
  positive: "text-emerald-600",
  negative: "text-rose-600",
  neutral: "text-neutral-500",
  warn: "text-amber-600",
  highlight: "text-violet-600",
  underperform: "bg-rose-50 text-rose-700 border-rose-200",
  ontrack: "bg-amber-50 text-amber-700 border-amber-200",
  near: "bg-emerald-50 text-emerald-700 border-emerald-200",
  overperform: "bg-emerald-100 text-emerald-800 border-emerald-300",
  noTarget: "bg-neutral-50 text-neutral-500 border-neutral-200",
} as const;

// 차트 공통 색상 (브랜드/카테고리)
export const BRAND_COLOR: Record<string, string> = {
  레노덤: "#10b981",
  "레노덤 프로페셔널": "#059669",
  헤이우: "#f97316",
  엑스비앙스: "#8b5cf6",
  네오스트라타: "#3b82f6",
  크리스티나: "#ec4899",
  기타: "#9ca3af",
};

export const CATEGORY_COLOR: Record<string, string> = {
  수출: "#0ea5e9",
  B2B: "#8b5cf6",
  B2C: "#10b981",
  면세점: "#f59e0b",
};

export const CHANNEL_GROUP_COLOR: Record<string, string> = {
  수출: "#0ea5e9",
  B2B: "#8b5cf6",
  면세점: "#f59e0b",
  "자사 공식몰": "#10b981",
  종합몰: "#3b82f6",
  소호몰: "#f59e0b",
  "임직원/패밀리": "#9ca3af",
  기타: "#737373",
};

// 차원 → 한국어 라벨 (변동 분석 탭)
export const DIM_LABEL = {
  customer: "거래처",
  brand: "브랜드",
  channel: "채널",
  channelGroup: "채널그룹",
  category: "대분류",
  product: "제품",
  country: "국가",
  dealer: "영업사원",
  customerType: "거래처 유형",
} as const;
