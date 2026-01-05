import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { v4 as uuidv4 } from "uuid";
import { PrismaService } from "../prisma/prisma.service";
import { GoogleProfile, JwtPayload, TokenPair } from "./types/auth.types";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
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

    return user;
  }

  /**
   * Access Token + Refresh Token 생성
   * - Access Token: 1시간 만료
   * - Refresh Token: 7일 만료
   */
  generateTokens(userId: string, email: string): TokenPair {
    const payload: JwtPayload = { id: userId, email, jti: uuidv4() };

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
   * Refresh Token으로 새 토큰 쌍 발급
   * @throws UnauthorizedException 토큰이 유효하지 않거나 사용자를 찾을 수 없을 때
   */
  async refreshTokens(refreshToken: string): Promise<TokenPair> {
    try {
      const payload = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: this.configService.getOrThrow<string>("JWT_REFRESH_SECRET"),
      });

      const user = await this.prisma.user.findUnique({
        where: { id: payload.id },
      });

      if (!user) {
        throw new UnauthorizedException("User not found");
      }

      return this.generateTokens(user.id, user.email);
    } catch {
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
