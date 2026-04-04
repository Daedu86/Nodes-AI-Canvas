import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readSupabasePersistenceConfig } from "@/lib/persistence/supabase/config";

let cachedClient: SupabaseClient | null = null;

export function getSupabasePersistenceClient() {
  if (cachedClient) {
    return cachedClient;
  }

  const config = readSupabasePersistenceConfig();
  cachedClient = createClient(config.url, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  return cachedClient;
}
