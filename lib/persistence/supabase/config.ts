export type SupabasePersistenceConfig = {
  serviceRoleKey: string;
  storageBucket: string;
  url: string;
};

const readRequiredEnv = (name: string) => {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required Supabase persistence env: ${name}`);
  }
  return value;
};

export function readSupabasePersistenceConfig(): SupabasePersistenceConfig {
  return {
    url: readRequiredEnv("SUPABASE_URL"),
    serviceRoleKey: readRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    storageBucket:
      process.env.SUPABASE_SESSION_ARTIFACTS_BUCKET?.trim() || "session-artifacts",
  };
}
