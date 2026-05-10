"use client";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatYM } from "@/lib/format";

type Props = {
  fallback: string;
  available: string[];   // 최신 월부터 (역순 정렬)
};

export function MonthSelect({ fallback, available }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentRaw = searchParams.get("month") ?? fallback;
  const current = available.includes(currentRaw) ? currentRaw : fallback;

  return (
    <Select
      value={current}
      onValueChange={(v) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set("month", v);
        router.push(`${pathname}?${params.toString()}`);
      }}
    >
      <SelectTrigger className="h-9 w-[140px] tabular-nums">
        <SelectValue placeholder="월 선택" />
      </SelectTrigger>
      <SelectContent>
        {available.map((ym) => (
          <SelectItem key={ym} value={ym} className="tabular-nums">
            {formatYM(ym)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
