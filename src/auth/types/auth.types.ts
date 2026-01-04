/**
 * JWT 페이로드 구조
 */
export interface JwtPayload {
  id: string;
  email: string;
}

/**
 * Google OAuth 사용자 프로필
 */
export interface GoogleProfile {
  email: string;
  name: string;
  provider: string;
  providerId: string;
}

/**
 * JWT 토큰 쌍
 */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}
