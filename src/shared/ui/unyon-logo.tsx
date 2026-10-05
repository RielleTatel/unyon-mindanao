import Image from "next/image";

import { cn } from "@/shared/lib/cn";

export function UnyonLogo({
  className,
  alt = "",
}: {
  className?: string;
  alt?: string;
}) {
  return (
    <span aria-hidden={alt.length === 0} className={cn("unyon-logo", className)}>
      <Image
        alt={alt}
        className="unyon-logo__image"
        fill
        sizes="(max-width: 680px) 200px, 240px"
        src="/brand/unyon-mindanao.png"
        unoptimized
      />
    </span>
  );
}
