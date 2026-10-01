import Link from "next/link";
import type { PageMetadata } from "../pagination";

export function Pagination({ pagination, href }: { pagination: PageMetadata; href: string }) {
  if (pagination.page === 0 && !pagination.hasNext) return null;
  const pageHref = (page: number) => {
    const [pathname, query] = href.split("?");
    const parameters = new URLSearchParams(query);
    parameters.set("page", String(page));
    parameters.set("pageSize", String(pagination.pageSize));
    return `${pathname}?${parameters}`;
  };
  const style = "inline-flex min-h-11 items-center rounded-xl border border-primary/20 px-4 text-sm font-semibold text-primary hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring";
  return <nav aria-label="Pagination" className="mt-6 flex flex-wrap items-center justify-between gap-3">
    {pagination.page > 0 ? <Link className={style} href={pageHref(pagination.page - 1)}>Previous page</Link> : <span />}
    <span className="text-sm text-muted-foreground">Page {pagination.page + 1}</span>
    {pagination.hasNext ? <Link className={style} href={pageHref(pagination.page + 1)}>Next page</Link> : <span />}
  </nav>;
}
