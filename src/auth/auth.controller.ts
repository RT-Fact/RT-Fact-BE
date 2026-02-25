import {
  Body,
  Controller,
  Get,
  Headers,
  Ip,
  Logger,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AuthGuard } from "@nestjs/passport";
import { v4 as uuidv4 } from "uuid";
import { ERROR_CODES } from "../common/constants/error-codes";
import { GoogleUser } from "../common/decorators/google-user.decorator";
import { Public } from "../common/decorators/public.decorator";
import { RequireLogin } from "../common/decorators/require-login.decorator";
import { RedisService } from "../redis/redis.service";
import { AuthService } from "./auth.service";
import { REFRESH_TOKEN_TTL_MS } from "./constants";
import {
  AuthenticatedUser,
  GoogleProfile,
  isGuestUser,
  LogoutResponse,
  RedirectResponse,
  RequestWithUser,
  TokenResponse,
  XForwardedFor,
} from "./types/auth.types";
import { hashIp } from "./utils/ip-hash.util";

@Controller("auth")
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * GET /auth/google
   * Google OAuth 로그인 시작
   */
  @Get("google")
  @Public()
  @UseGuards(AuthGuard("google"))
  googleAuth() {
    // Passport가 자동으로 Google 로그인 페이지로 리다이렉트
  }

  /**
   * GET /auth/google/callback
   * Google OAuth 콜백 처리
   */
  @Get("google/callback")
  @Public()
  @UseGuards(AuthGuard("google"))
  async googleAuthCallback(@GoogleUser() user: GoogleProfile, @Res() res: RedirectResponse) {
    const frontendUrl = this.configService.getOrThrow<string>("FRONTEND_URL");

    try {
      const { email, name, provider, providerId } = user;

      const authenticatedUser = await this.authService.validateOAuthLogin({
        email,
        name,
        provider,
        providerId,
      });

      // 보안을 위해 토큰을 URL에 노출하지 않고, 일회용 코드로 교환
      const authCode = uuidv4();
      await this.redisService.set(authCode, authenticatedUser.id, 60000); // 1분 유효

      return res.redirect(`${frontendUrl}/auth/callback?code=${authCode}`);
    } catch (error) {
      this.logger.error("Google OAuth callback failed", error);
      return res.redirect(`${frontendUrl}/login?error=oauth_failed`);
    }
  }

  /**
   * POST /auth/token
   * Authorization Code를 Access Token + Refresh Token(Cookie)으로 교환
   */
  @Post("token")
  @Public()
  async exchangeToken(@Body("code") code: string, @Res() res: TokenResponse) {
    const userId = await this.redisService.get(code);

    if (!userId) {
      throw new UnauthorizedException(ERROR_CODES.INVALID_AUTH_CODE);
    }

    await this.redisService.del(code);

    const user = await this.authService.findUserById(userId);
    if (!user) {
      throw new UnauthorizedException(ERROR_CODES.USER_NOT_FOUND);
    }

    const tokens = this.authService.generateUserTokens(user.id, user.email);

    // Refresh Token을 Redis에 저장 (화이트리스트 관리)
    await this.redisService.set(`rt:${user.id}`, tokens.refreshToken, REFRESH_TOKEN_TTL_MS);

    // Refresh Token을 HttpOnly Cookie로 설정
    res.cookie("refreshToken", tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: REFRESH_TOKEN_TTL_MS,
    });

    // Access Token은 Body로 반환
    return res.json({ accessToken: tokens.accessToken });
  }

  /**
   * POST /auth/refresh
   * Access Token 갱신
   */
  @Post("refresh")
  @Public()
  async refresh(@Req() req: RequestWithUser, @Res() res: TokenResponse) {
    const refreshToken = req.cookies["refreshToken"] as string | undefined;

    if (!refreshToken) {
      throw new UnauthorizedException(ERROR_CODES.INVALID_REFRESH_TOKEN);
    }

    const tokens = await this.authService.refreshTokens(refreshToken);

    // 새로운 Refresh Token을 쿠키로 설정 (Rotation)
    res.cookie("refreshToken", tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: REFRESH_TOKEN_TTL_MS,
    });

    return res.json({ accessToken: tokens.accessToken });
  }

  /**
   * POST /auth/guest
   * 게스트 토큰 발급
   */
  @Post("guest")
  @Public()
  async guest(@Headers("x-forwarded-for") forwardedFor: XForwardedFor, @Ip() requestIp: string) {
    // IP 추출 후 해싱: JWT payload에 원본 IP가 노출되지 않도록 함
    const rawIp = forwardedFor ? forwardedFor.split(",")[0].trim() : requestIp;
    const ip = hashIp(rawIp);

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

  /**
   * POST /auth/logout
   * 로그아웃
   */
  @Post("logout")
  @RequireLogin()
  async logout(@Req() req: RequestWithUser, @Res() res: LogoutResponse) {
    res.clearCookie("refreshToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });

    const user = req.user as AuthenticatedUser;
    await this.redisService.del(`rt:${user.userId}`);

    return res.json({ message: "로그아웃 되었습니다." });
  }

  /**
   * GET /auth/me
   * 현재 인증된 사용자/게스트 정보 반환
   */
  @Get("me")
  async me(@Req() req: RequestWithUser) {
    const { user } = req;

    if (isGuestUser(user)) {
      const guestInfo = await this.authService.getOrCreateGuest(user.ip);

      return {
        isGuest: true,
        remainingUses: guestInfo.remainingUses,
      };
    }

    return {
      isGuest: false,
      userId: user.userId,
      email: user.email,
    };
  }
}
