import Link from "next/link";
import { isLinker } from "@/config/mappings";

export function salesRepHref(rep: string, ym: string): string {
  return `/sales-rep?rep=${encodeURIComponent(rep)}&month=${ym}`;
}

// 영업사원(내부 직원) 이름 → 상세 페이지 링크.
// 링커명·"미지정"은 영업사원 상세 대상이 아니므로 일반 텍스트로 렌더.
export function SalesRepLink({
  rep,
  ym,
  children,
  className,
}: {
  rep: string;
  ym: string;
  children?: React.ReactNode;
  className?: string;
}) {
  if (!rep || rep === "미지정" || isLinker(rep)) {
    return <span className={className}>{children ?? rep}</span>;
  }
  return (
    <Link
      href={salesRepHref(rep, ym)}
      className={className ?? "hover:underline"}
      title={`${rep} 영업사원 상세 실적 보기`}
    >
      {children ?? rep}
    </Link>
  );
}
