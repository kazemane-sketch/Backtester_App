"use client";

import { FormEvent, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function MagicLinkForm() {
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") ?? "/dashboard";
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const callbackUrl = useMemo(() => {
    if (typeof window === "undefined") {
      return "";
    }

    const url = new URL("/auth/callback", window.location.origin);
    url.searchParams.set("redirect", redirect);
    return url.toString();
  }, [redirect]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email) {
      return;
    }

    try {
      setStatus("loading");
      setMessage("");
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: callbackUrl
        }
      });

      if (error) {
        throw error;
      }

      setStatus("success");
      setMessage("Magic link inviato. Controlla la tua email.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Errore durante invio magic link");
    }
  }

  return (
    <Card className="w-full border-primary/15 bg-background/95 shadow-lg">
      <CardHeader>
        <CardTitle className="font-[var(--font-heading)] text-2xl">Accedi al tuo account</CardTitle>
        <CardDescription>Invia un magic link e continua in area privata.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              autoComplete="email"
              id="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@company.com"
              required
              type="email"
              value={email}
            />
          </div>
          <Button className="w-full" disabled={status === "loading"} type="submit">
            {status === "loading" ? "Invio in corso..." : "Invia magic link"}
          </Button>
          {message ? (
            <p className={`text-sm ${status === "error" ? "text-destructive" : "text-muted-foreground"}`}>
              {message}
            </p>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}
