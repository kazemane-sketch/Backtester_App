import Link from "next/link";
import { BarChart3 } from "lucide-react";

import { Button } from "@/components/ui/button";

export function SiteHeader({ authenticated = false }: { authenticated?: boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-sm">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <Link className="inline-flex items-center gap-2 text-lg font-semibold tracking-tight" href="/">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-primary">
            <BarChart3 className="h-4 w-4" />
          </span>
          Portfolio Backtester
        </Link>
        <nav className="flex items-center gap-2">
          {authenticated ? (
            <Button asChild size="sm" variant="default">
              <Link href="/dashboard">Dashboard</Link>
            </Button>
          ) : (
            <Button asChild size="sm" variant="default">
              <Link href="/login">Login</Link>
            </Button>
          )}
        </nav>
      </div>
    </header>
  );
}
