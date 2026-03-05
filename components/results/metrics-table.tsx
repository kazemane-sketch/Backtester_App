import { formatCurrency } from "@/lib/utils";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";

type Summary = {
  total_return: number;
  cagr: number;
  volatility_ann: number;
  sharpe: number;
  max_drawdown: number;
  calmar: number;
  total_fees: number;
};

export function MetricsTable({ summary }: { summary: Summary | null }) {
  if (!summary) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Metriche</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Metriche non disponibili.</p>
        </CardContent>
      </Card>
    );
  }

  const rows = [
    { label: "Total Return", value: `${(summary.total_return * 100).toFixed(2)}%` },
    { label: "CAGR", value: `${(summary.cagr * 100).toFixed(2)}%` },
    { label: "Volatility (Ann.)", value: `${(summary.volatility_ann * 100).toFixed(2)}%` },
    { label: "Sharpe (rf=0)", value: summary.sharpe.toFixed(3) },
    { label: "Max Drawdown", value: `${(summary.max_drawdown * 100).toFixed(2)}%` },
    { label: "Calmar", value: summary.calmar.toFixed(3) },
    { label: "Total Fees", value: formatCurrency(summary.total_fees) }
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Metriche</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.label}>
                <TableCell className="font-medium">{row.label}</TableCell>
                <TableCell className="text-right">{row.value}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
