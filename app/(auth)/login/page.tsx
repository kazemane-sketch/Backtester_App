import { redirect } from "next/navigation";

import { MagicLinkForm } from "@/components/auth/magic-link-form";
import { SiteHeader } from "@/components/layout/site-header";
import { getCurrentUser } from "@/lib/auth/get-user";

export default async function LoginPage() {
  const user = await getCurrentUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen">
      <SiteHeader authenticated={false} />
      <section className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-16">
        <MagicLinkForm />
      </section>
    </main>
  );
}
