export const parseCanonicalAppUrl = (value: string | null | undefined) => {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return new URL(trimmed);
  } catch {
    return null;
  }
};

export const getCanonicalAppOrigin = (value: string | null | undefined) =>
  parseCanonicalAppUrl(value)?.origin ?? null;
