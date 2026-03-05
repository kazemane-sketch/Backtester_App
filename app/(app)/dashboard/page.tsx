import Link from "next/link";

import { getCurrentUser } from "@/lib/auth/get-user";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const supabase = createServerSupabaseClient();

  const [{ data: portfolios }, { data: backtestRuns }] = await Promise.all([
    supabase
      .from("portfolios")
      .select("id,name,created_at")
      .eq("user_id", user!.id)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("backtest_runs")
      .select("id,name,status,created_at")
      .eq("user_id", user!.id)
      .order("created_at", { ascending: false })
      .limit(10)
  ]);

  return (
    <div className="space-y-8">
      <section className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Portafogli salvati</CardTitle>
            <CardDescription>Gestisci i template di allocazione e lanci rapidi.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-3xl font-semibold">{portfolios?.length ?? 0}</p>
            <Button asChild>
              <Link href="/backtests/new">Crea nuovo backtest</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Run recenti</CardTitle>
            <CardDescription>Storico degli ultimi backtest eseguiti.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{backtestRuns?.length ?? 0}</p>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Ultimi backtest</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Creato il</TableHead>
                <TableHead className="text-right">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {backtestRuns?.map((run) => (
                <TableRow key={run.id}>
                  <TableCell>{run.name}</TableCell>
                  <TableCell>
                    <Badge variant={run.status === "completed" ? "secondary" : "outline"}>{run.status}</Badge>
                  </TableCell>
                  <TableCell>{new Date(run.created_at).toLocaleDateString("it-IT")}</TableCell>
                  <TableCell className="text-right">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/backtests/${run.id}`}>Apri</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!backtestRuns?.length ? (
                <TableRow>
                  <TableCell className="text-muted-foreground" colSpan={4}>
                    Nessun backtest disponibile. Avvia il primo run dal wizard.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
