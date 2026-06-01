import { auth } from "@/lib/auth";
import { canAccessB2BSummary } from "@/config/access";
import { Card, CardContent } from "@/components/ui/card";
import { Lock } from "lucide-react";

export default async function B2BSummaryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const email = session?.user?.email ?? null;

  if (!canAccessB2BSummary(email)) {
    return (
      <div className="flex justify-center py-12">
        <Card className="max-w-md w-full">
          <CardContent className="py-10 px-6 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-muted mb-4">
              <Lock className="h-6 w-6 text-muted-foreground" />
            </div>
            <h2 className="text-base font-semibold mb-1">열람 권한이 없습니다</h2>
            <p className="text-sm text-muted-foreground">
              B2B종합 탭은 지정된 사용자만 열람할 수 있습니다.
              <br />
              접근이 필요하시면 관리자에게 문의해 주세요.
            </p>
            {email && (
              <p className="text-[11px] text-muted-foreground mt-4">
                로그인 계정: {email}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
