import { UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, type TestingModule } from "@nestjs/testing";
import { RedisService } from "../redis/redis.service";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import type { RefreshTokenDto } from "./dto/refresh-token.dto";
import type { GoogleProfile, RedirectResponse, TokenPair, TokenResponse } from "./types/auth.types";

jest.mock("uuid", () => ({
  v4: () => "mock-uuid",
}));

describe("AuthController", () => {
  let controller: AuthController;
  let redirectResponse: RedirectResponse;
  let tokenResponse: TokenResponse;

  const mockAuthService = {
    validateOAuthLogin: jest.fn(),
    generateUserTokens: jest.fn(),
    refreshTokens: jest.fn(),
    findUserById: jest.fn(),
    getOrCreateGuest: jest.fn(),
    generateGuestToken: jest.fn(),
  };

  const mockRedisService = {
    set: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
  };

  const mockConfigService = {
    getOrThrow: jest.fn((key: string) => {
      switch (key) {
        case "FRONTEND_URL":
          return "http://localhost:5173";
        default:
          return null;
      }
    }),
  };

  beforeEach(async () => {
    redirectResponse = {
      redirect: jest.fn(),
    };

    tokenResponse = {
      cookie: jest.fn(),
      json: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it("정의되어 있어야 합니다", () => {
    expect(controller).toBeDefined();
  });

  describe("googleAuthCallback", () => {
    const user = {
      email: "test@example.com",
      name: "Test User",
      provider: "google",
      providerId: "123",
    } as GoogleProfile;

    const authUser = {
      id: "user-id",
      email: "test@example.com",
    };

    it("성공 시 인증 코드와 함께 프론트엔드로 리다이렉트되어야 합니다", async () => {
      // given
      mockAuthService.validateOAuthLogin.mockResolvedValue(authUser);

      // when
      await controller.googleAuthCallback(user, redirectResponse);

      // then
      expect(mockAuthService.validateOAuthLogin).toHaveBeenCalledWith({
        email: user.email,
        name: user.name,
        provider: user.provider,
        providerId: user.providerId,
      });
      expect(mockRedisService.set).toHaveBeenCalledWith("mock-uuid", authUser.id, 60000);
      expect(redirectResponse.redirect).toHaveBeenCalledWith(
        "http://localhost:5173/auth/callback?code=mock-uuid",
      );
    });

    it("실패 시 에러와 함께 로그인 페이지로 리다이렉트되어야 합니다", async () => {
      // given
      mockAuthService.validateOAuthLogin.mockRejectedValue(new Error("Auth failed"));

      // when
      await controller.googleAuthCallback(user, redirectResponse);

      // then
      expect(redirectResponse.redirect).toHaveBeenCalledWith(
        "http://localhost:5173/login?error=oauth_failed",
      );
    });
  });

  describe("exchangeToken", () => {
    const code = "valid-code";
    const user = { id: "user-id", email: "test@example.com" };
    const tokens: TokenPair = {
      accessToken: "access-token",
      refreshToken: "refresh-token",
    };

    it("코드가 유효하면 토큰을 반환해야 합니다", async () => {
      // given
      mockRedisService.get.mockResolvedValue(user.id);
      mockAuthService.findUserById.mockResolvedValue(user);
      mockAuthService.generateUserTokens.mockReturnValue(tokens);

      // when
      await controller.exchangeToken(code, tokenResponse);

      // then
      expect(mockRedisService.get).toHaveBeenCalledWith(code);
      expect(mockRedisService.del).toHaveBeenCalledWith(code);
      expect(mockAuthService.findUserById).toHaveBeenCalledWith(user.id);
      expect(tokenResponse.cookie).toHaveBeenCalledWith("refreshToken", tokens.refreshToken, {
        httpOnly: true,
        secure: false, // In test env
        sameSite: "lax",
        path: "/",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
      expect(tokenResponse.json).toHaveBeenCalledWith({
        accessToken: tokens.accessToken,
        user: user,
      });
    });

    it("코드가 유효하지 않으면 UnauthorizedException을 던져야 합니다", async () => {
      // given
      mockRedisService.get.mockResolvedValue(null);

      // when & then
      await expect(controller.exchangeToken(code, tokenResponse)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe("refresh", () => {
    const refreshTokenDto: RefreshTokenDto = {
      refreshToken: "valid-refresh-token",
    };

    const tokens: TokenPair = {
      accessToken: "new-access-token",
      refreshToken: "new-refresh-token",
    };

    it("리프레시 토큰이 유효하면 새 토큰을 반환해야 합니다", async () => {
      // given
      mockAuthService.refreshTokens.mockResolvedValue(tokens);

      // when
      const result = await controller.refresh(refreshTokenDto);

      // then
      expect(result).toEqual(tokens);
      expect(mockAuthService.refreshTokens).toHaveBeenCalledWith(refreshTokenDto.refreshToken);
    });
  });

  describe("me", () => {
    it("사용자가 게스트라면 게스트 정보를 반환해야 합니다", async () => {
      const req = {
        user: { isGuest: true, ip: "127.0.0.1" },
      } as unknown as Parameters<typeof controller.me>[0];

      mockAuthService.getOrCreateGuest.mockResolvedValue({
        remainingUses: 3,
        createdAt: Date.now(),
      });

      const result = await controller.me(req);

      expect(mockAuthService.getOrCreateGuest).toHaveBeenCalledWith("127.0.0.1");
      expect(result).toEqual({ isGuest: true, remainingUses: 3 });
    });

    it("사용자가 인증되었다면 사용자 정보를 반환해야 합니다", async () => {
      const req = {
        user: { isGuest: false, userId: "user-id", email: "test@example.com" },
      } as unknown as Parameters<typeof controller.me>[0];

      const result = await controller.me(req);

      expect(result).toEqual({
        isGuest: false,
        userId: "user-id",
        email: "test@example.com",
      });
    });
  });
});
