import Image from "next/image";
import Link from "next/link";

interface LogoProps {
  size?: number;
  showName?: boolean;
  href?: string;
}

export function Logo({ size = 32, showName = true, href }: LogoProps) {
  const content = (
    <div className="flex items-center gap-2">
      <Image
        src="/android-chrome-192x192.png"
        alt="CounterPro"
        width={size}
        height={size}
        className="rounded-lg p-0.5 bg-white shadow-sm"
        priority
      />
      {showName && (
        <span className="font-bold tracking-tight" style={{ fontSize: size * 0.625 }}>
          CounterPro
        </span>
      )}
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }

  return content;
}
