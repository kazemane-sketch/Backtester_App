import { cache } from "react";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export const getCurrentUser = cache(async () => {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error) {
    return null;
  }

  return user;
});
