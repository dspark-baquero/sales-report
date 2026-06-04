import "./globals.css";
import { TabNav } from "@/components/TabNav";
import { MonthSelectLoader } from "@/components/MonthSelectLoader";
import { PrintButton } from "@/components/PrintButton";
import { RefreshButton } from "@/components/RefreshButton";
import { Skeleton } from "@/components/Skeleton";
import { auth, signOut } from "@/lib/auth";
import { RESTRICTED_TABS, canAccessTab, isAdmin } from "@/config/access";
import { invalidateCache } from "@/lib/load";
import { revalidatePath } from "next/cache";
import { Suspense } from "react";

export const metadata = {
  title: "바크로 매출 보고서",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session) {
    return (
      <html lang="ko">
        <body className="min-h-screen bg-muted/30">{children}</body>
      </html>
    );
  }

  return (
    <html lang="ko">
      <body className="min-h-screen bg-muted/30">
        <header className="sticky top-0 z-10 bg-background border-b no-print">
          <div className="max-w-[1400px] mx-auto px-6 py-3 flex items-center justify-between">
            <h1 className="text-base font-semibold tracking-tight">
              바크로 매출 보고서
            </h1>
            <div className="flex items-center gap-2">
              <Suspense fallback={<Skeleton className="h-9 w-[140px]" />}>
                <MonthSelectLoader />
              </Suspense>
              <PrintButton />
              {isAdmin(session.user?.email) && (
                <RefreshButton
                  action={async () => {
                    "use server";
                    // 서버에서 권한 재검증 — 액션은 외부 호출 가능한 엔드포인트.
                    const s = await auth();
                    if (!isAdmin(s?.user?.email)) return;
                    invalidateCache();
                    revalidatePath("/", "layout");
                  }}
                />
              )}
              <div className="flex items-center gap-2 ml-2 pl-2 border-l">
                <span className="text-xs text-muted-foreground">
                  {session.user?.name ?? session.user?.email}
                </span>
                <form
                  action={async () => {
                    "use server";
                    await signOut({ redirectTo: "/login" });
                  }}
                >
                  <button
                    type="submit"
                    className="text-xs text-muted-foreground hover:text-foreground transition"
                  >
                    로그아웃
                  </button>
                </form>
              </div>
            </div>
          </div>
          <div className="max-w-[1400px] mx-auto px-6">
            <Suspense fallback={null}>
              <TabNav
                lockedTabs={RESTRICTED_TABS.filter(
                  (t) => !canAccessTab(t, session.user?.email),
                )}
              />
            </Suspense>
          </div>
        </header>
        <main className="max-w-[1400px] mx-auto px-6 py-6">{children}</main>
      </body>
    </html>
  );
}
