import Link from "next/link";

export function customerHref(customer: string, ym: string): string {
  return `/accounts?customer=${encodeURIComponent(customer)}&month=${ym}`;
}

export function CustomerLink({
  customer,
  ym,
  children,
  className,
  title,
}: {
  customer: string;
  ym: string;
  children?: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <Link
      href={customerHref(customer, ym)}
      className={className ?? "hover:underline"}
      title={title ?? `${customer} 거래처 분석 보기`}
    >
      {children ?? customer}
    </Link>
  );
}
