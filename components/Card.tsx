// Backward-compat wrapper. 새로운 코드는 components/ui/card.tsx의 Card/CardHeader/CardContent 직접 사용.
import { Card as UICard, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/cn";

export function Card({
  title,
  hint,
  children,
  className,
}: {
  title?: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <UICard className={cn("avoid-break", className)}>
      {(title || hint) && (
        <CardHeader className="pb-1">
          <div className="flex items-baseline justify-between">
            {title && <CardTitle>{title}</CardTitle>}
            {hint && <span className="text-[11px] text-muted-foreground tabular-nums">{hint}</span>}
          </div>
        </CardHeader>
      )}
      <CardContent className={title || hint ? "pt-0" : ""}>{children}</CardContent>
    </UICard>
  );
}
