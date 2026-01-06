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

describe("AuthController", () => {
  let controller: AuthController;

  let mockValidateOAuthLogin: jest.Mock;
  let mockGenerateUserTokens: jest.Mock;
  let mockRefreshTokens: jest.Mock;
  let mockFindUserById: jest.Mock;
  let mockGetOrCreateGuest: jest.Mock;
  let mockGenerateGuestToken: jest.Mock;

  let mockCacheSet: jest.Mock;
  let mockCacheGet: jest.Mock;
  let mockCacheDel: jest.Mock;

  let mockRedirect: jest.Mock;
  let mockCookie: jest.Mock;
  let mockJson: jest.Mock;
  let mockResponse: Response;

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
    mockValidateOAuthLogin = jest.fn();
    mockGenerateUserTokens = jest.fn();
    mockRefreshTokens = jest.fn();
    mockFindUserById = jest.fn();
    mockGetOrCreateGuest = jest.fn();
    mockGenerateGuestToken = jest.fn();

    mockCacheSet = jest.fn();
    mockCacheGet = jest.fn();
    mockCacheDel = jest.fn();

    mockRedirect = jest.fn();
    mockCookie = jest.fn();
    mockJson = jest.fn();
    mockResponse = {
      redirect: mockRedirect,
      cookie: mockCookie,
      json: mockJson,
    } as unknown as Response;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: {
            validateOAuthLogin: mockValidateOAuthLogin,
            generateUserTokens: mockGenerateUserTokens,
            refreshTokens: mockRefreshTokens,
            findUserById: mockFindUserById,
            getOrCreateGuest: mockGetOrCreateGuest,
            generateGuestToken: mockGenerateGuestToken,
          },
        },
        { provide: ConfigService, useValue: mockConfigService },
        {
          provide: CACHE_MANAGER,
          useValue: {
            set: mockCacheSet,
            get: mockCacheGet,
            del: mockCacheDel,
          },
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  afterEach(() => {
    jest.clearAllMocks();
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
      mockValidateOAuthLogin.mockResolvedValue(user);

      // when
      await controller.googleAuthCallback(req as unknown as RequestWithUser, mockResponse);

      // then
      expect(mockValidateOAuthLogin).toHaveBeenCalledWith(req.user);
      expect(mockCacheSet).toHaveBeenCalledWith("mock-uuid", user.id, 60000);
      expect(mockRedirect).toHaveBeenCalledWith("http://localhost:5173?code=mock-uuid");
    });

    it("should redirect to login page with error on failure", async () => {
      // given
      mockValidateOAuthLogin.mockRejectedValue(new Error("Auth failed"));

      // when
      await controller.googleAuthCallback(req as unknown as RequestWithUser, mockResponse);

      // then
      expect(mockRedirect).toHaveBeenCalledWith("http://localhost:5173/login?error=oauth_failed");
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
      mockCacheGet.mockResolvedValue(user.id);
      mockFindUserById.mockResolvedValue(user);
      mockGenerateUserTokens.mockReturnValue(tokens);

      // when
      await controller.exchangeToken(code, mockResponse);

      // then
      expect(mockCacheGet).toHaveBeenCalledWith(code);
      expect(mockCacheDel).toHaveBeenCalledWith(code);
      expect(mockFindUserById).toHaveBeenCalledWith(user.id);
      expect(mockCookie).toHaveBeenCalledWith("refreshToken", tokens.refreshToken, {
        httpOnly: true,
        secure: false, // In test env
        sameSite: "lax",
        path: "/",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
      expect(mockJson).toHaveBeenCalledWith({ accessToken: tokens.accessToken });
    });

    it("should throw UnauthorizedException if code is invalid", async () => {
      // given
      mockCacheGet.mockResolvedValue(null);

      // when & then
      await expect(controller.exchangeToken(code, mockResponse)).rejects.toThrow(
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
      mockRefreshTokens.mockResolvedValue(tokens);

      // when
      const result = await controller.refresh(refreshTokenDto);

      // then
      expect(result).toEqual(tokens);
      expect(mockRefreshTokens).toHaveBeenCalledWith(refreshTokenDto.refreshToken);
    });
  });

  describe("me", () => {
    it("should return guest info if user is guest", async () => {
      const req: Parameters<typeof controller.me>[0] = {
        user: { isGuest: true, ip: "127.0.0.1" },
      };

      mockGetOrCreateGuest.mockResolvedValue({
        remainingUses: 3,
        createdAt: Date.now(),
      });

      const result = await controller.me(req);

      expect(mockGetOrCreateGuest).toHaveBeenCalledWith("127.0.0.1");
      expect(result).toEqual({ isGuest: true, remainingUses: 3 });
    });

    it("should return user info if user is authenticated", async () => {
      const req: Parameters<typeof controller.me>[0] = {
        user: { isGuest: false, userId: "user-id", email: "test@example.com" },
      };

      const result = await controller.me(req);

      expect(result).toEqual({
        isGuest: false,
        userId: "user-id",
        email: "test@example.com",
      });
    });
  });
});
