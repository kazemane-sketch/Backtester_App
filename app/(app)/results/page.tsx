import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, BarChart3, Plus } from "lucide-react";

import { getCurrentUser } from "@/lib/auth/get-user";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const STATUS_STYLE: Record<string, string> = {
  completed: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
  running: "bg-blue-500/10 text-blue-600 border-blue-200",
  failed: "bg-red-500/10 text-red-600 border-red-200",
  pending: "bg-amber-500/10 text-amber-600 border-amber-200"
};

export default async function ResultsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = createServerSupabaseClient();

  const { data: runs } = await supabase
    .from("backtest_runs")
    .select("id,name,status,config,created_at,completed_at,error_message")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  const allRuns = runs ?? [];

  return (
    <section className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-[var(--font-heading)] text-2xl font-bold">Risultati</h1>
          <p className="text-sm text-muted-foreground">
            {allRuns.length} backtest eseguit{allRuns.length === 1 ? "o" : "i"}
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/backtests/new">
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Nuovo Backtest
          </Link>
        </Button>
      </div>

      {allRuns.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
            <BarChart3 className="h-7 w-7 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium">Nessun backtest</p>
            <p className="text-xs text-muted-foreground max-w-xs">
              Crea il tuo primo backtest con l&apos;AI Strategy Builder.
            </p>
          </div>
          <Button asChild>
            <Link href="/backtests/new">
              <Plus className="h-4 w-4 mr-1.5" />
              Crea Backtest
            </Link>
          </Button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {allRuns.map((run) => {
          const statusClass = STATUS_STYLE[run.status] ?? STATUS_STYLE.pending;
          const date = new Date(run.created_at).toLocaleDateString("it-IT", {
            day: "numeric",
            month: "short",
            year: "numeric"
          });

          // Extract basic config info
          const config = run.config as Record<string, unknown> | null;
          const startDate = config?.startDate as string | undefined;
          const endDate = config?.endDate as string | undefined;
          const assets = config?.assets as Array<{ query?: string }> | undefined;
          const assetLabels = assets
            ?.slice(0, 3)
            .map((a) => a.query ?? "?")
            .join(", ");

          return (
            <Link key={run.id} href={`/backtests/${run.id}`}>
              <Card className="group overflow-hidden transition-all hover:shadow-md hover:border-primary/20 cursor-pointer h-full">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-semibold truncate group-hover:text-primary transition-colors">
                        {run.name ?? "Unnamed Backtest"}
                      </h3>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {date}
                      </p>
                    </div>
                    <Badge variant="outline" className={`${statusClass} shrink-0 ml-2 text-[10px]`}>
                      {run.status}
                    </Badge>
                  </div>

                  {assetLabels && (
                    <p className="text-xs text-muted-foreground truncate">
                      {assetLabels}
                      {(assets?.length ?? 0) > 3 ? ` +${(assets?.length ?? 0) - 3}` : ""}
                    </p>
                  )}

                  {startDate && endDate && (
                    <p className="text-[11px] text-muted-foreground">
                      {startDate} → {endDate}
                    </p>
                  )}

                  {run.error_message && (
                    <p className="text-[11px] text-destructive truncate">
                      {run.error_message}
                    </p>
                  )}

                  <div className="flex items-center justify-end">
                    <span className="flex items-center gap-1 text-[11px] text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                      Dettagli <ArrowRight className="h-3 w-3" />
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
