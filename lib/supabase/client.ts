import { createBrowserClient } from "@supabase/ssr";

import { getSupabaseClientEnv } from "@/lib/env";
import type { SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

export function createClient() {
  if (browserClient) {
    return browserClient;
  }

  const { url, anonKey } = getSupabaseClientEnv();
  browserClient = createBrowserClient(url, anonKey);

  return browserClient;
}
