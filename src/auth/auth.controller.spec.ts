import { UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, type TestingModule } from "@nestjs/testing";
import type { Response } from "express";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import type { RefreshTokenDto } from "./dto/refresh-token.dto";
import type { GoogleProfile, RequestWithUser, TokenPair } from "./types/auth.types";

describe("AuthController", () => {
  let controller: AuthController;

  const mockAuthService = {
    validateOAuthLogin: jest.fn(),
    generateTokens: jest.fn(),
    refreshTokens: jest.fn(),
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

  const mockResponse = {
    redirect: jest.fn(),
  } as unknown as Response;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: ConfigService, useValue: mockConfigService },
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

    const tokens: TokenPair = {
      accessToken: "access-token",
      refreshToken: "refresh-token",
    };

    const user = {
      id: "user-id",
      email: "test@example.com",
    };

    it("should redirect to frontend with tokens on success", async () => {
      // given
      mockAuthService.validateOAuthLogin.mockResolvedValue(user);
      mockAuthService.generateTokens.mockReturnValue(tokens);

      // when
      await controller.googleAuthCallback(req as unknown as RequestWithUser, mockResponse);

      // then
      expect(mockAuthService.validateOAuthLogin).toHaveBeenCalledWith(req.user);
      expect(mockAuthService.generateTokens).toHaveBeenCalledWith(user.id, user.email);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockResponse.redirect).toHaveBeenCalledWith(
        `http://localhost:5173?accessToken=${tokens.accessToken}&refreshToken=${tokens.refreshToken}`,
      );
    });

    it("should redirect to login page with error on failure", async () => {
      // given
      mockAuthService.validateOAuthLogin.mockRejectedValue(new Error("Auth failed"));

      // when
      await controller.googleAuthCallback(req as unknown as RequestWithUser, mockResponse);

      // then
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockResponse.redirect).toHaveBeenCalledWith(
        "http://localhost:5173/login?error=oauth_failed",
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

    it("should throw UnauthorizedException if service throws", async () => {
      // given
      mockAuthService.refreshTokens.mockRejectedValue(new UnauthorizedException());

      // when & then
      await expect(controller.refresh(refreshTokenDto)).rejects.toThrow(UnauthorizedException);
    });
  });
});
