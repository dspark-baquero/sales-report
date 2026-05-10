import "./globals.css";
import { TabNav } from "@/components/TabNav";
import { MonthSelect } from "@/components/MonthSelect";
import { PrintButton } from "@/components/PrintButton";
import { availableMonths, defaultMonth } from "@/lib/months";
import { Suspense } from "react";

export const metadata = {
  title: "바크로 매출 보고서",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const months = availableMonths().slice().reverse();
  const fallback = defaultMonth();
  return (
    <html lang="ko">
      <body className="min-h-screen bg-muted/30">
        <header className="sticky top-0 z-10 bg-background border-b no-print">
          <div className="max-w-[1400px] mx-auto px-6 py-3 flex items-center justify-between">
            <h1 className="text-base font-semibold tracking-tight">
              바크로 매출 보고서
              <span className="text-xs text-muted-foreground font-normal ml-2">v2 · 임원 대시보드</span>
            </h1>
            <div className="flex items-center gap-2">
              <Suspense fallback={null}>
                <MonthSelect fallback={fallback} available={months} />
              </Suspense>
              <PrintButton />
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
