// 탭별 접근 제한 화이트리스트.
// 인원이 적고 자주 바뀌지 않으므로 코드에 직접 관리.
// 인원/이메일 추가는 PR 통해 변경 → git history로 변경 이력 추적.

const B2B_SUMMARY_ALLOWED_EMAILS = new Set<string>([
  "jerrykim@baquero.co.kr",
  "youngkyun91@baquero.co.kr",
  "jerry.jr@baquero.co.kr",
  "dspark@baquero.co.kr",
  "lsy00427@baquero.co.kr",
  "ryunique@baquero.co.kr",
  "seungmin5556@baquero.co.kr",
  "ljh4148@baquero.co.kr",
  "tndus5671@baquero.co.kr",
]);

// B2B종합(영업사원별 통합 실적) 탭 접근 권한.
export function canAccessB2BSummary(email: string | null | undefined): boolean {
  if (!email) return false;
  return B2B_SUMMARY_ALLOWED_EMAILS.has(email.toLowerCase());
}

// 관리자 — BigQuery 데이터 새로고침 등 운영 기능 사용 권한.
const ADMIN_EMAILS = new Set<string>([
  "dspark@baquero.co.kr",
]);

export function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.has(email.toLowerCase());
}

// 탭별 접근 가능 여부 일괄 판정.
// 추후 다른 제한 탭 추가 시 여기에 매핑 추가.
export type RestrictedTab = "/b2b-summary";

export function canAccessTab(tab: RestrictedTab, email: string | null | undefined): boolean {
  switch (tab) {
    case "/b2b-summary":
      return canAccessB2BSummary(email);
  }
}

export const RESTRICTED_TABS: RestrictedTab[] = ["/b2b-summary"];
