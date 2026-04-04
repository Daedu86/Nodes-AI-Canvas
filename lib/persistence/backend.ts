export type PersistenceBackend = "file" | "supabase";

export function getPersistenceBackend(): PersistenceBackend {
  return process.env.NODES_PERSISTENCE_BACKEND === "supabase"
    ? "supabase"
    : "file";
}
