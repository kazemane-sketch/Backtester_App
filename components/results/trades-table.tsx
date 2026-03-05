import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Trade = {
  trade_date: string;
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  gross_amount: number;
  fee_amount: number;
};

export function TradesTable({ trades }: { trades: Trade[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Trade Log</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Symbol</TableHead>
              <TableHead>Side</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="text-right">Gross</TableHead>
              <TableHead className="text-right">Fee</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {trades.map((trade, index) => (
              <TableRow key={`${trade.trade_date}-${trade.symbol}-${index}`}>
                <TableCell>{trade.trade_date}</TableCell>
                <TableCell>{trade.symbol}</TableCell>
                <TableCell className={trade.side === "buy" ? "text-emerald-700" : "text-amber-700"}>
                  {trade.side}
                </TableCell>
                <TableCell className="text-right">{trade.quantity.toFixed(4)}</TableCell>
                <TableCell className="text-right">{trade.price.toFixed(2)}</TableCell>
                <TableCell className="text-right">{trade.gross_amount.toFixed(2)}</TableCell>
                <TableCell className="text-right">{trade.fee_amount.toFixed(2)}</TableCell>
              </TableRow>
            ))}
            {!trades.length ? (
              <TableRow>
                <TableCell className="text-muted-foreground" colSpan={7}>
                  Nessun trade registrato.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
