import type { Request, Response } from "express";

/**
 * X-Forwarded-For 헤더 타입
 */
export type XForwardedFor = string | undefined;

/**
 * User JWT 페이로드 구조
 * - sub: 사용자 고유 식별자 (ID)
 * - email: 사용자 이메일
 */
export interface UserJwtPayload {
  id: string;
  email: string;
  jti: string;
}

/**
 * Guest JWT 페이로드 구조
 */
export interface GuestJwtPayload {
  ip: string;
  isGuest: true;
  jti: string;
}

export type JwtPayload = UserJwtPayload | GuestJwtPayload;

/**
 * 로그인한 일반 사용자 정보
 */
export interface AuthenticatedUser {
  userId: string;
  email: string;
  isGuest: false;
}

/**
 * 게스트 사용자 정보
 */
export interface GuestUser {
  ip: string;
  isGuest: true;
}

/**
 * JWT 인증을 통과한 사용자 (일반 유저 or 게스트)
 */
export type JwtUser = AuthenticatedUser | GuestUser;

/**
 * 게스트 정보 조회 결과 (Redis)
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

export interface RequestWithUser extends Request {
  user: JwtUser;
}

export interface RequestWithGoogleUser extends Request {
  user: GoogleProfile;
}

export function isGuestUser(user: JwtUser): user is GuestUser {
  return "isGuest" in user && user.isGuest === true;
}

export function isAuthenticatedUser(user: JwtUser): user is AuthenticatedUser {
  return "isGuest" in user && user.isGuest === false;
}

/**
 * 리다이렉션만 필요한 응답 타입 (googleAuthCallback용)
 */
export type RedirectResponse = Pick<Response, "redirect">;

/**
 * 쿠키 설정 및 JSON 응답이 필요한 응답 타입 (exchangeToken용)
 */
export type TokenResponse = Pick<Response, "cookie" | "json">;

/**
 * 쿠키 삭제 및 JSON 응답이 필요한 응답 타입 (logout용)
 */
export type LogoutResponse = Pick<Response, "clearCookie" | "json">;
