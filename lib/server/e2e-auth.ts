const getEnvFlag = (value: string | undefined) => value === "1";

export function isProductionLikeRuntime() {
  return (
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL_ENV === "production"
  );
}

export function isE2eHeaderAuthAllowed() {
  return process.env.NODE_ENV === "test";
}

export function isE2eEnvAuthAllowed() {
  if (isProductionLikeRuntime()) {
    return false;
  }
  return getEnvFlag(process.env.ALLOW_E2E_AUTH_OVERRIDE);
}
