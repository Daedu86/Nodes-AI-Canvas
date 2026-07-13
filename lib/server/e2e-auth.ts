const getEnvFlag = (value: string | undefined) => value === "1";
const isEnvValueEnabled = (value: string | undefined) => {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return false;
  return normalized === "1" || normalized === "true" || normalized === "yes";
};

export function isProductionLikeRuntime() {
  return (
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL_ENV === "production"
  );
}

export function isE2eHeaderAuthAllowed() {
  if (isProductionLikeRuntime()) {
    return false;
  }
  return process.env.NODE_ENV === "test" || isE2eEnvAuthAllowed();
}

export function isE2eEnvAuthAllowed() {
  if (isProductionLikeRuntime()) {
    return false;
  }

  // Prevent accidental auth bypass in non-test environments.
  // E2E override is allowed only for automated test runs or explicit mock mode.
  if (process.env.NODE_ENV !== "test" && !isEnvValueEnabled(process.env.E2E_MOCK_LLM)) {
    return false;
  }

  return getEnvFlag(process.env.ALLOW_E2E_AUTH_OVERRIDE);
}
