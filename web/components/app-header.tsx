"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { Menu } from "lucide-react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

export type NavItem = {
  label: string;
  href: string;
};

interface AppHeaderProps {
  /** Extra content rendered to the right of nav on desktop (e.g. plan badge, subscription button) */
  right?: React.ReactNode;
  nav?: NavItem[];
}

function NotificationDot({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <Link href="/negotiate" className="relative shrink-0">
      <span className="sr-only">{count} pending review{count !== 1 ? "s" : ""}</span>
      <span className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <span className="relative">
          <span className="block w-2 h-2 rounded-full bg-orange-500" />
          <span className="absolute inset-0 w-2 h-2 rounded-full bg-orange-500 animate-ping opacity-75" />
        </span>
        <span className="hidden sm:inline">{count} pending</span>
        <span className="sm:hidden font-semibold text-orange-500">{count}</span>
      </span>
    </Link>
  );
}

export function AppHeader({ right, nav = [] }: AppHeaderProps) {
  const [pendingCount, setPendingCount] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetch("/api/notifications/count")
        .then(r => r.ok ? r.json() : { count: 0 })
        .then(d => { if (!cancelled) setPendingCount(d.count ?? 0); })
        .catch(() => {});
    };
    load();
    const interval = setInterval(load, 30_000);
    // Immediately refresh when a message is approved or discarded anywhere in the app
    const onUpdate = () => load();
    window.addEventListener("notifications-updated", onUpdate);
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("notifications-updated", onUpdate);
    };
  }, [pathname]);

  const navLinks = nav.map(item => (
    <Link
      key={item.href}
      href={item.href}
      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
    >
      {item.label}
    </Link>
  ));

  const mobileNavLinks = nav.map(item => (
    <Link
      key={item.href}
      href={item.href}
      onClick={() => setSheetOpen(false)}
      className="block py-3 text-base font-medium text-foreground border-b border-border last:border-0"
    >
      {item.label}
    </Link>
  ));

  return (
    <header className="border-b bg-background sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-4">
        {/* Left: logo */}
        <Logo size={40} href="/" />

        {/* Desktop nav */}
        <nav className="hidden sm:flex items-center gap-5 flex-1 px-4">
          {navLinks}
        </nav>

        {/* Right: notification dot + extra right content + user + mobile hamburger */}
        <div className="flex items-center gap-3 shrink-0">
          <NotificationDot count={pendingCount} />

          {/* Desktop-only extra content (plan badge, subscription button, etc.) */}
          {right && <div className="hidden sm:flex items-center gap-3">{right}</div>}

          <UserButton />

          {/* Mobile hamburger */}
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="sm:hidden" aria-label="Open menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72 pt-10">
              <nav className="flex flex-col">
                {mobileNavLinks}
                {/* Right content (plan info etc.) on mobile */}
                {right && <div className="mt-4 flex flex-col gap-3">{right}</div>}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
