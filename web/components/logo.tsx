import Link from "next/link";

interface LogoProps {
  size?: number;
  href?: string;
  showName?: boolean;
}

export function Logo({ size = 44, href, showName = true }: LogoProps) {
  const content = (
    <div className="flex items-center gap-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo.svg"
        alt="CounterPro"
        width={size}
        height={size}
        className="object-contain"
      />
      {showName && (
        <span className="font-bold tracking-tight" style={{ fontSize: size * 0.5 }}>
          CounterPro AI
        </span>
      )}
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }

  return content;
}
