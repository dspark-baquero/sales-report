import Link from "next/link";

export function productHref(productName: string, ym: string): string {
  return `/products?product=${encodeURIComponent(productName)}&month=${ym}`;
}

export function ProductLink({
  productName,
  ym,
  children,
  className,
  title,
}: {
  productName: string;
  ym: string;
  children?: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <Link
      href={productHref(productName, ym)}
      className={className ?? "hover:underline"}
      title={title ?? `${productName} 제품 분석 보기`}
    >
      {children ?? productName}
    </Link>
  );
}
