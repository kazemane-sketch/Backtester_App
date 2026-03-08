"use client";

import { Globe, Shield } from "lucide-react";

import { cn } from "@/lib/utils";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { MobileSidebarTrigger } from "@/components/layout/app-sidebar";
import { useEuMode } from "@/components/providers/eu-mode-provider";

export function AppTopbar({ email }: { email: string }) {
  const { euMode, setEuMode } = useEuMode();

  return (
    <header className="flex h-14 items-center justify-between border-b bg-card/60 backdrop-blur-md px-4 lg:px-6">
      {/* Left: Mobile hamburger + page context */}
      <div className="flex items-center gap-2">
        <MobileSidebarTrigger />
      </div>

      {/* Right: EU toggle + user */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* EU / Global toggle */}
        <button
          type="button"
          onClick={() => setEuMode(!euMode)}
          className={cn(
            "flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-medium transition-all",
            euMode
              ? "border-primary/30 bg-primary/10 text-primary"
              : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/50"
          )}
        >
          {euMode ? (
            <>
              <Shield className="h-3.5 w-3.5" />
              <span className="hidden xs:inline">EU Mode</span>
              <span className="xs:hidden">EU</span>
            </>
          ) : (
            <>
              <Globe className="h-3.5 w-3.5" />
              <span className="hidden xs:inline">Global</span>
            </>
          )}
        </button>

        {/* User */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="hidden md:inline truncate max-w-[160px]">{email}</span>
          <SignOutButton />
        </div>
      </div>
    </header>
  );
}
