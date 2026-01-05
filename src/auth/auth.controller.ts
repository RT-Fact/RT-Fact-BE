import { CACHE_MANAGER } from "@nestjs/cache-manager";
import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AuthGuard } from "@nestjs/passport";
import { Cache } from "cache-manager";
import type { Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { AuthService } from "./auth.service";
import { RefreshTokenDto } from "./dto/refresh-token.dto";
import { RequestWithUser } from "./types/auth.types";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  /**
   * GET /auth/google
   * Google OAuth 로그인 시작
   */
  @Get("google")
  @UseGuards(AuthGuard("google"))
  googleAuth() {
    // Passport가 자동으로 Google 로그인 페이지로 리다이렉트
  }

  /**
   * GET /auth/google/callback
   * Google OAuth 콜백 처리
   */
  @Get("google/callback")
  @UseGuards(AuthGuard("google"))
  async googleAuthCallback(@Req() req: RequestWithUser, @Res() res: Response) {
    const frontendUrl = this.configService.getOrThrow<string>("FRONTEND_URL");

    try {
      const { email, name, provider, providerId } = req.user;

      const user = await this.authService.validateOAuthLogin({
        email,
        name,
        provider,
        providerId,
      });

      // 보안을 위해 토큰을 URL에 노출하지 않고, 일회용 코드로 교환
      const authCode = uuidv4();
      await this.cacheManager.set(authCode, user.id, 60000); // 1분 유효

      return res.redirect(`${frontendUrl}?code=${authCode}`);
    } catch {
      return res.redirect(`${frontendUrl}/login?error=oauth_failed`);
    }
  }

  /**
   * POST /auth/token
   * Authorization Code를 Access Token + Refresh Token(Cookie)으로 교환
   */
  @Post("token")
  async exchangeToken(@Body("code") code: string, @Res() res: Response) {
    const userId = await this.cacheManager.get<string>(code);

    if (!userId) {
      throw new UnauthorizedException("Invalid or expired authorization code");
    }

    await this.cacheManager.del(code); // 일회용 코드 삭제

    const user = await this.authService.findUserById(userId);
    if (!user) {
      throw new UnauthorizedException("User not found");
    }

    const tokens = this.authService.generateUserTokens(user.id, user.email);

    // Refresh Token을 HttpOnly Cookie로 설정
    res.cookie("refreshToken", tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production", // HTTPS에서만 전송
      sameSite: "lax", // CSRF 보호
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7일
    });

    // Access Token은 Body로 반환
    return res.json({ accessToken: tokens.accessToken });
  }

  /**
   * POST /auth/refresh
   * Access Token 갱신
   */
  @Post("refresh")
  async refresh(@Body() refreshTokenDto: RefreshTokenDto) {
    return this.authService.refreshTokens(refreshTokenDto.refreshToken);
  }

  /**
   * POST /auth/guest
   * 게스트 토큰 발급
   */
  @Post("guest")
  async guest(@Headers("x-forwarded-for") forwardedFor?: string, @Req() req?: { ip?: string }) {
    // IP 추출: X-Forwarded-For 헤더 또는 Express req.ip
    const ip = forwardedFor?.split(",")[0].trim() || req?.ip || "unknown";

    // 게스트 정보 조회 또는 생성
    const guestInfo = await this.authService.getOrCreateGuest(ip);

    // 토큰 발급
    const accessToken = this.authService.generateGuestToken(ip);

    return {
      accessToken,
      remainingUses: guestInfo.remainingUses,
      isGuest: true,
    };
  }
}
