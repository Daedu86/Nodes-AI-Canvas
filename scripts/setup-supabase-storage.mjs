import { createClient } from "@supabase/supabase-js";
import process from "node:process";

const readRequiredEnv = (name) => {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
};

const supabaseUrl = readRequiredEnv("SUPABASE_URL");
const supabaseServiceRoleKey = readRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
const storageBucket =
  process.env.SUPABASE_SESSION_ARTIFACTS_BUCKET?.trim() || "session-artifacts";
const maxUploadFileBytes = 8 * 1024 * 1024;

const desiredBucketConfig = {
  public: false,
  fileSizeLimit: maxUploadFileBytes,
};

const client = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const main = async () => {
  const listResult = await client.storage.listBuckets();
  if (listResult.error) {
    throw new Error(listResult.error.message || "Failed to list Supabase buckets");
  }

  const existing = (listResult.data ?? []).find(
    (bucket) => bucket.id === storageBucket || bucket.name === storageBucket,
  );

  if (existing) {
    const updateResult = await client.storage.updateBucket(storageBucket, desiredBucketConfig);
    if (updateResult.error) {
      throw new Error(updateResult.error.message || "Failed to update Supabase bucket");
    }

    console.log(
      `Bucket already exists: ${storageBucket}. Reconciled config (private, ${maxUploadFileBytes} byte limit).`,
    );
    return;
  }

  const createResult = await client.storage.createBucket(storageBucket, desiredBucketConfig);

  if (createResult.error) {
    throw new Error(createResult.error.message || "Failed to create Supabase bucket");
  }

  console.log(
    `Created bucket: ${storageBucket} (private, ${maxUploadFileBytes} byte limit).`,
  );
};

main().catch((error) => {
  console.error("Supabase storage setup failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
