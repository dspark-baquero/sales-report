// B2B몰 거래처(회원) 목록 — Google Sheets 기반 BigQuery 외부 테이블 `members`.
//
// 매출 데이터에는 "판 것"만 남으므로, 가입만 하고 주문이 없거나 거래가 끊긴 거래처는
// 어디에도 드러나지 않는다. 이 목록이 그 공백을 메운다(재영업 대상 식별).
// 조인 키는 `client`(상호명) — 매출 데이터의 거래처명과 그대로 일치한다(B2B몰 96%).
//
// `lib/baquerohouse-data.ts` 패턴 미러: Drive 스코프 필요, 실패 시 available=false로
// graceful degradation(로컬 dev에서 권한이 없어도 앱이 죽지 않는다).

import { BigQuery } from "@google-cloud/bigquery";
import {
  normalizeMemberSalesRep,
  isNonAccountMember,
  UNASSIGNED_REP,
} from "@/config/mappings";

// 재영업 대상은 "활성"만. 나머지는 상태 분포 섹션에서만 집계한다(사용자 확정).
export const MEMBER_STATUSES = [
  "활성",
  "비활성",
  "승인전",
  "삭제",
  "거래중단",
  "기타 일시중지",
  "미결제 일시중지",
  "미분류",
] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

export type Member = {
  memberId: string;
  client: string; // 상호명 — 매출 데이터 거래처명과 조인
  status: MemberStatus;
  salesRep: string;
  grade: string;
  bizType: string; // "프로페셔널 > 직거래처 > 병원"
  bizTypeLeaf: string; // 말단 값만 — "병원". 빈값은 "미입력"(임의로 "기타" 금지)
  region: string;
  joinedAt: string | null; // YYYY-MM-DD
  interestBrands: string[];
  ceoName: string;
};

export type MemberData = {
  members: Member[];
  available: boolean;
};

let cached: MemberData | null = null;

function str(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object" && "value" in (v as Record<string, unknown>))
    return String((v as { value: unknown }).value);
  return String(v);
}

function parseDate(v: unknown): string | null {
  const s = str(v).trim();
  const m1 = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m1) return `${m1[1]}-${m1[2]}-${m1[3]}`;
  const m2 = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (m2) return `${m2[1]}-${m2[2].padStart(2, "0")}-${m2[3].padStart(2, "0")}`;
  const m3 = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m3) return `${m3[1]}-${m3[2]}-${m3[3]}`;
  if (typeof v === "object" && v !== null && "value" in (v as Record<string, unknown>))
    return parseDate((v as { value: unknown }).value);
  return null;
}

function normStatus(v: unknown): MemberStatus {
  const s = str(v).trim();
  return (MEMBER_STATUSES as readonly string[]).includes(s)
    ? (s as MemberStatus)
    : "미분류";
}

// 비-사람 값은 "미지정", 링커는 담당 내부직원으로 귀속 (config/mappings.ts)
function normRep(v: unknown): string {
  return normalizeMemberSalesRep(str(v));
}

// 시트 헤더가 영문/한국어 어느 쪽이어도 읽히도록 두 키를 모두 시도한다.
function pick(r: Record<string, unknown>, en: string, ko: string): unknown {
  return r[en] ?? r[ko];
}

// "프로페셔널 > 직거래처 > 병원" → "병원". 빈값은 "미입력".
function bizTypeLeaf(full: string): string {
  const leaf = full.split(">").pop()?.trim() ?? "";
  return leaf || "미입력";
}

export function toMember(r: Record<string, unknown>): Member {
  const biz = str(pick(r, "biz_type", "사업형태")).trim();
  return {
    memberId: str(pick(r, "member_id", "아이디")).trim(),
    client: str(pick(r, "client", "상호명")).trim(),
    status: normStatus(pick(r, "status", "상태")),
    salesRep: normRep(pick(r, "sales_rep", "영업담당")),
    grade: str(pick(r, "grade", "등급")).trim(),
    bizType: biz,
    bizTypeLeaf: bizTypeLeaf(biz),
    region: str(pick(r, "region1", "주소(지역1)")).trim(),
    joinedAt: parseDate(pick(r, "joined_at", "가입일시")),
    interestBrands: str(pick(r, "interest_brands", "취급브랜드(문의)"))
      .split(",")
      .map((b) => b.trim())
      .filter(Boolean),
    ceoName: str(pick(r, "ceo_name", "대표자명")).trim(),
  };
}

async function ensureLoaded(): Promise<MemberData> {
  if (cached) return cached;

  const projectId = process.env.BQ_PROJECT_ID;
  const dataset = process.env.BQ_MEMBER_DATASET ?? "dashboard_1";
  const table = process.env.BQ_MEMBER_TABLE ?? "members";

  try {
    const bq = new BigQuery({
      ...(projectId ? { projectId } : {}),
      scopes: [
        "https://www.googleapis.com/auth/bigquery",
        // 시트 기반 외부 테이블 조회에 필요
        "https://www.googleapis.com/auth/drive.readonly",
      ],
    });
    const fqDataset = projectId ? `${projectId}.${dataset}` : dataset;
    const [rows] = await bq.query({
      query: `SELECT * FROM \`${fqDataset}.${table}\``,
      maxResults: 50_000,
    });

    const parsed = rows
      .map((r: Record<string, unknown>) => toMember(r))
      .filter((m) => m.client);
    // 행사용 계정 등 실거래처가 아닌 항목은 진입점에서 걸러 모든 집계에서 빠지게 한다.
    const members = parsed.filter((m) => !isNonAccountMember(m.client));
    const excluded = parsed.length - members.length;

    console.log(
      `[members-data] 거래처 ${members.length}개 로드${excluded > 0 ? ` (실거래처 아님 ${excluded}개 제외)` : ""}`,
    );
    cached = { members, available: true };
  } catch (e) {
    console.warn(
      "[members-data] 거래처 목록 조회 실패 (로컬 dev에서는 정상):",
      (e as Error).message,
    );
    cached = { members: [], available: false };
  }
  return cached;
}

export async function loadMembers(): Promise<Member[]> {
  return (await ensureLoaded()).members;
}

export async function isMemberDataAvailable(): Promise<boolean> {
  return (await ensureLoaded()).available;
}

export { UNASSIGNED_REP };

export function invalidateMemberCache(): void {
  cached = null;
}
