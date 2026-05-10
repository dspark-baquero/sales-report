"use client";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const OPTIONS = [
  { value: "customer", label: "거래처 단위" },
  { value: "channel", label: "채널 단위" },
  { value: "channelGroup", label: "채널그룹 단위" },
  { value: "category", label: "카테고리 단위" },
  { value: "brand", label: "브랜드 단위" },
  { value: "product", label: "제품 단위" },
  { value: "country", label: "국가 단위 (수출)" },
  { value: "dealer", label: "영업사원 단위 (B2B)" },
];

export function DimSelect({ current }: { current: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return (
    <Select
      value={current}
      onValueChange={(v) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set("dim", v);
        router.push(`${pathname}?${params.toString()}`);
      }}
    >
      <SelectTrigger className="h-9 w-[180px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {OPTIONS.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
