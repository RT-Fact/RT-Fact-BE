import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { v4 as uuidv4 } from "uuid";
import { ERROR_CODES } from "../common/constants/error-codes";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { GUEST_CONFIG, JWT_EXPIRES, REFRESH_TOKEN_TTL_MS } from "./constants";
import { GuestRepository } from "./repositories/guest.repository";
import type { GoogleProfile, GuestJwtPayload, TokenPair, UserJwtPayload } from "./types/auth.types";

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly guestRepository: GuestRepository,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Google OAuth 프로필로 사용자 조회 또는 생성
   */
  async validateOAuthLogin(profile: GoogleProfile) {
    const { email, name, provider, providerId } = profile;

    const user = await this.prisma.user.upsert({
      where: {
        email,
      },
      update: {
        name,
        provider,
        providerId,
      },
      create: {
        email,
        name,
        provider,
        providerId,
      },
    });

    this.logger.log(`OAuth 로그인 성공 - 이메일: ${email}, 제공자: ${provider}`);
    return user;
  }

  /**
   * Access Token + Refresh Token 생성
   * - Access Token: 1시간 만료
   * - Refresh Token: 7일 만료
   */
  generateUserTokens(userId: string, email: string): TokenPair {
    const payload: UserJwtPayload = { id: userId, email, jti: uuidv4() };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.getOrThrow<string>("JWT_SECRET"),
      expiresIn: JWT_EXPIRES.ACCESS,
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.getOrThrow<string>("JWT_REFRESH_SECRET"),
      expiresIn: JWT_EXPIRES.REFRESH,
    });

    return { accessToken, refreshToken };
  }

  /**
   * 게스트용 Access Token 생성
   * - 게스트는 Refresh Token 없음 (단기 세션)
   */
  generateGuestToken(ip: string): string {
    const payload: GuestJwtPayload = { ip, isGuest: true, jti: uuidv4() };

    return this.jwtService.sign(payload, {
      secret: this.configService.getOrThrow<string>("JWT_SECRET"),
      expiresIn: JWT_EXPIRES.GUEST,
    });
  }

  /**
   * 게스트 정보 조회 또는 생성
   */
  async getOrCreateGuest(ip: string) {
    const existing = await this.guestRepository.getGuestInfo(ip);

    if (existing) return existing;

    const newGuest = { remainingUses: GUEST_CONFIG.INITIAL_USES, createdAt: Date.now() };

    await this.guestRepository.setGuestInfo(ip, newGuest);
    this.logger.log(`새 게스트 생성 - IP 해시: ${ip.substring(0, 8)}...`);

    return newGuest;
  }

  /**
   * Refresh Token으로 새 토큰 쌍 발급
   * @throws UnauthorizedException 토큰이 유효하지 않거나 사용자를 찾을 수 없을 때
   */
  async refreshTokens(refreshToken: string): Promise<TokenPair> {
    try {
      const payload = this.jwtService.verify<UserJwtPayload>(refreshToken, {
        secret: this.configService.getOrThrow<string>("JWT_REFRESH_SECRET"),
      });

      // Redis에서 저장된 Refresh Token 확인 (Multi-device 로그인 제한 / 탈취 감지)
      const cachedRefreshToken = await this.redisService.get(`rt:${payload.id}`);

      if (!cachedRefreshToken || cachedRefreshToken !== refreshToken) {
        this.logger.warn(`토큰 갱신 실패 - Redis 토큰 불일치 (ID: ${payload.id})`);
        throw new UnauthorizedException(ERROR_CODES.INVALID_REFRESH_TOKEN);
      }

      const user = await this.prisma.user.findUnique({
        where: { id: payload.id },
      });

      if (!user) {
        this.logger.warn(`토큰 갱신 실패 - 사용자 없음 (ID: ${payload.id})`);
        throw new UnauthorizedException(ERROR_CODES.USER_NOT_FOUND);
      }

      const tokens = this.generateUserTokens(user.id, user.email);
      await this.redisService.set(`rt:${user.id}`, tokens.refreshToken, REFRESH_TOKEN_TTL_MS);

      return tokens;
    } catch {
      this.logger.warn("토큰 갱신 실패 - 유효하지 않은 리프레시 토큰");
      throw new UnauthorizedException(ERROR_CODES.INVALID_REFRESH_TOKEN);
    }
  }

  /**
   * ID로 사용자 조회
   */
  async findUserById(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
    });
  }
}
