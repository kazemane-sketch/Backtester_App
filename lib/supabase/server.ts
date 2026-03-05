import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { CookieOptions } from "@supabase/ssr";

import { getServerSecrets, getSupabaseClientEnv } from "@/lib/env";

export function createServerSupabaseClient() {
  const cookieStore = cookies();
  const { url, anonKey } = getSupabaseClientEnv();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server component cookies set can be ignored; middleware will refresh sessions.
        }
      }
    }
  });
}

export function createServiceRoleClient() {
  const { url } = getSupabaseClientEnv();
  const { supabaseServiceRoleKey } = getServerSecrets();

  return createSupabaseJsClient(url, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}
