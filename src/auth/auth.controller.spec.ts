import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, type TestingModule } from "@nestjs/testing";
import type { Response } from "express";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import type { RefreshTokenDto } from "./dto/refresh-token.dto";
import type { GoogleProfile, RequestWithUser, TokenPair } from "./types/auth.types";

jest.mock("uuid", () => ({
  v4: () => "mock-uuid",
}));

// MockResponse 인터페이스 정의로 Lint 에러 방지
interface MockResponse extends Partial<Response> {
  redirect: jest.Mock;
  cookie: jest.Mock;
  json: jest.Mock;
}

describe("AuthController", () => {
  let controller: AuthController;
  let response: MockResponse;

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
    response = {
      redirect: jest.fn(),
      cookie: jest.fn(),
      json: jest.fn(),
    } as unknown as MockResponse;

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
    const req = {
      user: {
        email: "test@example.com",
        name: "Test User",
        provider: "google",
        providerId: "123",
      } as GoogleProfile,
    };

    const user = {
      id: "user-id",
      email: "test@example.com",
    };

    it("should redirect to frontend with auth code on success", async () => {
      // given
      mockAuthService.validateOAuthLogin.mockResolvedValue(user);

      // when
      await controller.googleAuthCallback(req as RequestWithUser, response as unknown as Response);

      // then
      expect(mockAuthService.validateOAuthLogin).toHaveBeenCalledWith(req.user);
      expect(mockCacheManager.set).toHaveBeenCalledWith("mock-uuid", user.id, 60000);
      expect(response.redirect).toHaveBeenCalledWith("http://localhost:5173?code=mock-uuid");
    });

    it("should redirect to login page with error on failure", async () => {
      // given
      mockAuthService.validateOAuthLogin.mockRejectedValue(new Error("Auth failed"));

      // when
      await controller.googleAuthCallback(req as RequestWithUser, response as unknown as Response);

      // then
      expect(response.redirect).toHaveBeenCalledWith(
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
      await controller.exchangeToken(code, response as unknown as Response);

      // then
      expect(mockCacheManager.get).toHaveBeenCalledWith(code);
      expect(mockCacheManager.del).toHaveBeenCalledWith(code);
      expect(mockAuthService.findUserById).toHaveBeenCalledWith(user.id);
      expect(response.cookie).toHaveBeenCalledWith("refreshToken", tokens.refreshToken, {
        httpOnly: true,
        secure: false, // In test env
        sameSite: "lax",
        path: "/",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
      expect(response.json).toHaveBeenCalledWith({ accessToken: tokens.accessToken });
    });

    it("should throw UnauthorizedException if code is invalid", async () => {
      // given
      mockCacheManager.get.mockResolvedValue(null);

      // when & then
      await expect(controller.exchangeToken(code, response as unknown as Response)).rejects.toThrow(
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
