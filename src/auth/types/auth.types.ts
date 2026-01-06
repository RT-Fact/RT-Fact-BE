import type { Request } from "express";

/**
 * User JWT 페이로드 구조
 */
export interface UserJwtPayload {
  id: string;
  email: string;
  jti?: string;
}

/**
 * Guest JWT 페이로드 구조
 */
export interface GuestJwtPayload {
  ip: string;
  isGuest: true;
  jti?: string;
}

/**
 * Redis에 저장될 게스트 정보
 */
export interface GuestInfo {
  remainingUses: number;
  createdAt: number;
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

/**
 * 인증된 사용자 정보가 포함된 Request 객체
 */
export interface RequestWithUser extends Request {
  user: GoogleProfile;
}
