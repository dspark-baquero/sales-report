import type { TopProduct } from "@/lib/aggregate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatKRWLong,
  formatInt,
  buildChange,
} from "@/lib/format";

export function TopProductsTable({
  products,
  title,
}: {
  products: TopProduct[];
  title: string;
}) {
  if (products.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="px-4 pb-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] text-muted-foreground border-b">
                <th className="py-2">#</th>
                <th className="py-2">제품</th>
                <th className="py-2 text-right">수량</th>
                <th className="py-2 text-right">이번달</th>
                <th className="py-2 text-right">전월</th>
                <th className="py-2 text-right">변화</th>
                <th className="py-2 text-right">올해 누적</th>
                <th className="py-2 text-right">누적 수량</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p, i) => {
                const ch = buildChange(p.current, p.prev, "전월");
                const cls =
                  ch.direction === "up" || ch.direction === "new"
                    ? "text-emerald-700"
                    : ch.direction === "down" || ch.direction === "lost"
                      ? "text-rose-700"
                      : "text-muted-foreground";
                return (
                  <tr key={p.productName} className="border-b last:border-0">
                    <td className="py-2 text-muted-foreground">{i + 1}</td>
                    <td className="py-2 max-w-[400px] truncate">
                      <span className="text-muted-foreground text-xs mr-1">[{p.brand}]</span>
                      {p.productName}
                    </td>
                    <td className="py-2 text-right tabular-nums">{formatInt(p.qty)}</td>
                    <td className="py-2 text-right tabular-nums">{formatKRWLong(p.current)}</td>
                    <td className="py-2 text-right tabular-nums text-muted-foreground">
                      {p.prev > 0 ? formatKRWLong(p.prev) : "—"}
                    </td>
                    <td className={`py-2 text-right tabular-nums ${cls}`}>
                      <div>{ch.diffText}</div>
                      <div className="text-[10px]">{ch.pctText}</div>
                    </td>
                    <td className="py-2 text-right tabular-nums">{formatKRWLong(p.ytdRevenue)}</td>
                    <td className="py-2 text-right tabular-nums text-muted-foreground">{formatInt(p.ytdQty)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
