import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { v4 as uuidv4 } from "uuid";
import { PrismaService } from "../prisma/prisma.service";
import { GuestRepository } from "./repositories/guest.repository";
import { GoogleProfile, GuestJwtPayload, TokenPair, UserJwtPayload } from "./types/auth.types";

// TODO: 상수들 어떻게 관리할지 결정을 내려야겠다.

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly guestRepository: GuestRepository,
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
      expiresIn: "1h",
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.getOrThrow<string>("JWT_REFRESH_SECRET"),
      expiresIn: "7d",
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
      expiresIn: "7d",
    });
  }

  /**
   * 게스트 정보 조회 또는 생성
   */
  async getOrCreateGuest(ip: string) {
    const existing = await this.guestRepository.getGuestInfo(ip);

    if (existing) return existing;

    const newGuest = { remainingUses: 3, createdAt: Date.now() };

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

      const user = await this.prisma.user.findUnique({
        where: { id: payload.id },
      });

      if (!user) {
        this.logger.warn(`토큰 갱신 실패 - 사용자 없음 (ID: ${payload.id})`);
        throw new UnauthorizedException("User not found");
      }

      return this.generateUserTokens(user.id, user.email);
    } catch {
      this.logger.warn("토큰 갱신 실패 - 유효하지 않은 리프레시 토큰");
      throw new UnauthorizedException("Invalid refresh token");
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
