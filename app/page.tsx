import Link from "next/link";
import { ArrowRight, ShieldCheck, Sparkles, LineChart } from "lucide-react";

import { getCurrentUser } from "@/lib/auth/get-user";
import { SiteHeader } from "@/components/layout/site-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function HomePage() {
  const user = await getCurrentUser();

  return (
    <main className="min-h-screen">
      <SiteHeader authenticated={Boolean(user)} />
      <section className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-14 sm:px-6 lg:grid-cols-2 lg:py-20 lg:px-8">
        <div className="animate-fade-in-up space-y-6">
          <p className="inline-flex rounded-full bg-secondary px-3 py-1 text-xs font-semibold uppercase tracking-wide text-secondary-foreground">
            SaaS MVP ready for Supabase + Vercel
          </p>
          <h1 className="font-[var(--font-heading)] text-4xl leading-tight tracking-tight text-foreground sm:text-5xl">
            Build, run and compare portfolio backtests in minutes.
          </h1>
          <p className="max-w-xl text-base text-muted-foreground sm:text-lg">
            Crea portafogli multi-asset, applica regole di ribilanciamento e confronta benchmark con metriche
            professionali.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button asChild size="lg">
              <Link href={user ? "/dashboard" : "/login"}>
                {user ? "Apri dashboard" : "Inizia con login"}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/backtests/new">Nuovo backtest</Link>
            </Button>
          </div>
        </div>
        <div className="grid gap-4">
          <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-background">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LineChart className="h-5 w-5 text-primary" />
                Backtest Engine
              </CardTitle>
              <CardDescription>
                Equity curve, drawdown, trade log e metriche come CAGR, Sharpe e Calmar.
              </CardDescription>
            </CardHeader>
          </Card>
          <Card className="border-accent/20 bg-gradient-to-br from-accent/10 to-background">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-accent" />
                AI Config Assistant
              </CardTitle>
              <CardDescription>
                LLM server-side che restituisce solo JSON valido per compilare il builder automaticamente.
              </CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-secondary-foreground" />
                Sicurezza
              </CardTitle>
              <CardDescription>
                Supabase Auth + Postgres con Row Level Security su tutte le risorse private.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Deploy pronto su Vercel con redirect URL prod/preview.</p>
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
}
