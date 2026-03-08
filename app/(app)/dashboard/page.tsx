import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Compass,
  MessageSquareText,
  Plus,
  TrendingUp,
  Zap
} from "lucide-react";

import { getCurrentUser } from "@/lib/auth/get-user";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const STATUS_STYLE: Record<string, string> = {
  completed: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
  running: "bg-blue-500/10 text-blue-600 border-blue-200",
  failed: "bg-red-500/10 text-red-600 border-red-200",
  pending: "bg-amber-500/10 text-amber-600 border-amber-200"
};

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const supabase = createServerSupabaseClient();

  const [{ count: totalRuns }, { data: recentRuns }, { count: totalInstruments }] =
    await Promise.all([
      supabase
        .from("backtest_runs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user!.id),
      supabase
        .from("backtest_runs")
        .select("id,name,status,created_at,config")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(6),
      supabase.from("instruments").select("id", { count: "exact", head: true })
    ]);

  const completedRuns = recentRuns?.filter((r) => r.status === "completed").length ?? 0;

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div>
        <h1 className="font-[var(--font-heading)] text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Bentornato — ecco un riepilogo della tua attività.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <BarChart3 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalRuns ?? 0}</p>
                <p className="text-[11px] text-muted-foreground">Backtest totali</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
                <TrendingUp className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{completedRuns}</p>
                <p className="text-[11px] text-muted-foreground">Completati recenti</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10">
                <Zap className="h-5 w-5 text-accent" />
              </div>
              <div>
                <p className="text-2xl font-bold">{(totalInstruments ?? 0).toLocaleString()}</p>
                <p className="text-[11px] text-muted-foreground">Strumenti nel DB</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick actions */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Link href="/backtests/new">
          <Card className="group cursor-pointer transition-all hover:shadow-md hover:border-primary/20">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                <MessageSquareText className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium group-hover:text-primary transition-colors">
                  AI Strategy Builder
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Descrivi la strategia, l&apos;AI genera il backtest
                </p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </CardContent>
          </Card>
        </Link>

        <Link href="/discover">
          <Card className="group cursor-pointer transition-all hover:shadow-md hover:border-accent/20">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10 group-hover:bg-accent/20 transition-colors">
                <Compass className="h-4 w-4 text-accent" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium group-hover:text-accent transition-colors">
                  Discover ETF
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Ricerca semantica AI tra {(totalInstruments ?? 0).toLocaleString()} strumenti
                </p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </CardContent>
          </Card>
        </Link>

        <Link href="/results">
          <Card className="group cursor-pointer transition-all hover:shadow-md hover:border-secondary/40">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary/40 group-hover:bg-secondary/60 transition-colors">
                <BarChart3 className="h-4 w-4 text-secondary-foreground" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium group-hover:text-secondary-foreground transition-colors">
                  Tutti i risultati
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Visualizza e confronta i tuoi backtest
                </p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Recent runs */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-[var(--font-heading)] text-lg font-semibold">Backtest recenti</h2>
          {(recentRuns?.length ?? 0) > 0 && (
            <Link
              href="/results"
              className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
              Vedi tutti <ArrowRight className="h-3 w-3" />
            </Link>
          )}
        </div>

        {(!recentRuns || recentRuns.length === 0) && (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
              <BarChart3 className="h-8 w-8 text-muted-foreground/30" />
              <div className="space-y-1">
                <p className="text-sm font-medium">Nessun backtest</p>
                <p className="text-xs text-muted-foreground">
                  Avvia il tuo primo backtest con l&apos;AI Strategy Builder.
                </p>
              </div>
              <Button asChild size="sm">
                <Link href="/backtests/new">
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Crea Backtest
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-2">
          {recentRuns?.map((run) => {
            const statusClass = STATUS_STYLE[run.status] ?? STATUS_STYLE.pending;
            const date = new Date(run.created_at).toLocaleDateString("it-IT", {
              day: "numeric",
              month: "short"
            });
            const config = run.config as Record<string, unknown> | null;
            const assets = config?.assets as Array<{ query?: string }> | undefined;
            const assetLabels = assets
              ?.slice(0, 3)
              .map((a) => a.query ?? "?")
              .join(", ");

            return (
              <Link key={run.id} href={`/backtests/${run.id}`}>
                <div className="group flex items-center gap-3 rounded-lg border bg-card/60 px-4 py-3 transition-all hover:bg-card hover:shadow-sm hover:border-primary/20">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                        {run.name ?? "Unnamed"}
                      </p>
                      <Badge variant="outline" className={`${statusClass} text-[10px] shrink-0`}>
                        {run.status}
                      </Badge>
                    </div>
                    {assetLabels && (
                      <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                        {assetLabels}
                      </p>
                    )}
                  </div>
                  <span className="text-[11px] text-muted-foreground shrink-0">{date}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
