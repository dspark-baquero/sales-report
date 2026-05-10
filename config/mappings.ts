// 채널/브랜드/사업형태 분류 매핑 — 단일 소스
// 새로운 분류가 등장하면 여기에 추가. 코드 다른 곳에 하드코딩 금지.

export type Category = "수출" | "B2B" | "B2C" | "면세점";
export type ChannelGroup =
  | "수출"
  | "B2B"
  | "면세점"
  | "자사 공식몰"
  | "종합몰"
  | "소호몰"
  | "임직원/패밀리"
  | "기타";
export type BrandHouse = "자체" | "수입" | "기타";

// ── 채널 → 채널그룹 / 대분류 ──────────────────────────────
export const CHANNEL_TO_GROUP: Record<string, ChannelGroup> = {
  "수출": "수출",
  "B2B몰": "B2B",
  "면세점": "면세점",

  // 자사 공식몰
  "레노덤 공식몰": "자사 공식몰",
  "레노덤 스마트스토어": "자사 공식몰",
  "엑스비앙스 공식몰": "자사 공식몰",
  "엑스비앙스 스마트스토어": "자사 공식몰",
  "헤이우 공식몰": "자사 공식몰",
  "바크로하우스": "자사 공식몰",
  "바크로하우스 스마트스토어": "자사 공식몰",

  // 종합몰
  "W컨셉": "종합몰",
  "SSG": "종합몰",
  "쿠팡": "종합몰",
  "쿠팡 로켓": "종합몰",
  "쿠팡 그로스": "종합몰",
  "큐텐": "종합몰",
  "화해": "종합몰",

  // 소호몰
  "소호몰": "소호몰",

  // 임직원/패밀리 — B2C로 잡되 별도 그룹
  "바크로패밀리": "임직원/패밀리",
  "헤메코랩": "임직원/패밀리",
};

export function channelGroup(channel: string): ChannelGroup {
  return CHANNEL_TO_GROUP[channel] ?? "기타";
}

export function category(channel: string): Category {
  if (channel === "수출") return "수출";
  if (channel === "B2B몰") return "B2B";
  if (channel === "면세점") return "면세점";
  return "B2C";
}

// ── 브랜드 → 하우스 ────────────────────────────────────
export const BRAND_TO_HOUSE: Record<string, BrandHouse> = {
  "레노덤": "자체",
  "레노덤 프로페셔널": "자체",
  "헤이우": "자체",
  "네오스트라타": "수입",
  "엑스비앙스": "수입",
  "크리스티나": "수입",
  "기타": "기타",
};

export function brandHouse(brand: string): BrandHouse {
  return BRAND_TO_HOUSE[brand] ?? "기타";
}

// 브랜드 → 자사 공식몰 채널 목록 (브랜드별 공식몰 추이용)
export const BRAND_OFFICIAL_CHANNELS: Record<string, string[]> = {
  "레노덤": ["레노덤 공식몰", "레노덤 스마트스토어"],
  "엑스비앙스": ["엑스비앙스 공식몰", "엑스비앙스 스마트스토어"],
  "헤이우": ["헤이우 공식몰"],
  "바크로하우스": ["바크로하우스", "바크로하우스 스마트스토어"],
};

// ── 사업형태: 비매출 출고 분류 ─────────────────────────────
const NON_REVENUE_BIZ_TYPES = new Set<string>([
  "증정 (기타)",
  "증정 (마케팅)",
  "증정 (영업)",
  "임직원",
  "직원",
  "거래처 직원",
  "마케팅용",
  "테스트 (수입허가)",
  "파손제품",
  "교육",
]);

export function isNonRevenueBiz(bizType: string): boolean {
  return NON_REVENUE_BIZ_TYPES.has(bizType);
}

// ── 수출 국가 추출 ────────────────────────────────────
// 거래처 사업형태 컬럼이 "해외 (베트남)" / "수출 (유럽)" 같은 패턴.
// 미매칭("해외 (기타)", "수출 (기타)" 등)은 "기타"로 통일.
export function extractCountry(bizType: string): string {
  const m = bizType.match(/^(?:해외|수출)\s*\(([^)]+)\)\s*$/);
  if (!m) return "기타";
  const inner = m[1].trim();
  if (inner === "기타") return "기타";
  return inner;
}

// ── B2B 거래처유형 정규화 ─────────────────────────────────
// 표시할 때 "병원"/"피부관리실"/"대리점"/"프랜차이즈"/"기타"로 묶음
export function b2bCustomerType(bizType: string): string {
  if (bizType.startsWith("병원")) {
    if (bizType.includes("프랜차이즈")) return "병원(프랜차이즈)";
    if (bizType.includes("대리점")) return "병원(대리점)";
    return "병원";
  }
  if (bizType.startsWith("피부관리실")) {
    if (bizType.includes("프렌차이즈") || bizType.includes("프랜차이즈"))
      return "피부관리실(프랜차이즈)";
    if (bizType.includes("대리점")) return "피부관리실(대리점)";
    return "피부관리실";
  }
  if (bizType === "대리점" || bizType.includes("대리점")) return "대리점";
  return "기타";
}

// ── 알려진 모든 키 (검증 스크립트용) ──────────────────────
export const KNOWN_CHANNELS = new Set(Object.keys(CHANNEL_TO_GROUP));
export const KNOWN_BRANDS = new Set(Object.keys(BRAND_TO_HOUSE));
