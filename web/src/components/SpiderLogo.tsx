import Image from "next/image";

export function SpiderLogo({ inverse = false }: { inverse?: boolean }) {
  return (
    <Image
      src="/brand/spider-logo.png"
      alt="Spider"
      width={2172}
      height={724}
      priority
      className={`h-10 w-auto ${inverse ? "brightness-0 invert" : "spider-logo"}`}
    />
  );
}
