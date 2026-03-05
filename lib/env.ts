const requiredClientEnv = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"] as const;
const requiredServerEnv = ["SUPABASE_SERVICE_ROLE_KEY", "EODHD_API_KEY", "OPENAI_API_KEY"] as const;

type EnvKey = (typeof requiredClientEnv)[number] | (typeof requiredServerEnv)[number];

function assertEnv(keys: readonly EnvKey[]) {
  for (const key of keys) {
    if (!process.env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }
}

export function getSupabaseClientEnv() {
  assertEnv(requiredClientEnv);

  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
  };
}

export function getServerSecrets() {
  assertEnv(requiredServerEnv);

  return {
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    eodhdApiKey: process.env.EODHD_API_KEY as string,
    openAiApiKey: process.env.OPENAI_API_KEY as string
  };
}
