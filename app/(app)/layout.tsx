import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/get-user";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppTopbar } from "@/components/layout/app-topbar";
import { EuModeProvider } from "@/components/providers/eu-mode-provider";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  /* Dev bypass: skip login redirect in development */
  const isDev = process.env.NODE_ENV === "development";

  if (!user && !isDev) {
    redirect("/login");
  }

  const email = user?.email ?? (isDev ? "dev@localhost" : "");

  return (
    <EuModeProvider>
      <div className="flex h-screen overflow-hidden">
        {/* Sidebar */}
        <AppSidebar />

        {/* Main area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Topbar */}
          <AppTopbar email={email} />

          {/* Content */}
          <main className="flex-1 overflow-y-auto px-6 py-6">{children}</main>
        </div>
      </div>
    </EuModeProvider>
  );
}
