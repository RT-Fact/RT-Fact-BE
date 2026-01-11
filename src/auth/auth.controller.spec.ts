import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, type TestingModule } from "@nestjs/testing";
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

  const mockCacheManager = {
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
        { provide: CACHE_MANAGER, useValue: mockCacheManager },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it("should be defined", () => {
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

    it("should redirect to frontend with auth code on success", async () => {
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
      expect(mockCacheManager.set).toHaveBeenCalledWith("mock-uuid", authUser.id, 60000);
      expect(redirectResponse.redirect).toHaveBeenCalledWith(
        "http://localhost:5173?code=mock-uuid",
      );
    });

    it("should redirect to login page with error on failure", async () => {
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

    it("should return tokens if code is valid", async () => {
      // given
      mockCacheManager.get.mockResolvedValue(user.id);
      mockAuthService.findUserById.mockResolvedValue(user);
      mockAuthService.generateUserTokens.mockReturnValue(tokens);

      // when
      await controller.exchangeToken(code, tokenResponse);

      // then
      expect(mockCacheManager.get).toHaveBeenCalledWith(code);
      expect(mockCacheManager.del).toHaveBeenCalledWith(code);
      expect(mockAuthService.findUserById).toHaveBeenCalledWith(user.id);
      expect(tokenResponse.cookie).toHaveBeenCalledWith("refreshToken", tokens.refreshToken, {
        httpOnly: true,
        secure: false, // In test env
        sameSite: "lax",
        path: "/",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
      expect(tokenResponse.json).toHaveBeenCalledWith({ accessToken: tokens.accessToken });
    });

    it("should throw UnauthorizedException if code is invalid", async () => {
      // given
      mockCacheManager.get.mockResolvedValue(null);

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

    it("should return new tokens if refresh token is valid", async () => {
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
    it("should return guest info if user is guest", async () => {
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

    it("should return user info if user is authenticated", async () => {
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
