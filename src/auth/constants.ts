export const JWT_EXPIRES = {
  ACCESS: "1h",
  REFRESH: "7d",
  GUEST: "7d",
} as const;

export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7일

export const GUEST_CONFIG = {
  INITIAL_USES: 3,
  TTL_SECONDS: 7 * 24 * 60 * 60, // 7일
} as const;
