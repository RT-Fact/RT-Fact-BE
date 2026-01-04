import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AuthGuard } from "@nestjs/passport";
import type { Response } from "express";

import { AuthService } from "./auth.service";
import { RefreshTokenDto } from "./dto/refresh-token.dto";
import { GoogleProfile } from "./types/auth.types";

interface RequestWithUser extends Request {
  user: GoogleProfile;
}

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
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

      const tokens = this.authService.generateTokens(user.id, user.email);

      const redirectUrl = `${frontendUrl}?accessToken=${tokens.accessToken}&refreshToken=${tokens.refreshToken}`;
      return res.redirect(redirectUrl);
    } catch {
      return res.redirect(`${frontendUrl}/login?error=oauth_failed`);
    }
  }

  /**
   * POST /auth/refresh
   * Access Token 갱신
   */
  @Post("refresh")
  async refresh(@Body() refreshTokenDto: RefreshTokenDto) {
    return this.authService.refreshTokens(refreshTokenDto.refreshToken);
  }
}
