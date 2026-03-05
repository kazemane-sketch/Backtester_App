import { PortfolioWizard } from "@/components/backtests/wizard";

export default function NewBacktestPage() {
  return (
    <section className="space-y-4">
      <div>
        <h1 className="font-[var(--font-heading)] text-3xl">Nuovo Backtest</h1>
        <p className="text-sm text-muted-foreground">
          Workflow guidato: Assets → Pesi → Regole → Benchmark → Run.
        </p>
      </div>
      <PortfolioWizard />
    </section>
  );
}
