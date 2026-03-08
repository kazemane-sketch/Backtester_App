import { Settings } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

export default function SettingsPage() {
  return (
    <section className="space-y-5">
      <div>
        <h1 className="font-[var(--font-heading)] text-2xl font-bold">Impostazioni</h1>
        <p className="text-sm text-muted-foreground">
          Configura le preferenze dell&apos;account e dell&apos;applicazione.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <Settings className="h-8 w-8 text-muted-foreground/30" />
          <div className="space-y-1">
            <p className="text-sm font-medium">In arrivo</p>
            <p className="text-xs text-muted-foreground max-w-xs">
              Preferenze data provider, valuta base, notifiche e API keys saranno disponibili qui.
            </p>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
