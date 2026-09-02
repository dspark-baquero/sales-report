import { NextRequest, NextResponse } from "next/server";
import { invalidateCache } from "@/lib/load";
import { invalidateMemberCache } from "@/lib/members-data";

// 항상 동적 실행 — 응답을 캐시하지 않는다.
export const dynamic = "force-dynamic";

/**
 * 데이터 갱신용 캐시 무효화 엔드포인트.
 *
 * BigQuery 데이터를 업데이트한 뒤 한 번 호출하면 서버 인메모리 캐시(FactCube)를
 * 비운다. 다음 요청부터 BigQuery에서 다시 로드한다.
 *
 * 인증: REFRESH_TOKEN 환경변수와 일치하는 토큰 필요.
 *   - 헤더:  Authorization: Bearer <REFRESH_TOKEN>
 *   - 또는:  ?token=<REFRESH_TOKEN>
 *
 * 예) curl -X POST "https://<host>/api/refresh?token=<REFRESH_TOKEN>"
 */
function tokenOk(req: NextRequest): boolean {
  const expected = process.env.REFRESH_TOKEN;
  if (!expected) return false; // 토큰 미설정 시 비활성(차단)

  const authHeader = req.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : null;
  const provided = bearer ?? req.nextUrl.searchParams.get("token");

  return provided != null && provided === expected;
}

function handle(req: NextRequest): NextResponse {
  if (!tokenOk(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  invalidateCache();
  // 회원 상태값은 재영업 목록의 핵심 필터라 시트를 고치면 바로 반영돼야 한다.
  invalidateMemberCache();
  return NextResponse.json({
    ok: true,
    message: "캐시를 비웠습니다. 다음 요청 시 BigQuery에서 다시 로드합니다.",
    at: new Date().toISOString(),
  });
}

export function POST(req: NextRequest) {
  return handle(req);
}

// 브라우저 주소창에서도 호출할 수 있도록 GET 허용.
export function GET(req: NextRequest) {
  return handle(req);
}
