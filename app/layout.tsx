import "./globals.css";
import { TabNav } from "@/components/TabNav";
import { MonthSelect } from "@/components/MonthSelect";
import { PrintButton } from "@/components/PrintButton";
import { availableMonths, defaultMonth } from "@/lib/months";
import { auth, signOut } from "@/lib/auth";
import { Suspense } from "react";

export const metadata = {
  title: "바크로 매출 보고서",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const months = (await availableMonths()).slice().reverse();
  const fallback = await defaultMonth();
  const session = await auth();
  return (
    <html lang="ko">
      <body className="min-h-screen bg-muted/30">
        <header className="sticky top-0 z-10 bg-background border-b no-print">
          <div className="max-w-[1400px] mx-auto px-6 py-3 flex items-center justify-between">
            <h1 className="text-base font-semibold tracking-tight">
              바크로 매출 보고서
            </h1>
            <div className="flex items-center gap-2">
              <Suspense fallback={null}>
                <MonthSelect fallback={fallback} available={months} />
              </Suspense>
              <PrintButton />
              {session?.user && (
                <div className="flex items-center gap-2 ml-2 pl-2 border-l">
                  <span className="text-xs text-muted-foreground">
                    {session.user.name ?? session.user.email}
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
              )}
            </div>
          </div>
          <div className="max-w-[1400px] mx-auto px-6">
            <Suspense fallback={null}>
              <TabNav />
            </Suspense>
          </div>
        </header>
        <main className="max-w-[1400px] mx-auto px-6 py-6">{children}</main>
      </body>
    </html>
  );
}
