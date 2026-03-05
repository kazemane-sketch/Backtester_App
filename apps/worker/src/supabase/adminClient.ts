import { createClient } from "@supabase/supabase-js";

import { workerEnv } from "../config";

export const supabaseAdmin = createClient(workerEnv.SUPABASE_URL, workerEnv.SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});
