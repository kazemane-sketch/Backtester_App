import type { Metadata } from "next";
import { Space_Grotesk, Bitter } from "next/font/google";

import "@/app/globals.css";
import { QueryProvider } from "@/components/providers/query-provider";

const headingFont = Bitter({
  subsets: ["latin"],
  variable: "--font-heading",
  weight: ["600", "700"]
});

const bodyFont = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-body"
});

export const metadata: Metadata = {
  title: "Portfolio Backtester",
  description: "SaaS per costruire e analizzare backtest di portafogli"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it" suppressHydrationWarning>
      <body className={`${headingFont.variable} ${bodyFont.variable} font-[var(--font-body)] antialiased`}>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
