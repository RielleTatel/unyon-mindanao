import { cn } from "@/shared/lib/cn";

export function UnyonMark({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cn("unyon-mark", className)}>
      <span className="unyon-mark__sun" />
      <span className="unyon-mark__current unyon-mark__current--one" />
      <span className="unyon-mark__current unyon-mark__current--two" />
    </span>
  );
}
